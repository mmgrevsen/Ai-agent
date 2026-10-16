import { rr, type Ctx } from '../art/draw';

/** What the battle view shows while a card is dragged over the field. */
export interface PlacementPreview {
  /** Drop point in battle coordinates, already clamped into the deploy zone. */
  x: number;
  lane: number;
  /** Current deploy zone along the lane. */
  minX: number;
  maxX: number;
  /** False when the card cannot be played right now (not enough valor or no room). */
  ok: boolean;
  /** Short reason shown next to the marker when `ok` is false. */
  reason: string | null;
  cardId: string;
  count: number;
  flying: boolean;
}

/** Implemented by both battle views (3D scene and the 2D fallback renderer). */
export interface PlacementView {
  /** Stage-relative CSS pixels to battle coordinates (unclamped), or null when the point misses the ground. */
  screenToLane(px: number, py: number): { x: number; lane: number } | null;
  setPlacement(p: PlacementPreview | null): void;
}

/** Formation offsets a dropped squad uses (mirrors the engine's spawn formation). */
export function squadOffsets(count: number): { dx: number; dl: number }[] {
  return Array.from({ length: count }, (_, n) => ({ dx: -(n % 2) * 1.4, dl: count > 1 ? (n - (count - 1) / 2) * 0.34 : 0 }));
}

/** Small red pill with a reason, drawn above the drop marker. */
export function dropLabel(ctx: Ctx, text: string, x: number, y: number): void {
  ctx.font = `13px "Lilita One", sans-serif`;
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = 'rgba(120,10,40,0.85)';
  rr(ctx, x - w / 2, y - 12, w, 22, 11);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y + 4);
}
