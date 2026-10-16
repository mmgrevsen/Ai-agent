import * as THREE from 'three';

/**
 * Shared stylised rendering: cel ("toon") shading with a soft rim light, ink outlines and glow
 * colours that drive the bloom pass. Used by the battle and the base.
 */

let gradient: THREE.DataTexture | null = null;

/** Four-step light ramp: deep shadow, shadow, lit, highlight. */
export function toonRamp(): THREE.DataTexture {
  if (gradient) return gradient;
  const steps = [92, 160, 222, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/** Adds a view-dependent rim light to a toon material (bright edge facing away from the camera). */
function withRim(m: THREE.MeshToonMaterial, strength: number): THREE.MeshToonMaterial {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uRim;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `float rimK = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
        outgoingLight += diffuseColor.rgb * smoothstep(0.55, 1.0, rimK) * uRim;
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `rim${strength}`;
  return m;
}

/** Vertex-coloured cel material with rim light. */
export function toonMaterial(rim = 0.55): THREE.MeshToonMaterial {
  return withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }), rim);
}

const outlineCache = new Map<string, THREE.MeshBasicMaterial>();

/** Inverted-hull outline material: back faces pushed out along the normals. Shared per thickness. */
export function outlineMaterial(thickness: number, color = '#1b1230'): THREE.MeshBasicMaterial {
  const key = `${thickness}|${color}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uOutline;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline;');
  };
  m.customProgramCacheKey = () => `outline${thickness}`;
  m.userData.shared = true;
  outlineCache.set(key, m);
  return m;
}

/** Adds an outline hull to every mesh in `root` whose material passes `filter`. */
export function addOutlines(root: THREE.Object3D, thickness: number, filter: (m: THREE.Mesh) => boolean): void {
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.outline && filter(m)) targets.push(m);
  });
  const mat = outlineMaterial(thickness);
  for (const m of targets) {
    const hull = new THREE.Mesh(m.geometry, mat);
    hull.userData.outline = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    m.add(hull);
  }
}

/** Bright (HDR) colour so a surface crosses the bloom threshold whatever its hue. */
export function glowColor(hex: string, lum = 4): THREE.Color {
  const c = new THREE.Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.multiplyScalar(Math.max(1.5, lum / Math.max(0.02, l)));
}

const glowCache = new Map<string, THREE.MeshBasicMaterial>();

/** Unlit glowing material (eyes, orbs, lava, magic). Shared per colour. */
export function glowMaterial(hex: string, lum = 4): THREE.MeshBasicMaterial {
  const key = `${hex}|${lum}`;
  const hit = glowCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color: glowColor(hex, lum) });
  m.userData.shared = true;
  m.userData.glow = true;
  glowCache.set(key, m);
  return m;
}
