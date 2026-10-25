import * as THREE from 'three';
import { realMaterial } from '../../base3d/style';
import type { ArenaLook } from './look';

/**
 * Materials of the courtyard arena. One stone material serves every static part; a per-vertex
 * `aKind` picks the surface: 0 plain stone / cloth / metal, 1 masonry walls (block courses drawn
 * in the shader, so walls stay a handful of triangles), 2 paving (worn, with thin gold veins).
 * Snow, moss and the gold veins are world-space shader effects, faded out where they would be
 * finer than a pixel so the view never shimmers.
 */
export const KIND_PLAIN = 0;
export const KIND_WALL = 1;
export const KIND_PAVE = 2;

const f = (n: number) => n.toFixed(4);
const vec3 = (hex: string) => {
  const c = new THREE.Color(hex);
  return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;
};

export function stoneMaterial(look: ArenaLook, key: string): THREE.MeshStandardMaterial {
  const bump = 0.6;
  const m = realMaterial({ grain: 1.0, bump, roughness: 0.9 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    base.call(m, shader, renderer);
    // Paving is smoother than the rough wall stone (the bump would read as noise in low sun)
    shader.fragmentShader = shader.fragmentShader.replace(`grad * ${f(1.6 * bump)}`, `grad * ${f(1.6 * bump)} * (vKind > 1.5 ? 0.3 : vKind > 0.5 ? 0.4 : 1.0)`);
    shader.vertexShader =
      'attribute float aKind;\nvarying float vKind;\nvarying vec3 vWN;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vKind = aKind;
        vWN = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader =
      'varying float vKind;\nvarying vec3 vWN;\n' +
      shader.fragmentShader
        .replace(
          '#include <roughnessmap_fragment>',
          `float arVein = 0.0;
        float arSnow = 0.0;
        vec3 arN = normalize(vWN);
        float arWall = step(0.5, vKind) * (1.0 - step(1.5, vKind));
        float arPave = step(1.5, vKind);
        // Masonry: staggered block courses with mortar joints and a tint per block
        if (arWall > 0.5 && abs(arN.y) < 0.6) {
          float u = abs(arN.x) > abs(arN.z) ? vWPos.z : vWPos.x;
          float v = vWPos.y / 0.62;
          float row = floor(v);
          float uu = u / 1.3 + row * 0.5;
          float wu = fwidth(uu);
          float wv = fwidth(v);
          float fade = 1.0 - smoothstep(0.12, 0.35, max(wu, wv));
          float fu = fract(uu);
          float fv = fract(v);
          float ju = 1.0 - smoothstep(0.0, 0.03 + wu, min(fu, 1.0 - fu));
          float jv = 1.0 - smoothstep(0.0, 0.05 + wv, min(fv, 1.0 - fv));
          float block = plH(vec3(floor(uu), row, 3.7));
          diffuseColor.rgb *= mix(1.0, (0.84 + 0.3 * block) * (1.0 - 0.6 * max(ju, jv)), fade);
        }
        // Paving: thin gold-filled veins (cracks mended with gold) in scattered patches
        if (arPave > 0.5) {
          float vn = plN(vWPos * vec3(0.7, 0.0, 0.7) + vec3(0.0, 2.0, 0.0)) + 0.5 * plN(vWPos * vec3(1.9, 0.0, 1.9) + vec3(5.0, 1.0, 2.0));
          float vw = fwidth(vn) + 1e-4;
          float vPatch = smoothstep(0.6, 0.75, plN(vWPos * vec3(0.11, 0.0, 0.11) + vec3(9.0, 4.0, 1.0)));
          arVein = (1.0 - smoothstep(0.0, 0.018 + vw, abs(vn - 0.78))) * vPatch * (1.0 - smoothstep(0.05, 0.2, vw)) * ${f(look.veins)};
          // Worn, darker joints-side grime in large patches
          diffuseColor.rgb *= 0.92 + 0.12 * plF(vWPos * 0.3 + 2.0, plPx * 0.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, ${vec3(look.gold)}, arVein * 0.75);
        }
        ${look.moss > 0 ? `{
          float mo = smoothstep(0.5, 0.72, plF(vWPos * 0.42 + 4.0, plPx * 0.42)) * ${f(look.moss)} * (0.55 + 0.45 * max(arN.y, 0.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.25, 0.16), mo * 0.55);
        }` : ''}
        ${look.snow > 0 ? `{
          float sn = plF(vWPos * 0.32 + 1.0, plPx * 0.32);
          float up = smoothstep(0.5, 0.85, arN.y);
          // The lane is trampled: lighter snow down the middle (scene x is across the lane)
          float lane = mix(0.45, 1.0, smoothstep(3.5, 7.5, abs(vWPos.x)));
          arSnow = up * smoothstep(0.62 - ${f(look.snow)} * 0.35, 0.72 - ${f(look.snow)} * 0.3, sn) * lane * ${f(look.snow)};
          arSnow = max(arSnow, up * step(0.5, vKind) * (1.0 - arPave) * ${f(look.snow)} * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.97), arSnow);
          arVein *= 1.0 - arSnow;
        }` : ''}
        #include <roughnessmap_fragment>`,
        )
        .replace(
          '#include <normal_fragment_begin>',
          `roughnessFactor = mix(roughnessFactor, 0.32, arVein);
        metalnessFactor = mix(metalnessFactor, 0.85, arVein);
        roughnessFactor = mix(roughnessFactor, 0.55, arSnow);
        #include <normal_fragment_begin>`,
        );
  };
  m.customProgramCacheKey = () => `arena|${key}`;
  m.side = THREE.FrontSide;
  m.userData.shared = false;
  return m;
}

/**
 * Additive flame material for all brazier flames merged into one mesh. Each vertex knows its
 * flame's base (`aBase`), height (`aTip`) and seed, so every flame flickers on its own in the
 * vertex shader. Colours are HDR so the bloom pass makes the fire glow.
 */
export function fireMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aBase;
      attribute float aTip;
      attribute float aSeed;
      attribute vec3 aCol;
      uniform float uTime;
      varying vec3 vCol;
      varying float vH;
      void main() {
        vec3 p = position - aBase;
        float s = aSeed * 6.2831;
        float h = clamp(p.y / aTip, 0.0, 1.0);
        float fl = 0.82 + 0.2 * sin(uTime * 11.0 + s) + 0.1 * sin(uTime * 27.0 + s * 1.7);
        p.y *= fl;
        p.xz *= 0.92 + 0.12 * sin(uTime * 8.0 + s * 2.3);
        p.x += sin(uTime * 6.0 + s + h * 3.0) * 0.14 * h * aTip;
        p.z += cos(uTime * 5.3 + s * 1.3 + h * 2.5) * 0.14 * h * aTip;
        vCol = aCol;
        vH = h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(aBase + p, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vCol;
      varying float vH;
      void main() {
        gl_FragColor = vec4(vCol * (1.0 - smoothstep(0.35, 1.0, vH) * 0.85), 1.0);
      }`,
  });
}

let poolTex: THREE.Texture | null = null;

/** Soft radial gradient used for the warm light pools under the braziers. */
export function poolTexture(): THREE.Texture {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  poolTex = new THREE.CanvasTexture(c);
  return poolTex;
}
