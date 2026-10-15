import type { ReactElement } from 'react';

/** Original inline SVG icon set (no external assets). */
export type IconName =
  | 'gold'
  | 'gem'
  | 'ore'
  | 'treat'
  | 'glory'
  | 'xp'
  | 'castle'
  | 'cards'
  | 'hero'
  | 'base'
  | 'quests'
  | 'settings'
  | 'social'
  | 'swords'
  | 'camera'
  | 'lock'
  | 'chest'
  | 'star'
  | 'back'
  | 'close'
  | 'bolt'
  | 'heart'
  | 'shield'
  | 'clock'
  | 'skull'
  | 'flame'
  | 'check'
  | 'pause'
  | 'play'
  | 'auto'
  | 'trophy'
  | 'map'
  | 'copy'
  | 'info'
  | 'plus'
  | 'up';

const P: Record<IconName, ReactElement> = {
  gold: (
    <>
      <circle cx="12" cy="12" r="9" fill="#ffc94a" stroke="#8a5300" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="#e39b14" strokeWidth="1.6" />
      <path d="M10 9h3.5a1.6 1.6 0 010 3.2H10.5a1.6 1.6 0 000 3.2H14" stroke="#8a5300" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </>
  ),
  gem: (
    <>
      <path d="M6 4h12l4 6-10 11L2 10z" fill="#ff5ccf" stroke="#7a0f5f" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 10h20M8 4l4 17 4-17" stroke="#ffd1f2" strokeWidth="1.1" fill="none" />
    </>
  ),
  ore: (
    <>
      <path d="M4 16l3-9 7-3 6 6-2 9-9 2z" fill="#8fa3b8" stroke="#2c3e50" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 9l5 3 4-4M13 12l-2 7" stroke="#d6e4f0" strokeWidth="1.2" fill="none" />
    </>
  ),
  treat: (
    <>
      <path d="M5 13a7 7 0 0114 0c0 4-3 7-7 7s-7-3-7-7z" fill="#e8a05a" stroke="#6e3b0f" strokeWidth="1.5" />
      <circle cx="9.5" cy="13" r="1.2" fill="#6e3b0f" />
      <circle cx="14.5" cy="15" r="1.2" fill="#6e3b0f" />
      <circle cx="12" cy="10" r="1.2" fill="#6e3b0f" />
    </>
  ),
  glory: (
    <>
      <path d="M12 2l3 6 6.5 1-4.7 4.6 1.1 6.4L12 17l-5.9 3 1.1-6.4L2.5 9 9 8z" fill="#7ee8fa" stroke="#0b5569" strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
  xp: (
    <>
      <circle cx="12" cy="12" r="9" fill="#9c7bff" stroke="#3a1f8f" strokeWidth="1.5" />
      <text x="12" y="16" fontSize="9" textAnchor="middle" fill="#fff" fontFamily="Lilita One, sans-serif">XP</text>
    </>
  ),
  castle: <path d="M3 21V9h3v2h2V9h3v2h2V9h3v2h2V9h3v12h-7v-5a2 2 0 00-4 0v5z" fill="currentColor" />,
  cards: (
    <>
      <rect x="3" y="6" width="11" height="15" rx="2" fill="currentColor" opacity="0.55" transform="rotate(-10 8 13)" />
      <rect x="9" y="3" width="11" height="15" rx="2" fill="currentColor" transform="rotate(8 14 10)" />
    </>
  ),
  hero: (
    <>
      <circle cx="12" cy="7" r="4" fill="currentColor" />
      <path d="M4 21c0-5 3.6-8 8-8s8 3 8 8z" fill="currentColor" />
    </>
  ),
  base: <path d="M2 11l10-8 10 8v2h-2v8h-5v-6h-6v6H4v-8H2z" fill="currentColor" />,
  quests: (
    <>
      <path d="M6 3h10l3 3v15H6z" fill="currentColor" />
      <path d="M9 10h7M9 14h7M9 18h4" stroke="#1a1246" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  settings: (
    <path
      d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8.6 5.1l1.9 1.5-2 3.4-2.3-.8a8 8 0 01-2.2 1.3L15.6 22h-4l-.4-2.5a8 8 0 01-2.2-1.3l-2.3.8-2-3.4 1.9-1.5a8 8 0 010-2.6L4.7 9.9l2-3.4 2.3.8a8 8 0 012.2-1.3L11.6 3h4l.4 2.5a8 8 0 012.2 1.3l2.3-.8 2 3.4-1.9 1.5a8 8 0 010 2.6z"
      fill="currentColor"
      transform="translate(-1.6 -0.5)"
    />
  ),
  social: (
    <>
      <circle cx="8" cy="8" r="3.5" fill="currentColor" />
      <circle cx="17" cy="9" r="3" fill="currentColor" opacity="0.7" />
      <path d="M1.5 20c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5z" fill="currentColor" />
      <path d="M14 14.2c.9-.5 2-.7 3-.7 3 0 5.5 2 5.5 5.5h-6.5" fill="currentColor" opacity="0.7" />
    </>
  ),
  swords: (
    <>
      <path d="M4 3l9 9-2 2-9-9V3zM20 3l-9 9 2 2 9-9V3z" fill="currentColor" />
      <path d="M6 15l3 3-3 3-3-3zM18 15l-3 3 3 3 3-3z" fill="currentColor" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="currentColor" />
      <circle cx="12" cy="13" r="4" fill="#1a1246" />
      <circle cx="12" cy="13" r="2.2" fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor" />
      <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2.4" fill="none" />
    </>
  ),
  chest: (
    <>
      <path d="M3 10a5 5 0 015-5h8a5 5 0 015 5v2H3z" fill="#b5651d" stroke="#4a2408" strokeWidth="1.4" />
      <rect x="3" y="12" width="18" height="8" rx="1.5" fill="#d2843a" stroke="#4a2408" strokeWidth="1.4" />
      <rect x="10" y="10" width="4" height="5" rx="1" fill="#ffc94a" stroke="#4a2408" strokeWidth="1.2" />
    </>
  ),
  star: <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z" fill="currentColor" />,
  back: <path d="M15 4l-8 8 8 8" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  close: <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor" />,
  heart: <path d="M12 21s-9-5.5-9-12a5 5 0 019-3 5 5 0 019 3c0 6.5-9 12-9 12z" fill="currentColor" />,
  shield: <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  ),
  skull: (
    <>
      <path d="M12 3a8 8 0 00-8 8c0 3 1.5 4.5 3 5.5V20h10v-3.5c1.5-1 3-2.5 3-5.5a8 8 0 00-8-8z" fill="currentColor" />
      <circle cx="9" cy="11" r="2" fill="#1a1246" />
      <circle cx="15" cy="11" r="2" fill="#1a1246" />
    </>
  ),
  flame: <path d="M12 2s6 5 6 11a6 6 0 01-12 0c0-3 2-5 2-5s0 3 2 3c0-4 2-9 2-9z" fill="currentColor" />,
  check: <path d="M4 12l5 5L20 6" stroke="currentColor" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
    </>
  ),
  play: <path d="M7 4l13 8-13 8z" fill="currentColor" />,
  auto: (
    <>
      <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 3h10v5a5 5 0 01-10 0z" fill="currentColor" />
      <path d="M7 5H3c0 4 2 5 4 5M17 5h4c0 4-2 5-4 5" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M10 13h4v4h3v4H7v-4h3z" fill="currentColor" />
    </>
  ),
  map: <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M16 8V5a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h2" stroke="currentColor" strokeWidth="2.2" fill="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 11v6M12 7.2v.1" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />,
  up: <path d="M12 4l7 8h-4v8H9v-8H5z" fill="currentColor" />,
};

export function Icon({ name, size, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      {P[name]}
    </svg>
  );
}
