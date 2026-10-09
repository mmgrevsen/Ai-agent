import { test } from "node:test";
import assert from "node:assert/strict";
import { Receptionist, UNDSKYLDNING } from "../src/agent.js";
import { Kalender } from "../src/kalender.js";
import { indlaesKunde } from "../src/kunde.js";

// En falsk Claude-klient, der returnerer forudbestemte svar. Så kan vi teste
// samtalemotoren uden internet og uden at bruge penge.
function falskKlient(svar) {
  const kald = [];
  return {
    kald,
    beta: { messages: { create: async (params) => { kald.push(structuredClone(params)); return svar.shift(); } } },
  };
}

const kunde = indlaesKunde("glanspunkt");
const kalender = () => new Kalender(kunde, { nu: () => ({ dato: "2026-10-09", minutter: 600 }) });

test("kører værktøjer og sender resultatet tilbage til Claude", async () => {
  const klient = falskKlient([
    {
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "Et øjeblik." },
        { type: "tool_use", id: "t1", name: "tjek_ledige_tider", input: { ydelse_id: "komplet", dato: "2026-10-12", tidligst: "" } },
      ],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Jeg har klokken 8 eller halv 9." }] },
  ]);
  const r = new Receptionist(kunde, kalender(), { klient });
  const opkald = r.nytOpkald();
  const svar = await r.svar(opkald, "Har I en tid mandag?");

  assert.equal(svar, "Et øjeblik. Jeg har klokken 8 eller halv 9.");
  assert.equal(klient.kald.length, 2);
  const resultat = klient.kald[1].messages.at(-1).content[0];
  assert.equal(resultat.type, "tool_result");
  assert.equal(resultat.tool_use_id, "t1");
  assert.equal(JSON.parse(resultat.content).ledige_tider[0].tid, "08:00");
});

test("historikken bygges kun på og starter med en user-besked", async () => {
  const klient = falskKlient([
    { stop_reason: "end_turn", content: [{ type: "text", text: "349 kroner." }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Selv tak." }] },
  ]);
  const r = new Receptionist(kunde, kalender(), { klient });
  const opkald = r.nytOpkald();
  await r.svar(opkald, "Hvad koster en vask?");
  await r.svar(opkald, "Tak");
  const [foerste, andet] = klient.kald;
  assert.equal(foerste.messages[0].role, "user");
  assert.deepEqual(andet.messages.slice(0, foerste.messages.length), foerste.messages);
  assert.deepEqual(andet.system, foerste.system);
});

test("fejl i et værktøj sendes som is_error, så AI'en kan rette sig", async () => {
  const klient = falskKlient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "opret_booking", input: { ydelse_id: "komplet", dato: "2026-10-11", tid: "09:00", navn: "A", telefon: "12345678", bil: "", note: "" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Vi har lukket om søndagen." }] },
  ]);
  const r = new Receptionist(kunde, kalender(), { klient });
  await r.svar(r.nytOpkald(), "Book søndag");
  const resultat = klient.kald[1].messages.at(-1).content[0];
  assert.equal(resultat.is_error, true);
  assert.match(resultat.content, /ikke ledig/);
});

test("en afvisning giver et høfligt svar og gemmes ikke", async () => {
  const klient = falskKlient([{ stop_reason: "refusal", stop_details: { category: null }, content: [] }]);
  const r = new Receptionist(kunde, kalender(), { klient });
  const opkald = r.nytOpkald();
  assert.equal(await r.svar(opkald, "..."), UNDSKYLDNING);
  assert.equal(opkald.beskeder.at(-1).content, UNDSKYLDNING);
});

test("sender fallback og lav effort med standardmodellen", async () => {
  const klient = falskKlient([{ stop_reason: "end_turn", content: [{ type: "text", text: "Hej" }] }]);
  const r = new Receptionist(kunde, kalender(), { klient });
  await r.svar(r.nytOpkald(), "Hej");
  const p = klient.kald[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.equal(p.fallbacks, "default");
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.output_config.effort, "low");
  assert.equal(p.system[0].cache_control.type, "ephemeral");
});
