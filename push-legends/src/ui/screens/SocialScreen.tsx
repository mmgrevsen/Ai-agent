import { useState } from 'react';
import { store, useGame } from '../../app/store';
import { getCard } from '../../core/content/cards';
import { decodeChallenge } from '../../core/social/codes';
import { powerRating } from '../../core/systems/hero';
import { formatNumber } from '../../core/util';
import { CardArt, OverlayHeader, Segmented } from '../components/common';
import { Icon } from '../components/Icon';

const PLANNED = <span className="chip planned">Planned · needs online backend</span>;

export function SocialScreen() {
  const [tab, setTab] = useState<'profile' | 'friends' | 'challenges' | 'boards'>('profile');
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
          Share it so friends can save you as a contact. Friend requests and online profiles are planned for a future update.
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
          <span className="small dim">Profile visibility (applies when online profiles launch)</span>
          <select className="field" value={game.profile.privacy} onChange={(e) => store.setProfile({ privacy: e.target.value as 'public' | 'friends' | 'private' })}>
            <option value="public">Public</option>
            <option value="friends">Friends only</option>
            <option value="private">Private</option>
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
            <div key={id} className={`card-detail-art rarity-${getCard(id).rarity}`} style={{ padding: 2, borderRadius: 10 }}>
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
      <div className="notice info small">
        Contacts are stored on this device only. Online friend requests, presence and profile viewing are planned once accounts and a server exist - nothing here pretends to be online.
      </div>
      <div className="panel stack-m">
        <h3>Add a contact</h3>
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
          <h3>Friend requests</h3>
          {PLANNED}
        </div>
        <div className="divider" />
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
      <div className="panel dark">
        <div className="spread">
          <h3>Friend & global leaderboards</h3>
          {PLANNED}
        </div>
        <p className="xsmall dim" style={{ margin: '8px 0 0' }}>
          Leaderboards will rank highest wave, bosses, weekly improvement and arena rating. Full and knee push-ups will be ranked separately, never mixed. Scores will be validated by the server - the game never trusts client-submitted competitive scores.
        </p>
      </div>
    </div>
  );
}
