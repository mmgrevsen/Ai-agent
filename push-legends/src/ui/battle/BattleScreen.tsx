import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useGame, type BattleContext } from '../../app/store';
import { BALANCE } from '../../core/config/balance';
import { Battle } from '../../core/combat/engine';
import type { BattleSetup } from '../../core/combat/types';
import { BATTLE_MODIFIERS } from '../../core/combat/types';
import { FEEDBACK_TEXT } from '../../core/exercise/repCounter';
import { formatNumber } from '../../core/util';
import { sound } from '../../platform/audio';
import { haptic } from '../../platform/haptics';
import { Bar, CardArt, ModalShell } from '../components/common';
import { Icon } from '../components/Icon';
import { BattleRenderer } from './renderer';
import { drawSkeleton, useExerciseTracker } from './useExercise';
import '../styles/battle.css';

export function BattleScreen({ setup, context }: { setup: BattleSetup; context: BattleContext }) {
  const { game } = useGame();
  const battle = useMemo(() => new Battle(setup), [setup]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const skeletonRef = useRef<HTMLCanvasElement>(null);
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
    const loop = (now: number) => {
      const realDt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const dt = pausedRef.current ? 0 : realDt * speedRef.current;
      if (dt > 0) battle.step(dt);
      renderer.ingest(battle, battle.drainEvents());
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer.draw(ctx, battle, pausedRef.current ? 0 : realDt, look);
      if (battle.isOver && endTimer === null) {
        const outcome = battle.outcome!;
        renderer.showBanner(
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
      cancelAnimationFrame(raf);
      window.clearInterval(hud);
      ro.disconnect();
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

  const deploy = (slot: number) => {
    sound.unlock();
    if (battle.deploy(slot)) {
      sound.play('deploy');
      haptic('light');
      if (firstBattle) store.completeTutorial('tipDeploy');
    } else sound.play('error');
    setTick((n) => n + 1);
  };

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
  const repsDone = battle.reps.full + battle.reps.knee + battle.reps.simulated;
  const perRep = Math.round(battle.pushupDamage * (exerciseKind === 'knee' ? BALANCE.exercise.kneeRepMultiplier : 1));

  let tip: string | null = null;
  if (firstBattle) {
    if (!game.tutorial.tipDeploy) tip = 'Tap a card to send troops into battle! Valor (pink) refills over time.';
    else if (battle.special >= 1 && !game.tutorial.tipSpecial) tip = 'Your Legend Strike is charged - tap the golden button!';
    else if (battle.time < 25) tip = 'Your army fights on its own. With the camera on, every push-up is a sword strike! Buy better swords in the Armory to hit harder.';
  } else if (casting && battle.special >= 1 && !game.tutorial.tipInterrupt) tip = 'The boss is winding up! Legend Strike now to INTERRUPT it.';

  return (
    <div className="battle">
      <div className="battle-stage" ref={stageRef}>
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
        {tip && <div className="battle-tip pop-in">{tip}</div>}
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
                <span className={repFlash ? 'rep-pop' : ''}>{repsDone}</span> <span className="small dim">reps {exerciseKind === 'knee' ? '(knee)' : ''}</span>
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
                  : 'Idle battle: your army fights automatically.'}
            </div>
          </div>
          {settings.devTools && (
            <button className="btn purple small" onClick={simulateRep} title="Developer: simulated rep (not counted as verified exercise)">
              Sim rep
            </button>
          )}
        </div>

        <div className="valor-row">
          <span className="valor-gem display">{Math.floor(valor)}</span>
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
                <button key={`${slot}-${idx}`} className={`hand-card rarity-${spec.def.rarity} ${affordable ? 'ready' : ''}`} onClick={() => deploy(slot)} disabled={ending} aria-label={`Deploy ${spec.def.name}, costs ${spec.def.cost} valor`}>
                  <CardArt cardId={spec.def.id} width={64} />
                  <span className="hand-cost">{spec.def.cost}</span>
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
              <button className={`mini-toggle ${battle.autoDeploy ? 'on' : ''}`} onClick={() => (battle.autoDeploy = !battle.autoDeploy)} aria-pressed={battle.autoDeploy} aria-label="Auto-deploy">
                AUTO
              </button>
              <button className="mini-toggle" onClick={() => setSpeed(speed === 1 ? 2 : 1)} aria-label="Battle speed">
                {speed}x
              </button>
            </div>
          </div>
        </div>
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
          </div>
        </ModalShell>
      )}
    </div>
  );
}
