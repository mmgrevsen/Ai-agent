import { test } from "node:test";
import assert from "node:assert/strict";
import { Kalender, datoTekst, ugedag } from "../src/kalender.js";
import { indlaesKunde } from "../src/kunde.js";

const kunde = indlaesKunde("glanspunkt");
// Fredag d. 9. oktober 2026 kl. 10:00
const nu = () => ({ dato: "2026-10-09", minutter: 10 * 60 });

test("ugedage og datotekst er korrekte", () => {
  assert.equal(ugedag("2026-10-09"), "fredag");
  assert.equal(ugedag("2026-10-11"), "soendag");
  assert.equal(datoTekst("2026-10-10"), "lørdag d. 10. oktober");
});

test("ingen tider om søndagen, og ingen tider før om 2 timer i dag", () => {
  const kal = new Kalender(kunde, { nu });
  assert.deepEqual(kal.ledigeTider({ ydelseId: "udvendig-vask", dato: "2026-10-11" }), []);
  const iDag = kal.ledigeTider({ ydelseId: "udvendig-vask", dato: "2026-10-09" });
  assert.equal(iDag[0].tid, "12:00");
});

test("behandlingen skal kunne nå at blive færdig før lukketid", () => {
  const kal = new Kalender(kunde, { nu });
  // Lørdag 09–13: keramisk coating (7 timer) kan ikke nås.
  assert.deepEqual(kal.ledigeTider({ ydelseId: "keramisk-coating", dato: "2026-10-10" }), []);
  const vask = kal.ledigeTider({ ydelseId: "polering", dato: "2026-10-10", max: 20 });
  assert.deepEqual(vask.map((t) => t.tid), ["09:00", "09:30", "10:00"]);
});

test("en booking optager tiden, og overlap afvises", () => {
  const kal = new Kalender(kunde, { nu });
  kal.book({ ydelseId: "komplet", dato: "2026-10-12", tid: "10:00", navn: "Test", telefon: "12345678" });
  assert.equal(kal.erLedig("2026-10-12", "11:00", 45), false);
  assert.equal(kal.erLedig("2026-10-12", "12:00", 45), true);
  assert.throws(() => kal.book({ ydelseId: "udvendig-vask", dato: "2026-10-12", tid: "11:30", navn: "X", telefon: "12345678" }), /ikke ledig/);
});

test("tidligst-filteret virker", () => {
  const kal = new Kalender(kunde, { nu });
  const tider = kal.ledigeTider({ ydelseId: "udvendig-vask", dato: "2026-10-12", tidligst: "13:15" });
  assert.equal(tider[0].tid, "13:30");
});
