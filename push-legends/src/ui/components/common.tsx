import { useEffect, useRef, useState, type ReactNode } from 'react';
import { store } from '../../app/store';
import { getCard } from '../../core/content/cards';
import type { BuildingId } from '../../core/content/buildings';
import type { Reward } from '../../core/content/quests';
import type { Rarity } from '../../core/content/types';
import { formatNumber } from '../../core/util';
import type { Ctx } from '../art/draw';
import { drawCardPortrait, hasPortrait } from '../art/portraits';
import { drawBuilding, drawItemIcon, drawPet } from '../art/scenery';
import { drawSprite, type SpriteKey } from '../art/units';
import { Icon, type IconName } from './Icon';

// --- Canvas ---------------------------------------------------------------------------------------

/**
 * A crisp (devicePixelRatio-aware) canvas that calls `draw` once, or every frame when `animate`.
 * With `fill`, it sizes itself to its parent element instead of the given width/height.
 */
export function ArtCanvas({ width, height, draw, animate = false, className, fill = false }: { width: number; height: number; draw: (ctx: Ctx, t: number, w: number, h: number) => void; animate?: boolean; className?: string; fill?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const reduced = store.state.settings.reducedMotion;
  const [size, setSize] = useState({ w: width, h: height });
  useEffect(() => {
    if (!fill || !ref.current?.parentElement) return;
    const parent = ref.current.parentElement;
    const ro = new ResizeObserver(() => {
      const r = parent.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [fill]);
  const w = fill ? size.w : width;
  const h = fill ? size.h : height;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const start = performance.now();
    const frame = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, (performance.now() - start) / 1000, w, h);
      if (animate && !reduced) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [w, h, animate, reduced]);
  return <canvas ref={ref} className={className} style={{ width: w, height: h, display: 'block' }} />;
}

export function UnitPortrait({ sprite, size, animate = false, scale = 1.25 }: { sprite: SpriteKey; size: number; animate?: boolean; scale?: number }) {
  return (
    <ArtCanvas
      width={size}
      height={size}
      animate={animate}
      draw={(ctx, t) => {
        const big = sprite.type === 'boss';
        drawSprite(ctx, sprite, size / 2, size * (big ? 0.95 : 0.86), { t, facing: 1, attack: 0, hit: 0, scale: (size / 64) * scale * (big ? 0.55 : 1), moving: false });
      }}
    />
  );
}

export function CardArt({ cardId, width, animate = false }: { cardId: string; width: number; animate?: boolean }) {
  const h = Math.round((width * 4) / 3);
  const def = getCard(cardId);
  const big = def.id === 'aurora_drake' || def.id === 'bastion_golem' || def.id === 'phoenix_warden';
  return (
    <ArtCanvas
      width={width}
      height={h}
      animate={animate}
      draw={(ctx, t) => {
        if (hasPortrait(cardId)) {
          drawCardPortrait(ctx, cardId, width, h, t);
          return;
        }
        const g = ctx.createRadialGradient(width / 2, h * 0.45, 4, width / 2, h * 0.45, width);
        g.addColorStop(0, def.palette.accent + '66');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, h);
        drawSprite(ctx, { type: 'card', id: cardId }, width / 2 - (big ? 4 : 0), h * 0.8, { t, facing: 1, attack: 0, hit: 0, scale: (width / 64) * (big ? 0.95 : 1.25), moving: false });
      }}
    />
  );
}

export function ItemArt({ defId, size }: { defId: string; size: number }) {
  return <ArtCanvas width={size} height={size} draw={(ctx) => drawItemIcon(ctx, defId, size / 2, size / 2, size * 0.8)} />;
}

export function PetArt({ petId, size, animate = false }: { petId: string; size: number; animate?: boolean }) {
  return <ArtCanvas width={size} height={size} animate={animate} draw={(ctx, t) => drawPet(ctx, petId, size / 2, size * 0.85, size * 0.8, t)} />;
}

export function BuildingArt({ id, level, width, height, animate = false }: { id: BuildingId; level: number; width: number; height: number; animate?: boolean }) {
  return <ArtCanvas width={width} height={height} animate={animate} draw={(ctx, t) => drawBuilding(ctx, id, level, width / 2, height - 6, Math.min(width / 110, height / 95), t)} />;
}

// --- Small UI pieces ------------------------------------------------------------------------------

export const RARITY_SYMBOL: Record<Rarity, string> = { common: '●', rare: '◆', epic: '★', legendary: '♛', mythic: '✦' };
export const RARITY_NAME: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };

export function RarityTag({ rarity }: { rarity: Rarity }) {
  return (
    <span className={`rarity-${rarity}`}>
      <span className={`rarity-tag ${rarity === 'mythic' ? 'mythic' : ''}`}>
        {RARITY_SYMBOL[rarity]} {RARITY_NAME[rarity]}
      </span>
    </span>
  );
}

export function Res({ icon, value, title }: { icon: IconName; value: number; title?: string }) {
  return (
    <span className="res" title={title} aria-label={`${title ?? icon}: ${Math.floor(value)}`}>
      <Icon name={icon} />
      {formatNumber(value)}
    </span>
  );
}

export function Bar({ value, max, tone = '', label, tall = false }: { value: number; max: number; tone?: '' | 'green' | 'blue' | 'red' | 'purple'; label?: string; tall?: boolean }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${tone} ${tall ? 'tall' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${pct}%` }} />
      {label && <span className="bar-label">{label}</span>}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const REWARD_ICONS: [keyof Reward, IconName, string][] = [
  ['gold', 'gold', 'Gold'],
  ['gems', 'gem', 'Gems'],
  ['ore', 'ore', 'Ore'],
  ['petTreats', 'treat', 'Pet treats'],
  ['glory', 'glory', 'Glory'],
  ['heroXp', 'xp', 'Hero XP'],
];

export function RewardList({ reward, extra }: { reward: Reward | null | undefined; extra?: ReactNode }) {
  if (!reward) return null;
  const items = REWARD_ICONS.filter(([k]) => typeof reward[k] === 'number' && (reward[k] as number) > 0);
  return (
    <div className="row wrap">
      {items.map(([k, icon, label]) => (
        <span key={k} className="reward-pill" aria-label={`${label} ${reward[k]}`}>
          <Icon name={icon} />+{formatNumber(reward[k] as number)}
        </span>
      ))}
      {reward.chest && (
        <span className="reward-pill">
          <Icon name="chest" />
          {reward.chest} chest
        </span>
      )}
      {extra}
    </div>
  );
}

export function ModalShell({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="modal-grip" />
        {children}
      </div>
    </div>
  );
}

export function OverlayHeader({ title, onBack, right }: { title: ReactNode; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="overlay-header">
      <button className="icon-btn" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      <h2 className="grow">{title}</h2>
      {right}
    </div>
  );
}

/** Re-renders every `ms` so time-based values (mine, timers) stay current. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function CardTile({ cardId, level, fragments, need, inDeck, locked, canUpgrade, onClick, width = 86 }: { cardId: string; level?: number; fragments?: number; need?: number; inDeck?: boolean; locked?: boolean; canUpgrade?: boolean; onClick?: () => void; width?: number }) {
  const def = getCard(cardId);
  return (
    <button className="tile" onClick={onClick} aria-label={`${def.name}, ${RARITY_NAME[def.rarity]}${level ? `, level ${level}` : ''}${locked ? ', locked' : ''}`} style={{ width }}>
      <div className={`card rarity-${def.rarity} ${locked ? 'locked' : ''} ${inDeck ? 'in-deck' : ''}`}>
        <div className="card-cost" aria-hidden="true">
          <span>{def.cost}</span>
        </div>
        <span className="card-rarity-icon">{RARITY_SYMBOL[def.rarity]}</span>
        <div className="card-inner">
          <CardArt cardId={cardId} width={width - 6} />
          {level !== undefined && !locked && <div className="card-level">Lv {level}</div>}
          {locked && (
            <div className="card-level row center">
              <Icon name="lock" size={11} /> Locked
            </div>
          )}
        </div>
        {canUpgrade && <div className="upgrade-arrow">↑</div>}
      </div>
      {level !== undefined && !locked && need !== undefined && fragments !== undefined && level < 20 && (
        <div className="card-progress">
          <Bar value={fragments} max={need} tone={fragments >= need ? 'green' : 'blue'} />
        </div>
      )}
      <div className="card-name">{def.name}</div>
    </button>
  );
}
