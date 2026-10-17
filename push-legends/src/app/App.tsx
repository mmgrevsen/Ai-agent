import { useFriends } from './friends';
import { LoginScreen } from '../ui/screens/LoginScreen';
import { useEffect } from 'react';
import { BUILDINGS } from '../core/content/buildings';
import { activeUpgrades, checkBuildingUpgrade } from '../core/systems/buildings';
import { upgradeableCards } from '../core/systems/cards';
import { nextAffordableSword } from '../core/systems/armory';
import { claimableAchievements } from '../core/systems/quests';
import { sound } from '../platform/audio';
import { BattleScreen } from '../ui/battle/BattleScreen';
import { Res } from '../ui/components/common';
import { Icon, type IconName } from '../ui/components/Icon';
import { BaseScreen } from '../ui/screens/BaseScreen';
import { CameraSetupScreen } from '../ui/screens/CameraSetupScreen';
import { CardsScreen } from '../ui/screens/CardsScreen';
import { HeroScreen } from '../ui/screens/HeroScreen';
import { HomeScreen } from '../ui/screens/HomeScreen';
import { IntroScreen } from '../ui/screens/IntroScreen';
import { ModalHost } from '../ui/screens/Modals';
import { DungeonScreen, ModesScreen } from '../ui/screens/ModesScreen';
import { QuestsScreen } from '../ui/screens/QuestsScreen';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { SettingsScreen } from '../ui/screens/SettingsScreen';
import { SocialScreen } from '../ui/screens/SocialScreen';
import { store, useGame, type Overlay, type Tab } from './store';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Battle', icon: 'castle' },
  { id: 'cards', label: 'Cards', icon: 'cards' },
  { id: 'hero', label: 'Hero', icon: 'hero' },
  { id: 'base', label: 'Base', icon: 'base' },
  { id: 'quests', label: 'Quests', icon: 'quests' },
];

function OverlayView({ overlay }: { overlay: Overlay }) {
  switch (overlay.kind) {
    case 'battle':
      return <BattleScreen key={overlay.id} setup={overlay.setup} context={overlay.context} />;
    case 'result':
      return <ResultScreen summary={overlay.summary} result={overlay.result} context={overlay.context} dungeon={overlay.dungeon} />;
    case 'social':
      return <SocialScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'modes':
      return <ModesScreen />;
    case 'dungeon':
      return <DungeonScreen />;
    case 'cameraSetup':
      return <CameraSetupScreen then={overlay.then} />;
    case 'intro':
      return <IntroScreen />;
  }
}

/** Nothing is playable until the player is logged in. */
export function App() {
  const { game } = useGame();
  return game.social.online.token ? <GameApp /> : <LoginScreen />;
}

function GameApp() {
  const { game, ui } = useGame();
  const friendsView = useFriends();

  useEffect(() => {
    const tick = window.setInterval(() => store.tick(), 5000);
    const onVis = () => {
      if (document.hidden) {
        store.persist();
        sound.suspend(true);
      } else {
        sound.suspend(false);
        store.onResume();
      }
    };
    const onHide = () => store.persist();
    const unlock = () => {
      sound.unlock();
      sound.setMusic('home');
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  const badges: Partial<Record<Tab, number>> = {
    cards: upgradeableCards(game).length,
    base: activeUpgrades(game).length < 2 && BUILDINGS.some((b) => checkBuildingUpgrade(game, b.id).ok) ? 1 : 0,
    quests: [...game.quests.daily, ...game.quests.weekly].filter((q) => !q.claimed && q.progress >= q.target).length + claimableAchievements(game).length,
    home: game.pendingChests.length,
    hero: nextAffordableSword(game) ? 1 : 0,
  };

  const friendRequests = friendsView.overview?.incoming.length ?? 0;
  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn has-dot" onClick={() => store.pushOverlay({ kind: 'social' })} aria-label={friendRequests ? `Friends and profile, ${friendRequests} friend requests` : 'Friends and profile'}>
          <Icon name="social" />
          {friendRequests > 0 && <span className="dot">{friendRequests}</span>}
        </button>
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <span className="display" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {game.profile.name}
          </span>
          <span className="xsmall faint">Hero Lv {game.hero.level}</span>
        </div>
        <Res icon="gold" value={game.resources.gold} title="Gold" />
        <Res icon="gem" value={game.resources.gems} title="Gems" />
        <button className="icon-btn" onClick={() => store.pushOverlay({ kind: 'settings' })} aria-label="Settings">
          <Icon name="settings" />
        </button>
      </header>
      <div className="xsmall dim row" style={{ justifyContent: 'flex-end', gap: 6, padding: '4px 12px 0' }}>
        <Res icon="ore" value={game.resources.ore} title="Ore" />
        <Res icon="treat" value={game.resources.petTreats} title="Pet treats" />
        <Res icon="glory" value={game.resources.glory} title="Glory" />
      </div>
      <main className="content" key={ui.tab}>
        {ui.tab === 'home' && <HomeScreen />}
        {ui.tab === 'cards' && <CardsScreen />}
        {ui.tab === 'hero' && <HeroScreen />}
        {ui.tab === 'base' && <BaseScreen />}
        {ui.tab === 'quests' && <QuestsScreen />}
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${ui.tab === t.id ? 'active' : ''}`} onClick={() => store.setTab(t.id)} aria-current={ui.tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} />
            {t.label}
            {!!badges[t.id] && <span className="dot">{badges[t.id]}</span>}
          </button>
        ))}
      </nav>
      {ui.overlays.map((o, i) => (
        <OverlayView key={`${o.kind}-${i}`} overlay={o} />
      ))}
      {ui.modal && <ModalHost modal={ui.modal} />}
      <div className="toasts" aria-live="polite">
        {ui.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
