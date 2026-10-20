// Tiny dependency-free test helpers shared by the headless tests.
const NN = require('../tools/load.js');

const results = [];
let current = null;

function test(name, fn) {
  results.push({ name, fn });
}

async function run() {
  let failed = 0;
  const t0 = Date.now();
  for (const r of results) {
    current = r;
    r.notes = [];
    const s = Date.now();
    try {
      await r.fn();
      console.log(`  ok   ${r.name} (${Date.now() - s} ms)`);
    } catch (e) {
      failed++;
      console.log(`  FAIL ${r.name}\n       ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e}`);
    }
    for (const n of r.notes) console.log('       ' + n);
  }
  console.log(`${results.length - failed}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return failed;
}

function note(msg) { if (current) current.notes.push(msg); }

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function makeWorld(overrides) {
  const P = NN.makePhysicsSettings(overrides);
  const T = NN.buildTable(P);
  const w = new NN.World(T, P);
  return { P, T, w };
}

function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// Is (x, y) inside the cabinet outline (ball centre, with a small tolerance)
// and outside every solid block?
function insideCabinet(T, x, y, r, tol) {
  tol = tol == null ? 2.5 : tol;
  for (const s of T.solids || []) if (inPoly(s, x, y)) return false;
  const a = T.landmarks.arc;
  if (x < 12 + r - tol || x > 498 - r + tol || y > T.height + 2) return false;
  if (y < a.cy) {
    const d = Math.hypot(x - a.cx, y - a.cy);
    if (d > a.R - r + tol) return false;
  }
  return true;
}

// A random spot where a resting ball would not overlap anything (layer 0)
function freeSpot(w, rng, region) {
  const S = NN.Shapes;
  const sc = { nx: 0, ny: 0, d: 0 };
  const r = w.P.ballRadius;
  region = region || [14, 14, 496, 1000];
  for (let tries = 0; tries < 5000; tries++) {
    const x = region[0] + rng() * (region[2] - region[0]);
    const y = region[1] + rng() * (region[3] - region[1]);
    if (!insideCabinet(w.table, x, y, r, -1)) continue;
    let ok = true;
    for (const c of w.colliders) {
      if (!(c.mask & 1) || !c.active) continue;
      S.closest(c, x, y, sc);
      if (sc.d < r + 1) { ok = false; break; }
    }
    if (!ok) continue;
    for (const f of w.flippers) {
      f.closest(x, y, sc);
      if (sc.d < r + 1) { ok = false; break; }
    }
    if (!ok) continue;
    if (!w.isOpenSpot || w.isOpenSpot(x, y)) return { x, y };
  }
  throw new Error('no free spot');
}

// Watches every substep for tunnelling (centre path crossing a wall's centre
// line or entering a solid), escapes and balls inside a flipper.
function installChecker(w, opts) {
  opts = opts || {};
  const S = NN.Shapes;
  const U = NN.U;
  const sc = { nx: 0, ny: 0, d: 0 };
  const stats = { substeps: 0, crossings: 0, inside: 0, flipperInside: 0, escapes: 0, samples: [] };
  const sample = (kind, b, extra) => {
    if (stats.samples.length < 12) stats.samples.push(`${kind} ball(${b.x.toFixed(1)},${b.y.toFixed(1)}) prev(${b.px.toFixed(1)},${b.py.toFixed(1)}) v=${Math.hypot(b.vx, b.vy).toFixed(0)} ${extra || ''}`);
  };
  w.onSubstep = function () {
    stats.substeps++;
    for (const b of w.balls) {
      if (b.state !== 'play') continue;
      const mv = Math.hypot(b.x - b.px, b.y - b.py);
      if (mv > (stats.maxMove || 0)) { stats.maxMove = mv; stats.maxMoveAt = `(${b.px.toFixed(1)},${b.py.toFixed(1)})->(${b.x.toFixed(1)},${b.y.toFixed(1)}) layer ${b.layer} v=${Math.hypot(b.vx, b.vy).toFixed(0)}`; }
      if (b.layer === 0 && !insideCabinet(w.table, b.x, b.y, b.r)) {
        stats.escapes++; sample('escape', b);
      }
      const bit = 1 << b.layer;
      const cell = w.grid[w.cellIndex(b.x, b.y)];
      for (const c of cell) {
        if (!c.active || !(c.mask & bit) || c.oneWay) continue;
        if (c.type === S.SEG) {
          if (U.segCross(b.px, b.py, b.x, b.y, c.ax, c.ay, c.bx, c.by) >= 0) { stats.crossings++; sample('cross-seg', b, c.kind + ' ' + (c.id || '')); }
          S.closest(c, b.x, b.y, sc);
          if (c.r > 0 && sc.d < -1.0) { stats.inside++; sample('inside-capsule', b, c.kind + ' d=' + sc.d.toFixed(2)); }
        } else if (c.type === S.CIRCLE) {
          S.closest(c, b.x, b.y, sc);
          if (sc.d < -0.5) { stats.inside++; sample('inside-circle', b, c.kind + ' ' + (c.id || '')); }
        } else {
          const d0 = Math.hypot(b.px - c.cx, b.py - c.cy) - c.R;
          const d1 = Math.hypot(b.x - c.cx, b.y - c.cy) - c.R;
          if (d0 * d1 < 0) {
            S.closest(c, b.x, b.y, sc);
            // only a real crossing if the point is within the arc's span
            let rel = Math.atan2(b.y - c.cy, b.x - c.cx) - c.a0;
            rel -= Math.PI * 2 * Math.floor(rel / (Math.PI * 2));
            if (rel <= c.span) { stats.crossings++; sample('cross-arc', b); }
          }
        }
      }
      if (b.layer === 0) {
        for (const f of w.flippers) {
          f.closest(b.x, b.y, sc);
          if (sc.d < -1.0) { stats.flipperInside++; sample('inside-flipper', b, f.id + ' d=' + sc.d.toFixed(2) + ' omega=' + f.omega.toFixed(1)); }
        }
      }
    }
  };
  return stats;
}

module.exports = { inPoly, NN, test, run, note, assert, makeWorld, insideCabinet, freeSpot, installChecker };
