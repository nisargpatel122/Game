/*
 * The pinball physics world.
 *
 * Fixed tick (default 480 Hz) with adaptive substeps so no ball moves more than
 * maxSubstepMove * radius per substep relative to anything it can hit. That,
 * plus thick colliders, a speed cap and a crossing guard on the flippers, is
 * what keeps the ball from ever tunnelling.
 *
 * Ball states:
 *   play   simulated on its layer (0 playfield, 1+ ramps)
 *   wire   riding a wire-form return along a fixed path
 *   held   parked by the game (scoop, lock)
 *   gone   drained / removed
 */
(function (NN) {
  'use strict';

  const S = NN.Shapes;
  const scratch = { nx: 0, ny: 0, d: 0, lat: 0, ax: 0 };
  const CELL = 32;

  function World(table, P) {
    this.table = table;
    this.P = P;
    this.time = 0;
    this.balls = [];
    this.events = [];
    this.nextBallId = 1;
    this.colliders = table.colliders;
    this.W = table.width; this.H = table.height;
    this.cols = Math.ceil((this.W + 40) / CELL);
    this.rows = Math.ceil((this.H + 80) / CELL);
    this.flippers = table.flippers.map((f) => new NN.Flipper(f, P));
    this.flipperById = {};
    for (const f of this.flippers) this.flipperById[f.id] = f;
    this.sensors = table.sensors || [];
    this.ramps = table.ramps || [];
    this.rampByLayer = {};
    for (const r of this.ramps) this.rampByLayer[r.layer] = r;
    this.wires = table.wires || {};
    for (const k in this.wires) prepWire(this.wires[k]);
    this.spinners = (table.spinners || []).map((s) => ({ def: s, angle: 0, omega: 0, acc: 0 }));
    this.gates = {};
    this.plunger = table.plunger ? {
      def: table.plunger, pull: 0, vel: 0, pulling: false, launching: false, launchSpeed: 0,
      x0: table.plunger.x0, x1: table.plunger.x1, yRest: table.plunger.y,
    } : null;
    this.buildGrid();
    this.updateGravity();
    this.lastSubsteps = 1;
    this.maxSubstepsSeen = 0;
    this.debugCross = null; // set to an array to record wall crossings (tests)
  }

  World.prototype.updateGravity = function () {
    const P = this.P;
    this.g = P.gravity * Math.sin((P.slopeDeg * Math.PI) / 180) * P.rollingInertia * P.gravityScale;
  };

  // ---------------------------------------------------------------- grid ---
  World.prototype.buildGrid = function () {
    const n = this.cols * this.rows;
    this.grid = new Array(n);
    this.sgrid = new Array(n);
    for (let i = 0; i < n; i++) { this.grid[i] = []; this.sgrid[i] = []; }
    const margin = this.P.ballRadius * 1.6 + 8 + CELL * 0.7072;
    for (const c of this.colliders) this.insert(this.grid, c, margin, (cx, cy) => {
      S.closest(c, cx, cy, scratch);
      return scratch.d;
    });
    for (const s of this.sensors) this.insert(this.sgrid, s, margin, (cx, cy) => {
      if (s.type === 'circle') return Math.hypot(cx - s.x, cy - s.y) - s.r;
      return NN.U.distToSeg(cx, cy, s.ax, s.ay, s.bx, s.by);
    });
  };

  World.prototype.insert = function (grid, obj, margin, distFn) {
    let b;
    if (obj.type === 'circle') b = [obj.x - obj.r, obj.y - obj.r, obj.x + obj.r, obj.y + obj.r];
    else if (obj.type === 'line') b = [Math.min(obj.ax, obj.bx), Math.min(obj.ay, obj.by), Math.max(obj.ax, obj.bx), Math.max(obj.ay, obj.by)];
    else b = S.bounds(obj);
    const c0 = Math.max(0, Math.floor((b[0] - margin + 20) / CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((b[2] + margin + 20) / CELL));
    const r0 = Math.max(0, Math.floor((b[1] - margin + 40) / CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((b[3] + margin + 40) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cx = c * CELL - 20 + CELL / 2, cy = r * CELL - 40 + CELL / 2;
        if (distFn(cx, cy) < margin) grid[r * this.cols + c].push(obj);
      }
    }
  };

  World.prototype.cellIndex = function (x, y) {
    let c = Math.floor((x + 20) / CELL), r = Math.floor((y + 40) / CELL);
    if (c < 0) c = 0; else if (c >= this.cols) c = this.cols - 1;
    if (r < 0) r = 0; else if (r >= this.rows) r = this.rows - 1;
    return r * this.cols + c;
  };

  // --------------------------------------------------------------- balls ---
  World.prototype.addBall = function (x, y, vx, vy, layer) {
    const b = {
      id: this.nextBallId++, x: x, y: y, vx: vx || 0, vy: vy || 0, px: x, py: y,
      r: this.P.ballRadius, layer: layer || 0, state: 'play',
      wire: null, ws: 0, wv: 0, h: 0, inside: {}, flags: {}, flipSide: {},
      lastActive: this.time, holder: null, trail: [],
    };
    this.balls.push(b);
    return b;
  };

  World.prototype.removeBall = function (b) {
    b.state = 'gone';
    const i = this.balls.indexOf(b);
    if (i >= 0) this.balls.splice(i, 1);
  };

  World.prototype.activeBalls = function () {
    let n = 0;
    for (const b of this.balls) if (b.state === 'play' || b.state === 'wire') n++;
    return n;
  };

  World.prototype.emit = function (e) { this.events.push(e); };

  // ---------------------------------------------------------------- step ---
  World.prototype.tick = function (dt) {
    const P = this.P;
    let maxV = 0;
    for (const b of this.balls) {
      if (b.state !== 'play') continue;
      const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (v > maxV) maxV = v;
    }
    // worst case the ball also gains up to g*dt this tick
    maxV = Math.min(P.maxSpeed, maxV + this.g * dt);
    let maxF = 0;
    for (const f of this.flippers) {
      const fv = Math.max(Math.abs(f.omega), f.pressed ? P.flipperUpMaxSpeed * P.flipperPower : 0) * f.reach;
      if (fv > maxF) maxF = fv;
    }
    let pv = 0;
    if (this.plunger) pv = Math.max(Math.abs(this.plunger.vel), this.plunger.launching ? this.plunger.launchSpeed : 0);
    const step = P.ballRadius * P.maxSubstepMove;
    let n = Math.ceil(((maxV + maxF + pv) * dt) / step);
    if (n < 1) n = 1;
    if (n > P.maxSubsteps) n = P.maxSubsteps;
    this.lastSubsteps = n;
    if (n > this.maxSubstepsSeen) this.maxSubstepsSeen = n;
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
    // spinners decay per tick
    for (const sp of this.spinners) {
      if (sp.omega !== 0) {
        const fr = sp.def.friction || 6;
        sp.omega -= sp.omega * fr * dt;
        const s = Math.sign(sp.omega);
        sp.omega -= s * (sp.def.drag || 4) * dt;
        if (Math.sign(sp.omega) !== s) sp.omega = 0;
        sp.angle += sp.omega * dt;
        sp.acc += Math.abs(sp.omega * dt);
        while (sp.acc >= Math.PI) {
          sp.acc -= Math.PI;
          this.emit({ type: 'spin', id: sp.def.id });
        }
      }
    }
    for (const k in this.gates) {
      const g = this.gates[k];
      g.swing *= Math.exp(-6 * dt);
    }
  };

  World.prototype.substep = function (h) {
    for (const f of this.flippers) f.update(h);
    if (this.plunger) this.updatePlunger(h);
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.state === 'play') this.moveBall(b, h);
      else if (b.state === 'wire') this.advanceWire(b, h);
    }
    if (balls.length > 1) this.collideBalls();
    this.time += h;
    if (this.onSubstep) this.onSubstep(h);
  };

  World.prototype.moveBall = function (b, h) {
    const P = this.P;
    // forces
    let ax = 0, ay = this.g;
    if (b.layer > 0) {
      const ramp = this.rampByLayer[b.layer];
      if (ramp) {
        const t = rampTangent(ramp, b.x, b.y);
        ax -= t.tx * ramp.slopeAccel;
        ay -= t.ty * ramp.slopeAccel;
        b.h = t.h;
      }
    } else {
      b.h = 0;
    }
    b.vx += ax * h; b.vy += ay * h;
    let sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > 0) {
      let ns = sp - P.rollingFriction * h - sp * P.airDrag * h;
      if (ns < 0) ns = 0;
      if (ns > P.maxSpeed) ns = P.maxSpeed;
      const k = ns / sp;
      b.vx *= k; b.vy *= k;
    }
    b.px = b.x; b.py = b.y;
    b.x += b.vx * h; b.y += b.vy * h;

    this.collideStatic(b);
    if (b.layer === 0) {
      for (let i = 0; i < this.flippers.length; i++) this.collideFlipper(b, this.flippers[i]);
      if (this.plunger) this.collidePlunger(b);
    }
    this.checkSensors(b);

    if (b.y > this.table.drainY && b.x < this.table.drainMaxX) {
      b.state = 'gone';
      this.emit({ type: 'drain', ball: b, x: b.x });
    } else if (!(b.x > -30 && b.x < this.W + 30 && b.y > -60) || b.x !== b.x || b.y !== b.y) {
      this.emit({ type: 'escape', ball: b, x: b.x, y: b.y });
      b.state = 'gone';
    }
  };

  World.prototype.restitution = function (mat, vin) {
    if (vin < this.P.restThreshold) return 0;
    let f = vin / 4000;
    if (f > 1) f = 1;
    return mat.e * (1 - mat.eFall * f) * this.P.bounciness;
  };

  World.prototype.collideStatic = function (b) {
    const cell = this.grid[this.cellIndex(b.x, b.y)];
    const bit = 1 << b.layer;
    const br = b.r;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (let i = 0; i < cell.length; i++) {
        const c = cell[i];
        if (!c.active || !(c.mask & bit)) continue;
        S.closest(c, b.x, b.y, scratch);
        const pen = br - scratch.d;
        if (pen <= 0) continue;
        const nx = scratch.nx, ny = scratch.ny;
        if (c.oneWay) {
          // gate: only blocks balls on its normal side moving against the normal
          const side = (b.x - c.ax) * c.oneWay.nx + (b.y - c.ay) * c.oneWay.ny;
          if (side < 0) {
            if (!c.passing) { c.passing = true; this.gateSwing(c, b); }
            continue;
          }
          if (b.vx * c.oneWay.nx + b.vy * c.oneWay.ny > 0) { c.passing = false; continue; }
        }
        this.resolveStatic(b, c, nx, ny, pen);
        any = true;
      }
      if (!any) break;
    }
  };

  World.prototype.gateSwing = function (c, b) {
    const g = this.gates[c.id] || (this.gates[c.id] = { swing: 0 });
    g.swing = 1;
    this.emit({ type: 'gate', id: c.id, ball: b });
  };

  World.prototype.resolveStatic = function (b, c, nx, ny, pen) {
    const P = this.P;
    b.x += nx * pen; b.y += ny * pen;
    const vn = b.vx * nx + b.vy * ny;
    const kind = c.kind;
    if (vn < 0 || kind === 'bumper') {
      const vin = -vn;
      if (vn < 0) {
        const e = this.restitution(c.mat, vin);
        const jn = (1 + e) * vin;
        b.vx += jn * nx; b.vy += jn * ny;
        // Coulomb friction on the tangential velocity, capped at the rolling limit (2/7)
        const tx = -ny, ty = nx;
        const vt = b.vx * tx + b.vy * ty;
        let f = c.mat.mu * jn;
        const lim = Math.abs(vt) * (2 / 7);
        if (f > lim) f = lim;
        const dv = vt > 0 ? -f : f;
        b.vx += dv * tx; b.vy += dv * ty;
      }
      const t = this.time;
      if (kind === 'bumper') {
        if (t - c.lastHit > P.bumperCooldown) {
          c.lastHit = t;
          const cur = b.vx * nx + b.vy * ny;
          const add = P.bumperKick - cur;
          if (add > 0) { b.vx += add * nx; b.vy += add * ny; }
          this.emit({ type: 'bumper', id: c.id, ball: b, x: b.x - nx * b.r, y: b.y - ny * b.r, speed: vin });
          b.lastActive = t;
        }
        return;
      }
      if (kind === 'sling' && vin > P.slingThreshold && t - c.lastHit > P.slingCooldown) {
        c.lastHit = t;
        const cur = b.vx * nx + b.vy * ny;
        const add = P.slingKick - cur;
        if (add > 0) { b.vx += add * nx; b.vy += add * ny; }
        this.emit({ type: 'sling', id: c.id, ball: b, x: b.x - nx * b.r, y: b.y - ny * b.r, speed: vin });
        b.lastActive = t;
        return;
      }
      if (vin > 60) {
        if (kind === 'target' || kind === 'drop') {
          if (t - c.lastHit > 0.12) {
            c.lastHit = t;
            this.emit({ type: kind, id: c.id, ball: b, speed: vin, x: b.x - nx * b.r, y: b.y - ny * b.r });
            b.lastActive = t;
          }
        } else if (vin > 150) {
          this.emit({ type: 'hit', kind: kind, mat: c.matName, id: c.id, ball: b, speed: vin, x: b.x - nx * b.r, y: b.y - ny * b.r });
        }
      }
    }
  };

  World.prototype.collideFlipper = function (b, f) {
    const dx = b.x - f.px, dy = b.y - f.py;
    const lim = f.reach + b.r + 4;
    if (dx * dx + dy * dy > lim * lim) { b.flipSide[f.id] = 0; return; }
    f.closest(b.x, b.y, scratch);
    const br = b.r;
    let nx = scratch.nx, ny = scratch.ny, d = scratch.d;
    const lat = scratch.lat, axc = scratch.ax;
    // Crossing guard: if the ball centre switched sides of the bat axis while
    // alongside it, it was pushed through. Put it back on the side it came from.
    const prevSide = b.flipSide[f.id] || 0;
    const sideNow = lat >= 0 ? 1 : -1;
    if (prevSide !== 0 && sideNow !== prevSide && axc > -f.r1 * 0.5 && axc < f.length + f.r2 * 0.5) {
      const hw = f.halfWidthAt(axc);
      // lateral axis (-s, c)
      const wx = -f.sin, wy = f.cos;
      nx = wx * prevSide; ny = wy * prevSide;
      d = Math.abs(lat) * -1 - hw; // deep inside
      this.crossFixes = (this.crossFixes || 0) + 1;
    } else {
      b.flipSide[f.id] = sideNow;
    }
    const pen = br - d;
    if (pen <= 0) return;
    b.x += nx * pen; b.y += ny * pen;
    if (prevSide !== 0 && sideNow !== prevSide) b.flipSide[f.id] = prevSide;
    // surface velocity at the contact point
    const cx = b.x - nx * br - f.px, cy = b.y - ny * br - f.py;
    const ux = -f.omega * cy, uy = f.omega * cx;
    let rvx = b.vx - ux, rvy = b.vy - uy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const vin = -vn;
      const e = this.restitution(f.mat, vin);
      const jn = (1 + e) * vin;
      rvx += jn * nx; rvy += jn * ny;
      const tx = -ny, ty = nx;
      const vt = rvx * tx + rvy * ty;
      let fr = f.mat.mu * jn;
      const limf = Math.abs(vt) * (2 / 7);
      if (fr > limf) fr = limf;
      const dv = vt > 0 ? -fr : fr;
      rvx += dv * tx; rvy += dv * ty;
      b.vx = rvx + ux; b.vy = rvy + uy;
      if (vin > 120) this.emit({ type: 'hit', kind: 'flipper', id: f.id, ball: b, speed: vin, x: b.x - nx * br, y: b.y - ny * br });
      if (Math.abs(f.omega) > 5) b.lastActive = this.time;
    }
  };

  // ------------------------------------------------------------- plunger ---
  World.prototype.updatePlunger = function (h) {
    const pl = this.plunger, P = this.P;
    const prev = pl.pull;
    if (pl.launching) {
      pl.pull -= pl.launchSpeed * h;
      if (pl.pull <= 0) {
        pl.pull = 0;
        pl.launching = false;
        this.emit({ type: 'plungerStop', speed: pl.launchSpeed });
      }
    } else if (pl.pulling) {
      pl.pull += P.plungerPullSpeed * P.plungerMaxPull * h;
      if (pl.pull > P.plungerMaxPull) pl.pull = P.plungerMaxPull;
    }
    pl.vel = (pl.pull - prev) / h; // + = moving toward the player
  };

  World.prototype.plungerPull = function (on) {
    const pl = this.plunger;
    if (!pl) return;
    if (on) {
      if (!pl.launching) pl.pulling = true;
    } else if (pl.pulling) {
      pl.pulling = false;
      this.plungerRelease();
    }
  };

  World.prototype.plungerRelease = function () {
    const pl = this.plunger, P = this.P;
    const frac = pl.pull / P.plungerMaxPull;
    if (frac < 0.02) { pl.pull = 0; return; }
    pl.launching = true;
    pl.launchSpeed = P.plungerMinLaunch + (P.plungerMaxLaunch - P.plungerMinLaunch) * frac;
    this.emit({ type: 'plungerRelease', power: frac });
  };

  // Set the pull to a given fraction and release at once (auto-launch, bots, tests)
  World.prototype.plungerLaunch = function (frac) {
    const pl = this.plunger;
    pl.pulling = false;
    pl.pull = this.P.plungerMaxPull * frac;
    this.plungerRelease();
  };

  World.prototype.collidePlunger = function (b) {
    const pl = this.plunger;
    if (b.x < pl.x0 - b.r || b.x > pl.x1 + b.r) return;
    const tipY = pl.yRest + pl.pull;
    const d = tipY - b.y; // ball above the tip
    if (d >= b.r || d < -b.r) return;
    const pen = b.r - d;
    b.y -= pen;
    const uy = pl.vel;
    const rvy = b.vy - uy;
    if (rvy > 0) {
      // pushed by a launching plunger: ball leaves at plunger speed; falling ball: small bounce
      const e = uy < -10 ? 0 : rvy > 200 ? 0.25 : 0;
      b.vy = uy - e * rvy;
      b.vx *= 0.9;
      if (rvy > 200 && uy >= -10) this.emit({ type: 'hit', kind: 'plunger', ball: b, speed: rvy, x: b.x, y: tipY });
    }
  };

  // -------------------------------------------------------------- sensors ---
  World.prototype.checkSensors = function (b) {
    const list = this.sgrid[this.cellIndex(b.x, b.y)];
    if (!list.length) return;
    const bit = 1 << b.layer;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!(s.mask & bit)) continue;
      if (s.type === 'line') {
        const t = NN.U.segCross(b.px, b.py, b.x, b.y, s.ax, s.ay, s.bx, s.by);
        if (t < 0) continue;
        const dir = (b.x - b.px) * s.dx + (b.y - b.py) * s.dy >= 0 ? 1 : -1;
        this.sensorCross(b, s, dir);
        if (b.state !== 'play') return;
      } else {
        const dx = b.x - s.x, dy = b.y - s.y;
        const inNow = dx * dx + dy * dy < s.r * s.r;
        const was = !!b.inside[s.id];
        if (inNow !== was) {
          b.inside[s.id] = inNow;
          if (inNow) {
            this.emit({ type: 'sensor', id: s.id, enter: true, ball: b, speed: Math.hypot(b.vx, b.vy) });
            b.lastActive = this.time;
            if (s.capture) {
              b.state = 'held';
              b.holder = s.id;
              b.vx = b.vy = 0;
              b.x = s.x; b.y = s.y;
              this.emit({ type: 'capture', id: s.id, ball: b });
              return;
            }
          }
        }
      }
    }
  };

  World.prototype.sensorCross = function (b, s, dir) {
    b.lastActive = this.time;
    this.emit({ type: 'sensor', id: s.id, dir: dir, ball: b, speed: Math.hypot(b.vx, b.vy) });
    const acts = s.actions;
    if (!acts) return;
    for (const a of acts) {
      if (a.dir && a.dir !== dir) continue;
      if (a.layer != null && a.fromLayer != null && b.layer !== a.fromLayer) continue;
      if (a.do === 'layer') {
        b.layer = a.to;
      } else if (a.do === 'flag') {
        b.flags[a.flag] = a.value;
      } else if (a.do === 'wire') {
        if (a.requireFlag && !b.flags[a.requireFlag]) continue;
        if (a.requireFlag) b.flags[a.requireFlag] = false;
        this.sendToWire(b, a.wire);
        this.emit({ type: 'wire', id: a.wire, ball: b, from: s.id });
        return;
      } else if (a.do === 'spinner') {
        const sp = this.spinners.find((x) => x.def.id === a.spinner);
        const speed = Math.hypot(b.vx, b.vy);
        sp.omega += dir * speed * (sp.def.gain || 0.022);
        const k = 1 - (sp.def.slow || 0.04);
        b.vx *= k; b.vy *= k;
      }
    }
  };

  // ---------------------------------------------------------------- wires ---
  function prepWire(w) {
    if (w.prepared) return;
    const pts = w.pts;
    w.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      w.cum.push(w.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    w.length = w.cum[w.cum.length - 1];
    const n = pts.length;
    const ex = pts[n - 1][0] - pts[n - 2][0], ey = pts[n - 1][1] - pts[n - 2][1];
    const el = Math.hypot(ex, ey) || 1;
    w.exitDx = ex / el; w.exitDy = ey / el;
    w.prepared = true;
  }

  World.prototype.wirePos = function (w, s, out) {
    const cum = w.cum, pts = w.pts;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
    const a = pts[i - 1], c = pts[i];
    out.x = a[0] + (c[0] - a[0]) * t;
    out.y = a[1] + (c[1] - a[1]) * t;
    out.h = (a[2] || 0) + ((c[2] || 0) - (a[2] || 0)) * t;
    out.tx = (c[0] - a[0]) / seg; out.ty = (c[1] - a[1]) / seg;
    return out;
  };

  World.prototype.sendToWire = function (b, wireId, startSpeed) {
    const w = this.wires[wireId];
    b.state = 'wire';
    b.wire = w;
    b.ws = 0;
    const v = startSpeed != null ? startSpeed : Math.hypot(b.vx, b.vy) * 0.85;
    b.wv = Math.max(w.minSpeed || 500, Math.min(v, w.maxSpeed || 2500));
    b.layer = 0;
    b.flags = {};
  };

  const wp = { x: 0, y: 0, h: 0, tx: 0, ty: 0 };
  World.prototype.advanceWire = function (b, h) {
    const w = b.wire;
    // gravity along the wire (from table slope and the wire's own descent) minus drag
    this.wirePos(w, b.ws, wp);
    const acc = (w.accel || 600) + this.g * wp.ty * 0.5 - b.wv * (w.drag || 0.6);
    b.wv += acc * h;
    const mn = w.minSpeed || 500, mx = w.maxSpeed || 2500;
    if (b.wv < mn) b.wv = mn; else if (b.wv > mx) b.wv = mx;
    b.ws += b.wv * h;
    b.px = b.x; b.py = b.y;
    if (b.ws >= w.length) {
      const n = w.pts.length;
      b.x = w.pts[n - 1][0]; b.y = w.pts[n - 1][1];
      b.h = 0;
      const out = Math.min(b.wv, w.exitSpeed || 1200);
      b.vx = w.exitDx * out; b.vy = w.exitDy * out;
      b.state = 'play';
      b.layer = w.exitLayer || 0;
      b.wire = null;
      b.flipSide = {};
      b.lastActive = this.time;
      this.emit({ type: 'wireExit', id: w.id, ball: b });
      return;
    }
    this.wirePos(w, b.ws, wp);
    b.x = wp.x; b.y = wp.y; b.h = wp.h;
    b.vx = wp.tx * b.wv; b.vy = wp.ty * b.wv;
  };

  // ---------------------------------------------------------------- ramps ---
  const rt = { tx: 0, ty: -1, h: 0 };
  function rampTangent(ramp, x, y) {
    const pts = ramp.axis;
    let best = 1e18, bi = 1, bt = 0;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1];
      const dx = pts[i][0] - ax, dy = pts[i][1] - ay;
      const l2 = dx * dx + dy * dy;
      let t = ((x - ax) * dx + (y - ay) * dy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - x, qy = ay + dy * t - y;
      const q = qx * qx + qy * qy;
      if (q < best) { best = q; bi = i; bt = t; }
    }
    if (!ramp.cum) {
      ramp.cum = [0];
      for (let i = 1; i < pts.length; i++) ramp.cum.push(ramp.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      ramp.len = ramp.cum[ramp.cum.length - 1];
    }
    const a = pts[bi - 1], c = pts[bi];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    rt.tx = (c[0] - a[0]) / L; rt.ty = (c[1] - a[1]) / L;
    const s = ramp.cum[bi - 1] + L * bt;
    rt.h = (ramp.apexHeight || 40) * Math.min(1, s / ramp.len);
    return rt;
  }
  NN.rampTangent = rampTangent;

  // ---------------------------------------------------------- ball-ball ---
  World.prototype.collideBalls = function () {
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (a.state !== 'play') continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (b.state !== 'play' || b.layer !== a.layer) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const pen = (rr - d) * 0.5;
        a.x -= nx * pen; a.y -= ny * pen;
        b.x += nx * pen; b.y += ny * pen;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const e = -rv > this.P.restThreshold ? 0.9 : 0;
          const j2 = (-(1 + e) * rv) / 2;
          a.vx -= j2 * nx; a.vy -= j2 * ny;
          b.vx += j2 * nx; b.vy += j2 * ny;
          if (-rv > 150) this.emit({ type: 'hit', kind: 'ball', ball: a, speed: -rv, x: a.x + nx * a.r, y: a.y + ny * a.r });
        }
      }
    }
  };

  // --------------------------------------------------------------- nudge ---
  World.prototype.nudge = function (dvx, dvy) {
    for (const b of this.balls) {
      if (b.state !== 'play') continue;
      b.vx += dvx; b.vy += dvy;
    }
  };

  NN.World = World;
})(globalThis.NN || (globalThis.NN = {}));
