# Plan: AI-receptionist som abonnement

**Målet:** Bygge én løsning, som mange lokale virksomheder betaler for hver måned. Vi starter med én branche (bilpleje), én demo og én første kunde – ikke et stort system.

## Hvorfor det her kan sælges

Små virksomheder mister kunder, når ingen tager telefonen, fordi de står med hænderne i en bil, en kunde eller et værktøj. En AI, der svarer korrekt, booker tider og sender et præcist referat, løser et problem, der koster dem penge.

Der findes allerede danske AI-receptionister, så markedet er der – men det betyder også, at en generisk "AI tager telefonen" ikke er nok. Vores vinkel er at være **specialiseret i én branche**: den kender behandlingerne, priserne og de spørgsmål, kunderne i netop den branche stiller.

## Faserne

### Fase 1 – Demo ✅ *(det, der ligger i repoet nu)*
- [x] Dansk AI-assistent med virksomhedens priser, åbningstider og ydelser
- [x] Svarer kun ud fra virksomhedens oplysninger – siger "det ved jeg ikke" i stedet for at gætte
- [x] Booking med kontrol af ledige tider
- [x] Gemmer beskeder, når den ikke kan hjælpe
- [x] Referat efter opkaldet
- [x] Test i browseren med tale ind og ud
- [x] Automatiske tests + samtaletests mod den rigtige AI

### Fase 2 – Første kunde
- [x] Forbindelse til Vapi bygget – se [VAPI.md](VAPI.md)
- [ ] Første rigtige testopkald gennem Vapi
- [ ] Dansk telefonnummer (importeret fra fx Twilio eller Telnyx)
- [ ] Fast adresse til serveren (hosting i stedet for tunnel)
- [ ] Kobl kalenderen til virksomhedens rigtige kalender (fx Google Kalender)
- [ ] Send referat og beskeder til indehaveren på SMS eller e-mail
- [ ] Viderestilling til en medarbejder, når AI'en er i tvivl
- [ ] Test med mindst 30 realistiske samtaler – også med baggrundsstøj, dialekter og danske navne

**Mål:** Én virksomhed, der vil betale.

### Fase 3 – Abonnementsprodukt
- [ ] Login for hver virksomhed og et dashboard med opkald, bookinger og forbrug
- [ ] Database (fx Supabase) med adskilte data pr. kunde
- [ ] Betaling og abonnementer
- [ ] Onboarding, så en ny kunde kan komme i gang uden at du skal kode
- [ ] Overvågning, fejllog og sikkerhedskopier

**Mål:** At kunne tilføje nye kunder uden at bygge noget om.

## Fra browser til rigtig telefon (fase 2)

Byg ikke telefoni og tale selv – det er svært og dyrt. Brug en platform, der klarer telefonnummer, tale-til-tekst, stemme og afbrydelser:

```
Kunde ringer → Telefonplatform (fx Vapi eller Retell AI)
                 ├─ tale → tekst
                 ├─ tekst → dansk stemme
                 └─ kalder vores server, når AI'en vil tjekke tider, booke eller gemme besked
```

Vapi er nu koblet på som "Custom LLM": Vapi klarer tale og telefon, og vores egen server er hjernen. Det betyder, at alt fra demoen bliver genbrugt – kundefilen, prompten, værktøjerne, kalenderen og referatet – og at vi selv vælger Claude-modellen. Vejledningen står i [VAPI.md](VAPI.md).

**Før du vælger platform:** Lav en gratis prøvekonto hos to platforme, giv dem den samme prompt, og ring selv ind med de samme 10 spørgsmål. Vurder dansk forståelse, stemmekvalitet, ventetid og pris pr. minut. Tjek de aktuelle priser på deres egne sider – de ændrer sig ofte.

## Økonomi – regn den igennem, før du sætter en pris

Pr. kunde pr. måned:

```
  Abonnement (fx 799 kr.)
– Telefonplatform: minutter × pris pr. minut
– AI (Claude): ca. 0,5–1,5 kr. pr. opkald med standardmodellen
– Telefonnummer, SMS og hosting
= Det, du har tilbage før skat, salg og din egen tid
```

Sælg en pakke med et fast antal minutter og en tydelig pris for ekstra minutter. Så taber du ikke penge på en kunde, der ringer meget.

## Plugins og værktøjer til Claude Code

Brug `/plugin` i Claude Code til at søge i markedspladsen. Disse er relevante for projektet – installer dem, når du når til den fase, hvor du skal bruge dem, ikke alle på én gang:

| Hvornår | Plugin / værktøj | Hvad det hjælper med |
|---|---|---|
| Nu | **Context7** | Henter opdateret dokumentation til biblioteker, så Claude ikke bruger forældede metoder |
| Nu | **Frontend Design** | Pænere brugerflader (testside, senere dashboard) |
| Nu | **Playwright** | Automatisk test af websiden i en browser |
| Fase 2 | Telefonplatformens egen dokumentation / MCP | Hvis Vapi, Retell eller Twilio tilbyder en MCP-server eller et plugin, så brug det til integrationen |
| Fase 3 | **Supabase** | Database, login og lagring til flere kunder |

Gennemgå altid, hvad et plugin får adgang til, før du installerer det, og installer kun fra kilder, du stoler på.

Indbygget i Claude Code (ingen installation): `/code-review` til at gennemgå din kode, `/security-review` før du sætter noget i drift, og `/init` til at lave en `CLAUDE.md`, så Claude kender projektet.

## Jura og ansvar – vigtigt

- **Fortæl, at det er en AI.** EU's AI-forordning kræver, at folk får at vide, når de taler med en AI. Det gør velkomsten allerede – fjern det ikke.
- **Persondata (GDPR).** Navne, telefonnumre og samtaler er persondata. Virksomheden er dataansvarlig, og du er databehandler, så I skal have en databehandleraftale. Gem kun det nødvendige – demoen gemmer tekst og referat, ikke lydoptagelser.
- **Optagelser.** Hvis du senere gemmer lyd, skal kunden have besked først, og der skal være et lovligt grundlag.
- **Du er 14.** Få en forælder med på aftaler, betaling, kontrakter og konti, før du sælger noget. Det er også dem, der skal hjælpe med fx et CVR-nummer eller fakturering.

## Plan for i morgen

| Tid | Opgave |
|---|---|
| 09.00–09.30 | Hent repoet, `npm install`, opret API-nøgle, `npm start` |
| 09.30–10.30 | Ring til demoen 10 gange. Skriv ned, hvad der virker, og hvad der lyder forkert |
| 10.30–11.30 | Ret `kunder/glanspunkt.json` og prompten ud fra dine noter. Kør `npm run samtaletest` |
| 11.30–12.00 | Lav en kundefil til en **rigtig** lokal bilplejevirksomhed ud fra deres hjemmeside |
| Efter frokost | Lav en 1-minuts skærmoptagelse af en samtale – den skal bruges, når du viser idéen til virksomheder |
| Senere på ugen | Prøvekonto hos to telefonplatforme og sammenlign dem (fase 2) |

Det vigtigste er ikke flere funktioner, men at finde ud af, om en rigtig virksomhed synes, det er værd at betale for.
