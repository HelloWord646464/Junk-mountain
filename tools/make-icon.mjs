// Draws the app icon (a junk heap at sunset with the golden ticket on top)
// and writes build/icon.png, build/icon.ico and public/icon.png.
import sharp from 'sharp';
import fs from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2b3b52"/><stop offset="0.45" stop-color="#c8693a"/><stop offset="0.75" stop-color="#f2b04a"/>
  </linearGradient>
  <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff1c2"/><stop offset="1" stop-color="#ffd36a" stop-opacity="0"/></radialGradient>
  <linearGradient id="ticket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#e3a514"/></linearGradient>
  <clipPath id="r"><rect x="24" y="24" width="976" height="976" rx="200"/></clipPath>
</defs>
<g clip-path="url(#r)">
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <circle cx="700" cy="560" r="260" fill="url(#sun)"/>
  <circle cx="700" cy="560" r="92" fill="#ffe6a3"/>
  <path d="M-20 1040 L120 760 L190 790 L260 640 L330 660 L420 430 L470 455 L520 330 L600 420 L650 400 L720 560 L790 590 L860 740 L930 760 L1044 1040 Z" fill="#17120d"/>
  <g fill="#2a2119">
    <rect x="300" y="700" width="120" height="70" rx="8" transform="rotate(-12 360 735)"/>
    <circle cx="610" cy="690" r="58" fill="none" stroke="#2a2119" stroke-width="26"/>
    <rect x="470" y="560" width="90" height="120" rx="10" transform="rotate(18 515 620)"/>
    <rect x="690" y="760" width="140" height="56" rx="10" transform="rotate(8 760 788)"/>
    <rect x="200" y="840" width="160" height="60" rx="10" transform="rotate(-6 280 870)"/>
    <circle cx="430" cy="900" r="44"/>
    <rect x="560" y="820" width="70" height="110" rx="12" transform="rotate(-20 595 875)"/>
  </g>
  <g transform="translate(520 300) rotate(-16)">
    <rect x="-120" y="-62" width="240" height="124" rx="10" fill="url(#ticket)" stroke="#7a5200" stroke-width="8"/>
    <rect x="-96" y="-38" width="192" height="76" rx="6" fill="none" stroke="#7a5200" stroke-width="5" stroke-dasharray="14 10"/>
    <text x="0" y="22" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="62" fill="#5a3b00">$4.2M</text>
  </g>
  <g fill="#fff6d6">
    <path d="M700 180 l14 40 40 14 -40 14 -14 40 -14 -40 -40 -14 40 -14z"/>
    <path d="M330 250 l9 26 26 9 -26 9 -9 26 -9 -26 -26 -9 26 -9z"/>
  </g>
</g>
</svg>`;

fs.mkdirSync('build', { recursive: true });
fs.mkdirSync('public', { recursive: true });
await sharp(Buffer.from(svg)).png().toFile('build/icon.png');
await sharp(Buffer.from(svg)).resize(256, 256).png().toFile('public/icon.png');
// ICO with embedded PNGs
const sizes = [256, 128, 64, 48, 32, 16];
const pngs = await Promise.all(sizes.map(s => sharp(Buffer.from(svg)).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s >= 256 ? 0 : s, e); header.writeUInt8(s >= 256 ? 0 : s, e + 1);
  header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync('build/icon.ico', Buffer.concat([header, ...pngs]));
console.log('icon written');
