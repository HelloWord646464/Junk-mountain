import * as THREE from 'three';
import { SCANNERS, CELL_WALLET } from '../config.js';

const DIR8 = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

// The lost-ticket hunt: clue newspaper texts, scanners and the x-ray view.
export class Ticket {
  constructor(game) {
    this.game = game;
    this.wallet = null;      // [cx, cy, cz]
    this.cluesFound = 0;
    this.found = false;
    this.rares = new Set();
    this.beepT = 0;
    this.signal = 0;
    this.xrayMarks = [];
  }

  setSecrets(s) { this.wallet = s.wallet; }

  // The wallet's cell shifts as the heap collapses, so look it up again whenever the heap changes.
  walletWorld() {
    const P = this.game.pile;
    if (this._ver !== P.removedCount) { this._ver = P.removedCount; this.wallet = P.findCell(CELL_WALLET) || this.wallet; }
    return this.wallet ? P.cellWorld(...this.wallet) : null;
  }

  clueTexts() {
    if (this.texts) return this.texts;
    const w = this.walletWorld();
    const ang = Math.atan2(w.z, w.x);
    const dir = DIR8[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
    const dist = Math.round(Math.hypot(w.x, w.z));
    return this.texts = [
      { title: 'Lottery winner’s $4.2M blunder', body: 'Local man says the winning ticket was tucked in a brown leather wallet that went out with the rubbish by mistake. “It’s in that heap somewhere,” he told us.' },
      { title: 'Harlow Street clear-out', body: `The wallet left in a skip from Harlow Street. Yard records show every Harlow Street load was tipped on the ${dir.toUpperCase()} side of the heap.` },
      { title: 'A cold start to the year', body: 'The clear-out was in early January, one of the first loads of the year. Newer junk has piled on top since, so the wallet will be deep, near the bottom of the heap.' },
      { title: 'The blue cooker', body: 'A neighbour remembers a bright BLUE electric cooker going into the same skip. Find the blue cooker and the wallet won’t be far away.' },
      { title: 'Scribbled yard map', body: `Someone has pencilled an X on a map of the yard, about ${dist} metres out from the middle of the heap, ${dir}.` },
      { title: 'Zips and coins', body: 'The wallet has a heavy brass zip and a pocket of coins. A metal detector tuned for brass would pick it up from a few metres away. (Ask at the yard computer.)' },
    ];
  }

  foundClue() {
    const all = this.clueTexts();
    if (this.cluesFound >= all.length) return null;
    const c = all[this.cluesFound++];
    return c;
  }

  get journal() { return this.clueTexts().slice(0, this.cluesFound); }

  bestScanner() {
    const S = this.game.economy.scanners;
    return [...SCANNERS].reverse().find(s => S.has(s.key) && s.key !== 'xray') || null;
  }

  update(dt, usingScanner) {
    const w = this.walletWorld();
    this.signal = 0;
    if (!w || this.found) return;
    const sc = this.bestScanner();
    if (usingScanner && sc) {
      const p = this.game.camera.getWorldPosition(new THREE.Vector3());
      const d = p.distanceTo(w);
      this.distance = d;
      if (d < sc.range) {
        this.signal = 1 - d / sc.range;
        this.beepT -= dt;
        if (this.beepT <= 0) { this.game.audio.beep(900 + this.signal * 900); this.beepT = 0.08 + (1 - this.signal) * 0.9; }
      }
    }
    // x-ray goggles: show the wallet and rare finds through the heap
    const xray = this.game.economy.scanners.has('xray') && this.game.xrayOn;
    this.xray.visible = xray;
    if (xray) {
      const cam = this.game.camera.position;
      this.xrayWallet.visible = w.distanceTo(cam) < 12;
      this.xrayWallet.position.copy(w);
      this.xrayWallet.rotation.y += dt;
    }
  }

  build() {
    this.xray = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.85, depthTest: false });
    this.xrayWallet = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.3), mat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 32), mat); ring.rotation.x = Math.PI / 2; this.xrayWallet.add(ring);
    this.xrayWallet.renderOrder = 999;
    this.xray.add(this.xrayWallet);
    this.xray.visible = false;
    this.game.scene.add(this.xray);
  }

  serialize() { return { wallet: this.wallet, clues: this.cluesFound, found: this.found, rares: [...this.rares], texts: this.texts }; }
  load(d) { this.wallet = d.wallet; this.cluesFound = d.clues; this.found = d.found; this.rares = new Set(d.rares); this.texts = d.texts; this._ver = -1; }
}
