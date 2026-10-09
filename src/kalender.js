// En simpel kalender, der finder ledige tider ud fra åbningstider og
// eksisterende bookinger. Den gemmer i en JSON-fil, så den er nem at kigge i.
// Senere kan den udskiftes med Google Kalender eller et bookingsystem.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UGEDAGE, fraMinutter, tilMinutter } from "./kunde.js";

const TIDSZONE = "Europe/Copenhagen";
const UGEDAG_TEKST = { soendag: "søndag", mandag: "mandag", tirsdag: "tirsdag", onsdag: "onsdag", torsdag: "torsdag", fredag: "fredag", loerdag: "lørdag" };
const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

// Dato og klokkeslæt i Danmark lige nu, uanset hvilken tidszone serveren kører i.
export function nuIDanmark(dato = new Date()) {
  const dele = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIDSZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(dato).map((d) => [d.type, d.value]),
  );
  return { dato: `${dele.year}-${dele.month}-${dele.day}`, minutter: Number(dele.hour) * 60 + Number(dele.minute) };
}

export function ugedag(dato) {
  const [a, m, d] = dato.split("-").map(Number);
  return UGEDAGE[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

export function laegDageTil(dato, dage) {
  const [a, m, d] = dato.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dage)).toISOString().slice(0, 10);
}

// "torsdag d. 15. oktober" – sådan siger man en dato i telefonen.
export function datoTekst(dato) {
  const [, m, d] = dato.split("-").map(Number);
  return `${UGEDAG_TEKST[ugedag(dato)]} d. ${d}. ${MAANEDER[m - 1]}`;
}

export class Kalender {
  constructor(kunde, { fil = null, nu = () => nuIDanmark() } = {}) {
    this.kunde = kunde;
    this.fil = fil;
    this.nu = nu;
    this.bookinger = fil && existsSync(fil) ? JSON.parse(readFileSync(fil, "utf8")) : [];
  }

  ydelse(id) {
    return this.kunde.ydelser.find((y) => y.id === id) ?? null;
  }

  erLedig(dato, tid, varighed) {
    const aabning = this.kunde.aabningstider[ugedag(dato)];
    if (!aabning) return false;
    const start = tilMinutter(tid);
    const slut = start + varighed;
    if (!(start >= tilMinutter(aabning.aaben) && slut <= tilMinutter(aabning.luk))) return false;

    const nu = this.nu();
    const foersteMulige = dato === nu.dato
      ? nu.minutter + this.kunde.booking.foerste_tid_tidligst_om_timer * 60
      : -Infinity;
    if (dato < nu.dato || start < foersteMulige) return false;
    if (dato > laegDageTil(nu.dato, this.kunde.booking.dage_frem)) return false;

    // Demoen har én vaskeplads, så to bookinger må ikke overlappe.
    return !this.bookinger.some((b) => {
      if (b.dato !== dato) return false;
      const bStart = tilMinutter(b.tid);
      return start < bStart + b.varighed_min && bStart < slut;
    });
  }

  ledigeTider({ ydelseId, dato = "", tidligst = "", max = 6 }) {
    const y = this.ydelse(ydelseId);
    if (!y) throw new Error(`Ukendt ydelse "${ydelseId}".`);
    const { interval_min: trin, dage_frem } = this.kunde.booking;
    const idag = this.nu().dato;
    const dage = dato ? [dato] : Array.from({ length: dage_frem + 1 }, (_, i) => laegDageTil(idag, i));
    const fund = [];
    for (const d of dage) {
      const aabning = this.kunde.aabningstider[ugedag(d)];
      if (!aabning) continue;
      const aaben = tilMinutter(aabning.aaben);
      // Rund "tidligst" op til næste faste tid, så tiderne altid ligger på fx hele og halve timer.
      const fra = aaben + Math.max(0, Math.ceil(((tidligst ? tilMinutter(tidligst) : 0) - aaben) / trin) * trin);
      for (let start = fra; start + y.varighed_min <= tilMinutter(aabning.luk); start += trin) {
        const tid = fraMinutter(start);
        if (this.erLedig(d, tid, y.varighed_min)) fund.push({ dato: d, dag: datoTekst(d), tid });
        if (fund.length >= max) return fund;
      }
    }
    return fund;
  }

  book({ ydelseId, dato, tid, navn, telefon, bil = "", note = "" }) {
    const y = this.ydelse(ydelseId);
    if (!y) throw new Error(`Ukendt ydelse "${ydelseId}".`);
    if (!this.erLedig(dato, tid, y.varighed_min)) {
      throw new Error(`Tiden ${datoTekst(dato)} kl. ${tid} er ikke ledig til ${y.navn}.`);
    }
    const booking = {
      id: `B${Date.now().toString(36).toUpperCase()}`,
      oprettet: new Date().toISOString(),
      ydelse_id: y.id, ydelse: y.navn, pris: y.pris, varighed_min: y.varighed_min,
      dato, dag: datoTekst(dato), tid, navn, telefon, bil, note,
    };
    this.bookinger.push(booking);
    this.gem();
    return booking;
  }

  gem() {
    if (!this.fil) return;
    mkdirSync(path.dirname(this.fil), { recursive: true });
    writeFileSync(this.fil, JSON.stringify(this.bookinger, null, 2));
  }
}
