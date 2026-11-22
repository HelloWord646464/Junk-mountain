import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MACHINE_BY_ID, MATERIALS, BELT_HEIGHT, YARD, DEMOLISH_REFUND, JUNK_BY_KEY } from '../config.js';
import { boxUV } from '../world/yard.js';
import { hazardTexture, beltTexture, labelTexture } from '../world/textures.js';
import { recComp, recPrimary, recComposite } from './economy.js';

// rot 0 = facing north (-z), 1 = east, 2 = south, 3 = west
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const key = (x, z) => `${x},${z}`;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- shared materials ----------
let MAT = null;
function mats(A) {
  if (MAT) return MAT;
  const hz = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 });
  const belt = new THREE.MeshStandardMaterial({ map: beltTexture(), roughness: 0.9, metalness: 0 });
  MAT = {
    steel: A.pbr('metal_plate', { metalness: 1, color: 0x9b9a96 }),
    rust: A.pbr('rusty_metal_02'),
    yellow: A.pbr('painted_metal_shutter', { color: 0xe3a51c, metalness: 0.4 }),
    teal: A.pbr('painted_metal_shutter', { color: 0x3f7f86, metalness: 0.4 }),
    red: A.pbr('painted_metal_shutter', { color: 0xb5402c, metalness: 0.4 }),
    green: A.pbr('painted_metal_shutter', { color: 0x4d6e3f, metalness: 0.4 }),
    dark: A.pbr('painted_metal_shutter', { color: 0x2c2a27, metalness: 0.5 }),
    boiler: A.pbr('rusty_painted_metal', { metalness: 0.7 }),
    grate: A.pbr('metal_grate_rusty'),
    copper: new THREE.MeshStandardMaterial({ color: 0xc26a3a, metalness: 1, roughness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
    hazard: hz, belt,
    on: new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff66, emissiveIntensity: 3 }),
    off: new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0xff3322, emissiveIntensity: 3 }),
    fire: new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff6a1a, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x66ffaa, emissiveIntensity: 0 }),
  };
  return MAT;
}

const box = (w, h, d, m, x = 0, y = 0, z = 0, tile = 1) => { const o = new THREE.Mesh(boxUV(w, h, d, tile), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 16) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };

// Belt frame shared by belts and inline machines (sorters).
function beltFrameGeo() {
  const parts = [];
  const add = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g); };
  add(0.08, 0.2, 1, -0.46, BELT_HEIGHT - 0.05, 0); add(0.08, 0.2, 1, 0.46, BELT_HEIGHT - 0.05, 0);
  add(0.86, 0.06, 1, 0, BELT_HEIGHT - 0.09, 0);
  for (const sx of [-0.42, 0.42]) add(0.07, BELT_HEIGHT - 0.1, 0.07, sx, (BELT_HEIGHT - 0.1) / 2, 0);
  add(0.9, 0.05, 0.05, 0, 0.15, 0);
  const g = mergeGeometries(parts.map(p => p.toNonIndexed()));
  return g;
}

// ---------- machine visuals (built facing -z, centred on the footprint) ----------
function sorterVisual(M, def) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(beltFrameGeo(), M.steel); frame.castShadow = true; g.add(frame);
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1), M.belt); surf.rotation.x = -Math.PI / 2; surf.position.y = BELT_HEIGHT; g.add(surf);
  const col = { magnet: M.red, eddy: M.copper, blower: M.teal, screen: M.grate, rubbersep: M.dark, woodsep: M.green }[def.id] || M.yellow;
  g.add(box(0.08, 1.2, 0.08, M.yellow, -0.47, 1.0, 0), box(0.08, 1.2, 0.08, M.yellow, 0.47, 1.0, 0));
  g.add(box(1.04, 0.38, 0.8, M.yellow, 0, 1.62, 0));
  const dev = def.id === 'magnet' ? cyl(0.22, 0.22, 0.85, col, 0, 1.25, 0) : def.id === 'eddy' ? new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 10, 24), col)
    : def.id === 'blower' ? cyl(0.12, 0.2, 0.45, col, 0.3, 1.2, 0) : box(0.8, 0.12, 0.6, col, 0, 1.3, 0);
  if (def.id === 'magnet') dev.rotation.z = Math.PI / 2;
  if (def.id === 'eddy') { dev.position.set(0, 1.25, 0); dev.rotation.x = Math.PI / 2; }
  if (def.id === 'blower') dev.rotation.z = Math.PI / 2;
  dev.castShadow = true; g.add(dev);
  // chute to the left (-x)
  const chute = box(0.5, 0.06, 0.7, M.steel, -0.7, BELT_HEIGHT - 0.12, 0); chute.rotation.z = 0.25; g.add(chute);
  const hz = box(1.04, 0.08, 0.82, M.hazard, 0, 1.85, 0); g.add(hz);
  const filt = [].concat(def.filter);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshStandardMaterial({ map: labelTexture(filt.map(f => MATERIALS[f].short.toUpperCase()).join(' + ') + ' ⇦', '#16130f', MATERIALS[filt[0]].color, 512, 120) }));
  lbl.position.set(0, 1.62, -0.41); lbl.rotation.y = Math.PI; g.add(lbl);
  const lbl2 = lbl.clone(); lbl2.position.z = 0.41; lbl2.rotation.y = 0; g.add(lbl2);
  return g;
}

const VISUALS = {
  belt(M) {
    const g = new THREE.Group();
    const f = new THREE.Mesh(beltFrameGeo(), M.steel); g.add(f);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1), M.belt); s.rotation.x = -Math.PI / 2; s.position.y = BELT_HEIGHT; g.add(s);
    return g;
  },
  hopper(M) {
    const g = new THREE.Group();
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) g.add(box(0.08, 1.4, 0.08, M.rust, x, 0.7, z));
    const fun = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.3, 1.0, 4, 1, true), M.yellow);
    fun.rotation.y = Math.PI / 4; fun.position.y = 1.9; fun.castShadow = true; fun.material.side = THREE.DoubleSide; g.add(fun);
    g.add(box(0.5, 0.35, 0.5, M.dark, 0, 1.25, 0));
    const ch = box(0.4, 0.05, 0.75, M.steel, 0, 0.95, -0.35); ch.rotation.x = -0.35; g.add(ch);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.04, 6, 4), M.hazard); rim.rotation.set(Math.PI / 2, 0, Math.PI / 4); rim.position.y = 2.4; g.add(rim);
    return g;
  },
  burner(M) {
    const g = new THREE.Group();
    g.add(box(1.9, 0.2, 1.9, M.steel, 0, 0.1, 0));
    const body = cyl(0.78, 0.82, 1.9, M.boiler, 0, 1.15, 0.1, 24); g.add(body);
    g.add(cyl(0.84, 0.84, 0.1, M.rust, 0, 2.12, 0.1, 24));
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.35, 0.6, 4, 1, true), M.yellow);
    funnel.material.side = THREE.DoubleSide; funnel.rotation.y = Math.PI / 4; funnel.position.set(0, 2.45, 0.1); g.add(funnel);
    const door = cyl(0.32, 0.32, 0.1, M.dark, 0, 0.85, -0.72, 20); door.rotation.x = Math.PI / 2; g.add(door);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), M.fire.clone()); glow.position.set(0, 0.85, -0.78); glow.rotation.y = Math.PI; g.add(glow);
    g.userData.glow = glow;
    const chim = cyl(0.14, 0.16, 3.4, M.rust, 0.6, 3.0, 0.65, 12); g.add(chim);
    g.add(cyl(0.2, 0.2, 0.2, M.dark, 0.6, 4.75, 0.65, 12));
    const pipe = cyl(0.06, 0.06, 1.2, M.copper, -0.75, 1.6, 0.1, 8); g.add(pipe);
    const gauge = cyl(0.12, 0.12, 0.05, M.steel, -0.55, 1.6, -0.6, 16); gauge.rotation.x = Math.PI / 2; g.add(gauge);
    g.userData.smokePoint = V3(0.6, 4.9, 0.65);
    return g;
  },
  pole(M) {
    const g = new THREE.Group();
    g.add(cyl(0.09, 0.12, 5.6, M.rust, 0, 2.8, 0, 8));
    g.add(box(1.4, 0.1, 0.1, M.rust, 0, 5.3, 0));
    for (const x of [-0.6, 0.6]) g.add(cyl(0.05, 0.07, 0.18, M.glass, x, 5.44, 0, 8));
    g.add(box(0.5, 0.12, 0.5, M.steel, 0, 0.06, 0));
    return g;
  },
  battery(M) {
    const g = new THREE.Group();
    g.add(box(0.85, 1.6, 0.7, M.green, 0, 0.8, 0));
    g.add(box(0.9, 0.08, 0.75, M.dark, 0, 1.64, 0));
    const bars = [];
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), M.glass.clone()); b.position.set(0, 0.5 + i * 0.18, -0.36); b.rotation.y = Math.PI; g.add(b); bars.push(b); }
    g.userData.bars = bars;
    for (let i = 0; i < 4; i++) g.add(box(0.7, 0.03, 0.02, M.dark, 0, 1.3 + i * 0.06, 0.36));
    return g;
  },
  shredder(M) {
    const g = new THREE.Group();
    g.add(box(1.0, 1.0, 1.0, M.red, 0, 0.5, 0));
    g.add(box(1.04, 0.12, 1.04, M.hazard, 0, 1.02, 0));
    const teeth = new THREE.Group(); teeth.position.y = 1.0;
    for (const z of [-0.18, 0.18]) { const t = cyl(0.14, 0.14, 0.8, M.steel, 0, 0, z, 8); t.rotation.z = Math.PI / 2; teeth.add(t); }
    g.add(teeth); g.userData.teeth = teeth;
    g.add(box(0.7, 0.04, 0.7, M.black, 0, 1.085, 0));
    const ch = box(0.5, 0.05, 0.6, M.steel, 0, BELT_HEIGHT + 0.02, -0.55); ch.rotation.x = -0.2; g.add(ch);
    return g;
  },
  digger(M) {
    const g = new THREE.Group();
    g.add(box(0.95, 0.5, 0.95, M.dark, 0, 0.25, 0));
    const turret = new THREE.Group(); turret.position.y = 0.5; g.add(turret);
    turret.add(box(0.8, 0.7, 0.8, M.yellow, 0, 0.35, 0));
    turret.add(box(0.5, 0.4, 0.3, M.steel, 0, 0.9, 0.2));
    const boom = new THREE.Group(); boom.position.set(0, 0.9, 0); turret.add(boom);
    const arm = box(0.16, 0.16, 1, M.yellow, 0, 0, -0.5); boom.add(arm);
    const bucket = box(0.4, 0.3, 0.35, M.rust, 0, -0.1, -1); boom.add(bucket);
    g.userData = { turret, boom, arm, bucket };
    const ch = box(0.45, 0.05, 0.5, M.steel, 0, 0.8, -0.6); ch.rotation.x = -0.4; g.add(ch);
    return g;
  },
  flood(M, A) {
    const g = new THREE.Group();
    g.add(cyl(0.07, 0.1, 5, M.rust, 0, 2.5, 0, 8));
    g.add(box(0.5, 0.12, 0.5, M.steel, 0, 0.06, 0));
    const head = A.instance('flood_lights', 1.1);
    head.position.set(0, 5.2, -0.15); head.rotation.x = 0.5; g.add(head);
    return g;
  },
};

export function machineVisual(game, def) {
  const M = mats(game.assets);
  const g = def.filter ? sorterVisual(M, def) : VISUALS[def.id](M, game.assets);
  if (def.power > 0 && def.id !== 'belt') {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.off);
    lamp.position.set(def.size[0] * 0.45, def.id === 'hopper' ? 1.4 : def.id === 'digger' ? 0.55 : def.filter ? 1.83 : 1.12, -def.size[1] * 0.45);
    g.add(lamp); g.userData.lamp = lamp;
  }
  return g;
}

// ---------- machine behaviour ----------
class Machine {
  constructor(game, def, cx, cz, rot) {
    this.game = game; this.def = def; this.cx = cx; this.cz = cz; this.rot = rot;
    this.factor = 0; this.network = null;
    const [w, d] = def.size;
    this.cells = [];
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) this.cells.push([cx + x, cz + z]);
    this.center = V3(cx + w / 2, 0, cz + d / 2);
    this.colliders = [];
  }
  get dir() { return DIRS[this.rot]; }
  get left() { return DIRS[(this.rot + 3) % 4]; }
  frontCell() { const [dx, dz] = this.dir; return [this.cx + dx, this.cz + dz]; }
  leftCell() { const [dx, dz] = this.left; return [this.cx + dx, this.cz + dz]; }
  accept() { return false; }
  update() {}
  interact() { return null; }
  extra() { return {}; }
  // Hand an item to the cell in direction d. Returns true if it left the machine.
  emit(rec, cell, d, sorted) { return this.game.machines.emit(rec, cell, d, sorted, this); }
}

class Belt extends Machine {}

class Hopper extends Machine {
  constructor(...a) { super(...a); this.queue = []; this.t = 0; this.cap = 80; this.catchBox = new THREE.Box3(V3(this.cx - 0.15, 1.3, this.cz - 0.15), V3(this.cx + 1.15, 3.2, this.cz + 1.15)); }
  accept(rec) { if (this.queue.length >= this.cap) return false; this.queue.push(rec); return true; }
  update(dt) {
    this.t -= dt * this.factor;
    if (this.queue.length && this.t <= 0) {
      if (this.emit(this.queue[0], this.frontCell(), this.dir, false)) { this.queue.shift(); this.t = 0.7; }
      else this.t = 0.2;
    }
  }
  interact() {
    const E = this.game.economy;
    return { prompt: `Dump backpack into hopper (${this.queue.length}/${this.cap})`, action: () => {
      let n = 0; while (E.backpack.length && this.queue.length < this.cap) { this.queue.push(E.backpack.shift()); n++; }
      if (n) { this.game.audio.impact('metal', this.center, 0.8); this.game.ui.toast(`Dumped ${n} items into the hopper`); } else this.game.ui.toast('Nothing to dump');
    } };
  }
  extra() { return { q: this.queue }; }
  restore(e) { this.queue = e.q || []; }
}

class Burner extends Machine {
  constructor(...a) {
    super(...a);
    this.box = []; this.burning = []; this.output = 0; this.cap = 16;
    this.catchBox = new THREE.Box3(V3(this.cx - 0.1, 0.2, this.cz - 0.1), V3(this.cx + 2.1, 3.0, this.cz + 2.1));
    this.light = game.lights.add({ type: 'point', pos: V3(this.center.x, 1.0, this.center.z - 1.2), color: 0xff7a2a, distance: 9, intensity: () => Math.min(1, this.output / 20) * (8 + this.game.sky.night * 14) * (0.85 + Math.random() * 0.15) });
  }
  accept(rec, info) {
    if (this.box.length >= this.cap) return false;
    this.box.push(rec);
    if (info?.thrown) { this.game.particles.sparks(V3(this.center.x, 2.5, this.center.z + 0.1), 10); this.game.audio.impact(recPrimary(rec), this.center, 0.6); }
    return true;
  }
  update(dt) {
    // up to 3 items burn at once
    while (this.burning.length < 3 && this.box.length) {
      const rec = this.box.shift();
      const comp = recComp(rec);
      let energy = 0, time = 0;
      for (const [m, f] of Object.entries(comp)) { energy += rec.mass * f * MATERIALS[m].fuel; time += rec.mass * f * MATERIALS[m].burn; }
      time = Math.max(1, time);
      const dark = (comp.rubber || 0) + (comp.plastic || 0) * 0.6;
      this.burning.push({ left: time, power: energy / time, dark });
      this.game.economy.stats.burned += rec.mass;
    }
    let p = 0, dark = 0;
    for (const b of this.burning) { b.left -= dt; p += b.power; dark = Math.max(dark, b.dark); }
    this.burning = this.burning.filter(b => b.left > 0);
    this.output = Math.min(this.def.gen, p);
    const glow = this.group.userData.glow;
    glow.material.emissiveIntensity = (this.output / this.def.gen) * 6 + (this.output > 0 ? 0.5 : 0);
    if (this.output > 0) {
      const sp = this.group.localToWorld(this.group.userData.smokePoint.clone());
      if (Math.random() < dt * (2 + this.output / 6)) this.game.particles.smoke(sp, 0.42 - dark * 0.35, 1);
      if (Math.random() < dt * 4) this.game.particles.embers(sp);
    }
    this.sound ??= this.game.audio.loop('burner' + this.cx + ',' + this.cz, V3(this.center.x, 1, this.center.z), 'fire');
    this.sound?.set(Math.min(0.6, this.output / 40));
  }
  interact() {
    const E = this.game.economy;
    return { prompt: `Burn backpack contents (firebox ${this.box.length}/${this.cap})`, action: () => {
      let n = 0; while (E.backpack.length && this.box.length < this.cap) { this.box.push(E.backpack.shift()); n++; }
      if (n) { this.game.particles.sparks(V3(this.center.x, 2.5, this.center.z), 20); this.game.ui.toast(`Fed ${n} items to the burner`); } else this.game.ui.toast(E.backpack.length ? 'Firebox is full' : 'Your backpack is empty');
    } };
  }
  dispose() { this.game.lights.remove(this.light); this.sound?.stop(); }
  extra() { return { b: this.box }; }
  restore(e) { this.box = e.b || []; }
}

class Pole extends Machine {}

class Battery extends Machine {
  constructor(...a) { super(...a); this.stored = 0; }
  update() {
    const bars = this.group.userData.bars, f = this.stored / this.def.cap;
    bars.forEach((b, i) => { b.material.emissiveIntensity = f * 5 > i ? 3 : 0.05; });
  }
  extra() { return { s: this.stored }; }
  restore(e) { this.stored = e.s || 0; }
}

class Sorter extends Machine {
  constructor(...a) { super(...a); this.held = null; this.t = 0; this.filter = [].concat(this.def.filter); }
  accept(rec, info) {
    if (this.held) return false;
    // only accept from behind
    if (info?.from && (info.from[0] !== this.dir[0] || info.from[1] !== this.dir[1])) return false;
    this.held = { rec, sorted: info?.sorted }; this.t = 0.45;
    this.ghost = this.game.items.makeMesh(rec); this.ghost.position.set(this.center.x, BELT_HEIGHT + 0.2, this.center.z); this.ghost.scale.multiplyScalar(0.8);
    this.game.scene.add(this.ghost);
    return true;
  }
  update(dt) {
    if (!this.held) return;
    this.t -= dt * this.factor;
    if (this.ghost) this.ghost.rotation.y += dt * 2 * this.factor;
    if (this.t > 0) return;
    const rec = this.held.rec;
    const match = !recComposite(rec) && this.filter.includes(recPrimary(rec));
    const ok = match ? this.emit(rec, this.leftCell(), this.left, true) : this.emit(rec, this.frontCell(), this.dir, this.held.sorted);
    if (ok) {
      if (match) { this.game.particles.sparks(V3(this.center.x, 1.1, this.center.z), 4, [0.4, 0.8, 1]); }
      this.held = null; this.game.scene.remove(this.ghost); this.ghost = null;
    } else this.t = 0.15;
  }
  dispose() { if (this.ghost) this.game.scene.remove(this.ghost); }
  extra() { return { h: this.held }; }
  restore(e) { if (e.h) this.accept(e.h.rec, { sorted: e.h.sorted }); }
}

class Shredder extends Machine {
  constructor(...a) { super(...a); this.out = []; this.t = 0; this.inQ = []; }
  accept(rec, info) {
    if (this.inQ.length + this.out.length > 8) return false;
    if (info?.from && info.from[0] === -this.dir[0] && info.from[1] === -this.dir[1]) return false;
    this.inQ.push(rec); return true;
  }
  update(dt) {
    const teeth = this.group.userData.teeth;
    teeth.children.forEach((t, i) => t.rotation.x += dt * 8 * this.factor * (i ? 1 : -1));
    if (this.inQ.length) {
      this.t += dt * this.factor;
      if (this.t > 1.0) {
        this.t = 0;
        const rec = this.inQ.shift();
        for (const [m, f] of Object.entries(recComp(rec))) if (f * rec.mass > 0.05) this.out.push({ kind: 'chunk', mat: m, mass: +(rec.mass * f).toFixed(2) });
        this.game.particles.sparks(V3(this.center.x, 1.1, this.center.z), 8);
        this.game.particles.dust(V3(this.center.x, 1.1, this.center.z), [0.4, 0.38, 0.35], 4, 0.3);
        this.game.audio.impact('metal', this.center, 0.7);
      }
    }
    if (this.out.length && this.factor > 0.1) { if (this.emit(this.out[0], this.frontCell(), this.dir, false)) this.out.shift(); }
  }
  extra() { return { i: this.inQ, o: this.out }; }
  restore(e) { this.inQ = e.i || []; this.out = e.o || []; }
}

class Digger extends Machine {
  constructor(...a) { super(...a); this.t = 2; this.phase = 'idle'; this.target = null; this.carry = null; this.yaw = 0; this.reach = 1; }
  update(dt) {
    const U = this.group.userData, P = this.game.pile;
    const turret = U.turret, boom = U.boom;
    const pivot = V3(this.center.x, 1.4, this.center.z);
    let wantYaw = 0, wantReach = 1, wantPitch = 0.3;
    if (this.phase === 'idle') {
      this.t -= dt * this.factor;
      if (this.t <= 0 && this.factor > 0.1) {
        this.target = this._findTarget();
        if (this.target) { this.phase = 'reach'; this.t = 1.4; } else this.t = 3;
      }
    }
    if (this.target && (this.phase === 'reach' || this.phase === 'dig')) {
      const tp = P.cellWorld(...this.target);
      const lx = tp.x - pivot.x, lz = tp.z - pivot.z;
      wantYaw = Math.atan2(-lx, -lz) - (-this.rot * Math.PI / 2);
      wantReach = Math.hypot(lx, lz);
      wantPitch = Math.atan2(pivot.y - tp.y, wantReach);
    }
    if (this.phase === 'reach') {
      this.t -= dt * this.factor;
      if (this.t <= 0) {
        const [cx, cy, cz] = this.target;
        if (cy < P.height(cx, cz)) {
          const res = this.game.digCell(cx, cy, cz, { auto: true });
          if (res && res.rec) this.carry = res.rec;
        }
        this.phase = 'return'; this.t = 1.2;
      }
    } else if (this.phase === 'return') {
      this.t -= dt * this.factor;
      if (this.t <= 0) {
        if (!this.carry || this.emit(this.carry, this.frontCell(), this.dir, false)) { this.carry = null; this.phase = 'idle'; this.t = 0.6; }
        else this.t = 0.3;
      }
    }
    // animate
    const k = Math.min(1, dt * 3);
    let dy = wantYaw - turret.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    turret.rotation.y += dy * k;
    this.reach += (Math.max(1, wantReach) - this.reach) * k;
    boom.rotation.x += (-wantPitch - boom.rotation.x) * k;
    U.arm.scale.z = this.reach; U.arm.position.z = -this.reach / 2;
    U.bucket.position.z = -this.reach;
  }
  _findTarget() {
    const P = this.game.pile, R = this.def.reach;
    let best = null, bs = -1e9;
    const c0 = P.toCol(this.center.x), z0 = P.toCol(this.center.z);
    for (let x = c0 - R; x <= c0 + R; x++) for (let z = z0 - R; z <= z0 + R; z++) {
      const h = P.height(x, z); if (!h) continue;
      const d = Math.hypot(P.colCenter(x) - this.center.x, P.colCenter(z) - this.center.z);
      if (d > R) continue;
      const y = Math.min(h - 1, 3);
      const code = P.get(x, y, z);
      if (code === 0) continue;
      const score = -d + h * 0.15;
      if (score > bs) { bs = score; best = [x, y, z]; }
    }
    return best;
  }
  extra() { return { c: this.carry }; }
  restore(e) { this.carry = e.c || null; if (this.carry) { this.phase = 'return'; this.t = 0.5; } }
}

class Flood extends Machine {
  constructor(...a) {
    super(...a);
    const [dx, dz] = this.dir;
    this.emitter = game.lights.add({ type: 'spot', pos: V3(this.center.x + dx * 0.3, 5.1, this.center.z + dz * 0.3), target: V3(this.center.x + dx * 14, 0, this.center.z + dz * 14), color: 0xfff1d8, distance: 45, angle: 0.75,
      intensity: () => this.factor > 0.1 ? this.game.sky.night * 900 * this.factor : 0 });
  }
  dispose() { this.game.lights.remove(this.emitter); }
}

// `game` is referenced by a couple of constructors before `this.game` is set via super; provide it through a module variable.
let game = null;
const CLASSES = { belt: Belt, hopper: Hopper, burner: Burner, pole: Pole, battery: Battery, shredder: Shredder, digger: Digger, flood: Flood };

export class Machines {
  constructor(g) {
    game = g;
    this.game = g;
    this.list = [];
    this.grid = new Map();
    this.group = new THREE.Group();
    g.scene.add(this.group);
    this.beltDirty = true;
    this.beltMeshes = null;
  }

  at(x, z) { return this.grid.get(key(x, z)); }

  canPlace(def, cx, cz) {
    const [w, d] = def.size;
    for (let x = cx; x < cx + w; x++) for (let z = cz; z < cz + d; z++) {
      if (x < YARD.minX + 1 || x >= YARD.maxX - 1 || z < YARD.minZ + 1 || z >= YARD.maxZ - 1) return 'Outside the yard';
      if (this.grid.has(key(x, z))) return 'Something is already there';
      const P = this.game.pile;
      if (P.height(P.toCol(x + 0.5), P.toCol(z + 0.5)) > 0) return 'Too close to the heap';
      const cell = new THREE.Box3(V3(x + 0.05, 0.05, z + 0.05), V3(x + 0.95, 2, z + 0.95));
      for (const b of this.game.yard.colliders) if (b.tag !== 'machine' && b.intersectsBox(cell)) return 'Blocked';
      if (this.game.yard.scaleBox.intersectsBox(cell)) return 'Keep the scale clear';
    }
    const p = this.game.player.pos;
    if (p.x > cx - 0.3 && p.x < cx + w + 0.3 && p.z > cz - 0.3 && p.z < cz + d + 0.3) return 'You are standing there';
    return null;
  }

  place(id, cx, cz, rot, { free = false, restore } = {}) {
    const def = MACHINE_BY_ID[id];
    const Cls = def.filter ? Sorter : CLASSES[id];
    const m = new Cls(this.game, def, cx, cz, rot);
    m.game = this.game;
    for (const [x, z] of m.cells) this.grid.set(key(x, z), m);
    this.list.push(m);
    const [w, d] = def.size;
    if (id === 'belt') { this.beltDirty = true; m.colliders.push(this.game.yard.addCollider(cx, 0, cz, cx + 1, BELT_HEIGHT, cz + 1, 'machine')); }
    else {
      m.group = machineVisual(this.game, def);
      m.group.position.set(cx + w / 2, 0, cz + d / 2);
      m.group.rotation.y = -rot * Math.PI / 2;
      this.group.add(m.group);
      const hgt = { hopper: 2.4, burner: 2.2, pole: 5.6, battery: 1.7, shredder: 1.05, digger: 1.3, flood: 5 }[id] ?? 1.9;
      if (def.filter) m.colliders.push(this.game.yard.addCollider(cx, 0, cz, cx + 1, BELT_HEIGHT, cz + 1, 'machine'), this.game.yard.addCollider(cx, 1.4, cz, cx + 1, 1.9, cz + 1, 'machine'));
      else if (id === 'pole' || id === 'flood') m.colliders.push(this.game.yard.addCollider(cx + 0.35, 0, cz + 0.35, cx + 0.65, hgt, cz + 0.65, 'machine'));
      else m.colliders.push(this.game.yard.addCollider(cx + 0.02, 0, cz + 0.02, cx + w - 0.02, hgt, cz + d - 0.02, 'machine'));
    }
    if (restore && m.restore) m.restore(restore);
    this.game.power.dirty = true;
    return m;
  }

  remove(m, refund = true) {
    for (const [x, z] of m.cells) this.grid.delete(key(x, z));
    this.list.splice(this.list.indexOf(m), 1);
    for (const c of m.colliders) this.game.yard.removeCollider(c);
    if (m.group) this.group.remove(m.group);
    m.dispose?.();
    if (m.def.id === 'belt') this.beltDirty = true;
    // spill anything stored inside
    const spill = [...(m.queue || []), ...(m.box || []), ...(m.inQ || []), ...(m.out || []), ...(m.held ? [m.held.rec] : []), ...(m.carry ? [m.carry] : [])];
    for (const rec of spill) this.game.items.spawn(rec, V3(m.center.x + (Math.random() - 0.5), 1.2, m.center.z + (Math.random() - 0.5)), V3((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2));
    if (refund) this.game.economy.money += m.def.price * DEMOLISH_REFUND;
    this.game.power.dirty = true;
  }

  catchAt(p) {
    for (const m of this.list) if (m.catchBox && m.catchBox.containsPoint(p)) return m;
    return null;
  }

  emit(rec, [x, z], [dx, dz], sorted, from) {
    const t = this.at(x, z);
    if (t && t.def.id === 'belt') return this.game.items.placeOnBelt(rec, x, z, V3(x + 0.5 - dx * 0.42, BELT_HEIGHT, z + 0.5 - dz * 0.42), sorted);
    if (t) return t !== from && t.accept(rec, { sorted, from: [dx, dz] });
    // nothing there: drop it on the ground
    this.game.items.spawn(rec, V3(x + 0.5 - dx * 0.3, BELT_HEIGHT + 0.3, z + 0.5 - dz * 0.3), V3(dx * 1.2, 0.5, dz * 1.2), { sorted });
    return true;
  }

  _rebuildBelts() {
    const M = mats(this.game.assets);
    if (!this.beltMeshes) {
      const frame = new THREE.InstancedMesh(beltFrameGeo(), M.steel, 2000);
      const pg = new THREE.PlaneGeometry(0.84, 1); pg.rotateX(-Math.PI / 2); pg.translate(0, BELT_HEIGHT, 0);
      const surf = new THREE.InstancedMesh(pg, M.belt, 2000);
      frame.castShadow = frame.receiveShadow = surf.receiveShadow = true;
      frame.frustumCulled = surf.frustumCulled = false;
      this.group.add(frame, surf);
      this.beltMeshes = { frame, surf };
    }
    const { frame, surf } = this.beltMeshes;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V3(1, 1, 1);
    let n = 0;
    for (const m of this.list) if (m.def.id === 'belt') {
      q.setFromAxisAngle(V3(0, 1, 0), -m.rot * Math.PI / 2);
      mtx.compose(V3(m.cx + 0.5, 0, m.cz + 0.5), q, one);
      frame.setMatrixAt(n, mtx); surf.setMatrixAt(n, mtx); n++;
    }
    frame.count = surf.count = n;
    frame.instanceMatrix.needsUpdate = surf.instanceMatrix.needsUpdate = true;
    this.beltDirty = false;
  }

  update(dt, beltSpeed) {
    if (this.beltDirty) this._rebuildBelts();
    const M = mats(this.game.assets);
    // scroll the belt texture (belts run toward their local -z)
    M.belt.map.offset.y = (M.belt.map.offset.y - dt * beltSpeed / 1.0) % 1;
    for (const m of this.list) {
      m.update(dt);
      if (m.group?.userData.lamp) m.group.userData.lamp.material = m.factor > 0.15 ? M.on : M.off;
    }
  }

  serialize() { return this.list.map(m => ({ id: m.def.id, x: m.cx, z: m.cz, r: m.rot, e: m.extra() })); }
  load(arr) {
    for (const m of [...this.list]) this.remove(m, false);
    for (const d of arr || []) { const m = this.place(d.id, d.x, d.z, d.r, { restore: d.e }); }
  }
}
