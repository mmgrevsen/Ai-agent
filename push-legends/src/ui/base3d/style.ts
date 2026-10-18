import * as THREE from 'three';

/**
 * Shared rendering style for the battle and the base: physically based materials with procedural
 * surface detail, optional ink outlines and glow colours that drive the bloom pass.
 */

let gradient: THREE.DataTexture | null = null;

/** Light ramp kept for the few flat effect materials that still use it. */
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

/**
 * Physically based surface for the vertex-coloured models. A world-space noise adds what flat
 * colours lack: large patches of colour variation, fine grain and a bump on the normals (so stone,
 * cloth, wood and grass catch the light unevenly), and vertices marked as metal (`aMetal`, set by
 * the Kit from the colour palette) become shiny metal that reflects the sky.
 */
export function realMaterial(opts: { grain?: number; bump?: number; roughness?: number; scale?: number; ornate?: number } = {}): THREE.MeshStandardMaterial {
  const grain = opts.grain ?? 1;
  // Engraved filigree on armour metal (characters): flowing inlaid lines, faded out where too fine
  const ornate = opts.ornate ?? 0;
  const bump = opts.bump ?? 1;
  const scale = opts.scale ?? 1;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.9, metalness: 0 });
  const f = (n: number) => n.toFixed(4);
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute float aMetal;
varying vec3 vWPos;
varying float vMetal;
void main() {`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vMetal = aMetal;
        vec4 wpN = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpN = instanceMatrix * wpN;
        #endif
        vWPos = (modelMatrix * wpN).xyz * ${f(scale)};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec3 vWPos;
varying float vMetal;
float plH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float plN(vec3 x) {
  vec3 i = floor(x); vec3 u = fract(x); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(mix(plH(i), plH(i + vec3(1, 0, 0)), u.x), mix(plH(i + vec3(0, 1, 0)), plH(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(plH(i + vec3(0, 0, 1)), plH(i + vec3(1, 0, 1)), u.x), mix(plH(i + vec3(0, 1, 1)), plH(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
// Band-limited fbm: octaves finer than about two pixels fade out (fw = noise cells per pixel), so
// distant surfaces stay smooth instead of shimmering
float plF(vec3 p, float fw) {
  float a = 0.5; float s = 0.0; float f = 1.0;
  for (int i = 0; i < 4; i++) { s += a * (plN(p) - 0.5) * (1.0 - smoothstep(0.15, 0.45, f * fw)); p *= 2.03; f *= 2.03; a *= 0.5; }
  return 0.5 + s;
}
void main() {`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float plPx = length(fwidth(vWPos));
        float plLarge = plF(vWPos * 0.16, plPx * 0.16);
        float plFine = 0.5 + (plN(vWPos * 2.5) - 0.5) * (1.0 - smoothstep(0.15, 0.45, plPx * 2.5));
        float plMetal = clamp(vMetal, 0.0, 1.0);
        float plHue = plF(vWPos * 0.05 + 7.3, plPx * 0.05);
        float plAmt = ${f(grain)} * (1.0 - 0.6 * plMetal);
        diffuseColor.rgb *= mix(1.0, (0.85 + 0.3 * plLarge) * (0.93 + 0.14 * plFine), plAmt);
        // Warm / cool drift over larger areas (sun-bleached and damp patches)
        diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(1.07, 1.0, 0.82), vec3(0.92, 1.0, 1.07), smoothstep(0.3, 0.7, plHue)), plAmt * 0.8);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Metal: fine scratches along one direction catch the light; duller metal (lower level) is rougher
        float plScr = smoothstep(0.8, 0.9, plN(vWPos * vec3(3.0, 26.0, 3.0) + 3.7)) * (1.0 - smoothstep(0.15, 0.45, plPx * 26.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5 + 0.05, plScr * plMetal * 0.7);
        roughnessFactor = mix(roughnessFactor * (0.88 + 0.24 * plLarge), mix(0.62, 0.3, plMetal) + 0.22 * plFine - plScr * 0.15, step(0.01, plMetal));
        ${ornate > 0 ? `{
          // Contour lines of a smooth field read as engraved, inlaid scrollwork
          float fn = (plN(vWPos * 4.0 + 11.0) + 0.5 * plN(vWPos * 9.0 + 3.0)) * 3.0;
          float fw = fwidth(fn) + 1e-4;
          float line = (1.0 - smoothstep(0.012, 0.012 + 1.2 * fw, abs(fract(fn) - 0.5))) * (1.0 - smoothstep(0.08, 0.2, fw));
          float inl = line * smoothstep(0.5, 0.62, plMetal) * ${f(ornate)};
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.48, 0.25), inl * 0.75);
          roughnessFactor = mix(roughnessFactor, 0.25, inl);
        }` : ''}`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.9, plMetal);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float hb = plF(vWPos * 1.1, plPx * 1.1) * (1.0 - 0.7 * plMetal);
          vec3 dpx = dFdx(-vViewPosition);
          vec3 dpy = dFdy(-vViewPosition);
          float dhx = dFdx(hb);
          float dhy = dFdy(hb);
          vec3 r1 = cross(dpy, normal);
          vec3 r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad * ${f(1.6 * bump)});
        }`,
      );
  };
  m.customProgramCacheKey = () => `real${grain}|${bump}|${scale}|${ornate}`;
  return m;
}

/** Kept name: every former cel-shaded material is now the physically based surface. */
export function toonMaterial(_rim = 0.5): THREE.MeshStandardMaterial {
  return realMaterial();
}

/** Cartoon ink outlines (off: the game uses the realistic look). */
export const OUTLINES = false;

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
  // The realistic look has no ink lines; the helper stays for an optional stylised mode.
  if (!OUTLINES) return;
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
