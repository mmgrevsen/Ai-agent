/**
 * Læser en CSV-fil eksporteret fra Global Cancer Observatory – Cancer Today
 * (gco.iarc.who.int/today → Tables → "Download CSV") og laver den om til
 * samme format som data/melanom.json.
 *
 * GCO's kolonnenavne kan variere lidt mellem versioner, så vi leder efter
 * kolonner ud fra deres navn:
 *   - landekode: "Alpha-3 code" / "ISO3" (bogstaver) eller "ISO code" / "Population code" (tal, fx 208)
 *   - rate:      en kolonne hvis navn indeholder "ASR" (aldersstandardiseret rate, World)
 *   - navn:      "Population" / "Country" / "Label" (bruges, hvis der ikke er en landekode)
 */

/** Del én CSV-linje op i felter (håndterer anførselstegn og ; eller , som skilletegn). */
function delLinje(linje, skille) {
  const felter = [];
  let felt = '';
  let iCitat = false;
  for (let i = 0; i < linje.length; i++) {
    const c = linje[i];
    if (c === '"') {
      if (iCitat && linje[i + 1] === '"') {
        felt += '"';
        i++;
      } else iCitat = !iCitat;
    } else if (c === skille && !iCitat) {
      felter.push(felt.trim());
      felt = '';
    } else felt += c;
  }
  felter.push(felt.trim());
  return felter;
}

/** Gør et landenavn sammenligneligt: små bogstaver, uden accenter, parenteser og tegn. */
export const normaliserNavn = (n) =>
  String(n)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z]/g, '');

// GCO's navne, der skrives anderledes end i Natural Earth (GCO-navn → ISO3)
const NAVNE_ALIAS = {
  unitedstatesofamerica: 'USA', usa: 'USA', russianfederation: 'RUS', korearepublicof: 'KOR', republicofkorea: 'KOR',
  southkorea: 'KOR', koreademocraticrepublicof: 'PRK', dempeoplesrepublicofkorea: 'PRK', northkorea: 'PRK',
  irantheislamicrepublicof: 'IRN', iranislamicrepublicof: 'IRN', iran: 'IRN', vietnam: 'VNM', vietnamsocialistrepublic: 'VNM',
  laopeoplesdemocraticrepublic: 'LAO', laopdr: 'LAO', syrianarabrepublic: 'SYR', bolivia: 'BOL', boliviaplurinationalstateof: 'BOL',
  venezuela: 'VEN', venezuelabolivarianrepublicof: 'VEN', tanzaniaunitedrepublicof: 'TZA', unitedrepublicoftanzania: 'TZA',
  democraticrepublicofthecongo: 'COD', drcongo: 'COD', congodemocraticrepublicof: 'COD', congorepublicof: 'COG', congo: 'COG',
  cotedivoire: 'CIV', ivorycoast: 'CIV', czechia: 'CZE', czechrepublic: 'CZE', turkiye: 'TUR', turkey: 'TUR',
  unitedkingdom: 'GBR', uk: 'GBR', france: 'FRA', francemetropolitan: 'FRA', moldova: 'MDA', republicofmoldova: 'MDA',
  northmacedonia: 'MKD', bosniaandherzegovina: 'BIH', eswatini: 'SWZ', swaziland: 'SWZ', caboverde: 'CPV',
  timorleste: 'TLS', brunei: 'BRN', bruneidarussalam: 'BRN', myanmar: 'MMR', centralafricanrepublic: 'CAF',
  southsudan: 'SSD', dominicanrepublic: 'DOM', equatorialguinea: 'GNQ', solomonislands: 'SLB', gambia: 'GMB', thegambia: 'GMB',
  westernsahara: 'ESH', palestine: 'PSE', stateofpalestine: 'PSE', gazastripandwestbank: 'PSE', taiwan: 'TWN',
  chinataiwan: 'TWN', puertorico: 'PRI', newcaledonia: 'NCL', frenchguiana: 'GUF', falklandislands: 'FLK', greenland: 'GRL',
};

/** Find den første kolonne, der passer på et af mønstrene – mønstrene prøves i rækkefølge. */
const find = (kolonner, ...moenstre) => {
  for (const m of moenstre) {
    const i = kolonner.findIndex((k) => m.test(k));
    if (i >= 0) return i;
  }
  return -1;
};

// GCO's nummer for hver kræfttype. 16 = modermærkekræft, 39 = alle kræftformer.
export const MELANOM_KODE = 16;

/**
 * Læs en tabel fra GCO, hvor hver række er et land, og første række er overskrifterne.
 * @param {string[][]} raekker
 * @param {{isoN3: number|null, iso3: string, navn: string}[]} lande  til at oversætte koder/navne til ISO3
 * @param {string} kilde  tekst, der gemmes som kilde for hvert tal
 * @returns {{lande: {land: string, rate: number, kilde: string}[], advarsler: string[]}}
 */
export function laesGcoRaekker(raekker, lande, kilde = 'GLOBOCAN, gco.iarc.who.int (Cancer Today)') {
  if (!raekker || raekker.length < 2) return { lande: [], advarsler: ['Filen er tom.'] };
  const kolonner = raekker[0].map((k) => String(k ?? '').toLowerCase().trim());

  const iAlpha = find(kolonner, /alpha.?3/, /^iso.?3$/, /^iso_a3$/);
  const iTal = find(kolonner, /iso.*code/, /population.*code/, /^code$/, /^id$/);
  const iRate = find(kolonner, /asr/);
  // Navnekolonnen må ikke være en kodekolonne: i GCO's filer indeholder både
  // "Population code" og "Country" tal, mens "Label" indeholder landenavnet.
  const navneKolonner = kolonner.map((k) => (/code|kode/.test(k) ? '' : k));
  const iNavn = find(navneKolonner, /^label$/, /^country$|country name/, /^population$/, /name/, /population|country/);

  const iKraeft = find(kolonner, /cancer.*code/);

  if (iRate < 0) return { lande: [], advarsler: ['Fandt ingen kolonne med "ASR" i filen. Husk at vælge ASR (World) i Cancer Today.'] };
  if (iAlpha < 0 && iTal < 0 && iNavn < 0) return { lande: [], advarsler: ['Fandt ingen kolonne med lande (ISO-kode eller navn) i filen.'] };

  // Fang den typiske fejl: tabellen er hentet med "All cancers" i stedet for modermærkekræft
  if (iKraeft >= 0) {
    const koder = [...new Set(raekker.slice(1).map((f) => String(f[iKraeft] ?? '').trim()).filter(Boolean))];
    if (koder.length > 0 && !koder.includes(String(MELANOM_KODE))) {
      return {
        lande: [],
        advarsler: [
          `Filen er for kræfttype ${koder.slice(0, 3).join(', ')}` +
            (koder.includes('39') ? ' ("alle kræftformer")' : '') +
            `, ikke ${MELANOM_KODE}, som er modermærkekræft. Hent tabellen igen, hvor kun "Melanoma of skin" er valgt.`,
        ],
      };
    }
  }

  const talTilIso3 = new Map(lande.filter((l) => l.isoN3).map((l) => [l.isoN3, l.iso3]));
  const navnTilIso3 = new Map(lande.filter((l) => l.navn).map((l) => [normaliserNavn(l.navn), l.iso3]));
  const fraNavn = (n) => NAVNE_ALIAS[normaliserNavn(n)] ?? navnTilIso3.get(normaliserNavn(n)) ?? '';
  const ud = [];
  const advarsler = [];

  for (const f of raekker.slice(1)) {
    // Hvis filen indeholder flere kræfttyper, bruger vi kun modermærkekræft
    const kode = iKraeft >= 0 ? String(f[iKraeft] ?? '').trim() : '';
    if (kode && kode !== String(MELANOM_KODE)) continue;
    const navn = iNavn >= 0 ? f[iNavn] : '';
    let iso3 = iAlpha >= 0 ? (f[iAlpha] ?? '').toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(iso3) && iTal >= 0) iso3 = talTilIso3.get(Number(f[iTal])) ?? '';
    if (!/^[A-Z]{3}$/.test(iso3) && navn) iso3 = fraNavn(navn); // sidste udvej: genkend landet på navnet
    const rate = Number(String(f[iRate] ?? '').replace(',', '.'));
    if (!iso3) {
      // Fx verdensdele og "World" – dem springer vi stille over, ellers giver vi besked
      if (navn && !/world|africa|asia|europe|america|oceania|caribbean|melanesia|micronesia|polynesia|income|hdi/i.test(navn)) {
        advarsler.push(`Kunne ikke finde landekoden for "${navn}".`);
      }
      continue;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      advarsler.push(`${navn || iso3}: ugyldig rate "${f[iRate]}".`);
      continue;
    }
    ud.push({ land: iso3, rate, kilde });
  }
  return { lande: ud, advarsler };
}

/**
 * Som laesGcoRaekker, men med en CSV-fils tekst som input.
 * Finder selv ud af, om felterne er adskilt med komma eller semikolon.
 */
export function laesGcoCsv(tekst, lande, kilde) {
  const linjer = tekst.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linjer.length < 2) return { lande: [], advarsler: ['CSV-filen er tom.'] };
  const skille = (linjer[0].match(/;/g) ?? []).length > (linjer[0].match(/,/g) ?? []).length ? ';' : ',';
  return laesGcoRaekker(
    linjer.map((l) => delLinje(l, skille)),
    lande,
    kilde,
  );
}

/**
 * Som laesGcoRaekker, men med indholdet af en .xlsx-fil (ArrayBuffer) som input.
 * Det er den fil, man henter direkte fra Cancer Today.
 */
export async function laesGcoXlsx(buffer, lande, kilde) {
  const { laesXlsx } = await import('./xlsx.js');
  return laesGcoRaekker(await laesXlsx(buffer), lande, kilde);
}
