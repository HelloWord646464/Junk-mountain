// Downloads CC0 models and textures from Poly Haven (https://polyhaven.com)
// and optimizes them for the game: simplified meshes, two levels of detail,
// and WebP textures. Output goes to public/assets.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, simplify, prune, textureCompress, center, resample } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public/assets');
const CACHE = path.join(ROOT, '.asset-cache');
fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'textures'), { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

// [id, lod0 triangle budget, lod1 budget (0 = none), texture size]
const MODELS = [
  // Junk that makes up the pile
  ['old_tyre', 2000, 200, 512], ['Barrel_01', 1600, 160, 512], ['barrel_03', 1400, 160, 512],
  ['cardboard_box_01', 600, 60, 512], ['wooden_crate_01', 1500, 120, 512], ['wooden_crate_02', 1500, 120, 512],
  ['Television_01', 1900, 200, 512], ['television_02', 2000, 200, 512], ['vintage_microwave', 2000, 200, 512],
  ['plastic_crate_02', 2000, 200, 512], ['plastic_jerrycan', 1600, 160, 512], ['plastic_monobloc_chair_01', 1600, 200, 512],
  ['metal_jerrycan_green', 1800, 180, 512], ['propane_tank', 1600, 160, 512], ['painted_wooden_chair_01', 724, 150, 512],
  ['painted_wooden_cabinet_02', 966, 150, 512], ['painted_wooden_nightstand', 470, 120, 512], ['exterior_aircon_unit', 2400, 240, 512],
  ['metal_trash_can', 2000, 200, 512], ['rusted_wheel_rim_02', 2200, 220, 512], ['trashbag', 1800, 180, 512],
  ['boombox', 2200, 220, 512], ['old_military_crate', 2000, 200, 512], ['electric_stove', 2400, 240, 512],
  ['sofa_02', 2000, 240, 512], ['wine_bottles_01', 2000, 200, 512], ['can_rusted', 800, 80, 256],
  ['plastic_bottle_gallon', 1200, 120, 256], ['metal_toolbox', 2000, 200, 512], ['ArmChair_01', 2400, 240, 512],
  ['portable_generator', 2600, 260, 512], ['old_bed_frame', 2600, 260, 512], ['cement_bag', 844, 120, 512],
  // Rare collectibles
  ['vintage_pocket_watch', 3000, 0, 512], ['vintage_radio_transceiver', 4000, 0, 512], ['gaming_console', 4000, 0, 512],
  ['cassette_player', 3000, 0, 512], ['garden_gnome', 4000, 0, 512], ['rubber_duck_toy', 3000, 0, 512],
  ['vintage_video_camera', 4000, 0, 512], ['Camera_01', 4000, 0, 512],
  // Yard props
  ['covered_car', 6000, 0, 1024], ['concrete_road_barrier_02', 4000, 0, 1024], ['street_lamp_02', 4000, 0, 512],
  ['utility_box_01', 4404, 0, 512], ['barrel_stove', 5000, 0, 1024], ['steel_frame_shelves_01', 4348, 0, 512],
  ['metal_tool_chest', 6000, 0, 512], ['tool_cart', 6000, 0, 512], ['hand_truck', 5000, 0, 512],
  ['wooden_ladder', 4000, 0, 512], ['flood_lights', 6000, 0, 512], ['weed_plant_02', 3000, 0, 512],
  ['large_iron_gate', 8000, 0, 1024], ['WetFloorSign_01', 228, 0, 512], ['security_light', 4668, 0, 512],
  ['old_military_compressor', 8000, 0, 1024], ['exterior_aircon_unit', 2400, 240, 512],
  // Held tools
  ['metal_detector', 8000, 0, 1024], ['rusted_spade_01', 6000, 0, 1024], ['picke_dirty_01', 6000, 0, 1024],
  ['sledgehammer_01', 2596, 0, 1024], ['crowbar_01', 2300, 0, 1024], ['garden_gloves_01', 4000, 0, 512],
];

// [id, size, maps]
const TEXTURES = [
  ['rusty_metal_02', '1k'], ['rusty_corrugated_iron', '2k'], ['corrugated_iron_02', '1k'], ['metal_plate', '1k'],
  ['painted_metal_shutter', '1k'], ['concrete_floor_worn_001', '2k'], ['gravel_ground_01', '2k'], ['brown_mud_dry', '2k'],
  ['asphalt_02', '1k'], ['brown_leather', '1k'], ['box_profile_metal_sheet', '1k'], ['rusty_painted_metal', '1k'],
  ['metal_grate_rusty', '1k'],
];

async function get(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status + ' ' + url);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      return dest;
    } catch (e) { if (i === 3) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
  }
}
const api = async id => (await fetch('https://api.polyhaven.com/files/' + id)).json();

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const triCount = doc => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives()
  .reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

async function simplifyTo(doc, budget) {
  await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld());
  const tris = triCount(doc);
  if (tris > budget) {
    await MeshoptSimplifier.ready;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: budget / tris, error: 0.02, lockBorder: false }));
    if (triCount(doc) > budget * 1.5) // allow a coarser error for stubborn meshes
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: budget / triCount(doc), error: 0.08 }));
  }
  return doc;
}

async function doModel([id, lod0, lod1, tex]) {
  const out0 = path.join(OUT, 'models', id + '.glb');
  if (fs.existsSync(out0)) return;
  const info = await api(id);
  const g = (info.gltf['1k'] || info.gltf['2k']).gltf;
  const dir = path.join(CACHE, id);
  const gltfPath = await get(g.url, path.join(dir, path.basename(g.url)));
  for (const [rel, f] of Object.entries(g.include)) await get(f.url, path.join(dir, rel));
  let doc = await io.read(gltfPath);
  await simplifyTo(doc, lod0);
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82 }));
  await io.write(out0, doc);
  let msg = `${id}: lod0 ${Math.round(triCount(doc))} tris`;
  if (lod1) {
    let d1 = await io.read(gltfPath);
    await simplifyTo(d1, lod1);
    for (const t of d1.getRoot().listTextures()) t.dispose();
    await d1.transform(prune());
    await io.write(path.join(OUT, 'models', id + '.lod1.glb'), d1);
    msg += `, lod1 ${Math.round(triCount(d1))} tris`;
  }
  console.log(msg, (fs.statSync(out0).size / 1024 | 0) + 'KB');
}

async function doTexture([id, size]) {
  const info = await api(id);
  const want = { diff: 'Diffuse', nor: 'nor_gl', arm: 'arm' };
  for (const [short, key] of Object.entries(want)) {
    const dest = path.join(OUT, 'textures', `${id}_${short}.webp`);
    if (fs.existsSync(dest)) continue;
    const entry = info[key]?.[size]?.jpg || info[key]?.['1k']?.jpg;
    if (!entry) { console.log('missing', id, key); continue; }
    const src = await get(entry.url, path.join(CACHE, 'tex', path.basename(entry.url)));
    await sharp(src).webp({ quality: short === 'nor' ? 90 : 82 }).toFile(dest);
  }
  console.log('texture', id);
}

const seen = new Set();
const queue = MODELS.filter(m => !seen.has(m[0]) && seen.add(m[0]));
const workers = Array.from({ length: 4 }, async () => {
  while (queue.length) { const m = queue.shift(); try { await doModel(m); } catch (e) { console.error('FAIL', m[0], e.message); } }
});
await Promise.all(workers);
for (const t of TEXTURES) { try { await doTexture(t); } catch (e) { console.error('FAIL tex', t[0], e.message); } }
console.log('done');

// Second pass: some meshes refuse to simplify (UV seams, many parts). For far-away
// copies use meshoptimizer's "sloppy" simplifier, which ignores topology.
await MeshoptSimplifier.ready;
for (const f of fs.readdirSync(path.join(OUT, 'models')).filter(f => f.endsWith('.lod1.glb'))) {
  const file = path.join(OUT, 'models', f);
  const doc = await io.read(file);
  if (triCount(doc) <= 700) continue;
  const ratio = 400 / triCount(doc);
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(), pos = p.getAttribute('POSITION');
    // Merge vertices that share a position (ignoring UV seams) so the simplifier can collapse them.
    const P = pos.getArray(), canon = new Map(), remap = new Uint32Array(pos.getCount());
    for (let v = 0; v < pos.getCount(); v++) {
      const k = `${Math.round(P[v*3]*500)},${Math.round(P[v*3+1]*500)},${Math.round(P[v*3+2]*500)}`;
      if (!canon.has(k)) canon.set(k, v);
      remap[v] = canon.get(k);
    }
    const indices = Uint32Array.from(idx.getArray(), i => remap[i]);
    const target = Math.max(12, Math.floor(indices.length * ratio / 3) * 3);
    const [out] = MeshoptSimplifier.simplify(indices, new Float32Array(P), 3, target, 1.0, ['LockBorder'].slice(1));
    idx.setArray(out.length ? new Uint32Array(out) : indices);
  }
  await io.write(file, doc);
  console.log('sloppy lod1', f, Math.round(triCount(doc)));
}
