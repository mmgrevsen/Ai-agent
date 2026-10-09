import { test } from "node:test";
import assert from "node:assert/strict";
import { indlaesKunde } from "../src/kunde.js";
import { SCENARIER } from "../scripts/opkaldstest/scenarier.js";
import { automatiskeTjek, koerScenario } from "../scripts/opkaldstest/simulator.js";

const kunde = indlaesKunde("glanspunkt");
const nu = { dato: "2026-10-09", minutter: 600 };

test("der er 50 gyldige scenarier", () => {
  assert.equal(SCENARIER.length, 50);
  assert.equal(new Set(SCENARIER.map((s) => s.id)).size, 50);
  const ydelser = new Set(kunde.ydelser.map((y) => y.id));
  for (const s of SCENARIER) {
    assert.ok(s.rolle && s.forventet && s.kategori, s.id);
    assert.ok([undefined, "ja", "nej"].includes(s.booking), s.id);
    assert.ok([undefined, "ja", "nej"].includes(s.besked), s.id);
    if (s.ydelse) assert.ok(ydelser.has(s.ydelse), `${s.id}: ukendt ydelse`);
    for (const r of [...(s.skalNaevne ?? []), ...(s.maaIkkeNaevne ?? [])]) new RegExp(r, "i");
  }
});

test("automatiske tjek fanger opfundne priser og manglende booking", () => {
  const opkald = { haendelser: [], transskription: [{ fra: "assistent", tekst: "Det koster 799 kroner." }] };
  const tjek = automatiskeTjek({ booking: "ja" }, { kunde, kalender: { bookinger: [] }, opkald });
  const fejlede = tjek.filter((t) => !t.ok).map((t) => t.navn);
  assert.deepEqual(fejlede, ["ingen opfundne beløb", "booking oprettet"]);
  // Pris + SUV-tillæg og 4.999 med punktum er tilladt.
  opkald.transskription = [{ fra: "assistent", tekst: "Med tillæg bliver det 999 kroner, og coating er fra 4.999 kr." }];
  assert.ok(automatiskeTjek({}, { kunde, kalender: { bookinger: [] }, opkald }).every((t) => t.ok));
});

test("simulatoren kører et helt opkald igennem med falske AI-svar", async () => {
  const kundeReplikker = ["Hej, hvad koster en udvendig vask?", "Tak, farvel. [LÆGGER PÅ]"];
  const kald = { receptionist: 0, kunde: 0, dommer: 0 };
  const klient = {
    beta: { messages: { create: async () => (kald.receptionist++, { stop_reason: "end_turn", content: [{ type: "text", text: "Det koster 349 kroner." }] }) } },
    messages: {
      create: async (p) => {
        // Kunden ser assistentens replikker som "user".
        assert.equal(p.messages[0].role, "user");
        return { stop_reason: "end_turn", content: [{ type: "text", text: kundeReplikker[kald.kunde++] }] };
      },
      parse: async (p) => {
        kald.dommer++;
        assert.match(p.messages[0].content, /KUNDE: Hej, hvad koster/);
        return { stop_reason: "end_turn", parsed_output: { karakter: 5, bestaaet: true, fejl: [], godt: ["Korrekt pris"], kommentar: "Fint." } };
      },
    },
  };
  const scenario = SCENARIER.find((s) => s.id === "pris-vask");
  const r = await koerScenario(scenario, { kunde, klient, kundeModel: "k", dommerModel: "d", nu });
  assert.equal(r.fejl, undefined);
  assert.equal(r.bestaaet, true);
  assert.equal(r.afslutning, "kunden lagde på");
  assert.deepEqual(kald, { receptionist: 2, kunde: 2, dommer: 1 });
  assert.deepEqual(r.opkald.transskription.map((l) => l.fra), ["assistent", "kunde", "assistent", "kunde", "assistent"]);
});
