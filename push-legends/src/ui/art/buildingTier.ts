/** Visual tier 0..4 spread over each building's whole level range (3D base and building cards). */
export function visualTier(level: number, maxLevel: number): number {
  if (level <= 1) return 0;
  return Math.min(4, Math.floor(((level - 1) / Math.max(1, maxLevel - 1)) * 5));
}
