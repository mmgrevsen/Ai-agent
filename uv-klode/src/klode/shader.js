/**
 * Shader til kloden. Den beregner UV-indekset for HVER pixel på grafikkortet
 * med præcis samme formler som src/model (NOAA + Madronich), så farvelaget
 * opdateres glidende, når man trækker i skyderne.
 *
 * Fra JavaScript sendes kun de størrelser, der er ens for hele kloden:
 * solens deklination, tidsligningen, klokkeslættet (UTC), ozon og skydække.
 * Hver pixel regner selv sin bredde/længde, timevinkel, solhøjde og UV-indeks.
 */
import { WHO_KATEGORIER } from '../model/uv.js';

export const vertexShader = /* glsl */ `
  varying vec3 vPos;      // punkt på enhedskuglen (bruges til bredde/længde)
  varying vec3 vNormal;   // normal i kamerakoordinater (til let skygge)
  varying vec2 vUv;       // teksturkoordinat
  void main() {
    vPos = normalize(position);
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// WHO-farverne lægges ind som konstanter i shaderen
const glslFarve = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  // sRGB → lineær, fordi three.js arbejder i lineært farverum
  const lin = (c) => Math.pow(c / 255, 2.2).toFixed(4);
  return `vec3(${lin((n >> 16) & 255)}, ${lin((n >> 8) & 255)}, ${lin(n & 255)})`;
};
const [GROEN, GUL, ORANGE, ROED, VIOLET] = WHO_KATEGORIER.map((k) => glslFarve(k.farve));

export const fragmentShader = /* glsl */ `
  uniform sampler2D uGrund;      // hav/land
  uniform sampler2D uMelanom;    // melanom-kort
  uniform float uDeklination;    // radianer
  uniform float uTidsligning;    // minutter
  uniform float uUtcMinutter;    // minutter efter midnat UTC
  uniform float uOzon;           // Dobson-enheder
  uniform float uSkyFaktor;      // 0,3–1 (beregnet i JS med skyFaktor())
  uniform float uTilstand;       // 0 = UV-indeks, 1 = modermærkekræft
  uniform float uLagStyrke;      // hvor kraftigt farvelaget dækker (0–1)

  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  const float PI = 3.14159265359;

  // Bløde overgange mellem WHO-farverne (kun ca. én pixel bred, så kanterne ikke "trapper")
  vec3 whoFarve(float uv) {
    float w = max(fwidth(uv), 0.02);
    vec3 f = ${GROEN};
    f = mix(f, ${GUL},    smoothstep(2.5 - w, 2.5 + w, uv));
    f = mix(f, ${ORANGE}, smoothstep(5.5 - w, 5.5 + w, uv));
    f = mix(f, ${ROED},   smoothstep(7.5 - w, 7.5 + w, uv));
    f = mix(f, ${VIOLET}, smoothstep(10.5 - w, 10.5 + w, uv));
    return f;
  }

  void main() {
    // Bredde (φ) og længde (λ) for denne pixel
    float phi = asin(clamp(vPos.y, -1.0, 1.0));
    float lam = atan(-vPos.z, vPos.x);

    // Timevinkel (NOAA): sand soltid = UTC + tidsligning + 4·længdegrad (minutter)
    float H = ((uUtcMinutter + uTidsligning + 4.0 * degrees(lam)) / 4.0 - 180.0) * PI / 180.0;

    // sin(solhøjde) = cos(zenitvinkel)
    float sinH = sin(phi) * sin(uDeklination) + cos(phi) * cos(uDeklination) * cos(H);

    // Madronich: UVI = 12,5 · cos(θ)^2,42 · (ozon/300)^-1,23 – og 0 når solen er nede
    float uvi = sinH > 0.0 ? 12.5 * pow(sinH, 2.42) * pow(uOzon / 300.0, -1.23) * uSkyFaktor : 0.0;

    vec3 grund = texture2D(uGrund, vUv).rgb;
    // Let skygge mod kanten af kloden, så den ser rund ud
    float lys = 0.72 + 0.28 * max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);

    vec3 farve;
    if (uTilstand < 0.5) {
      // Dag/nat: blød overgang i tusmørket (solen lidt under horisonten)
      float dag = smoothstep(-0.10, 0.03, sinH);
      vec3 nat = grund * 0.22 + vec3(0.0, 0.01, 0.03);
      farve = mix(nat, grund, dag);
      // UV-farvelaget vises kun på dagsiden (om natten er UV = 0)
      float synlig = uLagStyrke * smoothstep(-0.005, 0.02, sinH);
      farve = mix(farve, whoFarve(uvi), synlig);
      // Terminatoren: tynd lys linje, hvor solen står præcis i horisonten
      float linje = 1.0 - smoothstep(0.0, fwidth(sinH) * 1.5, abs(sinH));
      farve = mix(farve, vec3(1.0, 0.85, 0.4), linje * 0.9);
    } else {
      // Melanom-kort: landefarve hvor der er land, ellers grundkortet
      vec4 m = texture2D(uMelanom, vUv);
      farve = mix(grund, m.rgb, m.a * 0.92);
    }

    gl_FragColor = vec4(farve * lys, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Atmosfære: en svag blå glorie rundt om kloden (ren pynt). */
export const atmosfaereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const atmosfaereFragment = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    float i = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    gl_FragColor = vec4(0.35, 0.6, 1.0, 1.0) * clamp(i, 0.0, 1.0);
  }
`;
