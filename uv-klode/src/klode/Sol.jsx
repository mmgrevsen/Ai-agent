/**
 * Den animerede sol ved siden af kloden.
 *
 * Solen placeres i den retning, hvor solen faktisk står: ud fra solpunktet
 * (det sted på jorden, hvor solen står lodret). Derfor peger solen altid mod
 * dagsiden, og dag/nat-grænsen på kloden vender altid væk fra den. Flytter man
 * tidsskyderen, "kredser" solen rundt om kloden.
 *
 * Overfladen er lavet med en shader, der laver bevægelig plasma-struktur
 * (fBm-støj: flere lag af støj lagt oven på hinanden). Det er pynt – det er
 * ikke en fysisk model af Solen.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { solpunkt } from '../model/sol.js';
import { latLonTilVektor } from './geo.js';

/** Solens radius (skaleres ned i useFrame) og hvor langt gløden rækker ud, målt i solradier. */
export const SOL_RADIUS = 1;
export const KORONA_SKALA = 2.6;

// Fælles støjfunktioner (simplex-agtig værdistøj) brugt af både overflade og korona
const STOEJ = /* glsl */ `
  // Pseudotilfældigt tal ud fra et punkt i rummet
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  // Blød støj: tilfældige værdier i et gitter, jævnet ud imellem gitterpunkterne
  float stoej(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f); // blød overgang
    return mix(
      mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  // fBm: læg flere lag støj sammen – hvert lag dobbelt så fint og halvt så kraftigt.
  // Flere lag = finere detaljer, men også mere arbejde for grafikkortet.
  float fbm(vec3 p, int lag) {
    float sum = 0.0;
    float vaegt = 0.5;
    for (int i = 0; i < 5; i++) {
      if (i >= lag) break;
      sum += vaegt * stoej(p);
      p *= 2.02;
      vaegt *= 0.5;
    }
    return sum;
  }
`;

const solVertex = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = normalize(position);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const solFragment = /* glsl */ `
  uniform float uTid;
  varying vec3 vPos;
  varying vec3 vNormal;
  ${STOEJ}

  void main() {
    // To lag støj, der driver hver sin vej – det giver den boblende overflade
    vec3 p = vPos * 3.2;
    float langsom = fbm(p + vec3(0.0, uTid * 0.05, 0.0), 4);
    float hurtig = fbm(p * 2.6 - vec3(uTid * 0.09, 0.0, uTid * 0.05), 4);
    float varme = clamp(langsom * 0.75 + hurtig * 0.45, 0.0, 1.0);

    // Granulation: mørkere "celler" mellem de varme områder, som på Solens overflade
    float celler = smoothstep(0.35, 0.75, fbm(p * 5.5 + uTid * 0.12, 3));
    varme = clamp(varme * 0.85 + celler * 0.25, 0.0, 1.0);

    // Farveskala: mørk rødorange → orange → gul → næsten hvid i de varmeste områder
    vec3 farve = mix(vec3(0.75, 0.16, 0.02), vec3(1.0, 0.55, 0.05), smoothstep(0.15, 0.55, varme));
    farve = mix(farve, vec3(1.0, 0.85, 0.35), smoothstep(0.5, 0.8, varme));
    farve = mix(farve, vec3(1.0, 0.98, 0.9), smoothstep(0.78, 1.0, varme));

    // Randformørkning: Solen ser mørkere ud ude ved kanten end i midten
    float midte = max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
    farve *= 0.55 + 0.45 * pow(midte, 0.45);

    // Lysende kant hele vejen rundt
    farve += vec3(1.0, 0.6, 0.2) * pow(1.0 - midte, 3.5) * 0.9;

    gl_FragColor = vec4(farve, 1.0);
    #include <colorspace_fragment>
  }
`;

const koronaVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Koronaen tegnes på en firkant, der altid vender mod kameraet. Gløden er stærkest
// lige uden for solranden og bliver svagere udad – som når man ser mod solen.
const koronaFragment = /* glsl */ `
  uniform float uTid;
  varying vec2 vUv;
  ${STOEJ}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);            // 0 i midten, 1 ude ved kanten
    if (d > 1.0) discard;

    // Solranden ligger ved d = SOLRAND. t går fra 0 ved randen til 1 yderst.
    float t = max(d - SOLRAND, 0.0) / (1.0 - SOLRAND);

    // Stråler/flammetunger: støj, der afhænger af vinklen og langsomt ændrer sig
    float vinkel = atan(p.y, p.x);
    float straaler = fbm(vec3(cos(vinkel) * 2.0, sin(vinkel) * 2.0, uTid * 0.3), 2);

    float gloed = exp(-t * 3.0) * (0.45 + 0.95 * straaler);
    gloed *= smoothstep(1.0, 0.75, d);                 // falder helt ud mod kanten
    gloed += exp(-t * 14.0) * 0.55;                    // skarp lys kant helt tæt på solen

    vec3 farve = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.88, 0.5), exp(-t * 6.0));
    vec3 lys = farve * gloed;
    // Alpha sættes til lysstyrken, så den gennemsigtige baggrund ikke bliver mørkere
    gl_FragColor = vec4(lys, clamp(dot(lys, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0));
  }
`.replaceAll('SOLRAND', (1 / KORONA_SKALA).toFixed(4)); // alle steder, ikke kun det første

export default function Sol({ dato, synlig = true }) {
  const gruppe = useRef();
  const overflade = useRef();
  const koronaRef = useRef();

  const materialer = useMemo(() => {
    const u = { uTid: { value: 0 } };
    return {
      uniforms: u,
      flade: new THREE.ShaderMaterial({ uniforms: u, vertexShader: solVertex, fragmentShader: solFragment }),
      korona: new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: koronaVertex,
        fragmentShader: koronaFragment,
        side: THREE.DoubleSide,
        // Ægte additiv blanding: farven lægges direkte oven i baggrunden (ikke ganget med alpha)
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneFactor,
        transparent: true,
        depthWrite: false,
      }),
    };
  }, []);

  // Solens retning fra klodens midte = retningen mod solpunktet (opdateres når datoen skifter)
  const retning = useMemo(() => {
    const { bredde, laengde } = solpunkt(dato);
    return latLonTilVektor(bredde, laengde, 1);
  }, [dato]);

  const frem = useMemo(() => new THREE.Vector3(), []);
  const side = useMemo(() => new THREE.Vector3(), []);
  const hoejre = useMemo(() => new THREE.Vector3(), []);
  const op = useMemo(() => new THREE.Vector3(), []);

  /**
   * Hver frame placeres solen ved siden af kloden – i den retning, solen faktisk står,
   * set fra kameraet. Så er solen med i billedet, og man kan se, at dag/nat-grænsen
   * altid vender væk fra den. Afstanden ud fra midten vælges, så solen lige netop
   * bliver inden for billedets kant, uanset om vinduet er bredt eller højt.
   */
  useFrame(({ camera, size }, delta) => {
    materialer.uniforms.uTid.value += delta;
    if (overflade.current) overflade.current.rotation.y += delta * 0.03; // langsom rotation
    if (koronaRef.current) koronaRef.current.quaternion.copy(camera.quaternion); // gløden vender altid mod kameraet
    if (!gruppe.current) return;

    camera.getWorldDirection(frem); // fra kameraet ind mod kloden
    const dybde = retning.dot(frem);
    side.copy(retning).addScaledVector(frem, -dybde); // den del, man kan se på skærmen
    if (side.lengthSq() < 1e-6) side.copy(camera.up); // solen peger lige mod eller lige væk fra kameraet
    side.normalize();

    // Kameraets egne akser: til højre og opad på skærmen
    hoejre.setFromMatrixColumn(camera.matrixWorld, 0);
    op.setFromMatrixColumn(camera.matrixWorld, 1);

    // Hvor stort et område kan man se i klodens afstand?
    const afstand = camera.position.length();
    const halvHoejde = afstand * Math.tan(((camera.fov / 2) * Math.PI) / 180);
    const halvBredde = halvHoejde * (size.width / size.height);

    // Find den afstand ud ad "side"-retningen, hvor solen lige netop er inden for kanten
    const x = Math.abs(side.dot(hoejre));
    const y = Math.abs(side.dot(op));
    const kant = Math.min(x > 1e-4 ? (halvBredde * 0.97) / x : Infinity, y > 1e-4 ? (halvHoejde * 0.97) / y : Infinity);

    // Solen med glød skal kunne være mellem klodens kant (radius 1) og billedets kant:
    //   (1,05 + skala) + skala·KORONA_SKALA ≤ kant   ⇒   skala ≤ (kant − 1,05) / (1 + KORONA_SKALA)
    const skala = Math.min(0.3, Math.max(0.07, (kant - 1.05) / (1 + KORONA_SKALA)));
    const ud = Math.min(Math.max(kant - skala * KORONA_SKALA, 1.05 + skala), 3.4);

    gruppe.current.position.copy(side).multiplyScalar(ud).addScaledVector(frem, dybde * 0.45);
    gruppe.current.scale.setScalar(skala);
  });

  if (!synlig) return null;
  return (
    <group ref={gruppe}>
      <mesh ref={overflade} material={materialer.flade}>
        <sphereGeometry args={[SOL_RADIUS, 48, 32]} />
      </mesh>
      <mesh ref={koronaRef} material={materialer.korona} renderOrder={-1}>
        <planeGeometry args={[2 * SOL_RADIUS * KORONA_SKALA, 2 * SOL_RADIUS * KORONA_SKALA]} />
      </mesh>
    </group>
  );
}
