import { useState } from 'react';
import { store, useGame } from '../../app/store';
import { OverlayHeader, Segmented, Switch } from '../components/common';
import { Icon } from '../components/Icon';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="spread" style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="grow">
        <div>{label}</div>
        {hint && <div className="xsmall faint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Slider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} style={{ maxWidth: 150 }} />;
}

export function SettingsScreen() {
  const { game, ui } = useGame();
  const s = game.settings;
  const set = store.updateSettings.bind(store);
  const [saveText, setSaveText] = useState('');
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="overlay">
      <OverlayHeader title="Settings" onBack={() => store.popOverlay()} />
      <div className="content stack-m">
        <div className="panel">
          <h3>Sound</h3>
          <Row label="Master volume">
            <Slider value={s.masterVolume} onChange={(v) => set({ masterVolume: v })} label="Master volume" />
          </Row>
          <Row label="Music">
            <Slider value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} label="Music volume" />
          </Row>
          <Row label="Effects">
            <Slider value={s.sfxVolume} onChange={(v) => set({ sfxVolume: v })} label="Effects volume" />
          </Row>
        </div>

        <div className="panel">
          <h3>Graphics</h3>
          <Row label="3D style" hint="Pixel renders the 3D battle and base at 256 px height for a crisp pixel-art look">
            <Segmented
              value={s.graphics === 'smooth' ? 'smooth' : 'pixel'}
              options={[
                { value: 'pixel', label: 'Pixel 256' },
                { value: 'smooth', label: 'Smooth' },
              ]}
              onChange={(v) => set({ graphics: v })}
            />
          </Row>
        </div>

        <div className="panel">
          <h3>Accessibility</h3>
          <Row label="Reduced motion" hint="No screen shake, fewer particles and animations">
            <Switch on={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} label="Reduced motion" />
          </Row>
          <Row label="Larger text">
            <Switch on={s.largeText} onChange={(v) => set({ largeText: v })} label="Larger text" />
          </Row>
          <Row label="Haptic feedback" hint="Vibration on supported devices">
            <Switch on={s.haptics} onChange={(v) => set({ haptics: v })} label="Haptics" />
          </Row>
          <p className="xsmall faint" style={{ margin: '6px 0 0' }}>
            Card rarity is always shown with a symbol and name (● Common, ◆ Rare, ★ Epic, ♛ Legendary, ✦ Mythic), not by colour alone.
          </p>
        </div>

        <div className="panel">
          <h3>Exercise & camera</h3>
          <Row label="Use camera for push-ups">
            <Switch on={s.useCamera} onChange={(v) => set({ useCamera: v })} label="Use camera" />
          </Row>
          <div className="col" style={{ padding: '8px 0' }}>
            <span className="small">Exercise type</span>
            <Segmented
              value={s.exerciseMode}
              onChange={(v) => set({ exerciseMode: v })}
              options={[
                { value: 'full', label: 'Full push-ups' },
                { value: 'knee', label: 'Knee push-ups' },
              ]}
            />
          </div>
          <div className="col" style={{ padding: '8px 0' }}>
            <span className="small">Phone placement</span>
            <Segmented
              value={s.cameraPlacement}
              onChange={(v) => set({ cameraPlacement: v })}
              options={[
                { value: 'side', label: 'Side view (best)' },
                { value: 'front', label: 'In front' },
              ]}
            />
          </div>
          <Row label="Show skeleton overlay">
            <Switch on={s.showSkeleton} onChange={(v) => set({ showSkeleton: v })} label="Show skeleton" />
          </Row>
          <Row label="Calibration" hint={s.calibration[s.exerciseMode] ? `Calibrated: ${Math.round(s.calibration[s.exerciseMode]!.topAngle)}° top, ${Math.round(s.calibration[s.exerciseMode]!.bottomAngle)}° bottom` : 'Using default thresholds'}>
            <button className="btn small" onClick={() => store.pushOverlay({ kind: 'cameraSetup', then: null })}>
              <Icon name="camera" size={14} /> Set up
            </button>
          </Row>
          {s.calibration[s.exerciseMode] && (
            <button className="btn ghost small" onClick={() => set({ calibration: { ...s.calibration, [s.exerciseMode]: undefined } })}>
              Reset calibration
            </button>
          )}
          <Row label="Auto-deploy cards in battle">
            <Switch on={s.autoDeploy} onChange={(v) => set({ autoDeploy: v })} label="Auto-deploy" />
          </Row>
        </div>

        <div className="panel">
          <h3>Privacy</h3>
          <p className="small dim">
            Push-up detection runs entirely on this device. Camera video is never uploaded, recorded or stored. Only the body-point positions of the current frame are used to count reps and then discarded. Calibration saves just two angles. Your save stays on this device.
          </p>
        </div>

        <div className="panel stack-m">
          <h3>Save data</h3>
          {!ui.persistent && <div className="notice small">Storage is unavailable in this browser mode - progress will be lost when you close the app. Export your save to keep it.</div>}
          {ui.saveWarnings.map((w) => (
            <div key={w} className="notice small">
              {w}
            </div>
          ))}
          <p className="xsmall faint" style={{ margin: 0 }}>
            Progress saves automatically with a backup copy. Cloud saves and accounts are planned.
          </p>
          <button className="btn small block" onClick={() => setSaveText(store.exportSave())}>
            Export save
          </button>
          {saveText && <textarea className="field" readOnly value={saveText} onFocus={(e) => e.target.select()} aria-label="Exported save" />}
          <textarea className="field" placeholder="Paste a save to import" value={importText} onChange={(e) => setImportText(e.target.value)} aria-label="Save to import" />
          <button className="btn small green block" disabled={!importText} onClick={() => setMsg(store.importSave(importText) ? 'Save imported!' : 'That save could not be read.')}>
            Import save
          </button>
          {msg && <div className="small dim">{msg}</div>}
          {!confirmReset ? (
            <button className="btn small red block" onClick={() => setConfirmReset(true)}>
              Start over
            </button>
          ) : (
            <div className="notice">
              <p className="small" style={{ marginTop: 0 }}>
                This deletes your save on this device. Export it first if you might want it back.
              </p>
              <div className="row">
                <button className="btn small ghost grow" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
                <button className="btn small red grow" onClick={() => store.resetGame()}>
                  Delete & restart
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <h3>Developer tools</h3>
          <Row label="Enable developer tools" hint="Adds a 'Sim rep' button in battle. Simulated reps power combat but never count as verified exercise, quests or achievements.">
            <Switch on={s.devTools} onChange={(v) => set({ devTools: v })} label="Developer tools" />
          </Row>
          {s.devTools && (
            <button className="btn small purple block" onClick={() => store.devGrant()}>
              Grant test resources (marks profile as assisted)
            </button>
          )}
        </div>
        <p className="xsmall faint center">Push Legends v0.1 · offline build</p>
      </div>
    </div>
  );
}
