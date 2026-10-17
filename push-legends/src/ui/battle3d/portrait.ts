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
  private readonly rim: THREE.DirectionalLight;
  private readonly rim2: THREE.PointLight;
  private readonly embers: THREE.Points;
  private readonly fog: THREE.Mesh;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PORTRAIT_W, PORTRAIT_H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const sunDir = new THREE.Vector3(-0.6, 0.8, 0.7).normalize();
    this.scene.environment = skyEnvironment(this.renderer, '#4a4e58', '#6a5a52', '#1a1614', sunDir);
    this.scene.environmentIntensity = 0.6;

    // Backdrop: a curved gradient wall the fog and rim light play against
    this.backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(40, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() } },
        vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow; varying vec3 vP;
          float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main() {
            float y = vP.y * 0.5 + 0.5;
            vec3 c = mix(uBottom, uTop, smoothstep(0.35, 0.75, y));
            // A low glow behind the subject (fire light, magic) and a little grain
            float g = exp(-pow(length(vec2(vP.x * 1.6, vP.y + 0.05)) * 2.2, 2.0));
            c += uGlow * g * 0.55;
            // Muted: the tone mapper's dark toe would otherwise leave only the strongest channel
            c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.55) * 1.3;
            c *= 0.92 + 0.08 * h(floor(vP.xy * 400.0));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.scene.add(this.backdrop);

    // Ground: dark scorched stone that catches the shadows and rim light
    const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: '#17151a', roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Lights: warm key from the front-left, faction rim from behind, low cold fill
    const key = new THREE.DirectionalLight('#ffd9b5', 3.6);
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 4;
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 6, bottom: -1, near: 0.5, far: 20 });
    this.scene.add(key, key.target);
    this.rim = new THREE.DirectionalLight('#ffffff', 5.5);
    this.rim.position.set(2.5, 3, -4);
    this.scene.add(this.rim);
    this.rim2 = new THREE.PointLight('#ffffff', 7, 8, 2);
    this.rim2.position.set(-2.2, 1.2, -2.2);
    this.scene.add(this.rim2);
    this.scene.add(new THREE.HemisphereLight('#5a6476', '#1a1310', 0.55));

    // Low fog bank in front of the backdrop
    this.fog = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 3),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color() } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uColor; varying vec2 vUv;
          float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453); float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
            float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453); float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
          void main() {
            float m = n(vUv * vec2(6.0, 2.0)) * 0.6 + n(vUv * vec2(14.0, 5.0)) * 0.4;
            float a = smoothstep(1.0, 0.0, vUv.y) * smoothstep(0.0, 0.25, vUv.y) * m * 0.55;
            gl_FragColor = vec4(uColor, a);
          }`,
      }),
    );
    this.scene.add(this.fog);

    // Embers / ash drifting in the air
    const n = 70;
    const pos = new Float32Array(n * 3);
    let seed = 9;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 5, r() * 3.5, (r() - 0.5) * 3], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: new THREE.Color(PAL.ember).multiplyScalar(3), transparent: true, opacity: 0.85, depthWrite: false }));
    this.scene.add(this.embers);

    this.pipeline = createPipeline(this.renderer, this.scene, this.camera, { msaa: true, bloom: { strength: 0.55, radius: 0.5, threshold: 1.6 }, saturation: 0.95, contrast: 1.12, vignette: 0.55, ao: { radius: 0.35, intensity: 1 } });
    this.pipeline.setSize(PORTRAIT_W, PORTRAIT_H, 1);
  }

  /** Renders the rig and returns a new canvas with the portrait. The rig is disposed afterwards. */
  render(rig: Rig, spec: PortraitSpec = {}, faction: Faction = 'iron'): HTMLCanvasElement {
    const f = FACTIONS[spec.faction ?? faction];
    const mat = this.backdrop.material as THREE.ShaderMaterial;
    mat.uniforms.uTop!.value.set(f.bgTop);
    mat.uniforms.uBottom!.value.set(f.bgBottom);
    mat.uniforms.uGlow!.value.set(f.glow).multiplyScalar(0.16);
    (this.fog.material as THREE.ShaderMaterial).uniforms.uColor!.value.set(f.bgBottom).lerp(new THREE.Color('#8a8078'), 0.25);
    this.rim.color.set(f.rim);
    this.rim2.color.set(f.glow);
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
    const h = Math.max(0.5, box.max.y - box.min.y);
    const y0 = box.min.y + h * (spec.from ?? 0.32);
    const y1 = box.min.y + h * (spec.to ?? 1.06);
    const span = y1 - y0;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitH = span / 2 / Math.tan(fov / 2);
    const fitW = (width * 0.62) / Math.tan(fov / 2) / this.camera.aspect;
    const dist = Math.max(fitH, fitW) * 1.05;
    const midY = (y0 + y1) / 2;
    this.camera.position.set(cx - (spec.shift ?? 0) * span, midY - span * 0.08, cz + dist);
    this.camera.lookAt(cx - (spec.shift ?? 0) * span, midY, cz);
    this.camera.updateProjectionMatrix();
    this.backdrop.position.set(cx, midY, cz);
    this.fog.position.set(cx, box.min.y + h * 0.18, cz - Math.max(1, width * 0.6));
    this.fog.scale.setScalar(Math.max(1, h / 2.2));
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
