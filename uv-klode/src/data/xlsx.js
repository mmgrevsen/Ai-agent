/**
 * Minimal læser af Excel-filer (.xlsx), så man kan trække filen fra Global Cancer
 * Observatory direkte ind i appen uden først at lave den om til CSV.
 *
 * En .xlsx-fil er i virkeligheden en ZIP-fil med XML indeni. Vi pakker den ud med
 * browserens indbyggede DecompressionStream (findes også i Node 18+), så der ikke
 * skal bruges et eksternt bibliotek. Vi læser kun det, vi har brug for:
 *   xl/sharedStrings.xml  – teksterne (Excel gemmer dem ét sted og henviser til dem)
 *   xl/worksheets/sheet1.xml – det første ark med cellerne
 */

/** Læs et lille tal fra en DataView (ZIP-filer gemmer tal med mindst betydende byte først). */
const u16 = (dv, p) => dv.getUint16(p, true);
const u32 = (dv, p) => dv.getUint32(p, true);

/** Pak data ud, der er pakket med "deflate" (ZIP's normale metode). */
async function pakUd(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Find filerne i en ZIP og pak dem ud.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Map<string, string>>} filnavn → indhold som tekst
 */
async function laesZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);

  // ZIP-filens indholdsfortegnelse ("end of central directory") ligger til sidst.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65_558; i--) {
    if (u32(dv, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Filen ser ikke ud til at være en .xlsx-fil (ingen ZIP-indholdsfortegnelse).');

  const antal = u16(dv, eocd + 10);
  let p = u32(dv, eocd + 16);
  const afkoder = new TextDecoder();
  const filer = new Map();

  for (let i = 0; i < antal; i++) {
    if (u32(dv, p) !== 0x02014b50) break;
    const metode = u16(dv, p + 10);
    const komprimeret = u32(dv, p + 20);
    const navnLaengde = u16(dv, p + 28);
    const ekstraLaengde = u16(dv, p + 30);
    const kommentarLaengde = u16(dv, p + 32);
    const lokalPos = u32(dv, p + 42);
    const navn = afkoder.decode(bytes.subarray(p + 46, p + 46 + navnLaengde));

    // Kun de to filer vi skal bruge – resten springer vi over for farten
    if (navn === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet1\.xml$/.test(navn)) {
      // Selve dataene ligger efter den lokale filoverskrift, hvis længde vi skal regne ud
      const lokalNavn = u16(dv, lokalPos + 26);
      const lokalEkstra = u16(dv, lokalPos + 28);
      const start = lokalPos + 30 + lokalNavn + lokalEkstra;
      const raa = bytes.subarray(start, start + komprimeret);
      filer.set(navn, afkoder.decode(metode === 0 ? raa : await pakUd(raa)));
    }
    p += 46 + navnLaengde + ekstraLaengde + kommentarLaengde;
  }
  return filer;
}

const AFKOD = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const afkodXml = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => AFKOD[m]).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

/** Træk teksten ud af alle <t>-mærker i et stykke XML. */
const tekster = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => afkodXml(m[1]));

/** Kolonnebogstaver → nummer: A = 0, B = 1, … AA = 26 */
function kolonneNummer(ref) {
  let n = 0;
  for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Læs det første ark i en .xlsx-fil som en liste af rækker med tekstfelter.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string[][]>}
 */
export async function laesXlsx(buffer) {
  const filer = await laesZip(buffer);
  const ark = filer.get('xl/worksheets/sheet1.xml');
  if (!ark) throw new Error('Kunne ikke finde regnearket i filen.');

  // Fælles tekster: hver <si> er én tekst (kan bestå af flere <t>-stumper)
  const fælles = (filer.get('xl/sharedStrings.xml') ?? '')
    .split(/<si[\s>]/)
    .slice(1)
    .map((si) => tekster(si).join(''));

  const raekker = [];
  for (const [, indhold] of ark.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const raekke = [];
    for (const celle of indhold.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g)) {
      const attr = celle[1] ?? celle[3] ?? '';
      const krop = celle[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attr)?.[1];
      const type = /t="([^"]+)"/.exec(attr)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(krop)?.[1];
      let vaerdi = '';
      if (type === 's') vaerdi = fælles[Number(v)] ?? '';
      else if (type === 'inlineStr') vaerdi = tekster(krop).join('');
      else vaerdi = afkodXml(v ?? '');
      raekke[ref ? kolonneNummer(ref) : raekke.length] = vaerdi;
    }
    raekker.push([...raekke].map((x) => x ?? ''));
  }
  return raekker;
}
