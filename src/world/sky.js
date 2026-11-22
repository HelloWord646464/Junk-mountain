import * as THREE from 'three';
import { Sky as SkyShader } from 'three/addons/objects/Sky.js';
import { DAY_SECONDS } from '../config.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerpC = (a, b, t) => a.clone().lerp(b, t);

// Day/night cycle: moving sun and moon, physically based sky, stars,
// fog and an environment map regenerated from the sky every few seconds.
export class DayNight {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.hour = 7.25;
    this.day = 1;

    this.sky = new SkyShader();
    this.sky.scale.setScalar(9000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
    scene.add(this.sky);

    // Separate scene that only contains the sky, used to build the reflection map.
    this.envScene = new THREE.Scene();
    this.envSky = new SkyShader(); this.envSky.material = this.sky.material; this.envSky.scale.setScalar(9000);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTimer = 0;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(4096, 4096); s.bias = -0.0003; s.normalBias = 0.035;
    s.camera.near = 1; s.camera.far = 260;
    this.setShadowExtent(70);
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x9fb4ff, 0);
    scene.add(this.moon, this.moon.target);

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x5a4632, 0.4);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xc8b9a0, 0.0065);

    this._makeStars();
    this._makeMoonDisc();
    this.sunDir = new THREE.Vector3();
    this.night = 0;
  }

  setShadowExtent(e) {
    const c = this.sun.shadow.camera;
    c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.updateProjectionMatrix();
  }

  _makeStars() {
    const n = 2500, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.5 + 0.5;
      const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      const r = 4000;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)); pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      const b = 0.5 + Math.random() * 0.5, warm = Math.random();
      col[i * 3] = b; col[i * 3 + 1] = b * (0.9 + warm * 0.1); col[i * 3 + 2] = b * (0.8 + (1 - warm) * 0.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.renderOrder = -1;
    this.scene.add(this.stars);
  }

  _makeMoonDisc() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(128, 128, 60, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,250,235,0.5)'); grd.addColorStop(1, 'rgba(255,250,235,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#f3eedf'; x.beginPath(); x.arc(128, 128, 62, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(160,150,135,0.35)';
    for (const [cx, cy, r] of [[110, 110, 14], [150, 140, 10], [125, 158, 8], [100, 145, 6], [148, 100, 7]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false, opacity: 0 }));
    this.moonDisc.scale.setScalar(260);
    this.scene.add(this.moonDisc);
  }

  get timeString() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  advance(dt) {
    this.hour += dt * 24 / DAY_SECONDS;
    if (this.hour >= 24) { this.hour -= 24; this.day++; }
  }

  update(dt, focus) {
    const h = this.hour;
    // Sun travels east -> south -> west. Sunrise ~6:00, sunset ~19:00.
    const dayT = (h - 6) / 13;                     // 0 at sunrise, 1 at sunset
    const elev = Math.sin(dayT * Math.PI) * 1.05 - 0.07;
    const azim = Math.PI * (0.15 + dayT * 0.7);
    this.sunDir.set(Math.cos(azim) * Math.cos(elev), Math.sin(elev), Math.sin(azim) * Math.cos(elev) * 0.45 - 0.05).normalize();
    // Moon roughly opposite
    const moonDir = new THREE.Vector3(-this.sunDir.x, Math.max(0.35, -this.sunDir.y * 0.9 + 0.3), -this.sunDir.z).normalize();

    const day = smooth(-0.12, 0.18, this.sunDir.y);
    const golden = smooth(0.45, 0.05, this.sunDir.y) * smooth(-0.1, 0.05, this.sunDir.y);
    this.night = 1 - smooth(-0.2, 0.05, this.sunDir.y);

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.rayleigh.value = 2.0 + golden * 1.2;
    u.turbidity.value = 3.5 + golden * 6;

    const warm = new THREE.Color(1.0, 0.55, 0.28), noon = new THREE.Color(1.0, 0.95, 0.88);
    this.sun.color.copy(lerpC(noon, warm, golden));
    this.sun.intensity = 6.2 * day * (1 - golden * 0.25);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150);
    this.sun.target.position.copy(focus);

    this.moon.intensity = 0.35 * this.night;
    this.moon.position.copy(focus).addScaledVector(moonDir, 150);
    this.moon.target.position.copy(focus);
    this.moonDisc.position.copy(focus).addScaledVector(moonDir, 3500);
    this.moonDisc.material.opacity = this.night;
    this.starMat.opacity = this.night * 0.95;
    this.stars.position.copy(focus);
    this.stars.rotation.y = this.hour * 0.02;

    const skyDay = new THREE.Color(0.62, 0.74, 0.95), skyGold = new THREE.Color(1.0, 0.7, 0.45), skyNight = new THREE.Color(0.06, 0.08, 0.16);
    this.hemi.color.copy(lerpC(lerpC(skyDay, skyGold, golden), skyNight, this.night));
    this.hemi.groundColor.copy(lerpC(new THREE.Color(0.38, 0.3, 0.22), new THREE.Color(0.05, 0.05, 0.07), this.night));
    this.hemi.intensity = 0.45 * day + 0.45 * this.night;

    const fogDay = new THREE.Color(0.62, 0.66, 0.7), fogGold = new THREE.Color(0.8, 0.58, 0.42), fogNight = new THREE.Color(0.03, 0.04, 0.07);
    this.scene.fog.color.copy(lerpC(lerpC(fogDay, fogGold, golden), fogNight, this.night));
    this.scene.fog.density = 0.0024 + golden * 0.001 + this.night * 0.004;

    this.scene.environmentIntensity = 0.12 + 0.8 * day;
    this.renderer.toneMappingExposure = 0.52 + this.night * 0.6;

    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 2.5;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 10000);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
  }
}
