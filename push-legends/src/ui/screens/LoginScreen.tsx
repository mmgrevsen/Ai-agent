import { useState, type FormEvent } from 'react';
import { authenticate, chooseSave, DEFAULT_SERVER, type SaveChoice } from '../../app/friends';
import { useGame } from '../../app/store';
import { sound } from '../../platform/audio';
import { drawWorldBackground } from '../art/scenery';
import { drawSprite } from '../art/units';
import { ArtCanvas, Segmented } from '../components/common';

const when = (t: number) => (t > 0 ? new Date(t).toLocaleString() : 'unknown');

/** Shown before anything else until the player is logged in to a Push Legends server. */
export function LoginScreen() {
  const { game } = useGame();
  const online = game.social.online;
  const [mode, setMode] = useState<'login' | 'signup'>(online.username ? 'login' : 'signup');
  const [server, setServer] = useState(online.server || DEFAULT_SERVER);
  const [editServer, setEditServer] = useState(false);
  const [username, setUsername] = useState(online.username);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<SaveChoice | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    sound.unlock();
    setError('');
    if (mode === 'signup' && password !== password2) return setError('The passwords do not match.');
    setBusy(true);
    const r = await authenticate(mode, server, username, password);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (r.choice) setChoice(r.choice);
  };

  return (
    <div className="intro login">
      <div className="intro-canvas">
        <ArtCanvas
          width={390}
          height={760}
          fill
          animate
          draw={(ctx, t, w, h) => {
            const ground = h * 0.3;
            const s = Math.min(w / 180, h / 350);
            drawWorldBackground(ctx, 0, w, h, ground, t, t * 10);
            drawSprite(ctx, { type: 'hero', cape: 'cape_crimson', aura: 'aura_ember' }, w * 0.3, ground + 14, { t, facing: 1, attack: t % 2.4 < 0.3 ? (t % 2.4) / 0.3 : 0, hit: 0, scale: s * 0.62, moving: false });
            drawSprite(ctx, { type: 'boss', id: 'grovemaw' }, w * 0.78, ground + 6, { t, facing: -1, attack: 0, hit: 0, scale: s * 0.4, moving: false });
          }}
        />
      </div>
      <div className="intro-body stack-m">
        <div className="logo">
          PUSH
          <br />
          LEGENDS
        </div>
        {choice ? (
          <div className="panel stack-m">
            <h3>Which progress do you want to keep?</h3>
            <p className="small dim" style={{ margin: 0 }}>
              Your account already has a saved game, and this device has a different one. The one you do not pick is kept as a backup on this device.
            </p>
            <button className="btn gold block" onClick={() => chooseSave(true, choice)}>
              Account save: {choice.cloud.name}, stage {choice.cloud.stage}, hero Lv {choice.cloud.heroLevel}
            </button>
            <div className="xsmall faint center">saved {when(choice.cloud.savedAt)}</div>
            <button className="btn block" onClick={() => chooseSave(false, choice)}>
              This device: {choice.local.name}, stage {choice.local.stage}, hero Lv {choice.local.heroLevel}
            </button>
            <div className="xsmall faint center">played {when(choice.local.savedAt)}</div>
          </div>
        ) : (
          <form className="panel stack-m" onSubmit={(e) => void submit(e)}>
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError('');
              }}
              options={[
                { value: 'login', label: 'Log in' },
                { value: 'signup', label: 'Create account' },
              ]}
            />
            <input className="field" autoComplete="username" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Username" required />
            <input className="field" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" required />
            {mode === 'signup' && <input className="field" type="password" autoComplete="new-password" placeholder="Repeat password" value={password2} onChange={(e) => setPassword2(e.target.value)} aria-label="Repeat password" required />}
            {error && (
              <div className="notice small" role="alert">
                {error}
              </div>
            )}
            <button className="btn gold big block" type="submit" disabled={busy}>
              {busy ? 'One moment...' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
            <div className="spread xsmall faint">
              {editServer ? (
                <input className="field grow" value={server} onChange={(e) => setServer(e.target.value)} aria-label="Server address" placeholder="Server address, e.g. 192.168.1.20:8787" />
              ) : (
                <span>Server: {server}</span>
              )}
              <button type="button" className="btn ghost small" onClick={() => setEditServer(!editServer)}>
                {editServer ? 'Done' : 'Change'}
              </button>
            </div>
            <p className="xsmall faint" style={{ margin: 0 }}>
              {mode === 'signup'
                ? 'Your account keeps your progress in the cloud and lets you add friends. The server stores your username, a scrambled version of your password, your hero name and your save. Never any camera data.'
                : 'You stay logged in on this device until you log out.'}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
