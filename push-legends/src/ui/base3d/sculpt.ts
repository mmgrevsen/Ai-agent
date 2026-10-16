import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit } from './kit';

/**
 * Sculpting toolkit shared by every 3D model (characters, buildings, scenery): rounded and lathed
 * primitives, tapered curved tubes, bevelled flat shapes and folded cloth, all merged into one
 * vertex-coloured mesh by Kit.
 */

export type V = [number, number, number];

/** A tube along a smooth curve whose radius tapers from r0 to r1 (horns, hair, bows, roots). */
export function taperTube(points: V[], r0: number, r1: number, radial = 8, steps = 14): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(steps, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = radial + 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    const n = frames.normals[i]!;
    const b = frames.binormals[i]!;
    const r = Math.max(0.002, r0 + (r1 - r0) * t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + r * (c * n.x + s * b.x), p.y + r * (c * n.y + s * b.y), p.z + r * (c * n.z + s * b.z));
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const bb = a + ring;
      idx.push(a, a + 1, bb, bb, a + 1, bb + 1);
    }
  }
  // Caps with their own vertices so their normals stay flat
  const cap = (i: number, flip: boolean) => {
    const p = curve.getPointAt(i / steps);
    const c = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    for (let j = 0; j <= radial; j++) pos.push(pos[(i * ring + j) * 3]!, pos[(i * ring + j) * 3 + 1]!, pos[(i * ring + j) * 3 + 2]!);
    for (let j = 0; j < radial; j++) {
      if (flip) idx.push(c, c + 2 + j, c + 1 + j);
      else idx.push(c, c + 1 + j, c + 2 + j);
    }
  };
  cap(0, true);
  if (r1 > 0.01) cap(steps, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function shapeFrom(pts: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

export function star(r: number, inner: number, n = 5): THREE.Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? inner : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return shapeFrom(pts);
}

/** Kit with smooth and sculpted primitives (positions are centres unless noted). */
export class K extends Kit {
  ball(r: number, x: number, y: number, z: number, hex: string, sx = 1, sy = 1, sz = 1, seg = r < 0.1 ? 8 : r < 0.25 ? 11 : 15): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), hex, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  pill(r: number, len: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.CapsuleGeometry(r, len, 3, r < 0.08 ? 6 : 10), hex, x, y, z, rx, ry, rz);
  }
  rbox(w: number, h: number, d: number, r: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0): this {
    return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), hex, x, y, z, rx, ry, rz);
  }
  tube(rTop: number, rBot: number, h: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0, seg = 12): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), hex, x, y, z, rx, ry, rz);
  }
  dome(r: number, x: number, y: number, z: number, hex: string, sy = 1, sx = 1, sz = 1): this {
    return this.add(new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), hex, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  ring(r: number, tube: number, x: number, y: number, z: number, hex: string, rx = Math.PI / 2, ry = 0, rz = 0, arc = Math.PI * 2): this {
    return this.add(new THREE.TorusGeometry(r, tube, 6, 20, arc), hex, x, y, z, rx, ry, rz);
  }
  spike(r: number, h: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0, seg = 8): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), hex, x, y, z, rx, ry, rz);
  }
  /** Revolved profile [[radius, y], ...] from bottom to top. */
  lathe(profile: [number, number][], x: number, y: number, z: number, hex: string, seg = 16, sx = 1, sz = 1, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg), hex, x, y, z, rx, ry, rz, sx, 1, sz);
  }
  curve(points: V[], r0: number, r1: number, hex: string, radial = 7): this {
    return this.add(taperTube(points, r0, r1, radial), hex, 0, 0, 0);
  }
  /** Bevelled flat shape (blades, shields, emblems), centred on its thickness. */
  plate(shape: THREE.Shape, depth: number, bevel: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0, s = 1): this {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -depth / 2);
    return this.add(geo, hex, x, y, z, rx, ry, rz, s, s, s);
  }
  gem(r: number, x: number, y: number, z: number, hex: string, sy = 1.3): this {
    return this.add(new THREE.OctahedronGeometry(r, 0), hex, x, y, z, 0, 0, 0, 1, sy, 1);
  }
  /** Hanging cloth with folds (front and back faces), top edge at y. */
  cloth(w: number, h: number, x: number, y: number, z: number, hex: string, folds = 3, depth = 0.05, flare = 0.15): this {
    const geo = new THREE.PlaneGeometry(w, h, 12, 6);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i);
      const py = p.getY(i);
      const down = (h / 2 - py) / h;
      p.setX(i, px * (1 + flare * down));
      p.setZ(i, Math.sin((px / w) * Math.PI * 2 * folds) * depth * (0.3 + down) - down * 0.08);
    }
    geo.computeVertexNormals();
    geo.translate(0, -h / 2, 0);
    const back = geo.clone();
    const idx = back.getIndex()!;
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i]!;
      arr[i] = arr[i + 2]!;
      arr[i + 2] = t;
    }
    const n = back.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    back.translate(0, 0, -0.015);
    this.add(geo, hex, x, y, z);
    return this.add(back, shade(hex, -0.12), x, y, z);
  }
}

export function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  if (amt < 0) c.multiplyScalar(1 + amt);
  else c.lerp(new THREE.Color('#ffffff'), amt);
  return '#' + c.getHexString();
}
