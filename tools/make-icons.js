// Draws the app icons in code (headless Chromium canvas) and writes them as
// PNGs: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
// and src/favicon.txt (a small data: URI baked into index.html so the tab has
// an icon without any network request). Dev tool only:
//   node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const root = path.join(__dirname, '..');

function draw(size, maskable) {
  /* runs in the browser */
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const S = size / 512;
  g.scale(S, S);
  // deep space background
  const bg = g.createRadialGradient(256, 220, 20, 256, 256, 380);
  bg.addColorStop(0, '#2a0b4d'); bg.addColorStop(0.55, '#10032a'); bg.addColorStop(1, '#05010d');
  g.fillStyle = bg;
  if (maskable) g.fillRect(0, 0, 512, 512);
  else { g.beginPath(); g.roundRect(0, 0, 512, 512, 108); g.fill(); }
  // nebula wisps
  g.globalCompositeOperation = 'lighter';
  const neb = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  neb(150, 170, 220, 'rgba(196,43,216,0.30)');
  neb(380, 360, 220, 'rgba(26,140,255,0.26)');
  // stars
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 46; i++) {
    const x = 40 + rnd() * 432, y = 40 + rnd() * 432, r = 1 + rnd() * 2.2;
    g.fillStyle = 'rgba(255,255,255,' + (0.35 + rnd() * 0.6) + ')';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const k = maskable ? 0.78 : 1;   // keep the art inside the maskable safe zone
  g.translate(256, 256); g.scale(k, k); g.translate(-256, -256);
  // neon arch (like the cabinet top) in magenta
  const tube = (fn, col, w) => {
    g.save();
    g.lineCap = 'round';
    g.shadowColor = col; g.shadowBlur = 34;
    g.strokeStyle = col; g.lineWidth = w; fn(); g.stroke();
    g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = w * 0.35; fn(); g.stroke();
    g.restore();
  };
  tube(() => { g.beginPath(); g.arc(256, 268, 170, Math.PI * 1.03, Math.PI * 1.97); }, '#ff3df0', 20);
  // two cyan flippers
  const flipper = (x, y, ang) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.arc(0, 0, 22, Math.PI / 2, Math.PI * 1.5); g.lineTo(104, -10); g.arc(104, 0, 10, -Math.PI / 2, Math.PI / 2); g.closePath();
    g.shadowColor = '#36e2ff'; g.shadowBlur = 26;
    g.fillStyle = 'rgba(20,60,110,0.9)'; g.fill();
    g.strokeStyle = '#36e2ff'; g.lineWidth = 9; g.stroke();
    g.restore();
  };
  flipper(142, 390, 0.5);
  flipper(370, 390, Math.PI - 0.5);
  // planet ring behind / in front of the chrome ball
  const ring = (front) => {
    g.save(); g.translate(256, 250); g.rotate(-0.32);
    g.beginPath(); g.ellipse(0, 0, 138, 40, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    g.shadowColor = '#ffb238'; g.shadowBlur = 22;
    g.strokeStyle = '#ffb238'; g.lineWidth = 11; g.stroke();
    g.shadowBlur = 0; g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 3.5; g.stroke();
    g.restore();
  };
  ring(false);
  // chrome ball
  const bx = 256, by = 250, br = 84;
  g.save();
  g.shadowColor = 'rgba(54,226,255,0.65)'; g.shadowBlur = 40;
  const bg2 = g.createRadialGradient(bx - 30, by - 34, 6, bx, by, br);
  bg2.addColorStop(0, '#ffffff'); bg2.addColorStop(0.25, '#e4e9f5'); bg2.addColorStop(0.6, '#8590a8'); bg2.addColorStop(0.85, '#3a3f55'); bg2.addColorStop(1, '#1a1c2a');
  g.fillStyle = bg2; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
  g.restore();
  // reflections: horizon band and neon glints
  g.save();
  g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.clip();
  g.fillStyle = 'rgba(20,10,40,0.45)'; g.fillRect(bx - br, by + 10, br * 2, 30);
  g.fillStyle = 'rgba(255,61,240,0.55)'; g.fillRect(bx - br, by + 40, br * 2, 6);
  g.fillStyle = 'rgba(54,226,255,0.5)'; g.fillRect(bx - br, by + 52, br * 2, 4);
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.ellipse(bx - 30, by - 36, 22, 13, -0.6, 0, Math.PI * 2); g.fill();
  ring(true);
  return c.toDataURL('image/png');
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  const out = [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
    ['apple-touch-icon.png', 180, true],   // iOS rounds the corners itself
    ['favicon', 64, false],
  ];
  for (const [name, size, mask] of out) {
    const url = await page.evaluate(`(${draw.toString()})(${size}, ${mask})`);
    if (name === 'favicon') {
      fs.writeFileSync(path.join(root, 'src/favicon.txt'), url);
      console.log('src/favicon.txt', (url.length / 1024).toFixed(1) + ' KB');
    } else {
      fs.writeFileSync(path.join(root, name), Buffer.from(url.split(',')[1], 'base64'));
      console.log(name, size + 'px');
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
