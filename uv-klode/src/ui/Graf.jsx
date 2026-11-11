/**
 * Lille linjegraf i SVG (ingen eksterne biblioteker). Baggrunden viser WHO's
 * UV-kategorier som vandrette bånd, så man kan aflæse farvekategorien direkte.
 */
import { memo, useMemo } from 'react';
import { WHO_KATEGORIER } from '../model/uv.js';
import { tal } from './format.js';

const B = 300; // bredde i SVG-enheder
const H = 130; // højde
const M = { v: 26, h: 8, t: 8, b: 20 }; // margener

/**
 * @param {{
 *   serier: {punkter: {x:number,y:number}[], farve: string, navn?: string}[],
 *   xMin: number, xMax: number, xMaerker: {v:number, tekst:string}[],
 *   markoerX?: number, titel: string, beskrivelse: string
 * }} props
 */
function Graf({ serier, xMin, xMax, xMaerker, markoerX, titel, beskrivelse }) {
  const yTop = useMemo(() => Math.max(4, Math.ceil(Math.max(...serier.flatMap((s) => s.punkter.map((p) => p.y))) + 1)), [serier]);
  const sx = (x) => M.v + ((x - xMin) / (xMax - xMin)) * (B - M.v - M.h);
  const sy = (y) => H - M.b - (y / yTop) * (H - M.t - M.b);
  // Kurvernes punkter regnes kun om, når data ændres (ikke når markøren flytter sig)
  const linjer = useMemo(
    () => serier.map((s) => s.punkter.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serier, yTop, xMin, xMax],
  );
  const yTrin = yTop > 10 ? 4 : 2;

  return (
    <figure className="graf">
      <figcaption>{titel}</figcaption>
      <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label={beskrivelse}>
        {/* WHO-bånd i baggrunden */}
        {WHO_KATEGORIER.map((k) => {
          const fra = Math.max(0, k.fra - 0.5);
          const til = Math.min(yTop, k.til - 0.5);
          if (fra >= yTop) return null;
          return <rect key={k.navn} x={M.v} width={B - M.v - M.h} y={sy(til)} height={sy(fra) - sy(til)} fill={k.farve} opacity="0.18" />;
        })}
        {/* y-akse */}
        {Array.from({ length: Math.floor(yTop / yTrin) + 1 }, (_, i) => i * yTrin).map((y) => (
          <g key={y}>
            <line x1={M.v} x2={B - M.h} y1={sy(y)} y2={sy(y)} className="gitter" />
            <text x={M.v - 4} y={sy(y) + 3} textAnchor="end" className="akse">
              {y}
            </text>
          </g>
        ))}
        {/* x-akse */}
        {xMaerker.map((m) => (
          <text key={m.v} x={sx(m.v)} y={H - 6} textAnchor="middle" className="akse">
            {m.tekst}
          </text>
        ))}
        {markoerX !== undefined && <line x1={sx(markoerX)} x2={sx(markoerX)} y1={M.t} y2={H - M.b} className="markoer" />}
        {serier.map((s, i) => (
          <polyline
            key={i}
            fill="none"
            stroke={s.farve}
            strokeWidth="2"
            strokeLinejoin="round"
            points={linjer[i]}
          />
        ))}
      </svg>
      {serier.some((s) => s.navn) && (
        <div className="graf-noegle">
          {serier.map((s) => (
            <span key={s.navn}>
              <i style={{ background: s.farve }} /> {s.navn} (maks. {tal(Math.max(...s.punkter.map((p) => p.y)))})
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

export default memo(Graf);

/** Standard-x-mærker for et døgn (UTC) og et år. */
export const DOEGN_MAERKER = [0, 6, 12, 18, 24].map((t) => ({ v: t * 60, tekst: `${String(t).padStart(2, '0')}` }));
export const AAR_MAERKER = [
  { v: 1, tekst: 'jan' },
  { v: 91, tekst: 'apr' },
  { v: 182, tekst: 'jul' },
  { v: 274, tekst: 'okt' },
  { v: 335, tekst: 'dec' },
];
