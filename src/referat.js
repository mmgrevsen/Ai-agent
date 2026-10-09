// Laver et kort referat til virksomheden, når opkaldet er slut. Referatet
// bygges ud fra transskriptionen, og bookinger og beskeder hentes direkte fra
// det, værktøjerne registrerede – så tal og telefonnumre ikke kan blive forvansket.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MODEL } from "./agent.js";

const ReferatSkema = z.object({
  resume: z.string().describe("2-3 sætninger om, hvad kunden ville, og hvad der blev aftalt."),
  kategori: z.enum(["booking", "prisforespoergsel", "besked", "klage", "andet"]),
  kundens_navn: z.string().describe('Navn, hvis kunden sagde det, ellers "".'),
  opfoelgning_noedvendig: z.boolean(),
  opfoelgning: z.string().describe('Hvad virksomheden skal gøre, eller "".'),
  stemning: z.enum(["tilfreds", "neutral", "utilfreds"]),
});

export async function lavReferat(opkald, kunde, { klient = new Anthropic() } = {}) {
  const grundlag = {
    varighed_sek: Math.round((Date.now() - Date.parse(opkald.startet)) / 1000),
    bookinger: opkald.haendelser.filter((h) => h.type === "booking"),
    beskeder: opkald.haendelser.filter((h) => h.type === "besked"),
  };
  const samtale = opkald.transskription
    .map((l) => `${l.fra === "kunde" ? "Kunde" : "Assistent"}: ${l.tekst}`)
    .join("\n");

  try {
    const svar = await klient.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(ReferatSkema) },
      system: `Du skriver korte, sagligt korrekte referater af telefonopkald til ${kunde.navn}. Skriv på dansk og kun ud fra det, der står i samtalen.`,
      messages: [{
        role: "user",
        content: `Lav et referat af dette opkald.\n\n<samtale>\n${samtale}\n</samtale>\n\nRegistreret under opkaldet: ${JSON.stringify(grundlag)}`,
      }],
    });
    if (svar.stop_reason === "refusal" || !svar.parsed_output) throw new Error("Intet referat fra modellen.");
    return { ...grundlag, ...svar.parsed_output, ai_referat: true };
  } catch (fejl) {
    // Opkaldet må aldrig gå tabt, fordi referatet fejler. Så gemmer vi det simple.
    console.warn("Kunne ikke lave AI-referat:", fejl.message);
    return {
      ...grundlag,
      resume: "Automatisk referat mislykkedes – se transskriptionen.",
      kategori: grundlag.bookinger.length ? "booking" : grundlag.beskeder.length ? "besked" : "andet",
      opfoelgning_noedvendig: grundlag.beskeder.length > 0,
      ai_referat: false,
    };
  }
}
