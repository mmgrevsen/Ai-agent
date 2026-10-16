import { circle, ellipse, glow, line, OUTLINE, paint, poly, rgba, shade, type Ctx } from './draw';

/**
 * Close-up character portraits for the card faces. Each card has its own original character drawn
 * in a 120 × 160 design space (scaled to the card), with a themed background filling the frame.
 */
const W = 120;
const H = 160;
const LW = 2.2;
const MOUTH = '#5a1428';
const ZOOM = 1.3;

type Portrait = (ctx: Ctx, t: number) => void;

// --- Helpers -------------------------------------------------------------------------------------

function bg(ctx: Ctx, stops: string[]): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function radial(ctx: Ctx, cx: number, cy: number, r: number, inner: string, outer: string): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function rays(ctx: Ctx, cx: number, cy: number, color: string, n: number, t: number, alpha = 0.25): void {
  ctx.save();
  ctx.fillStyle = rgba(color, alpha);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 0.15;
    const b = a + Math.PI / n;
    poly(ctx, [
      [cx, cy],
      [cx + Math.cos(a) * 200, cy + Math.sin(a) * 200],
      [cx + Math.cos(b) * 200, cy + Math.sin(b) * 200],
    ]);
    ctx.fill();
  }
  ctx.restore();
}

/** Shoulders / upper body filling the bottom of the card. */
function shoulders(ctx: Ctx, fill: string, y = 126, w = 46, cx = 60): void {
  ctx.beginPath();
  ctx.moveTo(cx - w - 22, H + 4);
  ctx.quadraticCurveTo(cx - w - 14, y + 2, cx - w * 0.35, y - 4);
  ctx.lineTo(cx + w * 0.35, y - 4);
  ctx.quadraticCurveTo(cx + w + 14, y + 2, cx + w + 22, H + 4);
  ctx.closePath();
  paint(ctx, fill, LW);
}

function headShape(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, skin: string): void {
  ellipse(ctx, cx, cy, rx, ry);
  paint(ctx, skin, LW);
  // soft shading on the lower side
  ctx.save();
  ellipse(ctx, cx, cy, rx, ry);
  ctx.clip();
  ctx.fillStyle = rgba('#000000', 0.08);
  ellipse(ctx, cx + rx * 0.35, cy + ry * 0.55, rx, ry * 0.6);
  ctx.fill();
  ctx.restore();
}

function ears(ctx: Ctx, cx: number, cy: number, rx: number, skin: string, pointy = false): void {
  for (const s of [-1, 1]) {
    if (pointy) {
      poly(ctx, [
        [cx + s * (rx - 3), cy - 6],
        [cx + s * (rx + 13), cy - 14],
        [cx + s * (rx - 2), cy + 6],
      ]);
    } else ellipse(ctx, cx + s * rx, cy + 2, 6, 8);
    paint(ctx, skin, LW);
  }
}

function blush(ctx: Ctx, cx: number, cy: number, gap: number, color = '#ff7b8a'): void {
  ctx.fillStyle = rgba(color, 0.35);
  for (const s of [-1, 1]) {
    ellipse(ctx, cx + s * gap, cy, 6, 3.5);
    ctx.fill();
  }
}

interface EyeOpts {
  iris: string;
  look?: number;
  squint?: boolean;
  closed?: boolean;
  glow?: string;
  slit?: boolean;
}

function eye(ctx: Ctx, x: number, y: number, rx: number, ry: number, o: EyeOpts): void {
  if (o.glow) {
    glow(ctx, x, y, rx * 2.6, o.glow, 0.8);
    ellipse(ctx, x, y, rx, ry * 0.75);
    paint(ctx, o.glow, 1.8);
    ellipse(ctx, x, y + 0.5, rx * 0.55, ry * 0.4);
    ctx.fillStyle = '#fffbe6';
    ctx.fill();
    return;
  }
  if (o.closed) {
    ctx.beginPath();
    ctx.moveTo(x - rx, y + 1);
    ctx.quadraticCurveTo(x, y - ry * 0.9, x + rx, y + 1);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.stroke();
    return;
  }
  if (o.squint) {
    line(ctx, x - rx, y + 1, x + rx, y - 1.5, OUTLINE, 3);
    line(ctx, x + rx, y - 1.5, x + rx + 3, y - 3.5, OUTLINE, 2);
    return;
  }
  ellipse(ctx, x, y, rx, ry);
  paint(ctx, '#ffffff', 1.8);
  const lx = (o.look ?? 0) * rx * 0.3;
  ellipse(ctx, x + lx, y + 1, rx * 0.64, ry * 0.68);
  ctx.fillStyle = o.iris;
  ctx.fill();
  ctx.fillStyle = '#160d2a';
  if (o.slit) ellipse(ctx, x + lx, y + 1, rx * 0.17, ry * 0.58);
  else circle(ctx, x + lx, y + 1, rx * 0.33);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  circle(ctx, x + lx - rx * 0.28, y - ry * 0.28, rx * 0.24);
  ctx.fill();
}

function eyes(ctx: Ctx, cx: number, cy: number, gap: number, rx: number, ry: number, o: EyeOpts, t: number, left: Partial<EyeOpts> = {}): void {
  const blink = !o.glow && (t + 1) % 4.3 < 0.13;
  eye(ctx, cx - gap, cy, rx, ry, { ...o, ...left, closed: blink || left.closed || o.closed });
  eye(ctx, cx + gap, cy, rx, ry, { ...o, closed: blink || o.closed });
}

/** Eyebrows; tilt > 0 = angry (inner ends low), tilt < 0 = worried/raised. */
function brows(ctx: Ctx, cx: number, cy: number, gap: number, color: string, tilt: number, thick = 4.5, len = 9): void {
  for (const s of [-1, 1]) {
    const outer = cx + s * (gap + len * 0.6);
    const inner = cx + s * (gap - len * 0.6);
    line(ctx, outer, cy - tilt, inner, cy + tilt, color, thick);
  }
}

function nose(ctx: Ctx, cx: number, cy: number, skin: string, r = 4.5): void {
  ellipse(ctx, cx, cy, r, r * 0.8);
  paint(ctx, shade(skin, -0.12), 1.4);
}

interface MouthOpts {
  teeth?: boolean;
  tongue?: boolean;
  gap?: boolean;
  fangs?: boolean;
}

/** Open grin: width 2w, depth h. */
function grin(ctx: Ctx, cx: number, cy: number, w: number, h: number, o: MouthOpts = {}): void {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(cx - w, cy);
    ctx.quadraticCurveTo(cx, cy + h * 2, cx + w, cy);
    ctx.quadraticCurveTo(cx, cy + h * 0.35, cx - w, cy);
    ctx.closePath();
  };
  ctx.save();
  path();
  ctx.fillStyle = MOUTH;
  ctx.fill();
  ctx.clip();
  if (o.teeth) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - w, cy - 2, w * 2, h * 0.62 + 2);
    if (o.gap) {
      ctx.fillStyle = MOUTH;
      ctx.fillRect(cx + w * 0.12, cy - 2, w * 0.2, h);
    }
  }
  if (o.tongue) {
    ctx.fillStyle = '#ff6b81';
    ellipse(ctx, cx, cy + h * 1.3, w * 0.5, h * 0.5);
    ctx.fill();
  }
  ctx.restore();
  path();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (o.fangs) {
    for (const s of [-1, 1]) {
      poly(ctx, [
        [cx + s * w * 0.62, cy + h * 0.15],
        [cx + s * w * 0.38, cy + h * 0.2],
        [cx + s * w * 0.52, cy + h * 0.85],
      ]);
      paint(ctx, '#ffffff', 1.2);
    }
  }
}

function smile(ctx: Ctx, cx: number, cy: number, w: number, curve = 6, side = 0): void {
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - side);
  ctx.quadraticCurveTo(cx, cy + curve, cx + w, cy + side - 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function mustache(ctx: Ctx, cx: number, cy: number, color: string, w = 16): void {
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 2);
    ctx.quadraticCurveTo(cx + s * w * 0.6, cy - 6, cx + s * w, cy - 1);
    ctx.quadraticCurveTo(cx + s * (w + 5), cy + 2, cx + s * (w + 2), cy - 5);
    ctx.quadraticCurveTo(cx + s * (w + 4), cy + 7, cx + s * w * 0.5, cy + 5);
    ctx.quadraticCurveTo(cx + s * 3, cy + 5, cx, cy + 2);
    ctx.closePath();
    paint(ctx, color, 1.8);
  }
}

/** A wobbling flame tongue rooted at (x, y). */
function flame(ctx: Ctx, x: number, y: number, w: number, h: number, outer: string, inner: string, t: number, seed: number): void {
  const sway = Math.sin(t * 7 + seed) * w * 0.35;
  const hh = h * (0.88 + 0.12 * Math.sin(t * 11 + seed * 2));
  const draw = (sw: number, sh: number, color: string) => {
    ctx.beginPath();
    ctx.moveTo(x - sw / 2, y);
    ctx.quadraticCurveTo(x - sw * 0.6, y - sh * 0.55, x + sway, y - sh);
    ctx.quadraticCurveTo(x + sw * 0.6, y - sh * 0.55, x + sw / 2, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  draw(w, hh, outer);
  draw(w * 0.55, hh * 0.6, inner);
}

function sparkle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  poly(ctx, [
    [x, y - r],
    [x + r * 0.25, y - r * 0.25],
    [x + r, y],
    [x + r * 0.25, y + r * 0.25],
    [x, y + r],
    [x - r * 0.25, y + r * 0.25],
    [x - r, y],
    [x - r * 0.25, y - r * 0.25],
  ]);
  ctx.fill();
}

function bolt(ctx: Ctx, pts: [number, number][], color: string, width: number): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = width * 0.4;
  ctx.stroke();
  ctx.restore();
}

// --- Portraits -----------------------------------------------------------------------------------

const SKIN = '#f6c79d';
const SKIN_WARM = '#e9a77a';

const thornbowArcher: Portrait = (ctx, t) => {
  bg(ctx, ['#b8f08f', '#5fae4f', '#24502b']);
  ctx.fillStyle = rgba('#1b3d1f', 0.45);
  for (const [x, h] of [
    [8, 70],
    [30, 95],
    [96, 80],
    [116, 100],
  ] as const) {
    poly(ctx, [
      [x, 20 + 100 - h],
      [x - 16, 130],
      [x + 16, 130],
    ]);
    ctx.fill();
  }
  // Second archer behind, on the left
  shoulders(ctx, '#2f6f39', 136, 22, 26);
  ellipse(ctx, 28, 92, 23, 25);
  paint(ctx, '#3f8f4a', LW);
  headShape(ctx, 28, 96, 15, 17, SKIN);
  eyes(ctx, 28, 95, 6, 3.6, 4.2, { iris: '#6b4f2a', look: 0.6 }, t + 1.7);
  smile(ctx, 30, 104, 5, 4);
  // Bow arcing on the right
  ctx.beginPath();
  ctx.moveTo(104, 26);
  ctx.quadraticCurveTo(130, 90, 104, 154);
  ctx.strokeStyle = '#7a4a1f';
  ctx.lineWidth = 6;
  ctx.stroke();
  line(ctx, 104, 26, 104, 154, '#f2ead0', 1.2);
  // Main archer
  shoulders(ctx, '#8a5a2b', 128, 40, 66);
  line(ctx, 34, 132, 92, 160, '#5b3a1e', 6);
  ellipse(ctx, 66, 78, 36, 40);
  paint(ctx, '#3f8f4a', LW);
  poly(ctx, [
    [52, 44],
    [66, 18],
    [82, 44],
  ]);
  paint(ctx, '#3f8f4a', LW);
  headShape(ctx, 66, 86, 26, 28, SKIN);
  ctx.fillStyle = '#7a4a1f';
  ctx.beginPath();
  ctx.moveTo(41, 76);
  ctx.quadraticCurveTo(52, 56, 66, 64);
  ctx.quadraticCurveTo(80, 54, 91, 76);
  ctx.quadraticCurveTo(78, 66, 66, 72);
  ctx.quadraticCurveTo(52, 64, 41, 76);
  ctx.fill();
  brows(ctx, 66, 76, 11, '#5b3a1e', 1.5, 3.5);
  eyes(ctx, 66, 86, 11, 6.5, 7.5, { iris: '#3f8f4a' }, t);
  nose(ctx, 66, 95, SKIN, 3.2);
  smile(ctx, 67, 103, 8, 4, 3);
  blush(ctx, 66, 99, 17);
  // Arrow fletchings over the shoulder
  for (const [x, c] of [
    [24, '#d9f2a0'],
    [30, '#ffffff'],
  ] as const) {
    poly(ctx, [
      [x, 112],
      [x + 5, 98],
      [x + 9, 112],
    ]);
    paint(ctx, c, 1.4);
  }
};

const oakshieldKnight: Portrait = (ctx, t) => {
  bg(ctx, ['#a8e0ff', '#6a9be0', '#3c5a9e']);
  ctx.fillStyle = '#8a93a6';
  ctx.fillRect(0, 112, W, 48);
  for (let x = 0; x < W; x += 20) ctx.fillRect(x, 102, 12, 12);
  shoulders(ctx, '#4a6fb5', 124, 46);
  for (const s of [-1, 1]) {
    ellipse(ctx, 60 + s * 40, 132, 20, 12);
    paint(ctx, '#c9ced9', LW);
  }
  headShape(ctx, 58, 86, 28, 30, SKIN);
  // Helmet dome with cheek guards
  ctx.beginPath();
  ctx.moveTo(26, 96);
  ctx.lineTo(28, 72);
  ctx.quadraticCurveTo(30, 42, 58, 40);
  ctx.quadraticCurveTo(86, 42, 88, 72);
  ctx.lineTo(90, 96);
  ctx.lineTo(80, 96);
  ctx.lineTo(79, 76);
  ctx.lineTo(37, 76);
  ctx.lineTo(36, 96);
  ctx.closePath();
  paint(ctx, '#c9ced9', LW);
  ctx.fillStyle = rgba('#ffffff', 0.55);
  ellipse(ctx, 44, 54, 8, 5, -0.6);
  ctx.fill();
  poly(ctx, [
    [55, 74],
    [61, 74],
    [60, 94],
    [56, 94],
  ]);
  paint(ctx, '#aab1bf', 1.6);
  for (const x of [32, 84]) {
    circle(ctx, x, 86, 1.8);
    ctx.fillStyle = '#7f8796';
    ctx.fill();
  }
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(28, 72, 61, 4);
  brows(ctx, 58, 80, 11, '#7a4a1f', 2.5, 4);
  eyes(ctx, 58, 86, 11, 5.5, 6.5, { iris: '#4a6fb5' }, t);
  mustache(ctx, 58, 101, '#a0662e', 15);
  grin(ctx, 58, 104, 9, 5, { teeth: true });
  // Oak shield in front
  circle(ctx, 94, 132, 30);
  paint(ctx, '#9a6430', LW);
  ctx.strokeStyle = '#7a4a1f';
  ctx.lineWidth = 1.4;
  for (const r of [22, 14]) {
    circle(ctx, 94, 132, r);
    ctx.stroke();
  }
  circle(ctx, 94, 132, 30);
  ctx.strokeStyle = '#8a93a6';
  ctx.lineWidth = 5;
  ctx.stroke();
  circle(ctx, 94, 132, 7);
  paint(ctx, '#f2c14e', 1.6);
};

const fieldMedic: Portrait = (ctx, t) => {
  bg(ctx, ['#e6fff1', '#9fe6b7', '#4fb57a']);
  ctx.fillStyle = rgba('#ffffff', 0.4);
  for (const [x, y] of [
    [16, 30],
    [100, 48],
    [20, 120],
  ] as const) {
    ctx.fillRect(x - 3, y - 9, 6, 18);
    ctx.fillRect(x - 9, y - 3, 18, 6);
  }
  shoulders(ctx, '#f4f1e8', 126, 44);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(22, 138, 16, 5);
  ctx.fillRect(27.5, 132.5, 5, 16);
  // Hair behind
  ellipse(ctx, 60, 84, 34, 34);
  paint(ctx, '#8a4b2a', LW);
  headShape(ctx, 60, 88, 27, 29, SKIN);
  ctx.fillStyle = '#8a4b2a';
  ctx.beginPath();
  ctx.moveTo(33, 82);
  ctx.quadraticCurveTo(46, 60, 72, 64);
  ctx.quadraticCurveTo(86, 66, 88, 82);
  ctx.quadraticCurveTo(70, 70, 33, 82);
  ctx.fill();
  // Cap with red cross
  ctx.beginPath();
  ctx.moveTo(34, 66);
  ctx.lineTo(38, 48);
  ctx.quadraticCurveTo(60, 38, 82, 48);
  ctx.lineTo(86, 66);
  ctx.quadraticCurveTo(60, 58, 34, 66);
  ctx.closePath();
  paint(ctx, '#ffffff', LW);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(56, 45, 8, 16);
  ctx.fillRect(52, 49, 16, 8);
  brows(ctx, 60, 77, 11, '#6b3a1f', -1.5, 3.2);
  eyes(ctx, 60, 87, 11, 6.5, 7.5, { iris: '#2e86c1' }, t);
  nose(ctx, 60, 96, SKIN, 3);
  grin(ctx, 60, 102, 10, 5, { teeth: true, tongue: true });
  blush(ctx, 60, 99, 18);
  // Potion bottle
  const bob = Math.sin(t * 2) * 1.5;
  glow(ctx, 96, 128 + bob, 22, '#7bd389', 0.6);
  ctx.beginPath();
  ctx.moveTo(92, 108 + bob);
  ctx.lineTo(100, 108 + bob);
  ctx.lineTo(100, 116 + bob);
  ctx.quadraticCurveTo(112, 122 + bob, 110, 134 + bob);
  ctx.quadraticCurveTo(108, 146 + bob, 96, 146 + bob);
  ctx.quadraticCurveTo(84, 146 + bob, 82, 134 + bob);
  ctx.quadraticCurveTo(80, 122 + bob, 92, 116 + bob);
  ctx.closePath();
  paint(ctx, '#7bd389', LW);
  ctx.fillStyle = rgba('#ffffff', 0.6);
  ellipse(ctx, 89, 128 + bob, 3, 6, 0.3);
  ctx.fill();
  ctx.fillStyle = '#a0662e';
  ctx.fillRect(91, 104 + bob, 10, 5);
};

const wolfRider: Portrait = (ctx, t) => {
  bg(ctx, ['#ffcf8a', '#e98a5a', '#6b4a5e']);
  ctx.fillStyle = '#efe6f2';
  poly(ctx, [
    [-10, 120],
    [30, 54],
    [70, 120],
  ]);
  ctx.fill();
  ctx.fillStyle = '#d4c6dd';
  poly(ctx, [
    [50, 120],
    [96, 40],
    [140, 120],
  ]);
  ctx.fill();
  shoulders(ctx, '#7a6a58', 126, 46);
  ctx.fillStyle = '#9b8a76';
  for (let i = 0; i < 9; i++) {
    poly(ctx, [
      [8 + i * 13, 132],
      [14 + i * 13, 146],
      [20 + i * 13, 132],
    ]);
    ctx.fill();
  }
  headShape(ctx, 60, 94, 25, 27, SKIN_WARM);
  // Wolf pelt hood
  ctx.beginPath();
  ctx.moveTo(28, 110);
  ctx.quadraticCurveTo(24, 70, 40, 56);
  ctx.lineTo(36, 30);
  ctx.lineTo(52, 46);
  ctx.quadraticCurveTo(60, 42, 68, 46);
  ctx.lineTo(84, 30);
  ctx.lineTo(80, 56);
  ctx.quadraticCurveTo(96, 70, 92, 110);
  ctx.lineTo(84, 110);
  ctx.quadraticCurveTo(86, 80, 60, 74);
  ctx.quadraticCurveTo(34, 80, 36, 110);
  ctx.closePath();
  paint(ctx, '#8d7c69', LW);
  for (const s of [-1, 1]) {
    poly(ctx, [
      [60 + s * 21, 34],
      [60 + s * 18, 48],
      [60 + s * 12, 46],
    ]);
    ctx.fillStyle = '#e8b4a0';
    ctx.fill();
  }
  // Wolf snout on the forehead with teeth
  ellipse(ctx, 60, 66, 14, 9);
  paint(ctx, '#a39380', LW);
  circle(ctx, 60, 60, 3.5);
  paint(ctx, '#2a1e1a', 1);
  for (let i = -2; i <= 2; i++) {
    poly(ctx, [
      [60 + i * 5 - 2, 73],
      [60 + i * 5 + 2, 73],
      [60 + i * 5, 79],
    ]);
    paint(ctx, '#ffffff', 1);
  }
  for (const s of [-1, 1]) {
    circle(ctx, 60 + s * 13, 56, 2.6);
    ctx.fillStyle = '#ffd34d';
    ctx.fill();
  }
  // War paint, angry face, shouting
  ctx.fillStyle = '#b5462f';
  for (const s of [-1, 1]) {
    ctx.fillRect(60 + s * 17 - 4, 98, 8, 3);
    ctx.fillRect(60 + s * 17 - 4, 103, 8, 3);
  }
  brows(ctx, 60, 84, 10, '#3a2a20', 3.5, 4.5);
  eyes(ctx, 60, 91, 10, 5.5, 6, { iris: '#7a4a1f' }, t);
  grin(ctx, 60, 104, 8, 7, { teeth: true, tongue: true });
};

const powderBombardier: Portrait = (ctx, t) => {
  radial(ctx, 92, 36, 110, '#fff2a8', '#7a3b12');
  rays(ctx, 92, 36, '#ffd27a', 12, t, 0.3);
  shoulders(ctx, '#5b4a3a', 126, 44);
  line(ctx, 26, 128, 82, 160, '#3a2a1e', 7);
  for (let i = 0; i < 3; i++) {
    circle(ctx, 40 + i * 14, 138 + i * 7, 4.5);
    paint(ctx, '#2a2a2a', 1.2);
  }
  headShape(ctx, 54, 90, 27, 28, SKIN);
  ears(ctx, 54, 92, 27, SKIN);
  // Spiky hair
  ctx.fillStyle = '#3a2a1e';
  poly(ctx, [
    [28, 76],
    [30, 54],
    [40, 64],
    [44, 48],
    [54, 60],
    [62, 46],
    [68, 60],
    [78, 52],
    [80, 76],
  ]);
  ctx.fill();
  // Goggles on the forehead
  ctx.fillStyle = '#5b3a1e';
  ctx.fillRect(26, 68, 56, 7);
  for (const x of [43, 66]) {
    circle(ctx, x, 70, 9);
    paint(ctx, '#6d7480', LW);
    circle(ctx, x, 70, 6);
    paint(ctx, '#ff9f43', 1.2);
    ctx.fillStyle = rgba('#ffffff', 0.7);
    circle(ctx, x - 2, 68, 2);
    ctx.fill();
  }
  // Soot smudges
  ctx.fillStyle = rgba('#3a2a1e', 0.35);
  ellipse(ctx, 36, 102, 6, 3);
  ctx.fill();
  ellipse(ctx, 74, 84, 4, 2.5);
  ctx.fill();
  brows(ctx, 54, 82, 11, '#3a2a1e', 1, 3.5);
  eyes(ctx, 54, 89, 11, 6, 7, { iris: '#6b4f2a', look: 0.8 }, t, { squint: true });
  nose(ctx, 54, 97, SKIN, 4);
  grin(ctx, 56, 104, 10, 5.5, { teeth: true, gap: true, tongue: true });
  // Bomb with a sparking fuse
  circle(ctx, 96, 126, 18);
  paint(ctx, '#2b2b33', LW);
  ctx.fillStyle = rgba('#ffffff', 0.35);
  ellipse(ctx, 89, 119, 5, 3.5, -0.6);
  ctx.fill();
  ctx.fillStyle = '#6d7480';
  ctx.fillRect(91, 104, 10, 6);
  ctx.beginPath();
  ctx.moveTo(96, 104);
  ctx.quadraticCurveTo(100, 92, 108, 92);
  ctx.strokeStyle = '#d9b77a';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  const s = 7 + Math.sin(t * 18) * 2.5;
  glow(ctx, 108, 92, 16, '#ffd34d', 0.9);
  sparkle(ctx, 108, 92, s, '#fff6c2');
};

const emberMage: Portrait = (ctx, t) => {
  bg(ctx, ['#3d0a0a', '#8f2a1e', '#f39c12']);
  for (let i = 0; i < 9; i++) {
    const y = (160 - ((t * 22 + i * 37) % 170)) | 0;
    const x = (i * 29) % 120;
    glow(ctx, x, y, 4, '#ffcf6a', 0.9);
  }
  shoulders(ctx, '#b03a2e', 126, 44);
  poly(ctx, [
    [40, 122],
    [60, 142],
    [80, 122],
  ]);
  paint(ctx, '#f39c12', LW);
  // Flame hair
  for (let i = 0; i < 7; i++) {
    const x = 28 + i * 10.5;
    flame(ctx, x, 92, 22, 54 + Math.sin(i * 1.7) * 12, '#ff6a2a', '#ffd34d', t, i * 1.3);
  }
  headShape(ctx, 60, 90, 25, 27, '#f8cfa5');
  flame(ctx, 60, 72, 46, 22, '#ff6a2a', '#ffd34d', t, 9);
  brows(ctx, 60, 80, 10, '#c0392b', 2, 3.2);
  eyes(ctx, 60, 89, 10, 6, 6.5, { iris: '#ff8c1a', glow: '#ff8c1a' }, t);
  nose(ctx, 60, 97, '#f8cfa5', 3);
  smile(ctx, 61, 104, 8, 4, 4);
  // Fireball in hand
  glow(ctx, 98, 128, 30, '#ff8c1a', 0.9);
  circle(ctx, 98, 128, 12);
  ctx.fillStyle = '#ffd34d';
  ctx.fill();
  flame(ctx, 98, 132, 24, 30, '#ff6a2a', '#fff2a8', t, 3);
};

const hawkeyeRanger: Portrait = (ctx, t) => {
  bg(ctx, ['#d8f0ff', '#9fd0ef', '#5d8fb0']);
  ctx.fillStyle = '#7da7c4';
  poly(ctx, [
    [-10, 120],
    [24, 70],
    [52, 106],
    [82, 62],
    [130, 120],
  ]);
  ctx.fill();
  shoulders(ctx, '#2e5e3e', 126, 44, 54);
  headShape(ctx, 54, 92, 25, 27, SKIN);
  // Ranger hat with feather
  ellipse(ctx, 54, 70, 42, 9, -0.08);
  paint(ctx, '#6b4f2a', LW);
  ctx.beginPath();
  ctx.moveTo(32, 70);
  ctx.quadraticCurveTo(34, 40, 56, 40);
  ctx.quadraticCurveTo(78, 40, 76, 68);
  ctx.closePath();
  paint(ctx, '#7d5d33', LW);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(33, 60, 43, 5);
  ctx.beginPath();
  ctx.moveTo(72, 62);
  ctx.quadraticCurveTo(100, 36, 98, 20);
  ctx.quadraticCurveTo(86, 40, 70, 58);
  ctx.closePath();
  paint(ctx, '#e74c3c', 1.6);
  brows(ctx, 54, 82, 10, '#5b3a1e', 2.5, 4);
  eyes(ctx, 54, 90, 10, 5.5, 6.5, { iris: '#2e5e3e' }, t, { squint: true });
  nose(ctx, 54, 98, SKIN, 3.5);
  smile(ctx, 56, 106, 8, 3, 4);
  ctx.fillStyle = rgba('#5b3a1e', 0.25);
  ellipse(ctx, 54, 112, 14, 5);
  ctx.fill();
  // Hawk on the shoulder
  ellipse(ctx, 98, 118, 16, 20, 0.2);
  paint(ctx, '#8a5a2b', LW);
  ellipse(ctx, 104, 96, 11, 11);
  paint(ctx, '#f7f1e3', LW);
  poly(ctx, [
    [92, 96],
    [84, 101],
    [93, 102],
  ]);
  paint(ctx, '#f5b041', 1.4);
  circle(ctx, 100, 93, 3);
  ctx.fillStyle = '#160d2a';
  ctx.fill();
  line(ctx, 96, 89, 104, 91, OUTLINE, 2);
  ctx.strokeStyle = '#5b3a1e';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(98, 112 + i * 7, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
};

const dawnPaladin: Portrait = (ctx, t) => {
  radial(ctx, 60, 70, 120, '#fffbe0', '#f0a030');
  rays(ctx, 60, 70, '#ffffff', 14, t, 0.35);
  circle(ctx, 60, 74, 42);
  ctx.strokeStyle = rgba('#ffe28a', 0.9);
  ctx.lineWidth = 5;
  ctx.stroke();
  // Hair
  ctx.beginPath();
  ctx.moveTo(30, 120);
  ctx.quadraticCurveTo(24, 70, 60, 58);
  ctx.quadraticCurveTo(96, 70, 90, 120);
  ctx.closePath();
  paint(ctx, '#f4d03f', LW);
  shoulders(ctx, '#f5c542', 126, 46);
  poly(ctx, [
    [42, 126],
    [78, 126],
    [72, 160],
    [48, 160],
  ]);
  paint(ctx, '#fdfefe', LW);
  circle(ctx, 60, 142, 7);
  paint(ctx, '#f39c12', 1.4);
  headShape(ctx, 60, 92, 25, 27, SKIN);
  // Circlet helm with wings
  ctx.beginPath();
  ctx.moveTo(34, 82);
  ctx.quadraticCurveTo(34, 60, 60, 58);
  ctx.quadraticCurveTo(86, 60, 86, 82);
  ctx.quadraticCurveTo(60, 72, 34, 82);
  ctx.closePath();
  paint(ctx, '#f5c542', LW);
  poly(ctx, [
    [56, 70],
    [60, 60],
    [64, 70],
    [60, 76],
  ]);
  paint(ctx, '#5dade2', 1.4);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(60 + s * 26, 76);
    ctx.quadraticCurveTo(60 + s * 46, 56, 60 + s * 44, 40);
    ctx.quadraticCurveTo(60 + s * 40, 58, 60 + s * 26, 66);
    ctx.closePath();
    paint(ctx, '#ffffff', LW);
  }
  brows(ctx, 60, 82, 10, '#d4a017', -1, 3);
  eyes(ctx, 60, 90, 10, 5.5, 6.5, { iris: '#3498db' }, t);
  nose(ctx, 60, 98, SKIN, 3);
  smile(ctx, 60, 105, 8, 5);
  blush(ctx, 60, 101, 16);
};

const bastionGolem: Portrait = (ctx, t) => {
  bg(ctx, ['#c4d7ea', '#8a9fb3', '#4d5a66']);
  ctx.fillStyle = '#6f7f8f';
  poly(ctx, [
    [-10, 130],
    [20, 80],
    [50, 130],
  ]);
  ctx.fill();
  // Boulder shoulders
  for (const [x, y, r] of [
    [14, 140, 26],
    [106, 140, 26],
    [60, 152, 30],
  ] as const) {
    circle(ctx, x, y, r);
    paint(ctx, '#6f7b85', LW);
  }
  // Blocky stone head
  poly(ctx, [
    [22, 54],
    [34, 44],
    [86, 44],
    [98, 56],
    [96, 120],
    [84, 130],
    [36, 130],
    [24, 118],
  ]);
  paint(ctx, '#8e9aa3', LW);
  ctx.fillStyle = rgba('#000000', 0.12);
  poly(ctx, [
    [70, 44],
    [86, 44],
    [98, 56],
    [96, 120],
    [84, 130],
    [64, 130],
  ]);
  ctx.fill();
  // Battlements on top
  for (const x of [30, 48, 66, 84]) {
    poly(ctx, [
      [x - 6, 46],
      [x - 6, 34],
      [x + 6, 34],
      [x + 6, 46],
    ]);
    paint(ctx, '#9aa6ae', LW);
  }
  // Cracks and moss
  ctx.strokeStyle = '#4d5a66';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(32, 60);
  ctx.lineTo(40, 70);
  ctx.lineTo(36, 78);
  ctx.moveTo(88, 96);
  ctx.lineTo(80, 104);
  ctx.lineTo(84, 114);
  ctx.stroke();
  ctx.fillStyle = '#6aa84f';
  ellipse(ctx, 30, 120, 10, 5);
  ctx.fill();
  ellipse(ctx, 80, 48, 9, 4);
  ctx.fill();
  // Heavy brow ridge and glowing eyes
  poly(ctx, [
    [28, 72],
    [92, 72],
    [90, 82],
    [30, 82],
  ]);
  paint(ctx, '#7a8690', LW);
  const pulse = 0.8 + Math.sin(t * 3) * 0.2;
  for (const x of [44, 76]) {
    glow(ctx, x, 90, 18 * pulse, '#5dade2', 0.9);
    ellipse(ctx, x, 90, 8, 4);
    paint(ctx, '#d6f1ff', 1.4);
  }
  // Jagged stone mouth
  poly(ctx, [
    [40, 110],
    [48, 106],
    [56, 111],
    [64, 106],
    [72, 111],
    [80, 107],
    [80, 116],
    [40, 116],
  ]);
  paint(ctx, '#3d464f', 1.6);
};

const frostWitch: Portrait = (ctx, t) => {
  bg(ctx, ['#f1fbff', '#8fd0f2', '#1b4f72']);
  for (let i = 0; i < 12; i++) {
    const x = (i * 37 + Math.sin(t + i) * 6) % 120;
    const y = (t * 14 + i * 29) % 170 - 10;
    sparkle(ctx, x, y, 3, rgba('#ffffff', 0.85));
  }
  // Long white hair
  ctx.beginPath();
  ctx.moveTo(26, 140);
  ctx.quadraticCurveTo(22, 80, 60, 72);
  ctx.quadraticCurveTo(98, 80, 94, 140);
  ctx.closePath();
  paint(ctx, '#dbe6ff', LW);
  shoulders(ctx, '#1b4f72', 128, 44);
  ctx.beginPath();
  ctx.ellipse(60, 126, 34, 9, 0, 0, Math.PI * 2);
  paint(ctx, '#ffffff', LW);
  headShape(ctx, 60, 96, 24, 26, '#c9e3f7');
  // Witch hat
  ellipse(ctx, 60, 76, 44, 9);
  paint(ctx, '#bfe6fa', LW);
  ctx.beginPath();
  ctx.moveTo(36, 76);
  ctx.quadraticCurveTo(44, 46, 60, 34);
  ctx.quadraticCurveTo(70, 18, 92, 12);
  ctx.quadraticCurveTo(76, 30, 80, 46);
  ctx.quadraticCurveTo(84, 62, 84, 76);
  ctx.closePath();
  paint(ctx, '#1b4f72', LW);
  ctx.fillStyle = '#5dade2';
  ctx.fillRect(38, 66, 46, 6);
  sparkle(ctx, 60, 69, 7, '#ffffff');
  brows(ctx, 60, 86, 10, '#ffffff', 1.5, 3);
  eyes(ctx, 60, 94, 10, 5.5, 6.5, { iris: '#48c9f0' }, t);
  nose(ctx, 60, 102, '#d6eaf8', 2.6);
  smile(ctx, 61, 109, 7, 3, 4);
  blush(ctx, 60, 105, 15, '#8fb7ff');
  // Ice crystal in hand
  glow(ctx, 98, 130, 22, '#bfe6fa', 0.8);
  poly(ctx, [
    [98, 110],
    [106, 128],
    [98, 148],
    [90, 128],
  ]);
  paint(ctx, '#d6f4ff', LW);
};

const aegisGuardian: Portrait = (ctx, t) => {
  bg(ctx, ['#4f86c0', '#24507f', '#0d2440']);
  shoulders(ctx, '#1f618d', 126, 46);
  for (const s of [-1, 1]) {
    ellipse(ctx, 60 + s * 40, 130, 20, 13);
    paint(ctx, '#2f79ab', LW);
  }
  // Plume
  ctx.beginPath();
  ctx.moveTo(56, 44);
  ctx.quadraticCurveTo(60, 14, 90, 14);
  ctx.quadraticCurveTo(76, 26, 66, 46);
  ctx.closePath();
  paint(ctx, '#f5b041', LW);
  // Full helm
  ctx.beginPath();
  ctx.moveTo(30, 112);
  ctx.lineTo(30, 72);
  ctx.quadraticCurveTo(32, 40, 60, 40);
  ctx.quadraticCurveTo(88, 40, 90, 72);
  ctx.lineTo(90, 112);
  ctx.quadraticCurveTo(60, 122, 30, 112);
  ctx.closePath();
  paint(ctx, '#7fa8c9', LW);
  ctx.fillStyle = rgba('#ffffff', 0.4);
  ellipse(ctx, 44, 56, 8, 5, -0.6);
  ctx.fill();
  line(ctx, 60, 42, 60, 118, '#5c86a8', 3);
  // Visor slit with glowing eyes
  ctx.fillStyle = '#0b1424';
  ctx.fillRect(34, 76, 52, 9);
  const pulse = 0.85 + Math.sin(t * 2.5) * 0.15;
  for (const x of [48, 72]) {
    glow(ctx, x, 80, 12 * pulse, '#ffd34d', 0.9);
    ellipse(ctx, x, 80, 5, 2.4);
    ctx.fillStyle = '#fff3b0';
    ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#0b1424';
    ctx.fillRect(40 + i * 12, 96, 4, 10);
  }
  // Tower shield in front
  ctx.beginPath();
  ctx.moveTo(4, 118);
  ctx.lineTo(56, 118);
  ctx.lineTo(56, 150);
  ctx.quadraticCurveTo(30, 170, 4, 150);
  ctx.closePath();
  paint(ctx, '#1f618d', LW);
  ctx.strokeStyle = '#f5b041';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  circle(ctx, 30, 136, 8);
  paint(ctx, '#f5b041', 1.6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    line(ctx, 30 + Math.cos(a) * 10, 136 + Math.sin(a) * 10, 30 + Math.cos(a) * 14, 136 + Math.sin(a) * 14, '#f5b041', 2);
  }
};

const shadeAssassin: Portrait = (ctx, t) => {
  bg(ctx, ['#4a3480', '#241a4a', '#0e0a20']);
  glow(ctx, 92, 32, 30, '#e8daef', 0.5);
  circle(ctx, 92, 32, 14);
  ctx.fillStyle = '#f4ecfa';
  ctx.fill();
  shoulders(ctx, '#2c2c54', 126, 44);
  // Hood
  ctx.beginPath();
  ctx.moveTo(22, 128);
  ctx.quadraticCurveTo(18, 60, 60, 40);
  ctx.quadraticCurveTo(102, 60, 98, 128);
  ctx.closePath();
  paint(ctx, '#3b3b6e', LW);
  headShape(ctx, 60, 90, 24, 26, '#e9c2a0');
  // Hood shadow over the forehead
  ctx.fillStyle = '#2c2c54';
  ctx.beginPath();
  ctx.moveTo(34, 84);
  ctx.quadraticCurveTo(40, 58, 60, 56);
  ctx.quadraticCurveTo(80, 58, 86, 84);
  ctx.quadraticCurveTo(60, 70, 34, 84);
  ctx.fill();
  // Mask over the lower face
  ctx.beginPath();
  ctx.moveTo(35, 96);
  ctx.quadraticCurveTo(60, 90, 85, 96);
  ctx.lineTo(82, 112);
  ctx.quadraticCurveTo(60, 124, 38, 112);
  ctx.closePath();
  paint(ctx, '#8e44ad', LW);
  brows(ctx, 60, 82, 10, '#1a1030', 3, 4);
  eyes(ctx, 60, 89, 10, 5.5, 5, { iris: '#b98ee0', look: -0.6 }, t);
  // Scarf tail and dagger
  ctx.beginPath();
  ctx.moveTo(80, 124);
  ctx.quadraticCurveTo(100, 132 + Math.sin(t * 3) * 3, 112, 126);
  ctx.lineTo(108, 140);
  ctx.quadraticCurveTo(96, 142, 78, 132);
  ctx.closePath();
  paint(ctx, '#8e44ad', LW);
  ctx.save();
  ctx.translate(26, 132);
  ctx.rotate(-0.5);
  poly(ctx, [
    [-3, 0],
    [3, 0],
    [0, -40],
  ]);
  paint(ctx, '#dfe6ee', 1.6);
  ctx.fillStyle = '#f5b041';
  ctx.fillRect(-8, 0, 16, 4);
  ctx.fillStyle = '#3a2a1e';
  ctx.fillRect(-2.5, 4, 5, 12);
  ctx.restore();
  sparkle(ctx, 38, 98, 4 + Math.sin(t * 4) * 1.5, '#ffffff');
};

const stormAdept: Portrait = (ctx, t) => {
  bg(ctx, ['#7b4396', '#3d1d5e', '#170b2a']);
  ctx.fillStyle = rgba('#2a1640', 0.8);
  for (const [x, y, r] of [
    [10, 24, 20],
    [36, 16, 18],
    [84, 20, 22],
    [112, 28, 18],
  ] as const) {
    circle(ctx, x, y, r);
    ctx.fill();
  }
  if ((t * 1.3) % 3 < 0.25) bolt(ctx, [[100, 20], [90, 44], [100, 50], [86, 80]], '#f7dc6f', 3);
  shoulders(ctx, '#5b2c6f', 126, 44);
  ctx.fillStyle = '#f7dc6f';
  ctx.fillRect(30, 124, 60, 5);
  // Wild spiky hair
  const spikes: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    const r = i % 2 ? 30 : 46;
    spikes.push([60 + Math.cos(a) * r * 1.1, 82 + Math.sin(a) * r]);
  }
  poly(ctx, [[22, 92], ...spikes, [98, 92]]);
  paint(ctx, '#ece2f5', LW);
  headShape(ctx, 60, 94, 24, 26, SKIN);
  brows(ctx, 60, 84, 10, '#ece2f5', 3, 4.5);
  eyes(ctx, 60, 92, 10, 6, 6.5, { iris: '#f7dc6f', glow: '#f7dc6f' }, t);
  nose(ctx, 60, 100, SKIN, 3);
  grin(ctx, 60, 106, 10, 5, { teeth: true });
  // Sparks crackling in the hair and hand
  const flick = Math.floor(t * 8) % 3;
  sparkle(ctx, 30 + flick * 6, 50, 4, '#f7dc6f');
  sparkle(ctx, 88 - flick * 5, 46, 3.5, '#aed6f1');
  glow(ctx, 100, 134, 22, '#aed6f1', 0.8);
  bolt(ctx, [[92, 150], [100, 136], [94, 132], [104, 116]], '#aed6f1', 3);
};

const phoenixWarden: Portrait = (ctx, t) => {
  bg(ctx, ['#fff2c0', '#f5a623', '#a93226']);
  for (let i = 0; i < 8; i++) flame(ctx, i * 17, 164, 26, 40 + (i % 3) * 10, '#e74c3c', '#f5b041', t, i);
  // Wings behind
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(60 + s * 18, 116);
    ctx.quadraticCurveTo(60 + s * 70, 100, 60 + s * 62, 40);
    ctx.quadraticCurveTo(60 + s * 52, 80, 60 + s * 24, 96);
    ctx.closePath();
    paint(ctx, '#e74c3c', LW);
    for (let i = 0; i < 3; i++) line(ctx, 60 + s * (26 + i * 10), 108 - i * 6, 60 + s * (44 + i * 6), 70 - i * 8, '#f5b041', 2);
  }
  shoulders(ctx, '#c0392b', 128, 36);
  // Flame crest
  for (let i = 0; i < 5; i++) flame(ctx, 40 + i * 10, 64, 16, 40 - Math.abs(i - 2) * 6, '#ff6a2a', '#ffe08a', t, i * 2.1);
  headShape(ctx, 60, 86, 26, 28, '#e74c3c');
  // Feather layers on the cheeks
  ctx.fillStyle = '#f5b041';
  for (const s of [-1, 1]) {
    poly(ctx, [
      [60 + s * 24, 90],
      [60 + s * 34, 104],
      [60 + s * 18, 102],
    ]);
    ctx.fill();
  }
  ctx.fillStyle = '#fdebd0';
  ellipse(ctx, 60, 104, 16, 12);
  ctx.fill();
  brows(ctx, 60, 76, 12, '#7b1f14', 3.5, 4.5);
  eyes(ctx, 60, 84, 12, 6.5, 7, { iris: '#f5b041', slit: true }, t);
  // Golden hooked beak
  ctx.beginPath();
  ctx.moveTo(48, 94);
  ctx.quadraticCurveTo(60, 88, 72, 94);
  ctx.quadraticCurveTo(68, 108, 60, 116);
  ctx.quadraticCurveTo(52, 108, 48, 94);
  ctx.closePath();
  paint(ctx, '#f5c542', LW);
  line(ctx, 50, 99, 70, 99, '#b9770e', 1.5);
};

const auroraDrake: Portrait = (ctx, t) => {
  bg(ctx, ['#0b1a3a', '#14305a', '#0b1a3a']);
  for (const [c, y0, k] of [
    ['#48c9b0', 30, 0],
    ['#a569bd', 46, 1.6],
    ['#ff8ad8', 60, 3.1],
  ] as const) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const y = y0 + Math.sin(x * 0.06 + t * 0.9 + k) * 8;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(c, 0.55);
    ctx.lineWidth = 10;
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) sparkle(ctx, (i * 41) % 120, (i * 23) % 60 + 4, 1.6 + (i % 3), rgba('#ffffff', 0.8));
  // Neck
  shoulders(ctx, '#3aa893', 128, 30);
  ctx.fillStyle = '#e8f8f5';
  for (let i = 0; i < 3; i++) {
    ellipse(ctx, 60, 136 + i * 9, 16 - i * 2, 4);
    ctx.fill();
  }
  // Horns and frills
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(60 + s * 14, 62);
    ctx.quadraticCurveTo(60 + s * 40, 50, 60 + s * 44, 22);
    ctx.quadraticCurveTo(60 + s * 32, 46, 60 + s * 22, 70);
    ctx.closePath();
    paint(ctx, '#f3ead2', LW);
    poly(ctx, [
      [60 + s * 26, 76],
      [60 + s * 48, 70],
      [60 + s * 40, 84],
      [60 + s * 50, 92],
      [60 + s * 28, 96],
    ]);
    paint(ctx, '#a569bd', LW);
  }
  headShape(ctx, 60, 82, 28, 24, '#48c9b0');
  // Snout
  ellipse(ctx, 60, 106, 22, 15);
  paint(ctx, '#55d6bc', LW);
  for (const s of [-1, 1]) {
    ellipse(ctx, 60 + s * 8, 100, 2.5, 1.8);
    ctx.fillStyle = '#1f5f55';
    ctx.fill();
  }
  ctx.fillStyle = rgba('#e8f8f5', 0.6);
  for (const [x, y] of [
    [48, 68],
    [60, 64],
    [72, 68],
  ] as const) {
    ellipse(ctx, x, y, 4, 2.5);
    ctx.fill();
  }
  brows(ctx, 60, 74, 13, '#1f7f6e', -1, 4);
  eyes(ctx, 60, 82, 13, 7.5, 8.5, { iris: '#c39bd3', slit: true }, t);
  grin(ctx, 60, 110, 14, 4, { fangs: true, tongue: true });
};

const PORTRAITS: Record<string, Portrait> = {
  thornbow_archer: thornbowArcher,
  oakshield_knight: oakshieldKnight,
  field_medic: fieldMedic,
  wolf_rider: wolfRider,
  powder_bombardier: powderBombardier,
  ember_mage: emberMage,
  hawkeye_ranger: hawkeyeRanger,
  dawn_paladin: dawnPaladin,
  bastion_golem: bastionGolem,
  frost_witch: frostWitch,
  aegis_guardian: aegisGuardian,
  shade_assassin: shadeAssassin,
  storm_adept: stormAdept,
  phoenix_warden: phoenixWarden,
  aurora_drake: auroraDrake,
};

export function hasPortrait(cardId: string): boolean {
  return cardId in PORTRAITS;
}

/** Draws the card portrait scaled to fill a w × h area (3:4). */
export function drawCardPortrait(ctx: Ctx, cardId: string, w: number, h: number, t: number): void {
  const p = PORTRAITS[cardId];
  if (!p) return;
  ctx.save();
  const s = Math.max(w / W, h / H);
  ctx.translate((w - W * s) / 2, (h - H * s) / 2);
  ctx.scale(s, s);
  // Zoom in on the face so it fills the card like a close-up
  ctx.translate(60, 90);
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-60, -90);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  p(ctx, t);
  ctx.restore();
}
