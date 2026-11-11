// Indlæser en CSV-fil fra GCO Cancer Today i data/melanom.json.
//
// Brug:  npm run importer-gco -- sti/til/fil.csv "GLOBOCAN 2024, gco.iarc.who.int"
//
// Tal, der allerede står i melanom.json for lande, som IKKE er i CSV-filen, bevares.
// Lande, der er i CSV-filen, overskrives med de nye tal.
import { readFileSync, writeFileSync } from 'node:fs';
import { laesGcoCsv } from '../src/data/gcoCsv.js';

const [csvSti, kilde = 'GLOBOCAN 2024, gco.iarc.who.int (Cancer Today)'] = process.argv.slice(2);
if (!csvSti) {
  console.error('Angiv CSV-filen: npm run importer-gco -- fil.csv');
  process.exit(1);
}

const lande = JSON.parse(readFileSync(new URL('../src/data/lande-110m.json', import.meta.url))).features.map((f) => f.properties);
const { lande: nye, advarsler } = laesGcoCsv(readFileSync(csvSti, 'utf8'), lande, kilde);

const fil = new URL('../data/melanom.json', import.meta.url);
const data = JSON.parse(readFileSync(fil, 'utf8'));
const samlet = new Map(data.lande.map((r) => [r.land, r]));
for (const r of nye) samlet.set(r.land, r);
data.lande = [...samlet.values()].sort((a, b) => a.land.localeCompare(b.land));
writeFileSync(fil, JSON.stringify(data, null, 2) + '\n');

console.log(`Indlæste ${nye.length} lande fra ${csvSti} → data/melanom.json`);
for (const a of advarsler) console.warn('Advarsel:', a);
console.log('Byg appen igen med: npm run build');
