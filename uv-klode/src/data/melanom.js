/**
 * Indlæsning og kontrol af hudkræftdata (modermærkekræft pr. 100.000).
 *
 * Filen data/melanom.json udfyldes af brugerne selv med tal fra
 * Global Cancer Observatory (gco.iarc.who.int) og NORDCAN.
 * Appen opfinder ingen tal: lande uden et gyldigt tal vises som "ingen data".
 */

/**
 * Lav en opslagstabel ISO3 → {rate, kilde} ud fra indholdet af melanom.json.
 * Accepterer både { lande: [...] } og en ren liste [...].
 * Ugyldige linjer springes over og rapporteres i "advarsler".
 *
 * @param {unknown} json
 * @returns {{rater: Map<string, {rate: number, kilde: string}>, advarsler: string[], enhed: string}}
 */
export function laesMelanomData(json) {
  const advarsler = [];
  const rater = new Map();
  const liste = Array.isArray(json) ? json : Array.isArray(json?.lande) ? json.lande : null;

  if (!liste) {
    return { rater, advarsler: ['Filen skal indeholde en liste "lande".'], enhed: '' };
  }

  liste.forEach((r, i) => {
    const land = typeof r?.land === 'string' ? r.land.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(land)) {
      advarsler.push(`Linje ${i + 1}: "land" skal være en ISO3-kode med tre bogstaver.`);
      return;
    }
    if (r.rate === null || r.rate === undefined || r.rate === '') return; // ikke udfyldt endnu
    const rate = typeof r.rate === 'string' ? Number(r.rate.replace(',', '.')) : r.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
      advarsler.push(`${land}: "rate" skal være et positivt tal.`);
      return;
    }
    rater.set(land, { rate, kilde: typeof r.kilde === 'string' ? r.kilde : '' });
  });

  return { rater, advarsler, enhed: typeof json?.enhed === 'string' ? json.enhed : '' };
}

/**
 * Farveskala for melanom-kortet (gul → mørkerød). Grænserne dækker det spænd,
 * man typisk ser i verden (fra under 1 til over 30 pr. 100.000).
 */
export const MELANOM_TRIN = [
  { fra: 0, til: 2, farve: '#fee8c8' },
  { fra: 2, til: 5, farve: '#fdbb84' },
  { fra: 5, til: 10, farve: '#fc8d59' },
  { fra: 10, til: 20, farve: '#e34a33' },
  { fra: 20, til: 30, farve: '#b30000' },
  { fra: 30, til: Infinity, farve: '#67000d' },
];

export const INGEN_DATA_FARVE = '#8a8f98';

/** Farven for en melanom-rate. */
export function melanomFarve(rate) {
  if (rate === undefined || rate === null) return INGEN_DATA_FARVE;
  return (MELANOM_TRIN.find((t) => rate >= t.fra && rate < t.til) ?? MELANOM_TRIN.at(-1)).farve;
}
