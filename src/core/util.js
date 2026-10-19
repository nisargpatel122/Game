(function (NN) {
  'use strict';

  const U = {};
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.deg = (d) => (d * Math.PI) / 180;
  U.TAU = Math.PI * 2;
  U.hypot = (x, y) => Math.sqrt(x * x + y * y);
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.easeOut = (t) => 1 - (1 - t) * (1 - t);

  // Wrap an angle into [0, 2pi)
  U.wrap = (a) => a - U.TAU * Math.floor(a / U.TAU);

  // Small fast seedable RNG (mulberry32). Used by everything that affects the
  // game state so headless runs are reproducible.
  U.rng = function (seed) {
    let s = seed >>> 0;
    const f = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  };

  // Distance from point to segment
  U.distToSeg = function (px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const l2 = abx * abx + aby * aby;
    let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - (ax + abx * t), dy = py - (ay + aby * t);
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Segment intersection test (proper crossing), returns t along p0->p1 or -1
  U.segCross = function (p0x, p0y, p1x, p1y, ax, ay, bx, by) {
    const rx = p1x - p0x, ry = p1y - p0y;
    const sx = bx - ax, sy = by - ay;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return -1;
    const qpx = ax - p0x, qpy = ay - p0y;
    const t = (qpx * sy - qpy * sx) / den;
    const u = (qpx * ry - qpy * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
    return -1;
  };

  // Polyline helpers (arrays of [x, y] or [x, y, h])
  U.polyLength = function (pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += U.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  };

  // Catmull-Rom smoothing of a control polyline into a dense one
  U.smoothPath = function (ctrl, samplesPerSeg) {
    const out = [];
    const n = ctrl.length;
    const P = (i) => ctrl[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let s = 0; s < samplesPerSeg; s++) {
        const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
        const pt = [];
        for (let k = 0; k < p1.length; k++) {
          pt.push(0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
        }
        out.push(pt);
      }
    }
    out.push(ctrl[n - 1].slice());
    return out;
  };

  U.formatScore = function (n) {
    n = Math.floor(n);
    const s = String(n);
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ',';
      out += s[i];
    }
    return out;
  };

  NN.U = U;
})(globalThis.NN || (globalThis.NN = {}));
