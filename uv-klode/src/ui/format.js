/** Formatering af tal, datoer og koordinater på dansk. */

export const tal = (x, decimaler = 1) =>
  x.toLocaleString('da-DK', { minimumFractionDigits: decimaler, maximumFractionDigits: decimaler });

export const MAANEDER = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
const MAANEDER_LANG = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];

/** Fx "21. juni 2026" */
export const datoTekst = (d) => `${d.getUTCDate()}. ${MAANEDER_LANG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Minutter efter midnat → "hh:mm" (lægger rundt, hvis tallet er uden for døgnet). */
export function klokTekst(minutter) {
  const m = ((Math.round(minutter) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Klokkeslæt i Danmark (tager højde for sommertid) for et UTC-tidspunkt. */
export function danskTid(dato) {
  return dato.toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }).replace('.', ':');
}

/** 55,68° N / 33,87° S osv. */
export const breddeTekst = (b) => `${tal(Math.abs(b), 2)}° ${b >= 0 ? 'N' : 'S'}`;
export const laengdeTekst = (l) => `${tal(Math.abs(l), 2)}° ${l >= 0 ? 'Ø' : 'V'}`;
