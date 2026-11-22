import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/ibm-plex-mono/500.css';
import './ui/style.css';

import { JUNK, RARES, TOOLS, MACHINES, MATERIALS, MATERIAL_KEYS, CELL_WALLET, CELL_CLUE, CELL_RARE, START_HOUR, TICKET_PRIZE, BELT_SPEED, MACHINE_BY_ID } from './config.js';
import { Renderer } from './engine/renderer.js';
import { Assets, MODEL_LIST, TEXTURE_LIST } from './engine/assets.js';
import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { DayNight } from './world/sky.js';
import { Particles } from './world/particles.js';
import { LightPool } from './world/lights.js';
import { Yard, LAYOUT } from './world/yard.js';
import { Pile } from './world/pile.js';
import { newspaperTexture } from './world/textures.js';
import { Economy, recPrimary, recName } from './game/economy.js';
import { Items } from './game/items.js';
import { Machines, machineVisual, DIRS } from './game/machines.js';
import { Power } from './game/power.js';
import { Player } from './game/player.js';
import { Ticket } from './game/ticket.js';
import { UI } from './ui/ui.js';

const SAVE_KEY = 'junk-mountain-save-v1';
const SETTINGS_KEY = 'junk-mountain-settings-v1';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const kbd = k => `<kbd>${k}</kbd>`;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.settings = Object.assign({ quality: 'high', fov: 75, sens: 1, volume: 0.8, fullscreen: true }, store.get(SETTINGS_KEY) || {});
    this.renderer = new Renderer(this.canvas);
    this.renderer.quality = this.settings.quality;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.08, 6000);
    this.scene.add(this.camera);
    this.renderer.setup(this.scene, this.camera);
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.ui = new UI(this);
    this.started = false;
    this.mode = 'loading';
    this.held = null; this.charge = 0; this.digProgress = 0;
    this.scannerOut = false; this.xrayOn = false; this.torchOn = false;
    this.build = { on: false, sel: 0, rot: 0, demolish: false, drag: null };
    this.thumbs = {};
    this.input.onLockChange = locked => {
      if (!locked && this.mode === 'play' && !this.ui.panel && !this._expectUnlock) this.ui.openPause();
      this._expectUnlock = false;
    };
    this.canvas.addEventListener('click', () => { if (this.mode === 'play' && !this.ui.panel && !this.input.locked) this.input.lock(); });
  }

  async init() {
    this.assets = new Assets(this.renderer.renderer);
    const lods = JUNK.map(j => j.model);
    await this.assets.loadAll({ models: MODEL_LIST, lods, textures: TEXTURE_LIST }, p => this.ui.setLoading(p * 0.85, 'Hauling junk into the yard…'));
    this.ui.setLoading(0.88, 'Lighting the yard…');
    this.lights = new LightPool(this.scene, 10, 8);
    this.sky = new DayNight(this.renderer.renderer, this.scene);
    this.particles = new Particles(this.scene);
    this.renderer.hideDuringAO.push(this.sky.moonDisc, this.sky.stars, this.particles.soft.points, this.particles.glow.points);
    this.yard = new Yard(this);
    this.yard.build();
    this.pile = new Pile(this);
    this.economy = new Economy(this);
    this.items = new Items(this);
    this.power = new Power(this);
    this.machines = new Machines(this);
    this.player = new Player(this);
    this.ticket = new Ticket(this);
    this.ticket.build();
    this.renderer.hideDuringAO.push(this.ticket.xray);
    this._makeTorch();
    this._makeViewmodel();
    this._makeBuildGhost();
    this.ui.setLoading(0.94, 'Taking photos of the junk…');
    await new Promise(r => setTimeout(r, 20));
    this._makeThumbs();
    this.applySettings();
    // Show the heap behind the main menu: load the saved yard if there is one.
    const save = store.get(SAVE_KEY);
    if (save) { try { this._load(save); } catch (e) { console.warn('save failed to load', e); this._fresh(); } }
    else this._fresh();
    this.ui.setLoading(1, 'Ready');
    // warm up shaders
    this.renderer.renderer.compile(this.scene, this.camera);
    this.mode = 'menu';
    this.ui.showMenu();
    this.clock = new THREE.Clock();
    this._loop();
    setInterval(() => { if (this.mode === 'play') this.save(); }, 60000);
    addEventListener('beforeunload', () => { if (this.started) this.save(); });
  }

  // ---------- game state ----------
  hasSave() { return !!store.get(SAVE_KEY) || this.started; }

  _fresh(seed = (Math.random() * 1e9) | 0) {
    this.seed = seed;
    const secrets = this.pile.generate(seed);
    this.ticket = Object.assign(this.ticket, { cluesFound: 0, found: false, rares: new Set(), texts: null, _ver: -1 });
    this.ticket.setSecrets(secrets);
    this.ticket.clueTexts();
    this.economy = new Economy(this);
    this.machines.load([]);
    this.items.load([]);
    // loose junk scattered at the foot of the heap to get started
    for (let i = 0; i < 26; i++) {
      const j = JUNK[(Math.random() * JUNK.length) | 0];
      const a = Math.PI * (0.25 + Math.random() * 0.5), r = 27 + Math.random() * 6;
      const it = this.items.spawn({ kind: 'junk', key: j.key, mass: j.mass }, new THREE.Vector3(Math.cos(a) * r, 0.5, Math.sin(a) * r));
      it.pos.y = it.r * 0.6; it.sleep = true;
    }
    this.sky.hour = START_HOUR; this.sky.day = 1;
    this.player.pos.set(LAYOUT.start.x, 0, LAYOUT.start.z); this.player.yaw = 0; this.player.pitch = 0.05;
    this.held = null;
    this.refreshViewmodel?.();
  }

  newGame() {
    this._fresh();
    this.started = true;
    this.save();
    this.continueGame(true);
    setTimeout(() => this.ui.toast('Dig into the heap with the left mouse button.'), 800);
    setTimeout(() => this.ui.toast('Sell at the scale by the gate, or sort it at the table for more cash.'), 4200);
    setTimeout(() => this.ui.toast('Old newspapers in the heap hold clues about the ticket.'), 8000);
  }

  continueGame() {
    this.started = true;
    this.mode = 'play';
    this.ui.enterPlay();
    this.input.lock();
    this.refreshViewmodel();
  }

  toMenu() {
    this.mode = 'menu';
    this._expectUnlock = true;
    this.input.unlock();
    this.exitBuild();
    this.ui.showMenu();
  }

  pauseInput(on) {
    if (on) { this._expectUnlock = true; this.input.unlock(); this.charge = 0; this.digProgress = 0; }
    else if (this.mode === 'play') this.input.lock();
  }

  save() {
    if (!this.started) return;
    const data = {
      v: 1, seed: this.seed, pile: this.pile.serialize(), economy: this.economy.serialize(), machines: this.machines.serialize(),
      items: this.items.serialize(), ticket: this.ticket.serialize(), time: { hour: this.sky.hour, day: this.sky.day },
      player: { p: this.player.pos.toArray(), yaw: this.player.yaw, pitch: this.player.pitch },
    };
    if (this.held) data.economy.backpack.push(this.held.rec);
    if (!store.set(SAVE_KEY, data)) this.ui.toast('Could not save the game', 'bad');
  }

  _load(d) {
    this.seed = d.seed;
    this.pile.load(d.pile);
    this.economy.load(d.economy);
    this.ticket.load(d.ticket);
    this.machines.load(d.machines);
    this.items.load(d.items);
    this.sky.hour = d.time.hour; this.sky.day = d.time.day;
    this.player.pos.fromArray(d.player.p); this.player.yaw = d.player.yaw; this.player.pitch = d.player.pitch;
  }

  applySettings() {
    const s = this.settings;
    this.renderer.applyQuality(s.quality, this.sky?.sun);
    this.sky?.setShadowExtent(this.renderer.preset.shadowFar);
    this.input.sensitivity = s.sens;
    this.audio.setVolume(s.volume);
    if (window.desktop?.isApp) window.desktop.setFullscreen(s.fullscreen);
    store.set(SETTINGS_KEY, s);
    if (this.particles) this.particles.setScale(innerHeight * this.renderer.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(s.fov) / 2)));
  }

  sleep() {
    const h = this.sky.hour;
    if (!(h >= 19 || h < 5)) { this.ui.toast('Too early to sleep. You can sleep after 7 pm.'); return; }
    if (h >= 19) this.sky.day++;
    this.sky.hour = 6.25;
    this.sky.envTimer = 0;
    this.ui.toast('You slept until morning.', 'good');
    this.save();
  }

  // ---------- visuals ----------
  _makeTorch() {
    this.torch = new THREE.SpotLight(0xfff0d6, 0, 26, 0.55, 0.65, 1.5);
    this.torch.position.set(0.25, -0.1, 0);
    this.torch.target.position.set(0, -0.2, -5);
    this.camera.add(this.torch, this.torch.target);
  }

  _makeViewmodel() {
    this.vm = new THREE.Group();
    this.vm.position.set(0.42, -0.46, -0.78);
    this.camera.add(this.vm);
    this.heldAnchor = new THREE.Group();
    this.heldAnchor.position.set(0.05, -0.3, -0.95);
    this.camera.add(this.heldAnchor);
    this.swing = 0;
  }

  refreshViewmodel() {
    if (!this.vm) return;
    this.vm.clear();
    let id, size;
    if (this.scannerOut) { id = 'metal_detector'; size = 1.0; }
    else { const t = this.economy.toolDef; id = t.model; size = 0.95; }
    const m = this.assets.instance(id, size, { shadows: false });
    m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    // tools are modelled lying along their longest axis; stand the handle up toward the camera
    const dims = this.assets.models[id]?.dims;
    if (dims) {
      if (dims.x >= dims.y && dims.x >= dims.z) m.rotation.z = Math.PI / 2;
      else if (dims.z >= dims.y && dims.z >= dims.x) m.rotation.x = Math.PI / 2;
    }
    const tilt = new THREE.Group();
    tilt.rotation.set(1.55, 0.3, 0.25); // working end forward and up, handle toward the camera
    tilt.add(m);
    this.vm.add(tilt);
    this.vmTool = tilt;
  }

  makeSpecialMesh(code) {
    const g = new THREE.Group();
    if (code === CELL_WALLET) {
      const leather = this.assets.pbr('brown_leather', { metalness: 0, repeat: [0.5, 0.5] });
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.3), leather); w.castShadow = true; g.add(w);
      const zip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.075, 0.02), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 }));
      zip.position.z = 0.13; g.add(zip);
    } else if (code >= CELL_CLUE && code < CELL_CLUE + 10) {
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.4), [0, 0, 1, 0, 0, 0].map(i => i ? new THREE.MeshStandardMaterial({ map: this._newsTex ??= newspaperTexture(), roughness: 0.9 }) : new THREE.MeshStandardMaterial({ color: 0xd8cfbb, roughness: 0.95 })));
      paper.castShadow = true; g.add(paper);
      g.scale.setScalar(1.3);
    } else if (code >= CELL_RARE) {
      const r = RARES[code - CELL_RARE];
      g.add(this.assets.instance(r.model, Math.max(0.5, r.size * 1.5)));
    }
    return g;
  }

  _makeThumbs() {
    const size = 160;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(size, size); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(2, 3, 2); scene.add(key);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    cam.position.set(1.6, 1.2, 2.2); cam.lookAt(0, 0, 0);
    const shot = (obj, name) => {
      scene.add(obj);
      obj.rotation.y = 0.6;
      r.render(scene, cam);
      this.thumbs[name] = r.domElement.toDataURL('image/png');
      scene.remove(obj);
    };
    const ids = new Set([...JUNK.map(j => j.model), ...RARES.map(x => x.model), ...TOOLS.map(t => t.model), 'metal_detector']);
    for (const id of ids) if (this.assets.models[id]) shot(this.assets.instance(id, 1.05), id);
    for (const m of MATERIAL_KEYS) {
      const mesh = this.items.makeMesh({ kind: 'chunk', mat: m, mass: 6 });
      mesh.scale.setScalar(1.8 / Math.max(0.3, mesh.children[0].scale.x * 2));
      shot(mesh, 'chunk:' + m);
    }
    r.dispose(); r.forceContextLoss?.();
  }

  _makeBuildGhost() {
    this.ghostOk = new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghost = new THREE.Group();
    this.scene.add(this.ghost);
    this.ghostCache = {};
    this.beltGhosts = [];
    const arrowGeo = new THREE.ConeGeometry(0.22, 0.5, 4); arrowGeo.rotateX(-Math.PI / 2); arrowGeo.translate(0, 0, -0.1);
    this.arrowGeo = arrowGeo;
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 96), new THREE.MeshBasicMaterial({ color: 0xe8b20e, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.rangeRing);
    this.rangeRing.visible = false;
    this.demoBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.3, depthWrite: false }));
    this.scene.add(this.demoBox); this.demoBox.visible = false;
  }

  _ghostFor(id) {
    if (this.ghostCache[id]) return this.ghostCache[id];
    const g = machineVisual(this, MACHINE_BY_ID[id]);
    g.traverse(o => { if (o.isMesh) { o.material = this.ghostOk; o.castShadow = false; o.receiveShadow = false; } });
    const arrow = new THREE.Mesh(this.arrowGeo, this.ghostOk);
    arrow.position.set(0, 0.05 + (id === 'belt' ? 0.62 : 0), -0.5 * MACHINE_BY_ID[id].size[1] - 0.1);
    g.add(arrow);
    return (this.ghostCache[id] = g);
  }

  // ---------- actions ----------
  digCell(cx, cy, cz, { auto = false } = {}) {
    const pos = this.pile.cellWorld(cx, cy, cz);
    const res = this.pile.remove(cx, cy, cz);
    if (!res) return null;
    const { code, slid } = res;
    this.items.wakeNear(pos, 4);
    this.economy.stats.dug++;
    this.particles.dust(pos, undefined, auto ? 6 : 12);
    for (const s of slid.slice(0, 4)) this.particles.dust(this.pile.cellWorld(...s), undefined, 5);
    if (slid.length > 2) this.audio.impact('metal', pos, 0.6);
    if (code === CELL_WALLET) { this._winTicket(pos); return {}; }
    if (code >= CELL_CLUE && code < CELL_CLUE + 10) {
      const c = this.ticket.foundClue();
      this.audio.sparkle();
      if (c) this.ui.popClue(c, this.ticket.cluesFound);
      return {};
    }
    if (code >= CELL_RARE) {
      const r = RARES[code - CELL_RARE];
      this.ticket.rares.add(r.key);
      this.economy.earn(r.value, pos, r.name);
      this.audio.sparkle(); this.audio.cash(null, true);
      this.ui.popRare(r);
      return {};
    }
    const j = JUNK[code - 1];
    if (!j) return {};
    const rec = { kind: 'junk', key: j.key, mass: Math.round(j.mass * (0.85 + Math.random() * 0.3) * 10) / 10 };
    this.audio.impact(j.primary, pos, auto ? 0.5 : 0.9);
    this.particles.debris(pos, new THREE.Color(MATERIALS[j.primary].color).toArray(), 6);
    if (auto) return { rec };
    if (!this.economy.addToBackpack(rec)) {
      // backpack full: it tumbles out toward you
      const toward = this.player.pos.clone().setY(pos.y).sub(pos).normalize().multiplyScalar(2.5);
      this.items.spawn(rec, pos, toward.setY(2));
      if (!this._fullWarned || performance.now() - this._fullWarned > 6000) { this.ui.toast('Backpack full: sell, sort or burn what you have', 'bad'); this._fullWarned = performance.now(); }
    }
    return { rec };
  }

  _winTicket(pos) {
    if (this.ticket.found) return;
    this.ticket.found = true;
    this.economy.earn(TICKET_PRIZE, pos, 'Winning ticket!');
    this.audio.fanfare();
    for (let i = 0; i < 6; i++) setTimeout(() => this.particles.coin(pos), i * 150);
    const E = this.economy;
    this.ui.popWin([['Days in the yard', String(this.sky.day)], ['Junk dug', E.stats.dug.toLocaleString()], ['Junk burned', `${Math.round(E.stats.burned)} kg`],
      ['Rare finds', `${this.ticket.rares.size} / ${RARES.length}`], ['Clues read', `${this.ticket.cluesFound} / 6`]]);
    this.save();
  }

  _lookRay() {
    const o = this.camera.getWorldPosition(new THREE.Vector3());
    const d = this.player.forward();
    return { o, d };
  }

  _machineUnderCrosshair(o, d, maxD = 4.5) {
    const ray = new THREE.Ray(o, d), hit = new THREE.Vector3();
    let best = null, bd = maxD;
    for (const m of this.machines.list) for (const c of m.colliders) {
      if (ray.intersectBox(c, hit)) { const t = hit.distanceTo(o); if (t < bd) { bd = t; best = m; } }
    }
    return best;
  }

  _playActions(dt) {
    const I = this.input, E = this.economy;
    const { o, d } = this._lookRay();
    this.prompt = null;

    // toggles
    if (I.hit('KeyF')) { this.torchOn = !this.torchOn; this.audio.click(); }
    if (I.hit('Tab')) { this.ui.openJournal(); return; }
    if (I.hit('KeyB')) { this.enterBuild(); return; }
    if (I.hit('Digit2') && E.scanners.size) { this.scannerOut = !this.scannerOut; this.refreshViewmodel(); this.audio.click(); }
    if (I.hit('Digit1') && this.scannerOut) { this.scannerOut = false; this.refreshViewmodel(); }
    if (I.hit('KeyX') && E.scanners.has('xray')) { this.xrayOn = !this.xrayOn; this.audio.click(); }

    // interactables in the yard
    let inter = null;
    for (const it of this.yard.interactables) {
      const to = it.pos.clone().sub(o); const dist = to.length();
      if (dist < it.radius + 1.2 && to.normalize().dot(d) > 0.55) { inter = it; break; }
    }
    const mach = !inter && this._machineUnderCrosshair(o, d, 3.6);
    const mi = mach && mach.interact();

    // held item: throw / drop
    if (this.held) {
      const it = this.held;
      if (I.mouse.left) this.charge = Math.min(1, this.charge + dt * 1.1);
      if (I.mouse.leftReleased && this.charge > 0) {
        const p = o.clone().addScaledVector(d, 0.7);
        it.state = 'free'; it.sleep = false; it.pos.copy(p);
        it.vel.copy(d).multiplyScalar(3 + this.charge * 15).add(new THREE.Vector3(0, 1.5 + this.charge * 2, 0));
        it.spin.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
        this.items.group.attach(it.mesh);
        this.held = null; this.charge = 0;
        this.audio.whoosh();
        return;
      }
      if (I.mouse.rightPressed) { this._dropHeld(o, d); return; }
      this.prompt = `${kbd('LMB')}Hold to throw ${esc(recName(it.rec))} · ${kbd('RMB')}Drop`;
      if (I.hit('KeyQ') && E.canCarry(it.rec.mass)) { E.addToBackpack(it.rec); this.items.remove(it); this.held = null; this.audio.pickup(); }
      return;
    }
    this.charge = 0;

    if (inter) {
      this.prompt = `${kbd('E')}${inter.prompt()}`;
      if (I.hit('KeyE')) { inter.action(); return; }
    } else if (mi) {
      this.prompt = `${kbd('E')}${mi.prompt}`;
      if (I.hit('KeyE')) { mi.action(); return; }
    }

    // pick up loose junk
    const loose = this.items.pick(o, d, 3.2);
    if (loose && !inter && !mi) this.prompt = `${kbd('RMB')}Pick up ${esc(recName(loose.rec))} (${loose.rec.mass} kg)`;
    if (I.mouse.rightPressed && loose) { this._grab(loose); return; }
    if (I.hit('KeyQ')) {
      const rec = E.backpack.pop();
      if (rec) { const it = this.items.spawn(rec, o.clone().addScaledVector(d, 0.8)); this._grab(it); }
      else this.ui.toast('Your backpack is empty');
      return;
    }

    // dig
    if (this.scannerOut) { this.digProgress = 0; return; }
    const tool = E.toolDef;
    const hit = this.pile.raycast(o, d, tool.reach);
    if (hit && !this.prompt) this.prompt = `${kbd('LMB')}Dig`;
    if (I.mouse.left && hit) {
      const key = `${hit.cx},${hit.cy},${hit.cz}`;
      if (key !== this._digKey) { this._digKey = key; this.digProgress = 0; }
      const j = JUNK[hit.code - 1];
      const t = tool.dig * (j ? 0.65 + Math.min(1.2, j.mass / 30) : 1);
      this.digProgress += dt / t;
      this.swing += dt * 10;
      if (this.digProgress >= 1) {
        this.digProgress = 0; this._digKey = null;
        this.audio.dig(hit.point);
        this.player.shake = Math.min(1, this.player.shake + 0.25);
        this.digCell(hit.cx, hit.cy, hit.cz);
        if (tool.radius) {
          // knock loose a few neighbours that are exposed
          const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [hit.cx + dx, hit.cz + dz]).filter(([x, z]) => this.pile.height(x, z) > 0);
          for (const [x, z] of n.sort(() => Math.random() - 0.5).slice(0, 2)) {
            const y = Math.min(this.pile.height(x, z) - 1, Math.max(0, hit.cy));
            this.digCell(x, y, z);
          }
        }
      }
    } else { this.digProgress = Math.max(0, this.digProgress - dt * 2); }
  }

  _grab(it) {
    this.held = it;
    it.state = 'held';
    this.heldAnchor.attach(it.mesh);
    it.mesh.position.set(0, 0, 0);
    const j = it.rec.kind === 'junk' ? JUNK.find(x => x.key === it.rec.key) : null;
    const s = j ? Math.min(1, 0.55 / j.size) : 1;
    it.mesh.scale.multiplyScalar(s);
    it._heldScale = s;
    this.audio.pickup();
  }

  _dropHeld(o, d) {
    const it = this.held;
    it.state = 'free'; it.sleep = false;
    it.pos.copy(o).addScaledVector(d, 0.9);
    it.vel.copy(d).multiplyScalar(1.5);
    this.items.group.attach(it.mesh);
    it.mesh.scale.divideScalar(it._heldScale || 1);
    this.held = null;
  }

  // ---------- build mode ----------
  enterBuild() {
    if (this.held) { const { o, d } = this._lookRay(); this._dropHeld(o, d); }
    this.build.on = true; this.build.demolish = false;
    this.ui.showBuild(true);
    this.vm.visible = false;
  }
  exitBuild() {
    this.build.on = false; this.build.drag = null;
    this.ghost.clear(); this.rangeRing.visible = false; this.demoBox.visible = false;
    for (const g of this.beltGhosts) g.visible = false;
    this.ui.showBuild(false);
    if (this.vm) this.vm.visible = true;
  }

  _buildActions() {
    const I = this.input, B = this.build, E = this.economy;
    if (I.hit('KeyB') || I.hit('Escape')) { this.exitBuild(); return; }
    for (let k = 0; k < 10; k++) if (I.hit(`Digit${(k + 1) % 10}`)) { B.sel = k; B.demolish = false; }
    if (I.mouse.wheel) { B.sel = (B.sel + I.mouse.wheel + MACHINES.length) % MACHINES.length; B.demolish = false; }
    if (I.hit('KeyR')) { B.rot = (B.rot + 1) % 4; this.audio.click(); }
    if (I.hit('KeyX')) { B.demolish = !B.demolish; this.audio.click(); }
    const { o, d } = this._lookRay();
    this.ghost.clear(); this.rangeRing.visible = false; this.demoBox.visible = false;
    for (const g of this.beltGhosts) g.visible = false;

    if (B.demolish) {
      const m = this._machineUnderCrosshair(o, d, 12);
      if (m) {
        const [w, dd] = m.def.size;
        const top = Math.max(...m.colliders.map(c => c.max.y));
        this.demoBox.visible = true;
        this.demoBox.position.set(m.cx + w / 2, top / 2, m.cz + dd / 2); this.demoBox.scale.set(w + 0.05, top + 0.05, dd + 0.05);
        if (I.mouse.leftPressed) { this.machines.remove(m); this.audio.place(m.center); this.ui.toast(`Removed ${m.def.name} (+$${(m.def.price * 0.75).toFixed(0)})`); }
      }
      this.ui.renderBuild(B.sel, m ? `Remove ${m.def.name}` : '', null, true);
      return;
    }

    const def = MACHINES[B.sel];
    // aim at the ground
    if (d.y >= -0.02) { this.ui.renderBuild(B.sel, '', 'Look at the ground', false); return; }
    const t = -o.y / d.y;
    if (t > 16) { this.ui.renderBuild(B.sel, '', 'Too far away', false); return; }
    const hp = o.clone().addScaledVector(d, t);
    const [w, dd] = def.size;
    const cx = Math.floor(hp.x - (w - 1) / 2), cz = Math.floor(hp.z - (dd - 1) / 2);

    if (def.id === 'belt') {
      if (I.mouse.leftPressed) B.drag = [cx, cz];
      let cells = [[cx, cz]], rot = B.rot;
      if (B.drag) {
        const [sx, sz] = B.drag, dx = cx - sx, dz = cz - sz;
        cells = [];
        if (Math.abs(dx) >= Math.abs(dz)) { const s = Math.sign(dx) || 1; for (let i = 0; i <= Math.abs(dx); i++) cells.push([sx + i * s, sz]); if (dx) rot = s > 0 ? 1 : 3; }
        else { const s = Math.sign(dz); for (let i = 0; i <= Math.abs(dz); i++) cells.push([sx, sz + i * s]); rot = s > 0 ? 2 : 0; }
        if (cells.length === 1) rot = B.rot;
        else B.rot = rot;
      }
      const ok = cells.map(([x, z]) => !this.machines.canPlace(def, x, z));
      const cost = ok.filter(Boolean).length * def.price;
      cells.forEach(([x, z], i) => {
        let g = this.beltGhosts[i];
        if (!g) { g = this._ghostFor('belt').clone(); this.scene.add(g); this.beltGhosts[i] = g; }
        g.visible = true; g.position.set(x + 0.5, 0.01, z + 0.5); g.rotation.y = -rot * Math.PI / 2;
        g.traverse(m => { if (m.isMesh) m.material = ok[i] && E.money >= cost ? this.ghostOk : this.ghostBad; });
      });
      const err = ok.every(v => !v) ? this.machines.canPlace(def, cx, cz) : E.money < cost ? 'Not enough money' : null;
      this.ui.renderBuild(B.sel, cells.length > 1 ? `${ok.filter(Boolean).length} belts · $${cost}` : 'Drag to lay a line', err, false);
      if (I.mouse.leftReleased && B.drag) {
        B.drag = null;
        if (E.money < cost) { this.ui.toast('Not enough money', 'bad'); this.audio.error(); return; }
        let n = 0;
        cells.forEach(([x, z], i) => { if (ok[i]) { this.machines.place('belt', x, z, rot); n++; } });
        if (n) { E.money -= n * def.price; this.audio.place(new THREE.Vector3(cx, 0.5, cz)); this._maybeHintPower(); }
      }
      return;
    }

    const err = this.machines.canPlace(def, cx, cz) || (E.money < def.price ? 'Not enough money' : null);
    const g = this._ghostFor(def.id);
    this.ghost.add(g);
    g.position.set(cx + w / 2, 0.01, cz + dd / 2); g.rotation.y = -B.rot * Math.PI / 2;
    g.traverse(m => { if (m.isMesh) m.material = err ? this.ghostBad : this.ghostOk; });
    const ring = def.id === 'pole' ? def.range : def.id === 'burner' || def.id === 'battery' ? 5 : def.id === 'digger' ? def.reach : 0;
    if (ring) { this.rangeRing.visible = true; this.rangeRing.position.set(cx + w / 2, 0.05, cz + dd / 2); this.rangeRing.scale.setScalar(ring); }
    this.ui.renderBuild(B.sel, ring ? `ring shows ${def.id === 'digger' ? 'digging reach' : 'power reach'}` : '', err, false);
    if (I.mouse.leftPressed) {
      if (err) { this.audio.error(); this.ui.toast(err, 'bad'); return; }
      E.money -= def.price;
      this.machines.place(def.id, cx, cz, B.rot);
      this.audio.place(new THREE.Vector3(cx + w / 2, 0.5, cz + dd / 2));
      this.particles.dust(new THREE.Vector3(cx + w / 2, 0.1, cz + dd / 2), [0.5, 0.48, 0.44], 10, 1);
      this._maybeHintPower();
    }
  }

  _maybeHintPower() {
    if (this._powerHinted) return;
    if (this.machines.list.some(m => m.def.power > 0) && !this.machines.list.some(m => m.def.id === 'burner')) {
      this._powerHinted = true;
      this.ui.toast('Machines need power: build a Burner and feed it junk. Poles carry the power further.');
    }
  }

  // ---------- main loop ----------
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const playing = this.mode === 'play';
    const free = playing && !this.ui.panel && this.input.locked;
    const paused = !playing || this.ui.panel === 'pause' || this.ui.panel === 'settings' || this.ui.panel === 'controls';

    if (playing) {
      this.player.update(dt, this.input, free && !this.build.on ? true : free);
      if (free) { if (this.build.on) this._buildActions(); else this._playActions(dt); }
      else { this.prompt = null; this.digProgress = 0; }
      this.player.applyCamera(this.camera, this.settings.fov);
      if (!paused) this.economy.stats.playTime += dt;
    } else {
      // slow orbit around the heap behind the menu
      const a = t * 0.04 + 1.2;
      this.camera.position.set(Math.sin(a) * 62, 16 + Math.sin(t * 0.1) * 2, Math.cos(a) * 62);
      this.camera.lookAt(0, 9, 0);
      if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
    }

    if (!paused || this.mode === 'menu') {
      const simDt = paused ? 0 : dt;
      this.sky.advance(this.mode === 'menu' ? dt * 0.1 : simDt);
      const beltSpeed = BELT_SPEED * (1 + (this.economy.upgrades.has('belt1') ? 0.4 : 0) + (this.economy.upgrades.has('belt2') ? 0.4 : 0));
      this.power.update(Math.max(simDt, 1e-4));
      this.machines.update(simDt, beltSpeed);
      this.items.update(simDt);
      this.yard.update(dt);
      this.ticket.update(simDt, this.scannerOut && free);
    }
    const focus = playing ? this.player.pos : new THREE.Vector3(0, 0, 0);
    this.sky.update(dt, focus);
    this.pile.update(dt, this.camera.position, this.renderer.preset.lod);
    // sparkle on rare finds peeking out of the heap
    for (const s of this.pile.exposedSpecials()) {
      if (s.code >= CELL_RARE || s.code === CELL_WALLET) { if (Math.random() < dt * (1 + this.sky.night * 4)) this.particles.sparkle(s.mesh.position); }
    }
    this.particles.ambient(this.camera.position, dt, 1 - this.sky.night);
    this.particles.update(dt);
    this.torch.intensity = this.torchOn ? (this.economy.upgrades.has('torch') ? 90 : 45) : 0;
    this.torch.distance = this.economy.upgrades.has('torch') ? 40 : 24;
    this.lights.update(this.camera.position);
    this.vm.visible = playing && !this.build.on;
    this._animateViewmodel(dt);
    this.audio.setListener(this.camera.position, this.player.forward());
    this.audio.ambient(dt, this.sky.night);
    if (playing) this.ui.update(dt);
    this.renderer.render(dt, t);
    this.input.endFrame();
  }

  _animateViewmodel(dt) {
    if (!this.vmTool) return;
    const p = this.digProgress, sw = Math.sin(this.swing) * (p > 0 ? 1 : 0);
    const bob = Math.sin(this.player.bob) * 0.012 * this.player.bobAmt;
    this.vm.position.set(0.42 + bob, -0.46 + Math.abs(bob) - (this.held ? 0.35 : 0), -0.78 + (this.scannerOut ? -0.05 : 0));
    this.vmTool.rotation.x = 1.55 + sw * 0.35 + (this.scannerOut ? 0.25 : 0);
    if (this.held) {
      this.heldAnchor.position.set(0.05, -0.3 + this.charge * 0.05, -0.95 + this.charge * 0.25);
      this.held.mesh.rotation.y += dt * 0.6;
    }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const game = new Game();
window.__game = game;
game.init().catch(e => {
  console.error(e);
  document.getElementById('load-text').textContent = 'Something went wrong while loading: ' + e.message;
});
