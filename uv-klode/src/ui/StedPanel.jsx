/** Panel med oplysninger om det sted, man har klikket på. */
import { useMemo } from 'react';
import { solhoejde, solhoejdeVedMiddag, middagUtcMinutter, dagNummer } from '../model/sol.js';
import { uvIndeks, maksUvPaaDagen, uvDoegnkurve, middagsUvGennemAaret, whoKategori } from '../model/uv.js';
import { findLand, landeNavn } from '../klode/geo.js';
import Graf, { DOEGN_MAERKER, AAR_MAERKER } from './Graf.jsx';
import { tal, breddeTekst, laengdeTekst, klokTekst } from './format.js';

/**
 * UV-indekset vist som WHO gør: afrundet til et helt tal, med kategoriens farve.
 * Den præcise modelværdi står i parentes, fx "11 · Ekstrem (10,9)".
 */
export function UvMaerke({ uv }) {
  const k = whoKategori(uv);
  return (
    <span className="uv-maerke-ramme">
      <span className="uv-maerke" style={{ background: k.farve, color: k.navn === 'Moderat' ? '#222' : '#fff' }}>
        {Math.round(uv)} · {k.navn}
      </span>{' '}
      <span className="lille">({tal(uv)})</span>
    </span>
  );
}

export default function StedPanel({ sted, dato, indstillinger, melanom, onLuk }) {
  const { bredde, laengde } = sted;
  const aar = dato.getUTCFullYear();
  const dag = dagNummer(dato);

  const land = useMemo(() => findLand(bredde, laengde), [bredde, laengde]);
  const melanomTal = land ? melanom.rater.get(land.properties.iso3) : undefined;

  const hNu = solhoejde(bredde, laengde, dato);
  const hMiddag = solhoejdeVedMiddag(bredde, laengde, aar, dag);
  const uvNu = uvIndeks(bredde, laengde, dato, indstillinger);
  const uvMaks = maksUvPaaDagen(bredde, laengde, aar, dag, indstillinger);
  const middag = middagUtcMinutter(aar, dag, laengde);

  const doegn = useMemo(
    () => [{ farve: '#ff9d3c', punkter: uvDoegnkurve(bredde, laengde, aar, dag, indstillinger).map((p) => ({ x: p.minut, y: p.uv })) }],
    [bredde, laengde, aar, dag, indstillinger],
  );
  const aaret = useMemo(
    () => [{ farve: '#ff9d3c', punkter: middagsUvGennemAaret(bredde, laengde, aar, indstillinger).map((p) => ({ x: p.dag, y: p.uv })) }],
    [bredde, laengde, aar, indstillinger],
  );

  return (
    <section className="panel sted-panel" aria-label="Valgt sted">
      <header>
        <div>
          <h2>{land ? landeNavn(land) : 'Hav'}</h2>
          <p className="lille">
            {breddeTekst(bredde)}, {laengdeTekst(laengde)}
          </p>
        </div>
        <button className="luk" onClick={onLuk} aria-label="Luk panelet">
          ×
        </button>
      </header>

      <dl className="noegletal">
        <div>
          <dt>Solhøjde lige nu</dt>
          <dd>{hNu > 0 ? `${tal(hNu)}°` : `${tal(hNu)}° (under horisonten)`}</dd>
        </div>
        <div>
          <dt>Solhøjde ved middag</dt>
          <dd>
            {tal(hMiddag)}° <span className="lille">kl. {klokTekst(middag)} UTC</span>
          </dd>
        </div>
        <div>
          <dt>UV-indeks lige nu</dt>
          <dd>
            <UvMaerke uv={uvNu} />
          </dd>
        </div>
        <div>
          <dt>Højeste UV-indeks i dag</dt>
          <dd>
            <UvMaerke uv={uvMaks} />
          </dd>
        </div>
        <div className="fuld">
          <dt>Modermærkekræft (nye tilfælde pr. 100.000, aldersstandardiseret)</dt>
          <dd>
            {melanomTal ? (
              <>
                <strong>{tal(melanomTal.rate)}</strong>
                {melanomTal.kilde && <span className="lille"> · Kilde: {melanomTal.kilde}</span>}
              </>
            ) : (
              <span className="lille">{land ? 'Ingen data for dette land i melanom.json' : '–'}</span>
            )}
          </dd>
        </div>
      </dl>

      <Graf
        titel="UV-indeks gennem døgnet (klokkeslæt UTC)"
        beskrivelse="Graf over UV-indekset time for time på den valgte dato"
        serier={doegn}
        xMin={0}
        xMax={1440}
        xMaerker={DOEGN_MAERKER}
        markoerX={dato.getUTCHours() * 60 + dato.getUTCMinutes()}
      />
      <Graf
        titel="UV-indeks ved middag gennem året"
        beskrivelse="Graf over dagens højeste UV-indeks for hver dag i året"
        serier={aaret}
        xMin={1}
        xMax={aaret[0].punkter.length}
        xMaerker={AAR_MAERKER}
        markoerX={dag}
      />
    </section>
  );
}
