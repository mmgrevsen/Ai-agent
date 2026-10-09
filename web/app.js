// Testsiden: lader dig "ringe" til AI-receptionisten fra browseren.
// Tale → tekst og tekst → tale klares af browseren selv (gratis), så du kan
// teste samtalerne, før du betaler for et rigtigt telefonnummer.

const $ = (id) => document.getElementById(id);
const el = (tag, klasse, tekst) => {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};
const kr = (n) => `${n.toLocaleString("da-DK")} kr.`;
const tlf = (n) => String(n).replace(/(\d{2})(?=\d)/g, "$1 ");

let opkaldId = null;
let afventer = false;
let lytter = false;
let startTid = 0;
let ur = null;

// ---------- Tale ----------
const Genkendelse = window.SpeechRecognition || window.webkitSpeechRecognition;
const genkendelse = Genkendelse ? new Genkendelse() : null;
let danskStemme = null;

function findStemme() {
  const stemmer = speechSynthesis.getVoices();
  danskStemme = stemmer.find((s) => s.lang === "da-DK") ?? stemmer.find((s) => s.lang?.startsWith("da")) ?? null;
}
if ("speechSynthesis" in window) {
  findStemme();
  speechSynthesis.onvoiceschanged = findStemme;
}

function tal(tekst) {
  return new Promise((faerdig) => {
    if (!$("oplaesning").checked || !("speechSynthesis" in window)) return faerdig();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tekst);
    u.lang = "da-DK";
    if (danskStemme) u.voice = danskStemme;
    u.rate = 1.05;
    u.onend = u.onerror = () => faerdig();
    speechSynthesis.speak(u);
  });
}

if (genkendelse) {
  genkendelse.lang = "da-DK";
  genkendelse.interimResults = true;
  genkendelse.continuous = false;

  let foreloebig = null;
  genkendelse.onresult = (e) => {
    const resultat = e.results[e.results.length - 1];
    const tekst = resultat[0].transcript.trim();
    if (!foreloebig) foreloebig = tilfoej("kunde taenker", tekst);
    foreloebig.textContent = tekst;
    if (resultat.isFinal) {
      foreloebig.remove();
      foreloebig = null;
      if (tekst) send(tekst);
    }
  };
  genkendelse.onend = () => {
    foreloebig?.remove();
    foreloebig = null;
    saetLytter(false);
  };
  genkendelse.onerror = (e) => {
    if (e.error === "not-allowed") hint("Mikrofonen er blokeret. Tillad mikrofon i browserens adresselinje.");
    else if (e.error !== "no-speech" && e.error !== "aborted") hint(`Talegenkendelse: ${e.error}`);
  };
}

function lyt() {
  if (!genkendelse || !opkaldId || afventer || lytter) return;
  speechSynthesis.cancel();
  try {
    genkendelse.start();
    saetLytter(true);
  } catch { /* kører allerede */ }
}

function saetLytter(paa) {
  lytter = paa;
  $("mikrofon").setAttribute("aria-pressed", String(paa));
  $("mikrofon").textContent = paa ? "⏹ Stop" : "🎤 Tal";
  $("prik").className = `prik ${paa ? "lytter" : opkaldId ? "aktiv" : ""}`;
  if (opkaldId) $("status").textContent = paa ? "Lytter …" : afventer ? "Assistenten tænker …" : "I opkald";
}

// ---------- Samtale ----------
function tilfoej(klasse, tekst) {
  const li = el("li", klasse, tekst);
  $("samtale").append(li);
  li.scrollIntoView({ block: "end", behavior: "smooth" });
  return li;
}

function hint(tekst) { $("hint").textContent = tekst; }

async function api(sti, krop) {
  const svar = await fetch(sti, {
    method: krop === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: krop === undefined ? undefined : JSON.stringify(krop),
  });
  const data = await svar.json().catch(() => ({}));
  if (!svar.ok) throw new Error(data.fejl ?? `Serverfejl (${svar.status})`);
  return data;
}

async function ringOp() {
  $("samtale").replaceChildren();
  $("haendelser").className = "kort tomt";
  $("haendelser").textContent = "Bookinger og beskeder fra opkaldet vises her.";
  $("referat").className = "kort tomt";
  $("referat").textContent = "Læg på for at få et referat.";
  hint("");
  try {
    const { id, svar } = await api("/api/opkald", {});
    opkaldId = id;
    startTid = Date.now();
    ur = setInterval(visTid, 1000);
    visTid();
    $("ring").textContent = "Læg på";
    $("ring").classList.add("laeg-paa");
    for (const id of ["input", "send"]) $(id).disabled = false;
    $("mikrofon").disabled = !genkendelse;
    if (!genkendelse) hint("Din browser understøtter ikke talegenkendelse. Brug Chrome eller Edge – eller skriv i feltet.");
    else if (!danskStemme) hint("Der er ingen dansk oplæsningsstemme i din browser, så stemmen kan lyde forkert.");
    saetLytter(false);
    tilfoej("assistent", svar);
    await tal(svar);
    if ($("haandfri").checked) lyt();
    else $("input").focus();
  } catch (fejl) {
    tilfoej("fejl", fejl.message);
  }
}

async function send(tekst) {
  if (!opkaldId || afventer) return;
  tilfoej("kunde", tekst);
  afventer = true;
  saetLytter(false);
  const venter = tilfoej("assistent taenker", "…");
  try {
    const { svar, afsluttet, haendelser } = await api(`/api/opkald/${opkaldId}/besked`, { tekst });
    venter.remove();
    tilfoej("assistent", svar);
    visHaendelser(haendelser);
    afventer = false;
    saetLytter(false);
    await tal(svar);
    if (afsluttet) return laegPaa();
    if ($("haandfri").checked) lyt();
  } catch (fejl) {
    venter.remove();
    tilfoej("fejl", fejl.message);
    afventer = false;
    saetLytter(false);
  }
}

async function laegPaa() {
  if (!opkaldId) return;
  const id = opkaldId;
  opkaldId = null;
  genkendelse?.abort();
  speechSynthesis.cancel();
  clearInterval(ur);
  for (const knap of ["input", "send", "mikrofon"]) $(knap).disabled = true;
  $("ring").textContent = "📞 Ring op";
  $("ring").classList.remove("laeg-paa");
  $("status").textContent = "Opkaldet er afsluttet";
  $("prik").className = "prik";
  tilfoej("system", "— Lagt på —");
  $("referat").className = "kort tomt";
  $("referat").textContent = "Laver referat …";
  try {
    const { referat } = await api(`/api/opkald/${id}/afslut`, {});
    visReferat(referat);
    visBookinger();
  } catch (fejl) {
    $("referat").textContent = fejl.message;
  }
}

function visTid() {
  const s = Math.floor((Date.now() - startTid) / 1000);
  $("tid").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function raekke(dl, navn, vaerdi) {
  if (vaerdi === undefined || vaerdi === "") return;
  dl.append(el("dt", "", navn), el("dd", "", String(vaerdi)));
}

function visHaendelser(haendelser) {
  if (!haendelser.length) return;
  const boks = $("haendelser");
  boks.className = "kort";
  boks.replaceChildren(...haendelser.map((h) => {
    const div = el("div", "haendelse");
    const dl = el("dl");
    if (h.type === "booking") {
      div.append(el("span", "maerke", "Booking"), el("strong", "", `${h.ydelse} · ${h.dag} kl. ${h.tid}`));
      raekke(dl, "Navn", h.navn); raekke(dl, "Telefon", tlf(h.telefon)); raekke(dl, "Bil", h.bil);
      raekke(dl, "Pris", kr(h.pris)); raekke(dl, "Note", h.note);
    } else if (h.type === "besked") {
      div.append(el("span", "maerke besked", h.haster ? "Besked · haster" : "Besked"), el("strong", "", "Ring kunden op"));
      raekke(dl, "Navn", h.navn); raekke(dl, "Telefon", tlf(h.telefon)); raekke(dl, "Ærinde", h.aerinde);
    } else {
      div.append(el("span", "maerke", h.type), el("span", "", h.grund ?? ""));
    }
    div.append(dl);
    return div;
  }));
}

const KATEGORI = { booking: "Booking", prisforespoergsel: "Prisforespørgsel", besked: "Besked", klage: "Klage", andet: "Andet" };

function visReferat(r) {
  const boks = $("referat");
  boks.className = "kort";
  const dl = el("dl");
  raekke(dl, "Kategori", KATEGORI[r.kategori] ?? r.kategori);
  raekke(dl, "Kunde", r.kundens_navn);
  raekke(dl, "Stemning", r.stemning);
  raekke(dl, "Varighed", `${r.varighed_sek} sek.`);
  raekke(dl, "Opfølgning", r.opfoelgning_noedvendig ? r.opfoelgning || "Ja" : "Ingen");
  boks.replaceChildren(el("p", "", r.resume), dl);
}

async function visBookinger() {
  const liste = $("bookinger");
  const bookinger = await api("/api/bookinger").catch(() => []);
  liste.replaceChildren(...(bookinger.length
    ? bookinger.map((b) => el("li", "", `${b.dag} kl. ${b.tid} – ${b.ydelse} – ${b.navn} (${tlf(b.telefon)})`))
    : [el("li", "", "Ingen bookinger endnu.")]));
}

// ---------- Opstart ----------
$("ring").onclick = () => (opkaldId ? laegPaa() : ringOp());
$("mikrofon").onclick = () => (lytter ? genkendelse.stop() : lyt());
$("skriv").onsubmit = (e) => {
  e.preventDefault();
  const tekst = $("input").value.trim();
  if (!tekst) return;
  $("input").value = "";
  genkendelse?.abort();
  send(tekst);
};
document.querySelectorAll(".forslag li").forEach((li) => {
  li.onclick = () => {
    if (!opkaldId) return hint("Ring op først – så kan du klikke på et testspørgsmål.");
    send(li.firstChild.textContent.trim());
  };
});
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && document.activeElement !== $("input") && opkaldId && !$("mikrofon").disabled) {
    e.preventDefault();
    lytter ? genkendelse.stop() : lyt();
  }
});

api("/api/kunde").then((k) => {
  $("firmanavn").textContent = k.navn;
  document.title = `${k.navn} – AI-receptionist`;
  $("model").textContent = `Model: ${k.model}`;
  $("ydelser").replaceChildren(...k.ydelser.map((y) => el("li", "", `${y.navn}: ${y.fra ? "fra " : ""}${kr(y.pris)}`)));
}).catch((fejl) => tilfoej("fejl", fejl.message));
visBookinger();
