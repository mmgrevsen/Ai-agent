/** Farveforklaring til farvelaget (WHO's UV-skala eller melanom-skalaen). */
import { WHO_KATEGORIER } from '../model/uv.js';
import { MELANOM_TRIN, INGEN_DATA_FARVE } from '../data/melanom.js';

export default function Legende({ lag, antalLandeMedData }) {
  if (lag === 'melanom') {
    return (
      <aside className="legende" aria-label="Farveforklaring">
        <h3>Modermærkekræft</h3>
        <p className="lille">Nye tilfælde pr. 100.000 pr. år (aldersstandardiseret)</p>
        <ul>
          {MELANOM_TRIN.map((t) => (
            <li key={t.fra}>
              <i style={{ background: t.farve }} /> {t.til === Infinity ? `${t.fra} og derover` : `${t.fra}–${t.til}`}
            </li>
          ))}
          <li>
            <i style={{ background: INGEN_DATA_FARVE }} /> Ingen data
          </li>
        </ul>
        {antalLandeMedData === 0 && <p className="lille advarsel">Der er endnu ingen tal i data/melanom.json – se README.</p>}
      </aside>
    );
  }
  return (
    <aside className="legende" aria-label="Farveforklaring">
      <h3>UV-indeks (WHO)</h3>
      <ul>
        {WHO_KATEGORIER.slice()
          .reverse()
          .map((k) => (
            <li key={k.navn}>
              <i style={{ background: k.farve }} /> <b>{k.interval}</b> {k.navn}
            </li>
          ))}
      </ul>
      <p className="lille">Natsiden er mørk (UV = 0). Den lyse linje er dag/nat-grænsen.</p>
    </aside>
  );
}
