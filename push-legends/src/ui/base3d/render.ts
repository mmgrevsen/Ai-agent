import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Shared post-processing chain for the 3D views: an HDR multisampled render (so edges stay
 * anti-aliased), bloom for glowing materials, a light colour grade (vibrance + vignette) and the
 * tone-mapping output pass.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1.12 },
    uVignette: { value: 0.28 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSaturation; uniform float uVignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(vec3(0.0), mix(vec3(l), c.rgb, uSaturation));
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
  opts: { msaa: boolean; bloom?: { strength: number; radius: number; threshold: number }; saturation?: number; vignette?: number },
): Pipeline {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: opts.msaa ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const b = opts.bloom ?? { strength: 0.5, radius: 0.45, threshold: 2.3 };
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold));
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uSaturation!.value = opts.saturation ?? 1.12;
  grade.uniforms.uVignette!.value = opts.vignette ?? 0.28;
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize: (w, h, pr) => {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    },
    dispose: () => {
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
