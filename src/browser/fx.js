/*
 * Visual effects: particles, floating points, screen shake, flashes, per-object
 * hit glows and lamp shows. Purely presentational.
 */
(function (NN) {
  'use strict';

  const MAXP = 500;

  function FX() {
    this.px = new Float32Array(MAXP); this.py = new Float32Array(MAXP);
    this.vx = new Float32Array(MAXP); this.vy = new Float32Array(MAXP);
    this.life = new Float32Array(MAXP); this.max = new Float32Array(MAXP);
    this.size = new Float32Array(MAXP); this.col = new Array(MAXP);
    this.n = 0;
    this.texts = [];
    this.rings = [];
    this.shakeAmt = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.flash = { a: 0, color: '#ffffff' };
    this.hits = {};          // id -> time of last hit (seconds)
    this.slings = {};        // id -> stretch 0..1
    this.show = null;        // active lamp show
    this.t = 0;
    this.shakeEnabled = true;
    this.comets = [];
    this.nextComet = 6;
  }

  FX.prototype.spawn = function (x, y, vx, vy, life, size, color) {
    if (this.n >= MAXP) return;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.col[i] = color;
  };

  FX.prototype.sparks = function (x, y, color, n, speed) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random() * 0.9);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.25 + Math.random() * 0.35, 3 + Math.random() * 4, color);
    }
  };

  FX.prototype.burst = function (x, y, colors, n, speed) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.8, 4 + Math.random() * 6, colors[k % colors.length]);
    }
  };

  FX.prototype.ring = function (x, y, color, r0, r1, dur) {
    this.rings.push({ x: x, y: y, color: color, r0: r0, r1: r1, t: 0, dur: dur || 0.5 });
  };

  FX.prototype.text = function (x, y, str, big, color) {
    this.texts.push({ x: x, y: y, s: str, t: 0, dur: big ? 1.6 : 1.0, big: big, color: color || (big ? '#ffd36b' : '#ffffff') });
    if (this.texts.length > 14) this.texts.shift();
  };

  FX.prototype.shake = function (amt) {
    if (!this.shakeEnabled) return;
    this.shakeAmt = Math.min(6, Math.max(this.shakeAmt, amt));
  };

  FX.prototype.flashScreen = function (color, a) {
    this.flash.color = color; this.flash.a = Math.max(this.flash.a, a);
  };

  FX.prototype.hit = function (id) { this.hits[id] = this.t; };
  FX.prototype.hitGlow = function (id, dur) {
    const h = this.hits[id];
    if (h == null) return 0;
    const k = 1 - (this.t - h) / (dur || 0.18);
    return k > 0 ? k : 0;
  };

  FX.prototype.lampShow = function (id, dur, color) {
    this.show = { id: id, t: 0, dur: dur || 1.5, color: color };
  };

  FX.prototype.update = function (dt) {
    this.t += dt;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.col[i] = this.col[j];
        i--; continue;
      }
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt;
      this.vx[i] *= 1 - 2.5 * dt; this.vy[i] = this.vy[i] * (1 - 2.5 * dt) + 300 * dt;
    }
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.dur);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    // screen shake: decays fast, small, never enough to lose the ball
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 22);
    const a = this.shakeAmt;
    this.shakeX = (Math.random() - 0.5) * 2 * a;
    this.shakeY = (Math.random() - 0.5) * 2 * a;
    this.flash.a = Math.max(0, this.flash.a - dt * 2.2);
    for (const k in this.slings) this.slings[k] = Math.max(0, this.slings[k] - dt * 9);
    if (this.show) { this.show.t += dt; if (this.show.t >= this.show.dur) this.show = null; }
    // background comets
    this.nextComet -= dt;
    if (this.nextComet <= 0) {
      this.nextComet = 7 + Math.random() * 10;
      const fromLeft = Math.random() < 0.5;
      this.comets.push({ x: fromLeft ? -40 : 550, y: 80 + Math.random() * 700, vx: (fromLeft ? 1 : -1) * (240 + Math.random() * 160), vy: 40 + Math.random() * 90, t: 0 });
    }
    for (const c of this.comets) { c.x += c.vx * dt; c.y += c.vy * dt; c.t += dt; }
    this.comets = this.comets.filter((c) => c.t < 4);
  };

  // Lamp show override for an insert: returns intensity 0..1 (and maybe colour) or null
  FX.prototype.lampOverride = function (ins, idx, total) {
    const sh = this.show;
    if (!sh) return null;
    const t = sh.t, p = t / sh.dur;
    const fade = p > 0.85 ? (1 - p) / 0.15 : 1;
    switch (sh.id) {
      case 'flashAll': return { v: (Math.floor(t * 14) % 2 ? 1 : 0.15) * fade };
      case 'strobe': return { v: (Math.floor(t * 10 + idx * 0.37) % 2 ? 1 : 0) * fade, c: ['#ff3df0', '#36e2ff', '#ffe14d'][Math.floor(t * 5) % 3] };
      case 'sweepUp': { const y = 1100 - p * 1300; return { v: Math.max(0, 1 - Math.abs(ins.y - y) / 90) * fade }; }
      case 'sweepRight': { const x = -60 + p * 640; return { v: Math.max(0, 1 - Math.abs(ins.x - x) / 70) * fade }; }
      case 'radial': {
        const d = Math.hypot(ins.x - 237, ins.y - 600), r = p * 900;
        return { v: Math.max(0, 1 - Math.abs(d - r) / 80) * fade, c: sh.color };
      }
      case 'rainbow': {
        const hue = (ins.y * 0.6 + ins.x * 0.3 - t * 600) % 360;
        return { v: (0.6 + 0.4 * Math.sin(t * 20 + idx)) * fade, c: 'hsl(' + ((hue + 360) % 360) + ',100%,60%)' };
      }
      case 'supernova': {
        const d = Math.hypot(ins.x - 237, ins.y - 662), r = (t * 500) % 700;
        const v = Math.max(0, 1 - Math.abs(d - r) / 60) + (Math.floor(t * 8) % 2 ? 0.3 : 0);
        return { v: Math.min(1, v) * fade, c: ['#ffffff', '#ffe14d', '#ff3df0', '#36e2ff'][Math.floor(t * 6) % 4] };
      }
      case 'extraball': return { v: (Math.floor(t * 8) % 2 ? 1 : 0.2) * fade, c: '#ff9b2f' };
      case 'lanes': return /^lane/.test(ins.id) ? { v: Math.floor(t * 12) % 2 ? 1 : 0 } : null;
      case 'drops': return /drop/.test(ins.id) || ins.id === 'kickback' ? { v: Math.floor(t * 12) % 2 ? 1 : 0 } : null;
      case 'planets': return /planet/.test(ins.id) ? { v: Math.floor(t * 12) % 2 ? 1 : 0 } : null;
      case 'attract': {
        // gentle chase for the title screen
        const k = (Math.sin(t * 3 - ins.y * 0.02 + ins.x * 0.01) + 1) / 2;
        return { v: k * k * 0.9 };
      }
    }
    return null;
  };

  NN.FX = FX;
})(globalThis.NN || (globalThis.NN = {}));
