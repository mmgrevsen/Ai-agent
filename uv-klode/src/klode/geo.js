/**
 * Geografi-hjælpere: omregning mellem bredde/længde og 3D-punkter på kloden,
 * opslag af lande og tegning af teksturer ud fra Natural Earth-dataene.
 */
import * as THREE from 'three';
import { geoContains, geoEquirectangular, geoPath } from 'd3-geo';
import lande from '../data/lande-110m.json';
import { melanomFarve } from '../data/melanom.js';

const RAD = Math.PI / 180;

export { lande };

/**
 * Bredde/længde (grader) → punkt på en kugle med radius r.
 * Passer med three.js' SphereGeometry og en ækvidistant (equirectangular) tekstur:
 * længdegrad 0° vender mod +x, nordpolen mod +y, og 90° Ø mod −z.
 */
export function latLonTilVektor(bredde, laengde, r = 1) {
  const phi = bredde * RAD;
  const lam = laengde * RAD;
  return new THREE.Vector3(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
}

/** Punkt på kuglen → { bredde, laengde } i grader. */
export function vektorTilLatLon(v) {
  const n = v.clone().normalize();
  return {
    bredde: Math.asin(Math.max(-1, Math.min(1, n.y))) / RAD,
    laengde: Math.atan2(-n.z, n.x) / RAD,
  };
}

/** Find landet (GeoJSON-feature) der indeholder punktet, eller null (fx hav). */
export function findLand(bredde, laengde) {
  return lande.features.find((f) => geoContains(f, [laengde, bredde])) ?? null;
}

const danskeNavne = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['da'], { type: 'region' }) : null;

/** Landets navn på dansk (via browserens indbyggede landenavne – virker uden internet). */
export function landeNavn(feature) {
  const { iso2, navn } = feature.properties;
  if (iso2 && danskeNavne) {
    try {
      const n = danskeNavne.of(iso2);
      if (n && n !== iso2) return n;
    } catch {
      /* ukendt kode – brug engelsk navn */
    }
  }
  return navn;
}

/**
 * Byg landegrænser og kystlinjer som linjestykker lidt over klodens overflade.
 * Lange stykker deles op, så linjen følger kuglens krumning.
 */
export function bygGraenseGeometri(r = 1.002) {
  const pos = [];
  const tilfoej = (a, b) => {
    // Spring stykker over, der løber langs datolinjen (kunstige kanter i dataene)
    if (Math.abs(a[0]) > 179.9 && Math.abs(b[0]) > 179.9) return;
    const trin = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
    let forrige = latLonTilVektor(a[1], a[0], r);
    for (let i = 1; i <= trin; i++) {
      const t = i / trin;
      const p = latLonTilVektor(a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t, r);
      pos.push(forrige.x, forrige.y, forrige.z, p.x, p.y, p.z);
      forrige = p;
    }
  };
  for (const f of lande.features) {
    const polygoner = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polygoner) {
      for (const ring of poly) {
        for (let i = 1; i < ring.length; i++) tilfoej(ring[i - 1], ring[i]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Tegn lande på et lærred i ækvidistant projektion (hele kloden: 360° × 180°). */
function tegnLande(bredde, hoejde, farveFor, baggrund) {
  const laerred = document.createElement('canvas');
  laerred.width = bredde;
  laerred.height = hoejde;
  const ctx = laerred.getContext('2d');
  if (baggrund) {
    ctx.fillStyle = baggrund;
    ctx.fillRect(0, 0, bredde, hoejde);
  }
  const projektion = geoEquirectangular()
    .scale(bredde / (2 * Math.PI))
    .translate([bredde / 2, hoejde / 2]);
  const sti = geoPath(projektion, ctx);
  for (const f of lande.features) {
    ctx.beginPath();
    sti(f);
    ctx.fillStyle = farveFor(f);
    ctx.fill();
  }
  const tekstur = new THREE.CanvasTexture(laerred);
  tekstur.colorSpace = THREE.SRGBColorSpace;
  tekstur.anisotropy = 4;
  return tekstur;
}

/** Grundkortet: hav og land. */
export function lavGrundTekstur() {
  return tegnLande(4096, 2048, () => '#c8c3ad', '#2b5d86');
}

/** Melanom-kortet: hvert land farvet efter sin rate (grå = ingen data), havet gennemsigtigt. */
export function lavMelanomTekstur(rater) {
  return tegnLande(2048, 1024, (f) => melanomFarve(rater.get(f.properties.iso3)?.rate), null);
}
