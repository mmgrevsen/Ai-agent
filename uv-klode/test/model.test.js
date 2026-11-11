import { describe, it, expect } from 'vitest';
import {
  solParametre,
  solhoejde,
  solhoejdeVedMiddag,
  timevinkel,
  dagNummer,
  datoFraDagOgMinut,
  middagUtcMinutter,
  erSkudaar,
} from '../src/model/sol.js';
import {
  uvKlarHimmel,
  uvIndeks,
  skyFaktor,
  maksUvPaaDagen,
  uvDoegnkurve,
  middagsUvGennemAaret,
  whoKategori,
} from '../src/model/uv.js';
import { laesMelanomData, melanomFarve, INGEN_DATA_FARVE } from '../src/data/melanom.js';

const KBH = { bredde: 55.68, laengde: 12.57 };
const SYDNEY = { bredde: -33.87, laengde: 151.21 };

describe('datoer', () => {
  it('dagnummer og skudår', () => {
    expect(dagNummer(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
    expect(dagNummer(new Date(Date.UTC(2026, 5, 21, 23, 59)))).toBe(172);
    expect(dagNummer(new Date(Date.UTC(2024, 11, 31)))).toBe(366);
    expect(erSkudaar(2024)).toBe(true);
    expect(erSkudaar(2026)).toBe(false);
    expect(erSkudaar(1900)).toBe(false);
    expect(erSkudaar(2000)).toBe(true);
  });

  it('datoFraDagOgMinut er det omvendte af dagNummer', () => {
    const d = datoFraDagOgMinut(2026, 172, 630);
    expect(d.toISOString()).toBe('2026-06-21T10:30:00.000Z');
  });
});

describe('solens deklination og tidsligning (NOAA)', () => {
  it('deklinationen er ca. +23,4° ved sommersolhverv og ca. −23,4° ved vintersolhverv', () => {
    expect(solParametre(new Date(Date.UTC(2026, 5, 21, 12))).deklination).toBeCloseTo(23.44, 0);
    expect(solParametre(new Date(Date.UTC(2026, 11, 21, 12))).deklination).toBeCloseTo(-23.44, 0);
  });

  it('deklinationen er ca. 0° ved jævndøgn', () => {
    expect(Math.abs(solParametre(new Date(Date.UTC(2026, 2, 20, 12))).deklination)).toBeLessThan(0.5);
    expect(Math.abs(solParametre(new Date(Date.UTC(2026, 8, 23, 12))).deklination)).toBeLessThan(0.5);
  });

  it('tidsligningen har de kendte yderpunkter (ca. −14 min i feb., ca. +16 min i nov.)', () => {
    expect(solParametre(new Date(Date.UTC(2026, 1, 11, 12))).tidsligning).toBeCloseTo(-14.2, 0);
    expect(solParametre(new Date(Date.UTC(2026, 10, 3, 12))).tidsligning).toBeCloseTo(16.4, 0);
  });

  it('timevinklen er 0 ved sand middag og ligger i [−180, 180)', () => {
    expect(timevinkel(720, 0, 0)).toBe(0);
    expect(timevinkel(720 - 4 * 90, 90, 0)).toBe(0);
    expect(timevinkel(0, 0, 0)).toBe(-180);
    expect(timevinkel(1440, 170, 10)).toBeLessThan(180);
  });
});

describe('solhøjde', () => {
  it('København ved middag 21. juni er ca. 58°', () => {
    const h = solhoejdeVedMiddag(KBH.bredde, KBH.laengde, 2026, 172);
    expect(h).toBeGreaterThan(57.5);
    expect(h).toBeLessThan(58.5);
    // Samme resultat med den fulde formel på middagstidspunktet
    const middag = datoFraDagOgMinut(2026, 172, middagUtcMinutter(2026, 172, KBH.laengde));
    expect(solhoejde(KBH.bredde, KBH.laengde, middag)).toBeCloseTo(h, 1);
  });

  it('København ved middag 21. december er ca. 11°', () => {
    expect(solhoejdeVedMiddag(KBH.bredde, KBH.laengde, 2026, 355)).toBeCloseTo(10.9, 0);
  });

  it('sand middag i København ligger ca. kl. 11:08 UTC om sommeren', () => {
    const m = middagUtcMinutter(2026, 172, KBH.laengde);
    expect(m).toBeGreaterThan(665);
    expect(m).toBeLessThan(672);
  });

  it('solen står næsten lodret over ækvator ved jævndøgn', () => {
    expect(solhoejdeVedMiddag(0, 0, 2026, 79)).toBeGreaterThan(89.5);
  });

  it('solen er under horisonten i København ved midnat (UTC+1) om vinteren', () => {
    expect(solhoejde(KBH.bredde, KBH.laengde, new Date(Date.UTC(2026, 11, 21, 23)))).toBeLessThan(-50);
  });

  it('midnatssol: over polarcirklen er solen over horisonten ved midnat i juni', () => {
    expect(solhoejde(78, 15, new Date(Date.UTC(2026, 5, 21, 23)))).toBeGreaterThan(0);
  });
});

describe('UV-indeks (Madronich)', () => {
  it('UV-indekset er 12,5 med solen lodret over hovedet og 300 DU', () => {
    expect(uvKlarHimmel(1, 300)).toBeCloseTo(12.5, 6);
  });

  it('UV-indekset er 0, når solen er under horisonten (nat)', () => {
    expect(uvKlarHimmel(0)).toBe(0);
    expect(uvKlarHimmel(-0.5)).toBe(0);
    expect(uvIndeks(KBH.bredde, KBH.laengde, new Date(Date.UTC(2026, 5, 21, 23)))).toBe(0);
    expect(uvIndeks(SYDNEY.bredde, SYDNEY.laengde, new Date(Date.UTC(2026, 5, 21, 14)))).toBe(0);
  });

  it('mindre ozon giver mere UV', () => {
    expect(uvKlarHimmel(1, 250)).toBeGreaterThan(uvKlarHimmel(1, 300));
    expect(uvKlarHimmel(1, 200)).toBeCloseTo(12.5 * Math.pow(200 / 300, -1.23), 6);
    expect(uvKlarHimmel(1, 450)).toBeLessThan(uvKlarHimmel(1, 300));
  });

  it('København 21. juni ved middag: ca. 8 med 300 DU og ca. 7 med sommerozon (340 DU)', () => {
    expect(maksUvPaaDagen(KBH.bredde, KBH.laengde, 2026, 172)).toBeCloseTo(8.3, 0);
    expect(maksUvPaaDagen(KBH.bredde, KBH.laengde, 2026, 172, { ozon: 340 })).toBeCloseTo(7.1, 0);
  });

  it('det er sommer i Sydney, når det er vinter i København', () => {
    const kbhJuni = maksUvPaaDagen(KBH.bredde, KBH.laengde, 2026, 172);
    const sydJuni = maksUvPaaDagen(SYDNEY.bredde, SYDNEY.laengde, 2026, 172);
    const kbhDec = maksUvPaaDagen(KBH.bredde, KBH.laengde, 2026, 355);
    const sydDec = maksUvPaaDagen(SYDNEY.bredde, SYDNEY.laengde, 2026, 355);
    expect(kbhJuni).toBeGreaterThan(kbhDec);
    expect(sydDec).toBeGreaterThan(sydJuni);
    expect(sydDec).toBeGreaterThan(kbhJuni);
  });

  it('skyfaktoren: skyfrit = 1, tynde skyer dæmper lidt, overskyet dæmper meget', () => {
    expect(skyFaktor(0)).toBe(1);
    expect(skyFaktor(0.25)).toBeGreaterThan(0.9);
    expect(skyFaktor(1)).toBeCloseTo(0.3, 6);
    expect(skyFaktor(2)).toBeCloseTo(0.3, 6); // begrænses til 100 %
    const klar = uvIndeks(0, 0, new Date(Date.UTC(2026, 2, 20, 12)));
    expect(uvIndeks(0, 0, new Date(Date.UTC(2026, 2, 20, 12)), { skydaekke: 1 })).toBeCloseTo(klar * 0.3, 6);
  });

  it('maksimum på dagen er mindst lige så stort som alle punkter på døgnkurven', () => {
    const kurve = uvDoegnkurve(KBH.bredde, KBH.laengde, 2026, 172, {}, 5);
    const maks = maksUvPaaDagen(KBH.bredde, KBH.laengde, 2026, 172);
    expect(kurve).toHaveLength(289);
    for (const p of kurve) expect(p.uv).toBeLessThanOrEqual(maks + 1e-9);
    expect(Math.max(...kurve.map((p) => p.uv))).toBeGreaterThan(maks - 0.05);
  });

  it('årskurven har én værdi pr. dag og topper omkring sommersolhverv i nord', () => {
    const aar = middagsUvGennemAaret(KBH.bredde, KBH.laengde, 2026);
    expect(aar).toHaveLength(365);
    const top = aar.reduce((a, b) => (b.uv > a.uv ? b : a));
    expect(Math.abs(top.dag - 172)).toBeLessThan(4);
  });
});

describe('WHO-kategorier', () => {
  it('grænserne følger WHO: under 3 grøn, 3–5 gul, 6–7 orange, 8–10 rød, 11+ violet', () => {
    expect(whoKategori(0).navn).toBe('Lav');
    expect(whoKategori(2.4).navn).toBe('Lav');
    expect(whoKategori(3).navn).toBe('Moderat');
    expect(whoKategori(5.4).navn).toBe('Moderat');
    expect(whoKategori(6).navn).toBe('Høj');
    expect(whoKategori(7.4).navn).toBe('Høj');
    expect(whoKategori(8).navn).toBe('Meget høj');
    expect(whoKategori(10.4).navn).toBe('Meget høj');
    expect(whoKategori(11).navn).toBe('Ekstrem');
    expect(whoKategori(16).navn).toBe('Ekstrem');
  });
});

describe('melanomdata', () => {
  it('springer tomme skabelonlinjer over og læser udfyldte tal', () => {
    const { rater, advarsler } = laesMelanomData({
      lande: [
        { land: 'DNK', rate: null, kilde: '' },
        { land: 'aus', rate: '12,5', kilde: 'test' },
        { land: 'XX', rate: 3, kilde: '' },
        { land: 'SWE', rate: -1, kilde: '' },
      ],
    });
    expect(rater.has('DNK')).toBe(false);
    expect(rater.get('AUS')).toEqual({ rate: 12.5, kilde: 'test' });
    expect(advarsler).toHaveLength(2);
  });

  it('den medfølgende skabelon indeholder ingen opfundne tal', async () => {
    const skabelon = (await import('../data/melanom.json')).default;
    const { rater, advarsler } = laesMelanomData(skabelon);
    expect(advarsler).toEqual([]);
    expect(rater.size).toBe(0);
  });

  it('farver: ingen data er grå', () => {
    expect(melanomFarve(undefined)).toBe(INGEN_DATA_FARVE);
    expect(melanomFarve(35)).toBe('#67000d');
  });
});

describe('solpunkt', () => {
  it('solen står lodret over solpunktet', async () => {
    const { solpunkt } = await import('../src/model/sol.js');
    for (const d of [new Date(Date.UTC(2026, 5, 21, 11)), new Date(Date.UTC(2026, 11, 21, 3, 30)), new Date(Date.UTC(2026, 2, 20, 20))]) {
      const p = solpunkt(d);
      expect(solhoejde(p.bredde, p.laengde, d)).toBeGreaterThan(89.9);
    }
  });
});
