import * as THREE from 'three';
import { CELL, PILE, JUNK, CELL_WALLET, CELL_CLUE, CELL_RARE, RARES } from '../config.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Smooth value noise for the heap's lumpy outline.
function noise2(seed) {
  const r = rng(seed), grid = new Float32Array(32 * 32).map(() => r());
  const at = (x, y) => grid[((y & 31) * 32) + (x & 31)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// Per-variant orientation, jitter and scale so every item in the heap lies differently.
const VARIANTS = (() => {
  const r = rng(1234), out = [];
  const e = new THREE.Euler();
  for (let i = 0; i < 128; i++) {
    e.set(r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2);
    const q = new THREE.Quaternion().setFromEuler(e);
    // Bias half the items toward lying flat-ish so the heap reads as settled.
    if (r() < 0.5) q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.9, r() * Math.PI * 2, (r() - 0.5) * 0.9 + (r() < 0.3 ? Math.PI / 2 : 0)));
    out.push({ q, j: new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.2, (r() - 0.5) * 0.3), s: 0.88 + r() * 0.3, t: 0.82 + r() * 0.3, h: (r() - 0.5) * 0.06 });
  }
  return out;
})();

const G = PILE.size, H = PILE.maxH;

export class Pile {
  constructor(game) {
    this.game = game;
    this.cells = new Uint8Array(G * G * H);
    this.vars = new Uint8Array(G * G * H);
    this.heights = new Uint8Array(G * G);
    this.drop = new Float32Array(G * G);
    this.dropFrom = new Uint8Array(G * G);
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.meshes = {};            // key `${type}:${lod}:${part}` -> InstancedMesh
    this.specials = new Map();   // cell index -> mesh
    this.dirty = true;
    this.lastLodPos = new THREE.Vector3(1e9, 0, 0);
    this.totalCells = 0;
    this.removedCount = 0;
  }

  get G() { return G; }
  colIndex(cx, cz) { return cx * G + cz; }
  cellIndex(cx, cy, cz) { return (cx * G + cz) * H + cy; }
  inGrid(cx, cz) { return cx >= 0 && cz >= 0 && cx < G && cz < G; }
  toCol(x) { return Math.floor(x / CELL + G / 2); }
  colCenter(c) { return (c - G / 2 + 0.5) * CELL; }
  height(cx, cz) { return this.inGrid(cx, cz) ? this.heights[cx * G + cz] : 0; }
  get(cx, cy, cz) { return this.cells[this.cellIndex(cx, cy, cz)]; }

  generate(seed) {
    const r = rng(seed), n = noise2(seed + 7);
    const weights = JUNK.map(j => j.w), wsum = weights.reduce((a, b) => a + b, 0);
    const pick = () => { let x = r() * wsum; for (let i = 0; i < JUNK.length; i++) { x -= weights[i]; if (x <= 0) return JUNK[i].id; } return 1; };
    this.cells.fill(0); this.heights.fill(0); this.totalCells = 0;
    // A broad main heap with a few lumpy shoulders, so it reads as dumped loads rather than a cone.
    const mounds = [];
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = 5 + r() * 11;
      mounds.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 5 + r() * 6, h: 4 + r() * 7 });
    }
    for (let cx = 0; cx < G; cx++) for (let cz = 0; cz < G; cz++) {
      const x = this.colCenter(cx), z = this.colCenter(cz);
      const ang = Math.atan2(z, x);
      const rad = PILE.radius * (0.82 + n(Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + 5) * 0.36);
      const d = Math.hypot(x * 0.92, z * 1.08) / rad;
      if (d >= 1) continue;
      const fall = Math.pow(1 - d, 0.7);
      const dp = Math.min(1, Math.hypot(x - 3, z + 2) / rad);   // summit sits a little off-centre
      let h = PILE.peak * Math.pow(1 - dp, 1.5) * (0.8 + 0.35 * n(x * 0.07 + 11, z * 0.07 + 3)) * Math.min(1, (1 - d) * 4);
      for (const m of mounds) h += m.h * Math.exp(-((x - m.x) ** 2 + (z - m.z) ** 2) / (m.r * m.r)) * fall;
      h += (n(x * 0.3, z * 0.3) - 0.5) * 2.6 * fall + (n(x * 0.9 + 40, z * 0.9) - 0.5) * 1.2;
      h = Math.max(0, Math.min(H - 2, Math.round(h)));
      const ci = cx * G + cz;
      this.heights[ci] = h;
      for (let y = 0; y < h; y++) { this.cells[ci * H + y] = pick(); this.vars[ci * H + y] = (r() * 128) | 0; }
      this.totalCells += h;
    }
    this._relaxAll();
    return this._placeSecrets(r);
  }

  _relaxAll() {
    for (let pass = 0; pass < 6; pass++) for (let cx = 0; cx < G; cx++) for (let cz = 0; cz < G; cz++) this._relax(cx, cz, false);
  }

  _placeSecrets(r) {
    const secrets = { wallet: null, clues: [], rares: [] };
    const column = (minR, maxR, ang) => {
      for (let tries = 0; tries < 400; tries++) {
        const a = ang ?? r() * Math.PI * 2, rad = minR + r() * (maxR - minR);
        const cx = this.toCol(Math.cos(a) * rad), cz = this.toCol(Math.sin(a) * rad);
        if (this.inGrid(cx, cz) && this.height(cx, cz) >= 6) return [cx, cz];
        if (ang !== undefined) ang += (r() - 0.5) * 0.3;
      }
      return [G / 2, G / 2];
    };
    // The wallet: deep, on one side of the heap, next to a blue cooker.
    const wa = r() * Math.PI * 2;
    const [wx, wz] = column(7, 15, wa);
    const wy = 2 + ((r() * 3) | 0);
    this.cells[this.cellIndex(wx, wy, wz)] = CELL_WALLET;
    const stove = JUNK.find(j => j.key === 'stove').id;
    for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [-1, 0, 1], [0, -1, 0]]) {
      const x = wx + dx, y = wy + dy, z = wz + dz;
      if (y >= 0 && y < this.height(x, z)) { this.cells[this.cellIndex(x, y, z)] = stove; this.vars[this.cellIndex(x, y, z)] |= 128; }
    }
    secrets.wallet = [wx, wy, wz];
    // Newspaper clues: the first sits just under the surface on the south face, near where you start.
    for (let i = 0; i < 6; i++) {
      const [cx, cz] = i === 0 ? column(15, 19, Math.PI / 2) : column(6, 21);
      const h = this.height(cx, cz);
      const cy = Math.max(0, h - 1 - (i === 0 ? 0 : 1 + ((r() * 4) | 0)));
      this.cells[this.cellIndex(cx, cy, cz)] = CELL_CLUE + i;
      secrets.clues.push([cx, cy, cz]);
    }
    RARES.forEach((_, i) => {
      const [cx, cz] = column(4, 22);
      const cy = (r() * this.height(cx, cz)) | 0;
      this.cells[this.cellIndex(cx, cy, cz)] = CELL_RARE + i;
      secrets.rares.push([cx, cy, cz]);
    });
    this.dirty = true;
    return secrets;
  }

  findCell(code) {
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === code) {
      const cy = i % H, ci = (i - cy) / H; return [Math.floor(ci / G), cy, ci % G];
    }
    return null;
  }

  // Smooth ground height in metres for walking on the heap.
  surfaceAt(x, z) {
    const fx = x / CELL + G / 2 - 0.5, fz = z / CELL + G / 2 - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
    const h = (a, b) => this.height(a, b);
    const top = h(x0, z0) * (1 - tx) * (1 - tz) + h(x0 + 1, z0) * tx * (1 - tz) + h(x0, z0 + 1) * (1 - tx) * tz + h(x0 + 1, z0 + 1) * tx * tz;
    const own = h(Math.floor(x / CELL + G / 2), Math.floor(z / CELL + G / 2));
    return Math.max(top, own - 0.6) * CELL;
  }
  columnTop(x, z) { return this.height(this.toCol(x), this.toCol(z)) * CELL; }

  raycast(origin, dir, maxDist) {
    const p = origin.clone();
    const step = 0.06;
    for (let t = 0; t < maxDist; t += step) {
      p.copy(origin).addScaledVector(dir, t);
      if (p.y < 0) return null;
      const cx = this.toCol(p.x), cz = this.toCol(p.z);
      if (!this.inGrid(cx, cz)) continue;
      const cy = Math.floor(p.y / CELL);
      if (cy < this.heights[cx * G + cz]) return { cx, cy, cz, point: p.clone(), dist: t, code: this.get(cx, cy, cz) };
    }
    return null;
  }

  cellWorld(cx, cy, cz, out = new THREE.Vector3()) {
    return out.set(this.colCenter(cx), (cy + 0.5) * CELL, this.colCenter(cz));
  }

  // Removes one cell; everything above drops, then the slope settles.
  remove(cx, cy, cz) {
    const ci = cx * G + cz, h = this.heights[ci];
    if (cy >= h) return null;
    const base = ci * H;
    const code = this.cells[base + cy], variant = this.vars[base + cy];
    for (let y = cy; y < h - 1; y++) { this.cells[base + y] = this.cells[base + y + 1]; this.vars[base + y] = this.vars[base + y + 1]; }
    this.cells[base + h - 1] = 0;
    this.heights[ci] = h - 1;
    if (cy < h - 1) { this.drop[ci] = Math.min(this.drop[ci] + CELL, 4); this.dropFrom[ci] = cy; }
    this.removedCount++;
    const slid = this._relax(cx, cz, true);
    this.dirty = true;
    return { code, variant, slid };
  }

  _relax(cx, cz, animate) {
    const queue = [[cx, cz]], slid = [];
    let guard = 0;
    while (queue.length && guard++ < 300) {
      const [ax, az] = queue.shift();
      const ai = ax * G + az;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const bx = ax + dx, bz = az + dz;
        if (!this.inGrid(bx, bz)) continue;
        const bi = bx * G + bz;
        const ha = this.heights[ai], hb = this.heights[bi];
        if (ha - hb > 2 && hb < H - 1) {
          const from = ai * H + ha - 1, to = bi * H + hb;
          this.cells[to] = this.cells[from]; this.vars[to] = this.vars[from];
          this.cells[from] = 0;
          this.heights[ai] = ha - 1; this.heights[bi] = hb + 1;
          if (animate) { this.drop[bi] = Math.max(this.drop[bi], (ha - hb - 1) * CELL); this.dropFrom[bi] = hb; slid.push([bx, hb, bz]); }
          queue.push([ax, az], [bx, bz]);
        }
      }
    }
    return slid;
  }

  // ---------- rendering ----------
  _mesh(type, lod, part, parts, need) {
    const key = `${type}:${lod}:${part}`;
    let m = this.meshes[key];
    if (!m || m.instanceMatrix.count < need) {
      const cap = Math.max(64, Math.ceil(need * 1.4));
      if (m) { this.group.remove(m); m.dispose(); }
      m = new THREE.InstancedMesh(parts[part].geometry, parts[part].material, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = !parts[part].material.transparent; m.receiveShadow = true;
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes[key] = m;
      this.group.add(m);
    }
    return m;
  }

  rebuild(camPos, lodDist) {
    const A = this.game.assets;
    const buckets = new Map(); // `${type}:${lod}` -> [cellIndex...]
    const liveSpecials = new Set();
    const lod2 = lodDist * lodDist;
    for (let cx = 0; cx < G; cx++) for (let cz = 0; cz < G; cz++) {
      const ci = cx * G + cz, h = this.heights[ci];
      if (!h) continue;
      const minN = Math.min(this.height(cx + 1, cz), this.height(cx - 1, cz), this.height(cx, cz + 1), this.height(cx, cz - 1));
      const start = Math.max(0, Math.min(h - 1, minN - 1));
      const wx = this.colCenter(cx), wz = this.colCenter(cz);
      const dx = wx - camPos.x, dz = wz - camPos.z;
      for (let y = start; y < h; y++) {
        const idx = ci * H + y, code = this.cells[idx];
        if (code >= 200) { liveSpecials.add(idx); continue; }
        const dy = (y + 0.5) * CELL - camPos.y;
        const lod = dx * dx + dy * dy + dz * dz < lod2 ? 0 : 1;
        const k = code * 2 + lod;
        let b = buckets.get(k); if (!b) buckets.set(k, b = []);
        b.push(idx);
      }
    }
    const mat = new THREE.Matrix4(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
    const used = new Set();
    for (const [k, list] of buckets) {
      const code = k >> 1, lod = k & 1, junk = JUNK[code - 1];
      const model = (lod ? A.lods[junk.model] : null) || A.models[junk.model];
      if (!model) continue;
      const cluster = junk.cluster || 1;
      for (let p = 0; p < model.parts.length; p++) {
        const m = this._mesh(code, lod, p, model.parts, list.length * cluster);
        used.add(m);
        let n = 0;
        for (const idx of list) {
          const v = this.vars[idx], V = VARIANTS[v & 127];
          const y = idx % H, ci = (idx - y) / H, cx = Math.floor(ci / G), cz = ci % G;
          const off = y >= this.dropFrom[ci] ? this.drop[ci] : 0;
          const s = junk.size * V.s * 1.45;
          for (let c = 0; c < cluster; c++) {
            const W = c ? VARIANTS[(v * 7 + c * 31) & 127] : V;
            pos.set(this.colCenter(cx) + V.j.x + (c ? W.j.x * 2.2 : 0), (y + 0.5) * CELL + V.j.y + off + (c ? W.j.y : 0), this.colCenter(cz) + V.j.z + (c ? W.j.z * 2.2 : 0));
            scl.setScalar(s);
            mat.compose(pos, W.q, scl);
            m.setMatrixAt(n, mat);
            if (v & 128) col.setRGB(0.25, 0.45, 1.25);
            else col.setRGB(V.t, V.t * (0.97 + V.h), V.t * (0.94 + V.h));
            m.setColorAt(n, col);
            n++;
          }
        }
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
    for (const m of Object.values(this.meshes)) if (!used.has(m)) m.count = 0;
    this._syncSpecials(liveSpecials);
  }

  _syncSpecials(live) {
    for (const [idx, mesh] of this.specials) {
      if (!live.has(idx) || this.cells[idx] !== mesh.userData.code) { this.group.remove(mesh); this.specials.delete(idx); }
    }
    for (const idx of live) {
      const y = idx % H, ci = (idx - y) / H, cx = Math.floor(ci / G), cz = ci % G;
      let mesh = this.specials.get(idx);
      if (!mesh) {
        const code = this.cells[idx];
        mesh = this.game.makeSpecialMesh(code);
        mesh.userData.code = code;
        const V = VARIANTS[this.vars[idx] & 127];
        mesh.quaternion.copy(V.q);
        this.specials.set(idx, mesh);
        this.group.add(mesh);
      }
      const off = y >= this.dropFrom[ci] ? this.drop[ci] : 0;
      mesh.position.set(this.colCenter(cx), (y + 0.5) * CELL + off, this.colCenter(cz));
    }
  }

  update(dt, camPos, lodDist) {
    let falling = false;
    for (let i = 0; i < this.drop.length; i++) if (this.drop[i] > 0) {
      this.drop[i] = Math.max(0, this.drop[i] - dt * 7);
      falling = true;
    }
    if (falling) this.dirty = true;
    if (this.lastLodPos.distanceToSquared(camPos) > 9) { this.dirty = true; }
    if (this.dirty) {
      this.lastLodPos.copy(camPos);
      this.rebuild(camPos, lodDist);
      this.dirty = false;
    }
  }

  // Visible special cells (for sparkles and x-ray).
  *exposedSpecials() { for (const [idx, mesh] of this.specials) yield { idx, mesh, code: this.cells[idx] }; }

  serialize() {
    const b64 = a => { let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); };
    return { cells: b64(this.cells), vars: b64(this.vars), heights: b64(this.heights), total: this.totalCells, removed: this.removedCount };
  }
  load(d) {
    const un = (s, arr) => { const bin = atob(s); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); };
    un(d.cells, this.cells); un(d.vars, this.vars); un(d.heights, this.heights);
    this.totalCells = d.total; this.removedCount = d.removed || 0;
    this.dirty = true;
  }
}
