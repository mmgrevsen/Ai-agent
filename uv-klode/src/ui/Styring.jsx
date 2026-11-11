/** Styrepanelet: dato, klokkeslæt, afspilning, skydække, ozon og farvelag. */
import { dageIAaret, datoFraDagOgMinut } from '../model/sol.js';
import { datoTekst, klokTekst, danskTid, MAANEDER } from './format.js';

export default function Styring({ s, saet, hurtig, onIndlaesMelanom }) {
  const antalDage = dageIAaret(s.aar);
  const dato = datoFraDagOgMinut(s.aar, s.dag, s.minut);

  return (
    <section className="panel styring" aria-label="Styring">
      <div className="felt">
        <label htmlFor="dato">
          Dato <output>{datoTekst(dato)}</output>
        </label>
        <input
          id="dato"
          type="range"
          min="1"
          max={antalDage}
          step="1"
          value={s.dag}
          onChange={(e) => saet({ dag: Number(e.target.value) })}
        />
        <div className="skala" aria-hidden="true">
          {MAANEDER.filter((_, i) => i % 2 === 0).map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>

      <div className="felt">
        <label htmlFor="klok">
          Klokkeslæt <output>{klokTekst(s.minut)} UTC</output>
        </label>
        <input id="klok" type="range" min="0" max="1439" step="5" value={s.minut} onChange={(e) => saet({ minut: Number(e.target.value) })} />
        <p className="lille">Dansk tid: kl. {danskTid(dato)}</p>
      </div>

      <div className="knapper">
        <button className={s.spiller ? 'aktiv' : ''} onClick={() => saet({ spiller: !s.spiller })}>
          {s.spiller ? '❚❚ Pause' : '▶ Afspil året'}
        </button>
        <label className="hastighed">
          Hastighed
          <select value={s.hastighed} onChange={(e) => saet({ hastighed: Number(e.target.value) })}>
            <option value="7">1 uge/s</option>
            <option value="15">½ måned/s</option>
            <option value="30">1 måned/s</option>
            <option value="60">2 måneder/s</option>
            <option value="120">4 måneder/s</option>
          </select>
        </label>
      </div>

      <div className="knapper hurtig">
        <button onClick={() => hurtig('idag')}>I dag</button>
        <button onClick={() => hurtig('sommer')}>Sommersolhverv</button>
        <button onClick={() => hurtig('vinter')}>Vintersolhverv</button>
        <button onClick={() => hurtig('jaevndoegn')}>Jævndøgn</button>
      </div>

      <div className="felt">
        <label htmlFor="sky">
          Skydække <output>{s.skydaekke} %</output>
        </label>
        <input id="sky" type="range" min="0" max="100" step="5" value={s.skydaekke} onChange={(e) => saet({ skydaekke: Number(e.target.value) })} />
        <p className="lille advarsel">Forenkling: skyerne dæmper UV med en simpel formel – ikke en rigtig skymodel.</p>
      </div>

      <div className="felt">
        <label htmlFor="ozon">
          Ozonlag <output>{s.ozon} DU</output>
        </label>
        <input id="ozon" type="range" min="200" max="450" step="5" value={s.ozon} onChange={(e) => saet({ ozon: Number(e.target.value) })} />
        <p className="lille">Dobson-enheder. Standard er 300 DU. Samme værdi over hele kloden.</p>
      </div>

      <label className="afkryds">
        <input type="checkbox" checked={s.kredse} onChange={(e) => saet({ kredse: e.target.checked })} />
        Vis ækvator, vendekredse og polarcirkler
      </label>

      <div className="felt">
        <span className="etiket">Farvelag</span>
        <div className="vaelger" role="radiogroup" aria-label="Farvelag">
          <button role="radio" aria-checked={s.lag === 'uv'} className={s.lag === 'uv' ? 'aktiv' : ''} onClick={() => saet({ lag: 'uv' })}>
            UV-indeks
          </button>
          <button
            role="radio"
            aria-checked={s.lag === 'melanom'}
            className={s.lag === 'melanom' ? 'aktiv' : ''}
            onClick={() => saet({ lag: 'melanom' })}
          >
            Modermærkekræft pr. 100.000
          </button>
        </div>
        {s.lag === 'melanom' && (
          <label className="fil-knap">
            Indlæs anden melanom.json …
            <input type="file" accept=".json,application/json" onChange={onIndlaesMelanom} />
          </label>
        )}
      </div>
    </section>
  );
}
