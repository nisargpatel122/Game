// Renders the table colliders, sensors, ramps and wires to a PNG for layout work.
// Usage: node tools/debug-render.js out.png [x0 y0 x1 y1]
const path = require('path');
const fs = require('fs');
const NN = require('./load.js');

const out = process.argv[2] || 'debug.png';
const view = process.argv.length >= 7 ? process.argv.slice(3, 7).map(Number) : [0, 0, 510, 1070];
const P = NN.makePhysicsSettings();
const T = NN.buildTable(P);
const w = new NN.World(T, P);
const S = NN.Shapes;
const extraDots = process.env.DOTS ? JSON.parse(fs.readFileSync(process.env.DOTS, 'utf8')) : [];

let svg = [];
const scale = 1;
const col = (c) => {
  if (c.kind === 'bumper') return '#ff3df0';
  if (c.kind === 'sling') return '#ff9b2f';
  if (c.kind === 'target') return '#4dff7a';
  if (c.kind === 'drop') return '#ffe14d';
  if (c.kind === 'gate') return '#ffffff';
  if (c.mask & 2) return '#59a6ff';
  if (c.mask & 4) return '#59ffe8';
  return '#bbb';
};
for (const c of T.colliders) {
  const st = `stroke="${col(c)}" fill="none"`;
  if (c.type === S.SEG) {
    svg.push(`<line x1="${c.ax}" y1="${c.ay}" x2="${c.bx}" y2="${c.by}" stroke-width="${Math.max(0.8, c.r * 2)}" stroke-linecap="round" ${st} opacity="${c.mask === 1 ? 1 : 0.55}"/>`);
  } else if (c.type === S.CIRCLE) {
    svg.push(`<circle cx="${c.x}" cy="${c.y}" r="${c.R}" ${st} stroke-width="1.5"/>`);
  } else {
    const a0 = c.a0, a1 = c.a0 + c.span;
    const x0 = c.cx + Math.cos(a0) * c.R, y0 = c.cy + Math.sin(a0) * c.R;
    const x1 = c.cx + Math.cos(a1) * c.R, y1 = c.cy + Math.sin(a1) * c.R;
    const large = c.span > Math.PI ? 1 : 0;
    svg.push(`<path d="M${x0} ${y0} A${c.R} ${c.R} 0 ${large} 1 ${x1} ${y1}" stroke-width="${Math.max(0.8, c.r * 2)}" ${st}/>`);
  }
}
for (const s of T.sensors) {
  if (s.type === 'line') svg.push(`<line x1="${s.ax}" y1="${s.ay}" x2="${s.bx}" y2="${s.by}" stroke="#ff0" stroke-dasharray="3 2" stroke-width="1"/><text x="${(s.ax + s.bx) / 2 + 2}" y="${(s.ay + s.by) / 2 - 2}" font-size="7" fill="#ff0">${s.id}</text>`);
  else svg.push(`<circle cx="${s.x}" cy="${s.y}" r="${s.r}" stroke="#ff0" fill="none" stroke-dasharray="2 2"/><text x="${s.x + s.r}" y="${s.y}" font-size="7" fill="#ff0">${s.id}</text>`);
}
for (const k in T.wires) {
  const wv = T.wires[k];
  svg.push(`<polyline points="${wv.pts.map((p) => p[0] + ',' + p[1]).join(' ')}" stroke="#f0f" fill="none" stroke-width="1" stroke-dasharray="5 3"/>`);
}
for (const r of T.ramps) {
  svg.push(`<polyline points="${r.axis.map((p) => p[0] + ',' + p[1]).join(' ')}" stroke="#08f" fill="none" stroke-width="1"/>`);
}
for (const f of w.flippers) {
  for (const ang of [f.rest, f.up]) {
    const tx = f.px + Math.cos(ang) * f.length, ty = f.py + Math.sin(ang) * f.length;
    svg.push(`<line x1="${f.px}" y1="${f.py}" x2="${tx}" y2="${ty}" stroke="${ang === f.rest ? '#0f8' : '#0a5'}" stroke-width="${f.r1 + f.r2}" stroke-linecap="round" opacity="0.7"/>`);
  }
}
for (const d of extraDots) svg.push(`<circle cx="${d[0]}" cy="${d[1]}" r="${d[2] || 2}" fill="${d[3] || '#f44'}"/>`);
// ball for scale
svg.push(`<circle cx="${T.ballStart.x}" cy="${T.ballStart.y}" r="13.5" fill="#ccc"/>`);
// grid
let grid = '';
for (let x = 0; x <= 510; x += 50) grid += `<line x1="${x}" y1="0" x2="${x}" y2="1070" stroke="#333" stroke-width="0.5"/><text x="${x + 1}" y="8" font-size="7" fill="#666">${x}</text>`;
for (let y = 0; y <= 1070; y += 50) grid += `<line x1="0" y1="${y}" x2="510" y2="${y}" stroke="#333" stroke-width="0.5"/><text x="1" y="${y - 1}" font-size="7" fill="#666">${y}</text>`;

const vw = view[2] - view[0], vh = view[3] - view[1];
const px = 1000 / Math.max(vw, vh) * (vh > vw ? vh / vh : 1);
const W = Math.round(vw * (1600 / vh)), H = 1600;
const doc = `<html><body style="margin:0;background:#000"><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${view.join(' ').replace(/(\S+) (\S+) (\S+) (\S+)/, (m, a, b, c, d) => `${a} ${b} ${c - a} ${d - b}`)}" style="background:#0a0a14">${grid}${svg.join('\n')}</svg></body></html>`;
const tmp = path.join(require('os').tmpdir(), 'nn-debug.html');
fs.writeFileSync(tmp, doc);
(async () => {
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.goto('file://' + tmp);
  await p.screenshot({ path: out });
  await b.close();
  console.log('wrote', out, W + 'x' + H);
})();
