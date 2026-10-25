/**
 * Developer tool (not part of the game bundle): opens the 3D battle arena of one world with a
 * running battle. /dev/arena-viewer.html?world=0..4&t=6&pixel=1 (plus the BattleScene3D debug
 * camera flags, e.g. &debug=1&zoom=0.35&front=1). Sets window.arenaReady once frames are drawn.
 */
import { Battle } from '../core/combat/engine';
import { STAGES_PER_WORLD } from '../core/content/worlds';
import { campaignSetup } from '../core/systems/battleSetup';
import { createInitialState } from '../core/state/initial';
import { BattleScene3D } from '../ui/battle3d/BattleScene3D';

const q = new URLSearchParams(location.search);
const world = Math.max(0, Math.min(4, Number(q.get('world') ?? 0)));
const warm = Number(q.get('t') ?? 6);
const setup = campaignSetup(createInitialState(Date.now(), 1234), world * STAGES_PER_WORLD + 1, 'normal');
const battle = new Battle(setup);
const stage = document.getElementById('stage')!;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
const scene = new BattleScene3D(stage, { onSound: () => {}, onShake: () => {} }, { pixel: q.has('pixel'), reducedMotion: false, world, cape: '', aura: '', goldSword: false });
const w = stage.clientWidth;
const h = stage.clientHeight;
scene.resize(w, h);
const dpr = window.devicePixelRatio || 1;
overlay.width = w * dpr;
overlay.height = h * dpr;
const ctx = overlay.getContext('2d')!;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// Simulate a few seconds with cards dropped in so both sides are on the field
battle.valor = 99;
for (let s = 0; s < warm * 10; s++) {
  if (s % 12 === 0 && s < 30) for (let slot = 0; slot < 4; slot++) battle.deploy(slot, { x: 20 + (s % 3) * 6, lane: ((slot % 3) - 1) * 0.8 });
  battle.valor = 99;
  battle.step(0.1);
}
scene.ingest(battle, battle.drainEvents());
let frames = 0;
let last = performance.now();
const cam = (q.get('cam') ?? '').split(',').filter(Boolean).map(Number);
const maxFrames = Number(q.get('frames') ?? 4);
const loop = (now: number) => {
  const dt = frames === 0 ? 0.05 : Math.min(0.1, (now - last) / 1000);
  last = now;
  scene.render(battle, dt, ctx);
  if (cam.length === 6) {
    // Free camera in scene coordinates (the lane runs along -z, hero end at +z)
    const priv = scene as unknown as { camera: import('three').PerspectiveCamera; pipeline: { render(): void } };
    priv.camera.position.set(cam[0]!, cam[1]!, cam[2]!);
    priv.camera.lookAt(cam[3]!, cam[4]!, cam[5]!);
    if (q.has('fov')) priv.camera.fov = Number(q.get('fov'));
    priv.camera.updateProjectionMatrix();
    priv.camera.updateMatrixWorld();
    priv.pipeline.render();
  }
  if (q.has('nooverlay')) ctx.clearRect(0, 0, w, h);
  frames++;
  if (frames === maxFrames) {
    // Static arena cost: meshes (draw calls) and triangles in the battlefield group
    const group = (scene as unknown as { field: { group: import('three').Object3D } }).field.group;
    let meshes = 0;
    let tris = 0;
    group.traverse((o) => {
      const m = o as import('three').Mesh;
      if (!m.isMesh && !(o as import('three').Points).isPoints) return;
      meshes++;
      const g = m.geometry;
      const n = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0);
      tris += ((o as import('three').InstancedMesh).isInstancedMesh ? (o as import('three').InstancedMesh).count : 1) * n / 3;
    });
    (window as unknown as Record<string, unknown>).arenaInfo = { meshes, tris: Math.round(tris), fit: (scene as unknown as { fit: unknown }).fit };
    (window as unknown as Record<string, unknown>).arenaReady = true;
    // Software WebGL is slow: stop here so a screenshot can be taken (?frames=0 keeps running)
    return;
  }
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
