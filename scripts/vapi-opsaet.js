// Opretter (eller opdaterer) din assistent hos Vapi.
//
//   npm run vapi:opsaet
//
// Kræver i .env: VAPI_API_KEY, OFFENTLIG_URL og VAPI_HEMMELIGHED (se VAPI.md).
// Kør den igen, hver gang din offentlige adresse eller kundefil ændrer sig.

import { randomBytes } from "node:crypto";
import { indlaesKunde } from "../src/kunde.js";
import { bygVapiAssistent } from "../src/vapi.js";

const { VAPI_API_KEY, OFFENTLIG_URL, VAPI_HEMMELIGHED, VAPI_ASSISTENT_ID, VAPI_STEMME } = process.env;
const kunde = indlaesKunde(process.env.KUNDE || "glanspunkt");

function stop(besked) {
  console.error(`\n✗ ${besked}\n`);
  process.exit(1);
}

if (!VAPI_API_KEY) stop("VAPI_API_KEY mangler i .env. Find din *private* nøgle på dashboard.vapi.ai under API Keys.");
if (!VAPI_HEMMELIGHED) {
  stop(`VAPI_HEMMELIGHED mangler i .env. Tilføj fx denne linje:\n\n  VAPI_HEMMELIGHED=${randomBytes(24).toString("hex")}`);
}
if (!OFFENTLIG_URL || !/^https:\/\//.test(OFFENTLIG_URL)) {
  stop("OFFENTLIG_URL mangler eller starter ikke med https://. Start en tunnel (se VAPI.md) og indsæt adressen i .env.");
}

// Tjek, at serveren faktisk kan nås udefra, før vi sender adressen til Vapi.
try {
  const svar = await fetch(`${OFFENTLIG_URL.replace(/\/+$/, "")}/vapi/ping`);
  if (!svar.ok) throw new Error(`svarede ${svar.status}`);
  console.log(`✓ Din server kan nås på ${OFFENTLIG_URL}`);
} catch (fejl) {
  stop(`Kan ikke nå din server på ${OFFENTLIG_URL} (${fejl.message}). Kører både "npm start" og tunnelen?`);
}

const assistent = bygVapiAssistent(kunde, { offentligUrl: OFFENTLIG_URL, hemmelighed: VAPI_HEMMELIGHED, stemme: VAPI_STEMME || undefined });
const opdater = Boolean(VAPI_ASSISTENT_ID);
const svar = await fetch(`https://api.vapi.ai/assistant${opdater ? `/${VAPI_ASSISTENT_ID}` : ""}`, {
  method: opdater ? "PATCH" : "POST",
  headers: { authorization: `Bearer ${VAPI_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify(assistent),
});
const data = await svar.json().catch(() => ({}));
if (!svar.ok) stop(`Vapi afviste (${svar.status}): ${JSON.stringify(data.message ?? data)}`);

console.log(`✓ Assistenten "${data.name}" er ${opdater ? "opdateret" : "oprettet"} hos Vapi.`);
if (!opdater) {
  console.log(`\nTilføj denne linje til .env, så scriptet opdaterer den samme assistent næste gang:\n\n  VAPI_ASSISTENT_ID=${data.id}\n`);
}
console.log("Næste skridt: åbn dashboard.vapi.ai → Assistants → vælg assistenten → \"Talk to Assistant\" for at teste,");
console.log("og knyt den til et telefonnummer under Phone Numbers. Se VAPI.md.\n");
