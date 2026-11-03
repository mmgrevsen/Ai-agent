import { UNIT_LOOK, type Faction } from '../art/darkArt';
import { BOSS_BY_ID, WORLDS } from '../../core/content/worlds';
import { bossUnit, buildHero, CARD_UNITS, enemyUnit } from './dark/units';
import type { PortraitSpec, UnitDef } from './dark/units/types';
import * as THREE from 'three';
import type { BuildingId } from '../../core/content/buildings';
import { getPet } from '../../core/content/pets';
import { buildPlot, petModel } from '../base3d/models';
import { PLOT_BY_ID } from '../base3d/layout';
import type { Rig } from './rig';
import { PortraitStudio } from './portrait';

/**
 * Bakes portraits from the battle models (loaded lazily by art/cardPortraits.ts so the 2D screens
 * do not pull in three.js). One shared studio; it is released when the queue runs dry.
 *
 * Keys: a card id (card framing), `full:<cardId>` (whole body), `hero:<cape hex>:<sword|goldsword>`
 * and `boss:<boss id>` (whole body), `building:<id>:<visual tier, -1 = construction site>` (the
 * base model, framed wide for landscape crops).
 */
let studio: PortraitStudio | null = null;

const FULL: PortraitSpec = { from: -0.02, to: 1.04, yaw: 0.4 };
const BOSS_FACTION: Faction[] = ['wild', 'frost', 'ash', 'grave', 'void'];

/** The base's 3D building (at a visual tier) as a portrait subject, cropped to landscape. */
function buildingRig(id: BuildingId, tier: number, spec: PortraitSpec): Rig | null {
  const plot = PLOT_BY_ID.get(id);
  if (!plot) return null;
  const built = buildPlot(plot, { level: tier < 0 ? 0 : tier * 5 + 1, tier: Math.max(0, tier), unlocked: true, upgrading: false, mineFill: 0.75, pets: [], petColors: {}, soldierColors: [] });
  built.group.position.set(0, 0, 0);
  for (const a of built.animators) a(1.2, 0);
  return propRig(built.group, spec, 0.5);
}

const PET_FACTION: Record<string, Faction> = { ember_fox: 'ash', pebble_golem: 'grave', sparkwing: 'storm', moonmoth: 'void', frostpup: 'frost' };

/** Wraps a static model as a portrait subject, scaled to about unit size and framed for a crop. */
function propRig(model: THREE.Object3D, spec: PortraitSpec, cropH: number, target = 3.4): Rig {
  const box = new THREE.Box3().setFromObject(model);
  const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, box.max.y - box.min.y);
  const root = new THREE.Group();
  root.add(model);
  root.scale.setScalar(target / Math.max(0.01, size));
  // The art is shown cropped to a strip `cropH` of the portrait's height, so the camera backs off
  // until the whole model fits that strip: tall towers need more room than wide, low yards
  const h = box.max.y - box.min.y;
  const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const span = h * ((spec.to ?? 1) - (spec.from ?? 0));
  spec.pad = Math.max(h / cropH, w / 0.78) / (Math.max(span, (w * 0.62 * 2) / 0.75) * 1.05);
  return { root, body: new THREE.Group(), legs: [], armR: null, armL: null, wings: [], cape: null, neck: null, head: null, spinners: [], height: 3, material: new THREE.MeshStandardMaterial(), kind: 'quad', shield: false, attack: 'melee' };
}

function resolve(key: string): { def: UnitDef; faction: Faction } | null {
  const [kind, a, b] = key.split(':');
  if (kind === 'building') {
    const tier = Number(b);
    const id = a as BuildingId;
    if (!PLOT_BY_ID.has(id)) return null;
    const portrait: PortraitSpec = { from: -0.06, to: 1.06, yaw: 0.5, light: 2.2, embers: false, pose: () => {} };
    return { def: { build: () => buildingRig(id, Number.isFinite(tier) ? tier : 0, portrait)!, portrait }, faction: 'ash' };
  }
  if (kind === 'pet') {
    const portrait: PortraitSpec = { from: -0.06, to: 1.08, yaw: 0.6, light: 2, pose: () => {} };
    if (!PET_FACTION[a ?? '']) return null;
    const pet = getPet(a!);
    return { def: { build: () => propRig(petModel(pet.id, pet.palette.primary), portrait, 0.62, 2), portrait }, faction: PET_FACTION[pet.id]! };
  }
  if (kind === 'hero') return { def: { build: () => buildHero(a ?? '#5e0f14', b === 'goldsword' ? 'goldsword' : 'sword'), portrait: FULL }, faction: 'iron' };
  if (kind === 'boss') {
    const boss = BOSS_BY_ID.get(a ?? '');
    if (!boss) return null;
    const world = WORLDS.findIndex((w) => w.boss.id === boss.id || w.miniBoss.id === boss.id);
    return {
      def: { build: () => bossUnit(boss.sprite, boss.palette) ?? enemyUnit('armored', Math.max(0, world), boss.palette), portrait: FULL },
      faction: BOSS_FACTION[world] ?? 'void',
    };
  }
  const id = kind === 'full' ? (a ?? '') : key;
  const def = CARD_UNITS[id];
  if (!def) return null;
  return { def: kind === 'full' ? { build: def.build, portrait: { ...def.portrait, ...FULL } } : def, faction: UNIT_LOOK[id]?.faction ?? 'iron' };
}

export function bakePortrait(key: string): HTMLCanvasElement | null {
  const r = resolve(key);
  if (!r) return null;
  studio ??= new PortraitStudio();
  return studio.render(r.def.build(), r.def.portrait, r.faction);
}

export function releaseStudio(): void {
  studio?.dispose();
  studio = null;
}
