# UV-kloden

En interaktiv 3D-jordklode, der viser det beregnede UV-indeks over hele verden. Den er lavet som model til den
fælles naturfagsprøve i 9. klasse (fysik/kemi, biologi og geografi) om hudkræft og UV-stråling.

- Drej kloden med musen, og zoom med musehjulet.
- Vælg dato og klokkeslæt (UTC). Dag/nat-grænsen og UV-farvelaget følger solens rigtige position.
- Tryk **Afspil året** for at se UV-bæltet flytte sig mod nord og syd.
- Skru på skydække og ozonlag.
- Klik et sted på kloden for at se solhøjde, UV-indeks og grafer for døgnet og året. Hold musen over kloden for en hurtig aflæsning.
- En animeret sol ved siden af kloden står i den retning, solen faktisk er – dag/nat-grænsen vender altid væk fra den.
- Den gule prik viser solpunktet, hvor solen står lodret. Sol, ækvator, vendekredse og polarcirkler kan slås til og fra.
- Mellemrumstasten starter og stopper afspilningen.
- Skift farvelaget til **Modermærkekræft pr. 100.000** for at sammenligne med UV-kortet.
- Fanen **København og Sydney** viser de to byer side om side.
- Fanen **Om modellen** forklarer beregningerne, begrænsningerne og et tjek mod virkeligheden.

Appen virker helt uden internet: alle biblioteker, landegrænser og data ligger i projektet.

## Kom i gang

Du skal have [Node.js](https://nodejs.org) version 22 eller nyere installeret (kun når du udvikler eller bygger
– ikke for at bruge den færdige app).

Kør disse kommandoer i mappen `uv-klode`:

```bash
npm install
```

```bash
npm run dev
```

Åbn adressen, der bliver vist (normalt http://localhost:5173).

Andre kommandoer:

| Kommando        | Hvad den gør                                                     |
| --------------- | ---------------------------------------------------------------- |
| `npm test`      | Kører enhedstestene af modellen (solhøjde, UV-indeks, data)      |
| `npm run build` | Bygger den færdige app til `dist/index.html`                     |
| `npm run preview` | Viser den byggede app i browseren via en lokal server          |
| `npm run geodata` | Laver `src/data/lande-110m.json` igen ud fra den rå Natural Earth-fil |

## Brug uden internet (fx på en skolecomputer)

1. Kør `npm run build` på en computer, hvor projektet er installeret.
2. Kopiér filen `dist/index.html` over på skolecomputeren (USB-stik, OneDrive, mail …).
3. Dobbeltklik på filen. Den åbner i browseren og virker uden internet og uden webserver.

Hele appen (JavaScript, styling, landegrænser og melanomdata) er samlet i den ene HTML-fil, så der ikke er andre
filer, der kan blive væk. Brug en nyere udgave af Chrome, Edge, Firefox eller Safari. Kloden bruger WebGL 2, som
alle nyere browsere og bærbare har.

## Hudkræftdata (data/melanom.json)

Appen opfinder ingen tal. Lige nu indeholder filen ét bekræftet tal: **Danmark 27,8** pr. 100.000
(GLOBOCAN 2024, GCO's faktaark for Danmark). De øvrige lande skal hentes fra kilden.

### Den hurtige vej: CSV-fil fra GCO (alle lande på én gang)

1. Gå ind på Global Cancer Observatory – Cancer Today: https://gco.iarc.who.int/today
2. Vælg en **tabel** med: Incidence, **Melanoma of skin**, begge køn, alle aldre, alle lande,
   og målet **ASR (World)** pr. 100.000.
3. Download tabellen som **CSV**.
   Hent den som **XLSX** (Excel) eller **CSV** – appen kan læse begge.
4. Indlæs den på én af to måder:
   - **I appen (også på hjemmesiden):** vælg farvelaget *Modermærkekræft pr. 100.000* og tryk
     **Indlæs data fra GCO (.xlsx/.csv) …**. Tallene vises med det samme, men gemmes ikke.
   - **Permanent i projektet:** kør

     ```bash
     npm run importer-gco -- sti/til/filen.xlsx "GLOBOCAN 2024, gco.iarc.who.int"
     ```

     Så skrives tallene ind i `data/melanom.json` med kilden. Byg derefter igen med `npm run build`.

Appen finder selv kolonnerne med landekode (talkode som 208, bogstavkode som DNK eller landenavnet) og ASR.
Verdensdele og "World" springes over. Lande, den ikke kan genkende, bliver vist i en advarsel.

**Vigtigt:** tabellen skal være for **Melanoma of skin** alene. Henter man "All cancers", siger appen fra med en
besked i stedet for at vise forkerte tal (GCO's kode for modermærkekræft er 16, alle kræftformer er 39).

### Den manuelle vej: skriv tallene ind selv

Filen ser sådan ud:

```json
{
  "lande": [
    { "land": "DNK", "rate": 27.8, "kilde": "GLOBOCAN 2024, GCO Cancer Today" },
    { "land": "AUS", "rate": null, "kilde": "" }
  ]
}
```

- `land` er ISO3-koden, fx `DNK`, `SWE`, `NOR`, `AUS`, `NZL`, `USA`, `BRA`, `ZAF`, `NGA`, `IND`, `JPN`.
- `rate` er tallet med **punktum** som decimaltegn. `null` betyder "ingen data" (gråt på kortet).
- `kilde` er, hvor tallet kommer fra. NORDCAN (https://nordcan.iarc.fr) kan bruges til de nordiske lande.
- Husk komma efter hver linje undtagen den sidste, og byg igen med `npm run build`.

## Modellen

Al fysik ligger i `src/model/` og er kommenteret med kilder:

- `sol.js` – solens deklination og tidsligningen (NOAA's formler), timevinklen og solhøjden:
  `sin(h) = sin(φ)·sin(δ) + cos(φ)·cos(δ)·cos(timevinkel)`.
- `uv.js` – UV-indeks ved skyfri himmel med Madronichs formel
  `UVI ≈ 12,5 · cos(θ)^2,42 · (ozon/300)^(−1,23)`, en **forenklet** skydæmpning (1 − 0,7·s²) og WHO's farveskala.

Farvelaget på kloden beregnes i en shader (`src/klode/shader.js`) med præcis de samme formler for hver pixel.

Vigtige forenklinger: ozonlaget er ens over hele kloden, skyerne er forenklede, og højde over havet samt refleksion
fra sne, sand og vand er ikke med. Se fanen *Om modellen* i appen.

## Projektets opbygning

```
uv-klode/
├── data/melanom.json          Hudkræfttal (udfyldes af jer)
├── geodata/                   Rå Natural Earth-fil (1:110m landegrænser, public domain)
├── scripts/forbered-geodata.mjs  Gør landegrænserne små nok til appen
├── src/
│   ├── model/                 Fysikken: solens position og UV-indeks
│   ├── klode/                 3D-kloden og solen: shaders, grænser, teksturer
│   ├── ui/                    Paneler, grafer, faner
│   ├── data/                  Landegrænser, melanomdata og læsere af GCO-filer (.csv/.xlsx)
│   └── App.jsx                Samler det hele
└── test/model.test.js         Enhedstests
```

Teknik: Vite, React, Three.js via react-three-fiber, d3-geo (til landegrænser) og Vitest (tests).

## Kilder

- NOAA Global Monitoring Laboratory: *General Solar Position Calculations*.
- S. Madronich (2007): *Analytic formula for the clear-sky UV Index*, Photochemistry and Photobiology 83, s. 1537–1538.
- WHO m.fl. (2002): *Global Solar UV Index – A Practical Guide*.
- Natural Earth: *Admin 0 – Countries*, 1:110m (public domain).
- Kræftens Bekæmpelse: oplysninger om UV-indeks i Danmark.
