import * as THREE from 'three';
import { FACTIONS, PAL, type Faction } from '../art/darkArt';
import { disposeTree } from '../base3d/kit';
import { createPipeline, skyEnvironment, type Pipeline } from '../base3d/render';
import type { Rig } from './rig';
import type { PortraitSpec } from './dark/units/types';

/**
 * Card portrait studio: renders a unit's battle model with dramatic lighting (warm key light, a
 * strong faction-coloured rim light, low fill), drifting fog, embers and a vignette. The card art
 * is therefore always the same character the player deploys.
 */
export const PORTRAIT_W = 300;
export const PORTRAIT_H = 400;

/** Default portrait pose: weapon raised, shield up, feet planted. */
export function heroicPose(rig: Rig): void {
  if (rig.kind === 'biped') {
    if (rig.armR) rig.armR.rotation.set(-0.95, 0, 0.28);
    if (rig.armL) rig.armL.rotation.set(rig.shield ? -0.55 : -0.35, 0, rig.shield ? 0.22 : -0.2);
    rig.legs.forEach((l, i) => (l.rotation.x = i === 0 ? 0.28 : -0.22));
    rig.body.rotation.y = 0.12;
    if (rig.neck) rig.neck.rotation.set(0.08, -0.15, 0);
  }
  for (const w of rig.wings) w.rotation.z = (w.position.x > 0 ? 1 : -1) * 0.35;
}

export class PortraitStudio {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, PORTRAIT_W / PORTRAIT_H, 0.1, 200);
  private readonly pipeline: Pipeline;
  private readonly backdrop: THREE.Mesh;
  private readonly key: THREE.DirectionalLight;
  private readonly rimL: THREE.DirectionalLight;
  private readonly rimR: THREE.DirectionalLight;
  private readonly under: THREE.PointLight;
  private readonly embers: THREE.Points;
  private readonly smoke: THREE.Mesh[] = [];

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PORTRAIT_W, PORTRAIT_H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    const sunDir = new THREE.Vector3(-0.3, 0.9, 0.5).normalize();
    this.scene.environment = skyEnvironment(this.renderer, '#3a55a8', '#6a5a80', '#4a2a18', sunDir);
    this.scene.environmentIntensity = 0.45;

    // Backdrop: near-black with billowing coloured smoke, a glow behind the subject and a light
    // shaft to one side (like a burning brazier or a rift), slightly out of focus by construction
    this.backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(40, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSeed: { value: 0 } },
        vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow; uniform float uSeed; varying vec3 vP;
          float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
          float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }
          void main() {
            vec2 q = vP.xy * vec2(3.0, 3.0) + uSeed;
            float y = vP.y * 0.5 + 0.5;
            // Twilight forest: deep blue sky with soft clouds, a faint faction tint, pine silhouettes
            vec3 c = mix(uBottom, uTop, smoothstep(0.25, 0.85, y));
            float sm = fbm(q * 1.2 + vec2(0.0, fbm(q * 0.7) * 1.4));
            c += vec3(0.10, 0.14, 0.32) * smoothstep(0.45, 0.9, sm) * smoothstep(0.45, 0.8, y);
            c += uGlow * 0.25 * exp(-pow(length(vec2(vP.x * 1.2, vP.y - 0.05)) * 2.2, 2.0));
            // Two rows of pines: far ones pale blue, near ones darker
            for (int r = 0; r < 2; r++) {
              float fr = float(r);
              float px = vP.x * (5.0 + fr * 3.0) + uSeed * (1.0 + fr);
              float cell = floor(px);
              float u = fract(px) - 0.5;
              float hgt = 0.08 + 0.16 * h(vec2(cell, fr)) + fr * 0.06;
              float base = 0.36 + fr * 0.06;
              float tree = step(abs(u) * (0.9 + fr * 0.2), (base + hgt - y) * 1.7) * step(base - 0.3, y);
              c = mix(c, mix(vec3(0.07, 0.11, 0.24), vec3(0.03, 0.05, 0.12), fr), tree * (0.85 - fr * 0.1));
            }
            // Warm firelight on the ground
            c += vec3(1.0, 0.45, 0.12) * 0.35 * exp(-pow(length(vec2(vP.x * 1.1, (vP.y + 0.32) * 2.2)), 2.0) * 2.5);
            c *= 0.92 + 0.08 * h(floor(vP.xy * 400.0));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.scene.add(this.backdrop);

    // Ground: dark wet stone that catches the rim light
    const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: '#4a2a18', roughness: 0.85, metalness: 0.0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Lighting as in dark concept art: a dim cool key that leaves the armour almost black, two strong
    // accent-coloured rim lights carving the silhouette, and an accent glow from below the frame
    this.key = new THREE.DirectionalLight('#c9d2e0', 1.6);
    this.key.position.set(-2, 6, 4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.radius = 4;
    Object.assign(this.key.shadow.camera, { left: -4, right: 4, top: 6, bottom: -1, near: 0.5, far: 20 });
    this.scene.add(this.key, this.key.target);
    this.rimL = new THREE.DirectionalLight('#ffffff', 3.2);
    this.rimL.position.set(-4, 3, -3);
    this.rimR = new THREE.DirectionalLight('#ffffff', 2.8);
    this.rimR.position.set(4, 2.5, -3.5);
    this.scene.add(this.rimL, this.rimR);
    this.under = new THREE.PointLight('#ffffff', 5, 9, 1.6);
    this.scene.add(this.under);
    this.scene.add(new THREE.HemisphereLight('#5d78c8', '#3a2010', 0.7));

    // Smoke banks: one behind the subject, one low in front that veils the legs
    const smokeMat = () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color() }, uSeed: { value: 0 }, uAlpha: { value: 0.6 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uColor; uniform float uSeed; uniform float uAlpha; varying vec2 vUv;
          float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
          float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.1 + 0.7; a *= 0.5; } return s; }
          void main() {
            vec2 p = vUv * vec2(5.0, 2.0) + uSeed;
            float m = fbm(p + vec2(fbm(p * 1.3) * 1.2, 0.0));
            float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.45, vUv.y) * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
            float a = smoothstep(0.38, 0.85, m) * edge * uAlpha;
            gl_FragColor = vec4(uColor * (0.7 + 0.6 * m), a);
          }`,
      });
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.2), smokeMat());
      mesh.renderOrder = 5 + i;
      this.smoke.push(mesh);
      this.scene.add(mesh);
    }

    // Embers / sparks drifting up
    const n = 110;
    const pos = new Float32Array(n * 3);
    let seed = 9;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 5, r() * 3.8, (r() - 0.5) * 3], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, color: new THREE.Color(PAL.ember).multiplyScalar(3), transparent: true, opacity: 0.9, depthWrite: false }));
    this.scene.add(this.embers);

    this.pipeline = createPipeline(this.renderer, this.scene, this.camera, { msaa: true, bloom: { strength: 0.7, radius: 0.55, threshold: 1.7 }, saturation: 1.15, contrast: 1.08, vignette: 0.45, ao: { radius: 0.35, intensity: 1 }, paint: true });
    this.pipeline.setSize(PORTRAIT_W, PORTRAIT_H, 1);
  }

  /** Renders the rig and returns a new canvas with the portrait. The rig is disposed afterwards. */
  render(rig: Rig, spec: PortraitSpec = {}, faction: Faction = 'iron'): HTMLCanvasElement {
    const f = FACTIONS[spec.faction ?? faction];
    const seed = [...(spec.faction ?? faction)].reduce((a, c) => a + c.charCodeAt(0), 0) * 0.37;
    const mat = this.backdrop.material as THREE.ShaderMaterial;
    // Twilight blues with a hint of the faction's colour
    mat.uniforms.uTop!.value.set('#22398a').lerp(new THREE.Color(f.glow), 0.03);
    mat.uniforms.uBottom!.value.set('#101c48').lerp(new THREE.Color(f.glow), 0.04);
    mat.uniforms.uGlow!.value.set(f.glow).multiplyScalar(0.07);
    mat.uniforms.uSeed!.value = seed;
    this.smoke.forEach((m, i) => {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uColor!.value.set('#4a63b8').multiplyScalar(i ? 0.3 : 0.45);
      u.uSeed!.value = seed + i * 4.1;
      u.uAlpha!.value = i ? 0.45 : 0.4;
    });
    // One rim near-white (steel catches cold light), one in the faction's glow
    // Moonlight rim from behind on one side, the faction's colour on the other, and warm
    // campfire light from below and in front (the painted twilight look)
    this.rimL.color.set('#9fb8ff');
    this.rimR.color.set(f.glow).lerp(new THREE.Color('#c8d6ff'), 0.6);
    this.under.color.set('#ff9440');
    this.key.color.set('#ffd2a8');
    (this.embers.material as THREE.PointsMaterial).color.set('#ffa040').multiplyScalar(3);

    const light = spec.light ?? 1;
    this.key.intensity = 2.4 * light;
    this.scene.environmentIntensity = 0.6 * light;
    this.embers.visible = spec.embers ?? true;
    this.under.intensity = 5 * (spec.under ?? 1);
    (spec.pose ?? heroicPose)(rig);
    rig.root.rotation.y = spec.yaw ?? 0.45;
    rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    this.scene.add(rig.root);
    rig.root.updateMatrixWorld(true);

    // Frame the requested slice of the model, seen from slightly below (heroic angle)
    const box = new THREE.Box3().setFromObject(rig.root);
    // Bipeds are framed on their body (a raised weapon may leave the frame, as in a close-up
    // painting); creatures on their whole bounding box
    const biped = rig.kind === 'biped';
    const base = biped ? 0 : box.min.y;
    const h = biped ? rig.height : Math.max(0.5, box.max.y - box.min.y);
    const y0 = base + h * (spec.from ?? 0.42);
    const y1 = base + h * (spec.to ?? 1.07);
    const span = y1 - y0;
    const cx = biped ? 0 : (box.min.x + box.max.x) / 2;
    const cz = biped ? 0 : (box.min.z + box.max.z) / 2;
    const width = biped ? h * 0.42 : Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitH = span / 2 / Math.tan(fov / 2);
    const fitW = (width * 0.62) / Math.tan(fov / 2) / this.camera.aspect;
    const dist = Math.max(fitH, fitW) * 1.05 * (spec.pad ?? 1);
    const midY = (y0 + y1) / 2;
    this.camera.position.set(cx - (spec.shift ?? 0) * span, midY - span * 0.08, cz + dist);
    this.camera.lookAt(cx - (spec.shift ?? 0) * span, midY, cz);
    this.camera.updateProjectionMatrix();
    this.backdrop.position.set(cx, midY, cz);
    const k = Math.max(1, h / 2.2);
    this.smoke[0]!.position.set(cx, y0 + span * 0.15, cz - Math.max(1.2, width * 0.8));
    this.smoke[1]!.position.set(cx, y0 - span * 0.12, cz + Math.max(0.9, width * 0.6));
    this.smoke.forEach((m) => {
      m.scale.setScalar(k);
      m.lookAt(this.camera.position.x, m.position.y, this.camera.position.z);
    });
    this.under.position.set(cx + span * 0.12, y0 + span * 0.02, cz + span * 0.75);
    this.embers.position.set(cx, box.min.y, cz);
    this.embers.scale.setScalar(Math.max(1, h / 2.2));

    this.pipeline.render();
    const out = document.createElement('canvas');
    out.width = PORTRAIT_W;
    out.height = PORTRAIT_H;
    out.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0);
    this.scene.remove(rig.root);
    disposeTree(rig.root);
    return out;
  }

  dispose(): void {
    this.pipeline.dispose();
    this.renderer.dispose();
    this.scene.environment?.dispose();
  }
}
