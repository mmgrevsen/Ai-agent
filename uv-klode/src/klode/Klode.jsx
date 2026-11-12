/**
 * 3D-kloden (react-three-fiber). Kun visning – alle tal kommer fra src/model.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { vertexShader, fragmentShader, atmosfaereVertex, atmosfaereFragment } from './shader.js';
import { bygGraenseGeometri, latLonTilVektor, lavGrundTekstur, lavMelanomTekstur, vektorTilLatLon } from './geo.js';
import { solParametre, solpunkt } from '../model/sol.js';
import Sol from './Sol.jsx';
import { skyFaktor } from '../model/uv.js';

/** Musestyring: drej og zoom (ingen panorering). Drejer langsommere, når man er zoomet ind. */
function Styring({ start }) {
  const { camera, gl } = useThree();
  const kontrol = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 1.3;
    c.maxDistance = 7;
    c.zoomSpeed = 0.8;
    return c;
  }, [camera, gl]);

  useEffect(() => {
    camera.position.copy(latLonTilVektor(start.bredde, start.laengde, 4.0));
    camera.lookAt(0, 0, 0);
    kontrol.update();
    return () => kontrol.dispose();
  }, [kontrol, camera, start]);

  useFrame(() => {
    kontrol.rotateSpeed = Math.min(1, (camera.position.length() - 1) * 0.45);
    kontrol.update();
  });
  return null;
}

// Særlige breddekredse: ækvator, vendekredsene og polarcirklerne (aksehældning 23,44°)
const KREDSE = [
  { bredde: 0, farve: '#ffffff', opacitet: 0.55 },
  { bredde: 23.44, farve: '#ffd166', opacitet: 0.45 },
  { bredde: -23.44, farve: '#ffd166', opacitet: 0.45 },
  { bredde: 66.56, farve: '#9ad1ff', opacitet: 0.45 },
  { bredde: -66.56, farve: '#9ad1ff', opacitet: 0.45 },
];

function Breddekredse() {
  const kredse = useMemo(
    () =>
      KREDSE.map((k) => {
        const punkter = [];
        for (let l = -180; l <= 180; l += 2) punkter.push(latLonTilVektor(k.bredde, l, 1.003));
        return { ...k, geometri: new THREE.BufferGeometry().setFromPoints(punkter) };
      }),
    [],
  );
  return kredse.map((k) => (
    <line key={k.bredde} geometry={k.geometri}>
      <lineBasicMaterial color={k.farve} transparent opacity={k.opacitet} />
    </line>
  ));
}

/** Solpunktet: en lille "sol", hvor solen står lodret over jorden. */
function Solpunkt({ dato }) {
  const { bredde, laengde } = solpunkt(dato);
  const pos = latLonTilVektor(bredde, laengde, 1.006);
  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[0.018, 20, 20]} />
        <meshBasicMaterial color="#ffe14d" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.032, 20, 20]} />
        <meshBasicMaterial color="#ffb547" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** En lille markør (prik + ring) på et sted på kloden. */
function Markoer({ bredde, laengde, farve = '#ffffff' }) {
  const pos = useMemo(() => latLonTilVektor(bredde, laengde, 1.004), [bredde, laengde]);
  const ringRef = useRef();
  useEffect(() => {
    ringRef.current.lookAt(pos.clone().multiplyScalar(2));
  }, [pos]);
  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[0.009, 16, 16]} />
        <meshBasicMaterial color={farve} />
      </mesh>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.016, 0.022, 32]} />
        <meshBasicMaterial color={farve} side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function KlodeScene({ dato, ozon, skydaekke, tilstand, lagStyrke, melanomRater, markoerer, onVaelg, onHover, visKredse, visSol }) {
  const grund = useMemo(() => lavGrundTekstur(), []);
  const melanom = useMemo(() => lavMelanomTekstur(melanomRater), [melanomRater]);
  const graenser = useMemo(() => bygGraenseGeometri(), []);

  useEffect(() => () => melanom.dispose(), [melanom]);

  // Materialet oprettes én gang. Vi ændrer kun dets uniforms (tal, der sendes til
  // grafikkortet), når indstillingerne ændres – det er billigt og kræver ingen ny geometri.
  // (Vi laver selv materialet, fordi react-three-fiber kopierer et "uniforms"-prop,
  //  så senere ændringer i det oprindelige objekt ikke ville nå shaderen.)
  const materiale = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uGrund: { value: grund },
          uMelanom: { value: null },
          uDeklination: { value: 0 },
          uTidsligning: { value: 0 },
          uUtcMinutter: { value: 0 },
          uOzon: { value: 300 },
          uSkyFaktor: { value: 1 },
          uTilstand: { value: 0 },
          uLagStyrke: { value: 0.72 },
        },
      }),
    [grund],
  );
  useEffect(() => () => materiale.dispose(), [materiale]);

  const { deklination, tidsligning } = solParametre(dato);
  const u = materiale.uniforms;
  u.uDeklination.value = (deklination * Math.PI) / 180;
  u.uTidsligning.value = tidsligning;
  u.uUtcMinutter.value = dato.getUTCHours() * 60 + dato.getUTCMinutes();
  u.uOzon.value = ozon;
  u.uSkyFaktor.value = skyFaktor(skydaekke);
  u.uTilstand.value = tilstand === 'melanom' ? 1 : 0;
  u.uLagStyrke.value = lagStyrke;
  u.uMelanom.value = melanom;

  const klik = (e) => {
    // Ignorér "klik", der i virkeligheden var et træk for at dreje kloden
    if (e.delta > 4) return;
    e.stopPropagation();
    onVaelg(vektorTilLatLon(e.point));
  };

  return (
    <>
      <mesh
        onClick={klik}
        material={materiale}
        onPointerMove={(e) => onHover?.(vektorTilLatLon(e.point))}
        onPointerOut={() => onHover?.(null)}
      >
        <sphereGeometry args={[1, 192, 96]} />
      </mesh>
      <lineSegments geometry={graenser}>
        <lineBasicMaterial color="#1a1d24" transparent opacity={0.55} />
      </lineSegments>
      <mesh scale={1.12}>
        <sphereGeometry args={[1, 64, 32]} />
        <shaderMaterial
          vertexShader={atmosfaereVertex}
          fragmentShader={atmosfaereFragment}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
      <Sol dato={dato} synlig={visSol} />
      {visKredse && <Breddekredse />}
      {tilstand !== 'melanom' && <Solpunkt dato={dato} />}
      {markoerer.map((m) => (
        <Markoer key={m.id} {...m} />
      ))}
    </>
  );
}

export default function Klode(props) {
  return (
    <Canvas
      className="klode-canvas"
      camera={{ fov: 45, near: 0.01, far: 100 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      <Styring start={props.startSted} />
      <KlodeScene {...props} />
    </Canvas>
  );
}
