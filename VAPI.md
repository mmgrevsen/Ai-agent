# Rigtige telefonopkald med Vapi 📞

Her kobler du AI-receptionisten til et rigtigt telefonnummer. Vapi klarer telefonen, lytter til kunden og taler med en dansk stemme. **Hjernen er stadig din egen server**: prompten, bookingen, kalenderen og referatet er de samme som i browserdemoen.

```
Kunde ringer
   │
   ▼
Vapi ── tale → tekst (Deepgram, dansk)
   │    tekst → tale (Azure, dansk stemme)
   │
   │  "Kunden sagde: Hvad koster en vask?"
   ▼
Din server  /vapi/chat/completions
   └─ Claude + booking + kalender → "Det koster 349 kroner."
   │
   ▼  når der lægges på
Din server  /vapi/webhook  → referat gemmes i data/opkald/
```

Vapi skal kunne nå din server fra internettet. Mens du tester, laver du derfor en **tunnel** fra din computer. Senere flytter serveren ud på en rigtig hosting.

## Det skal du bruge

- Browserdemoen skal virke (se README) – med API-nøgle fra Anthropic
- En konto på [vapi.ai](https://vapi.ai). Få en forælder til at hjælpe, for der skal betales for minutter.
- Programmet `cloudflared` til tunnelen (gratis, ingen konto nødvendig)

## Trin for trin

### 1. Installer cloudflared

```bash
# Mac (kræver Homebrew – se brew.sh)
brew install cloudflared

# Windows (PowerShell)
winget install --id Cloudflare.cloudflared
```

### 2. Start serveren og tunnelen

Åbn **to** terminalvinduer i projektmappen.

```bash
# Vindue 1
npm start

# Vindue 2
cloudflared tunnel --url http://localhost:3000
```

Vindue 2 viser en adresse som `https://noget-tilfaeldigt.trycloudflare.com`. Den skal du bruge om lidt. Lad begge vinduer stå åbne.

### 3. Udfyld .env

Tilføj disse linjer (se også `.env.example`):

```
VAPI_API_KEY=din-private-nøgle-fra-dashboard.vapi.ai
OFFENTLIG_URL=https://noget-tilfaeldigt.trycloudflare.com
VAPI_HEMMELIGHED=
```

Vapi-nøglen finder du på [dashboard.vapi.ai](https://dashboard.vapi.ai) under **API Keys**. Brug den **private** nøgle, ikke den offentlige.

Lad `VAPI_HEMMELIGHED` stå tom første gang. Scriptet i næste trin laver en til dig.

### 4. Opret assistenten hos Vapi

```bash
npm run vapi:opsaet
```

Første gang siger scriptet, at `VAPI_HEMMELIGHED` mangler, og giver dig en linje, du kan kopiere ind i `.env`. Genstart så serveren i vindue 1 (Ctrl+C, derefter `npm start`), og kør scriptet igen.

Når det lykkes, får du en `VAPI_ASSISTENT_ID`, som du også lægger i `.env`. Så opdaterer scriptet den samme assistent næste gang i stedet for at lave en ny.

### 5. Test i browseren hos Vapi

Gå til **Assistants** på dashboard.vapi.ai, vælg assistenten, og tryk på **Talk to Assistant**. Det er en rigtig samtale gennem Vapi, bare uden telefonnummer. Kig i vindue 1 imens – fejl vises der.

### 6. Tilknyt et telefonnummer

Under **Phone Numbers** opretter eller importerer du et nummer og vælger din assistent.

- **Gratis nummer fra Vapi:** Så vidt jeg kan se i Vapis API, vælger man områdenummer, så det er amerikanske numre. Fint til at teste, men det koster udlandstakst at ringe fra Danmark.
- **Dansk nummer:** Køb et dansk nummer hos fx Twilio eller Telnyx, og importér det i Vapi. Danske numre kræver typisk dokumentation for adresse, så det tager lidt tid. Gør det, når du har en rigtig kunde.

## Hver gang du starter igen

Den gratis tunnel får en **ny adresse** hver gang. Så skal du:

1. Starte `npm start` og `cloudflared tunnel --url http://localhost:3000`
2. Sætte den nye adresse i `OFFENTLIG_URL`
3. Køre `npm run vapi:opsaet`

Senere kan du få en fast adresse ved at lægge serveren på en hosting (fx Render, Railway eller Fly.io) eller ved at oprette en navngivet Cloudflare-tunnel.

## Sikkerhed

- **Nøglen:** Vapi sender `VAPI_HEMMELIGHED` med hver forespørgsel. Uden den afviser serveren kaldet, så fremmede ikke kan bruge din Claude-kredit via tunneladressen.
- **Testsiden:** Den kan kun bruges fra din egen computer. Alt, der kommer gennem tunnelen, bliver afvist – undtagen `/vapi`.
- **Del aldrig `.env`:** Hverken med andre eller på GitHub.

## Fejlfinding

| Problem | Løsning |
|---|---|
| `Kan ikke nå din server` | Kører både `npm start` og tunnelen? Er `OFFENTLIG_URL` den nyeste adresse? |
| AI'en siger "teknisk fejl" | Se fejlen i vindue 1. Ofte mangler eller er `ANTHROPIC_API_KEY` forkert. |
| `Forkert nøgle` i loggen | `VAPI_HEMMELIGHED` er ændret. Genstart serveren og kør `npm run vapi:opsaet` igen. |
| Lang pause før hvert svar | Prøv `MODEL=claude-haiku-5-5` i `.env`, og kør `npm run samtaletest` for at se, om svarene stadig er gode nok. |
| Den hører forkert | Tal tydeligt og tæt på telefonen. Navne og adresser er sværest – AI'en gentager telefonnummeret, så fejl kan rettes. |
| Opkaldet slutter ikke | Kunden kan altid selv lægge på. Står der `Kunne ikke bede Vapi om at lægge på` i loggen, så skriv fejlen ned. |

## Det er ikke testet endnu

Integrationen er bygget efter Vapis officielle SDK-typer og testet med automatiske tests og den officielle OpenAI-klient (det format, Vapi taler). Den er **ikke** testet med et rigtigt opkald gennem Vapi endnu. Det er det første, du gør. Hold især øje med:

- om afskeden bliver sagt, og at opkaldet så slutter
- hvor lang pausen er, før AI'en svarer
- om referatet dukker op i `data/opkald/`, efter du har lagt på

## Ting, der kan gøres bedre senere

- **Hurtigere svar:** Lige nu venter serveren på hele svaret fra Claude, før det sendes til Vapi. Med streaming kan stemmen begynde efter første sætning.
- **Afbrydelser:** Afbryder kunden AI'en, husker serveren alligevel hele svaret, som om det blev sagt.
- **Referat til indehaveren:** Send referatet som SMS eller e-mail i stedet for kun at gemme det i en fil.
