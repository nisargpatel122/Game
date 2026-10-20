/*
 * Frame renderer: layout, playfield, moving parts, balls, effects, DMD and HUD.
 */
(function (NN) {
  'use strict';

  const C = () => NN.COLORS;

  function Renderer(canvas, game, fx) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.fx = fx;
    this.quality = 1;
    this.dmd = new NN.DMD();
    this.dmdCanvas = NN.makeCanvas(128, 32);
    this.dmdCtx = this.dmdCanvas.getContext('2d');
    this.dmdImg = this.dmdCtx.createImageData(128, 32);
    this.palette = [];
    for (let v = 0; v < 16; v++) {
      const k = v / 15;
      this.palette.push([255 * Math.pow(k, 0.7), 125 * Math.pow(k, 1.05) + 6 * k, 40 * Math.pow(k, 1.6), v === 0 ? 0 : 255]);
    }
    this.insertCache = {};
    this.trails = new Map();
    this.debug = false;
    this.fps = 0; this.fpsAcc = 0; this.fpsN = 0;
    this.touchHintUntil = 0;
    this.isTouch = false;
    this.practice = false;
    this.resize();
  }

  Renderer.prototype.safeInsets = function () {
    const el = document.getElementById('safe');
    if (!el) return { t: 0, r: 0, b: 0, l: 0 };
    const cs = getComputedStyle(el);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  };

  Renderer.prototype.resize = function () {
    const vv = window.visualViewport;
    const W = Math.round(vv ? vv.width : window.innerWidth);
    const H = Math.round(vv ? vv.height : window.innerHeight);
    const mobile = Math.min(W, H) < 700;
    const cap = mobile ? 2 : 2.5;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, cap) * this.quality);
    this.cssW = W; this.cssH = H; this.dpr = dpr;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    const sa = this.safeInsets();
    this.sa = sa;
    const L = {};
    const portrait = W / H < 0.95;
    L.portrait = portrait;
    if (portrait) {
      let dmdH = Math.round(Math.min(Math.max(H * 0.07, 36), 80));
      let dmdW = dmdH * 4;
      const maxW = W - sa.l - sa.r - 112;
      if (dmdW > maxW) { dmdW = maxW; dmdH = dmdW / 4; }
      L.dmd = { x: (W - dmdW) / 2, y: sa.t + 6, w: dmdW, h: dmdH };
      const top = L.dmd.y + dmdH + 6;
      const availH = H - top - Math.max(0, sa.b - 14);
      const availW = W - sa.l - sa.r - 2;
      const s = Math.min(availW / 510, availH / 1070);
      L.pf = { s: s, x: (W - 510 * s) / 2, y: top + Math.max(0, (availH - 1070 * s) * 0.25) };
      L.pauseBtn = { right: Math.max(8, (W - dmdW) / 2 - 52), top: sa.t + 6 + (dmdH - 44) / 2 };
    } else {
      const availH = H - sa.t - sa.b - 12;
      let s = availH / 1070;
      let pfW = 510 * s;
      const side = (W - pfW) / 2 - Math.max(sa.l, sa.r);
      if (side >= 240) {
        const dmdW = Math.min(side - 40, 600), dmdH = dmdW / 4;
        L.pf = { s: s, x: (W - pfW) / 2, y: sa.t + 6 };
        L.dmd = { x: Math.max(sa.l, 0) + (side - dmdW) / 2, y: sa.t + Math.max(20, availH * 0.08), w: dmdW, h: dmdH };
        L.panelL = { x: L.dmd.x, y: L.dmd.y + dmdH + 24, w: dmdW, h: availH - (L.dmd.y + dmdH + 24) };
        L.panelR = { x: L.pf.x + pfW + 24, y: sa.t + 30, w: Math.min(side - 40, 420), h: availH - 40 };
        L.pauseBtn = { right: sa.r + 10, top: sa.t + 10 };
      } else {
        let dmdH = Math.round(Math.min(Math.max(H * 0.09, 40), 100));
        let dmdW = dmdH * 4;
        if (dmdW > W - 120) { dmdW = W - 120; dmdH = dmdW / 4; }
        L.dmd = { x: (W - dmdW) / 2, y: sa.t + 6, w: dmdW, h: dmdH };
        const top = L.dmd.y + dmdH + 6;
        const ah = H - top - sa.b - 4;
        s = Math.min(ah / 1070, (W - 8) / 510);
        L.pf = { s: s, x: (W - 510 * s) / 2, y: top };
        L.pauseBtn = { right: sa.r + 10, top: sa.t + 6 };
      }
    }
    this.L = L;
    // re-render the cached art at the new scale
    const devS = L.pf.s * dpr;
    if (!this.art || Math.abs(this.art.s - devS) / devS > 0.01) {
      this.art = NN.Art.build(this.game.T, devS, this.game.inserts);
      this.insertCache = {};
    }
    this.buildDmdMask();
    const pb = document.getElementById('pauseBtn');
    if (pb) { pb.style.right = L.pauseBtn.right + 'px'; pb.style.top = L.pauseBtn.top + 'px'; }
  };

  Renderer.prototype.buildDmdMask = function () {
    const r = this.L.dmd, dpr = this.dpr;
    const w = Math.round(r.w * dpr), h = Math.round(r.h * dpr);
    const m = NN.makeCanvas(w, h);
    const g = m.getContext('2d');
    g.fillStyle = '#070205';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const px = w / 128, py = h / 32;
    const rad = Math.min(px, py) * 0.43;
    g.fillStyle = '#000';
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 128; x++) {
        g.beginPath(); g.arc((x + 0.5) * px, (y + 0.5) * py, rad, 0, Math.PI * 2); g.fill();
      }
    }
    this.dmdMask = m;
  };

  // world mm -> canvas px
  Renderer.prototype.toScreen = function (x, y) {
    const L = this.L, d = this.dpr;
    return [(L.pf.x + x * L.pf.s) * d, (L.pf.y + y * L.pf.s) * d];
  };
  Renderer.prototype.toWorld = function (cssX, cssY) {
    const L = this.L;
    return [(cssX - L.pf.x) / L.pf.s, (cssY - L.pf.y) / L.pf.s];
  };

  // insert sprite in a given colour (cached)
  Renderer.prototype.insertSprite = function (ins, color) {
    if (!color || color === ins.color) return this.art.inserts[ins.id];
    const key = ins.id + '|' + color;
    let s = this.insertCache[key];
    if (!s) {
      s = this.art.inserts[ins.id];
      const tmp = Object.assign({}, ins, { color: color });
      s = NN.Art.insertSprite ? NN.Art.insertSprite(tmp, this.art.s) : s;
      this.insertCache[key] = s;
    }
    return s;
  };

  // ------------------------------------------------------------- frame ---
  Renderer.prototype.draw = function (dt) {
    const c = this.ctx, g = this.game, fx = this.fx, A = this.art, L = this.L, dpr = this.dpr;
    // fps
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#04010b';
    c.fillRect(0, 0, this.cv.width, this.cv.height);
    if (!L.portrait) this.drawBackdrop(c);

    const s = L.pf.s * dpr;
    const ts = g.tableShake;
    const shx = (fx.shakeX + ts.x * 0.6) * s;
    const shy = (fx.shakeY + ts.y * 0.6) * s;
    const ox = Math.round(L.pf.x * dpr + shx), oy = Math.round(L.pf.y * dpr + shy);
    c.drawImage(A.base, ox, oy);
    c.setTransform(s, 0, 0, s, ox, oy);
    this.drawAnimatedBackground(c, dt);
    this.drawInserts(c);
    this.drawObjects(c);
    this.drawFlippers(c);
    this.drawBalls(c, 0);
    // top layer (ramps, wires, apron) in bands
    c.setTransform(1, 0, 0, 1, 0, 0);
    for (const b of A.topBands) c.drawImage(A.top, 0, b[0], A.top.width, b[1], ox, oy + b[0], A.top.width, b[1]);
    c.setTransform(s, 0, 0, s, ox, oy);
    this.drawBalls(c, 1);
    this.drawPlunger(c);
    this.drawEffects(c);
    if (this.debug) this.drawDebug(c);
    // screen flash
    if (fx.flash.a > 0.01) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = fx.flash.a * 0.35;
      c.fillStyle = fx.flash.color;
      c.fillRect(0, 0, 510, 1070);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawDMD(c, dt);
    if (L.panelL) this.drawPanels(c);
    this.drawTouchHints(c);
    if (this.debug || this.showFps) {
      c.font = (12 * dpr) + 'px monospace'; c.fillStyle = '#7dff9a'; c.textAlign = 'left';
      c.fillText(this.fps.toFixed(0) + ' fps  q' + this.quality.toFixed(2) + '  sub ' + g.world.lastSubsteps, 6 * dpr, (this.cssH - 8) * dpr);
    }
  };

  Renderer.prototype.drawBackdrop = function (c) {
    if (!this.backdrop || this.backdrop.w !== this.cv.width) {
      const w = this.cv.width, h = this.cv.height;
      const b = NN.makeCanvas(w, h);
      const g = b.getContext('2d');
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0b0322'); bg.addColorStop(1, '#030008');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const cl = (x, y, r, col, a) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, NN.rgba(col, a)); rg.addColorStop(1, NN.rgba(col, 0)); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
      cl(w * 0.15, h * 0.3, h * 0.6, '#b42bd8', 0.16);
      cl(w * 0.85, h * 0.65, h * 0.6, '#1a8cff', 0.14);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      this.backdrop = { c: b, w: w };
    }
    c.drawImage(this.backdrop.c, 0, 0);
  };

  Renderer.prototype.drawAnimatedBackground = function (c, dt) {
    const fx = this.fx, t = fx.t, T = this.game.T;
    // twinkling, slowly drifting stars
    if (!this.stars) {
      this.stars = [];
      for (let i = 0; i < 70; i++) this.stars.push([Math.random() * 510, Math.random() * 1070, 0.4 + Math.random(), Math.random() * 6]);
    }
    c.globalCompositeOperation = 'lighter';
    const spr = NN.glowSprite('#bfe6ff', 16);
    for (const st of this.stars) {
      st[1] += dt * 3 * st[2];
      if (st[1] > 1070) st[1] -= 1070;
      const a = 0.25 + 0.35 * Math.sin(t * 1.3 + st[3]);
      if (a <= 0.02) continue;
      c.globalAlpha = a;
      const r = 2.2 * st[2];
      c.drawImage(spr, st[0] - r, st[1] - r, r * 2, r * 2);
    }
    // drifting nebula glow
    const nb = NN.glowSprite('#c42bd8', 64);
    c.globalAlpha = 0.10;
    c.drawImage(nb, 60 + Math.sin(t * 0.07) * 40, 380 + Math.cos(t * 0.05) * 50, 300, 300);
    const nb2 = NN.glowSprite('#1aa6ff', 64);
    c.globalAlpha = 0.09;
    c.drawImage(nb2, 220 + Math.cos(t * 0.06) * 50, 120 + Math.sin(t * 0.045) * 40, 280, 280);
    // comets
    for (const cm of fx.comets) {
      const len = 8;
      for (let k = 0; k < len; k++) {
        c.globalAlpha = (1 - k / len) * 0.55;
        const r = 5 - k * 0.45;
        c.drawImage(NN.glowSprite('#9fe9ff', 24), cm.x - cm.vx * k * 0.02 - r, cm.y - cm.vy * k * 0.02 - r, r * 2, r * 2);
      }
    }
    // Black Hole accretion swirl
    const sc = T.landmarks.scoop;
    const held = !!this.game.scoopBall;
    c.save();
    c.translate(sc.x, sc.y);
    for (let k = 0; k < 3; k++) {
      c.rotate(t * (0.9 + k * 0.4) * (held ? 2.4 : 1) % (Math.PI * 2));
      c.globalAlpha = 0.35 + (held ? 0.25 : 0);
      c.strokeStyle = ['#ff8a2f', '#ff3df0', '#a46bff'][k];
      c.lineWidth = 2.2 - k * 0.5;
      c.beginPath(); c.ellipse(0, 0, 32 + k * 9, 13 + k * 4, 0.2, 0, Math.PI * 1.2); c.stroke();
    }
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  };

  // ------------------------------------------------------------ inserts ---
  Renderer.prototype.drawInserts = function (c) {
    const g = this.game, fx = this.fx;
    const lamps = g.state === 'playing' || g.state === 'attract' ? g.rules.lamps() : {};
    const t = fx.t;
    const attract = g.state === 'attract' || g.state === 'idle' || g.state === 'gameover';
    // normal blending keeps the dark lettering on lit inserts readable
    c.globalCompositeOperation = 'source-over';
    const list = g.inserts;
    for (let i = 0; i < list.length; i++) {
      const ins = list[i];
      let v = 0, color = null;
      const st = lamps[ins.id];
      if (st) {
        const s = typeof st === 'number' ? st : st.s;
        if (typeof st === 'object') color = st.c;
        if (s === 1) v = 1;
        else if (s === 2) v = (Math.sin(t * Math.PI * 2 * 1.6) > -0.2) ? 1 : 0.12;
        else if (s === 3) v = (Math.sin(t * Math.PI * 2 * 4.5) > 0) ? 1 : 0.1;
        if (typeof st === 'object' && st.dim) v *= st.dim;
      }
      const ov = fx.lampOverride(ins, i, list.length) || (attract ? fx.lampOverride.call({ show: { id: 'attract', t: t, dur: 1e9 } }, ins, i) : null);
      if (ov) { v = Math.max(v, ov.v); if (ov.c) color = quantColor(ov.c); }
      if (v <= 0.02) continue;
      const spr = this.insertSprite(ins, color);
      if (!spr) continue;
      c.globalAlpha = Math.min(1, v);
      c.drawImage(spr.c, spr.ox, spr.oy, spr.w, spr.h);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  };

  function quantColor(cstr) {
    if (cstr[0] === '#') return cstr;
    const m = /hsl\((\d+)/.exec(cstr);
    if (!m) return cstr;
    const h = Math.round(+m[1] / 30) * 30 % 360;
    const f = (n) => { const k = (n + h / 30) % 12; const a = 1 * Math.min(0.6, 1 - 0.6); return 0.6 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    const hx = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return '#' + hx(f(0)) + hx(f(8)) + hx(f(4));
  }

  // ------------------------------------------------------------- objects ---
  Renderer.prototype.drawObjects = function (c) {
    const g = this.game, T = g.T, fx = this.fx, W = g.world, A = this.art;
    const col = C();
    // bumpers
    for (const b of T.draw.bumpers) {
      const k = fx.hitGlow(b.id, 0.22);
      const spr = k > 0 ? A.bumperLit : A.bumper;
      const o = spr.off, sc = 1 - k * 0.06;
      c.drawImage(spr.c, b.x - o * sc, b.y - o * sc, o * 2 * sc, o * 2 * sc);
      if (k > 0) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = k * 0.8;
        const gs = NN.glowSprite(col.magenta, 64);
        c.drawImage(gs, b.x - 46, b.y - 46, 92, 92);
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      }
    }
    // slingshot rubbers
    for (const sl of T.draw.slings) {
      const k = fx.slings[sl.id] || 0;
      const ax = sl.top[0], ay = sl.top[1], bx = sl.br[0], by = sl.br[1];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      let nx = dy / len, ny = -dx / len;
      if ((sl.flip && nx > 0) || (!sl.flip && nx < 0)) { nx = -nx; ny = -ny; }
      const mx = (ax + bx) / 2 + nx * (4 + k * 6), my = (ay + by) / 2 + ny * (4 + k * 6);
      const ox2 = nx * 4, oy2 = ny * 4;
      c.lineCap = 'round';
      c.strokeStyle = k > 0.05 ? '#ffd27a' : '#e9d9ff';
      c.lineWidth = 3.2;
      c.beginPath(); c.moveTo(ax + ox2, ay + oy2); c.quadraticCurveTo(mx, my, bx + ox2, by + oy2); c.stroke();
      if (k > 0.05) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = k;
        c.strokeStyle = col.orange; c.lineWidth = 7;
        c.beginPath(); c.moveTo(ax + ox2, ay + oy2); c.quadraticCurveTo(mx, my, bx + ox2, by + oy2); c.stroke();
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      }
    }
    // stand-up targets (planets)
    for (const t of T.draw.targets) {
      const k = fx.hitGlow(t.id, 0.25);
      const cx = (t.ax + t.bx) / 2, cy = (t.ay + t.by) / 2;
      const ang = Math.atan2(t.by - t.ay, t.bx - t.ax);
      c.save(); c.translate(cx, cy); c.rotate(ang);
      const len = Math.hypot(t.bx - t.ax, t.by - t.ay) + 6;
      c.fillStyle = k > 0 ? '#eaffef' : '#1fbf63';
      c.fillRect(-len / 2, -3.2, len, 6.4);
      c.fillStyle = 'rgba(0,40,10,0.6)';
      c.fillRect(-len / 2 + 1.5, -1.4, len - 3, 2.8);
      c.restore();
      if (k > 0) {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = k;
        c.drawImage(NN.glowSprite(col.lime, 48), cx - 22, cy - 22, 44, 44);
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      }
    }
    // drop targets
    for (const d of T.draw.drops) {
      const coll = g.dropColliders[d.id];
      const up = coll && coll.active;
      const k = fx.hitGlow(d.id, 0.25);
      c.save(); c.translate(d.x, d.y); c.rotate(Math.atan2(d.by, d.bx));
      if (up) {
        c.fillStyle = k > 0 ? '#fff6d0' : '#ffb238';
        c.fillRect(-10, -4.5, 20, 9);
        c.fillStyle = 'rgba(80,40,0,0.55)';
        c.fillRect(-7, -1.5, 14, 3);
      } else {
        c.fillStyle = 'rgba(255,178,56,0.15)';
        c.fillRect(-10, -1.5, 20, 3);
      }
      c.restore();
    }
    // spinner plate
    for (const sp of W.spinners) {
      const d = sp.def;
      const ca = Math.abs(Math.cos(sp.angle));
      const cx = (d.x0 + d.x1) / 2, w = d.x1 - d.x0;
      c.fillStyle = '#d8dcf0';
      c.fillRect(cx - w / 2, d.y - 0.8 - ca * 3.2, w, 1.6 + ca * 6.4);
      if (Math.abs(sp.omega) > 12) {
        c.globalAlpha = Math.min(0.55, Math.abs(sp.omega) / 120);
        c.fillStyle = '#b48cff';
        c.fillRect(cx - w / 2, d.y - 5, w, 10);
        c.globalAlpha = 1;
      }
      c.fillStyle = '#5b5f78';
      c.fillRect(d.x0 - 1, d.y - 1, 2, 2); c.fillRect(d.x1 - 1, d.y - 1, 2, 2);
    }
    // shooter lane gate flap
    for (const gd of T.draw.gates || []) {
      const st = W.gates[gd.id];
      const sw = st ? st.swing : 0;
      const hx = gd.bx, hy = gd.by;
      const ang = Math.atan2(gd.ay - hy, gd.ax - hx) - sw * 0.9;
      const len = Math.hypot(gd.ax - hx, gd.ay - hy);
      c.strokeStyle = '#e8eaff'; c.lineWidth = 1.6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(ang) * len, hy + Math.sin(ang) * len); c.stroke();
    }
    // kickback
    const kb = T.landmarks.kickback;
    const kk = fx.hitGlow('kickback', 0.3);
    c.fillStyle = kk > 0 ? '#eaffef' : '#3a3f58';
    c.fillRect(kb.x - 9, kb.y + 2 - kk * 6, 18, 5);
    if (g.rules.kickbackLit && g.state === 'playing') {
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 + 0.3 * Math.sin(fx.t * 5);
      c.drawImage(NN.glowSprite(col.lime, 40), kb.x - 16, kb.y - 12, 32, 32);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
  };

  Renderer.prototype.drawFlippers = function (c) {
    const g = this.game, A = this.art;
    for (const f of g.world.flippers) {
      const spr = f.upper ? A.flipUpper : A.flipMain;
      const k = A.s;
      c.save();
      c.translate(f.px, f.py);
      c.rotate(f.angle);
      if (!f.enabled) c.globalAlpha = 0.45;
      c.drawImage(spr.c, -spr.ox, -spr.oy, spr.c.width / k, spr.c.height / k);
      c.restore();
    }
  };

  Renderer.prototype.drawPlunger = function (c) {
    const pl = this.game.world.plunger;
    const tip = pl.yRest + pl.pull;
    const x0 = pl.x0 + 3, x1 = pl.x1 - 3;
    const cx = (x0 + x1) / 2;
    // spring
    c.strokeStyle = '#9aa3bd'; c.lineWidth = 1.4;
    c.beginPath();
    const coils = 7, top = tip + 6, bot = 1066;
    for (let i = 0; i <= coils * 2; i++) {
      const y = top + (bot - top) * (i / (coils * 2));
      const x = cx + (i % 2 ? 9 : -9);
      if (i === 0) c.moveTo(cx, y); else c.lineTo(x, y);
    }
    c.stroke();
    // rod and tip
    c.fillStyle = '#c8cde0';
    c.fillRect(cx - 2.5, tip, 5, 1070 - tip);
    const tg = c.createLinearGradient(x0, 0, x1, 0);
    tg.addColorStop(0, '#ff3df0'); tg.addColorStop(1, '#a01a96');
    c.fillStyle = tg;
    c.fillRect(x0, tip - 1, x1 - x0, 7);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(x0 + 2, tip, x1 - x0 - 4, 1.4);
  };

  // ---------------------------------------------------------------- balls ---
  // pass 0: balls on the playfield (under ramps). pass 1: balls on ramps, wires, locks.
  Renderer.prototype.drawBalls = function (c, pass) {
    const g = this.game, A = this.art, k = A.s;
    const bsz = A.ball.width / k, ssz = A.shadow.width / k;
    for (const b of g.world.balls) {
      const raised = b.state === 'wire' || b.layer > 0 || (b.state === 'held' && b.holder === 'lock');
      if ((pass === 1) !== raised) continue;
      if (b.state === 'gone') continue;
      const h = raised ? (b.h || 0) : 0;
      const scale = 1 + Math.min(1, h / 55) * 0.28;
      // shadow
      const so = 2.5 + h * 0.18;
      c.globalAlpha = raised ? 0.75 : 0.9;
      c.drawImage(A.shadow, b.x - ssz / 2 + so, b.y - ssz / 2 + so * 1.3, ssz, ssz);
      c.globalAlpha = 1;
      // trail at speed
      const sp = Math.hypot(b.vx, b.vy);
      let tr = this.trails.get(b);
      if (!tr) { tr = []; this.trails.set(b, tr); }
      tr.push(b.x, b.y);
      if (tr.length > 14) tr.splice(0, 2);
      if (sp > 1800 && b.state !== 'held') {
        c.globalCompositeOperation = 'lighter';
        const gl = NN.glowSprite('#c9b6ff', 32);
        const n = tr.length / 2;
        for (let i = 0; i < n - 1; i++) {
          const a = (i / n) * Math.min(1, (sp - 1800) / 2500) * 0.4;
          const r = 13.5 * scale * (0.5 + 0.5 * i / n);
          c.globalAlpha = a;
          c.drawImage(gl, tr[i * 2] - r, tr[i * 2 + 1] - r, r * 2, r * 2);
        }
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }
      if (b.state === 'held' && b.holder === 'scoop') {
        c.globalAlpha = 0.55;
        c.drawImage(A.ball, b.x - bsz * 0.4, b.y - bsz * 0.4, bsz * 0.8, bsz * 0.8);
        c.globalAlpha = 1;
        continue;
      }
      const d = bsz * scale;
      c.drawImage(scale > 1.05 ? A.ballBig : A.ball, b.x - d / 2, b.y - d / 2, d, d);
    }
    if (pass === 1 && this.trails.size > 20) {
      for (const key of this.trails.keys()) if (g.world.balls.indexOf(key) < 0) this.trails.delete(key);
    }
  };

  // ------------------------------------------------------------- effects ---
  Renderer.prototype.drawEffects = function (c) {
    const fx = this.fx;
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < fx.n; i++) {
      const a = fx.life[i] / fx.max[i];
      c.globalAlpha = a;
      const r = fx.size[i] * (0.5 + a * 0.5);
      c.drawImage(NN.glowSprite(fx.col[i], 24), fx.px[i] - r, fx.py[i] - r, r * 2, r * 2);
    }
    for (const r of fx.rings) {
      const p = r.t / r.dur;
      c.globalAlpha = (1 - p) * 0.8;
      c.strokeStyle = r.color; c.lineWidth = 3 * (1 - p) + 0.5;
      c.beginPath(); c.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * p, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
    // floating points
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const t of fx.texts) {
      const p = t.t / t.dur;
      const y = t.y - p * (t.big ? 60 : 36);
      const a = p < 0.15 ? p / 0.15 : 1 - Math.max(0, (p - 0.55) / 0.45);
      const size = t.big ? 22 : 13;
      const pop = t.big ? 1 + Math.max(0, 0.3 - p) * 1.2 : 1;
      c.font = '900 ' + (size * pop).toFixed(1) + 'px "Segoe UI", system-ui, sans-serif';
      c.globalAlpha = a * 0.5;
      c.fillStyle = t.color;
      c.fillText(t.s, t.x + 0.6, y + 0.6);
      c.globalAlpha = a;
      c.fillStyle = '#ffffff';
      c.fillText(t.s, t.x, y);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  };

  // ----------------------------------------------------------------- DMD ---
  Renderer.prototype.drawDMD = function (c, dt) {
    const L = this.L, dpr = this.dpr, r = L.dmd;
    this.dmd.render(this.game, dt);
    const buf = this.dmd.buf, img = this.dmdImg.data, pal = this.palette;
    for (let i = 0; i < 4096; i++) {
      const p = pal[buf[i]];
      const j = i * 4;
      img[j] = p[0]; img[j + 1] = p[1]; img[j + 2] = p[2]; img[j + 3] = p[3];
    }
    this.dmdCtx.putImageData(this.dmdImg, 0, 0);
    const x = Math.round(r.x * dpr), y = Math.round(r.y * dpr), w = Math.round(r.w * dpr), h = Math.round(r.h * dpr);
    // bezel
    c.fillStyle = '#120618';
    const pad = Math.max(3, h * 0.07);
    c.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
    c.strokeStyle = 'rgba(255,140,40,0.35)'; c.lineWidth = Math.max(1, dpr);
    c.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
    // unlit dots, lit dots, dot mask, glow
    c.fillStyle = '#2a1206';
    c.fillRect(x, y, w, h);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.dmdCanvas, x, y, w, h);
    c.drawImage(this.dmdMask, x, y, w, h);
    c.imageSmoothingEnabled = true;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.45;
    c.drawImage(this.dmdCanvas, x - w * 0.01, y - h * 0.04, w * 1.02, h * 1.08);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  };

  // side panels on wide screens
  Renderer.prototype.drawPanels = function (c) {
    const L = this.L, dpr = this.dpr, g = this.game, R = g.rules;
    const P = L.panelL;
    const fs = Math.max(11, Math.min(16, P.w / 28));
    c.textAlign = 'left'; c.textBaseline = 'top';
    let y = P.y;
    const line = (txt, color, size, bold) => {
      c.font = (bold ? '800 ' : '600 ') + (size * dpr).toFixed(0) + 'px "Segoe UI", system-ui, sans-serif';
      c.fillStyle = color;
      c.fillText(txt, P.x * dpr, y * dpr);
      y += size * 1.45;
    };
    if (g.state === 'playing' || g.state === 'bonus') {
      const st = R.status();
      line('MISSIONS', '#36e2ff', fs, true);
      R.missions.forEach((m) => {
        const running = R.mission && R.mission.def === m.def;
        const mark = m.done ? '◆ ' : running ? '▶ ' : '◇ ';
        line(mark + m.def.name + (running ? '  ' + Math.ceil(R.mission.timeLeft) + 's' : ''), m.done ? m.def.color : running ? '#ffffff' : 'rgba(200,190,230,0.55)', fs * 0.9, running);
      });
      y += fs * 0.5;
      if (R.mb) line('NEBULA MULTIBALL', '#ff2b4f', fs, true);
      else line('LOCKS ' + R.locked + '/2' + (R.lockLit ? '  LOCK LIT' : ''), '#ffe14d', fs * 0.9, false);
      line('BONUS ' + R.bonusX + 'X', '#ffb238', fs * 0.9, false);
      if (st.next) { y += fs * 0.4; line('NEXT TO BEAT', '#a99cc4', fs * 0.8, false); line(st.next.name + '  ' + NN.U.formatScore(st.next.score), '#ffffff', fs, true); }
    } else {
      line('NO ADS. EVER.', '#3dff8a', fs, true);
      line('Free play, offline, all yours.', 'rgba(200,190,230,0.7)', fs * 0.85, false);
    }
    // controls on the right
    const Q = L.panelR;
    if (!Q || Q.w < 160) return;
    y = Q.y;
    const r2 = (txt, color, size, bold) => {
      c.font = (bold ? '800 ' : '600 ') + (size * dpr).toFixed(0) + 'px "Segoe UI", system-ui, sans-serif';
      c.fillStyle = color; c.fillText(txt, Q.x * dpr, y * dpr); y += size * 1.5;
    };
    const f2 = Math.max(11, Math.min(15, Q.w / 26));
    const dim = 'rgba(220,210,245,0.8)';
    r2('CONTROLS', '#36e2ff', f2, true);
    if (this.isTouch) {
      r2('Flippers: tap the left / right half', dim, f2 * 0.85);
      r2('Launch: drag the plunger down, let go', dim, f2 * 0.85);
      r2('Nudge: quick swipe up', dim, f2 * 0.85);
      r2('Pause: the ❚❚ button', dim, f2 * 0.85);
    } else {
      r2('Left flipper:  Z · L-Shift · ←', dim, f2 * 0.85);
      r2('Right flipper:  / · R-Shift · →', dim, f2 * 0.85);
      r2('Launch: hold Space or ↓, release', dim, f2 * 0.85);
      r2('Nudge:  X  ·  .  ·  ↑', dim, f2 * 0.85);
      r2('Pause P / Esc  ·  Mute M', dim, f2 * 0.85);
    }
    y += f2;
    r2('SHOOT', '#ff3df0', f2, true);
    r2('Blinking arrows = what to shoot next', dim, f2 * 0.85);
    r2('Black Hole starts missions', dim, f2 * 0.85);
    r2('Left ramp lights LOCK, right ramp locks', dim, f2 * 0.85);
    r2('Lock 2 balls for NEBULA MULTIBALL', dim, f2 * 0.85);
  };

  Renderer.prototype.drawTouchHints = function (c) {
    if (!this.isTouch) return;
    const g = this.game;
    const now = this.fx.t;
    if (g.state !== 'playing' || now > this.touchHintUntil) return;
    const a = Math.min(1, (this.touchHintUntil - now) / 1.5) * 0.7;
    const dpr = this.dpr, W = this.cssW, H = this.cssH;
    c.globalAlpha = a;
    c.fillStyle = 'rgba(54,226,255,0.06)';
    c.fillRect(0, H * 0.55 * dpr, W * 0.5 * dpr, H * 0.45 * dpr);
    c.fillStyle = 'rgba(255,61,240,0.06)';
    c.fillRect(W * 0.5 * dpr, H * 0.55 * dpr, W * 0.5 * dpr, H * 0.45 * dpr);
    c.font = '800 ' + (14 * dpr) + 'px "Segoe UI", system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.fillText('TAP LEFT', W * 0.25 * dpr, H * 0.8 * dpr);
    c.fillText('TAP RIGHT', W * 0.75 * dpr, H * 0.8 * dpr);
    if (g.shooterBall()) {
      const p = this.toScreen(482, 900);
      c.fillText('↓ DRAG', p[0] - 26 * dpr, p[1]);
    }
    c.globalAlpha = 1;
  };

  // ---------------------------------------------------------------- debug ---
  Renderer.prototype.drawDebug = function (c) {
    const g = this.game, W = g.world, S = NN.Shapes;
    c.lineWidth = 0.8;
    for (const col of W.colliders) {
      if (!col.active) continue;
      c.strokeStyle = col.mask === 1 ? 'rgba(0,255,120,0.8)' : 'rgba(80,160,255,0.8)';
      if (col.kind === 'bumper') c.strokeStyle = '#ff40ff';
      if (col.kind === 'sling') c.strokeStyle = '#ffa030';
      c.beginPath();
      if (col.type === S.SEG) { c.lineWidth = Math.max(0.8, col.r * 2); c.moveTo(col.ax, col.ay); c.lineTo(col.bx, col.by); }
      else if (col.type === S.CIRCLE) { c.lineWidth = 0.8; c.arc(col.x, col.y, col.R, 0, Math.PI * 2); }
      else { c.lineWidth = Math.max(0.8, col.r * 2); c.arc(col.cx, col.cy, col.R, col.a0, col.a0 + col.span); }
      c.stroke();
    }
    c.lineWidth = 0.6;
    for (const s of W.sensors) {
      c.strokeStyle = 'rgba(255,255,0,0.7)';
      c.beginPath();
      if (s.type === 'line') { c.moveTo(s.ax, s.ay); c.lineTo(s.bx, s.by); } else c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      c.stroke();
    }
    for (const f of W.flippers) {
      c.strokeStyle = '#00ffff';
      c.beginPath(); c.arc(f.px, f.py, f.r1, 0, Math.PI * 2);
      c.moveTo(f.px, f.py); c.lineTo(f.px + f.cos * f.length, f.py + f.sin * f.length);
      c.arc(f.px + f.cos * f.length, f.py + f.sin * f.length, f.r2, 0, Math.PI * 2); c.stroke();
    }
    c.strokeStyle = '#ff5050';
    for (const b of W.balls) {
      c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + b.vx * 0.05, b.y + b.vy * 0.05); c.stroke();
    }
  };

  NN.Renderer = Renderer;
})(globalThis.NN || (globalThis.NN = {}));
