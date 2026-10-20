/*
 * Pre-rendered art. Everything static is painted once per screen size into
 * offscreen canvases (with the expensive glows baked in), so each frame is
 * mostly cheap drawImage calls.
 */
(function (NN) {
  'use strict';

  const COLORS = {
    magenta: '#ff3df0', cyan: '#36e2ff', violet: '#a46bff', white: '#f4ecff', lime: '#3dff8a',
    amber: '#ffb238', red: '#ff2b4f', blue: '#4d8dff', teal: '#36ffd8', orange: '#ff7a2f',
  };
  NN.COLORS = COLORS;
  const col = (c) => COLORS[c] || c || COLORS.cyan;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  NN.makeCanvas = canvas;

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  NN.rgba = rgba;

  // seeded random so the art is the same every time
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  function tracePath(ctx, w) {
    ctx.beginPath();
    if (w.arc) {
      const a = w.arc;
      ctx.arc(a[0], a[1], a[2], a[3], a[3] + a[4]);
    } else {
      ctx.moveTo(w.pts[0][0], w.pts[0][1]);
      for (let i = 1; i < w.pts.length; i++) ctx.lineTo(w.pts[i][0], w.pts[i][1]);
    }
  }

  // neon tube: wide soft glow, coloured tube, white-hot core. Units are mm (ctx scaled).
  function neon(ctx, trace, color, width, s, glow) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.globalAlpha = 0.28 * (glow == null ? 1 : glow);
    ctx.lineWidth = width * 3.4;
    ctx.shadowBlur = width * 5 * s;
    trace(); ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = width;
    ctx.shadowBlur = width * 2.2 * s;
    trace(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = Math.max(0.35, width * 0.35);
    trace(); ctx.stroke();
    ctx.restore();
  }
  NN.neon = neon;

  // ---------------------------------------------------------------- base ---
  function buildBase(T, s, inserts) {
    seed = 11;
    const W = 510, H = 1070;
    const c = canvas(W * s, H * s);
    const g = c.getContext('2d');
    g.scale(s, s);
    // deep space
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0326'); bg.addColorStop(0.5, '#080219'); bg.addColorStop(1, '#04010c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // nebula clouds
    g.globalCompositeOperation = 'lighter';
    const cloud = (x, y, r, color, a) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba(color, a)); rg.addColorStop(0.5, rgba(color, a * 0.35)); rg.addColorStop(1, rgba(color, 0));
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    cloud(110, 230, 260, '#c42bd8', 0.22);
    cloud(400, 420, 240, '#1aa6ff', 0.16);
    cloud(260, 720, 300, '#6b2cff', 0.18);
    cloud(60, 600, 160, '#ff3d9a', 0.10);
    cloud(440, 140, 170, '#36ffd8', 0.08);
    cloud(230, 980, 220, '#ff3df0', 0.12);
    for (let i = 0; i < 26; i++) cloud(rnd() * W, rnd() * H, 30 + rnd() * 90, ['#c42bd8', '#1aa6ff', '#6b2cff', '#ff3d9a'][i % 4], 0.05 + rnd() * 0.05);
    // stars
    for (let i = 0; i < 520; i++) {
      const x = rnd() * W, y = rnd() * H, m = rnd();
      g.fillStyle = `rgba(255,255,255,${0.15 + m * 0.55})`;
      const r = m > 0.97 ? 1.1 : m > 0.85 ? 0.7 : 0.4;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (m > 0.985) {
        g.strokeStyle = 'rgba(200,220,255,0.35)'; g.lineWidth = 0.3;
        g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.moveTo(x, y - 5); g.lineTo(x, y + 5); g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';

    // ---- playfield art ----
    const L = T.landmarks;
    // big ringed planet behind the mission ring
    const ring = L.missionRing;
    (function planet(x, y, r) {
      const pg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      pg.addColorStop(0, '#5a3cc0'); pg.addColorStop(0.55, '#2a1366'); pg.addColorStop(1, '#0c0626');
      g.save();
      g.globalAlpha = 0.85;
      // back half of the ring
      g.strokeStyle = 'rgba(255,170,90,0.35)'; g.lineWidth = 7;
      g.beginPath(); g.ellipse(x, y, r * 1.75, r * 0.42, -0.32, Math.PI, Math.PI * 2); g.stroke();
      g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      // bands
      g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
      for (let i = -3; i <= 3; i++) {
        g.strokeStyle = `rgba(160,120,255,${0.08 + (i & 1) * 0.06})`; g.lineWidth = 6;
        g.beginPath(); g.ellipse(x, y + i * 14, r * 1.2, 6, -0.32, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
      // front half of the ring
      g.strokeStyle = 'rgba(255,190,110,0.55)'; g.lineWidth = 6;
      g.beginPath(); g.ellipse(x, y, r * 1.75, r * 0.42, -0.32, 0, Math.PI); g.stroke();
      g.strokeStyle = 'rgba(255,230,180,0.35)'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(x, y, r * 1.6, r * 0.36, -0.32, 0, Math.PI); g.stroke();
      g.restore();
    })(ring.x, ring.y, 62);
    // small planets
    const smallPlanet = (x, y, r, c1, c2) => {
      const pg = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
      pg.addColorStop(0, c1); pg.addColorStop(1, c2);
      g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(c1, 0.5); g.lineWidth = 0.8; g.stroke();
    };
    smallPlanet(120, 205, 26, '#ff7a6b', '#3a0c22');
    smallPlanet(330, 120, 14, '#7fe8ff', '#0a2a44');
    smallPlanet(395, 760, 12, '#ffd36b', '#3d2508');
    smallPlanet(78, 752, 9, '#9dff9a', '#0c3018');
    // comet streak in the upper right
    g.save();
    g.globalCompositeOperation = 'lighter';
    const cg = g.createLinearGradient(300, 60, 430, 210);
    cg.addColorStop(0, 'rgba(120,230,255,0)'); cg.addColorStop(1, 'rgba(160,240,255,0.55)');
    g.strokeStyle = cg; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(300, 60); g.quadraticCurveTo(380, 120, 430, 210); g.stroke();
    g.fillStyle = 'rgba(220,250,255,0.9)'; g.beginPath(); g.arc(430, 210, 3.2, 0, Math.PI * 2); g.fill();
    g.restore();
    // constellation lines
    g.save();
    g.strokeStyle = 'rgba(150,200,255,0.18)'; g.lineWidth = 0.6;
    g.fillStyle = 'rgba(200,230,255,0.6)';
    const cons = [[[150, 420], [180, 452], [212, 440], [228, 470]], [[300, 640], [330, 610], [365, 625], [380, 590]], [[90, 860], [110, 840], [140, 850]], [[350, 860], [372, 838], [392, 850]]];
    for (const ln of cons) {
      g.beginPath(); g.moveTo(ln[0][0], ln[0][1]);
      for (const p of ln) g.lineTo(p[0], p[1]);
      g.stroke();
      for (const p of ln) { g.beginPath(); g.arc(p[0], p[1], 1.4, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
    // the Black Hole: dark core and accretion glow (the swirl is animated on top)
    const sc = L.scoop;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const bh = g.createRadialGradient(sc.x, sc.y, 10, sc.x, sc.y, 62);
    bh.addColorStop(0, 'rgba(255,120,40,0)'); bh.addColorStop(0.35, 'rgba(255,120,40,0.35)');
    bh.addColorStop(0.6, 'rgba(255,61,240,0.18)'); bh.addColorStop(1, 'rgba(120,40,255,0)');
    g.fillStyle = bh; g.beginPath(); g.arc(sc.x, sc.y, 62, 0, Math.PI * 2); g.fill();
    g.restore();
    const core = g.createRadialGradient(sc.x, sc.y, 2, sc.x, sc.y, 24);
    core.addColorStop(0, '#000'); core.addColorStop(0.8, '#000'); core.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = core; g.beginPath(); g.arc(sc.x, sc.y, 24, 0, Math.PI * 2); g.fill();

    // shooter lane floor
    g.fillStyle = 'rgba(20,8,40,0.65)';
    g.fillRect(466, 300, 32, 770);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = 340; y < 980; y += 30) g.fillRect(480, y, 4, 12);

    // solid blocks (wedges, slings)
    for (const poly of T.solids || []) {
      g.beginPath(); g.moveTo(poly[0][0], poly[0][1]);
      for (const p of poly) g.lineTo(p[0], p[1]);
      g.closePath();
      const sg = g.createLinearGradient(0, 0, 0, H);
      sg.addColorStop(0, '#1a0a38'); sg.addColorStop(1, '#0e0522');
      g.fillStyle = sg; g.fill();
    }

    // decals
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 9px "Segoe UI", system-ui, sans-serif';
    g.fillStyle = 'rgba(180,230,255,0.55)';
    g.fillText('ORION', 225, 72);
    g.font = '800 7px "Segoe UI", system-ui, sans-serif';
    g.fillStyle = 'rgba(255,190,120,0.7)';
    g.fillText('BLACK HOLE', sc.x, 455);
    g.fillStyle = 'rgba(255,230,120,0.6)';
    g.save(); g.translate(31, 470); g.rotate(-Math.PI / 2); g.fillText('LEFT ORBIT', 0, 0); g.restore();
    g.save(); g.translate(445, 470); g.rotate(-Math.PI / 2); g.fillText('RIGHT ORBIT', 0, 0); g.restore();
    g.fillStyle = 'rgba(140,255,170,0.7)';
    g.save(); g.translate(397, 300); g.rotate(-Math.PI / 2); g.fillText('COMET', 0, 0); g.restore();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.font = '800 6px "Segoe UI", system-ui, sans-serif';
    g.save(); g.translate(482, 640); g.rotate(-Math.PI / 2); g.fillText('L A U N C H', 0, 0); g.restore();
    g.restore();

    // ramp and wire shadows (depth)
    g.save();
    g.globalAlpha = 0.45;
    g.fillStyle = '#000';
    g.filter = 'blur(' + (3 * s).toFixed(1) + 'px)';
    for (const r of T.ramps) {
      g.beginPath();
      const pts = r.left.concat(r.right.slice().reverse());
      const n = pts.length;
      pts.forEach((p, i) => {
        const k = Math.min(1, (i < r.left.length ? i : n - 1 - i) / (r.left.length - 1));
        const ox = 7 * k, oy = 9 * k;
        if (i === 0) g.moveTo(p[0] + ox, p[1] + oy); else g.lineTo(p[0] + ox, p[1] + oy);
      });
      g.closePath(); g.fill();
    }
    g.strokeStyle = '#000'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const k in T.wires) {
      const w = T.wires[k];
      g.beginPath();
      w.pts.forEach((p, i) => { const h = p[2] || 0; const x = p[0] + h * 0.12, y = p[1] + h * 0.16; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.stroke();
    }
    g.filter = 'none';
    g.restore();

    // insert lenses (unlit)
    for (const ins of inserts) drawInsert(g, ins, false, 1);

    // walls as neon tubes
    for (const w of T.draw.walls) {
      if (!w.neon && !w.outer) continue;
      const width = w.outer ? 2.2 : Math.max(1.6, w.r * 0.9);
      neon(g, () => tracePath(g, w), col(w.color), width, s, w.outer ? 1.2 : 1);
    }
    for (const w of T.draw.walls) {
      if (w.neon || w.outer) continue;
      g.save(); g.strokeStyle = 'rgba(120,90,200,0.6)'; g.lineWidth = w.r * 2; g.lineCap = 'round';
      tracePath(g, w); g.stroke(); g.restore();
    }
    // posts
    for (const p of T.draw.posts) {
      g.save();
      g.fillStyle = '#140830';
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      g.restore();
      neon(g, () => { g.beginPath(); g.arc(p.x, p.y, p.r * 0.85, 0, Math.PI * 2); }, col(p.color), 1.3, s, 0.8);
    }
    // sling bodies
    for (const sl of T.draw.slings) {
      g.save();
      g.beginPath(); g.moveTo(sl.top[0], sl.top[1]); g.lineTo(sl.bl[0], sl.bl[1]); g.lineTo(sl.br[0], sl.br[1]); g.closePath();
      const sg = g.createLinearGradient(sl.top[0], sl.top[1], sl.br[0], sl.br[1]);
      sg.addColorStop(0, '#2a0f50'); sg.addColorStop(1, '#14062c');
      g.fillStyle = sg; g.fill();
      g.restore();
      neon(g, () => { g.beginPath(); g.moveTo(sl.top[0], sl.top[1]); g.lineTo(sl.bl[0], sl.bl[1]); g.lineTo(sl.br[0], sl.br[1]); }, COLORS.violet, 1.4, s, 0.7);
      // triangle decal
      g.save();
      g.fillStyle = 'rgba(255,61,240,0.25)';
      const cx = (sl.top[0] + sl.bl[0] + sl.br[0]) / 3, cy = (sl.top[1] + sl.bl[1] + sl.br[1]) / 3;
      g.beginPath(); g.moveTo(cx, cy - 10); g.lineTo(cx - 6, cy + 8); g.lineTo(cx + 6, cy + 8); g.closePath(); g.fill();
      g.restore();
    }
    // Orion lane rollover buttons
    for (const ln of T.draw.lanes) {
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath(); g.ellipse(ln.x, ln.y, 4, 7, 0, 0, Math.PI * 2); g.fill();
    }
    // inlane / outlane rollover buttons
    for (const r of L.rollovers) {
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath(); g.ellipse(r.x, r.y, 4, 7, 0, 0, Math.PI * 2); g.fill();
    }
    // cabinet frame
    g.save();
    g.lineWidth = 3; g.strokeStyle = '#1b0b3a';
    g.strokeRect(1.5, 1.5, W - 3, H - 3);
    g.restore();
    return c;
  }

  // --------------------------------------------------------------- inserts ---
  // builds the insert's path (translated and rotated); caller saves/restores
  function insertShape(g, ins, scale) {
    const sz = 10 * ins.size * (scale || 1);
    g.translate(ins.x, ins.y);
    if (ins.shape === 'arrow') {
      g.rotate(ins.ang + Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -sz * 1.25); g.lineTo(sz * 0.95, sz * 0.75); g.lineTo(0, sz * 0.25); g.lineTo(-sz * 0.95, sz * 0.75); g.closePath();
    } else if (ins.shape === 'tri') {
      g.rotate(ins.ang + Math.PI / 2);
      g.beginPath(); g.moveTo(0, -sz); g.lineTo(sz * 0.9, sz * 0.7); g.lineTo(-sz * 0.9, sz * 0.7); g.closePath();
    } else if (ins.shape === 'pill') {
      const w = sz * (1 + ins.text.length * 0.42), h = sz * 0.95;
      if (ins.ang) g.rotate(ins.ang + Math.PI / 2);
      g.beginPath();
      const r = h / 2;
      g.moveTo(-w / 2 + r, -h / 2); g.lineTo(w / 2 - r, -h / 2); g.arc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
      g.lineTo(-w / 2 + r, h / 2); g.arc(-w / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5); g.closePath();
    } else if (ins.shape === 'star') {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? sz * 0.45 : sz;
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
    } else {
      g.beginPath(); g.arc(0, 0, sz * 0.75, 0, Math.PI * 2);
    }
    return sz;
  }

  function drawInsert(g, ins, lit, alpha) {
    const c = ins.color;
    g.save();
    const sz = insertShape(g, ins, 1);
    if (lit) {
      g.globalAlpha = alpha; g.fillStyle = c; g.fill();
    } else {
      const lg = g.createRadialGradient(-sz * 0.2, -sz * 0.2, 0, 0, 0, sz * 1.2);
      lg.addColorStop(0, rgba(c, 0.28)); lg.addColorStop(1, rgba(c, 0.1));
      g.fillStyle = lg; g.fill();
      g.strokeStyle = rgba(c, 0.55); g.lineWidth = 0.7; g.stroke();
    }
    g.restore();
    if (lit && !(ins.shape === 'pill' && ins.text)) {
      g.save();
      insertShape(g, ins, 0.55);
      g.globalAlpha = alpha * 0.8; g.fillStyle = 'rgba(255,255,255,0.65)'; g.fill();
      g.restore();
    }
    if (ins.text && !lit) {
      g.save();
      g.translate(ins.x, ins.y);
      if (ins.shape === 'pill' && ins.ang) g.rotate(ins.ang + Math.PI / 2);
      g.font = '800 ' + (ins.shape === 'pill' ? 5.6 : 5) * ins.size + 'px "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText(ins.text, 0, 0.4);
      g.restore();
    }
  }

  // lit insert sprite with a baked halo
  function buildInsertSprite(ins, s) {
    const pad = 16 * ins.size + 8;
    const sz = 10 * ins.size;
    const extent = ins.shape === 'pill' ? sz * (1 + ins.text.length * 0.42) / 2 + pad : sz * 1.3 + pad;
    const c = canvas(extent * 2 * s, extent * 2 * s);
    const g = c.getContext('2d');
    g.scale(s, s);
    g.translate(extent - ins.x, extent - ins.y);
    g.save();
    g.shadowColor = ins.color; g.shadowBlur = 14 * s * ins.size;
    drawInsert(g, ins, true, 1);
    g.restore();
    g.save();
    g.shadowColor = ins.color; g.shadowBlur = 6 * s;
    drawInsert(g, ins, true, 1);
    g.restore();
    if (ins.text) {
      g.save();
      g.translate(ins.x, ins.y);
      if (ins.shape === 'pill' && ins.ang) g.rotate(ins.ang + Math.PI / 2);
      g.font = '900 ' + (ins.shape === 'pill' ? 5.6 : 5) * ins.size + 'px "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(30,0,40,0.9)';
      g.fillText(ins.text, 0, 0.4);
      g.restore();
    }
    return { c: c, ox: ins.x - extent, oy: ins.y - extent, w: extent * 2, h: extent * 2 };
  }

  // ----------------------------------------------------------------- top ---
  function buildTop(T, s) {
    const W = 510, H = 1070;
    const c = canvas(W * s, H * s);
    const g = c.getContext('2d');
    g.scale(s, s);
    // wires: chrome rails with ties
    for (const k in T.wires) {
      const w = T.wires[k];
      if (w.id === 'wireLO' || w.id === 'wireRO') continue; // drawn shorter below
      drawWire(g, w.pts, s);
    }
    for (const id of ['wireLO', 'wireRO']) drawWire(g, T.wires[id].pts, s, true);
    // ramps: translucent coloured plastic with neon rails
    for (const r of T.ramps) {
      const color = r.color === 'blue' ? COLORS.blue : COLORS.teal;
      const poly = r.left.concat(r.right.slice().reverse());
      g.save();
      g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
      const a = r.axis[0], b = r.axis[r.axis.length - 1];
      const fg = g.createLinearGradient(a[0], a[1], b[0], b[1]);
      fg.addColorStop(0, rgba(color, 0.10)); fg.addColorStop(1, rgba(color, 0.26));
      g.fillStyle = fg; g.fill();
      g.clip();
      // ribs across the ramp
      g.strokeStyle = rgba('#ffffff', 0.08); g.lineWidth = 1;
      for (let i = 0; i < 40; i++) {
        const t = i / 40;
        const p = r.left[0], q = r.right[0];
        const L = interp(r.left, t), R = interp(r.right, t);
        g.beginPath(); g.moveTo(L[0], L[1]); g.lineTo(R[0], R[1]); g.stroke();
        void p; void q;
      }
      g.restore();
      neon(g, () => { g.beginPath(); r.left.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); }, color, 1.7, s, 0.9);
      neon(g, () => { g.beginPath(); r.right.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); }, color, 1.7, s, 0.9);
      // entry flap
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(r.left[0][0], r.left[0][1]); g.lineTo(r.right[0][0], r.right[0][1]); g.stroke();
      g.restore();
    }
    // docking bay at the right ramp apex
    const lk = T.landmarks.lock;
    g.save();
    g.strokeStyle = 'rgba(255,225,77,0.7)'; g.lineWidth = 1.2;
    g.setLineDash([3, 2]);
    g.strokeRect(lk.x - 16, lk.y - 15, 52, 26);
    g.setLineDash([]);
    g.font = '900 5px "Segoe UI", system-ui, sans-serif'; g.fillStyle = 'rgba(255,225,77,0.9)'; g.textAlign = 'center';
    g.fillText('DOCKING BAY', lk.x + 10, lk.y - 17);
    g.restore();
    // apron
    const ay = 990;
    g.save();
    const ag = g.createLinearGradient(0, ay, 0, H);
    ag.addColorStop(0, '#1c0a3a'); ag.addColorStop(1, '#0a0418');
    g.fillStyle = ag;
    g.beginPath();
    g.moveTo(0, ay + 10); g.lineTo(150, ay); g.lineTo(198, ay + 14);
    g.quadraticCurveTo(237, ay + 30, 276, ay + 14);
    g.lineTo(324, ay); g.lineTo(464, ay + 10); g.lineTo(464, H); g.lineTo(0, H); g.closePath();
    g.fill();
    g.restore();
    neon(g, () => {
      g.beginPath(); g.moveTo(12, ay + 9); g.lineTo(150, ay); g.lineTo(198, ay + 14);
      g.quadraticCurveTo(237, ay + 30, 276, ay + 14); g.lineTo(324, ay); g.lineTo(462, ay + 9);
    }, COLORS.magenta, 1.6, s, 1);
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 900 15px "Segoe UI", system-ui, sans-serif';
    g.shadowColor = COLORS.magenta; g.shadowBlur = 8 * s;
    g.fillStyle = '#ffffff';
    g.fillText('NEON', 120, 1032);
    g.shadowColor = COLORS.cyan;
    g.fillText('NEBULA', 360, 1032);
    g.restore();
    // shooter lane cover at the bottom
    g.fillStyle = '#0a0418';
    g.fillRect(464, 1062, 46, 8);
    return c;
  }

  function interp(pts, t) {
    let L = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
    let target = L * t;
    for (let i = 0; i < seg.length; i++) {
      if (target <= seg[i]) { const k = target / seg[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; }
      target -= seg[i];
    }
    return pts[pts.length - 1];
  }

  function drawWire(g, pts, s, short) {
    const dense = NN.U.smoothPath(pts.map((p) => [p[0], p[1], p[2] || 0]), 6);
    const left = NN.offsetLine(dense, -8.5), right = NN.offsetLine(dense, 8.5);
    const rail = (line, w, color) => {
      g.beginPath(); line.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    };
    // ties
    g.save();
    g.strokeStyle = 'rgba(160,170,200,0.55)'; g.lineWidth = 1.1;
    for (let i = 0; i < dense.length; i += short ? 4 : 5) {
      g.beginPath(); g.moveTo(left[i][0], left[i][1]); g.lineTo(right[i][0], right[i][1]); g.stroke();
    }
    g.restore();
    for (const line of [left, right]) {
      rail(line, 2.6, 'rgba(10,6,24,0.9)');
      rail(line, 1.7, '#9aa3bd');
      rail(line, 0.6, '#ffffff');
    }
  }

  // ------------------------------------------------------------- sprites ---
  function buildBall(rpx) {
    const size = Math.ceil(rpx * 2 + 4);
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const cx = size / 2, cy = size / 2, r = rpx;
    // chrome body
    const body = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    body.addColorStop(0, '#ffffff'); body.addColorStop(0.25, '#d8dbe6'); body.addColorStop(0.6, '#7d8296');
    body.addColorStop(0.85, '#2c2f3d'); body.addColorStop(1, '#14151e');
    g.fillStyle = body; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    // environment reflection band (the playfield's neon)
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    const band = g.createLinearGradient(cx, cy + r * 0.1, cx, cy + r);
    band.addColorStop(0, 'rgba(255,61,240,0)'); band.addColorStop(0.5, 'rgba(255,61,240,0.35)'); band.addColorStop(1, 'rgba(54,226,255,0.45)');
    g.fillStyle = band; g.fillRect(cx - r, cy, r * 2, r);
    g.fillStyle = 'rgba(20,20,30,0.35)';
    g.beginPath(); g.ellipse(cx, cy + r * 0.05, r * 1.1, r * 0.18, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    // fixed specular highlight
    const hl = g.createRadialGradient(cx - r * 0.38, cy - r * 0.42, 0, cx - r * 0.38, cy - r * 0.42, r * 0.42);
    hl.addColorStop(0, 'rgba(255,255,255,1)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.beginPath(); g.arc(cx - r * 0.38, cy - r * 0.42, r * 0.42, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(cx - r * 0.42, cy - r * 0.46, r * 0.12, 0, Math.PI * 2); g.fill();
    // rim
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = Math.max(0.5, r * 0.06);
    g.beginPath(); g.arc(cx, cy, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
    return c;
  }

  function buildShadow(rpx) {
    const size = Math.ceil(rpx * 3.2);
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(0.5, 'rgba(0,0,0,0.3)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, size, size);
    return c;
  }

  // soft additive glow sprite in a colour
  const glowCache = {};
  function glow(color, px) {
    const key = color + '|' + px;
    if (glowCache[key]) return glowCache[key];
    const size = Math.max(4, Math.ceil(px));
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    rg.addColorStop(0, rgba(color, 1)); rg.addColorStop(0.25, rgba(color, 0.55)); rg.addColorStop(1, rgba(color, 0));
    g.fillStyle = rg; g.fillRect(0, 0, size, size);
    glowCache[key] = c;
    return c;
  }
  NN.glowSprite = glow;

  function buildFlipper(f, s, color) {
    const L = f.length, r1 = f.r1, r2 = f.r2;
    const pad = 6;
    const w = (L + r1 + r2 + pad * 2) * s, h = (r1 * 2 + pad * 2) * s;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.scale(s, s);
    g.translate(r1 + pad, r1 + pad);
    const shape = () => {
      const b = (r1 - r2) / L, a = Math.sqrt(1 - b * b);
      const ang = Math.atan2(a, -b);
      g.beginPath();
      g.arc(0, 0, r1, ang, -ang, false);
      g.arc(L, 0, r2, -ang, ang, false);
      g.closePath();
    };
    g.save();
    g.shadowColor = color; g.shadowBlur = 6 * s;
    shape();
    const fg = g.createLinearGradient(0, -r1, 0, r1);
    fg.addColorStop(0, '#3a1a6a'); fg.addColorStop(0.5, '#1c0a3c'); fg.addColorStop(1, '#2a1250');
    g.fillStyle = fg; g.fill();
    g.restore();
    // rubber ring
    g.save();
    shape();
    g.strokeStyle = color; g.lineWidth = 2.2; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.7; g.stroke();
    g.restore();
    // pivot cap
    g.fillStyle = '#c8cde0';
    g.beginPath(); g.arc(0, 0, r1 * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a5f78';
    g.beginPath(); g.arc(0, 0, r1 * 0.14, 0, Math.PI * 2); g.fill();
    return { c: c, ox: r1 + pad, oy: r1 + pad };
  }

  function buildBumper(r, s, lit) {
    const pad = 14;
    const size = (r + pad) * 2 * s;
    const c = canvas(size, size);
    const g = c.getContext('2d');
    g.scale(s, s);
    g.translate(r + pad, r + pad);
    // skirt glow
    g.save();
    g.shadowColor = lit ? '#ffffff' : COLORS.magenta;
    g.shadowBlur = (lit ? 18 : 10) * s;
    g.strokeStyle = lit ? '#ffd6fb' : COLORS.magenta;
    g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, r - 1.5, 0, Math.PI * 2); g.stroke();
    g.restore();
    // metal body
    const body = g.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r * 0.85);
    body.addColorStop(0, lit ? '#ffffff' : '#c9cbe0'); body.addColorStop(0.6, lit ? '#ffb3f6' : '#5d5f7a'); body.addColorStop(1, '#1d1b33');
    g.fillStyle = body; g.beginPath(); g.arc(0, 0, r * 0.82, 0, Math.PI * 2); g.fill();
    // cap
    const cap = g.createRadialGradient(-r * 0.2, -r * 0.25, 1, 0, 0, r * 0.62);
    cap.addColorStop(0, lit ? '#ffffff' : '#ff8ff6'); cap.addColorStop(0.7, lit ? '#ff6ff0' : '#b0179e'); cap.addColorStop(1, lit ? '#d81bd0' : '#4a0a52');
    g.fillStyle = cap; g.beginPath(); g.arc(0, 0, r * 0.62, 0, Math.PI * 2); g.fill();
    // star icon
    g.fillStyle = lit ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.13 : r * 0.32;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
    return { c: c, off: r + pad };
  }

  NN.Art = {
    insertSprite: buildInsertSprite,
    build(T, s, inserts) {
      const t0 = performance.now();
      const art = {
        s: s,
        base: buildBase(T, s, inserts),
        top: buildTop(T, s),
        ball: buildBall(13.5 * s),
        ballBig: buildBall(13.5 * s * 1.3),
        shadow: buildShadow(13.5 * s),
        inserts: {},
        flipL: null, flipU: null,
        bumper: buildBumper(24, s, false),
        bumperLit: buildBumper(24, s, true),
      };
      for (const ins of inserts) art.inserts[ins.id] = buildInsertSprite(ins, s);
      art.flipMain = buildFlipper({ length: T.flippers[0].length, r1: T.flippers[0].r1, r2: T.flippers[0].r2 }, s, COLORS.cyan);
      const u = T.flippers.find((f) => f.upper);
      art.flipUpper = buildFlipper({ length: u.length, r1: u.r1, r2: u.r2 }, s, COLORS.lime);
      art.topBands = bandsOf(art.top);
      art.buildMs = performance.now() - t0;
      return art;
    },
  };

  // find horizontal bands of the top layer that contain pixels (skip empty ones)
  function bandsOf(c) {
    const n = 16, bh = Math.ceil(c.height / n);
    let d = null;
    try { d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; } catch (e) { d = null; }
    const bands = [];
    for (let i = 0; i < n; i++) {
      const y = i * bh, h = Math.min(bh, c.height - y);
      if (h <= 0) continue;
      let any = !d;
      if (d) {
        const start = y * c.width * 4, end = (y + h) * c.width * 4;
        for (let k = start + 3; k < end; k += 16) if (d[k] > 4) { any = true; break; }
      }
      if (any) bands.push([y, h]);
    }
    return bands;
  }
})(globalThis.NN || (globalThis.NN = {}));
