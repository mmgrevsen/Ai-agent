import { useEffect, useRef, useState } from 'react';
import { store, useGame, type BattleContext } from '../../app/store';
import { Calibrator } from '../../core/exercise/calibration';
import { EXERCISES, exerciseInfo } from '../../core/exercise/catalog';
import { feedbackText } from '../../core/exercise/repCounter';
import { cameraSupported } from '../../platform/pose';
import { drawSkeleton, useExerciseTracker } from '../battle/useExercise';
import { Bar, OverlayHeader, Segmented, Switch } from '../components/common';
import { Icon } from '../components/Icon';
import { sound } from '../../platform/audio';

type Step = 'intro' | 'placement' | 'preview' | 'calibrate' | 'done';

/** Camera permission explanation, placement guidance, live tracking check and optional calibration. */
export function CameraSetupScreen({ then }: { then: BattleContext | null }) {
  const { game } = useGame();
  const s = game.settings;
  const [step, setStep] = useState<Step>(s.cameraPrivacyAccepted ? 'placement' : 'intro');
  const calibratorRef = useRef<Calibrator | null>(null);
  const [cal, setCal] = useState<{ phase: string; progress: number; message: string } | null>(null);
  const skeletonRef = useRef<HTMLCanvasElement>(null);
  const live = step === 'preview' || step === 'calibrate';

  const tracker = useExerciseTracker({
    enabled: live,
    kind: s.exerciseMode,
    placement: s.cameraPlacement,
    facing: s.cameraFacing,
    voice: s.voiceCoach,
    calibration: s.calibration[s.exerciseMode],
    onRep: () => sound.play('rep'),
    onFrame: (frame) => {
      const c = calibratorRef.current;
      if (!c) return;
      const before = c.phase;
      c.process(frame);
      setCal({ phase: c.phase, progress: c.progress, message: c.message });
      if (before !== c.phase) sound.play(c.phase === 'failed' ? 'error' : 'upgrade');
      if (c.phase === 'done') {
        const r = c.getResult()!;
        store.updateSettings({ calibration: { ...store.state.settings.calibration, [s.exerciseMode]: { topAngle: r.topAngle, bottomAngle: r.bottomAngle, calibratedAt: Date.now() } } });
        calibratorRef.current = null;
        setStep('done');
      }
    },
  });

  useEffect(() => {
    if (!live || !s.showSkeleton) return;
    let raf = 0;
    const loop = () => {
      const c = skeletonRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) drawSkeleton(ctx, tracker.landmarksRef.current, c.width, c.height, s.cameraFacing === 'user');
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, s.showSkeleton, tracker.landmarksRef]);

  const finish = () => {
    store.popOverlay();
    if (then) store.startBattle(then, undefined, { skipCameraPrompt: true });
  };
  const skip = () => {
    store.updateSettings({ useCamera: false });
    store.popOverlay();
    if (then) store.startBattle(then, undefined, { skipCameraPrompt: true });
  };

  const out = tracker.output;
  const q = out?.measurement.quality ?? 'lost';
  const confidence = out?.measurement.confidence ?? 0;

  return (
    <div className="overlay">
      <OverlayHeader title="Exercise camera" onBack={() => store.popOverlay()} />
      <div className="content stack-m">
        {step === 'intro' && (
          <>
            <div className="panel stack-m">
              <div className="row">
                <Icon name="camera" size={40} />
                <h2>Why the camera?</h2>
              </div>
              {then?.type === 'campaign' && (
                <div className="notice small">
                  <b>Stages are won with reps.</b> Beat the waves, then do the stage's reps - push-ups, sit-ups or pull-ups - to claim it. The camera counts them.
                </div>
              )}
              <p className="small">Push Legends counts real push-ups, sit-ups and pull-ups by watching your body position with your phone camera. Every good rep makes your hero swing their sword at the nearest enemy - buy better swords with gold to hit harder. Reps also add valor and build War Cries.</p>
              <div className="notice info small">
                <b>Your privacy:</b> everything runs on this device. Video is never uploaded, recorded or saved. Only body-point positions of the current frame are used, then thrown away.
              </div>
              <p className="xsmall faint">Camera vision is not perfect. If tracking is unsure the game will ask you to reposition - it never accuses you of cheating, and a missed rep never costs you anything.</p>
            </div>
            {!cameraSupported() && <div className="notice small">This device or browser doesn't provide camera access. Without it you can still build your base, collect idle rewards, upgrade and play the other modes, but campaign stages can only be claimed with counted push-ups.</div>}
            <button
              className="btn gold big block"
              disabled={!cameraSupported()}
              onClick={() => {
                store.updateSettings({ cameraPrivacyAccepted: true, useCamera: true });
                setStep('placement');
              }}
            >
              Continue
            </button>
            <button className="btn ghost block" onClick={skip}>
              {then?.type === 'campaign' ? 'Fight without the camera (stage cannot be claimed)' : 'Play without the camera'}
            </button>
          </>
        )}

        {step === 'placement' && (
          <>
            <div className="panel stack-m">
              <h2>Set up your phone</h2>
              <ol className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
                {exerciseInfo(s.exerciseMode).setup.map((line) => (
                  <li key={line}>{line}</li>
                ))}
                <li>Use good lighting and keep the background simple.</li>
                <li>Only train on a safe surface (and a sturdy bar). Stop if anything hurts.</li>
              </ol>
              <span className="small dim">Exercise type</span>
              <div className="exercise-pick">
                {EXERCISES.map((e) => (
                  <button key={e.id} className={`exercise-opt ${s.exerciseMode === e.id ? 'on' : ''}`} onClick={() => store.updateSettings({ exerciseMode: e.id })} aria-pressed={s.exerciseMode === e.id}>
                    <b>{e.name}</b>
                    <span className="xsmall">×{e.power} damage</span>
                  </button>
                ))}
              </div>
              <span className="small dim">Phone placement</span>
              <Segmented
                value={s.cameraPlacement}
                onChange={(v) => store.updateSettings({ cameraPlacement: v })}
options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'side', label: 'Side view' },
                  { value: 'front', label: 'In front' },
                ]}
              />
              <span className="small dim">Camera</span>
              <Segmented
                value={s.cameraFacing}
                onChange={(v) => store.updateSettings({ cameraFacing: v })}
                options={[
                  { value: 'user', label: 'Front (selfie)' },
                  { value: 'environment', label: 'Back camera' },
                ]}
              />
              <label className="spread small" style={{ alignItems: 'center' }}>
                <span>Voice coach (counts your reps out loud)</span>
                <Switch on={s.voiceCoach} onChange={(v) => store.updateSettings({ voiceCoach: v })} label="Voice coach" />
              </label>
            </div>
            <button className="btn gold big block" onClick={() => setStep('preview')}>
              Start camera
            </button>
          </>
        )}

        {live && (
          <>
            <div className="cam-preview">
              <video ref={tracker.videoRef} playsInline muted className={s.cameraFacing === 'user' ? 'mirror' : ''} />
              <canvas ref={skeletonRef} width={480} height={360} />
              {step === 'preview' && <span className="big-count">{tracker.count}</span>}
              <div className="cam-hud">
                {tracker.status === 'running' ? (
                  <>
                    <div className="spread">
                      <span className={q === 'good' ? 'good-text' : q === 'fair' ? 'gold-text' : 'warn-text'}>Tracking: {q === 'lost' ? 'searching' : q}</span>
                      <span className="xsmall faint">{tracker.fps} fps</span>
                    </div>
                    <Bar value={confidence} max={1} tone={q === 'good' ? 'green' : q === 'fair' ? '' : 'red'} />
                    <div style={{ marginTop: 4 }}>{step === 'calibrate' && cal ? cal.message : out ? feedbackText(s.exerciseMode, out.feedback) : ''}</div>
                  </>
                ) : (
                  <div>
                    {tracker.status === 'requesting'
                      ? 'Please allow camera access...'
                      : tracker.status === 'loading'
                        ? 'Loading the pose model (first time may take a moment)...'
                        : tracker.status === 'denied'
                          ? 'Camera permission was denied. Enable it in your device settings, or play without the camera.'
                          : tracker.error || 'Starting camera...'}
                  </div>
                )}
              </div>
            </div>
            {step === 'preview' && (
              <>
                <p className="small dim" style={{ margin: 0 }}>
                  Try a few {exerciseInfo(s.exerciseMode).plural} - the counter shows each rep that would count. Use the full range of motion.
                </p>
                <button
                  className="btn purple block"
                  disabled={tracker.status !== 'running'}
                  onClick={() => {
                    calibratorRef.current = new Calibrator(s.exerciseMode, s.cameraPlacement);
                    setCal({ phase: 'top', progress: 0, message: calibratorRef.current.message });
                    setStep('calibrate');
                  }}
                >
                  Calibrate to my body (optional)
                </button>
                <button className="btn gold big block" onClick={finish}>
                  {then ? 'Looks good - fight!' : 'Done'}
                </button>
                {(tracker.status === 'denied' || tracker.status === 'unavailable' || tracker.status === 'error') && (
                  <button className="btn ghost block" onClick={skip}>
                    Play without the camera
                  </button>
                )}
              </>
            )}
            {step === 'calibrate' && cal && (
              <div className="panel stack-m">
                <h3>Calibration: {cal.phase === 'top' ? '1/2 Top position' : cal.phase === 'bottom' ? '2/2 Bottom position' : cal.phase === 'failed' ? 'Try again' : 'Done'}</h3>
                <Bar value={cal.progress} max={1} tone="green" />
                <p className="small dim" style={{ margin: 0 }}>
                  {cal.message}
                </p>
                {cal.phase === 'failed' && (
                  <button
                    className="btn block"
                    onClick={() => {
                      calibratorRef.current = new Calibrator(s.exerciseMode, s.cameraPlacement);
                      setCal({ phase: 'top', progress: 0, message: calibratorRef.current.message });
                    }}
                  >
                    Retry calibration
                  </button>
                )}
                <button className="btn ghost block" onClick={() => setStep('preview')}>
                  Cancel
                </button>
              </div>
            )}
          </>
        )}

        {step === 'done' && (
          <div className="panel stack-m center">
            <Icon name="check" size={48} />
            <h2>Calibrated!</h2>
            <p className="small dim">Rep counting now uses your personal range of motion. You can recalibrate any time in Settings.</p>
            <button className="btn gold big block" onClick={finish}>
              {then ? 'Fight!' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
