/**
 * Developer tool (not part of the game bundle): every card in the real card components at phone
 * size, for checking frames, portraits and readability. Open /dev/card-gallery.html
 * (?nogl=1 shows the no-WebGL placeholder art).
 */
import { createRoot } from 'react-dom/client';
import { CARDS } from '../core/content/cards';
import { CardArt, CardTile } from '../ui/components/common';
import '../ui/styles/app.css';
import '../ui/styles/screens.css';
import '../ui/styles/battle.css';

if (new URLSearchParams(location.search).has('nogl')) {
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    return type.startsWith('webgl') ? null : (real as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
  } as typeof real;
}

const byRarity = [...CARDS].sort((a, b) => ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(a.rarity) - ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(b.rarity));

function Gallery() {
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--bg-1)', minHeight: '100vh' }}>
      <div className="collection-grid">
        {byRarity.map((c, i) => (
          <CardTile key={c.id} cardId={c.id} level={1 + (i % 9)} fragments={i * 3} need={20} canUpgrade={i % 5 === 1} inDeck={i === 2} locked={i === 4} width={80} />
        ))}
      </div>
      <div className="hand" style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {byRarity.slice(-5).map((c, i) => (
          <button key={c.id} className={`hand-card rarity-${c.rarity} ${i % 2 ? '' : 'ready'}`}>
            <CardArt cardId={c.id} width={64} />
            <span className="hand-cost">
              <span>{c.cost}</span>
            </span>
            {i % 2 === 1 && <span className="hand-wait" style={{ height: '45%' }} />}
            <span className="hand-lv">Lv{3 + i}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {byRarity.slice(-2).map((c) => (
          <div key={c.id} className={`card-detail-art rarity-${c.rarity}`}>
            <CardArt cardId={c.id} width={110} animate />
          </div>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: 110 }}>
          {byRarity.slice(0, 6).map((c) => (
            <div key={c.id} className={`card-detail-art thumb rarity-${c.rarity}`}>
              <CardArt cardId={c.id} width={30} />
            </div>
          ))}
          {byRarity.slice(6, 8).map((c) => (
            <div key={c.id} className={`card-detail-art mini rarity-${c.rarity}`}>
              <CardArt cardId={c.id} width={44} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
