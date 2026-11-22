import * as THREE from 'three';

// A fixed pool of real lights shared by every lamp in the yard. The nearest
// active emitters get a light each frame, so shaders never recompile.
export class LightPool {
  constructor(scene, points = 10, spots = 8) {
    this.points = []; this.spots = [];
    for (let i = 0; i < points; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(l); this.points.push(l); }
    for (let i = 0; i < spots; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 40, 0.6, 0.5, 1.6);
      scene.add(l, l.target); this.spots.push(l);
    }
    this.emitters = new Set();
  }

  // e: { type: 'point'|'spot', pos: Vector3, color, intensity: () => number, distance, angle, target: Vector3 }
  add(e) { this.emitters.add(e); return e; }
  remove(e) { this.emitters.delete(e); }

  update(cam) {
    const list = { point: [], spot: [] };
    for (const e of this.emitters) {
      const i = e.intensity();
      if (i <= 0.001) continue;
      list[e.type].push({ e, i, d: e.pos.distanceToSquared(cam) });
    }
    for (const [type, pool] of [['point', this.points], ['spot', this.spots]]) {
      const arr = list[type].sort((a, b) => a.d - b.d);
      pool.forEach((l, k) => {
        const it = arr[k];
        if (!it) { l.intensity = 0; return; } // never toggle .visible: that recompiles shaders
        l.position.copy(it.e.pos);
        l.color.set(it.e.color);
        l.intensity = it.i;
        l.distance = it.e.distance ?? 12;
        if (type === 'spot') { l.angle = it.e.angle ?? 0.6; l.target.position.copy(it.e.target); }
      });
    }
  }
}
