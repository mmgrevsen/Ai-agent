// Forbereder Natural Earth-landegrænserne (1:110m) til appen.
//
// Kilde: Natural Earth, "Admin 0 – Countries", 1:110m, version fra
// github.com/nvkelso/natural-earth-vector (public domain).
// Den rå fil ligger i geodata/ne_110m_admin_0_countries.geojson.
//
// Scriptet beholder kun de felter, appen bruger (ISO3, ISO2, numerisk ISO og navn),
// og afrunder koordinaterne til 2 decimaler (~1 km), så filen bliver lille.
// Kør:  npm run geodata
import { readFileSync, writeFileSync } from 'node:fs';

const raa = JSON.parse(readFileSync(new URL('../geodata/ne_110m_admin_0_countries.geojson', import.meta.url)));

const rund = (x) => Math.round(x * 100) / 100;
const rundKoord = (c) => (typeof c[0] === 'number' ? [rund(c[0]), rund(c[1])] : c.map(rundKoord));

// Nogle lande (fx Frankrig og Norge) har ISO_A3 = "-99" i Natural Earth.
// Så bruges ISO_A3_EH eller ADM0_A3 i stedet.
const vaelg = (...v) => v.find((x) => x && x !== '-99') ?? null;

const ud = {
  type: 'FeatureCollection',
  features: raa.features.map((f) => {
    const p = f.properties;
    return {
      type: 'Feature',
      properties: {
        iso3: vaelg(p.ISO_A3, p.ISO_A3_EH, p.ADM0_A3),
        iso2: vaelg(p.ISO_A2, p.ISO_A2_EH),
        // Numerisk ISO-kode (fx 208 = Danmark) – GCO bruger den i sine CSV-filer
        isoN3: vaelg(p.ISO_N3, p.ISO_N3_EH) ? Number(vaelg(p.ISO_N3, p.ISO_N3_EH)) : null,
        navn: p.NAME,
      },
      geometry: { type: f.geometry.type, coordinates: rundKoord(f.geometry.coordinates) },
    };
  }),
};

writeFileSync(new URL('../src/data/lande-110m.json', import.meta.url), JSON.stringify(ud));
console.log(`Skrev ${ud.features.length} lande til src/data/lande-110m.json`);
