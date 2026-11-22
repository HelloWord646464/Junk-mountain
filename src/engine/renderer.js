import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const QUALITY = {
  low:    { label: 'Low',    shadow: 1024, ao: false, bloom: false, scale: 0.75, lod: 10, shadowFar: 45 },
  medium: { label: 'Medium', shadow: 2048, ao: false, bloom: true,  scale: 1.0,  lod: 16, shadowFar: 60 },
  high:   { label: 'High',   shadow: 4096, ao: true,  bloom: true,  scale: 1.0,  lod: 22, shadowFar: 70 },
  ultra:  { label: 'Ultra',  shadow: 4096, ao: true,  bloom: true,  scale: 1.25, lod: 32, shadowFar: 80 },
};

// Film grain + vignette + a touch of warm grading, applied after tone mapping.
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, grain: { value: 0.035 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float vignette; uniform float grain; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.15, 1.0)));
      c.rgb *= mix(1.0 - vignette, 1.0, v);
      float n = hash(vUv * 1000.0 + fract(time) * 100.0) - 0.5;
      c.rgb += n * grain;
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.95), 0.6);
      gl_FragColor = c;
    }`,
};

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.quality = 'high';
  }

  setup(scene, camera) {
    this.scene = scene; this.camera = camera;
    const r = this.renderer;
    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.gtao = new GTAOPass(scene, camera, 1, 1);
    this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 16, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.gtao.blendIntensity = 0.9;
    // Objects that should never receive ambient occlusion (sky sprites, particles) are hidden while the AO pass draws its normal buffer.
    this.hideDuringAO = [];
    const aoRender = this.gtao.render.bind(this.gtao);
    this.gtao.render = (...a) => {
      const vis = this.hideDuringAO.map(o => o.visible);
      this.hideDuringAO.forEach(o => { o.visible = false; });
      aoRender(...a);
      this.hideDuringAO.forEach((o, i) => { o.visible = vis[i]; });
    };
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.6, 2.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.smaa = new SMAAPass(1, 1);
    this.composer.addPass(this.smaa);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get preset() { return QUALITY[this.quality]; }

  applyQuality(q, sun) {
    this.quality = QUALITY[q] ? q : 'high';
    const p = this.preset;
    this.gtao.enabled = p.ao;
    this.bloom.enabled = p.bloom;
    if (sun) {
      sun.shadow.mapSize.set(p.shadow, p.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2) * this.preset.scale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    if (this.composer) {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(w, h);
    }
  }

  render(dt, t) {
    this.finish.uniforms.time.value = t;
    this.composer.render(dt);
  }
}
