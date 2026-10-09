import { test } from "node:test";
import assert from "node:assert/strict";
import { Kalender } from "../src/kalender.js";
import { indlaesKunde, tjekKunde } from "../src/kunde.js";
import { bygSystemprompt } from "../src/prompt.js";
import { koerVaerktoej, vaerktoejsdefinitioner } from "../src/vaerktoejer.js";

const kunde = indlaesKunde("glanspunkt");
const nu = () => ({ dato: "2026-10-09", minutter: 600 });
const ctx = () => ({ kalender: new Kalender(kunde, { nu }), opkald: { haendelser: [], afsluttet: false } });

test("systemprompten indeholder alle priser og åbningstider", () => {
  const prompt = bygSystemprompt(kunde);
  for (const y of kunde.ydelser) {
    assert.ok(prompt.includes(y.navn), y.navn);
    assert.ok(prompt.includes(y.pris.toLocaleString("da-DK")), `pris for ${y.navn}`);
  }
  assert.match(prompt, /Søndag: lukket/);
  assert.match(prompt, /fra 4\.999 kr\./);
  // Prompten må ikke ændre sig fra opkald til opkald, ellers virker caching ikke.
  assert.equal(prompt, bygSystemprompt(kunde));
});

test("velkomsten fortæller, at det er en AI", () => {
  assert.match(kunde.velkomst, /AI/);
});

test("værktøjerne har gyldige navne og strenge skemaer", () => {
  for (const v of vaerktoejsdefinitioner(kunde)) {
    assert.match(v.name, /^[a-zA-Z0-9_-]{1,64}$/);
    assert.equal(v.strict, true);
    assert.equal(v.input_schema.additionalProperties, false);
    assert.deepEqual([...v.input_schema.required].sort(), Object.keys(v.input_schema.properties).sort());
  }
});

test("opret_booking renser telefonnummer og registrerer bookingen", () => {
  const c = ctx();
  const svar = koerVaerktoej("opret_booking", {
    ydelse_id: "komplet", dato: "2026-10-12", tid: "09:00", navn: " Mads ", telefon: "+45 12 34 56 78", bil: "VW Golf", note: "",
  }, c);
  assert.equal(svar.ok, true);
  assert.equal(c.opkald.haendelser[0].telefon, "12345678");
  assert.equal(c.opkald.haendelser[0].navn, "Mads");
});

test("opret_booking afviser forkert telefonnummer og lukkede dage", () => {
  const base = { ydelse_id: "komplet", tid: "09:00", navn: "Mads", bil: "", note: "" };
  assert.throws(() => koerVaerktoej("opret_booking", { ...base, dato: "2026-10-12", telefon: "1234" }, ctx()), /8 cifre/);
  assert.throws(() => koerVaerktoej("opret_booking", { ...base, dato: "2026-10-11", telefon: "12345678" }, ctx()), /ikke ledig/);
});

test("gem_besked og afslut_opkald opdaterer opkaldet", () => {
  const c = ctx();
  koerVaerktoej("gem_besked", { navn: "Lise", telefon: "87654321", aerinde: "Klage", haster: true }, c);
  koerVaerktoej("afslut_opkald", {}, c);
  assert.equal(c.opkald.haendelser[0].type, "besked");
  assert.equal(c.opkald.afsluttet, true);
});

test("kundefilen bliver tjekket for fejl", () => {
  const forkert = structuredClone(kunde);
  forkert.ydelser[0].pris = "gratis";
  delete forkert.aabningstider.soendag;
  assert.throws(() => tjekKunde(forkert), /gyldig pris/);
  assert.throws(() => tjekKunde(forkert), /mangler "soendag"/);
});
