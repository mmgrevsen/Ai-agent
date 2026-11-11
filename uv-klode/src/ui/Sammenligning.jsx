/**
 * Sammenligningstilstand: København og Sydney side om side på samme dato.
 * Viser, at det er sommer på den ene halvkugle, når det er vinter på den anden.
 */
import { useMemo } from 'react';
import { solhoejde, solhoejdeVedMiddag, dagNummer } from '../model/sol.js';
import { uvIndeks, maksUvPaaDagen, middagsUvGennemAaret } from '../model/uv.js';
import Graf, { AAR_MAERKER } from './Graf.jsx';
import { UvMaerke } from './StedPanel.jsx';
import { tal, breddeTekst, datoTekst, klokTekst } from './format.js';

export const BYER = [
  { id: 'kbh', navn: 'København', bredde: 55.68, laengde: 12.57, farve: '#4fc3f7', utcForskydning: 'UTC+1 / sommertid UTC+2' },
  { id: 'syd', navn: 'Sydney', bredde: -33.87, laengde: 151.21, farve: '#ffb74d', utcForskydning: 'UTC+10 / sommertid UTC+11' },
];

/**
 * Årstid (meteorologisk, som DMI bruger): på den nordlige halvkugle er
 * december–februar vinter, marts–maj forår, juni–august sommer og september–november efterår.
 * På den sydlige halvkugle er det lige omvendt.
 */
const NORD = ['vinter', 'vinter', 'forår', 'forår', 'forår', 'sommer', 'sommer', 'sommer', 'efterår', 'efterår', 'efterår', 'vinter'];
const MODSAT = { vinter: 'sommer', sommer: 'vinter', forår: 'efterår', efterår: 'forår' };
export function aarstid(bredde, dato) {
  const nord = NORD[dato.getUTCMonth()];
  return bredde >= 0 ? nord : MODSAT[nord];
}

export default function Sammenligning({ dato, indstillinger }) {
  const aar = dato.getUTCFullYear();
  const dag = dagNummer(dato);

  const serier = useMemo(
    () =>
      BYER.map((b) => ({
        navn: b.navn,
        farve: b.farve,
        punkter: middagsUvGennemAaret(b.bredde, b.laengde, aar, indstillinger).map((p) => ({ x: p.dag, y: p.uv })),
      })),
    [aar, indstillinger],
  );

  return (
    <section className="panel sammenligning" aria-label="Sammenligning af København og Sydney">
      <header>
        <div>
          <h2>København og Sydney</h2>
          <p className="lille">
            {datoTekst(dato)} kl. {klokTekst(dato.getUTCHours() * 60 + dato.getUTCMinutes())} UTC
          </p>
        </div>
      </header>

      <div className="by-kort">
        {BYER.map((b) => {
          const hMiddag = solhoejdeVedMiddag(b.bredde, b.laengde, aar, dag);
          const hNu = solhoejde(b.bredde, b.laengde, dato);
          const tid = aarstid(b.bredde, dato);
          return (
            <article key={b.id} style={{ borderColor: b.farve }}>
              <h3>{b.navn}</h3>
              <p className="lille">{breddeTekst(b.bredde)}</p>
              <p className={`aarstid ${tid}`}>{tid[0].toUpperCase() + tid.slice(1)}</p>
              <dl>
                <dt>Solhøjde ved middag</dt>
                <dd>{tal(hMiddag)}°</dd>
                <dt>UV-indeks ved middag</dt>
                <dd>
                  <UvMaerke uv={maksUvPaaDagen(b.bredde, b.laengde, aar, dag, indstillinger)} />
                </dd>
                <dt>Lige nu</dt>
                <dd>
                  {hNu > 0 ? `Sol ${tal(hNu)}° · UV ${tal(uvIndeks(b.bredde, b.laengde, dato, indstillinger))}` : 'Nat (UV 0)'}
                </dd>
              </dl>
            </article>
          );
        })}
      </div>

      <Graf
        titel="UV-indeks ved middag gennem året"
        beskrivelse="To kurver: middags-UV i København og Sydney gennem året"
        serier={serier}
        xMin={1}
        xMax={serier[0].punkter.length}
        xMaerker={AAR_MAERKER}
        markoerX={dag}
      />
      <p className="forklaring">
        Når solen står over den nordlige halvkugle (april–august), er det sommer i København og vinter i Sydney – og
        omvendt. Sydney ligger desuden tættere på ækvator end København, så solen kommer højere op, og UV-indekset
        bliver højere om sommeren.
      </p>
    </section>
  );
}
