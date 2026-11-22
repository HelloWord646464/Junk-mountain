import * as THREE from 'three';

// Small procedural textures drawn on canvases.
const canvasTex = (w, h, draw, srgb = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
};

export const hazardTexture = () => canvasTex(256, 64, (x, w, h) => {
  x.fillStyle = '#e8b20e'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#16130f';
  for (let i = -h; i < w + h; i += 64) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 32, h); x.lineTo(i + 32 + h, 0); x.lineTo(i + h, 0); x.fill(); }
  // wear
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(60,45,30,${Math.random() * 0.25})`; x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3); }
});

export const beltTexture = () => canvasTex(128, 256, (x, w, h) => {
  x.fillStyle = '#1b1a19'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2000; i++) { const g = 20 + Math.random() * 25; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  x.strokeStyle = '#3a3835'; x.lineWidth = 10;
  for (let y = 0; y < h; y += 64) { x.beginPath(); x.moveTo(14, y + 44); x.lineTo(w / 2, y + 14); x.lineTo(w - 14, y + 44); x.stroke(); }
  x.fillStyle = '#0f0e0d'; x.fillRect(0, 0, 6, h); x.fillRect(w - 6, 0, 6, h);
});

export const newspaperTexture = () => canvasTex(512, 360, (x, w, h) => {
  x.fillStyle = '#e9e1cf'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#1a1712'; x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center';
  x.fillText('THE DAILY HEAP', w / 2, 62);
  x.fillRect(20, 76, w - 40, 3); x.fillRect(20, 84, w - 40, 1);
  x.font = 'bold 34px Georgia, serif'; x.fillText('$4.2M TICKET', w / 2, 128); x.fillText('THROWN AWAY!', w / 2, 166);
  x.fillStyle = '#58524a';
  for (let col = 0; col < 3; col++) for (let l = 0; l < 14; l++) x.fillRect(24 + col * 160, 190 + l * 11, 140 - Math.random() * 30, 5);
  x.fillStyle = '#8c8478'; x.fillRect(340, 190, 150, 100);
});

export const labelTexture = (text, bg = '#16130f', fg = '#f3e7c9', w = 512, h = 128) => canvasTex(w, h, (x) => {
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.font = `700 ${Math.floor(h * 0.55)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 4);
});

export const signTexture = () => canvasTex(1024, 256, (x, w, h) => {
  x.fillStyle = '#20343a'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#e8b20e'; x.lineWidth = 14; x.strokeRect(14, 14, w - 28, h - 28);
  x.fillStyle = '#f3e7c9'; x.font = '800 104px "Barlow Condensed", "Arial Narrow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('JUNK MOUNTAIN SALVAGE', w / 2, h / 2 + 6);
  for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(90,60,30,${Math.random() * 0.25})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});

export const radialFade = () => canvasTex(256, 256, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, '#fff'); g.addColorStop(0.75, '#fff'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, false);

export const screenTexture = (lines) => {
  const tex = canvasTex(512, 320, () => {});
  tex.draw = (ls) => {
    const c = tex.image, x = c.getContext('2d');
    x.fillStyle = '#071a12'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#5dff9a'; x.font = '600 40px "IBM Plex Mono", monospace';
    ls.forEach((l, i) => x.fillText(l, 24, 60 + i * 56));
    for (let y = 0; y < c.height; y += 4) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, y, c.width, 2); }
    tex.needsUpdate = true;
  };
  tex.draw(lines);
  return tex;
};
