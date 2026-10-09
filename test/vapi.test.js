import { test } from "node:test";
import assert from "node:assert/strict";
import { indlaesKunde } from "../src/kunde.js";
import { HEADER, VapiOpkald, bygVapiAssistent, erGyldigNoegle, skrivSvar } from "../src/vapi.js";

const kunde = indlaesKunde("glanspunkt");

// Falsk receptionist: gentager det, kunden sagde, og husker rækkefølgen.
function falskReceptionist({ afslutPaa = null, ventMs = 0 } = {}) {
  const set = [];
  return {
    set,
    nytOpkald: () => ({ startet: new Date().toISOString(), afsluttet: false, haendelser: [], transskription: [] }),
    svar: async (opkald, tekst) => {
      await new Promise((r) => setTimeout(r, ventMs));
      set.push(tekst);
      if (tekst === afslutPaa) opkald.afsluttet = true;
      return `Svar på: ${tekst}`;
    },
  };
}

const krop = (callId, ...kunde) => ({
  call: { id: callId, monitor: { controlUrl: "https://vapi.test/control" } },
  stream: true,
  messages: [{ role: "system", content: "x" }, { role: "assistant", content: "Hej" }, ...kunde.flatMap((k) => [{ role: "user", content: k }, { role: "assistant", content: "…" }])],
});

test("assistenten hos Vapi peger på vores server og er sat op til dansk", () => {
  const a = bygVapiAssistent(kunde, { offentligUrl: "https://eksempel.trycloudflare.com/", hemmelighed: "hemmelig" });
  assert.equal(a.model.provider, "custom-llm");
  assert.equal(a.model.url, "https://eksempel.trycloudflare.com/vapi");
  assert.equal(a.server.url, "https://eksempel.trycloudflare.com/vapi/webhook");
  assert.equal(a.model.headers[HEADER], "hemmelig");
  assert.equal(a.server.headers[HEADER], "hemmelig");
  assert.equal(a.transcriber.language, "da");
  assert.match(a.voice.voiceId, /^da-DK/);
  assert.equal(a.firstMessage, kunde.velkomst);
  assert.ok(a.name.length <= 40);
});

test("nøglen tjekkes", () => {
  assert.equal(erGyldigNoegle("abc", "abc"), true);
  assert.equal(erGyldigNoegle("abd", "abc"), false);
  assert.equal(erGyldigNoegle(undefined, "abc"), false);
  assert.equal(erGyldigNoegle("abc", ""), false);
});

test("svarer kun på nye kunde-replikker og husker opkaldet", async () => {
  const r = falskReceptionist();
  const v = new VapiOpkald(r, { styr: async () => {} });
  assert.equal(await v.svar(krop("c1", "Hvad koster en vask?")), "Svar på: Hvad koster en vask?");
  // Samme samtale sendt igen (ingen ny replik) → intet nyt svar.
  assert.equal(await v.svar(krop("c1", "Hvad koster en vask?")), "");
  // To nye replikker i træk slås sammen.
  assert.equal(await v.svar(krop("c1", "Hvad koster en vask?", "Og", "en SUV?")), "Svar på: Og en SUV?");
  assert.deepEqual(r.set, ["Hvad koster en vask?", "Og en SUV?"]);
  assert.equal(v.aktive.size, 1);
});

test("samtidige kald behandles i rækkefølge", async () => {
  const r = falskReceptionist({ ventMs: 20 });
  const v = new VapiOpkald(r, { styr: async () => {} });
  const [a, b] = await Promise.all([v.svar(krop("c2", "første")), v.svar(krop("c2", "første", "anden"))]);
  assert.equal(a, "Svar på: første");
  assert.equal(b, "Svar på: anden");
  assert.deepEqual(r.set, ["første", "anden"]);
});

test("når AI'en lægger på, beder vi Vapi sige farvel og afslutte", async () => {
  const styrebeskeder = [];
  const v = new VapiOpkald(falskReceptionist({ afslutPaa: "farvel" }), { styr: async (url, b) => styrebeskeder.push([url, b]) });
  assert.equal(await v.svar(krop("c3", "farvel")), "");
  assert.deepEqual(styrebeskeder, [["https://vapi.test/control", { type: "say", content: "Svar på: farvel", endCallAfterSpoken: true }]]);
});

test("virker styringen ikke, siges afskeden alligevel", async () => {
  const v = new VapiOpkald(falskReceptionist({ afslutPaa: "farvel" }), { styr: async () => { throw new Error("nede"); } });
  const advarsel = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await v.svar(krop("c4", "farvel")), "Svar på: farvel");
  } finally {
    console.warn = advarsel;
  }
});

test("slut-rapport laver referat én gang", async () => {
  const afsluttede = [];
  const v = new VapiOpkald(falskReceptionist(), { afslut: async (id) => afsluttede.push(id), styr: async () => {} });
  await v.svar(krop("c5", "hej"));
  await v.opkaldSlut("c5");
  assert.equal(await v.opkaldSlut("c5"), null);
  assert.deepEqual(afsluttede, ["c5"]);
});

test("streamer svaret i OpenAI-format", () => {
  let hoved, data = "";
  const res = { writeHead: (s, h) => (hoved = [s, h]), write: (d) => (data += d), end: (d = "") => (data += d) };
  skrivSvar(res, "Det koster 349 kroner. Vil du booke?", { stream: true });
  assert.equal(hoved[0], 200);
  assert.match(hoved[1]["content-type"], /event-stream/);
  const linjer = data.trim().split("\n\n").map((l) => l.replace(/^data: /, ""));
  assert.equal(linjer.at(-1), "[DONE]");
  const stykker = linjer.slice(0, -1).map((l) => JSON.parse(l));
  assert.ok(stykker.every((s) => s.object === "chat.completion.chunk"));
  assert.equal(stykker.map((s) => s.choices[0].delta.content ?? "").join(""), "Det koster 349 kroner. Vil du booke?");
  assert.equal(stykker.at(-1).choices[0].finish_reason, "stop");
});
