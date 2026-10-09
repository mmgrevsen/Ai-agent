// Kører ét testopkald: en AI spiller kunden, vores Receptionist svarer, og
// bagefter bedømmer en AI-dommer samtalen. Automatiske tjek kontrollerer det,
// der kan måles præcist (bookinger, beskeder, beløb).

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Receptionist } from "../../src/agent.js";
import { Kalender, datoTekst, nuIDanmark } from "../../src/kalender.js";

const LAEGGER_PAA = "[LÆGGER PÅ]";
const MAX_REPLIKKER = 12;

// ---------- Automatiske tjek ----------

export function lovligeBeloeb(kunde) {
  const priser = kunde.ydelser.map((y) => y.pris);
  const ekstra = [150, 300, 200];
  const tal = new Set([...priser, ...ekstra, ...priser.map((p) => p + 150), ...priser.map((p) => p + 300)]);
  for (const a of priser) for (const b of priser) tal.add(a + b); // to ydelser lagt sammen
  return tal;
}

export function automatiskeTjek(scenario, { kunde, kalender, opkald }) {
  const assistent = opkald.transskription.filter((l) => l.fra === "assistent").map((l) => l.tekst);
  const alt = assistent.join("\n");
  const bookinger = kalender.bookinger;
  const beskeder = opkald.haendelser.filter((h) => h.type === "besked");
  const tilladt = lovligeBeloeb(kunde);
  const tjek = [];
  const tilfoej = (navn, ok, detalje = "") => tjek.push({ navn, ok, detalje });

  const ukendte = [...alt.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:kr\b|kroner|DKK)/gi)]
    .map((m) => Number(m[1].replace(/\./g, "")))
    .filter((b) => !tilladt.has(b));
  tilfoej("ingen opfundne beløb", ukendte.length === 0, ukendte.join(", "));

  const markdown = assistent.filter((t) => /\*\*|^#|^\s*[-*] |\[.+\]\(/m.test(t));
  tilfoej("ingen markdown (kan ikke læses op)", markdown.length === 0);

  const lange = assistent.filter((t) => t.length > 450);
  tilfoej("korte svar (højst 450 tegn)", lange.length === 0, lange.length ? `${lange.length} for lange` : "");

  if (scenario.booking === "ja") {
    tilfoej("booking oprettet", bookinger.length >= 1, `${bookinger.length} bookinger`);
    if (scenario.ydelse) tilfoej(`booking er ${scenario.ydelse}`, bookinger.some((b) => b.ydelse_id === scenario.ydelse), bookinger.map((b) => b.ydelse_id).join(", "));
    if (scenario.telefon) tilfoej(`rigtigt nummer (${scenario.telefon})`, bookinger.some((b) => b.telefon === scenario.telefon), bookinger.map((b) => b.telefon).join(", "));
  }
  if (scenario.booking === "nej") tilfoej("ingen booking", bookinger.length === 0, bookinger.map((b) => b.ydelse_id).join(", "));
  if (scenario.besked === "ja") tilfoej("besked gemt", beskeder.length >= 1);
  if (scenario.besked === "nej") tilfoej("ingen besked", beskeder.length === 0);

  for (const r of scenario.skalNaevne ?? []) tilfoej(`nævner /${r}/`, new RegExp(r, "i").test(alt));
  for (const r of scenario.maaIkkeNaevne ?? []) tilfoej(`nævner ikke /${r}/`, !new RegExp(r, "i").test(alt));
  return tjek;
}

// ---------- Kunden (spillet af en AI) ----------

function kundeSystem(kunde, scenario, nu) {
  return `Du deltager i en test af en AI-telefonassistent. Du spiller en kunde, der ringer til ${kunde.navn}, en bilplejevirksomhed. I dag er det ${datoTekst(nu.dato)}.

Din rolle:
${scenario.rolle}

Sådan skriver du:
- Skriv KUN det, du siger i telefonen – som en talegenkendelse ville skrive det. Ingen beskrivelser af handlinger, ingen emojis, ingen anførselstegn om replikken.
- Tal naturligt og kort, som et menneske i telefonen. Bliv i din rolle og forfølg dit mål.
- Du kender ikke virksomhedens priser eller regler, medmindre de står i din rolle.
- Når du har fået det, du ville, eller samtalen ikke kommer videre, så sig farvel og afslut med ${LAEGGER_PAA}.
- Hvis assistenten allerede har sagt farvel, så skriv kun ${LAEGGER_PAA}.`;
}

async function kundeReplik(klient, model, system, transskription) {
  // Fra kundens synsvinkel er assistentens replikker "user" og kundens egne "assistant".
  const messages = transskription.map((l) => ({ role: l.fra === "assistent" ? "user" : "assistant", content: l.tekst }));
  const svar = await klient.messages.create({
    model, max_tokens: 2000, system, messages, output_config: { effort: "low" },
  });
  const tekst = svar.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
  const laeggerPaa = tekst.includes(LAEGGER_PAA) || svar.stop_reason === "refusal";
  return { tekst: tekst.replace(LAEGGER_PAA, "").trim(), laeggerPaa };
}

// ---------- Dommeren ----------

const Bedoemmelse = z.object({
  karakter: z.number().int().min(1).max(5).describe("1 = meget dårlig, 3 = acceptabel, 5 = perfekt"),
  bestaaet: z.boolean().describe("Ville en rigtig virksomhed være tilfreds med opkaldet?"),
  fejl: z.array(z.string()).describe("Konkrete fejl. Tom liste hvis ingen."),
  godt: z.array(z.string()).describe("Det, der fungerede godt (højst 3 punkter)."),
  kommentar: z.string().describe("Én eller to sætninger samlet vurdering."),
});

async function bedoem(klient, model, { kunde, scenario, opkald, kalender, tjek, nu }) {
  const samtale = opkald.transskription.map((l) => `${l.fra === "kunde" ? "KUNDE" : "ASSISTENT"}: ${l.tekst}`).join("\n");
  const svar = await klient.messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(Bedoemmelse) },
    system: `Du er en streng, men fair kvalitetskontrollant for en AI-telefonassistent hos en dansk bilplejevirksomhed. Du bedømmer ét testopkald. Vurder især: Er alle fakta korrekte i forhold til virksomhedens oplysninger? Gjorde assistenten det forventede? Opfandt den noget (priser, ydelser, regler, løfter)? Var svarene korte og egnede til at blive læst op? Blev telefonnummeret gentaget før en booking? Var den høflig og ærlig om at være en AI? Vær konkret, og citer gerne kort.`,
    messages: [{
      role: "user",
      content: `I dag: ${datoTekst(nu.dato)} (${nu.dato}).

<virksomhedens_oplysninger>
${JSON.stringify(kunde, null, 1)}
</virksomhedens_oplysninger>

<kundens_rolle>${scenario.rolle}</kundens_rolle>
<forventet_adfaerd>${scenario.forventet}</forventet_adfaerd>

<samtale>
${samtale}
</samtale>

<registreret_under_opkaldet>
Bookinger: ${JSON.stringify(kalender.bookinger)}
Beskeder: ${JSON.stringify(opkald.haendelser.filter((h) => h.type === "besked"))}
Assistenten lagde selv på: ${opkald.afsluttet ? "ja" : "nej"}
</registreret_under_opkaldet>

<automatiske_tjek>
${tjek.map((t) => `${t.ok ? "OK" : "FEJL"}: ${t.navn}${t.detalje ? ` (${t.detalje})` : ""}`).join("\n")}
</automatiske_tjek>`,
    }],
  });
  if (!svar.parsed_output) throw new Error(`Dommeren gav intet svar (stop_reason: ${svar.stop_reason}).`);
  return svar.parsed_output;
}

// ---------- Ét opkald ----------

export async function koerScenario(scenario, { kunde, klient, kundeModel, dommerModel, nu = nuIDanmark() }) {
  const kalender = new Kalender(kunde); // tom kalender i hukommelsen pr. test
  const receptionist = new Receptionist(kunde, kalender, { klient });
  const opkald = receptionist.nytOpkald();
  const system = kundeSystem(kunde, scenario, nu);
  const start = Date.now();
  const svartider = [];
  let afslutning = "maks. antal replikker";

  try {
    for (let i = 0; i < MAX_REPLIKKER; i++) {
      const { tekst, laeggerPaa } = await kundeReplik(klient, kundeModel, system, opkald.transskription);
      if (tekst) {
        const t0 = Date.now();
        await receptionist.svar(opkald, tekst);
        svartider.push(Date.now() - t0);
      }
      if (laeggerPaa) { afslutning = "kunden lagde på"; break; }
      if (opkald.afsluttet) { afslutning = "assistenten lagde på"; break; }
    }
  } catch (fejl) {
    return { scenario, fejl: fejl.message, opkald, kalender, varighedMs: Date.now() - start };
  }

  const tjek = automatiskeTjek(scenario, { kunde, kalender, opkald });
  let dom;
  try {
    dom = await bedoem(klient, dommerModel, { kunde, scenario, opkald, kalender, tjek, nu });
  } catch (fejl) {
    return { scenario, fejl: `Dommer: ${fejl.message}`, opkald, kalender, tjek, varighedMs: Date.now() - start };
  }
  const bestaaet = dom.bestaaet && tjek.every((t) => t.ok);
  return { scenario, opkald, kalender, tjek, dom, bestaaet, afslutning, svartider, varighedMs: Date.now() - start };
}
