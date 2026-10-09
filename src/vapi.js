// Forbindelsen til Vapi, som klarer telefonnummer, tale-til-tekst og stemme.
//
//   Kunde ringer → Vapi (lytter og taler dansk)
//                    └─ sender det, kunden sagde, til POST /vapi/chat/completions
//                         └─ vores Receptionist (Claude + booking + kalender) svarer
//
// Vapi kalder os som en "Custom LLM" i det format, OpenAI's chat-API bruger.
// Når opkaldet er slut, sender Vapi en "end-of-call-report" til /vapi/webhook,
// og så laver vi referatet ligesom i browserdemoen.

import { timingSafeEqual } from "node:crypto";

export const HEADER = "x-receptionist-noegle";
export const TEKNISK_FEJL = "Undskyld, der skete en teknisk fejl hos mig. Prøv at ringe igen om lidt, eller skriv til os.";

// Indstillingerne til assistenten hos Vapi. Bruges af scripts/vapi-opsaet.js.
export function bygVapiAssistent(kunde, { offentligUrl, hemmelighed, stemme = "da-DK-ChristelNeural" }) {
  const url = offentligUrl.replace(/\/+$/, "");
  const headers = { [HEADER]: hemmelighed };
  return {
    name: `${kunde.navn} – receptionist`.slice(0, 40),
    firstMessage: kunde.velkomst,
    firstMessageMode: "assistant-speaks-first",
    transcriber: { provider: "deepgram", model: "nova-3", language: "da" },
    voice: { provider: "azure", voiceId: stemme },
    model: {
      provider: "custom-llm",
      url: `${url}/vapi`, // Vapi tilføjer selv /chat/completions
      model: "receptionist",
      headers,
      timeoutSeconds: 20,
      maxTokens: 400,
    },
    server: { url: `${url}/vapi/webhook`, headers },
    serverMessages: ["end-of-call-report"],
    maxDurationSeconds: 600,
    metadata: { kunde: kunde.id },
  };
}

export function erGyldigNoegle(modtaget, hemmelighed) {
  if (!hemmelighed || typeof modtaget !== "string") return false;
  const a = Buffer.from(modtaget);
  const b = Buffer.from(hemmelighed);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Holder styr på igangværende Vapi-opkald, nøgle = Vapis call.id.
export class VapiOpkald {
  constructor(receptionist, { afslut, styr = sendStyrebesked } = {}) {
    this.receptionist = receptionist;
    this.afslut = afslut; // (id, opkald) => Promise – laver referat og gemmer
    this.styr = styr;
    this.aktive = new Map();
  }

  // Vapi sender HELE samtalen hver gang. Vi finder de kunde-replikker, vi ikke
  // har svaret på endnu, og lader vores egen Receptionist svare.
  async svar(krop) {
    const callId = krop.call?.id;
    if (!callId) throw new Error("Mangler call.id fra Vapi.");
    let o = this.aktive.get(callId);
    if (!o) {
      o = { opkald: this.receptionist.nytOpkald(), besvaret: 0, koe: Promise.resolve() };
      o.opkald.kilde = "vapi";
      o.opkald.telefon = krop.customer?.number ?? krop.call?.customer?.number ?? null;
      this.aktive.set(callId, o);
    }

    // Kommer et nyt kald, mens det forrige stadig kører (kunden afbrød), venter
    // vi, så historikken ikke bliver blandet sammen.
    const kunde = (krop.messages ?? []).filter((m) => m.role === "user").map(beskedTekst);
    const resultat = o.koe.then(async () => {
      const nye = kunde.slice(o.besvaret).filter(Boolean);
      o.besvaret = Math.max(o.besvaret, kunde.length);
      if (!nye.length) return { tekst: "", afslut: false };
      const tekst = await this.receptionist.svar(o.opkald, nye.join(" "));
      return { tekst, afslut: o.opkald.afsluttet };
    });
    o.koe = resultat.catch(() => {});
    const { tekst, afslut } = await resultat;

    // Skal opkaldet slutte, beder vi Vapi sige afskeden og derefter lægge på.
    if (afslut && krop.call?.monitor?.controlUrl) {
      try {
        await this.styr(krop.call.monitor.controlUrl, { type: "say", content: tekst, endCallAfterSpoken: true });
        return "";
      } catch (fejl) {
        console.warn("Kunne ikke bede Vapi om at lægge på:", fejl.message);
      }
    }
    return tekst;
  }

  async opkaldSlut(callId) {
    const o = this.aktive.get(callId);
    if (!o) return null;
    this.aktive.delete(callId);
    await o.koe;
    return this.afslut(callId, o.opkald);
  }
}

function beskedTekst(m) {
  if (typeof m.content === "string") return m.content.trim();
  if (Array.isArray(m.content)) return m.content.map((d) => d.text ?? "").join(" ").trim();
  return "";
}

async function sendStyrebesked(controlUrl, besked) {
  const svar = await fetch(controlUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(besked),
  });
  if (!svar.ok) throw new Error(`Vapi svarede ${svar.status}`);
}

// Svaret i OpenAI-format. Vapi beder normalt om streaming (Server-Sent Events).
export function skrivSvar(res, tekst, { stream }) {
  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  const model = "receptionist";
  if (!stream) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({
      id, object: "chat.completion", created, model,
      choices: [{ index: 0, message: { role: "assistant", content: tekst }, finish_reason: "stop" }],
    }));
  }
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" });
  const chunk = (delta, finish_reason = null) =>
    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  chunk({ role: "assistant", content: "" });
  // Én sætning ad gangen, så stemmen kan begynde, før hele svaret er sendt.
  for (const saetning of tekst.match(/[^.!?]+[.!?]*\s*/g) ?? []) chunk({ content: saetning });
  chunk({}, "stop");
  res.end("data: [DONE]\n\n");
}
