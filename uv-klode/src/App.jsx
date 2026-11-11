/**
 * Hovedkomponenten: holder appens tilstand (dato, tid, indstillinger, faner)
 * og sætter kloden og panelerne sammen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Klode from './klode/Klode.jsx';
import Styring from './ui/Styring.jsx';
import Legende from './ui/Legende.jsx';
import StedPanel from './ui/StedPanel.jsx';
import Sammenligning, { BYER } from './ui/Sammenligning.jsx';
import OmModellen from './ui/OmModellen.jsx';
import { dagNummer, datoFraDagOgMinut, dageIAaret } from './model/sol.js';
import { STANDARD_OZON, uvIndeks } from './model/uv.js';
import { solhoejde } from './model/sol.js';
import { breddeTekst, laengdeTekst, tal } from './ui/format.js';
import { UvMaerke } from './ui/StedPanel.jsx';
import { laesMelanomData } from './data/melanom.js';
import melanomFil from '../data/melanom.json';

// Kameraet starter over Europa
const START_STED = { bredde: 40, laengde: 15 };

const nu = new Date();
const AAR = nu.getUTCFullYear();

export default function App() {
  const [s, setS] = useState({
    aar: AAR,
    dag: dagNummer(nu),
    minut: nu.getUTCHours() * 60 + nu.getUTCMinutes(),
    spiller: false,
    hastighed: 30, // dage pr. sekund
    skydaekke: 0,
    ozon: STANDARD_OZON,
    lag: 'uv',
    kredse: true,
  });
  const saet = useCallback((aendring) => setS((f) => ({ ...f, ...aendring })), []);

  const [fane, setFane] = useState('klode');
  const [valgtSted, setValgtSted] = useState(null);
  const [melanom, setMelanom] = useState(() => laesMelanomData(melanomFil));
  const [besked, setBesked] = useState(null);
  const [hover, setHover] = useState(null); // stedet under musen

  // Mellemrumstasten starter/stopper afspilningen (men ikke når man skriver i et felt)
  useEffect(() => {
    const tast = (e) => {
      if (e.code !== 'Space') return;
      // Knapper, afkrydsningsfelter og lister bruger selv mellemrum – skyderne gør ikke
      const t = e.target;
      if (['SELECT', 'TEXTAREA', 'BUTTON'].includes(t.tagName) || (t.tagName === 'INPUT' && t.type !== 'range')) return;
      e.preventDefault();
      setS((f) => ({ ...f, spiller: !f.spiller }));
    };
    window.addEventListener('keydown', tast);
    return () => window.removeEventListener('keydown', tast);
  }, []);

  // Afspilning: flyt datoen frem med den valgte hastighed (dage pr. sekund).
  // Den præcise (kommatals-)dag holdes i en ref, og React opdateres kun, når
  // datoen skifter til en ny hel dag – det sparer mange unødige gentegninger.
  const afspil = useRef({ dag: 1, hastighed: 30 });
  afspil.current.hastighed = s.hastighed;
  // Hvis datoen ændres udefra (skyder eller hurtigknap), starter afspilningen derfra
  if (Math.floor(afspil.current.dag) !== s.dag) afspil.current.dag = s.dag;
  useEffect(() => {
    if (!s.spiller) return;
    let id;
    let sidst = null;
    const trin = (t) => {
      if (sidst !== null) {
        const dt = Math.min(0.1, (t - sidst) / 1000); // undgå store spring, hvis fanen har været skjult
        const forrige = Math.floor(afspil.current.dag);
        let dag = afspil.current.dag + afspil.current.hastighed * dt;
        const n = dageIAaret(s.aar);
        if (dag >= n + 1) dag -= n;
        afspil.current.dag = dag;
        if (Math.floor(dag) !== forrige) setS((f) => ({ ...f, dag: Math.floor(dag) }));
      }
      sidst = t;
      id = requestAnimationFrame(trin);
    };
    id = requestAnimationFrame(trin);
    return () => cancelAnimationFrame(id);
  }, [s.spiller, s.aar]);

  const hurtig = (hvad) => {
    if (hvad === 'idag') {
      const d = new Date();
      saet({ aar: d.getUTCFullYear(), dag: dagNummer(d), minut: d.getUTCHours() * 60 + d.getUTCMinutes(), spiller: false });
      return;
    }
    // Faste datoer (kan variere en dag fra år til år): 21. juni, 21. december og 20. marts
    const datoer = { sommer: [5, 21], vinter: [11, 21], jaevndoegn: [2, 20] };
    const [m, d] = datoer[hvad];
    saet({ dag: dagNummer(new Date(Date.UTC(s.aar, m, d))), spiller: false });
  };

  const indlaesMelanom = async (e) => {
    const fil = e.target.files?.[0];
    if (!fil) return;
    try {
      const data = laesMelanomData(JSON.parse(await fil.text()));
      setMelanom(data);
      setBesked(
        `Indlæst ${data.rater.size} lande fra ${fil.name}.` + (data.advarsler.length ? ` Advarsler: ${data.advarsler.join(' ')}` : ''),
      );
    } catch {
      setBesked(`Kunne ikke læse ${fil.name}. Tjek at filen er gyldig JSON (fx kommaer og anførselstegn).`);
    }
  };

  const dato = useMemo(() => datoFraDagOgMinut(s.aar, s.dag, s.minut), [s.aar, s.dag, s.minut]);
  // Samme objekt, så længe ozon og skyer er uændrede (så graferne ikke regnes om unødigt)
  const indstillinger = useMemo(() => ({ ozon: s.ozon, skydaekke: s.skydaekke / 100 }), [s.ozon, s.skydaekke]);

  const markoerer = useMemo(() => {
    if (fane === 'sammenlign') return BYER.map((b) => ({ id: b.id, bredde: b.bredde, laengde: b.laengde, farve: b.farve }));
    if (valgtSted) return [{ id: 'valgt', ...valgtSted, farve: '#ffffff' }];
    return [];
  }, [fane, valgtSted]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          UV-kloden <span>UV-stråling og hudkræft</span>
        </h1>
        <nav role="tablist" aria-label="Faner">
          {[
            ['klode', 'Kloden'],
            ['sammenlign', 'København og Sydney'],
            ['om', 'Om modellen'],
          ].map(([id, tekst]) => (
            <button key={id} role="tab" aria-selected={fane === id} className={fane === id ? 'aktiv' : ''} onClick={() => setFane(id)}>
              {tekst}
            </button>
          ))}
        </nav>
      </header>

      <main className="indhold">
        <div className="klode-omraade">
          <Klode
            startSted={START_STED}
            dato={dato}
            ozon={s.ozon}
            skydaekke={s.skydaekke / 100}
            tilstand={s.lag}
            lagStyrke={0.72}
            visKredse={s.kredse}
            onHover={setHover}
            melanomRater={melanom.rater}
            markoerer={markoerer}
            onVaelg={(sted) => {
              setValgtSted(sted);
              if (fane !== 'klode') setFane('klode');
            }}
          />
          <Legende lag={s.lag} antalLandeMedData={melanom.rater.size} />
          {hover ? (
            <p className="tip aflaesning">
              {breddeTekst(hover.bredde)}, {laengdeTekst(hover.laengde)} · Sol {tal(solhoejde(hover.bredde, hover.laengde, dato))}° ·
              UV <UvMaerke uv={uvIndeks(hover.bredde, hover.laengde, dato, indstillinger)} />
            </p>
          ) : (
            !valgtSted && fane === 'klode' && <p className="tip">Træk for at dreje · rul for at zoome · klik på et sted for detaljer · mellemrum = afspil</p>
          )}
        </div>

        <Styring s={s} saet={saet} hurtig={hurtig} onIndlaesMelanom={indlaesMelanom} />

        {fane === 'klode' && valgtSted && (
          <StedPanel sted={valgtSted} dato={dato} indstillinger={indstillinger} melanom={melanom} onLuk={() => setValgtSted(null)} />
        )}
        {fane === 'sammenlign' && <Sammenligning dato={dato} indstillinger={indstillinger} />}
        {fane === 'om' && (
          <div className="om-ramme">
            <OmModellen aar={s.aar} ozon={s.ozon} />
          </div>
        )}
        {besked && (
          <div className="besked" role="status">
            {besked}
            <button onClick={() => setBesked(null)} aria-label="Luk besked">
              ×
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
