import * as THREE from 'three';
import { JUNK_BY_KEY, MATERIALS, BELT_HEIGHT, BELT_SPEED } from '../config.js';
import { recPrimary } from './economy.js';

const GRAV = 18;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

// Loose junk in the world: thrown items, items on belts, things that fell off the heap.
export class Items {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.chunkGeos = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.IcosahedronGeometry(0.5, 1);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) { tmp.fromBufferAttribute(p, v).multiplyScalar(0.7 + Math.random() * 0.5); tmp.y *= 0.55; p.setXYZ(v, tmp.x, tmp.y, tmp.z); }
      g.computeVertexNormals();
      this.chunkGeos.push(g);
    }
    this.chunkMats = {};
  }

  _chunkMat(mat) {
    if (this.chunkMats[mat]) return this.chunkMats[mat];
    const A = this.game.assets, c = MATERIALS[mat].color;
    let m;
    if (mat === 'metal') m = A.pbr('rusty_metal_02', { repeat: [0.5, 0.5] });
    else if (mat === 'glass') m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, transmission: 0.6, thickness: 0.3, metalness: 0 });
    else m = A.pbr('painted_metal_shutter', { color: c, metalness: mat === 'electronics' ? 0.5 : 0, roughness: mat === 'rubber' ? 1 : 0.8, repeat: [0.4, 0.4] });
    return (this.chunkMats[mat] = m);
  }

  makeMesh(rec) {
    if (rec.kind === 'chunk') {
      const m = new THREE.Mesh(this.chunkGeos[(Math.random() * 4) | 0], this._chunkMat(rec.mat));
      const s = 0.45 * Math.cbrt(rec.mass / 4);
      m.scale.setScalar(Math.max(0.18, Math.min(0.6, s)));
      m.castShadow = m.receiveShadow = true;
      const g = new THREE.Group(); g.add(m); g.userData.radius = m.scale.x * 0.45;
      return g;
    }
    const j = JUNK_BY_KEY[rec.key];
    const g = this.game.assets.instance(j.model, j.size);
    g.userData.radius = j.size * 0.4;
    return g;
  }

  spawn(rec, pos, vel = new THREE.Vector3(), { sorted = false, state = 'free' } = {}) {
    const mesh = this.makeMesh(rec);
    const it = {
      rec, mesh, sorted, state,
      pos: pos.clone(), vel: vel.clone(),
      spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
      r: mesh.userData.radius, rest: 0, sleep: false, onScale: 0,
    };
    mesh.position.copy(it.pos);
    mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    this.group.add(mesh);
    this.list.push(it);
    return it;
  }

  remove(it) {
    const i = this.list.indexOf(it);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(it.mesh);
  }

  wakeNear(p, r = 3) {
    for (const it of this.list) if (it.sleep && it.pos.distanceToSquared(p) < r * r) it.sleep = false;
  }

  // Put a record on a belt cell at its entry edge. Returns false if there is no room.
  placeOnBelt(rec, cx, cz, entry, sorted) {
    const p = entry.clone();
    if (!this.roomAt(p, 0.5)) return false;
    const it = this.spawn(rec, p, new THREE.Vector3(), { sorted, state: 'belt' });
    it.pos.y = BELT_HEIGHT + it.r * 0.55;
    return true;
  }

  roomAt(p, d) {
    for (const it of this.list) if (it.state === 'belt' && Math.abs(it.pos.x - p.x) < d && Math.abs(it.pos.z - p.z) < d) return false;
    return true;
  }

  pick(origin, dir, maxDist) {
    let best = null, bd = maxDist;
    for (const it of this.list) {
      if (it.state === 'held') continue;
      tmp.subVectors(it.pos, origin);
      const t = tmp.dot(dir);
      if (t < 0 || t > bd) continue;
      tmp2.copy(origin).addScaledVector(dir, t);
      if (tmp2.distanceTo(it.pos) < Math.max(0.35, it.r * 1.1)) { best = it; bd = t; }
    }
    return best;
  }

  groundAt(x, z, y, r) {
    let g = this.game.pile.surfaceAt(x, z);
    for (const b of this.game.yard.colliders) {
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && y - r * 0.5 >= b.max.y - 0.3) g = Math.max(g, b.max.y);
    }
    return g;
  }

  update(dt) {
    const game = this.game, M = game.machines;
    const beltSpeed = BELT_SPEED * (1 + (game.economy.upgrades.has('belt1') ? 0.4 : 0) + (game.economy.upgrades.has('belt2') ? 0.4 : 0));
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      if (it.state === 'held') continue;
      if (it.state === 'belt') { this._belt(it, dt, beltSpeed); continue; }
      if (it.sleep) continue;
      this._physics(it, dt);
    }
    this._separate();
    for (const it of this.list) { it.mesh.position.copy(it.pos); }
  }

  _belt(it, dt, speed) {
    const M = this.game.machines;
    const cx = Math.floor(it.pos.x), cz = Math.floor(it.pos.z);
    const m = M.at(cx, cz);
    if (!m || m.def.id !== 'belt') { it.state = 'free'; it.sleep = false; return; }
    const [dx, dz] = m.dir;
    const v = speed * m.factor;
    it.pos.y = BELT_HEIGHT + it.r * 0.55;
    // centre on the belt
    if (dx) it.pos.z += ((cz + 0.5) - it.pos.z) * Math.min(1, dt * 4);
    else it.pos.x += ((cx + 0.5) - it.pos.x) * Math.min(1, dt * 4);
    if (v <= 0.01) return;
    // keep a gap behind the item in front
    for (const o of this.list) {
      if (o === it || o.state !== 'belt') continue;
      const ax = o.pos.x - it.pos.x, az = o.pos.z - it.pos.z;
      const along = ax * dx + az * dz, side = Math.abs(ax * dz - az * dx);
      if (along > 0 && along < 0.55 && side < 0.4) return;
    }
    const nx = it.pos.x + dx * v * dt, nz = it.pos.z + dz * v * dt;
    const ncx = Math.floor(nx), ncz = Math.floor(nz);
    if (ncx !== cx || ncz !== cz) {
      const n = M.at(ncx, ncz);
      if (n && n.def.id === 'belt') { it.pos.x = nx; it.pos.z = nz; return; }
      if (n) {
        if (n.accept(it.rec, { sorted: it.sorted, from: [dx, dz] })) { this.remove(it); }
        return; // blocked: wait at the edge
      }
      // off the end of the belt
      it.state = 'free'; it.sleep = false;
      it.vel.set(dx * v * 1.1, 0.6, dz * v * 1.1);
      it.pos.x = nx; it.pos.z = nz;
      return;
    }
    it.pos.x = nx; it.pos.z = nz;
    it.mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(tmp.set(0, 1, 0), Math.sin(performance.now() * 0.003 + it.r * 40) * 0.002));
  }

  _physics(it, dt) {
    const game = this.game;
    it.vel.y -= GRAV * dt;
    const steps = Math.ceil(it.vel.length() * dt / 0.25) || 1;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      const prevY = it.pos.y;
      it.pos.addScaledVector(it.vel, h);
      // catch zones first (hopper mouths, burner chutes), so the machine body doesn't bounce the item away
      const m = game.machines.catchAt(it.pos);
      if (m && m.accept(it.rec, { sorted: it.sorted, thrown: true })) { this.remove(it); return; }
      // walls and machines
      for (const b of game.yard.colliders) {
        if (it.pos.x + it.r < b.min.x || it.pos.x - it.r > b.max.x || it.pos.z + it.r < b.min.z || it.pos.z - it.r > b.max.z) continue;
        if (prevY - it.r * 0.5 >= b.max.y - 0.3 || it.pos.y - it.r > b.max.y || it.pos.y + it.r < b.min.y) continue;
        const px = Math.min(it.pos.x + it.r - b.min.x, b.max.x - (it.pos.x - it.r));
        const pz = Math.min(it.pos.z + it.r - b.min.z, b.max.z - (it.pos.z - it.r));
        if (px < pz) { it.pos.x += (it.pos.x < (b.min.x + b.max.x) / 2 ? -px : px); it.vel.x *= -0.35; }
        else { it.pos.z += (it.pos.z < (b.min.z + b.max.z) / 2 ? -pz : pz); it.vel.z *= -0.35; }
      }
    }

    const g = this.groundAt(it.pos.x, it.pos.z, it.pos.y, it.r);
    const bottom = it.pos.y - it.r * 0.6;
    if (bottom <= g) {
      const impact = -it.vel.y;
      it.pos.y = g + it.r * 0.6;
      if (impact > 2.5) { game.audio.impact(recPrimary(it.rec), it.pos, impact / 10); if (impact > 6) game.particles.dust(it.pos, undefined, 5, 0.3); }
      it.vel.y = impact > 1.5 ? impact * 0.28 : 0;
      it.vel.x *= 0.82; it.vel.z *= 0.82;
      it.spin.multiplyScalar(0.8);
      // roll down slopes of the heap
      const e = 0.6, sx = game.pile.surfaceAt(it.pos.x + e, it.pos.z) - game.pile.surfaceAt(it.pos.x - e, it.pos.z);
      const sz = game.pile.surfaceAt(it.pos.x, it.pos.z + e) - game.pile.surfaceAt(it.pos.x, it.pos.z - e);
      if (Math.abs(sx) + Math.abs(sz) > 1.1) { it.vel.x -= sx * dt * 6; it.vel.z -= sz * dt * 6; }
      // onto a belt?
      const cx = Math.floor(it.pos.x), cz = Math.floor(it.pos.z), b = game.machines.at(cx, cz);
      if (b && b.def.id === 'belt' && Math.abs(g - BELT_HEIGHT) < 0.1 && Math.hypot(it.vel.x, it.vel.z) < 2.5) { it.state = 'belt'; return; }
      // on the scale?
      if (game.yard.scaleBox.containsPoint(it.pos) && it.vel.lengthSq() < 1) {
        it.onScale += 1 / 60;
        if (it.onScale > 0.25) { game.economy.sellItem(it.rec, it.sorted, it.pos.clone()); this.remove(it); return; }
      }
      if (it.vel.lengthSq() < 0.02 && impact < 1) { it.rest += 1 / 60; if (it.rest > 0.8) { it.sleep = true; it.vel.set(0, 0, 0); } }
    } else it.rest = 0;
    // tumble
    const sp = it.spin.length();
    if (sp > 0.01) it.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(tmp.copy(it.spin).divideScalar(sp), sp * dt));
    if (it.pos.y < -5) this.remove(it);
  }

  _separate() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.state !== 'free' || a.sleep) continue;
      for (let j = 0; j < L.length; j++) {
        if (i === j) continue;
        const b = L[j]; if (b.state === 'held') continue;
        const dx = a.pos.x - b.pos.x, dy = a.pos.y - b.pos.y, dz = a.pos.z - b.pos.z;
        const rr = (a.r + b.r) * 0.75, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (rr - d);
        a.pos.x += dx / d * push; a.pos.y += Math.max(0, dy / d) * push; a.pos.z += dz / d * push;
        if (dy > 0) a.vel.y = Math.max(a.vel.y, 0);
        if (b.state === 'free') b.sleep = false;
      }
    }
  }

  serialize() {
    return this.list.filter(i => i.state !== 'held').map(i => ({ rec: i.rec, p: i.pos.toArray().map(v => +v.toFixed(2)), s: i.sorted, b: i.state === 'belt' }));
  }
  load(arr) {
    for (const it of [...this.list]) this.remove(it);
    for (const d of arr || []) { const it = this.spawn(d.rec, new THREE.Vector3().fromArray(d.p), undefined, { sorted: d.s, state: d.b ? 'belt' : 'free' }); it.sleep = !d.b; }
  }
}
