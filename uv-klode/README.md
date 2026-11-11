# UV-kloden

En interaktiv 3D-jordklode, der viser det beregnede UV-indeks over hele verden. Den er lavet som model til den
fælles naturfagsprøve i 9. klasse (fysik/kemi, biologi og geografi) om hudkræft og UV-stråling.

- Drej kloden med musen, og zoom med musehjulet.
- Vælg dato og klokkeslæt (UTC). Dag/nat-grænsen og UV-farvelaget følger solens rigtige position.
- Tryk **Afspil året** for at se UV-bæltet flytte sig mod nord og syd.
- Skru på skydække og ozonlag.
- Klik et sted på kloden for at se solhøjde, UV-indeks og grafer for døgnet og året.
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

## Udfyld hudkræftdata (data/melanom.json)

Appen indeholder **ingen** hudkræfttal fra start – I skal selv slå dem op, så I ved præcis, hvor tallene kommer
fra. Filen `data/melanom.json` ser sådan ud:

```json
{
  "enhed": "nye tilfælde pr. 100.000 pr. år (aldersstandardiseret)",
  "lande": [
    { "land": "DNK", "rate": null, "kilde": "" },
    { "land": "AUS", "rate": null, "kilde": "" }
  ]
}
```

Sådan gør I:

1. Find tallet for **modermærkekræft (melanoma of skin)**, **incidence**, **ASR (World)**, begge køn, pr. 100.000:
   - Hele verden: Global Cancer Observatory, https://gco.iarc.who.int (Cancer Today).
   - Norden: NORDCAN, https://nordcan.iarc.fr.
2. Skriv tallet i `rate` med **punktum** som decimaltegn, fx `"rate": 31.2`.
3. Skriv kilden i `kilde`, fx `"kilde": "GLOBOCAN 2022, gco.iarc.who.int"`.
4. Tilføj flere lande ved at kopiere en linje. `land` er landets ISO3-kode med store bogstaver, fx
   `DNK` (Danmark), `SWE` (Sverige), `NOR` (Norge), `DEU` (Tyskland), `GBR` (Storbritannien),
   `USA`, `AUS` (Australien), `NZL` (New Zealand), `BRA` (Brasilien), `ZAF` (Sydafrika), `NGA` (Nigeria),
   `IND` (Indien), `JPN` (Japan). Koden for et land kan også slås op på Wikipedia under "ISO 3166-1 alpha-3".
5. Husk komma efter hver linje undtagen den sidste.
6. Kør `npm run build` igen, så tallene kommer med i `dist/index.html`.

Lande, hvor `rate` er `null`, vises som grå ("ingen data").

**Uden at bygge igen:** Vælg farvelaget *Modermærkekræft pr. 100.000* og tryk **Indlæs anden melanom.json …**.
Så kan man indlæse en udfyldt fil direkte i browseren. Den gemmes ikke – den er væk, når siden lukkes.

Hvis der er en fejl i filen (fx en forkert landekode), viser appen en besked om, hvilken linje der er galt.

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
│   ├── klode/                 3D-kloden: shader, grænser, teksturer
│   ├── ui/                    Paneler, grafer, faner
│   ├── data/                  Landegrænser og indlæsning af melanomdata
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
