import { store } from '../../app/store';
import { sound } from '../../platform/audio';
import { drawLineup } from '../art/cardPortraits';
import { ArtCanvas } from '../components/common';
import { Icon } from '../components/Icon';

/** First-launch screen. One tap drops the player straight into their first (easy) battle. */
export function IntroScreen() {
  const begin = () => {
    sound.unlock();
    sound.setMusic('home');
    store.completeTutorial('intro');
    store.popOverlay();
    store.startBattle({ type: 'campaign', stageIdx: 0, difficulty: 'normal', startAtBoss: false });
  };
  return (
    <div className="intro">
      <div className="intro-canvas">
        <ArtCanvas
          width={390}
          height={760}
          fill
          animate
          draw={(ctx, _t, w, h) => drawLineup(ctx, ['full:thornbow_archer', 'hero:#5e0f14:sword', 'full:oakshield_knight'], w, h, h * 0.56)}
        />
      </div>
      <div className="intro-body stack-m">
        <div className="logo">
          PUSH
          <br />
          LEGENDS
        </div>
        <p className="center dim" style={{ margin: 0 }}>
          Lead an army of dark legends. Every real push-up is a sword strike, and every stage is claimed with push-ups - start with just three. Your realm keeps growing while you rest, and losing a battle never costs you anything.
        </p>
        <button className="btn gold big block pulse" onClick={begin}>
          <Icon name="swords" size={22} /> Begin your legend
        </button>
        <p className="xsmall faint center" style={{ margin: 0 }}>
          Next: set up the camera that counts your push-ups. Video never leaves your phone.
        </p>
      </div>
    </div>
  );
}
