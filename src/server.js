// Webserver til demoen. Start med: npm start  →  åbn http://localhost:3000
// Ingen ekstra rammeværk – kun Node's indbyggede http-modul.

import Anthropic from "@anthropic-ai/sdk";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL, Receptionist } from "./agent.js";
import { Kalender } from "./kalender.js";
import { indlaesKunde } from "./kunde.js";
import { lavReferat } from "./referat.js";

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 3000;
const kunde = indlaesKunde(process.env.KUNDE || "glanspunkt");
const kalender = new Kalender(kunde, { fil: path.join(rod, "data", `bookinger-${kunde.id}.json`) });
const klient = new Anthropic();
const receptionist = new Receptionist(kunde, kalender, { klient });
const opkald = new Map(); // aktive opkald, nøgle = opkalds-id

const ruter = {
  "GET /api/kunde": () => ({
    navn: kunde.navn, assistent: kunde.assistent_navn, telefon: kunde.telefon, model: MODEL,
    ydelser: kunde.ydelser.map(({ navn, pris, pris_er_fra_pris }) => ({ navn, pris, fra: !!pris_er_fra_pris })),
  }),

  "POST /api/opkald": () => {
    const id = randomUUID();
    const nyt = receptionist.nytOpkald();
    opkald.set(id, nyt);
    return { id, svar: kunde.velkomst };
  },

  "POST /api/opkald/:id/besked": async ({ id, krop }) => {
    const o = hentOpkald(id);
    const tekst = String(krop.tekst ?? "").trim().slice(0, 1000);
    if (!tekst) throw new HttpFejl(400, "Tom besked.");
    if (o.optaget) throw new HttpFejl(409, "Vent på svaret på din sidste besked.");
    o.optaget = true;
    try {
      const svar = await receptionist.svar(o, tekst);
      return { svar, afsluttet: o.afsluttet, haendelser: o.haendelser };
    } finally {
      o.optaget = false;
    }
  },

  "POST /api/opkald/:id/afslut": async ({ id }) => {
    const o = hentOpkald(id);
    opkald.delete(id);
    const referat = await lavReferat(o, kunde, { klient });
    const gemt = { id, kunde: kunde.id, startet: o.startet, referat, haendelser: o.haendelser, transskription: o.transskription };
    mkdirSync(path.join(rod, "data", "opkald"), { recursive: true });
    writeFileSync(path.join(rod, "data", "opkald", `${o.startet.replace(/[:.]/g, "-")}_${id.slice(0, 8)}.json`), JSON.stringify(gemt, null, 2));
    return { referat };
  },

  "GET /api/bookinger": () => kalender.bookinger,
};

class HttpFejl extends Error {
  constructor(status, besked) { super(besked); this.status = status; }
}

function hentOpkald(id) {
  const o = opkald.get(id);
  if (!o) throw new HttpFejl(404, "Opkaldet findes ikke (er serveren genstartet?). Ring op igen.");
  return o;
}

function findRute(metode, sti) {
  for (const [noegle, haandtering] of Object.entries(ruter)) {
    const [m, monster] = noegle.split(" ");
    if (m !== metode) continue;
    const regex = new RegExp(`^${monster.replace(/:id/, "([\\w-]+)")}$`);
    const fund = regex.exec(sti);
    if (fund) return { haandtering, id: fund[1] };
  }
  return null;
}

// Oversætter fejl fra Claude API'et til beskeder, man kan handle på.
function oversaetFejl(fejl) {
  if (fejl instanceof HttpFejl) return [fejl.status, fejl.message];
  if (fejl instanceof Anthropic.AuthenticationError) return [500, "API-nøglen mangler eller er forkert. Læg din nøgle i .env-filen (se README) og genstart."];
  if (fejl instanceof Anthropic.RateLimitError) return [429, "For mange forespørgsler til Claude lige nu. Vent lidt og prøv igen."];
  if (fejl instanceof Anthropic.BadRequestError) return [500, `Claude afviste forespørgslen: ${fejl.message}`];
  if (fejl instanceof Anthropic.APIConnectionError) return [502, "Kunne ikke få forbindelse til Claude. Tjek internetforbindelsen."];
  if (fejl instanceof Anthropic.APIError) return [502, `Fejl fra Claude (${fejl.status}): ${fejl.message}`];
  if (/credentials|api key|apiKey|authToken/i.test(fejl.message)) return [500, "Ingen API-nøgle fundet. Læg din nøgle i .env-filen (se README) og genstart."];
  return [500, `Uventet fejl: ${fejl.message}`];
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

function serverFil(sti, res) {
  const fil = path.normalize(path.join(rod, "web", sti === "/" ? "index.html" : sti));
  if (!fil.startsWith(path.join(rod, "web"))) return false;
  try {
    const indhold = readFileSync(fil);
    res.writeHead(200, { "content-type": MIME[path.extname(fil)] ?? "application/octet-stream" });
    res.end(indhold);
    return true;
  } catch {
    return false;
  }
}

async function laesKrop(req) {
  let data = "";
  for await (const del of req) {
    data += del;
    if (data.length > 20_000) throw new HttpFejl(413, "For stor forespørgsel.");
  }
  if (!data) return {};
  try { return JSON.parse(data); } catch { throw new HttpFejl(400, "Ugyldig JSON."); }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const rute = findRute(req.method, url.pathname);
  if (!rute) {
    if (req.method === "GET" && serverFil(url.pathname, res)) return;
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Ikke fundet");
  }
  try {
    const krop = req.method === "POST" ? await laesKrop(req) : {};
    const resultat = await rute.haandtering({ id: rute.id, krop });
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(resultat));
  } catch (fejl) {
    const [status, besked] = oversaetFejl(fejl);
    if (status >= 500) console.error(fejl);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ fejl: besked }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  ${kunde.navn} – AI-receptionist (model: ${MODEL})`);
  console.log(`  Åbn http://localhost:${PORT} i Chrome eller Edge\n`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log("  Bemærk: ANTHROPIC_API_KEY er ikke sat. Se README, afsnit 'API-nøgle'.\n");
  }
});
