/** Fanen "Om modellen": forklaring på 9. klasses niveau + tjek mod virkeligheden. */
import { maksUvPaaDagen, STANDARD_OZON } from '../model/uv.js';
import { solhoejdeVedMiddag } from '../model/sol.js';
import { tal } from './format.js';

// Steder og datoer til tjekket mod virkeligheden. Tallene fra Kræftens Bekæmpelse
// er indtastet her som tekst og bruges kun til sammenligning – ikke i modellen.
const TJEK = [
  { tekst: 'Danmark (København) om sommeren', bredde: 55.68, laengde: 12.57, dag: 172, dato: '21. juni, middag', virkelighed: 'højst ca. 7' },
  { tekst: 'Danmark (København) om vinteren', bredde: 55.68, laengde: 12.57, dag: 355, dato: '21. december, middag', virkelighed: 'ca. 1' },
  { tekst: 'Ved ækvator', bredde: 0, laengde: -78.5, dag: 79, dato: '20. marts, middag', virkelighed: 'op til 15' },
];

export default function OmModellen({ aar, ozon }) {
  return (
    <article className="om-modellen">
      <h2>Om modellen</h2>

      <h3>1. Hvor højt står solen?</h3>
      <p>
        Jordaksen hælder ca. 23,4°. Derfor står solen lodret over forskellige breddegrader i løbet af året. Den
        breddegrad, hvor solen står lodret ved middag, kaldes solens <b>deklination</b> (δ). Den er +23,4° ved
        sommersolhverv (21. juni), 0° ved jævndøgn og −23,4° ved vintersolhverv (21. december). Modellen beregner
        deklinationen med formler fra den amerikanske vejrtjeneste NOAA.
      </p>
      <p>
        Jorden drejer 15° i timen. Hvor langt et sted er drejet væk fra middag, kaldes <b>timevinklen</b>. Ud fra
        breddegraden φ, deklinationen δ og timevinklen beregnes <b>solhøjden</b> h:
      </p>
      <p className="formel">sin(h) = sin(φ) · sin(δ) + cos(φ) · cos(δ) · cos(timevinkel)</p>
      <p>
        Er h negativ, er solen under horisonten – så er det nat, og UV-indekset er 0. Den lyse linje på kloden er
        dag/nat-grænsen (terminatoren), hvor h = 0.
      </p>
      <p>
        Den gule prik på kloden er <b>solpunktet</b>: det sted, hvor solen står lodret lige nu. Solen ved siden af
        kloden er placeret i præcis den retning, så dag/nat-grænsen altid vender væk fra den. Solens overflade er
        derimod kun pynt – den er ikke en model af Solen, og afstanden er ikke i rigtig målestok (i virkeligheden er
        Solen ca. 12.000 gange så langt væk som dens egen diameter).
      </p>

      <h3>2. Hvor kraftig er UV-strålingen?</h3>
      <p>
        Jo lavere solen står, jo længere vej skal lyset gennem atmosfæren, og jo mere UV bliver opsuget af ozonlaget.
        Modellen bruger en formel fra forskeren Sasha Madronich:
      </p>
      <p className="formel">UV-indeks ≈ 12,5 · cos(θ)^2,42 · (ozon / 300)^(−1,23)</p>
      <p>
        Her er θ (theta) solens <b>zenitvinkel</b>, altså vinklen mellem lodret op og solen: θ = 90° − h. Ozonlaget
        måles i <b>Dobson-enheder</b> (DU). Et typisk ozonlag er ca. 300 DU. Mindre ozon giver mere UV – derfor er
        "ozonhullet" over Antarktis farligt.
      </p>
      <p>
        Farverne følger WHO's skala: grøn (under 3, lav), gul (3–5, moderat), orange (6–7, høj), rød (8–10, meget høj)
        og violet (11 og derover, ekstrem).
      </p>

      <h3>3. Modellens begrænsninger</h3>
      <ul>
        <li>
          <b>Ozonlaget er sat ens over hele kloden.</b> I virkeligheden er det typisk tykkere nær polerne og om
          foråret, og tyndere i troperne.
        </li>
        <li>
          <b>Skyerne er stærkt forenklede.</b> Vi bruger en simpel dæmpning: UV ganges med 1 − 0,7 · s², hvor s er
          skydækket fra 0 til 1. Tynde skyer dæmper næsten ikke, og helt overskyet giver 30 % af UV'en. Rigtige skyer
          er meget mere forskellige.
        </li>
        <li>
          <b>Højde over havet er ikke med.</b> UV-strålingen stiger ca. 10 % for hver 1.000 meter op, fordi der er
          mindre luft over en.
        </li>
        <li>
          <b>Refleksion fra sne, sand og vand er ikke med.</b> Frisk sne kan næsten fordoble den UV, man rammes af.
        </li>
        <li>Luftforurening og partikler i luften er heller ikke med.</li>
      </ul>

      <h3>4. Tjek mod virkeligheden</h3>
      <p>
        Kræftens Bekæmpelse oplyser, at UV-indekset i Danmark højst er ca. 7 om sommeren og ca. 1 om vinteren, og at
        det kan nå op til 15 ved ækvator. Her er, hvad modellen giver ved middag {aar} med skyfri himmel:
      </p>
      <div className="tabel-ramme">
        <table>
          <thead>
            <tr>
              <th>Sted og tid</th>
              <th>Solhøjde</th>
              <th>Model ({STANDARD_OZON} DU)</th>
              <th>Model ({ozon} DU, din indstilling)</th>
              <th>Kræftens Bekæmpelse</th>
            </tr>
          </thead>
          <tbody>
            {TJEK.map((t) => (
              <tr key={t.tekst}>
                <td>
                  {t.tekst}
                  <br />
                  <span className="lille">{t.dato}</span>
                </td>
                <td>{tal(solhoejdeVedMiddag(t.bredde, t.laengde, aar, t.dag))}°</td>
                <td>{tal(maksUvPaaDagen(t.bredde, t.laengde, aar, t.dag, { ozon: STANDARD_OZON }))}</td>
                <td>{tal(maksUvPaaDagen(t.bredde, t.laengde, aar, t.dag, { ozon }))}</td>
                <td>{t.virkelighed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <b>Hvad kan vi se?</b> Om sommeren giver modellen lidt over 8 i København med 300 DU. Over Danmark er ozonlaget
        om sommeren typisk tykkere, ca. 330–350 DU. Prøv at sætte ozon-skyderen til 340 DU – så giver modellen ca. 7,
        som passer med Kræftens Bekæmpelse. Om vinteren giver modellen kun ca. 0,2. Formlen undervurderer UV, når solen
        står meget lavt, fordi en stor del af UV-lyset så kommer som spredt lys fra hele himlen. Ved ækvator giver
        modellen 12,5. De højeste værdier på 15 og mere måles i bjergene (fx Andesbjergene) og hvor ozonlaget er tyndt
        – prøv at sætte ozon til 250 DU.
      </p>

      <h3>Kilder</h3>
      <ul className="kilder">
        <li>NOAA Global Monitoring Laboratory: "General Solar Position Calculations" (solens deklination, tidsligning og timevinkel).</li>
        <li>S. Madronich (2007): "Analytic formula for the clear-sky UV Index", Photochemistry and Photobiology 83, s. 1537–1538.</li>
        <li>WHO m.fl. (2002): "Global Solar UV Index – A Practical Guide" (farveskala og kategorier).</li>
        <li>Kræftens Bekæmpelse: oplysninger om UV-indeks i Danmark og ved ækvator.</li>
        <li>Landegrænser: Natural Earth, 1:110m (public domain).</li>
        <li>Hudkræfttal: indtastes af brugerne fra Global Cancer Observatory (gco.iarc.who.int) og NORDCAN.</li>
      </ul>
    </article>
  );
}
