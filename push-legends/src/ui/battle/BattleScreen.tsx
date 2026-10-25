import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BUILD_STAMP } from '../../app/buildInfo';
import { store, useGame, type BattleContext } from '../../app/store';
import { BALANCE } from '../../core/config/balance';
import { Battle } from '../../core/combat/engine';
import type { BattleSetup } from '../../core/combat/types';
import { BATTLE_MODIFIERS } from '../../core/combat/types';
import { heroHasGoldSword } from '../art/heroLook';
import { FEEDBACK_TEXT } from '../../core/exercise/repCounter';
import { formatNumber } from '../../core/util';
import { sound } from '../../platform/audio';
import { haptic } from '../../platform/haptics';
import { Bar, CardArt, ModalShell } from '../components/common';
import { Icon } from '../components/Icon';
import type { BattleScene3D as BattleScene3DType } from '../battle3d/BattleScene3D';
import type { PlacementPreview, PlacementView } from './placement';
import { BattleRenderer } from './renderer';
import { drawSkeleton, useExerciseTracker } from './useExercise';
import '../styles/battle.css';

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A hand card being dragged towards the battlefield (positions are stage-relative CSS pixels). */
interface CardDrag {
  slot: number;
  pointerId: number;
  startX: number;
  startY: number;
  px: number;
  py: number;
  dragging: boolean;
  over: boolean;
}

/** Drop preview for the card being dragged, or null when it is not over the field. */
function placementFor(battle: Battle, d: CardDrag | null, view: PlacementView): PlacementPreview | null {
  if (!d || !d.dragging || !d.over || battle.isOver) return null;
  const spec = battle.handCard(d.slot);
  const raw = view.screenToLane(d.px, d.py);
  if (!spec || !raw) return null;
  const at = battle.clampDeploy(raw);
  const afford = battle.canAfford(d.slot);
  const room = battle.allies.length - 1 + spec.def.count <= BALANCE.combat.maxAlliesOnField;
  const missing = Math.ceil(spec.def.cost - battle.valor - 1e-9);
  return {
    ...at,
    ...battle.deployZone(),
    ok: afford && room,
    reason: !afford ? `Need ${missing} more valor` : !room ? 'Your army is full' : null,
    cardId: spec.def.id,
    count: spec.def.count,
    flying: spec.def.flying,
  };
}

export function BattleScreen({ setup, context }: { setup: BattleSetup; context: BattleContext }) {
  const { game } = useGame();
  const battle = useMemo(() => {
    const b = new Battle(setup);
    // Debug builds (?debug=1) expose the running battle for automated UI checks.
    if (new URLSearchParams(window.location.search).has('debug')) (window as unknown as { pushLegendsBattle: Battle }).pushLegendsBattle = b;
    return b;
  }, [setup]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene3dHostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const skeletonRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<CardDrag | null>(null);
  const viewRef = useRef<PlacementView | null>(null);
  const [dragSlot, setDragSlot] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [ending, setEnding] = useState(false);
  const [repFlash, setRepFlash] = useState(0);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  pausedRef.current = paused || ending;
  speedRef.current = speed;
  const settings = game.settings;
  const exerciseKind = setup.exerciseMode;
  const useCam = exerciseKind !== null && settings.useCamera;
  const firstBattle = !game.tutorial.firstBattle;

  const renderer = useMemo(
    () =>
      new BattleRenderer({
        onSound: (id) => sound.play(id),
        onShake: (s) => {
          if (s >= 8) haptic('medium');
        },
      }),
    [],
  );
  renderer.reducedMotion = settings.reducedMotion;

  const tracker = useExerciseTracker({
    enabled: useCam,
    kind: exerciseKind ?? 'full',
    placement: settings.cameraPlacement,
    calibration: exerciseKind ? settings.calibration[exerciseKind] : undefined,
    onRep: (rep) => {
      if (pausedRef.current) return;
      battle.registerRep(rep.kind, true);
      sound.play('rep');
      haptic('light');
      setRepFlash((n) => n + 1);
    },
  });

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = stage.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      renderer.resize(r.width, r.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    let last = performance.now();
    let raf = 0;
    let endTimer: number | null = null;
    const look = { cape: game.hero.cape, aura: game.hero.aura };
    // The 3D scene loads lazily (three.js); the 2D renderer draws until it is ready or if WebGL is missing.
    let scene3d: BattleScene3DType | null = null;
    let disposed = false;
    if (webglOk()) {
      import('../battle3d/BattleScene3D')
        .then(({ BattleScene3D }) => {
          if (disposed) return;
          const host = scene3dHostRef.current;
          if (!host) return;
          try {
            scene3d = new BattleScene3D(
              host,
              { onSound: (id) => sound.play(id), onShake: (s) => s >= 8 && haptic('medium') },
              { pixel: settings.graphics === 'pixel', reducedMotion: settings.reducedMotion, world: setup.world, cape: game.hero.cape, aura: game.hero.aura, goldSword: heroHasGoldSword(game) },
            );
            const r = stage.getBoundingClientRect();
            scene3d.resize(r.width, r.height);
          } catch {
            scene3d = null;
          }
        })
        .catch(() => {});
    }
    const resize3d = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      scene3d?.resize(r.width, r.height);
    });
    resize3d.observe(stage);
    const loop = (now: number) => {
      // Up to half a second of game time per frame, simulated in small steps, so a slow frame
      // never turns the battle into slow motion (and the engine always gets small time steps).
      const frameDt = Math.min(0.5, (now - last) / 1000);
      const realDt = Math.min(0.1, frameDt);
      last = now;
      let remaining = pausedRef.current ? 0 : frameDt * speedRef.current;
      while (remaining > 1e-6 && !battle.isOver) {
        const step = Math.min(0.1, remaining);
        battle.step(step);
        remaining -= step;
      }
      const events = battle.drainEvents();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const view = scene3d ?? renderer;
      viewRef.current = view;
      view.setPlacement(placementFor(battle, dragRef.current, view));
      if (scene3d) {
        scene3d.reducedMotion = renderer.reducedMotion;
        scene3d.ingest(battle, events);
        scene3d.render(battle, pausedRef.current ? 0 : realDt, ctx);
      } else {
        renderer.ingest(battle, events);
        renderer.draw(ctx, battle, pausedRef.current ? 0 : realDt, look);
      }
      if (battle.isOver && endTimer === null) {
        const outcome = battle.outcome!;
        view.showBanner(
          outcome === 'victory' ? 'VICTORY!' : outcome === 'complete' ? 'RUN COMPLETE' : outcome === 'retreat' ? 'REGROUPING' : outcome === 'timeout' ? "TIME'S UP" : 'REGROUPING',
          outcome === 'victory' ? 'The way forward is open' : 'All rewards earned are yours to keep',
          outcome === 'victory' || outcome === 'complete' ? '#ffc94a' : '#b9c7ff',
          2,
        );
        setEnding(true);
        endTimer = window.setTimeout(() => store.finishBattle(battle.result(), context), 1500);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const hud = window.setInterval(() => setTick((n) => n + 1), 100);
    const onVis = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener('visibilitychange', onVis);
    sound.setMusic(setup.waves.some((w) => w.isBossWave) ? 'boss' : 'battle');
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(hud);
      ro.disconnect();
      resize3d.disconnect();
      scene3d?.dispose();
      document.removeEventListener('visibilitychange', onVis);
      if (endTimer !== null) window.clearTimeout(endTimer);
      sound.setMusic('home');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle]);

  // Skeleton overlay on the camera preview
  useEffect(() => {
    if (!useCam || !settings.showSkeleton) return;
    let raf = 0;
    const draw = () => {
      const c = skeletonRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) drawSkeleton(ctx, tracker.landmarksRef.current, c.width, c.height, true);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [useCam, settings.showSkeleton, tracker.landmarksRef]);

  // The AUTO button only affects this battle; "Start battles with auto-deploy" lives in Settings.
  const setAuto = (on: boolean) => {
    battle.autoDeploy = on;
    setTick((n) => n + 1);
  };

  const takeControl = () => {
    // Playing a card yourself means you want to choose: auto-deploy stops spending valor for you.
    if (!battle.autoDeploy) return;
    setAuto(false);
    store.toast('You are in control: auto-deploy is off for this battle.', 'info');
  };

  const deploy = (slot: number, at?: { x: number; lane: number }) => {
    sound.unlock();
    takeControl();
    if (battle.deploy(slot, at)) {
      sound.play('deploy');
      haptic('light');
      if (firstBattle) store.completeTutorial('tipDeploy');
    } else sound.play('error');
    setTick((n) => n + 1);
  };

  // Drag a card onto the field to place it; a quick tap still sends the troops out of the gate.
  const moveGhost = (clientX: number, clientY: number, over: boolean) => {
    const g = ghostRef.current;
    if (!g) return;
    // Over the field the card shrinks and floats above the finger, so the drop marker stays visible
    g.style.transform = over ? `translate(${clientX}px, ${clientY}px) translate(-50%, -100%) translateY(-38px) scale(0.5)` : `translate(${clientX}px, ${clientY}px) translate(-50%, -100%) translateY(30px) scale(1.05)`;
    g.classList.toggle('over', over);
  };

  const onCardDown = (e: ReactPointerEvent<HTMLButtonElement>, slot: number) => {
    if (ending || e.button !== 0) return;
    sound.unlock();
    takeControl();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { slot, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, px: 0, py: 0, dragging: false, over: false };
  };

  const onCardMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    const stage = stageRef.current;
    if (!d || d.pointerId !== e.pointerId || !stage) return;
    if (!d.dragging) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 10) return;
      d.dragging = true;
      setDragSlot(d.slot);
    }
    const r = stage.getBoundingClientRect();
    d.px = e.clientX - r.left;
    d.py = e.clientY - r.top;
    d.over = d.px >= 0 && d.px <= r.width && d.py >= 0 && d.py <= r.height;
    moveGhost(e.clientX, e.clientY, d.over);
  };

  const onCardUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragSlot(null);
    if (!d.dragging) {
      deploy(d.slot);
      return;
    }
    // Released back over the hand: nothing happens, the card stays.
    if (!d.over) return;
    const at = viewRef.current?.screenToLane(d.px, d.py);
    if (at) deploy(d.slot, at);
  };

  const onCardCancel = () => {
    dragRef.current = null;
    setDragSlot(null);
  };

  useEffect(() => {
    if (ending) onCardCancel();
  }, [ending]);

  const special = () => {
    const wasCasting = battle.telegraphs.length > 0;
    if (battle.useSpecial()) {
      haptic('heavy');
      store.completeTutorial('tipSpecial');
      if (wasCasting) store.completeTutorial('tipInterrupt');
    } else sound.play('error');
  };

  const simulateRep = () => {
    if (!exerciseKind && !settings.devTools) return;
    battle.registerRep(exerciseKind ?? settings.exerciseMode, false);
    sound.play('rep');
    setRepFlash((n) => n + 1);
  };

  const boss = battle.activeBoss;
  const bossPhase = boss?.boss ? boss.boss.def.phases[boss.boss.phaseIndex] : null;
  const valor = battle.valor;
  const totalWaves = setup.endless ? null : setup.waves.length;
  const timeLeft = Math.max(0, setup.timeLimit - battle.time);
  const showTimer = setup.mode === 'blitz' || setup.mode === 'challenge' || timeLeft < 60;
  const casting = battle.telegraphs.length > 0;
  const warCryReps = BALANCE.exercise.warCryReps;
  const out = tracker.output;
  const repsDone = battle.repsDone;
  const repsNeeded = setup.repsRequired;
  const sealed = battle.awaitingReps;
  const perRep = Math.round(battle.pushupDamage * (exerciseKind === 'knee' ? BALANCE.exercise.kneeRepMultiplier : 1));

  let tip: string | null = null;
  if (firstBattle) {
    if (!game.tutorial.tipDeploy) tip = 'Drag a card onto the field to place troops where you want - or tap it to send them from the gate. Valor (red) refills over time.';
    else if (battle.special >= 1 && !game.tutorial.tipSpecial) tip = 'Your Legend Strike is charged - tap the golden button!';
    else if (battle.time < 25) tip = 'Your army fights on its own. With the camera on, every push-up is a sword strike! Buy better swords in the Armory to hit harder.';
  } else if (casting && battle.special >= 1 && !game.tutorial.tipInterrupt) tip = 'The boss is winding up! Legend Strike now to INTERRUPT it.';
  else if (useCam && !battle.autoDeploy && battle.time < 12) tip = 'Doing push-ups? Turn AUTO on and your army deploys cards by itself.';

  return (
    <div className="battle">
      <div className="battle-stage" ref={stageRef}>
        <div ref={scene3dHostRef} className="battle3d-host" aria-hidden="true" />
        <canvas ref={canvasRef} className="battle-canvas" />
        <div className="battle-top">
          <button className="hud-btn" onClick={() => setPaused(true)} aria-label="Pause">
            <Icon name="pause" />
          </button>
          <div className="hud-chip">
            <span className="display">{setup.label}</span>
            {totalWaves !== null ? (
              <span className="wave-pips" aria-label={`Wave ${Math.min(battle.waveIndex + 1, totalWaves)} of ${totalWaves}`}>
                {Array.from({ length: totalWaves }, (_, i) => (
                  <i key={i} className={i < battle.wavesCleared ? 'done' : i === battle.waveIndex ? 'now' : ''} />
                ))}
              </span>
            ) : (
              <span className="display gold-text">Wave {battle.waveIndex + 1}</span>
            )}
          </div>
          <div className="grow" />
          {showTimer && (
            <div className="hud-chip">
              <Icon name="clock" size={16} />
              <span className="display">{Math.ceil(timeLeft)}s</span>
            </div>
          )}
          <div className="hud-chip">
            <Icon name="gold" size={18} />
            <span className="display">{formatNumber(battle.goldEarned)}</span>
          </div>
        </div>
        {setup.modifiers.length > 0 && battle.time < 6 && (
          <div className="battle-modifiers">
            {setup.modifiers.map((m) => (
              <span key={m} className="chip gold">
                {BATTLE_MODIFIERS[m].name}: {BATTLE_MODIFIERS[m].text}
              </span>
            ))}
          </div>
        )}
        {boss && (
          <div className="boss-bar">
            <div className="spread">
              <span className="display">
                {boss.name} <span className="faint small">{boss.boss?.def.title}</span>
              </span>
              <span className="row" aria-label="Boss phase">
                {boss.boss!.def.phases.map((p, i) => (
                  <i key={p.name} className={`phase-pip ${i <= boss.boss!.phaseIndex ? 'on' : ''}`} />
                ))}
              </span>
            </div>
            <Bar value={boss.hp} max={boss.maxHp} tone="red" tall label={`${bossPhase?.name ?? ''} - ${Math.ceil((boss.hp / boss.maxHp) * 100)}%`} />
            {boss.shield > 0 && <Bar value={boss.shield} max={boss.maxHp * 0.15} tone="blue" />}
          </div>
        )}
        {tip && !sealed && <div className="battle-tip pop-in">{tip}</div>}
        {sealed && (
          <div className="seal-panel pop-in" role="status">
            <div className="seal-title">Victory sealed</div>
            <p className="small" style={{ margin: 0 }}>
              Every wave is beaten. Do <b>{repsNeeded - repsDone}</b> more push-up{repsNeeded - repsDone === 1 ? '' : 's'} to claim the stage.
            </p>
            <Bar value={repsDone} max={repsNeeded} tone="red" tall label={`${repsDone} / ${repsNeeded} push-ups`} />
            {!useCam && !settings.devTools && (
              <>
                <p className="xsmall dim" style={{ margin: 0 }}>The camera is off, so push-ups cannot be counted here. Retreat (you keep everything you earned), turn the camera on and play the stage again.</p>
                <button className="btn ghost small block" onClick={() => battle.retreat()}>
                  Retreat and keep rewards
                </button>
              </>
            )}
          </div>
        )}
        {battle.warCryActive && <div className="warcry-tag display">WAR CRY</div>}
      </div>

      <div className="battle-controls">
        <div className="exercise-strip">
          {useCam ? (
            <div className={`cam-thumb q-${out?.measurement.quality ?? 'lost'}`}>
              <video ref={tracker.videoRef} playsInline muted className="cam-video" />
              <canvas ref={skeletonRef} width={120} height={90} className="cam-skeleton" />
              <span className="cam-dot" aria-label={`Tracking ${out?.measurement.quality ?? 'starting'}`} />
            </div>
          ) : (
            <div className="cam-thumb off">
              <Icon name="camera" size={22} />
              <span className="xsmall">{exerciseKind ? 'Camera off' : 'No exercise'}</span>
            </div>
          )}
          <div className="grow col" style={{ gap: 4 }}>
            <div className="spread">
              <span className="display" key={repFlash}>
                <span className={repFlash ? 'rep-pop' : ''}>{repsDone}</span>
                {repsNeeded > 0 && <span className={repsDone >= repsNeeded ? 'small good-text' : 'small dim'}>/{repsNeeded}</span>}{' '}
                <span className="small dim">push-ups {exerciseKind === 'knee' ? '(knee)' : ''}</span>
              </span>
              <span className="small gold-text" title="Damage per push-up (better swords hit harder)">
                <Icon name="swords" size={14} /> {formatNumber(perRep)}/rep
                {battle.bankedStrikes > 0 && <span className="dim"> · {Math.ceil(battle.bankedStrikes)} saved</span>}
              </span>
            </div>
            <Bar value={battle.warCryProgress} max={warCryReps} tone="purple" label={`War Cry ${Math.floor(battle.warCryProgress)}/${warCryReps}`} />
            <div className="xsmall dim feedback-line">
              {useCam
                ? tracker.status === 'running'
                  ? out
                    ? FEEDBACK_TEXT[out.feedback]
                    : 'Starting tracking...'
                  : tracker.status === 'loading'
                    ? 'Loading pose model...'
                    : tracker.status === 'requesting'
                      ? 'Waiting for camera permission...'
                      : tracker.error || 'Camera unavailable - playing without it.'
                : exerciseKind
                  ? 'Turn on the camera in Settings to power up with push-ups.'
                  : battle.autoDeploy
                    ? 'Auto-deploy is playing your cards. Tap AUTO to take over.'
                    : 'Drag cards onto the field to place troops.'}
            </div>
          </div>
          {settings.devTools && (
            <button className="btn purple small" onClick={simulateRep} title="Developer: simulated rep (not counted as verified exercise)">
              Sim rep
            </button>
          )}
        </div>

        <div className="valor-row">
          <span className="valor-gem">{Math.floor(valor)}</span>
          <div className="valor-bar" aria-label={`Valor ${Math.floor(valor)} of ${BALANCE.combat.maxValor}`}>
            {Array.from({ length: BALANCE.combat.maxValor }, (_, i) => (
              <i key={i} style={{ ['--fill' as string]: `${Math.max(0, Math.min(1, valor - i)) * 100}%` }} />
            ))}
          </div>
        </div>

        <div className="hand-row">
          <div className="hand">
            {battle.hand.map((idx, slot) => {
              const spec = setup.deck[idx]!;
              const affordable = valor >= spec.def.cost;
              return (
                <button
                  key={`${slot}-${idx}`}
                  className={`hand-card rarity-${spec.def.rarity} ${affordable ? 'ready' : ''} ${dragSlot === slot ? 'dragging' : ''}`}
                  onPointerDown={(e) => onCardDown(e, slot)}
                  onPointerMove={onCardMove}
                  onPointerUp={onCardUp}
                  onPointerCancel={onCardCancel}
                  onLostPointerCapture={(e) => dragRef.current?.pointerId === e.pointerId && onCardCancel()}
                  // Pointer taps deploy on pointer-up; keyboard activation (detail 0) deploys here
                  onClick={(e) => e.detail === 0 && deploy(slot)}
                  onContextMenu={(e) => e.preventDefault()}
                  disabled={ending}
                  aria-label={`Deploy ${spec.def.name}, costs ${spec.def.cost} valor. Drag onto the field to choose where.`}
                >
                  <CardArt cardId={spec.def.id} width={64} />
                  <span className="hand-cost">
                    <span>{spec.def.cost}</span>
                  </span>
                  {!affordable && <span className="hand-wait" style={{ height: `${(1 - valor / spec.def.cost) * 100}%` }} />}
                  <span className="hand-lv">Lv{spec.level}</span>
                </button>
              );
            })}
            {battle.nextCard() && (
              <div className="next-card" aria-label={`Next card: ${battle.nextCard()!.def.name}`}>
                <span className="xsmall faint">Next</span>
                <CardArt cardId={battle.nextCard()!.def.id} width={34} />
              </div>
            )}
          </div>
          <div className="action-col">
            <button className={`special-btn ${battle.special >= 1 ? 'ready' : ''} ${casting && battle.special >= 1 ? 'interrupt' : ''}`} onClick={special} disabled={ending} style={{ ['--charge' as string]: `${battle.special * 360}deg` }} aria-label={`Legend Strike ${Math.floor(battle.special * 100)}% charged`}>
              <span className="special-core">
                <Icon name="bolt" size={26} />
                <span className="special-label">{casting && battle.special >= 1 ? 'INTERRUPT' : battle.special >= 1 ? 'STRIKE' : `${Math.floor(battle.special * 100)}%`}</span>
              </span>
            </button>
            <div className="row" style={{ gap: 4 }}>
              <button className={`mini-toggle auto ${battle.autoDeploy ? 'on' : ''}`} onClick={() => setAuto(!battle.autoDeploy)} aria-pressed={battle.autoDeploy} aria-label={`Auto-deploy ${battle.autoDeploy ? 'on' : 'off'}`}>
                AUTO <b>{battle.autoDeploy ? 'ON' : 'OFF'}</b>
              </button>
              <button className="mini-toggle" onClick={() => setSpeed(speed === 1 ? 2 : 1)} aria-label="Battle speed">
                {speed}x
              </button>
            </div>
          </div>
        </div>
      </div>

      <div ref={ghostRef} className="drag-ghost" aria-hidden="true">
        {dragSlot !== null && battle.hand[dragSlot] !== undefined && <CardArt cardId={setup.deck[battle.hand[dragSlot]!]!.def.id} width={64} />}
      </div>

      {paused && !ending && (
        <ModalShell label="Paused" onClose={() => setPaused(false)}>
          <div className="stack-m center">
            <h2>Paused</h2>
            <p className="dim small">Retreating ends this battle early. You keep all {formatNumber(battle.goldEarned)} gold and everything else you earned.</p>
            <button className="btn gold big block" onClick={() => setPaused(false)}>
              <Icon name="play" size={20} /> Resume
            </button>
            <button
              className="btn ghost block"
              onClick={() => {
                setPaused(false);
                battle.retreat();
              }}
            >
              Retreat (keep rewards)
            </button>
            <p className="xsmall faint">Build {BUILD_STAMP}</p>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
