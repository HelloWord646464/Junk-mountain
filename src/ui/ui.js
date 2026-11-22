import * as THREE from 'three';
import { MATERIALS, MATERIAL_KEYS, TOOLS, BACKPACKS, SCANNERS, UPGRADES, MACHINES, RARES, JUNK_BY_KEY } from '../config.js';
import { recComp, recPrimary, recName, recComposite } from '../game/economy.js';
import { QUALITY } from '../engine/renderer.js';

const $ = id => document.getElementById(id);
const money = v => '$' + (Math.abs(v) >= 1e4 ? Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game) {
    this.game = game;
    this.panel = null;           // name of the open panel
    this.floaters = [];
    this.shopTab = 'tools';
    this._buildCompass();
    this._wireMenu();
    addEventListener('keydown', e => this._panelKey(e, true));
    addEventListener('keyup', e => this._panelKey(e, false));
  }

  // ---------- loading & menu ----------
  setLoading(p, text) { $('load-fill').style.width = `${Math.round(p * 100)}%`; if (text) $('load-text').textContent = text; }
  showMenu() {
    $('loading').hidden = true; $('hud').hidden = true; $('build-bar').hidden = true; $('panel').hidden = true;
    $('menu').hidden = false;
    $('btn-continue').hidden = !this.game.hasSave();
    $('btn-continue').textContent = this.game.started ? 'Resume' : 'Continue';
    $('btn-quit').hidden = !window.desktop?.isApp;
    $('confirm-new').hidden = true;
    this.panel = 'menu';
  }
  _wireMenu() {
    $('btn-continue').onclick = () => { this.game.audio.start(); this.game.continueGame(); };
    $('btn-new').onclick = () => {
      this.game.audio.start();
      if (this.game.hasSave()) $('confirm-new').hidden = false; else this.game.newGame();
    };
    $('btn-new-yes').onclick = () => this.game.newGame();
    $('btn-new-no').onclick = () => { $('confirm-new').hidden = true; };
    $('btn-settings').onclick = () => this.openSettings(true);
    $('btn-controls').onclick = () => this.openControls(true);
    $('btn-quit').onclick = () => { this.game.save(); window.desktop?.quit(); };
  }
  enterPlay() {
    $('menu').hidden = true; $('hud').hidden = false; $('panel').hidden = true;
    this.panel = null;
  }

  // ---------- toasts, floating money ----------
  toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = msg;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 3200);
  }
  floatMoney(amount, pos, label) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.innerHTML = `+${money(amount)}${label ? `<small>${esc(label)}</small>` : ''}`;
    $('floaters').appendChild(el);
    this.floaters.push({ el, pos: pos ? pos.clone() : null, t: 0 });
  }
  bumpMoney() { const m = $('money'); m.classList.add('bump'); clearTimeout(this._bt); this._bt = setTimeout(() => m.classList.remove('bump'), 150); }

  _buildCompass() {
    const pts = ['N', '15', '30', 'NE', '60', '75', 'E', '105', '120', 'SE', '150', '165', 'S', '195', '210', 'SW', '240', '255', 'W', '285', '300', 'NW', '330', '345'];
    const html = [...pts, ...pts, ...pts].map(p => `<span class="${/^[NSEW]/.test(p) ? 'major' : ''}">${/^[NSEW]/.test(p) ? p : '·'}</span>`).join('');
    $('compass-strip').innerHTML = html;
  }

  // ---------- per-frame HUD ----------
  update(dt) {
    const g = this.game, E = g.economy;
    $('money').textContent = money(E.money);
    $('clock-time').textContent = g.sky.timeString;
    $('clock-day').textContent = `Day ${g.sky.day}`;
    // compass: yaw 0 = facing north (-z)
    const heading = ((-g.player.yaw * 180 / Math.PI) % 360 + 360) % 360;
    $('compass-strip').style.transform = `translateX(${210 - 60 * 24 - (heading / 15) * 60 - 30}px)`;
    // backpack
    const kg = E.backpackKg(), cap = E.backpackCap();
    $('pack-text').textContent = `${kg.toFixed(0)} / ${cap} kg`;
    $('pack-fill').style.width = `${Math.min(100, kg / cap * 100)}%`;
    $('pack-fill').classList.toggle('full', kg >= cap - 0.5);
    $('tool-name').textContent = g.scannerOut ? (g.ticket.bestScanner()?.name || '') : E.toolDef.name;
    $('held').hidden = !g.held;
    if (g.held) $('held').textContent = `Holding: ${recName(g.held.rec)} (${g.held.rec.mass} kg)`;
    // power
    const P = g.power.totals;
    $('power-box').hidden = !P.hasGrid;
    if (P.hasGrid) {
      $('pw-text').textContent = `${P.gen.toFixed(1)} / ${P.demand.toFixed(0)} kW`;
      const f = P.demand > 0 ? Math.min(1, (P.gen + (P.cap ? 1e-9 : 0)) / P.demand) : 1;
      $('pw-fill').style.width = `${Math.min(100, P.demand ? P.gen / P.demand * 100 : (P.gen > 0 ? 100 : 0))}%`;
      $('pw-fill').style.background = P.factor >= 0.99 ? 'var(--good)' : P.factor > 0.4 ? 'var(--hazard)' : 'var(--bad)';
      $('bat-row').hidden = $('bat-bar-wrap').hidden = !P.cap;
      if (P.cap) { $('bat-text').textContent = `${Math.round(P.stored / P.cap * 100)}%`; $('bat-fill').style.width = `${P.stored / P.cap * 100}%`; }
    }
    // prompt
    const pr = g.prompt;
    $('prompt').hidden = !pr;
    if (pr && this._lastPrompt !== pr) { $('prompt').innerHTML = pr; this._lastPrompt = pr; }
    // dig / throw rings
    $('dig-ring').style.opacity = g.digProgress > 0 ? 1 : 0;
    $('dig-ring').style.setProperty('--p', g.digProgress);
    $('charge-ring').style.opacity = g.charge > 0 ? 1 : 0;
    $('charge-ring').style.setProperty('--p', g.charge);
    // detector
    const sc = g.scannerOut && g.ticket.bestScanner();
    $('detector').hidden = !sc;
    if (sc) {
      $('det-fill').style.width = `${g.ticket.signal * 100}%`;
      $('det-dist').textContent = sc.key === 'deep' && g.ticket.signal > 0 ? `~${g.ticket.distance.toFixed(1)} m` : g.ticket.signal > 0 ? 'Signal!' : 'No signal';
    }
    // hints
    const hints = [];
    hints.push(['Dig', 'LMB'], ['Pick up / drop', 'RMB'], ['Take from backpack', 'Q']);
    if (E.scanners.size) hints.push([g.scannerOut ? 'Put away scanner' : 'Scanner', '2']);
    if (E.scanners.has('xray')) hints.push(['X-ray', 'X']);
    hints.push(['Head torch', 'F'], ['Build', 'B'], ['Journal', 'Tab']);
    const hk = hints.map(h => h.join()).join('|');
    if (hk !== this._hk) { this._hk = hk; $('hud-br').innerHTML = hints.map(([a, k]) => `<div>${a}<kbd>${k}</kbd></div>`).join(''); }
    // floaters
    const cam = g.camera;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.t += dt;
      let x = innerWidth / 2, y = innerHeight * 0.42;
      if (f.pos) {
        const v = f.pos.clone(); v.y += 0.6 + f.t * 0.8; v.project(cam);
        if (v.z > 1) f.hidden = true; else { f.hidden = false; x = (v.x * 0.5 + 0.5) * innerWidth; y = (-v.y * 0.5 + 0.5) * innerHeight; }
      } else y -= f.t * 40;
      f.el.style.left = x + 'px'; f.el.style.top = y + 'px';
      f.el.style.opacity = f.hidden ? 0 : Math.max(0, 1 - Math.max(0, f.t - 1.2) / 0.6);
      if (f.t > 1.8) { f.el.remove(); this.floaters.splice(i, 1); }
    }
    if (this.panel === 'sort') this._sortTick(dt);
  }

  // ---------- generic panel ----------
  openPanel(name, html, { fromMenu = false } = {}) {
    this.panel = name;
    this.fromMenu = fromMenu;
    $('panel').hidden = false;
    $('panel-box').innerHTML = html;
    if (!fromMenu) this.game.pauseInput(true);
  }
  closePanel() {
    const wasMenu = this.fromMenu;
    $('panel').hidden = true;
    $('panel-box').innerHTML = '';
    this.panel = null;
    if (wasMenu) { this.showMenu(); return; }
    this.game.pauseInput(false);
  }
  _close(btn = 'Close') { return `<button class="btn small" data-close>${btn} <span style="opacity:.6">Esc</span></button>`; }
  _bindClose() { $('panel-box').querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.closePanel()); }

  _panelKey(e, down) {
    if (!this.panel || this.panel === 'menu') return;
    if (down && (e.code === 'Escape' || (e.code === 'Tab' && this.panel === 'journal') || (e.code === 'KeyE' && this.panel === 'shop'))) {
      e.preventDefault();
      if (this.panel === 'pause') { this.closePanel(); return; }
      this.closePanel(); return;
    }
    if (this.panel === 'sort') this._sortKey(e, down);
  }

  // ---------- pause, settings, controls ----------
  openPause() {
    this.openPanel('pause', `<div class="ph"><h2>Paused</h2><span class="cash">${money(this.game.economy.money)}</span></div>
      <div class="pb"><div class="menu-buttons" style="width:320px">
        <button class="btn primary" data-close>Resume</button>
        <button class="btn" id="p-settings">Settings</button>
        <button class="btn" id="p-controls">Controls</button>
        <button class="btn" id="p-save">Save game</button>
        <button class="btn" id="p-menu">Save &amp; exit to menu</button>
      </div></div>`);
    this._bindClose();
    $('p-settings').onclick = () => this.openSettings();
    $('p-controls').onclick = () => this.openControls();
    $('p-save').onclick = () => { this.game.save(); this.toast('Game saved', 'good'); };
    $('p-menu').onclick = () => { this.game.save(); this.closePanel(); this.game.toMenu(); };
  }

  openSettings(fromMenu = false) {
    const s = this.game.settings;
    const opts = Object.entries(QUALITY).map(([k, v]) => `<option value="${k}" ${k === s.quality ? 'selected' : ''}>${v.label}</option>`).join('');
    this.openPanel('settings', `<div class="ph"><h2>Settings</h2>${this._close('Done')}</div>
      <div class="pb settings">
        <label>Graphics <select id="s-q">${opts}</select><output></output></label>
        <label>Field of view <input id="s-fov" type="range" min="60" max="100" value="${s.fov}"><output>${s.fov}</output></label>
        <label>Mouse sensitivity <input id="s-sens" type="range" min="0.2" max="3" step="0.05" value="${s.sens}"><output>${s.sens.toFixed(2)}</output></label>
        <label>Volume <input id="s-vol" type="range" min="0" max="1" step="0.05" value="${s.volume}"><output>${Math.round(s.volume * 100)}%</output></label>
        ${window.desktop?.isApp ? `<label>Fullscreen <select id="s-fs"><option value="0">Windowed</option><option value="1" ${s.fullscreen ? 'selected' : ''}>Fullscreen</option></select><output></output></label>` : ''}
        <p class="section-title" style="margin-top:6px">Ultra adds sharper shadows, more detail at distance and extra resolution.</p>
      </div>`, { fromMenu });
    this._bindClose();
    const upd = () => this.game.applySettings();
    $('s-q').onchange = e => { s.quality = e.target.value; upd(); };
    $('s-fov').oninput = e => { s.fov = +e.target.value; e.target.nextElementSibling.textContent = s.fov; upd(); };
    $('s-sens').oninput = e => { s.sens = +e.target.value; e.target.nextElementSibling.textContent = s.sens.toFixed(2); upd(); };
    $('s-vol').oninput = e => { s.volume = +e.target.value; e.target.nextElementSibling.textContent = Math.round(s.volume * 100) + '%'; upd(); };
    if ($('s-fs')) $('s-fs').onchange = e => { s.fullscreen = e.target.value === '1'; upd(); };
  }

  openControls(fromMenu = false) {
    const rows = [['W A S D', 'Walk'], ['Shift', 'Sprint'], ['Space', 'Jump'], ['Left mouse', 'Dig (hold) · throw when holding something (hold to charge)'],
      ['Right mouse', 'Pick up loose junk / drop what you’re holding'], ['Q', 'Take an item out of your backpack to throw'], ['E', 'Use: scale, sorting table, computer, hopper, burner'],
      ['B', 'Build mode'], ['R', 'Rotate (build mode)'], ['X', 'Demolish (build mode) · X-ray goggles (otherwise)'], ['1 – 9, 0', 'Pick a machine (build mode)'],
      ['2', 'Scanner'], ['F', 'Head torch'], ['Tab', 'Journal: clues and collection'], ['Esc', 'Pause'], ['F11', 'Fullscreen (desktop app)']];
    this.openPanel('controls', `<div class="ph"><h2>Controls</h2>${this._close('Done')}</div>
      <div class="pb"><div class="keys">${rows.map(([k, v]) => `<div><kbd>${k}</kbd></div><div>${v}</div>`).join('')}</div></div>`, { fromMenu });
    this._bindClose();
  }

  // ---------- shop ----------
  openShop() {
    this.openPanel('shop', '');
    this._renderShop();
  }
  _renderShop() {
    const E = this.game.economy, T = this.shopTab;
    const tab = (k, n) => `<button class="tab ${T === k ? 'on' : ''}" data-tab="${k}">${n}</button>`;
    let cards = '';
    const card = ({ title, desc, price, owned, action, label = 'Buy', img, tag }) => `<div class="card ${owned ? 'owned' : ''}">
      ${img ? `<img src="${img}" alt="">` : ''}<h3>${esc(title)}</h3><p>${esc(desc)}</p>
      <div class="row">${owned ? `<span class="tag">${tag || 'Owned'}</span>` : `<span class="price">${money(price)}</span>`}
      ${action ? `<button class="btn small" data-act="${action}" ${!owned && E.money < price ? 'disabled' : ''}>${label}</button>` : ''}</div></div>`;
    if (T === 'tools') {
      cards = TOOLS.map((t, i) => {
        const own = E.toolsOwned.has(t.key);
        return card({ title: t.name, desc: `${t.desc} ${t.radius ? 'Clears several items per swing.' : ''}`, price: t.price, owned: own, img: this.game.thumbs[t.model],
          action: own ? (E.tool === i ? null : `equip:${i}`) : `tool:${i}`, label: own ? 'Use' : 'Buy', tag: E.tool === i ? 'In hand' : 'Owned' });
      }).join('');
    } else if (T === 'gear') {
      cards = BACKPACKS.map((b, i) => card({ title: b.name, desc: `Carries ${b.cap} kg of junk.`, price: b.price, owned: E.pack >= i, action: i === E.pack + 1 ? `pack:${i}` : null })).join('');
      cards += UPGRADES.map(u => card({ title: u.name, desc: u.desc, price: u.price, owned: E.upgrades.has(u.key), action: (!u.req || E.upgrades.has(u.req)) && !E.upgrades.has(u.key) ? `up:${u.key}` : null })).join('');
    } else if (T === 'scan') {
      cards = SCANNERS.map(s => card({ title: s.name, desc: s.desc, price: s.price, owned: E.scanners.has(s.key), img: s.key === 'detector' ? this.game.thumbs.metal_detector : null, action: E.scanners.has(s.key) ? null : `scan:${s.key}` })).join('');
    } else {
      cards = MACHINES.map(m => card({ title: m.name, desc: `${m.desc}${m.power ? ` Uses ${m.power} kW.` : ''}${m.gen ? ` Makes up to ${m.gen} kW.` : ''}`, price: m.price, owned: false })).join('');
    }
    $('panel-box').innerHTML = `<div class="ph"><h2>Yard computer</h2><span class="cash">${money(E.money)}</span>${this._close()}</div>
      <div class="pb"><div class="tabs">${tab('tools', 'Tools')}${tab('gear', 'Gear & upgrades')}${tab('scan', 'Scanners')}${tab('machines', 'Machines')}</div>
      ${T === 'machines' ? '<p class="section-title">Machines are bought and placed in build mode: press B.</p>' : ''}
      <div class="grid-cards">${cards}</div></div>`;
    this._bindClose();
    $('panel-box').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { this.shopTab = b.dataset.tab; this.game.audio.click(); this._renderShop(); });
    $('panel-box').querySelectorAll('[data-act]').forEach(b => b.onclick = () => { this._buy(b.dataset.act); this._renderShop(); });
  }
  _buy(act) {
    const E = this.game.economy, [kind, v] = act.split(':');
    const done = name => { this.game.audio.cash(null); this.toast(`Bought: ${name}`, 'good'); };
    if (kind === 'equip') { E.tool = +v; this.game.refreshViewmodel(); this.game.audio.click(); return; }
    if (kind === 'tool') { const t = TOOLS[+v]; if (E.spend(t.price)) { E.toolsOwned.add(t.key); E.tool = +v; this.game.refreshViewmodel(); done(t.name); } }
    if (kind === 'pack') { const b = BACKPACKS[+v]; if (E.spend(b.price)) { E.pack = +v; done(b.name); } }
    if (kind === 'up') { const u = UPGRADES.find(x => x.key === v); if (E.spend(u.price)) { E.upgrades.add(u.key); done(u.name); } }
    if (kind === 'scan') { const s = SCANNERS.find(x => x.key === v); if (E.spend(s.price)) { E.scanners.add(s.key); done(s.name); this.toast(s.key === 'xray' ? 'Press X to toggle the goggles' : 'Press 2 to use the scanner'); } }
    this.game.save();
  }

  // ---------- sorting table ----------
  openSorting() {
    const E = this.game.economy;
    this.sort = { combo: 0, lastT: 0, hold: 0, holding: false, flash: null };
    this.openPanel('sort', '');
    this._renderSort();
    if (!E.backpack.length) this.toast('Your backpack is empty: dig some junk, then come back to sort it.');
  }
  _renderSort() {
    const E = this.game.economy, cur = E.backpack[0];
    const thumb = r => r.kind === 'chunk' ? this.game.thumbs['chunk:' + r.mat] : this.game.thumbs[JUNK_BY_KEY[r.key].model];
    const comp = r => Object.entries(recComp(r)).map(([m, f]) => `<span style="color:${MATERIALS[m].color};border-color:${MATERIALS[m].color}">${MATERIALS[m].short} ${Math.round(f * 100)}%</span>`).join('');
    const queue = E.backpack.slice(0, 30).map(r => `<div class="qi"><span>${esc(recName(r))}</span><span>${r.mass} kg</span></div>`).join('') || '<p class="section-title">Empty</p>';
    const item = cur ? `<div class="sort-item" id="sort-item"><img src="${thumb(cur)}" alt="">
        <div><h3>${esc(recName(cur))}</h3><div class="mass">${cur.mass} kg · worth ${money(this.game.economy.value(cur, true))} sorted</div><div class="comp">${comp(cur)}</div>
        ${recComposite(cur) ? `<div class="dismantle">Made of several materials: hold <kbd>E</kbd> to take it apart</div><div class="dbar"><div id="dbar"></div></div>` : `<div class="dismantle" style="color:var(--muted)">Press the number of the right bin</div>`}</div></div>`
      : `<div class="sort-item"><div></div><div><h3>All sorted</h3><div class="mass">Ship the bins to get paid, or go dig some more.</div></div></div>`;
    const bins = MATERIAL_KEYS.map(k => { const b = E.bins[k], m = MATERIALS[k];
      return `<div class="bin" data-bin="${k}"><div class="bk" style="background:${m.color}">${m.key}</div><div class="bn">${m.short}</div><div class="bkg">${b.kg.toFixed(1)} kg · ${money(E.binValue(k))}</div>${b.bad > 0 ? `<div class="bad">${b.bad.toFixed(1)} kg wrong</div>` : ''}</div>`; }).join('');
    $('panel-box').innerHTML = `<div class="ph"><h2>Sorting table</h2><span class="cash">${money(E.money)}</span>${this._close('Done')}</div>
      <div class="pb"><div class="sort-wrap"><div><p class="section-title">Backpack (${E.backpack.length})</p><div class="sort-queue">${queue}</div></div>
      <div class="sort-stage">${item}<div class="bins">${bins}</div>
      <div class="sort-foot"><span class="combo">${this.sort.combo > 1 ? `Combo ×${this.sort.combo}` : ''}</span>
      <span class="section-title">Wrong bins lower that bin's price. Sorted junk sells for up to 12× more.</span>
      <button class="btn primary small" id="ship" ${E.binsValue() <= 0 ? 'disabled' : ''}>Ship bins for ${money(E.binsValue())}</button></div></div></div></div>`;
    this._bindClose();
    $('panel-box').querySelectorAll('[data-bin]').forEach(b => b.onclick = () => this._sortInto(b.dataset.bin));
    $('ship').onclick = () => { this.game.economy.shipBins(); this._renderSort(); this.game.save(); };
    if (this.sort.flash) { const el = $('sort-item'); if (el) { el.classList.add(this.sort.flash); setTimeout(() => el.classList.remove(this.sort.flash), 220); } this.sort.flash = null; }
  }
  _sortKey(e, down) {
    if (e.code === 'KeyE') { this.sort.holding = down; if (!down) this.sort.hold = 0; return; }
    if (!down) return;
    const n = +e.key;
    if (n >= 1 && n <= 7) this._sortInto(MATERIAL_KEYS[n - 1]);
    if (e.code === 'Enter') $('ship')?.click();
  }
  _sortInto(k) {
    const E = this.game.economy, cur = E.backpack[0];
    if (!cur) return;
    if (recComposite(cur)) {
      const el = $('sort-item'); el?.classList.remove('shake'); void el?.offsetWidth; el?.classList.add('shake');
      this.game.audio.error(); return;
    }
    E.backpack.shift();
    const right = recPrimary(cur) === k;
    E.bins[k].kg += cur.mass;
    const now = performance.now() / 1000;
    if (right) {
      this.sort.combo = now - this.sort.lastT < 2 ? this.sort.combo + 1 : 1;
      if (this.sort.combo > 2) E.earn(0.25 * Math.min(10, this.sort.combo), null, `Combo ×${this.sort.combo}`);
      this.game.audio.impact(k, null, 0.6);
      this.sort.flash = 'flash-good';
    } else {
      E.bins[k].bad += cur.mass; this.sort.combo = 0;
      this.game.audio.error();
      this.sort.flash = 'flash-bad';
      this.toast(`That was ${MATERIALS[recPrimary(cur)].name.toLowerCase()}`, 'bad');
    }
    this.sort.lastT = now;
    this._renderSort();
  }
  _sortTick(dt) {
    const E = this.game.economy, cur = E.backpack[0];
    if (!cur || !recComposite(cur)) return;
    if (this.sort.holding) {
      this.sort.hold += dt;
      if ($('dbar')) $('dbar').style.width = `${Math.min(100, this.sort.hold / 1.1 * 100)}%`;
      if (Math.random() < dt * 10) this.game.audio.impact(recPrimary(cur), null, 0.25);
      if (this.sort.hold >= 1.1) {
        this.sort.hold = 0;
        E.backpack.shift();
        const parts = Object.entries(recComp(cur)).map(([m, f]) => ({ kind: 'chunk', mat: m, mass: +(cur.mass * f).toFixed(2) }));
        E.backpack.unshift(...parts);
        this.game.audio.impact('metal', null, 1);
        this._renderSort();
      }
    }
  }

  // ---------- journal ----------
  openJournal() {
    const g = this.game, T = g.ticket, E = g.economy;
    const clips = T.journal.map(c => `<div class="clip"><h4>${esc(c.title)}</h4><p>${esc(c.body)}</p></div>`).join('') || '<p class="section-title">No clues yet. Old newspapers turn up in the heap: keep digging.</p>';
    const coll = RARES.map(r => `<div class="coll ${T.rares.has(r.key) ? '' : 'missing'}"><img src="${g.thumbs[r.model]}" alt=""><span>${T.rares.has(r.key) ? esc(r.name) : '???'}</span></div>`).join('');
    const pct = g.pile.removedCount / Math.max(1, g.pile.totalCells) * 100;
    const st = [['Money earned', money(E.stats.earned)], ['Junk dug', E.stats.dug.toLocaleString()], ['Sold', `${Math.round(E.stats.kgSold).toLocaleString()} kg`],
      ['Burned', `${Math.round(E.stats.burned).toLocaleString()} kg`], ['Heap cleared', `${pct.toFixed(1)}%`], ['Clues', `${T.cluesFound} / 6`], ['Time played', `${Math.floor(E.stats.playTime / 3600)}h ${Math.floor(E.stats.playTime / 60) % 60}m`]];
    this.openPanel('journal', `<div class="ph"><h2>Journal</h2>${this._close()}</div>
      <div class="pb journal"><div><p class="section-title">Clues about the ticket</p><div class="clips">${clips}</div></div>
      <div style="display:grid;gap:18px;align-content:start"><div><p class="section-title">Rare finds (${T.rares.size} / ${RARES.length})</p><div class="collection">${coll}</div></div>
      <div><p class="section-title">Stats</p><div class="stats">${st.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div></div></div></div>`);
    this._bindClose();
  }

  // ---------- popups ----------
  popup(html, cls = '') {
    this.game.pauseInput(true);
    this.panel = 'popup';
    $('popup').hidden = false;
    $('popup').innerHTML = `<div class="pop ${cls}">${html}<div><button class="btn primary" id="pop-ok" style="justify-self:center">Continue</button></div></div>`;
    const close = () => { $('popup').hidden = true; this.panel = null; this.game.pauseInput(false); removeEventListener('keydown', key); };
    const key = e => { if (['Enter', 'Escape', 'Space', 'KeyE'].includes(e.code)) { e.preventDefault(); close(); } };
    setTimeout(() => addEventListener('keydown', key), 400);
    $('pop-ok').onclick = close;
  }
  popClue(c, n) {
    this.popup(`<div class="eyebrow">Clue ${n} of 6 · Old newspaper</div><div class="clip"><h4>${esc(c.title)}</h4><p>${esc(c.body)}</p></div><div class="hint">Saved in your journal (Tab).</div>`);
  }
  popRare(r) {
    this.popup(`<div class="eyebrow">Rare find</div><h2>${esc(r.name)}</h2><img src="${this.game.thumbs[r.model]}" alt=""><div class="big">+${money(r.value)}</div><div class="hint">Added to your collection (Tab).</div>`);
  }
  popWin(stats) {
    this.popup(`<div class="eyebrow">You found the wallet</div><h2>Jackpot!</h2><div class="big">$4,200,000</div>
      <p>Inside the brown wallet, folded behind an old bus pass: the winning ticket. The yard is yours to keep running.</p>
      <div class="stats">${stats.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>`, 'win');
  }

  // ---------- build bar ----------
  showBuild(show) { $('build-bar').hidden = !show; $('hud-br').style.visibility = show ? 'hidden' : 'visible'; $('hud-bl').style.visibility = show ? 'hidden' : 'visible'; }
  renderBuild(sel, info, error, demolish) {
    const E = this.game.economy;
    const k = MACHINES.map((m, i) => `<div class="bcard ${i === sel && !demolish ? 'sel' : ''} ${E.money < m.price ? 'poor' : ''}"><span class="k">${i < 10 ? (i + 1) % 10 : ''}</span><span class="n">${m.name}</span><span class="p">${money(m.price)}</span><span class="w">${m.gen ? `+${m.gen} kW` : m.power ? `${m.power} kW` : m.id === 'battery' ? 'storage' : m.id === 'pole' ? `${m.range} m reach` : ''}</span></div>`).join('');
    const key = `${sel}|${demolish}|${Math.floor(E.money)}`;
    if (key !== this._bk) { this._bk = key; $('build-cards').innerHTML = k; }
    $('build-info').innerHTML = (demolish ? `<b>Demolish</b>: aim at a machine and click to remove it (75% refund). <kbd>X</kbd> back to building` : `<b>${MACHINES[sel].name}</b>: ${esc(MACHINES[sel].desc)}`) +
      (error ? ` <span class="err">· ${esc(error)}</span>` : '') + `<br><span style="color:var(--muted);font-size:15px">LMB place · R rotate · wheel or 1–0 choose · X demolish · B or Esc exit${info ? ' · ' + info : ''}</span>`;
  }
}
