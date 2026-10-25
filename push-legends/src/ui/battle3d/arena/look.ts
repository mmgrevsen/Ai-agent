/**
 * Per-world mood of the castle-courtyard arena. Every world fights in the same gothic courtyard
 * (dark stone paving with a gold sigil, crimson banners, braziers, knight statues, castle walls);
 * the look changes the light, sky, palette and a few props.
 */
export interface ArenaLook {
  /** Wall and tower stone, darker trim stone, roof slate. */
  stone: string;
  stoneDark: string;
  slate: string;
  /** Paving slabs (two tones mixed per slab) and the mortar / earth in the gaps. */
  pave: string;
  paveAlt: string;
  mortar: string;
  statue: string;
  /** Banner cloth and the muted gold of sigils and trims. */
  cloth: string;
  gold: string;
  /** Brazier flame: outer, middle and core colours (core is the hottest). */
  flame: [string, string, string];
  /** Warm light pools around the braziers. */
  pool: string;
  poolStrength: number;
  /** Sky gradient (top, middle, horizon), sun glow and cloud colour of the backdrop. */
  sky: [string, string, string];
  sunGlow: string;
  cloud: string;
  stars: boolean;
  mountain: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  /** Sun direction in scene space (x = right, y = up, -z = far end of the lane). */
  sunDir: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  env: [string, string, string];
  envIntensity: number;
  exposure: number;
  /** 0..1 snow on upward faces, 0..1 ruin (cracks, missing slabs, rubble, broken statues). */
  snow: number;
  ruin: number;
  /** 0..1 moss / grime tint on the stone. */
  moss: number;
  /** Glowing lava seams between slabs (forge world). */
  lava: boolean;
  /** Glowing crystals along the walls (crystal world). */
  crystals: boolean;
  /** The ground sigil glows (null = plain inlaid gold). */
  sigilGlow: string | null;
  /** Ambient particles: colour and motion (dust drifts, snow falls, embers rise). */
  particle: string;
  particleMode: 'drift' | 'fall' | 'rise';
  /** Gold veins in the paving (0 = none). */
  veins: number;
}

const GOLDEN: ArenaLook = {
  stone: '#5b5650',
  stoneDark: '#3b3733',
  slate: '#2c2a2e',
  pave: '#716759',
  paveAlt: '#5c544a',
  mortar: '#211d1a',
  statue: '#6f6a63',
  cloth: '#7a1016',
  gold: '#c29a48',
  flame: ['#ff4a0e', '#ff8a24', '#ffd77a'],
  pool: '#ff8a3a',
  poolStrength: 0.36,
  sky: ['#6d7fa0', '#e2a272', '#ffc77e'],
  sunGlow: '#fff0c4',
  cloud: '#ffe2bc',
  stars: false,
  mountain: '#6d6f86',
  fog: '#d79a66',
  fogNear: 115,
  fogFar: 360,
  sunDir: [20, 11, 6],
  sunColor: '#ffbb72',
  sunIntensity: 4.3,
  hemiSky: '#ffd8b0',
  hemiGround: '#3f3128',
  hemiIntensity: 0.3,
  env: ['#8e8678', '#ffc08a', '#5a4836'],
  envIntensity: 0.4,
  exposure: 1.0,
  snow: 0,
  ruin: 0,
  moss: 0,
  lava: false,
  crystals: false,
  sigilGlow: null,
  particle: '#ffd9a0',
  particleMode: 'drift',
  veins: 0.6,
};

export const ARENA_LOOKS: readonly ArenaLook[] = [
  GOLDEN,
  // Frostfang: snow-dusted courtyard under a cold, pale winter sun
  {
    ...GOLDEN,
    stone: '#5d6168',
    stoneDark: '#3b3f46',
    slate: '#2b3038',
    pave: '#737a82',
    paveAlt: '#5f656d',
    mortar: '#1e2228',
    statue: '#717880',
    cloth: '#6e1219',
    gold: '#a99060',
    pool: '#ff9a50',
    poolStrength: 0.36,
    sky: ['#5c7ea6', '#a9c0d6', '#e6eef5'],
    sunGlow: '#ffffff',
    cloud: '#eef4fa',
    mountain: '#8e9db4',
    fog: '#c9d6e3',
    fogNear: 100,
    fogFar: 330,
    sunDir: [16, 17, -14],
    sunColor: '#e6efff',
    sunIntensity: 3.1,
    hemiSky: '#dbe8ff',
    hemiGround: '#5a6370',
    hemiIntensity: 0.6,
    env: ['#7d9cc4', '#e3edf6', '#8a96a6'],
    envIntensity: 0.6,
    exposure: 0.9,
    snow: 0.85,
    particle: '#ffffff',
    particleMode: 'fall',
    veins: 0.4,
  },
  // Emberforge: ash-red dusk, lava seams glowing between the slabs, big forge fires
  {
    ...GOLDEN,
    stone: '#4a3d38',
    stoneDark: '#2c2220',
    slate: '#231c1c',
    pave: '#6a5a52',
    paveAlt: '#574a44',
    mortar: '#160e0b',
    statue: '#5b4c45',
    cloth: '#851016',
    gold: '#b8863a',
    flame: ['#ff3a08', '#ff7a1a', '#ffc860'],
    pool: '#ff6a20',
    poolStrength: 0.6,
    sky: ['#2a0f12', '#7a2a18', '#e8632a'],
    sunGlow: '#ffb070',
    cloud: '#5a2a24',
    mountain: '#3a2422',
    fog: '#7a3420',
    fogNear: 100,
    fogFar: 320,
    sunDir: [14, 10, -18],
    sunColor: '#ff9a5a',
    sunIntensity: 3.0,
    hemiSky: '#e8c0a8',
    hemiGround: '#3a1a12',
    hemiIntensity: 0.55,
    env: ['#5a2a2a', '#ff8a4a', '#3a1c14'],
    envIntensity: 0.6,
    exposure: 1.15,
    lava: true,
    particle: '#ffa040',
    particleMode: 'rise',
    veins: 0.5,
  },
  // Shattered Bastion: a broken, overgrown courtyard in grey-green gloom, witch-fire braziers
  {
    ...GOLDEN,
    stone: '#575c56',
    stoneDark: '#363a35',
    slate: '#2a2e2c',
    pave: '#6c7068',
    paveAlt: '#5a5e57',
    mortar: '#1c1f1b',
    statue: '#6a6f68',
    cloth: '#4a1a1c',
    gold: '#8f8458',
    flame: ['#1fae5e', '#58d68d', '#d8ffe0'],
    pool: '#58d68d',
    poolStrength: 0.4,
    sky: ['#26343a', '#5f6e6a', '#a2ad9c'],
    sunGlow: '#e8f0dc',
    cloud: '#8a958a',
    mountain: '#4f5a58',
    fog: '#7f8c84',
    fogNear: 85,
    fogFar: 300,
    sunDir: [15, 16, -12],
    sunColor: '#d6e2cf',
    sunIntensity: 3.0,
    hemiSky: '#c8d8cc',
    hemiGround: '#3a3a32',
    hemiIntensity: 0.62,
    env: ['#52646a', '#a8b4a2', '#3c3e36'],
    envIntensity: 0.75,
    exposure: 1.2,
    ruin: 1,
    moss: 0.7,
    particle: '#c8d8c0',
    particleMode: 'drift',
    veins: 0.25,
  },
  // Umbral Depths: the courtyard at night, lit by violet crystals and spirit-fire braziers
  {
    ...GOLDEN,
    stone: '#46425a',
    stoneDark: '#2a2738',
    slate: '#1e1b2a',
    pave: '#5a5570',
    paveAlt: '#4a465e',
    mortar: '#120f1c',
    statue: '#5a5670',
    cloth: '#5a1030',
    gold: '#a58c5c',
    flame: ['#7a2cff', '#b670ff', '#f0dcff'],
    pool: '#9a5cff',
    poolStrength: 0.55,
    sky: ['#070512', '#1b1035', '#4a235a'],
    sunGlow: '#c8c0ff',
    cloud: '#2a1d4a',
    stars: true,
    mountain: '#231a3a',
    fog: '#2a1d48',
    fogNear: 95,
    fogFar: 320,
    sunDir: [-14, 18, -15],
    sunColor: '#a9b4ff',
    sunIntensity: 2.4,
    hemiSky: '#b9a8ff',
    hemiGround: '#2a1f3a',
    hemiIntensity: 0.7,
    env: ['#2a2050', '#7a5aa0', '#1e1830'],
    envIntensity: 0.8,
    exposure: 1.3,
    crystals: true,
    sigilGlow: '#48e0c8',
    particle: '#d7b8ff',
    particleMode: 'drift',
    veins: 0.5,
  },
];

export function arenaLook(world: number): ArenaLook {
  return ARENA_LOOKS[world] ?? GOLDEN;
}
