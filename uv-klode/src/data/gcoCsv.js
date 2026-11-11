/**
 * Læser en CSV-fil eksporteret fra Global Cancer Observatory – Cancer Today
 * (gco.iarc.who.int/today → Tables → "Download CSV") og laver den om til
 * samme format som data/melanom.json.
 *
 * GCO's kolonnenavne kan variere lidt mellem versioner, så vi leder efter
 * kolonner ud fra deres navn:
 *   - landekode: "Alpha-3 code" / "ISO3" (bogstaver) eller "ISO code" / "Population code" (tal, fx 208)
 *   - rate:      en kolonne hvis navn indeholder "ASR" (aldersstandardiseret rate, World)
 *   - navn:      "Population" / "Country" / "Label" (kun til fejlbeskeder)
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

const find = (kolonner, ...test) => kolonner.findIndex((k) => test.some((t) => t.test(k)));

/**
 * @param {string} tekst  hele CSV-filens indhold
 * @param {{isoN3: number|null, iso3: string}[]} lande  landeliste til at oversætte talkoder til ISO3
 * @param {string} kilde  tekst, der gemmes som kilde for hvert tal
 * @returns {{lande: {land: string, rate: number, kilde: string}[], advarsler: string[]}}
 */
export function laesGcoCsv(tekst, lande, kilde = 'GLOBOCAN, gco.iarc.who.int (Cancer Today)') {
  const linjer = tekst.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linjer.length < 2) return { lande: [], advarsler: ['CSV-filen er tom.'] };

  const skille = (linjer[0].match(/;/g) ?? []).length > (linjer[0].match(/,/g) ?? []).length ? ';' : ',';
  const kolonner = delLinje(linjer[0], skille).map((k) => k.toLowerCase());

  const iAlpha = find(kolonner, /alpha.?3/, /^iso.?3$/, /^iso_a3$/);
  const iTal = find(kolonner, /iso.*code/, /population.*code/, /^code$/, /^id$/);
  const iRate = find(kolonner, /asr/);
  const iNavn = find(kolonner, /population|country|label|name/);

  if (iRate < 0) return { lande: [], advarsler: ['Fandt ingen kolonne med "ASR" i CSV-filen. Husk at vælge ASR (World) i Cancer Today.'] };
  if (iAlpha < 0 && iTal < 0) return { lande: [], advarsler: ['Fandt ingen kolonne med landekoder (ISO) i CSV-filen.'] };

  const talTilIso3 = new Map(lande.filter((l) => l.isoN3).map((l) => [l.isoN3, l.iso3]));
  const ud = [];
  const advarsler = [];

  for (const linje of linjer.slice(1)) {
    const f = delLinje(linje, skille);
    const navn = iNavn >= 0 ? f[iNavn] : '';
    let iso3 = iAlpha >= 0 ? (f[iAlpha] ?? '').toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(iso3) && iTal >= 0) iso3 = talTilIso3.get(Number(f[iTal])) ?? '';
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
