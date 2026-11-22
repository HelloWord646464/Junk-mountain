import * as THREE from 'three';
import { MATERIALS, MATERIAL_KEYS, MIXED_PRICE, BACKPACKS, TOOLS, START_MONEY, JUNK_BY_KEY } from '../config.js';

// A junk record is what the player actually carries, sorts and sells:
//   { kind: 'junk', key, mass }  or  { kind: 'chunk', mat, mass } (a pure piece of one material)
export const recComp = r => r.kind === 'chunk' ? { [r.mat]: 1 } : JUNK_BY_KEY[r.key].comp;
export const recPrimary = r => r.kind === 'chunk' ? r.mat : JUNK_BY_KEY[r.key].primary;
export const recName = r => r.kind === 'chunk' ? `${MATERIALS[r.mat].name} chunk` : JUNK_BY_KEY[r.key].name;
export const recComposite = r => r.kind !== 'chunk' && JUNK_BY_KEY[r.key].composite;

export class Economy {
  constructor(game) {
    this.game = game;
    this.money = START_MONEY;
    this.backpack = [];
    this.pack = 0;
    this.tool = 0;
    this.toolsOwned = new Set(['spade']);
    this.scanners = new Set();
    this.upgrades = new Set();
    this.bins = Object.fromEntries(MATERIAL_KEYS.map(k => [k, { kg: 0, bad: 0 }]));
    this.stats = { earned: 0, dug: 0, kgSold: 0, burned: 0, playTime: 0 };
  }

  backpackKg() { return this.backpack.reduce((a, r) => a + r.mass, 0); }
  backpackCap() { return BACKPACKS[this.pack].cap; }
  canCarry(mass) { return this.backpackKg() + mass <= this.backpackCap() + 0.001; }
  addToBackpack(rec) { if (!this.canCarry(rec.mass)) return false; this.backpack.push(rec); return true; }
  backpackMixedValue() { return this.backpack.reduce((a, r) => a + this.value(r, false), 0); }

  value(rec, sorted) {
    if (!sorted) return rec.mass * MIXED_PRICE;
    // fully sorted value: every material at its own price
    return Object.entries(recComp(rec)).reduce((a, [m, f]) => a + rec.mass * f * MATERIALS[m].price, 0);
  }

  earn(amount, pos, label) {
    amount = Math.round(amount * 100) / 100;
    if (amount <= 0) return;
    this.money += amount;
    this.stats.earned += amount;
    this.game.ui.floatMoney(amount, pos, label);
    this.game.ui.bumpMoney();
  }

  spend(amount) {
    if (this.money < amount - 0.001) { this.game.ui.toast('Not enough money', 'bad'); this.game.audio.error(); return false; }
    this.money -= amount;
    this.game.ui.bumpMoney();
    return true;
  }

  sellBackpack() {
    if (!this.backpack.length) { this.game.ui.toast('Your backpack is empty. Dig some junk first.'); return; }
    const kg = this.backpackKg(), v = this.backpackMixedValue();
    this.backpack.length = 0;
    this.stats.kgSold += kg;
    const pos = this.game.yard.scaleBox.getCenter(new THREE.Vector3());
    this.earn(v, pos, `${kg.toFixed(0)} kg unsorted`);
    this.game.audio.cash(null);
    this.game.yard.scaleTex.draw(['WEIGH & SELL', `LAST: $${v.toFixed(2)}`, `${kg.toFixed(1)} KG MIXED`]);
  }

  // An item landing on the scale (thrown, or dropped off a belt).
  sellItem(rec, sorted, pos) {
    const v = this.value(rec, sorted);
    this.stats.kgSold += rec.mass;
    this.earn(v, pos, sorted ? MATERIALS[recPrimary(rec)].short : null);
    this.game.audio.cash(pos);
    this.game.particles.coin(pos);
    this.game.yard.scaleTex.draw(['WEIGH & SELL', `LAST: $${v.toFixed(2)}`, `${rec.mass.toFixed(1)} KG ${sorted ? MATERIALS[recPrimary(rec)].short.toUpperCase() : 'MIXED'}`]);
  }

  binValue(k) {
    const b = this.bins[k];
    if (b.kg <= 0) return 0;
    const purity = Math.max(0.3, 1 - (b.bad / b.kg) * 1.5);
    return b.kg * MATERIALS[k].price * purity;
  }
  binsValue() { return MATERIAL_KEYS.reduce((a, k) => a + this.binValue(k), 0); }
  shipBins() {
    const v = this.binsValue();
    if (v <= 0) return 0;
    const kg = MATERIAL_KEYS.reduce((a, k) => a + this.bins[k].kg, 0);
    for (const k of MATERIAL_KEYS) this.bins[k] = { kg: 0, bad: 0 };
    this.stats.kgSold += kg;
    this.earn(v, null, `${kg.toFixed(0)} kg sorted`);
    this.game.audio.cash(null, true);
    return v;
  }

  get toolDef() { return TOOLS[this.tool]; }

  serialize() {
    return { money: this.money, backpack: this.backpack, pack: this.pack, tool: this.tool, toolsOwned: [...this.toolsOwned],
      scanners: [...this.scanners], upgrades: [...this.upgrades], bins: this.bins, stats: this.stats };
  }
  load(d) {
    Object.assign(this, { money: d.money, backpack: d.backpack, pack: d.pack, tool: d.tool, bins: d.bins, stats: d.stats });
    this.toolsOwned = new Set(d.toolsOwned); this.scanners = new Set(d.scanners); this.upgrades = new Set(d.upgrades);
  }
}
