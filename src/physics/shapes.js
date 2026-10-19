/*
 * Collider shapes and closest-point queries.
 *
 * Every static collider is one of:
 *   SEG     segment A-B with thickness radius r (r > 0 makes it a capsule)
 *   CIRCLE  centre + radius (posts, bumpers)
 *   ARC     circular arc (centre, radius R, angles a0 -> a0+span) with thickness r
 *
 * Queries write into a shared scratch object to avoid allocations in the hot loop:
 *   out.nx, out.ny  unit normal from the surface toward the query point
 *   out.d           distance from the surface (negative = inside)
 */
(function (NN) {
  'use strict';

  const SEG = 1, CIRCLE = 2, ARC = 3;
  const TAU = Math.PI * 2;

  function base(type, opts) {
    opts = opts || {};
    const matName = opts.mat || 'wall';
    const mat = NN.MATERIALS[matName];
    if (!mat) throw new Error('unknown material ' + matName);
    return {
      type: type,
      mat: mat,
      matName: matName,
      mask: opts.mask == null ? 1 : opts.mask,   // layer bitmask: bit0 playfield, bit1 left ramp, bit2 right ramp
      kind: opts.kind || 'wall',                 // wall | post | bumper | sling | target | drop | gate | ...
      id: opts.id || null,
      active: true,
      oneWay: opts.oneWay || null,               // {nx, ny}: only blocks balls on that side moving against it
      style: opts.style || null,                 // render hints
      cooldown: 0,
      lastHit: -1,
    };
  }

  const Shapes = {
    SEG: SEG, CIRCLE: CIRCLE, ARC: ARC,

    seg(ax, ay, bx, by, opts) {
      const c = base(SEG, opts);
      c.ax = ax; c.ay = ay; c.bx = bx; c.by = by;
      c.r = (opts && opts.r) || 0;
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      c.invLen2 = l2 > 0 ? 1 / l2 : 0;
      c.len = Math.sqrt(l2);
      // left-hand normal, used when the ball centre sits exactly on the line
      c.nx = c.len > 0 ? -dy / c.len : 0;
      c.ny = c.len > 0 ? dx / c.len : 1;
      return c;
    },

    circle(x, y, R, opts) {
      const c = base(CIRCLE, opts);
      c.x = x; c.y = y; c.R = R;
      return c;
    },

    // Arc from angle a0 sweeping positively (clockwise on screen, since y is down)
    // by span radians.
    arc(cx, cy, R, a0, span, opts) {
      const c = base(ARC, opts);
      c.cx = cx; c.cy = cy; c.R = R;
      c.a0 = a0 - TAU * Math.floor(a0 / TAU);
      c.span = span;
      c.r = (opts && opts.r) || 0;
      c.e0x = cx + Math.cos(a0) * R; c.e0y = cy + Math.sin(a0) * R;
      c.e1x = cx + Math.cos(a0 + span) * R; c.e1y = cy + Math.sin(a0 + span) * R;
      return c;
    },

    // Chain of capsules through points
    polyline(pts, opts) {
      const out = [];
      for (let i = 1; i < pts.length; i++) {
        out.push(Shapes.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], opts));
      }
      return out;
    },

    closest(c, x, y, out) {
      if (c.type === SEG) {
        const abx = c.bx - c.ax, aby = c.by - c.ay;
        let t = ((x - c.ax) * abx + (y - c.ay) * aby) * c.invLen2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (c.ax + abx * t), dy = y - (c.ay + aby * t);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-7) {
          out.nx = c.nx; out.ny = c.ny; out.d = -c.r;
        } else {
          out.nx = dx / dist; out.ny = dy / dist; out.d = dist - c.r;
        }
        return;
      }
      if (c.type === CIRCLE) {
        const dx = x - c.x, dy = y - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-7) { out.nx = 0; out.ny = -1; out.d = -c.R; return; }
        out.nx = dx / dist; out.ny = dy / dist; out.d = dist - c.R;
        return;
      }
      // ARC
      const dx = x - c.cx, dy = y - c.cy;
      let rel = Math.atan2(dy, dx) - c.a0;
      rel -= TAU * Math.floor(rel / TAU);
      if (rel <= c.span) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-7) { out.nx = 0; out.ny = -1; out.d = c.R - c.r; return; }
        const radial = dist - c.R;
        const s = radial >= 0 ? 1 : -1;
        out.nx = (dx / dist) * s; out.ny = (dy / dist) * s;
        out.d = radial * s - c.r;
        return;
      }
      // beyond the ends: nearest endpoint
      const d0x = x - c.e0x, d0y = y - c.e0y, d1x = x - c.e1x, d1y = y - c.e1y;
      const q0 = d0x * d0x + d0y * d0y, q1 = d1x * d1x + d1y * d1y;
      const ex = q0 < q1 ? d0x : d1x, ey = q0 < q1 ? d0y : d1y;
      const dist = Math.sqrt(q0 < q1 ? q0 : q1);
      if (dist < 1e-7) { out.nx = 0; out.ny = -1; out.d = -c.r; return; }
      out.nx = ex / dist; out.ny = ey / dist; out.d = dist - c.r;
    },

    // Axis-aligned bounds (for grid insertion)
    bounds(c) {
      if (c.type === SEG) {
        return [Math.min(c.ax, c.bx) - c.r, Math.min(c.ay, c.by) - c.r, Math.max(c.ax, c.bx) + c.r, Math.max(c.ay, c.by) + c.r];
      }
      if (c.type === CIRCLE) return [c.x - c.R, c.y - c.R, c.x + c.R, c.y + c.R];
      const ext = c.R + c.r;
      return [c.cx - ext, c.cy - ext, c.cx + ext, c.cy + ext];
    },
  };

  NN.Shapes = Shapes;
})(globalThis.NN || (globalThis.NN = {}));
