import * as THREE from 'three';

const VS = `
attribute float size; attribute vec4 rgba;
varying vec4 vColor;
uniform float scale;
void main(){
  vColor = rgba;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying vec4 vColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  #include <colorspace_fragment>
}`;

// Pooled soft particles: dust puffs, smoke, sparks and drifting motes.
class Pool {
  constructor(scene, max, additive) {
    this.max = max;
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.rgba = new Float32Array(max * 4); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rgba', new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, uniforms: { scale: { value: 600 } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = g;
  }
  add(o) { if (this.p.length >= this.max) this.p.shift(); this.p.push(o); }
  update(dt) {
    const arr = this.p;
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vy -= (q.g ?? 0) * dt;
      q.vx *= 1 - (q.drag ?? 0) * dt; q.vy *= 1 - (q.drag ?? 0) * dt; q.vz *= 1 - (q.drag ?? 0) * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.floor !== undefined && q.y < q.floor) { q.y = q.floor; q.vy *= -0.3; }
      const t = q.age / q.life;
      this.pos[n * 3] = q.x; this.pos[n * 3 + 1] = q.y; this.pos[n * 3 + 2] = q.z;
      this.rgba[n * 4] = q.r; this.rgba[n * 4 + 1] = q.gc; this.rgba[n * 4 + 2] = q.b;
      this.rgba[n * 4 + 3] = q.a * (q.fadeIn ? Math.min(1, t * 6) : 1) * (1 - t) ** (q.fade ?? 1);
      this.size[n] = q.s0 + (q.s1 - q.s0) * t;
      arr[n++] = q;
    }
    arr.length = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'rgba', 'size']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    this.soft = new Pool(scene, 3000, false);
    this.glow = new Pool(scene, 1500, true);
    this.motes = [];
  }

  setScale(px) { this.soft.mat.uniforms.scale.value = px; this.glow.mat.uniforms.scale.value = px; }

  dust(pos, color = [0.55, 0.47, 0.38], n = 14, spread = 0.6) {
    for (let i = 0; i < n; i++) this.soft.add({
      x: pos.x + (Math.random() - 0.5) * spread, y: pos.y + Math.random() * 0.3, z: pos.z + (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 1.6, vy: Math.random() * 1.4 + 0.2, vz: (Math.random() - 0.5) * 1.6, drag: 1.8, g: -0.15,
      r: color[0], gc: color[1], b: color[2], a: 0.45, age: 0, life: 1.2 + Math.random() * 1.4, s0: 0.5, s1: 2.2 + Math.random(), fadeIn: true, fade: 1.5,
    });
  }

  debris(pos, color, n = 8) {
    for (let i = 0; i < n; i++) this.soft.add({
      x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 4 + 1, vz: (Math.random() - 0.5) * 4,
      g: 12, floor: 0.02, r: color[0], gc: color[1], b: color[2], a: 1, age: 0, life: 0.8 + Math.random() * 0.5, s0: 0.07, s1: 0.05, fade: 3,
    });
  }

  smoke(pos, dark = 0.25, amount = 1) {
    this.soft.add({
      x: pos.x + (Math.random() - 0.5) * 0.3, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.3,
      vx: 0.4 + Math.random() * 0.4, vy: 1.6 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.4, drag: 0.2,
      r: dark, gc: dark * 0.97, b: dark * 0.95, a: 0.35 * amount, age: 0, life: 6 + Math.random() * 3, s0: 0.8, s1: 6 + Math.random() * 3, fadeIn: true, fade: 1.2,
    });
  }

  sparks(pos, n = 6, color = [1, 0.55, 0.15]) {
    for (let i = 0; i < n; i++) this.glow.add({
      x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 0.5, vz: (Math.random() - 0.5) * 3,
      g: 6, r: color[0] * 3, gc: color[1] * 3, b: color[2] * 3, a: 1, age: 0, life: 0.4 + Math.random() * 0.6, s0: 0.12, s1: 0.03,
    });
  }

  embers(pos) {
    this.glow.add({
      x: pos.x + (Math.random() - 0.5) * 0.5, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.5,
      vx: (Math.random() - 0.5) * 0.5, vy: 1 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.5, drag: 0.5,
      r: 3, gc: 1.2, b: 0.3, a: 1, age: 0, life: 1 + Math.random() * 1.5, s0: 0.09, s1: 0.02,
    });
  }

  sparkle(pos) {
    this.glow.add({
      x: pos.x + (Math.random() - 0.5) * 0.6, y: pos.y + (Math.random() - 0.2) * 0.6, z: pos.z + (Math.random() - 0.5) * 0.6,
      vx: 0, vy: 0.2, vz: 0, r: 2.5, gc: 2.1, b: 1.2, a: 1, age: 0, life: 0.8, s0: 0.25, s1: 0.0,
    });
  }

  coin(pos) {
    for (let i = 0; i < 6; i++) this.glow.add({
      x: pos.x, y: pos.y + 0.5, z: pos.z, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, g: 5,
      r: 2.2, gc: 1.7, b: 0.4, a: 1, age: 0, life: 0.9, s0: 0.2, s1: 0.05,
    });
  }

  // Floating dust motes around the player, catching the light.
  ambient(focus, dt, brightness) {
    this._mt = (this._mt || 0) - dt;
    if (this._mt > 0) return;
    this._mt = 0.05;
    const b = 0.6 + brightness * 0.6;
    this.soft.add({
      x: focus.x + (Math.random() - 0.5) * 24, y: focus.y + Math.random() * 6 - 1, z: focus.z + (Math.random() - 0.5) * 24,
      vx: 0.25 + Math.random() * 0.2, vy: (Math.random() - 0.5) * 0.1, vz: (Math.random() - 0.5) * 0.2,
      r: b, gc: b * 0.92, b: b * 0.8, a: 0.5, age: 0, life: 6, s0: 0.05, s1: 0.05, fadeIn: true, fade: 1,
    });
  }

  update(dt) { this.soft.update(dt); this.glow.update(dt); }
}
