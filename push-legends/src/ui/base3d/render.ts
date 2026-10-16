import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Shared post-processing chain for the 3D views: an HDR multisampled render (so edges stay
 * anti-aliased), ground-truth ambient occlusion (contact shadows where things meet), bloom for
 * glowing materials, a filmic colour grade (contrast, warm highlights / cool shadows, vignette)
 * and the tone-mapping output pass.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1.12 },
    uVignette: { value: 0.28 },
    uContrast: { value: 1.06 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSaturation; uniform float uVignette; uniform float uContrast; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(vec3(0.0), mix(vec3(l), c.rgb, uSaturation));
      // Split toning: cool shadows, warm highlights; gentle contrast around mid grey (still linear HDR)
      float k = smoothstep(0.02, 0.8, l);
      c.rgb *= mix(vec3(0.93, 0.97, 1.06), vec3(1.05, 1.0, 0.94), k);
      c.rgb = max(vec3(0.0), (c.rgb - 0.18) * uContrast + 0.18);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.75, dot(d, d) * 2.2);
      gl_FragColor = c;
    }`,
};

export interface Pipeline {
  render(): void;
  setSize(w: number, h: number, pixelRatio: number): void;
  dispose(): void;
}

export function createPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: {
    msaa: boolean;
    bloom?: { strength: number; radius: number; threshold: number };
    saturation?: number;
    vignette?: number;
    contrast?: number;
    /** Ambient occlusion radius in world units (null = off, e.g. the 256 px pixel mode). */
    ao?: { radius: number; intensity: number } | null;
  },
): Pipeline {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: opts.msaa ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let ao: GTAOPass | null = null;
  if (opts.ao) {
    ao = new GTAOPass(scene, camera, 256, 256);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = opts.ao.intensity;
    ao.updateGtaoMaterial({ radius: opts.ao.radius, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(ao);
  }
  const b = opts.bloom ?? { strength: 0.5, radius: 0.45, threshold: 2.3 };
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold));
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uSaturation!.value = opts.saturation ?? 1.12;
  grade.uniforms.uVignette!.value = opts.vignette ?? 0.28;
  grade.uniforms.uContrast!.value = opts.contrast ?? 1.06;
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize: (w, h, pr) => {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      // AO at (at most) native resolution: it is soft anyway and expensive on phones
      ao?.setSize(Math.round(w * Math.min(pr, 1)), Math.round(h * Math.min(pr, 1)));
    },
    dispose: () => {
      ao?.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}

/** Darkens vertex colours near the ground (cheap ambient occlusion for buildings and props). */
export function bakeGroundAO(mesh: THREE.Mesh, height: number, strength = 0.28): void {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  const col = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!pos || !col) return;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, pos.getY(i) / height));
    const f = 1 - strength * (1 - k) * (1 - k);
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  col.needsUpdate = true;
}

/**
 * Outdoor image-based lighting: a sky dome (zenith, horizon, ground bounce) with a bright sun
 * disc, pre-filtered so metal and glossy surfaces reflect the sky and shadows are never black.
 */
export function skyEnvironment(renderer: THREE.WebGLRenderer, top: string, horizon: string, ground: string, sunDir: THREE.Vector3): THREE.Texture {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(top) },
        uHorizon: { value: new THREE.Color(horizon) },
        uGround: { value: new THREE.Color(ground) },
        uSun: { value: sunDir.clone().normalize() },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSun; varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 sky = mix(uHorizon, uTop, smoothstep(0.0, 0.6, y));
          vec3 col = y > 0.0 ? sky : mix(uHorizon * 0.8, uGround, smoothstep(0.0, 0.25, -y));
          float s = max(dot(normalize(vDir), uSun), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 40.0 + pow(s, 12.0) * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  scene.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  dome.geometry.dispose();
  (dome.material as THREE.Material).dispose();
  return rt.texture;
}
