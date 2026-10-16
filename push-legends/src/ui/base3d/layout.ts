import type { BuildingId } from '../../core/content/buildings';

/**
 * Base map layout in world units (1 unit ≈ 1 m). x grows east, z grows south (toward the camera).
 * The gate is on the south wall; the castle sits at the north end of the central avenue.
 */
export const MAP = { minX: -23, maxX: 23, minZ: -25, maxZ: 25 };

export interface Plot {
  id: BuildingId;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Height of the floating label above the plot. */
  labelY: number;
}

export const PLOTS: readonly Plot[] = [
  { id: 'castle', x: 0, z: -16, w: 16, d: 13, labelY: 13 },
  { id: 'gold_mine', x: -15, z: -16, w: 12, d: 11, labelY: 8 },
  { id: 'academy', x: 15, z: -16, w: 12, d: 11, labelY: 10 },
  { id: 'barracks', x: -15, z: -1.5, w: 12, d: 10, labelY: 7 },
  { id: 'training_grounds', x: 15, z: -1.5, w: 12, d: 10, labelY: 6 },
  { id: 'treasury', x: -5.6, z: 1.5, w: 5, d: 9, labelY: 8 },
  { id: 'guild_hall', x: 5.6, z: 1.5, w: 5, d: 9, labelY: 9 },
  { id: 'blacksmith', x: -15, z: 13, w: 12, d: 10, labelY: 8 },
  { id: 'pet_sanctuary', x: 15, z: 13, w: 12, d: 10, labelY: 6 },
];

export const PLOT_BY_ID: ReadonlyMap<BuildingId, Plot> = new Map(PLOTS.map((p) => [p.id, p]));

/** Stone roads: [x0, z0, x1, z1]. */
export const ROADS: readonly [number, number, number, number][] = [
  [-2.6, -9.5, 2.6, 24.5], // central avenue from the gate
  [-21.5, -9.5, 21.5, -6.5], // castle plaza
  [-21.5, 6.5, 21.5, 8.6], // southern cross road
  [-9.5, -6.5, -8, 6.5], // west lane
  [8, -6.5, 9.5, 6.5], // east lane
];

/** Closed loops soldiers patrol along (x, z points). */
export const PATROLS: readonly [number, number][][] = [
  [
    [0, 23],
    [0, -8],
    [-20, -8],
    [-20, -7.2],
    [0, -7.2],
  ],
  [
    [-1, -7.8],
    [-8.7, -7.8],
    [-8.7, 7.5],
    [8.7, 7.5],
    [8.7, -7.8],
  ],
  [
    [1, 22],
    [1, 7.6],
    [20, 7.6],
    [1, 7.6],
  ],
  [
    [-1, 7.6],
    [-20, 7.6],
    [-1, 7.6],
    [-1, -5],
  ],
];
