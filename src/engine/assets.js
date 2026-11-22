import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = './assets/';

// Loads the optimized Poly Haven models and textures, and turns each model into
// a list of { geometry, material } parts normalized to a 1 m bounding box.
export class Assets {
  constructor(renderer) {
    this.gltf = new GLTFLoader();
    this.texLoader = new THREE.TextureLoader();
    this.aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    this.models = {};
    this.lods = {};
    this.texSets = {};
  }

  async loadAll({ models, lods, textures }, onProgress = () => {}) {
    const jobs = [];
    for (const id of models) jobs.push(() => this._loadModel(id));
    for (const id of lods) jobs.push(() => this._loadLod(id));
    for (const id of textures) jobs.push(() => this._loadTexSet(id));
    let done = 0;
    const total = jobs.length;
    const queue = jobs.slice();
    const worker = async () => {
      while (queue.length) {
        const job = queue.shift();
        try { await job(); } catch (e) { console.warn('asset failed', e); }
        onProgress(++done / total);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  async _loadModel(id) {
    const gltf = await this.gltf.loadAsync(`${BASE}models/${id}.glb`);
    this.models[id] = this._normalize(gltf.scene, id);
  }

  async _loadLod(id) {
    if (!this.models[id]) await this._loadModel(id);
    const gltf = await this.gltf.loadAsync(`${BASE}models/${id}.lod1.glb`);
    const base = this.models[id];
    const lod = this._normalize(gltf.scene, id, base);
    // Far copies use the full-detail materials (the LOD file carries no textures).
    for (const p of lod.parts) {
      const match = base.parts.find(b => b.material.name === p.material.name) || base.parts[0];
      p.material = match.material;
    }
    this.lods[id] = lod;
  }

  // Bakes node transforms into the geometry and fits everything into a unit box centred on the origin.
  _normalize(root, id, reference) {
    root.updateMatrixWorld(true);
    const parts = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.morphAttributes = {}; // static props only: drop morph targets
      g.applyMatrix4(o.matrixWorld);
      const mat = o.material;
      if (mat.map) mat.map.anisotropy = this.aniso;
      mat.envMapIntensity = 1.0;
      if (mat.transparent || /glass/i.test(mat.name)) { mat.transparent = true; mat.depthWrite = false; mat.opacity = Math.min(mat.opacity, 0.55); mat.roughness = Math.min(mat.roughness, 0.15); }
      parts.push({ geometry: g, material: mat });
    });
    let center, scale, dims;
    if (reference) { center = reference.center; scale = reference.scale; dims = reference.dims; }
    else {
      const box = new THREE.Box3();
      for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
      center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      scale = 1 / Math.max(size.x, size.y, size.z);
      dims = size.multiplyScalar(scale);
    }
    for (const p of parts) {
      p.geometry.translate(-center.x, -center.y, -center.z);
      p.geometry.scale(scale, scale, scale);
      p.geometry.computeBoundingSphere();
      p.geometry.computeBoundingBox();
    }
    return { id, parts, center, scale, dims };
  }

  // Builds a group of meshes for a model scaled so its longest side is `size` metres.
  instance(id, size = 1, { shadows = true, bottom = false } = {}) {
    const m = this.models[id];
    const g = new THREE.Group();
    if (!m) return g;
    const inner = new THREE.Group();
    for (const p of m.parts) {
      const mesh = new THREE.Mesh(p.geometry, p.material);
      mesh.castShadow = shadows && !p.material.transparent;
      mesh.receiveShadow = true;
      inner.add(mesh);
    }
    if (bottom) inner.position.y = m.dims.y / 2; // sit the model on y = 0
    g.add(inner);
    g.scale.setScalar(size);
    return g;
  }

  async _loadTexSet(id) {
    const load = (suffix, srgb) => new Promise(res => {
      this.texLoader.load(`${BASE}textures/${id}_${suffix}.webp`, t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = this.aniso;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        res(t);
      }, undefined, () => res(null));
    });
    const [map, normalMap, arm] = await Promise.all([load('diff', true), load('nor', false), load('arm', false)]);
    this.texSets[id] = { map, normalMap, arm };
  }

  // PBR material from a texture set. Each call clones the textures so repeat can differ.
  pbr(id, { repeat = [1, 1], color, metalness, roughness = 1, normalScale = 1, emissive } = {}) {
    const s = this.texSets[id] || {};
    const c = t => { if (!t) return null; const x = t.clone(); x.repeat.set(repeat[0], repeat[1]); x.needsUpdate = true; return x; };
    const arm = c(s.arm);
    const mat = new THREE.MeshStandardMaterial({
      map: c(s.map), normalMap: c(s.normalMap), aoMap: arm, roughnessMap: arm, metalnessMap: arm,
      metalness: metalness ?? 1, roughness,
      color: color ? new THREE.Color(color) : 0xffffff,
    });
    mat.normalScale.set(normalScale, normalScale);
    if (emissive) mat.emissive = new THREE.Color(emissive);
    return mat;
  }
}

export const MODEL_LIST = [
  'old_tyre', 'rusted_wheel_rim_02', 'Barrel_01', 'barrel_03', 'cardboard_box_01', 'wooden_crate_01', 'wooden_crate_02',
  'old_military_crate', 'Television_01', 'television_02', 'vintage_microwave', 'plastic_crate_02', 'plastic_jerrycan',
  'plastic_monobloc_chair_01', 'metal_jerrycan_green', 'propane_tank', 'painted_wooden_chair_01', 'painted_wooden_cabinet_02',
  'painted_wooden_nightstand', 'exterior_aircon_unit', 'metal_trash_can', 'trashbag', 'boombox', 'electric_stove', 'sofa_02',
  'ArmChair_01', 'wine_bottles_01', 'can_rusted', 'plastic_bottle_gallon', 'metal_toolbox', 'portable_generator', 'old_bed_frame',
  'vintage_pocket_watch', 'vintage_radio_transceiver', 'gaming_console', 'cassette_player', 'garden_gnome', 'rubber_duck_toy',
  'vintage_video_camera', 'Camera_01', 'covered_car', 'concrete_road_barrier_02', 'street_lamp_02', 'utility_box_01',
  'barrel_stove', 'steel_frame_shelves_01', 'metal_tool_chest', 'tool_cart', 'hand_truck', 'wooden_ladder', 'flood_lights',
  'weed_plant_02', 'large_iron_gate', 'WetFloorSign_01', 'security_light', 'old_military_compressor', 'metal_detector',
  'rusted_spade_01', 'picke_dirty_01', 'sledgehammer_01', 'crowbar_01', 'cement_bag',
];
export const TEXTURE_LIST = [
  'rusty_metal_02', 'rusty_corrugated_iron', 'corrugated_iron_02', 'metal_plate', 'painted_metal_shutter',
  'concrete_floor_worn_001', 'gravel_ground_01', 'brown_mud_dry', 'asphalt_02', 'brown_leather', 'box_profile_metal_sheet',
  'rusty_painted_metal', 'metal_grate_rusty',
];
