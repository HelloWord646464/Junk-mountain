import * as THREE from 'three';
import { YARD } from '../config.js';
import { hazardTexture, signTexture, radialFade, labelTexture, screenTexture } from './textures.js';
import { MATERIALS, MATERIAL_KEYS } from '../config.js';

export const LAYOUT = {
  trailer: { x: -27, z: 64.5, w: 11, d: 3.6 },
  terminal: { x: -23.2, z: 61.9 },
  door: { x: -25.2, z: 62.6 },
  sortTable: { x: -11, z: 61.5, w: 5.2, d: 1.3 },
  scale: { x0: 9, z0: 57, w: 6, d: 5 },
  start: { x: 0, z: 50, yaw: 0 },
};

// Box with UVs scaled to world size so tiled textures keep their scale.
export function boxUV(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}

export class Yard {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.colliders = [];        // THREE.Box3 list (static + machines)
    this.interactables = [];
    this.fires = [];
    this.windows = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  addCollider(minX, minY, minZ, maxX, maxY, maxZ, tag) {
    const b = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    b.tag = tag;
    this.colliders.push(b);
    return b;
  }
  removeCollider(b) { const i = this.colliders.indexOf(b); if (i >= 0) this.colliders.splice(i, 1); }

  colliderAround(obj, pad = 0, tag) {
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    return this.addCollider(b.min.x - pad, b.min.y, b.min.z - pad, b.max.x + pad, b.max.y, b.max.z + pad, tag);
  }

  place(id, size, x, z, rotY = 0, { collide = true, y = 0, pad = 0 } = {}) {
    const o = this.game.assets.instance(id, size, { bottom: true });
    o.position.set(x, y, z); o.rotation.y = rotY;
    this.group.add(o);
    if (collide) this.colliderAround(o, pad);
    return o;
  }

  build() {
    const A = this.game.assets;
    this._ground(A);
    this._walls(A);
    this._trailer(A);
    this._sortingTable(A);
    this._scale(A);
    this._props(A);
    this._outside(A);
  }

  _ground(A) {
    const gravel = A.pbr('gravel_ground_01', { repeat: [90, 90], metalness: 0, normalScale: 1.2 });
    gravel.color.set(0xc2ad8e); gravel.envMapIntensity = 0.35;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), gravel);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.group.add(ground);

    const pad = A.pbr('concrete_floor_worn_001', { repeat: [116 / 6, 42 / 6], metalness: 0, color: 0xd6c8b0 });
    pad.envMapIntensity = 0.35;
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(116, 42), pad);
    slab.rotation.x = -Math.PI / 2; slab.position.set(0, 0.012, 54); slab.receiveShadow = true;
    this.group.add(slab);

    // packed mud under and around the heap, fading out at the edges
    const mud = A.pbr('brown_mud_dry', { repeat: [14, 14], metalness: 0 });
    mud.envMapIntensity = 0.35;
    mud.alphaMap = radialFade(); mud.transparent = true; mud.depthWrite = false;
    mud.polygonOffset = true; mud.polygonOffsetFactor = -2;
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(76, 76), mud);
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; disc.receiveShadow = true;
    this.group.add(disc);
  }

  _walls(A) {
    const mat = A.pbr('rusty_corrugated_iron', { metalness: 0.6 });
    const post = A.pbr('rusty_metal_02', { metalness: 1 });
    const H = 3.4, T = 0.12;
    const wall = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(boxUV(len, H, T, 3), mat);
      m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
      m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      this.addCollider(Math.min(x0, x1) - 0.3, 0, Math.min(z0, z1) - 0.3, Math.max(x0, x1) + 0.3, H, Math.max(z0, z1) + 0.3, 'wall');
      for (let t = 0; t <= len; t += 6) {
        const p = new THREE.Mesh(boxUV(0.18, H + 0.3, 0.18, 1), post);
        p.position.set(x0 + (x1 - x0) * t / len, (H + 0.3) / 2, z0 + (z1 - z0) * t / len);
        p.castShadow = true; this.group.add(p);
      }
    };
    const { minX, maxX, minZ, maxZ } = YARD;
    wall(minX, minZ, maxX, minZ);
    wall(maxX, minZ, maxX, maxZ);
    wall(minX, minZ, minX, maxZ);
    wall(minX, maxZ, -7, maxZ);
    wall(7, maxZ, maxX, maxZ);
    // swung-open gate
    const gate = this.place('large_iron_gate', 7, 10.2, maxZ + 3.2, Math.PI / 2 - 0.25, { collide: false });
    this.colliderAround(gate);
    // sign over the entrance
    const signMat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.7, metalness: 0.1 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), signMat);
    sign.position.set(0, 6.2, maxZ + 0.2); sign.rotation.y = Math.PI;
    this.group.add(sign);
    const sign2 = sign.clone(); sign2.rotation.y = 0; sign2.position.z = maxZ + 0.1; this.group.add(sign2);
    for (const sx of [-6.8, 6.8]) {
      const p = new THREE.Mesh(boxUV(0.35, 7.4, 0.35, 1), post);
      p.position.set(sx, 3.7, maxZ); p.castShadow = true; this.group.add(p);
      this.addCollider(sx - 0.3, 0, maxZ - 0.3, sx + 0.3, 7.4, maxZ + 0.3);
    }
    const beam = new THREE.Mesh(boxUV(14, 0.35, 0.35, 1), post);
    beam.position.set(0, 7.3, maxZ); beam.castShadow = true; this.group.add(beam);
  }

  _trailer(A) {
    const T = LAYOUT.trailer;
    const body = A.pbr('box_profile_metal_sheet', { metalness: 0.3, color: 0xd8cfb8 });
    const g = new THREE.Group(); g.position.set(T.x, 0, T.z); this.group.add(g);
    const shell = new THREE.Mesh(boxUV(T.w, 2.7, T.d, 2), body);
    shell.position.y = 0.55 + 1.35; shell.castShadow = shell.receiveShadow = true; g.add(shell);
    const roofMat = A.pbr('rusty_metal_02', { metalness: 1 });
    const roof = new THREE.Mesh(boxUV(T.w + 0.4, 0.14, T.d + 0.5, 2), roofMat);
    roof.position.y = 3.3; roof.castShadow = true; g.add(roof);
    const conc = A.pbr('concrete_floor_worn_001', { metalness: 0 });
    for (const bx of [-4.5, -1.5, 1.5, 4.5]) { const b = new THREE.Mesh(boxUV(0.6, 0.55, T.d - 0.4, 1), conc); b.position.set(bx, 0.275, 0); b.castShadow = true; g.add(b); }
    this.addCollider(T.x - T.w / 2 - 0.2, 0, T.z - T.d / 2 - 0.2, T.x + T.w / 2 + 0.2, 3.4, T.z + T.d / 2 + 0.2, 'trailer');

    // windows facing the yard (north side, -z)
    const frameMat = A.pbr('metal_plate', { color: 0x4b4b48 });
    for (const wx of [-3.8, 0.4, 3.6]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.95), new THREE.MeshStandardMaterial({ color: 0x1b2224, roughness: 0.08, metalness: 0.6, emissive: 0xffb466, emissiveIntensity: 0 }));
      win.position.set(wx, 2.15, -T.d / 2 - 0.02); win.rotation.y = Math.PI; g.add(win);
      this.windows.push(win.material);
      const fr = new THREE.Mesh(boxUV(1.75, 1.1, 0.06, 1), frameMat); fr.position.set(wx, 2.15, -T.d / 2 + 0.01); g.add(fr);
    }
    // door, steps and awning
    const doorX = LAYOUT.door.x - T.x;
    const door = new THREE.Mesh(boxUV(0.95, 2.05, 0.06, 1), A.pbr('painted_metal_shutter', { color: 0x5d7f86 }));
    door.position.set(doorX, 1.6, -T.d / 2 - 0.03); g.add(door);
    for (let s = 0; s < 2; s++) {
      const st = new THREE.Mesh(boxUV(1.3, 0.22, 0.45, 1), A.pbr('metal_grate_rusty', { metalness: 1 }));
      st.position.set(doorX, 0.11 + s * 0.22, -T.d / 2 - 0.25 - (1 - s) * 0.45); st.castShadow = st.receiveShadow = true; g.add(st);
    }
    const awn = new THREE.Mesh(boxUV(2.2, 0.06, 1.3, 1.5), A.pbr('corrugated_iron_02', { metalness: 0.8 }));
    awn.position.set(doorX, 2.95, -T.d / 2 - 0.6); awn.rotation.x = -0.15; awn.castShadow = true; g.add(awn);
    const lamp = this.place('security_light', 0.45, LAYOUT.door.x + 0.9, T.z - T.d / 2 - 0.15, Math.PI, { collide: false, y: 2.6 });
    this.game.lights.add({ type: 'point', pos: new THREE.Vector3(LAYOUT.door.x + 0.9, 2.5, T.z - T.d / 2 - 0.8), color: 0xffc98a, distance: 14, intensity: () => this.game.sky.night * 25 });
    // A/C and sign
    this.place('exterior_aircon_unit', 1.0, T.x + 3.5, T.z - T.d / 2 - 0.45, Math.PI);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.9), new THREE.MeshStandardMaterial({ map: labelTexture('YARD OFFICE', '#20343a', '#f3e7c9', 1024, 200), roughness: 0.6 }));
    board.position.set(T.x + 1.8, 3.75, T.z - T.d / 2 - 0.05); board.rotation.y = Math.PI; this.group.add(board);
    const bpost = new THREE.Mesh(boxUV(4.8, 0.08, 0.08, 1), roofMat); bpost.position.copy(board.position).add(new THREE.Vector3(0, -0.48, 0.02)); this.group.add(bpost);

    // shop terminal kiosk
    const K = LAYOUT.terminal;
    const kiosk = new THREE.Group(); kiosk.position.set(K.x, 0, K.z); kiosk.rotation.y = Math.PI; this.group.add(kiosk);
    const kMat = A.pbr('painted_metal_shutter', { color: 0xe0a92a });
    const kb = new THREE.Mesh(boxUV(0.7, 1.15, 0.5, 1), kMat); kb.position.y = 0.575; kb.castShadow = true; kiosk.add(kb);
    const head = new THREE.Mesh(boxUV(0.8, 0.6, 0.35, 1), kMat); head.position.set(0, 1.45, 0.05); head.rotation.x = 0.35; head.castShadow = true; kiosk.add(head);
    this.screenTex = screenTexture(['YARD-OS v2', '> SHOP', '> UPGRADES', '[E] LOG IN']);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshStandardMaterial({ map: this.screenTex, emissive: 0xffffff, emissiveMap: this.screenTex, emissiveIntensity: 1.3, roughness: 0.2 }));
    scr.position.set(0, 1.47, -0.13); scr.rotation.set(0.35, Math.PI, 0); kiosk.add(scr);
    this.addCollider(K.x - 0.45, 0, K.z - 0.35, K.x + 0.45, 1.8, K.z + 0.35);

    this.interactables.push({ id: 'shop', pos: new THREE.Vector3(K.x, 1.4, K.z), radius: 2.2, prompt: () => 'Use yard computer (shop)', action: () => this.game.ui.openShop() });
    this.interactables.push({ id: 'sleep', pos: new THREE.Vector3(LAYOUT.door.x, 1.5, LAYOUT.door.z), radius: 1.8,
      prompt: () => this.game.sky.hour >= 19 || this.game.sky.hour < 5 ? 'Sleep until morning' : 'Office door (sleep after 7 pm)', action: () => this.game.sleep() });
  }

  _sortingTable(A) {
    const S = LAYOUT.sortTable;
    const g = new THREE.Group(); g.position.set(S.x, 0, S.z); this.group.add(g);
    const steel = A.pbr('metal_plate', { metalness: 1 });
    const top = new THREE.Mesh(boxUV(S.w, 0.08, S.d, 1.5), steel); top.position.y = 0.92; top.castShadow = top.receiveShadow = true; g.add(top);
    const rust = A.pbr('rusty_metal_02');
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const l = new THREE.Mesh(boxUV(0.08, 0.9, 0.08, 1), rust); l.position.set(lx * (S.w / 2 - 0.1), 0.45, lz * (S.d / 2 - 0.1)); l.castShadow = true; g.add(l);
    }
    const lip = new THREE.Mesh(boxUV(S.w, 0.12, 0.05, 1), steel); lip.position.set(0, 1.0, -S.d / 2); g.add(lip);
    // seven bins behind the table, one per material
    const binW = S.w / 7;
    MATERIAL_KEYS.forEach((k, i) => {
      const bx = -S.w / 2 + binW * (i + 0.5);
      const col = new THREE.Color(MATERIALS[k].color);
      const bin = new THREE.Mesh(boxUV(binW - 0.06, 0.7, 0.8, 1), A.pbr('painted_metal_shutter', { color: col, metalness: 0.4 }));
      bin.position.set(bx, 0.35, S.d / 2 + 0.5); bin.castShadow = bin.receiveShadow = true; g.add(bin);
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(binW - 0.14, 0.7), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 }));
      inner.rotation.x = -Math.PI / 2; inner.position.set(bx, 0.705, S.d / 2 + 0.5); g.add(inner);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(binW - 0.08, 0.2), new THREE.MeshStandardMaterial({ map: labelTexture(`${MATERIALS[k].key} ${MATERIALS[k].short.toUpperCase()}`, '#16130f', MATERIALS[k].color, 256, 64), roughness: 0.6 }));
      lbl.position.set(bx, 0.55, S.d / 2 + 0.09); lbl.rotation.y = Math.PI; g.add(lbl);
    });
    this.addCollider(S.x - S.w / 2 - 0.1, 0, S.z - S.d / 2 - 0.1, S.x + S.w / 2 + 0.1, 1.05, S.z + S.d / 2 + 1.0, 'table');
    this.interactables.push({ id: 'sort', pos: new THREE.Vector3(S.x, 1.0, S.z - 0.4), radius: 2.6, prompt: () => 'Sort junk by hand', action: () => this.game.ui.openSorting() });
    this.place('tool_cart', 1.0, S.x - S.w / 2 - 1.0, S.z + 0.2, 0.3);
    this.place('hand_truck', 1.3, S.x + S.w / 2 + 0.9, S.z + 0.6, -0.6);
  }

  _scale(A) {
    const S = LAYOUT.scale;
    const cx = S.x0 + S.w / 2, cz = S.z0 + S.d / 2;
    const deck = new THREE.Mesh(boxUV(S.w, 0.16, S.d, 1.2), A.pbr('metal_grate_rusty', { metalness: 1, color: 0xb9b2a6 }));
    deck.position.set(cx, 0.08, cz); deck.receiveShadow = true; deck.castShadow = true; this.group.add(deck);
    const hz = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 });
    hz.map.repeat.set(S.w / 1.2, 1);
    for (const [w, d, x, z] of [[S.w + 0.5, 0.25, cx, S.z0 - 0.12], [S.w + 0.5, 0.25, cx, S.z0 + S.d + 0.12], [0.25, S.d, S.x0 - 0.12, cz], [0.25, S.d, S.x0 + S.w + 0.12, cz]]) {
      const b = new THREE.Mesh(boxUV(w, 0.2, d, 1.2), hz); b.position.set(x, 0.1, z); b.receiveShadow = true; this.group.add(b);
    }
    // read-out post
    const pst = new THREE.Mesh(boxUV(0.15, 2.4, 0.15, 1), A.pbr('rusty_metal_02')); pst.position.set(S.x0 + S.w + 0.7, 1.2, S.z0 + 0.3); pst.castShadow = true; this.group.add(pst);
    this.scaleTex = screenTexture(['WEIGH & SELL', 'LAST: $0', 'DROP JUNK HERE']);
    const scr = new THREE.Mesh(boxUV(1.6, 1.0, 0.12, 1), [null, null, null, null, null, null].map((_, i) => i === 5 ? new THREE.MeshStandardMaterial({ map: this.scaleTex, emissive: 0xffffff, emissiveMap: this.scaleTex, emissiveIntensity: 1.2 }) : new THREE.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.6, roughness: 0.5 })));
    scr.position.set(S.x0 + S.w + 0.7, 2.6, S.z0 + 0.3); this.group.add(scr);
    this.addCollider(S.x0 + S.w + 0.55, 0, S.z0 + 0.15, S.x0 + S.w + 0.85, 3.2, S.z0 + 0.45);
    this.scaleBox = new THREE.Box3(new THREE.Vector3(S.x0, -1, S.z0), new THREE.Vector3(S.x0 + S.w, 2.5, S.z0 + S.d));
    this.interactables.push({ id: 'scale', pos: new THREE.Vector3(cx, 0.8, cz), radius: 3.6,
      prompt: () => { const kg = this.game.economy.backpackKg(); return kg > 0 ? `Sell backpack unsorted (${kg.toFixed(0)} kg ≈ $${Math.round(this.game.economy.backpackMixedValue())})` : 'Scale: throw junk on here or bring a full backpack'; },
      action: () => this.game.economy.sellBackpack() });
  }

  _props(A) {
    const T = LAYOUT.trailer;
    // fire barrels
    for (const [x, z] of [[-17, 68], [3.5, 71.5], [-38, 40]]) {
      this.place('barrel_stove', 1.0, x, z, Math.random() * 6);
      const fire = { pos: new THREE.Vector3(x, 1.25, z), t: Math.random() * 10 };
      fire.light = this.game.lights.add({ type: 'point', pos: fire.pos.clone().setY(1.6), color: 0xff8a3a, distance: 11, intensity: () => (0.4 + this.game.sky.night * 1.2) * fire.flicker * 6 });
      fire.flicker = 1;
      this.fires.push(fire);
    }
    // street lamps
    for (const [x, z, r] of [[-5, 73.5, 0], [25, 72, 0], [-36, 56, Math.PI / 2], [38, 42, -Math.PI / 2], [-45, 20, Math.PI / 2], [45, -10, -Math.PI / 2], [-40, -40, 0.7]]) {
      const l = this.place('street_lamp_02', 6.2, x, z, r);
      this.game.lights.add({ type: 'point', pos: new THREE.Vector3(x, 5.6, z), color: 0xffd7a0, distance: 22, intensity: () => this.game.sky.night * 60 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd59a, emissiveIntensity: 0 }));
      bulb.position.set(x, 5.75, z); this.group.add(bulb);
      this.windows.push(bulb.material);
    }
    // cars, barriers, kit
    this.place('covered_car', 4.6, 53, 8, 1.4);
    this.place('covered_car', 4.6, 52.5, 19, 1.7);
    this.place('covered_car', 4.6, -52, -32, -1.3);
    this.place('covered_car', 4.6, 44, -48, 0.2);
    this.place('covered_car', 4.6, -46, 49, 0.4);
    for (const [x, z, r] of [[-11, 73.5, 0], [11.5, 73.6, 0], [-30, 34, 0.2], [30, 33, -0.1], [14, 33.5, 0]]) this.place('concrete_road_barrier_02', 2.6, x, z, r);
    this.place('utility_box_01', 1.4, T.x - T.w / 2 - 0.8, T.z - 1, Math.PI / 2);
    this.place('metal_tool_chest', 1.1, T.x - 4.6, T.z - T.d / 2 - 0.8, Math.PI);
    this.place('steel_frame_shelves_01', 2.0, T.x + T.w / 2 + 0.9, T.z, -Math.PI / 2);
    this.place('wooden_ladder', 3.2, T.x + T.w / 2 + 0.35, T.z + 1.2, -Math.PI / 2, { collide: false });
    this.place('old_military_compressor', 1.7, -40, 62, 0.6);
    this.place('WetFloorSign_01', 0.75, LAYOUT.door.x - 1.4, T.z - T.d / 2 - 1.1, 0.5, { collide: false });
    for (let i = 0; i < 6; i++) this.place('cement_bag', 0.75, -42 + (i % 3) * 0.8, 66 + Math.floor(i / 3) * 0.55, Math.random() - 0.5, { y: 0, collide: i === 0, pad: 0.6 });
    this.place('flood_lights', 1.4, -44, 30, 0.8);

    // stacks of tyres and drums along the walls (decoration)
    const deco = (model, positions, size, stack, rot = []) => {
      const M = A.models[model]; if (!M) return;
      const count = positions.length * stack;
      for (const p of M.parts) {
        const im = new THREE.InstancedMesh(p.geometry, p.material, count);
        im.castShadow = im.receiveShadow = true;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
        let n = 0;
        positions.forEach(([x, z], pi) => {
          for (let s = 0; s < stack; s++) {
            e.set(rot[0] ?? 0, Math.random() * 6, rot[2] ?? 0); q.setFromEuler(e);
            m.compose(new THREE.Vector3(x + (Math.random() - 0.5) * 0.08, M.dims.y * size * (s + 0.5) * (rot[0] ? M.dims.z / M.dims.y : 1), z + (Math.random() - 0.5) * 0.08), q, new THREE.Vector3(size, size, size));
            im.setMatrixAt(n++, m);
          }
        });
        this.group.add(im);
      }
      for (const [x, z] of positions) this.addCollider(x - size * 0.5, 0, z - size * 0.5, x + size * 0.5, size * stack, z + size * 0.5);
    };
    const tyres = [], drums = [];
    for (let i = 0; i < 9; i++) tyres.push([-58.6, -20 + i * 0.95], [-57.6, -19.5 + i * 0.95]);
    for (let i = 0; i < 10; i++) drums.push([58.5, 26 + i * 1.05]);
    deco('old_tyre', tyres, 0.85, 5, [Math.PI / 2, 0, 0]);
    deco('Barrel_01', drums, 1.0, 1);

    // weeds along the walls
    const W = A.models['weed_plant_02'];
    if (W) {
      const n = 260, m = new THREE.Matrix4(), q = new THREE.Quaternion();
      const spots = [];
      for (let i = 0; i < n; i++) {
        const side = i % 4, t = Math.random();
        const x = side === 0 ? YARD.minX + 0.6 + Math.random() * 1.5 : side === 1 ? YARD.maxX - 0.6 - Math.random() * 1.5 : YARD.minX + t * (YARD.maxX - YARD.minX);
        const z = side < 2 ? YARD.minZ + t * (YARD.maxZ - YARD.minZ) : side === 2 ? YARD.minZ + 0.6 + Math.random() * 1.5 : YARD.maxZ - 0.6 - Math.random() * 1.2;
        if (side === 3 && Math.abs(x) < 8) continue;
        spots.push([x, z]);
      }
      for (const p of W.parts) {
        const im = new THREE.InstancedMesh(p.geometry, p.material, spots.length);
        spots.forEach(([x, z], i) => {
          const s = 0.5 + Math.random() * 0.7;
          q.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0));
          m.compose(new THREE.Vector3(x, W.dims.y * s / 2, z), q, new THREE.Vector3(s, s, s));
          im.setMatrixAt(i, m);
        });
        im.receiveShadow = true;
        p.material.side = THREE.DoubleSide;
        this.group.add(im);
      }
    }
  }

  _outside(A) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 240), A.pbr('asphalt_02', { repeat: [2, 40], metalness: 0 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.015, YARD.maxZ + 120); road.receiveShadow = true;
    this.group.add(road);
    // rolling hills on the horizon
    const geo = new THREE.CylinderGeometry(420, 420, 60, 160, 6, true);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const h = (y + 30) / 60;
      const hill = 0.4 + 0.35 * Math.sin(a * 3 + 1) + 0.2 * Math.sin(a * 7.3) + 0.1 * Math.sin(a * 17.1);
      p.setY(i, -2 + h * hill * 70);
    }
    geo.computeVertexNormals();
    const hills = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5f5848, roughness: 1, side: THREE.BackSide }));
    this.group.add(hills);
    // pylons along the road
    const wood = A.pbr('rusty_metal_02');
    for (let i = 0; i < 8; i++) {
      const z = YARD.maxZ + 14 + i * 26;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 9, 8), wood); pole.position.set(9, 4.5, z); pole.castShadow = true; this.group.add(pole);
      const arm = new THREE.Mesh(boxUV(2.4, 0.12, 0.12, 1), wood); arm.position.set(9, 8.6, z); this.group.add(arm);
    }
  }

  update(dt) {
    const night = this.game.sky.night;
    for (const m of this.windows) m.emissiveIntensity = night * 2.2;
    for (const f of this.fires) {
      f.t += dt;
      f.flicker = 0.75 + Math.sin(f.t * 13) * 0.1 + Math.sin(f.t * 7.3) * 0.1 + Math.random() * 0.1;
      if (Math.random() < dt * 14) this.game.particles.embers(f.pos);
      if (Math.random() < dt * 3) this.game.particles.smoke(f.pos.clone().setY(1.4), 0.3, 0.6);
    }
  }
}
