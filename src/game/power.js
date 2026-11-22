import * as THREE from 'three';

const HUB_RANGE = 5;   // burners and batteries power anything this close without a pole

// Groups machines into power networks (connected through poles), balances
// supply and demand each frame, and draws the overhead wires.
export class Power {
  constructor(game) {
    this.game = game;
    this.networks = [];
    this.dirty = true;
    this.wires = new THREE.Group();
    game.scene.add(this.wires);
    this.wireMat = new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 0.6, metalness: 0.4 });
    this.totals = { gen: 0, demand: 0, stored: 0, cap: 0, factor: 1, hasGrid: false };
  }

  _rebuild() {
    const ms = this.game.machines.list;
    const nodes = ms.filter(m => m.def.power > 0 || ['burner', 'battery', 'pole'].includes(m.def.id));
    const parent = new Map(nodes.map(n => [n, n]));
    const find = n => { while (parent.get(n) !== n) { parent.set(n, parent.get(parent.get(n))); n = parent.get(n); } return n; };
    const union = (a, b) => parent.set(find(a), find(b));
    const poles = nodes.filter(n => n.def.id === 'pole');
    const hubs = nodes.filter(n => n.def.id === 'burner' || n.def.id === 'battery');
    const links = [];
    const dist = (a, b) => Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z);
    for (const p of poles) {
      for (const n of nodes) {
        if (n === p) continue;
        const d = dist(p, n);
        if (d <= p.def.range) {
          union(p, n);
          if (n.def.id === 'pole' ? n.cx > p.cx || (n.cx === p.cx && n.cz > p.cz) : n.def.id !== 'belt') links.push([p, n]);
        }
      }
    }
    for (const h of hubs) for (const n of nodes) if (n !== h && n.def.id !== 'pole' && dist(h, n) <= HUB_RANGE + (n.def.size[0] > 1 ? 1 : 0)) union(h, n);
    const groups = new Map();
    for (const n of nodes) { const r = find(n); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(n); }
    this.networks = [...groups.values()];
    for (const m of ms) m.network = null;
    for (const net of this.networks) for (const n of net) n.network = net;
    this._drawWires(links);
    this.dirty = false;
  }

  _drawWires(links) {
    for (const c of [...this.wires.children]) { c.geometry.dispose(); this.wires.remove(c); }
    for (const [a, b] of links) {
      const top = m => m.def.id === 'pole' ? 5.4 : m.def.id === 'burner' ? 2.2 : m.def.id === 'flood' ? 4.8 : m.def.id === 'battery' ? 1.65 : 1.5;
      const p0 = new THREE.Vector3(a.center.x, top(a), a.center.z), p1 = new THREE.Vector3(b.center.x, top(b), b.center.z);
      const len = p0.distanceTo(p1), sag = Math.min(1.2, len * 0.08);
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; const p = p0.clone().lerp(p1, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.018, 4), this.wireMat);
      tube.castShadow = true;
      this.wires.add(tube);
    }
  }

  update(dt) {
    if (this.dirty) this._rebuild();
    for (const m of this.game.machines.list) if (!m.network) m.factor = 0;
    let G = 0, D = 0, S = 0, C = 0, worst = 1;
    for (const net of this.networks) {
      let gen = 0, demand = 0;
      const batteries = [];
      for (const n of net) {
        if (n.def.id === 'burner') gen += n.output;
        else if (n.def.id === 'battery') batteries.push(n);
        else demand += n.def.power;
      }
      let factor = 1;
      if (gen >= demand) {
        let spare = gen - demand;
        for (const b of batteries) { const take = Math.min(spare, b.def.rate, (b.def.cap - b.stored) / dt); b.stored += take * dt; spare -= take; }
      } else {
        let need = demand - gen;
        for (const b of batteries) { const give = Math.min(need, b.def.rate, b.stored / dt); b.stored -= give * dt; need -= give; }
        factor = demand > 0 ? Math.max(0, 1 - need / demand) : 1;
      }
      for (const n of net) n.factor = factor;
      G += gen; D += demand;
      for (const b of batteries) { S += b.stored; C += b.def.cap; }
      if (demand > 0) worst = Math.min(worst, factor);
    }
    this.totals = { gen: G, demand: D, stored: S, cap: C, factor: worst, hasGrid: this.networks.length > 0 };
  }
}
