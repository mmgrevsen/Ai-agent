import { store } from '../../app/store';
import { sound } from '../../platform/audio';
import { drawWorldBackground } from '../art/scenery';
import { drawSprite } from '../art/units';
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
          draw={(ctx, t, w, h) => {
            const ground = h * 0.56;
            const s = Math.min(w / 180, h / 350);
            drawWorldBackground(ctx, 0, w, h, ground, t, t * 10);
            drawSprite(ctx, { type: 'card', id: 'thornbow_archer' }, w * 0.13, ground + 30, { t: t + 2, facing: 1, attack: 0, hit: 0, scale: s * 0.62, moving: false });
            drawSprite(ctx, { type: 'hero', cape: 'cape_crimson', aura: 'aura_ember' }, w * 0.3, ground + 14, { t, facing: 1, attack: t % 2.4 < 0.3 ? (t % 2.4) / 0.3 : 0, hit: 0, scale: s * 0.95, moving: false });
            drawSprite(ctx, { type: 'card', id: 'oakshield_knight' }, w * 0.52, ground + 36, { t: t + 1, facing: 1, attack: 0, hit: 0, scale: s * 0.65, moving: true });
            drawSprite(ctx, { type: 'boss', id: 'grovemaw' }, w * 0.84, ground + 6, { t, facing: -1, attack: 0, hit: 0, scale: s * 0.6, moving: false });
          }}
        />
      </div>
      <div className="intro-body stack-m">
        <div className="logo">
          PUSH
          <br />
          LEGENDS
        </div>
        <p className="center dim" style={{ margin: 0 }}>
          Lead an army of heroes. Every real push-up is a sword strike - earn gold, forge better swords, hit harder. Rest days are welcome - your realm keeps growing while you're away, and losing a battle never costs you anything.
        </p>
        <button className="btn gold big block pulse" onClick={begin}>
          <Icon name="swords" size={22} /> Begin your legend
        </button>
        <p className="xsmall faint center" style={{ margin: 0 }}>
          The first battle needs no camera. You can turn on push-up tracking any time.
        </p>
      </div>
    </div>
  );
}
