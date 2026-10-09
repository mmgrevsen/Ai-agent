// Ringer til receptionisten på 50 forskellige måder og laver en rapport.
//
//   npm run opkaldstest                     – alle 50 (spørger først om prisen)
//   npm run opkaldstest -- --antal 5        – kun de første 5
//   npm run opkaldstest -- --filter booking – kun scenarier hvis id/kategori indeholder "booking"
//   npm run opkaldstest -- --ja             – spring spørgsmålet om pris over
//
// Rapporten gemmes i rapporter/. Kræver ANTHROPIC_API_KEY.

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { MODEL } from "../src/agent.js";
import { indlaesKunde } from "../src/kunde.js";
import { SCENARIER } from "./opkaldstest/scenarier.js";
import { koerScenario } from "./opkaldstest/simulator.js";

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (navn) => {
  const i = process.argv.indexOf(`--${navn}`);
  return i === -1 ? undefined : process.argv[i + 1] ?? true;
};

const kunde = indlaesKunde(process.env.KUNDE || "glanspunkt");
const KUNDE_MODEL = process.env.KUNDE_MODEL || "claude-opus-5-5";
const DOMMER_MODEL = process.env.DOMMER_MODEL || "claude-opus-5-5";
const PARALLELT = Number(arg("parallelt")) || 5;
const filter = typeof arg("filter") === "string" ? arg("filter").toLowerCase() : "";
let scenarier = SCENARIER.filter((s) => !filter || s.id.includes(filter) || s.kategori.toLowerCase().includes(filter));
if (arg("antal")) scenarier = scenarier.slice(0, Number(arg("antal")));

// Priser i dollar pr. million tokens (input, output, læsning fra cache).
const PRISER = {
  "claude-opus-5-5": [4, 20, 0.2], "claude-sonnet-5-5": [2, 10, 0.2], "claude-haiku-5-5": [0.1, 0.5, 0.01],
};
const KR_PR_DOLLAR = 7;

// Tæller tokens på alle kald, så vi kan vise, hvad testen kostede.
const forbrug = {};
function taelendeKlient(klient) {
  const tael = (svar) => {
    const f = (forbrug[svar.model] ??= { input: 0, output: 0, cacheSkriv: 0, cacheLaes: 0 });
    f.input += svar.usage?.input_tokens ?? 0;
    f.output += svar.usage?.output_tokens ?? 0;
    f.cacheSkriv += svar.usage?.cache_creation_input_tokens ?? 0;
    f.cacheLaes += svar.usage?.cache_read_input_tokens ?? 0;
    return svar;
  };
  return {
    beta: { messages: { create: async (p) => tael(await klient.beta.messages.create(p)) } },
    messages: {
      create: async (p) => tael(await klient.messages.create(p)),
      parse: async (p) => tael(await klient.messages.parse(p)),
    },
  };
}

function pris() {
  let dollar = 0;
  for (const [model, f] of Object.entries(forbrug)) {
    const [ind, ud, laes] = PRISER[Object.keys(PRISER).find((m) => model.startsWith(m))] ?? PRISER["claude-opus-5-5"];
    dollar += (f.input * ind + f.cacheSkriv * ind * 1.25 + f.cacheLaes * laes + f.output * ud) / 1e6;
  }
  return dollar;
}

async function bekraeft() {
  if (arg("ja")) return;
  // Groft skøn ud fra tidligere beregning: ca. 1-1,5 kr. pr. scenarie med Opus overalt.
  const skoen = `${Math.round(scenarier.length * 0.8)}-${Math.round(scenarier.length * 1.6)} kr.`;
  console.log(`\nKører ${scenarier.length} testopkald (receptionist: ${MODEL}, kunde: ${KUNDE_MODEL}, dommer: ${DOMMER_MODEL}).`);
  console.log(`Det koster groft anslået ${skoen} i API-forbrug.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const svar = await rl.question("Fortsæt? (j/n) ");
  rl.close();
  if (!/^j/i.test(svar.trim())) process.exit(0);
}

async function koerAlle(klient) {
  const resultater = new Array(scenarier.length);
  let naeste = 0;
  let faerdige = 0;
  let stop = false;
  async function arbejder() {
    while (naeste < scenarier.length && !stop) {
      const i = naeste++;
      const s = scenarier[i];
      resultater[i] = await koerScenario(s, { kunde, klient, kundeModel: KUNDE_MODEL, dommerModel: DOMMER_MODEL });
      const r = resultater[i];
      faerdige++;
      if (/authentication|api.?key|x-api-key|401/i.test(r.fejl ?? "")) {
        stop = true;
        console.error("\n✗ Ingen gyldig API-nøgle. Læg ANTHROPIC_API_KEY i .env (se README) og prøv igen.\n");
        process.exit(1);
      }
      const status = r.fejl ? "⚠ FEJL " : r.bestaaet ? "✓      " : "✗      ";
      console.log(`${String(faerdige).padStart(2)}/${scenarier.length} ${status} ${s.id.padEnd(26)} ${r.dom ? `${r.dom.karakter}/5` : ""} ${r.fejl ?? r.dom?.kommentar ?? ""}`.slice(0, 200));
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLELT, scenarier.length) }, arbejder));
  return resultater;
}

function rapport(resultater, varighedMs) {
  const gyldige = resultater.filter((r) => !r.fejl);
  const bestaaet = gyldige.filter((r) => r.bestaaet).length;
  const snit = gyldige.length ? gyldige.reduce((a, r) => a + r.dom.karakter, 0) / gyldige.length : 0;
  const svartider = gyldige.flatMap((r) => r.svartider).sort((a, b) => a - b);
  const median = svartider[Math.floor(svartider.length / 2)] ?? 0;
  const p90 = svartider[Math.floor(svartider.length * 0.9)] ?? 0;
  const kr = (pris() * KR_PR_DOLLAR).toFixed(2).replace(".", ",");

  const kategorier = [...new Set(resultater.map((r) => r.scenario.kategori))].map((k) => {
    const rs = resultater.filter((r) => r.scenario.kategori === k && !r.fejl);
    return `| ${k} | ${rs.filter((r) => r.bestaaet).length}/${rs.length} | ${rs.length ? (rs.reduce((a, r) => a + r.dom.karakter, 0) / rs.length).toFixed(1) : "–"} |`;
  });

  const linjer = [
    `# Opkaldstest – ${kunde.navn}`,
    "",
    `${new Date().toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" })} · receptionist: \`${MODEL}\` · kunde: \`${KUNDE_MODEL}\` · dommer: \`${DOMMER_MODEL}\``,
    "",
    `**Bestået: ${bestaaet} af ${gyldige.length}** · gennemsnitlig karakter ${snit.toFixed(1)}/5 · svartid median ${(median / 1000).toFixed(1)} s (90 %: ${(p90 / 1000).toFixed(1)} s) · pris ca. ${kr} kr. · tid ${Math.round(varighedMs / 1000)} s`,
    resultater.length > gyldige.length ? `\n⚠ ${resultater.length - gyldige.length} test kunne ikke gennemføres (se nederst).` : "",
    "",
    "| Kategori | Bestået | Karakter |", "|---|---|---|", ...kategorier,
    "",
    "## Oversigt", "",
    "| | Scenarie | Karakter | Kommentar |", "|---|---|---|---|",
    ...resultater.map((r) => `| ${r.fejl ? "⚠" : r.bestaaet ? "✓" : "✗"} | ${r.scenario.id} | ${r.dom ? `${r.dom.karakter}/5` : "–"} | ${(r.fejl ?? r.dom.kommentar).replace(/\|/g, "/").replace(/\n/g, " ")} |`),
    "",
    "## Detaljer (dumpede først)", "",
  ];

  const sorteret = [...resultater].sort((a, b) => Number(a.bestaaet ?? false) - Number(b.bestaaet ?? false) || (a.dom?.karakter ?? 0) - (b.dom?.karakter ?? 0));
  for (const r of sorteret) {
    linjer.push(`### ${r.fejl ? "⚠" : r.bestaaet ? "✓" : "✗"} ${r.scenario.id} (${r.scenario.kategori})`, "");
    linjer.push(`**Rolle:** ${r.scenario.rolle}`, "", `**Forventet:** ${r.scenario.forventet}`, "");
    if (r.fejl) linjer.push(`**Teknisk fejl:** ${r.fejl}`, "");
    if (r.dom) {
      linjer.push(`**Karakter:** ${r.dom.karakter}/5 – ${r.dom.kommentar}`, "");
      if (r.dom.fejl.length) linjer.push("**Fejl:**", ...r.dom.fejl.map((f) => `- ${f}`), "");
      if (r.dom.godt.length) linjer.push("**Godt:**", ...r.dom.godt.map((g) => `- ${g}`), "");
    }
    if (r.tjek) linjer.push("**Automatiske tjek:** " + r.tjek.map((t) => `${t.ok ? "✓" : "✗"} ${t.navn}${!t.ok && t.detalje ? ` (${t.detalje})` : ""}`).join(" · "), "");
    if (r.afslutning) linjer.push(`**Slut:** ${r.afslutning}`, "");
    linjer.push("```", ...r.opkald.transskription.map((l) => `${l.fra === "kunde" ? "Kunde    " : "Assistent"}: ${l.tekst}`), "```", "");
  }
  return { tekst: linjer.join("\n"), bestaaet, antal: gyldige.length, snit, kr };
}

await bekraeft();
const t0 = Date.now();
const resultater = await koerAlle(taelendeKlient(new Anthropic()));
const r = rapport(resultater, Date.now() - t0);
mkdirSync(path.join(rod, "rapporter"), { recursive: true });
const fil = path.join(rod, "rapporter", `opkaldstest-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`);
writeFileSync(fil, r.tekst);
console.log(`\nBestået ${r.bestaaet} af ${r.antal} · karakter ${r.snit.toFixed(1)}/5 · pris ca. ${r.kr} kr.`);
console.log(`Rapport: ${path.relative(process.cwd(), fil)}\n`);
process.exitCode = r.bestaaet === resultater.length ? 0 : 1;
