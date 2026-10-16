import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial } from './style';

/**
 * Low-poly model builder. Parts are added with a colour each and merged into ONE mesh with vertex
 * colours, so a whole building is a single draw call (important for phones).
 */
export const SHARED: THREE.Material = toonMaterial(0.35);
const color = new THREE.Color();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();
const scl = new THREE.Vector3();
const mat = new THREE.Matrix4();

export class Kit {
  private geos: THREE.BufferGeometry[] = [];

  get empty(): boolean {
    return this.geos.length === 0;
  }

  /** Adds any geometry, centred at (x, y, z), with optional rotation and scale. */
  add(geo: THREE.BufferGeometry, hex: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    euler.set(rx, ry, rz);
    quat.setFromEuler(euler);
    pos.set(x, y, z);
    scl.set(sx, sy, sz);
    mat.compose(pos, quat, scl);
    g.applyMatrix4(mat);
    color.set(hex);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = color.r;
      arr[i * 3 + 1] = color.g;
      arr[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
    return this;
  }

  /** Box resting on y (its bottom at y). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, hex: string, ry = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), hex, x, y + h / 2, z, 0, ry);
  }

  /** Cylinder resting on y. */
  cyl(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, hex: string, seg = 8): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), hex, x, y + h / 2, z);
  }

  /** Cone resting on y. */
  cone(r: number, h: number, x: number, y: number, z: number, hex: string, seg = 8, ry = 0): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), hex, x, y + h / 2, z, 0, ry);
  }

  sphere(r: number, x: number, y: number, z: number, hex: string, detail = 0): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), hex, x, y, z);
  }

  rock(r: number, x: number, y: number, z: number, hex: string, ry = 0, squash = 0.7): this {
    return this.add(new THREE.DodecahedronGeometry(r, 0), hex, x, y + r * squash * 0.6, z, 0, ry, 0, 1, squash, 1);
  }

  /** Gable roof: ridge along x (or z when alongZ), sitting on y. */
  roof(w: number, h: number, d: number, x: number, y: number, z: number, hex: string, alongZ = false): this {
    const shape = new THREE.Shape();
    const span = alongZ ? w : d;
    const len = alongZ ? d : w;
    shape.moveTo(-span / 2, 0);
    shape.lineTo(span / 2, 0);
    shape.lineTo(0, h);
    shape.lineTo(-span / 2, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2);
    return this.add(geo, hex, x, y, z, 0, alongZ ? 0 : Math.PI / 2);
  }

  /** Row of battlements along x or z. */
  crenels(len: number, x: number, y: number, z: number, hex: string, alongZ = false, size = 0.5, gap = 0.5): this {
    const n = Math.max(1, Math.floor(len / (size + gap)));
    const step = len / n;
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + step * (i + 0.5);
      if (alongZ) this.box(size, size, size, x, y, z + o, hex);
      else this.box(size, size, size, x + o, y, z, hex);
    }
    return this;
  }

  /** Wooden fence around a rectangle (with an opening on the south side). */
  fence(w: number, d: number, hex = '#a0703c', post = '#7a522a', openingSouth = 3): this {
    const h = 0.9;
    const segs: [number, number, number, number][] = [
      [-w / 2, -d / 2, w / 2, -d / 2],
      [-w / 2, -d / 2, -w / 2, d / 2],
      [w / 2, -d / 2, w / 2, d / 2],
      [-w / 2, d / 2, -openingSouth / 2, d / 2],
      [openingSouth / 2, d / 2, w / 2, d / 2],
    ];
    for (const [x0, z0, x1, z1] of segs) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.2) continue;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const along = Math.abs(z1 - z0) > Math.abs(x1 - x0);
      this.box(along ? 0.12 : len, 0.12, along ? len : 0.12, cx, h * 0.45, cz, hex);
      this.box(along ? 0.12 : len, 0.12, along ? len : 0.12, cx, h * 0.8, cz, hex);
      const n = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        this.box(0.22, h, 0.22, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, post);
      }
    }
    return this;
  }

  build(castShadow = true, material: THREE.Material = SHARED): THREE.Mesh {
    const geo = this.geos.length ? mergeGeometries(this.geos, false) : new THREE.BufferGeometry();
    this.geos.forEach((g) => g.dispose());
    this.geos = [];
    const mesh = new THREE.Mesh(geo ?? new THREE.BufferGeometry(), material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Disposes geometries (and non-shared materials) of an object tree. */
export function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const material = m.material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const mm of Array.isArray(material) ? material : [material]) {
      if (mm !== SHARED && !mm.userData.shared) {
        const tex = (mm as THREE.MeshBasicMaterial).map;
        tex?.dispose();
        mm.dispose();
      }
    }
  });
}

export const basic = (hex: string, opacity = 1) => new THREE.MeshBasicMaterial({ color: hex, transparent: opacity < 1, opacity });
