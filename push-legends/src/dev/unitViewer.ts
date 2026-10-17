/**
 * Developer tool (not part of the game bundle): renders units side by side so their look can be
 * checked quickly. Open /dev/unit-viewer.html?units=oakshield_knight,hero,enemy:armored:2,boss:lich_king:3
 * Columns: card portrait | battle camera (game scale, with a stand-in opponent) | close-up front | back.
 */
import * as THREE from 'three';
import { UNIT_LOOK } from '../ui/art/darkArt';
import { createPipeline, skyEnvironment } from '../ui/base3d/render';
import { disposeTree } from '../ui/base3d/kit';
import { bossUnit, buildHero, CARD_UNITS, enemyUnit } from '../ui/battle3d/dark/units';
import type { UnitDef } from '../ui/battle3d/dark/units/types';
import { PortraitStudio, PORTRAIT_H, PORTRAIT_W } from '../ui/battle3d/portrait';
import type { Rig } from '../ui/battle3d/rig';
import { WORLDS } from '../core/content/worlds';

const UNIT_SCALE = 3.5;
const q = new URLSearchParams(location.search);
const keys = (q.get('units') ?? 'oakshield_knight').split(',').filter(Boolean);
const cols = 4;
const out = document.createElement('canvas');
out.width = PORTRAIT_W * cols;
out.height = (PORTRAIT_H + 18) * keys.length;
document.body.appendChild(out);
const ctx = out.getContext('2d')!;
ctx.fillStyle = '#0a0a0c';
ctx.fillRect(0, 0, out.width, out.height);

function unitFor(key: string): UnitDef {
  if (key === 'hero') return { build: () => buildHero('#5e0f14', 'sword'), portrait: { faction: 'iron' } };
  const [kind, a, w] = key.split(':');
  const world = Math.max(0, Math.min(4, Number(w ?? 0)));
  const palette = WORLDS[world]!.enemyPalette;
  if (kind === 'enemy') return { build: () => enemyUnit(a ?? 'normal', world, palette), portrait: { faction: 'grave' } };
  if (kind === 'boss') {
    const boss = [...WORLDS.map((x) => x.boss), ...WORLDS.map((x) => x.miniBoss)].find((b) => b.sprite === a);
    return { build: () => bossUnit(a ?? '', boss?.palette ?? palette) ?? enemyUnit('armored', world, palette), portrait: { faction: 'void', from: 0.05 } };
  }
  const def = CARD_UNITS[key];
  if (!def) throw new Error(`Unknown unit ${key}`);
  return { ...def, portrait: { faction: UNIT_LOOK[key]?.faction, ...def.portrait } };
}

// Battle-style view renderer (daylight like the arena)
const vr = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
vr.setSize(PORTRAIT_W, PORTRAIT_H, false);
vr.shadowMap.enabled = true;
vr.toneMapping = THREE.ACESFilmicToneMapping;
vr.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fb6c8');
const sunDir = new THREE.Vector3(18, 21, 26).normalize();
scene.environment = skyEnvironment(vr, '#7ec8e3', '#d4f1c5', '#6e6650', sunDir);
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight('#dcecff', '#5a5040', 0.3));
const sun = new THREE.DirectionalLight('#ffe6c0', 2.7);
sun.position.copy(sunDir).multiplyScalar(60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 10, far: 120 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#5c7a3e', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const road = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 200), new THREE.MeshStandardMaterial({ color: '#9a9484', roughness: 0.95 }));
road.rotation.x = -Math.PI / 2;
road.position.y = 0.01;
road.receiveShadow = true;
scene.add(road);
const cam = new THREE.PerspectiveCamera(27, PORTRAIT_W / PORTRAIT_H, 0.5, 600);
const pipe = createPipeline(vr, scene, cam, { msaa: true, bloom: { strength: 0.35, radius: 0.5, threshold: 2.6 }, saturation: 1, contrast: 1.08, vignette: 0.2, ao: { radius: 2.2, intensity: 1 } });
pipe.setSize(PORTRAIT_W, PORTRAIT_H, 1);

function place(rig: Rig, x: number, z: number, yaw: number, scale: number): void {
  rig.root.scale.setScalar(scale * (rig.presence ?? 1));
  rig.root.position.set(x, rig.kind === 'flyer' ? 6 : 0, z);
  rig.root.rotation.y = yaw;
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  scene.add(rig.root);
}

function shot(): HTMLCanvasElement {
  pipe.render();
  const c = document.createElement('canvas');
  c.width = PORTRAIT_W;
  c.height = PORTRAIT_H;
  c.getContext('2d')!.drawImage(vr.domElement, 0, 0);
  return c;
}

const studio = new PortraitStudio();
keys.forEach((key, row) => {
  const y = row * (PORTRAIT_H + 18);
  ctx.fillStyle = '#aaa';
  ctx.fillText(key, 4, y + 12);
  const def = unitFor(key);
  // 1. Card portrait
  ctx.drawImage(studio.render(def.build(), def.portrait, def.portrait?.faction ?? 'iron'), 0, y + 18);
  // 2. Battle camera: three copies marching up the lane towards a stand-in opponent
  const rigs = [def.build(), def.build(), def.build()];
  rigs.forEach((r, i) => place(r, (i - 1) * 3.2, 4 + (i % 2) * 2, Math.PI, UNIT_SCALE));
  const foe = enemyUnit('armored', 0, WORLDS[0]!.enemyPalette);
  place(foe, 0, -6, 0, UNIT_SCALE);
  const pitch = (46 * Math.PI) / 180;
  const d = 44;
  cam.position.set(0, d * Math.sin(pitch), 2 + d * Math.cos(pitch));
  cam.lookAt(0, 1, 0);
  ctx.drawImage(shot(), PORTRAIT_W, y + 18);
  for (const r of [...rigs, foe]) {
    scene.remove(r.root);
    disposeTree(r.root);
  }
  // 3/4. Close-ups front and back
  const r = def.build();
  place(r, 0, 0, 0.5, 1);
  const h = r.height * (r.presence ?? 1);
  const dist = h * 2.6;
  const ty = r.kind === 'flyer' ? 6 + h * 0.2 : h * 0.55;
  cam.position.set(dist * 0.35, ty + h * 0.15, dist);
  cam.lookAt(0, ty, 0);
  ctx.drawImage(shot(), PORTRAIT_W * 2, y + 18);
  cam.position.set(-dist * 0.5, ty + h * 0.3, -dist);
  cam.lookAt(0, ty, 0);
  ctx.drawImage(shot(), PORTRAIT_W * 3, y + 18);
  scene.remove(r.root);
  disposeTree(r.root);
});
(window as unknown as { done: boolean }).done = true;
