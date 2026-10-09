# AI-receptionist 📞

En dansktalende AI, der tager telefonen for lokale virksomheder: svarer på spørgsmål om priser og åbningstider, booker tider og sender et referat til virksomheden efter hvert opkald.

Dette er **fase 1 – demoen**. Du tester den i browseren med din egen stemme, før du betaler for et rigtigt telefonnummer. Demo-kunden er den fiktive bilplejevirksomhed *Glanspunkt Bilpleje*.

> Forretningsplanen, de næste faser og plugins til Claude Code står i [PLAN.md](PLAN.md).
> **Rigtige telefonopkald via Vapi:** se [VAPI.md](VAPI.md).

## Hvad kan den?

- Taler dansk (og engelsk, hvis kunden gør) og fortæller fra start, at den er en AI
- Svarer **kun** ud fra virksomhedens egne oplysninger – gætter aldrig på priser
- Finder ledige tider og booker, efter at kunden har bekræftet aftalen
- Gemmer en besked, når den ikke selv kan hjælpe (klager, særlige ønsker osv.)
- Laver et referat efter opkaldet: hvad kunden ville, stemning, og om nogen skal ringe tilbage
- Tale ind og ud direkte i browseren (gratis) – eller skriv, hvis du ikke vil tale

## Kom i gang

Du skal bruge [Node.js](https://nodejs.org) version 22 eller nyere og en API-nøgle fra Anthropic.

**1. Hent projektet og installer**

```bash
git clone https://github.com/mmgrevsen/Ai-agent.git
cd Ai-agent
npm install
```

**2. API-nøgle**

Opret en nøgle på [console.anthropic.com](https://console.anthropic.com) under *API Keys* (du skal indbetale lidt kredit først – få en forælder til at hjælpe med betalingen). Lav derefter din `.env`-fil:

```bash
# Mac
cp .env.example .env
# Windows (PowerShell)
copy .env.example .env
```

Åbn `.env` og indsæt nøglen efter `ANTHROPIC_API_KEY=`. Del aldrig nøglen med nogen, og læg den aldrig på GitHub.

**3. Start**

```bash
npm start
```

Åbn <http://localhost:3000> i **Chrome** eller **Edge** (de understøtter dansk talegenkendelse). Tryk *Ring op*, og tillad mikrofonen.

> Tip på Mac: Hvis oplæsningen lyder engelsk, så installer den danske stemme under *Systemindstillinger → Tilgængelighed → Oplæst indhold → Systemstemme → Administrer stemmer → Dansk*.

## Test den

| Kommando | Hvad den gør |
|---|---|
| `npm test` | Tjekker kalender, værktøjer og prompt. Gratis – kræver ingen nøgle. |
| `npm run samtaletest` | Kører 7 rigtige samtaler mod AI'en og tjekker svarene automatisk (koster ca. et par kroner). |
| `npm run opkaldstest` | **Stresstest:** En AI ringer på 50 forskellige måder (booking, klager, engelsk, vrede kunder, snyd …), og en AI-dommer bedømmer hvert opkald. Rapport i `rapporter/`. Koster groft anslået 40–80 kr. – start med `-- --antal 5`. |
| `npm run dev` | Som `npm start`, men genstarter selv, når du ændrer koden. |
| `npm run vapi:opsaet` | Opretter/opdaterer assistenten hos Vapi (se VAPI.md). |

Kør `npm run samtaletest`, hver gang du ændrer prompten eller en kundefil. Den fanger fx, hvis AI'en begynder at opfinde priser.

I højre side af testsiden ligger der også testspørgsmål, du kan klikke på – bl.a. nogle, der prøver at narre AI'en.

## Ny virksomhed? Ny JSON-fil

Al viden om en virksomhed ligger i én fil i mappen `kunder/`. Sådan laver du en ny:

1. Kopiér `kunder/glanspunkt.json` til fx `kunder/frisor-hansen.json`
2. Ret navn, velkomst, åbningstider, ydelser, priser og ofte stillede spørgsmål
3. Sæt `KUNDE=frisor-hansen` i `.env` og genstart

Serveren tjekker filen, når den starter, og siger præcis hvad der er galt, hvis noget mangler.

## Sådan hænger koden sammen

```
kunder/glanspunkt.json   Virksomhedens oplysninger (det eneste du retter pr. kunde)
src/prompt.js            Bygger AI'ens instruktioner ud fra kundefilen
src/agent.js             Samtalemotoren: sender samtalen til Claude og kører værktøjer
src/vaerktoejer.js       Det AI'en kan gøre: tjekke tider, booke, gemme besked, lægge på
src/kalender.js          Ledige tider ud fra åbningstider og bookinger
src/referat.js           Referat til virksomheden efter opkaldet
src/server.js            Webserveren
src/vapi.js              Forbindelsen til Vapi (rigtige telefonopkald)
scripts/vapi-opsaet.js   Opretter/opdaterer assistenten hos Vapi
web/                     Testsiden med tale i browseren
data/                    Bookinger og gemte opkald (oprettes automatisk, kommer ikke på GitHub)
```

Det vigtigste designvalg: **AI'en bestemmer, hvad der skal ske – koden kontrollerer, at det er gyldigt.** AI'en kan fx ikke booke en tid, der er optaget eller ligger en søndag, for `kalender.js` siger nej, og så må AI'en finde en anden tid.

## Model og pris

Standard er `claude-opus-5-5` med lav "effort", så svarene kommer hurtigt. Groft regnet koster AI-delen omkring 0,5–1,5 kr. pr. opkald. Vil du have det billigere og hurtigere, kan du prøve `MODEL=claude-haiku-5-5` i `.env` – men kør `npm run samtaletest` bagefter og se, om svarene stadig er gode nok.

Telefoni (nummer, tale-til-tekst, stemme) kommer oveni, når du går fra browserdemo til rigtige opkald – se PLAN.md.

## Kendte begrænsninger i demoen

- Opkald, der er i gang, ligger kun i hukommelsen – genstarter du serveren, forsvinder de (gemte opkald og bookinger bliver liggende i `data/`).
- Kalenderen har én vaskeplads og er ikke koblet til en rigtig kalender endnu.
- Browserens stemme er robotagtig. Rigtige telefonplatforme har langt bedre danske stemmer.
- Der er intet login – demoen er kun til at køre på din egen computer.
