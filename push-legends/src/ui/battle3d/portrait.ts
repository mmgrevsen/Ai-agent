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
    this.scene.environment = skyEnvironment(this.renderer, '#30343c', '#3a3238', '#100e10', sunDir);
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
            vec3 c = mix(uBottom, uTop, smoothstep(0.3, 0.8, y));
            // Billowing smoke lit by the accent colour
            float sm = fbm(q * 1.6 + vec2(0.0, fbm(q * 0.8) * 1.5));
            float lit = exp(-pow(length(vec2(vP.x * 1.3, vP.y - 0.02)) * 1.9, 2.0));
            c += uGlow * (0.15 + 1.0 * lit) * smoothstep(0.4, 0.9, sm);
            // A soft light shaft off to one side
            float shaft = exp(-pow((vP.x + 0.42 + 0.05 * sin(vP.y * 9.0 + uSeed)) * 9.0, 2.0)) * smoothstep(-0.4, 0.3, vP.y);
            c += uGlow * shaft * (0.4 + 0.6 * sm) * 0.6;
            c *= 0.9 + 0.1 * h(floor(vP.xy * 500.0));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.scene.add(this.backdrop);

    // Ground: dark wet stone that catches the rim light
    const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: '#141216', roughness: 0.55, metalness: 0.2 }));
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
    this.under = new THREE.PointLight('#ffffff', 1.6, 5, 2);
    this.scene.add(this.under);
    this.scene.add(new THREE.HemisphereLight('#3a4050', '#120d0c', 0.3));

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

    this.pipeline = createPipeline(this.renderer, this.scene, this.camera, { msaa: true, bloom: { strength: 0.7, radius: 0.55, threshold: 1.7 }, saturation: 0.95, contrast: 1.15, vignette: 0.7, ao: { radius: 0.35, intensity: 1 }, paint: true });
    this.pipeline.setSize(PORTRAIT_W, PORTRAIT_H, 1);
  }

  /** Renders the rig and returns a new canvas with the portrait. The rig is disposed afterwards. */
  render(rig: Rig, spec: PortraitSpec = {}, faction: Faction = 'iron'): HTMLCanvasElement {
    const f = FACTIONS[spec.faction ?? faction];
    const seed = [...(spec.faction ?? faction)].reduce((a, c) => a + c.charCodeAt(0), 0) * 0.37;
    const mat = this.backdrop.material as THREE.ShaderMaterial;
    mat.uniforms.uTop!.value.set(f.bgTop);
    mat.uniforms.uBottom!.value.set(f.bgBottom);
    mat.uniforms.uGlow!.value.set(f.glow).multiplyScalar(0.11);
    mat.uniforms.uSeed!.value = seed;
    this.smoke.forEach((m, i) => {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uColor!.value.set(f.glow).multiplyScalar(i ? 0.16 : 0.26).lerp(new THREE.Color('#2a272c'), 0.4);
      u.uSeed!.value = seed + i * 4.1;
      u.uAlpha!.value = i ? 0.45 : 0.4;
    });
    // One rim near-white (steel catches cold light), one in the faction's glow
    this.rimL.color.set(f.rim).lerp(new THREE.Color('#e8eef8'), 0.65);
    this.rimR.color.set(f.glow);
    this.under.color.set(f.glow);
    (this.embers.material as THREE.PointsMaterial).color.set(f.glow).multiplyScalar(3);

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
    const dist = Math.max(fitH, fitW) * 1.05;
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
    this.under.position.set(cx + span * 0.3, y0 + span * 0.05, cz + span * 0.6);
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
