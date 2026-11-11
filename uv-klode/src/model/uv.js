/**
 * UV-indeks-modellen.
 *
 * KILDER
 * - UV-indeks ved skyfri himmel (Madronichs forenkling):
 *     UVI ≈ 12,5 · cos(θ)^2,42 · (Ω/300)^(−1,23)
 *   θ = solens zenitvinkel, Ω = ozonlagets tykkelse i Dobson-enheder (DU).
 *   S. Madronich (2007): "Analytic formula for the clear-sky UV Index",
 *   Photochemistry and Photobiology 83(6), s. 1537–1538.
 * - WHO's farveskala for UV-indeks: WHO, WMO, UNEP & ICNIRP (2002):
 *   "Global Solar UV Index – A Practical Guide".
 * - Solens position: se sol.js (NOAA).
 *
 * FORENKLINGER (vigtigt!)
 * - Ozonlaget er sat ens over hele kloden (i virkeligheden varierer det med
 *   breddegrad og årstid, typisk 250–450 DU).
 * - Skyernes virkning er en meget enkel dæmpningsfaktor, som vi selv har valgt
 *   (se skyFaktor nedenfor). Den er IKKE en fysisk skymodel.
 * - Højde over havet og refleksion fra sne, sand og vand er ikke med.
 */

import {
  solParametre,
  timevinkel,
  sinSolhoejde,
  datoFraDagOgMinut,
  middagUtcMinutter,
  dageIAaret,
} from './sol.js';

/** Standardværdi for ozonlaget i Dobson-enheder. */
export const STANDARD_OZON = 300;

/**
 * UV-indeks ved skyfri himmel (Madronich).
 * @param {number} cosZenit  cos(θ) = sin(solhøjde)
 * @param {number} ozon      ozonlag i Dobson-enheder
 * @returns {number} UV-indeks (0, hvis solen er under horisonten)
 */
export function uvKlarHimmel(cosZenit, ozon = STANDARD_OZON) {
  if (cosZenit <= 0) return 0; // solen er under horisonten → ingen UV
  return 12.5 * Math.pow(cosZenit, 2.42) * Math.pow(ozon / 300, -1.23);
}

/**
 * FORENKLET skydæmpning (vores eget valg, ikke en målt sammenhæng):
 *   faktor = 1 − 0,7 · s²     hvor s er skydækket fra 0 (skyfrit) til 1 (helt overskyet)
 *
 * Kurven er valgt, så den passer med den generelle erfaring:
 *   tynde/spredte skyer dæmper kun lidt (25 % skydække → ca. 96 % af UV'en slipper igennem),
 *   halvt skydække → ca. 83 %, og helt overskyet → kun 30 % slipper igennem.
 * Virkelige skyer er meget mere komplicerede (tykkelse, højde, type – og spredte
 * skyer kan endda give højere UV i kort tid).
 *
 * @param {number} skydaekke  0–1
 */
export function skyFaktor(skydaekke) {
  const s = Math.min(1, Math.max(0, skydaekke));
  return 1 - 0.7 * s * s;
}

/**
 * UV-indeks på et sted og tidspunkt.
 * @param {number} bredde    breddegrad (nord positiv)
 * @param {number} laengde   længdegrad (øst positiv)
 * @param {Date}   dato      tidspunkt i UTC
 * @param {{ozon?: number, skydaekke?: number}} [indstillinger]
 */
export function uvIndeks(bredde, laengde, dato, { ozon = STANDARD_OZON, skydaekke = 0 } = {}) {
  const { deklination, tidsligning } = solParametre(dato);
  const minutter = dato.getUTCHours() * 60 + dato.getUTCMinutes() + dato.getUTCSeconds() / 60;
  const H = timevinkel(minutter, laengde, tidsligning);
  const cosZenit = sinSolhoejde(bredde, deklination, H);
  return uvKlarHimmel(cosZenit, ozon) * skyFaktor(skydaekke);
}

/**
 * Det højeste UV-indeks på dagen. Det indtræffer ved sand middag, hvor solen står højest.
 */
export function maksUvPaaDagen(bredde, laengde, aar, dag, indstillinger) {
  const middag = datoFraDagOgMinut(aar, dag, middagUtcMinutter(aar, dag, laengde));
  return uvIndeks(bredde, laengde, middag, indstillinger);
}

/**
 * UV-indekset gennem et døgn (UTC), fx til en graf.
 * @returns {{minut: number, uv: number}[]}
 */
export function uvDoegnkurve(bredde, laengde, aar, dag, indstillinger, skridtMinutter = 10) {
  const punkter = [];
  for (let m = 0; m <= 1440; m += skridtMinutter) {
    punkter.push({ minut: m, uv: uvIndeks(bredde, laengde, datoFraDagOgMinut(aar, dag, m), indstillinger) });
  }
  return punkter;
}

/**
 * Middags-UV (dagens maksimum) for hver dag i året, fx til en graf.
 * @returns {{dag: number, uv: number}[]}
 */
export function middagsUvGennemAaret(bredde, laengde, aar, indstillinger) {
  const punkter = [];
  for (let dag = 1; dag <= dageIAaret(aar); dag++) {
    punkter.push({ dag, uv: maksUvPaaDagen(bredde, laengde, aar, dag, indstillinger) });
  }
  return punkter;
}

/**
 * WHO's kategorier for UV-indeks. Farverne er de officielle fra WHO-guiden.
 * Grænserne bruger det afrundede UV-indeks (WHO angiver UV-indeks som hele tal).
 */
export const WHO_KATEGORIER = [
  { fra: 0, til: 3, navn: 'Lav', interval: '0–2', farve: '#3EA72D', raad: 'Ingen beskyttelse nødvendig.' },
  { fra: 3, til: 6, navn: 'Moderat', interval: '3–5', farve: '#FFF300', raad: 'Søg skygge midt på dagen, brug solcreme.' },
  { fra: 6, til: 8, navn: 'Høj', interval: '6–7', farve: '#F18B00', raad: 'Beskyttelse nødvendig: skygge, tøj, hat og solcreme.' },
  { fra: 8, til: 11, navn: 'Meget høj', interval: '8–10', farve: '#E53210', raad: 'Ekstra beskyttelse. Undgå solen midt på dagen.' },
  { fra: 11, til: Infinity, navn: 'Ekstrem', interval: '11+', farve: '#B567A4', raad: 'Undgå solen midt på dagen. Søg skygge.' },
];

/** Find WHO-kategorien for et UV-indeks. */
export function whoKategori(uv) {
  const afrundet = Math.round(uv);
  return WHO_KATEGORIER.find((k) => afrundet >= k.fra && afrundet < k.til);
}
