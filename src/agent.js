// Samtalemotoren: sender samtalen til Claude, kører de værktøjer, Claude beder
// om, og fortsætter, indtil Claude har et svar til kunden.

import Anthropic from "@anthropic-ai/sdk";
import { datoTekst, nuIDanmark } from "./kalender.js";
import { bygSystemprompt } from "./prompt.js";
import { koerVaerktoej, vaerktoejsdefinitioner } from "./vaerktoejer.js";

export const MODEL = process.env.MODEL || "claude-opus-5-5";
// "low" giver hurtige svar, hvilket betyder meget i en telefonsamtale.
const EFFORT = process.env.EFFORT || "low";
const MAX_VAERKTOEJSRUNDER = 6;

// Hvis sikkerhedsfiltret afviser en forespørgsel, prøver API'et automatisk en
// anden model i stedet for at lade kunden hænge. Kun nogle modeller har det.
const HAR_FALLBACK = /^claude-(opus-5|sonnet-5-5|fable-5)/.test(MODEL);

export const UNDSKYLDNING = "Undskyld, det kan jeg desværre ikke hjælpe med lige nu. Vil du have, at jeg gemmer en besked, så vi ringer dig op?";

export class Receptionist {
  constructor(kunde, kalender, { klient = new Anthropic() } = {}) {
    this.kunde = kunde;
    this.kalender = kalender;
    this.klient = klient;
    this.system = [{ type: "text", text: bygSystemprompt(kunde), cache_control: { type: "ephemeral" } }];
    this.vaerktoejer = vaerktoejsdefinitioner(kunde);
  }

  // Et nyt opkald. Velkomsten er fast tekst, så kunden hører den med det samme.
  nytOpkald() {
    const nu = nuIDanmark();
    const start = `[Opkaldet er forbundet ${datoTekst(nu.dato)} (${nu.dato}) klokken ${String(Math.floor(nu.minutter / 60)).padStart(2, "0")}:${String(nu.minutter % 60).padStart(2, "0")}.]`;
    return {
      startet: new Date().toISOString(),
      afsluttet: false,
      haendelser: [],
      transskription: [{ fra: "assistent", tekst: this.kunde.velkomst }],
      // Historikken bygges kun på (append-only). Svarene fra Claude gemmes
      // præcis, som de kom, så cachen og Claudes tankeblokke forbliver gyldige.
      beskeder: [
        { role: "user", content: start },
        { role: "assistant", content: this.kunde.velkomst },
      ],
    };
  }

  // Kunden siger noget – returnerer det, assistenten svarer.
  async svar(opkald, kundensTekst) {
    opkald.transskription.push({ fra: "kunde", tekst: kundensTekst });
    opkald.beskeder.push({ role: "user", content: kundensTekst });

    const dele = [];
    for (let runde = 0; runde < MAX_VAERKTOEJSRUNDER; runde++) {
      const svar = await this.klient.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: this.system,
        tools: this.vaerktoejer,
        messages: opkald.beskeder,
        output_config: { effort: EFFORT },
        ...(HAR_FALLBACK ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
      });

      if (svar.stop_reason === "refusal") {
        // Hele kæden afviste. Gem ikke det afviste svar i historikken.
        console.warn("Afvist af sikkerhedsfilter:", svar.stop_details?.category ?? "ukendt");
        dele.push(UNDSKYLDNING);
        opkald.beskeder.push({ role: "assistant", content: UNDSKYLDNING });
        break;
      }

      opkald.beskeder.push({ role: "assistant", content: svar.content });
      // Tekst fra alle runder samles, fx "Et øjeblik, jeg kigger…" + selve svaret.
      for (const b of svar.content) if (b.type === "text" && b.text.trim()) dele.push(b.text.trim());

      if (svar.stop_reason === "pause_turn") continue;
      if (svar.stop_reason !== "tool_use") break;

      const resultater = svar.content
        .filter((b) => b.type === "tool_use")
        .map((kald) => {
          try {
            const resultat = koerVaerktoej(kald.name, kald.input, { kalender: this.kalender, opkald });
            return { type: "tool_result", tool_use_id: kald.id, content: JSON.stringify(resultat) };
          } catch (fejl) {
            return { type: "tool_result", tool_use_id: kald.id, content: fejl.message, is_error: true };
          }
        });
      // Alle resultater sendes samlet i én besked.
      opkald.beskeder.push({ role: "user", content: resultater });
    }

    const svartekst = dele.join(" ") || UNDSKYLDNING;
    opkald.transskription.push({ fra: "assistent", tekst: svartekst });
    return svartekst;
  }
}
