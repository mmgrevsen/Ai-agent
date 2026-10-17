import { useEffect, useState } from 'react';
import { blockOnline, cancelRequest, deleteServerAccount, leaveOffline, logout, respond, sendRequest, startPolling, unblockOnline, unfriend, useFriends } from '../../app/friends';
import { store, useGame } from '../../app/store';
import { CARD_BY_ID, getCard } from '../../core/content/cards';
import { decodeChallenge } from '../../core/social/codes';
import { powerRating } from '../../core/systems/hero';
import { formatNumber } from '../../core/util';
import { CardArt, OverlayHeader, Segmented } from '../components/common';
import { Icon } from '../components/Icon';

const PLANNED = <span className="chip planned">Planned · needs online backend</span>;

export function SocialScreen() {
  const [tab, setTab] = useState<'profile' | 'friends' | 'challenges' | 'boards'>('friends');
  const { game } = useGame();
  const connected = !!game.social.online.token;
  // Keep online friends fresh while this screen is open
  useEffect(() => (connected ? startPolling() : undefined), [connected]);
  return (
    <div className="overlay">
      <OverlayHeader title="Friends & Profile" onBack={() => store.popOverlay()} />
      <div className="content stack-m">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'profile', label: 'Profile' },
            { value: 'friends', label: 'Friends' },
            { value: 'challenges', label: 'Duels' },
            { value: 'boards', label: 'Ranks' },
          ]}
        />
        {tab === 'profile' && <ProfileTab />}
        {tab === 'friends' && <FriendsTab />}
        {tab === 'challenges' && <ChallengesTab />}
        {tab === 'boards' && <BoardsTab />}
      </div>
    </div>
  );
}

function ProfileTab() {
  const { game } = useGame();
  const [name, setName] = useState(game.profile.name);
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack-m">
      <div className="panel gold">
        <div className="xsmall faint">Your friend code</div>
        <div className="spread">
          <span className="display" style={{ fontSize: 24, letterSpacing: 2 }}>
            {game.profile.friendCode}
          </span>
          <button className="btn small" onClick={() => void navigator.clipboard?.writeText(game.profile.friendCode).then(() => setCopied(true))}>
            <Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="xsmall dim" style={{ margin: '6px 0 0' }}>
          Share it so friends can add you. With a friend server connected (Friends tab) they send you a friend request; without one they can save you as a contact on their device.
        </p>
      </div>
      <div className="panel stack-m">
        <label className="col">
          <span className="small dim">Hero name</span>
          <div className="row">
            <input className="field grow" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn small green" onClick={() => store.setProfile({ name })}>
              Save
            </button>
          </div>
        </label>
        <label className="col">
          <span className="small dim">What friends on the friend server can see</span>
          <select className="field" value={game.profile.privacy} onChange={(e) => store.setProfile({ privacy: e.target.value as 'public' | 'friends' | 'private' })}>
            <option value="public">Everything (progress, deck, last seen)</option>
            <option value="friends">Friends see my progress</option>
            <option value="private">Name and online status only</option>
          </select>
        </label>
      </div>
      <div className="panel">
        <h3 style={{ marginBottom: 6 }}>Showcase</h3>
        <div className="stat-row">
          <span>Hero level</span>
          <b>{game.hero.level}</b>
        </div>
        <div className="stat-row">
          <span>Army power</span>
          <b>{formatNumber(powerRating(game))}</b>
        </div>
        <div className="stat-row">
          <span>Stages cleared</span>
          <b>{game.progress.highestCleared + 1} / 50</b>
        </div>
        <div className="stat-row">
          <span>Bosses defeated</span>
          <b>{game.stats.bossesDefeated}</b>
        </div>
        <div className="stat-row">
          <span>Verified full push-ups</span>
          <b>{formatNumber(game.stats.verifiedFullReps)}</b>
        </div>
        <div className="stat-row">
          <span>Verified knee push-ups</span>
          <b>{formatNumber(game.stats.verifiedKneeReps)}</b>
        </div>
        <div className="stat-row">
          <span>Exercise days</span>
          <b>{game.stats.exerciseDays.length}</b>
        </div>
        <div className="row wrap" style={{ marginTop: 8 }}>
          {game.deck.map((id) => (
            <div key={id} className={`card-detail-art thumb rarity-${getCard(id).rarity}`}>
              <CardArt cardId={id} width={34} />
            </div>
          ))}
        </div>
        {game.profile.devAssisted && <div className="notice small" style={{ marginTop: 8 }}>Developer tools were used on this profile; shared challenge scores are marked as assisted.</div>}
      </div>
    </div>
  );
}

function FriendsTab() {
  const { game } = useGame();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const messages = { added: 'Contact saved!', invalid: 'That is not a valid friend code (PL-XXXX-XXXX).', self: "That's your own code.", duplicate: 'Already in your contacts.', blocked: 'You blocked this code. Unblock it first.', full: 'Contact list is full.' };
  return (
    <div className="stack-m">
      <OnlineFriends />
      <div className="section-title">
        <h3>Contacts on this device</h3>
      </div>
      <div className="panel stack-m">
        <p className="xsmall dim" style={{ margin: 0 }}>
          Works without a server: save a friend's code and name here, and duel each other by sharing challenge codes.
        </p>
        <input className="field" placeholder="Friend code (PL-XXXX-XXXX)" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Friend code" />
        <input className="field" placeholder="Nickname" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nickname" />
        <button
          className="btn green block"
          onClick={() => {
            const r = store.addFriend(code, name || 'Friend');
            setMsg(messages[r]);
            if (r === 'added') {
              setCode('');
              setName('');
            }
          }}
        >
          Save contact
        </button>
        {msg && <div className="small dim">{msg}</div>}
      </div>
      <div className="section-title">
        <h3>Contacts ({game.social.friends.length})</h3>
      </div>
      {game.social.friends.length === 0 && <div className="empty">No contacts yet. Swap friend codes and duel each other with challenge codes!</div>}
      {game.social.friends.map((f) => (
        <div key={f.code} className="list-item">
          <Icon name="hero" size={28} />
          <div className="grow">
            <div className="display">{f.name}</div>
            <div className="xsmall faint">{f.code}</div>
          </div>
          <button className="btn ghost small" onClick={() => store.removeFriend(f.code)}>
            Remove
          </button>
          <button className="btn red small" onClick={() => store.block(f.code)}>
            Block
          </button>
        </div>
      ))}
      {game.social.blocked.length > 0 && (
        <div className="panel dark">
          <h3>Blocked</h3>
          {game.social.blocked.map((b) => (
            <div key={b} className="spread small" style={{ marginTop: 6 }}>
              <span>{b}</span>
              <button className="btn ghost small" onClick={() => store.unblock(b)}>
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="panel dark">
        <div className="spread">
          <h3>Guilds & co-op world bosses</h3>
          {PLANNED}
        </div>
        <p className="xsmall faint" style={{ margin: '6px 0 0' }}>
          Your Guild Hall already boosts quest rewards. Guild membership, guild achievements, co-op bosses and seasonal events are designed in BACKEND_PLAN.md.
        </p>
      </div>
    </div>
  );
}

function ChallengesTab() {
  const { game } = useGame();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const blocked = new Set(game.social.blocked);
  return (
    <div className="stack-m">
      <div className="panel stack-m">
        <h3>Start a duel</h3>
        <p className="small dim" style={{ margin: 0 }}>
          Play a 90-second Friend Challenge on a fresh seed, then share the code. Card levels are normalized, so it is skill and strategy that count. Nobody risks any resources.
        </p>
        <button className="btn gold block" onClick={() => store.newChallenge()}>
          <Icon name="swords" size={18} /> New challenge
        </button>
      </div>
      <div className="panel stack-m">
        <h3>Accept a challenge</h3>
        <input className="field" placeholder="PLC1-..." value={code} onChange={(e) => setCode(e.target.value)} aria-label="Challenge code" />
        <button
          className="btn green block"
          onClick={() => {
            const p = decodeChallenge(code);
            if (!p) return setMsg('That challenge code is not valid.');
            const ok = store.importChallenge(code);
            setMsg(ok ? `Challenge from ${p.name} saved.` : 'You already have this challenge.');
            setCode('');
          }}
        >
          Save challenge
        </button>
        {msg && <div className="small dim">{msg}</div>}
      </div>
      {game.social.challenges.map((c) => {
        const p = decodeChallenge(c.code);
        if (!p) return null;
        return (
          <div key={c.code} className="list-item" style={{ opacity: blocked.has(c.code) ? 0.4 : 1 }}>
            <Icon name="trophy" size={28} />
            <div className="grow">
              <div className="display">
                {c.fromName} · {c.theirScore}
              </div>
              <div className="xsmall dim">
                Your best: {c.myBest ?? '-'} {p.assisted && <span className="chip planned">assisted run</span>}
              </div>
            </div>
            <button className="btn gold small" onClick={() => store.playChallenge(c.code)}>
              Play
            </button>
          </div>
        );
      })}
    </div>
  );
}

function BoardsTab() {
  const { game } = useGame();
  return (
    <div className="stack-m">
      <div className="panel">
        <h3 style={{ marginBottom: 6 }}>Personal bests</h3>
        <div className="stat-row">
          <span>Highest stage</span>
          <b>{game.progress.highestCleared + 1}</b>
        </div>
        <div className="stat-row">
          <span>Endless Siege wave</span>
          <b>{game.progress.endlessBest}</b>
        </div>
        <div className="stat-row">
          <span>Blitz score</span>
          <b>{game.progress.blitzBest}</b>
        </div>
        <div className="stat-row">
          <span>Weekly challenge (this week)</span>
          <b>{game.progress.weekly.best}</b>
        </div>
        <div className="stat-row">
          <span>Verified full push-ups</span>
          <b>{game.stats.verifiedFullReps}</b>
        </div>
        <div className="stat-row">
          <span>Verified knee push-ups</span>
          <b>{game.stats.verifiedKneeReps}</b>
        </div>
      </div>
      <FriendBoards />
      <div className="panel dark">
        <div className="spread">
          <h3>Global leaderboards</h3>
          {PLANNED}
        </div>
        <p className="xsmall dim" style={{ margin: '8px 0 0' }}>
          Leaderboards will rank highest wave, bosses, weekly improvement and arena rating. Full and knee push-ups will be ranked separately, never mixed. Scores will be validated by the server - the game never trusts client-submitted competitive scores.
        </p>
      </div>
    </div>
  );
}

function ago(t: number | null): string {
  if (t === null) return '';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} days ago`;
}

function OnlineFriends() {
  const { game } = useGame();
  const f = useFriends();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (p: Promise<unknown>) => {
    setBusy(true);
    await p;
    setBusy(false);
  };

  if (!game.social.online.token) {
    return (
      <div className="panel stack-m">
        <div className="spread">
          <h3>Friends online</h3>
          <span className="chip">Offline</span>
        </div>
        <p className="small dim" style={{ margin: 0 }}>You are playing offline because the server could not be reached. Log in to add friends and back up your progress.</p>
        <button className="btn green block" onClick={leaveOffline}>
          Log in
        </button>
      </div>
    );
  }
  const o = f.overview;
  const friends = [...(o?.friends ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return (
    <div className="stack-m">
      <div className="panel stack-m">
        <div className="spread">
          <h3>Friends online</h3>
          <span className={`chip ${f.status === 'online' ? 'gold' : ''}`}>{f.status === 'online' ? 'Connected' : f.status === 'error' ? 'Connection problem' : 'Connecting...'}</span>
        </div>
        {f.status === 'error' && <div className="notice small">{f.message}</div>}
        <div className="xsmall faint">
          Logged in as <b>{game.social.online.username}</b> on {game.social.online.server} · your code <b>{game.profile.friendCode}</b>
        </div>
        <div className="row">
          <input className="field grow" placeholder="Friend code (PL-XXXX-XXXX)" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Friend code to add" />
          <button
            className="btn green small"
            disabled={busy || !code.trim()}
            onClick={() =>
              void run(
                sendRequest(code).then((ok) => {
                  if (ok) setCode('');
                }),
              )
            }
          >
            Add friend
          </button>
        </div>
      </div>

      {(o?.incoming.length ?? 0) > 0 && (
        <div className="panel gold stack-m">
          <h3>Friend requests ({o!.incoming.length})</h3>
          {o!.incoming.map((r) => (
            <div key={r.id} className="spread">
              <div>
                <div className="display">{r.name}</div>
                <div className="xsmall faint">{r.code}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn green small" disabled={busy} onClick={() => void run(respond(r.id, true))}>
                  Accept
                </button>
                <button className="btn ghost small" disabled={busy} onClick={() => void run(respond(r.id, false))}>
                  Decline
                </button>
                <button className="btn red small" disabled={busy} onClick={() => void run(blockOnline(r.code))} aria-label={`Block ${r.name}`}>
                  Block
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-title">
        <h3>Friends ({friends.length})</h3>
        <button className="btn ghost small" onClick={() => void run(import('../../app/friends').then((m) => m.refresh(true)))}>
          Refresh
        </button>
      </div>
      {friends.length === 0 && <div className="empty">No friends yet. Share your code {game.profile.friendCode} or add a friend's code above.</div>}
      {friends.map((fr) => (
        <div key={fr.code} className="panel friend-card">
          <div className="spread">
            <div className="row" style={{ gap: 8 }}>
              <span className={`presence ${fr.online ? 'on' : ''}`} aria-label={fr.online ? 'Online' : 'Offline'} />
              <div>
                <div className="display">{fr.name}</div>
                <div className="xsmall faint">{fr.online ? 'Online now' : fr.lastSeen ? `Seen ${ago(fr.lastSeen)}` : fr.code}</div>
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost small" disabled={busy} onClick={() => void run(unfriend(fr.code))}>
                Remove
              </button>
              <button className="btn red small" disabled={busy} onClick={() => void run(blockOnline(fr.code))}>
                Block
              </button>
            </div>
          </div>
          {fr.showcase ? (
            <>
              <div className="friend-stats">
                <span>
                  Lv <b>{fr.showcase.heroLevel}</b>
                </span>
                <span>
                  Stage <b>{fr.showcase.stage}</b>
                </span>
                <span>
                  Power <b>{formatNumber(fr.showcase.power)}</b>
                </span>
                <span>
                  Bosses <b>{fr.showcase.bosses}</b>
                </span>
                <span>
                  Push-ups <b>{formatNumber(fr.showcase.verifiedFull)}</b>
                </span>
              </div>
              <div className="row wrap" style={{ gap: 4 }}>
                {fr.showcase.deck.filter((id) => CARD_BY_ID.has(id)).map((id, i) => (
                  <div key={`${id}-${i}`} className={`card-detail-art thumb rarity-${CARD_BY_ID.get(id)!.rarity}`}>
                    <CardArt cardId={id} width={26} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="xsmall faint">This friend keeps their progress private.</div>
          )}
        </div>
      ))}

      {(o?.outgoing.length ?? 0) > 0 && (
        <div className="panel dark stack-m">
          <h3>Sent requests</h3>
          {o!.outgoing.map((r) => (
            <div key={r.id} className="spread small">
              <span>
                {r.name} <span className="faint">{r.code}</span>
              </span>
              <button className="btn ghost small" disabled={busy} onClick={() => void run(cancelRequest(r.id))}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {(o?.blocked.length ?? 0) > 0 && (
        <div className="panel dark stack-m">
          <h3>Blocked on the server</h3>
          {o!.blocked.map((b) => (
            <div key={b} className="spread small">
              <span>{b}</span>
              <button className="btn ghost small" disabled={busy} onClick={() => void run(unblockOnline(b))}>
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 6 }}>
        <button className="btn ghost small grow" onClick={() => void logout()}>
          Log out
        </button>
        <button
          className="btn red small grow"
          onClick={() => {
            if (window.confirm('Delete your account? Your friends list and cloud save on the server are removed. The progress on this device stays.')) void deleteServerAccount();
          }}
        >
          Delete account
        </button>
      </div>
    </div>
  );
}


function FriendBoards() {
  const { game } = useGame();
  const f = useFriends();
  const [board, setBoard] = useState<'stage' | 'bosses' | 'verifiedFull' | 'power'>('stage');
  if (!game.social.online.token) return null;
  const me = { name: `${game.profile.name} (you)`, stage: game.progress.highestCleared + 1, bosses: game.stats.bossesDefeated, verifiedFull: game.stats.verifiedFullReps, power: powerRating(game), me: true };
  const rows = [me, ...(f.overview?.friends ?? []).filter((x) => x.showcase).map((x) => ({ name: x.name, ...x.showcase!, me: false }))].sort((a, b) => b[board] - a[board]);
  return (
    <div className="panel stack-m">
      <h3>Among friends</h3>
      <Segmented
        value={board}
        onChange={setBoard}
        options={[
          { value: 'stage', label: 'Stage' },
          { value: 'bosses', label: 'Bosses' },
          { value: 'verifiedFull', label: 'Push-ups' },
          { value: 'power', label: 'Power' },
        ]}
      />
      {rows.map((r, i) => (
        <div key={`${r.name}-${i}`} className="stat-row" style={r.me ? { color: 'var(--gold)' } : undefined}>
          <span>
            {i + 1}. {r.name}
          </span>
          <b>{formatNumber(r[board])}</b>
        </div>
      ))}
      <p className="xsmall faint" style={{ margin: 0 }}>
        For fun: friends report their own progress, so this list is not verified and gives no rewards. Friends with private profiles are not listed.
      </p>
    </div>
  );
}
