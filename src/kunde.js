// Indlæser og tjekker en virksomheds oplysninger fra kunder/<id>.json.
// Hver ny kunde er bare en ny JSON-fil – koden skal ikke ændres.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const UGEDAGE = ["soendag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "loerdag"];

export function indlaesKunde(id) {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`Ugyldigt kunde-id "${id}". Brug kun små bogstaver, tal og bindestreg.`);
  }
  const fil = path.join(rod, "kunder", `${id}.json`);
  const kunde = JSON.parse(readFileSync(fil, "utf8"));
  tjekKunde(kunde);
  return kunde;
}

// Fanger fejl i kundefilen, før en kunde ringer ind og får et forkert svar.
export function tjekKunde(kunde) {
  const fejl = [];
  for (const felt of ["id", "navn", "assistent_navn", "velkomst", "aabningstider", "ydelser", "booking"]) {
    if (kunde[felt] === undefined) fejl.push(`mangler feltet "${felt}"`);
  }
  for (const dag of UGEDAGE) {
    if (kunde.aabningstider && !(dag in kunde.aabningstider)) {
      fejl.push(`aabningstider mangler "${dag}" (brug null, hvis der er lukket)`);
    }
    const t = kunde.aabningstider?.[dag];
    if (t && !(tilMinutter(t.aaben) < tilMinutter(t.luk))) {
      fejl.push(`aabningstider for ${dag} er ugyldige`);
    }
  }
  const ider = new Set();
  for (const y of kunde.ydelser ?? []) {
    if (!y.id || !y.navn) fejl.push("en ydelse mangler id eller navn");
    if (ider.has(y.id)) fejl.push(`ydelsen "${y.id}" findes to gange`);
    ider.add(y.id);
    if (!Number.isFinite(y.pris) || y.pris < 0) fejl.push(`ydelsen "${y.id}" har ingen gyldig pris`);
    if (!Number.isInteger(y.varighed_min) || y.varighed_min <= 0) fejl.push(`ydelsen "${y.id}" har ingen gyldig varighed`);
  }
  if (fejl.length) throw new Error(`Fejl i kundefilen for "${kunde.id ?? "?"}":\n- ${fejl.join("\n- ")}`);
}

export function tilMinutter(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fraMinutter(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function formaterPris(kr) {
  return `${kr.toLocaleString("da-DK")} kr.`;
}
