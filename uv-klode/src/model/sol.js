/**
 * Solens position på himlen – beregnet med NOAA's formler.
 *
 * KILDER
 * - NOAA Global Monitoring Laboratory: "General Solar Position Calculations"
 *   (https://gml.noaa.gov/grad/solcalc/solareqns.PDF). Herfra kommer formlerne for
 *   "fraktionelt år" (γ), tidsligningen (equation of time) og solens deklination (δ),
 *   som er Spencers Fourier-rækker (J.W. Spencer, 1971, "Fourier series representation
 *   of the position of the sun", Search 2(5), s. 172).
 * - Solhøjden: sin(h) = sin(φ)·sin(δ) + cos(φ)·cos(δ)·cos(H)   (sfærisk trigonometri)
 *
 * Nøjagtighed: deklinationen er typisk korrekt inden for ca. 0,1°, og tidsligningen
 * inden for ca. 1 minut – rigeligt til en klode-model.
 *
 * Fortegn i hele appen:
 *   breddegrad φ: positiv mod nord, negativ mod syd (grader)
 *   længdegrad λ: positiv mod øst, negativ mod vest (grader)
 *   tid: altid UTC
 */

const RAD = Math.PI / 180;
const GRAD = 180 / Math.PI;

/** Er året et skudår? */
export function erSkudaar(aar) {
  return (aar % 4 === 0 && aar % 100 !== 0) || aar % 400 === 0;
}

/** Antal dage i året (365 eller 366). */
export function dageIAaret(aar) {
  return erSkudaar(aar) ? 366 : 365;
}

/** Dagens nummer i året: 1. januar = 1. Bruger UTC. */
export function dagNummer(dato) {
  const start = Date.UTC(dato.getUTCFullYear(), 0, 1);
  return Math.floor((dato.getTime() - start) / 86_400_000) + 1;
}

/** Lav en UTC-dato ud fra år, dagnummer (1 = 1. jan) og minutter efter midnat UTC. */
export function datoFraDagOgMinut(aar, dag, minutter) {
  return new Date(Date.UTC(aar, 0, 1) + (dag - 1) * 86_400_000 + minutter * 60_000);
}

/**
 * Solens deklination og tidsligningen for et bestemt tidspunkt (NOAA).
 *
 * Deklinationen δ er den breddegrad, hvor solen står lodret over jorden ved middag.
 * Den svinger mellem ca. +23,44° (sommersolhverv, 21. juni) og −23,44° (vintersolhverv,
 * 21. december), fordi jordaksen hælder.
 *
 * Tidsligningen er forskellen mellem "soltid" og jævn urtid (op til ca. ±16 minutter),
 * fordi jordens bane er en ellipse, og aksen hælder.
 *
 * @param {Date} dato  tidspunkt (UTC)
 * @returns {{deklination: number, tidsligning: number}} deklination i grader, tidsligning i minutter
 */
export function solParametre(dato) {
  const aar = dato.getUTCFullYear();
  const time = dato.getUTCHours() + dato.getUTCMinutes() / 60 + dato.getUTCSeconds() / 3600;

  // Fraktionelt år γ i radianer (NOAA): en vinkel, der går én gang rundt pr. år.
  const g = ((2 * Math.PI) / dageIAaret(aar)) * (dagNummer(dato) - 1 + (time - 12) / 24);

  // Tidsligningen i minutter (NOAA)
  const tidsligning =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));

  // Solens deklination i radianer (NOAA / Spencer)
  const dekl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);

  return { deklination: dekl * GRAD, tidsligning };
}

/**
 * Timevinklen H i grader (NOAA).
 *
 * Sand soltid (minutter) = UTC-tid i minutter + tidsligning + 4·længdegrad
 * (jorden drejer 1° på 4 minutter). Timevinklen er 0° ved soltid kl. 12 (middag),
 * negativ om formiddagen og positiv om eftermiddagen.
 *
 * @param {number} utcMinutter  minutter efter midnat UTC
 * @param {number} laengde      længdegrad i grader (øst positiv)
 * @param {number} tidsligning  minutter (fra solParametre)
 */
export function timevinkel(utcMinutter, laengde, tidsligning) {
  const sandSoltid = utcMinutter + tidsligning + 4 * laengde;
  let h = sandSoltid / 4 - 180;
  // Læg vinklen i intervallet [−180°, 180°)
  h = ((((h + 180) % 360) + 360) % 360) - 180;
  return h;
}

/**
 * sin(solhøjde) ud fra breddegrad, deklination og timevinkel:
 *   sin(h) = sin(φ)·sin(δ) + cos(φ)·cos(δ)·cos(H)
 * sin(h) er også lig med cos(θ), hvor θ = 90° − h er solens zenitvinkel.
 */
export function sinSolhoejde(bredde, deklination, timevinkelGrader) {
  const phi = bredde * RAD;
  const d = deklination * RAD;
  const H = timevinkelGrader * RAD;
  return Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H);
}

/**
 * Solens højde over horisonten i grader på et sted og tidspunkt.
 * Negativ værdi = solen er under horisonten (nat).
 */
export function solhoejde(bredde, laengde, dato) {
  const { deklination, tidsligning } = solParametre(dato);
  const minutter = dato.getUTCHours() * 60 + dato.getUTCMinutes() + dato.getUTCSeconds() / 60;
  const H = timevinkel(minutter, laengde, tidsligning);
  const s = sinSolhoejde(bredde, deklination, H);
  return Math.asin(Math.max(-1, Math.min(1, s))) * GRAD;
}

/**
 * Tidspunktet for sand middag (solen står højest) på en given dag, i minutter UTC.
 * Ved middag er timevinklen 0:  UTC-minutter = 720 − 4·længdegrad − tidsligning.
 * Resultatet kan ligge lidt uden for 0–1440 tæt ved datolinjen.
 */
export function middagUtcMinutter(aar, dag, laengde) {
  // Tidsligningen afhænger kun svagt af klokkeslættet; vi bruger kl. 12 UTC.
  const { tidsligning } = solParametre(datoFraDagOgMinut(aar, dag, 720));
  return 720 - 4 * laengde - tidsligning;
}

/**
 * Solhøjden ved sand middag (den højeste solhøjde på dagen), i grader.
 * Ved middag er H = 0, så h = 90° − |φ − δ|.
 */
export function solhoejdeVedMiddag(bredde, laengde, aar, dag) {
  const middag = datoFraDagOgMinut(aar, dag, middagUtcMinutter(aar, dag, laengde));
  const { deklination } = solParametre(middag);
  return 90 - Math.abs(bredde - deklination);
}
