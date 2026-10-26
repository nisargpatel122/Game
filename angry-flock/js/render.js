/* Angry Flock — canvas renderer and particle effects. All art is drawn in code. */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const MAT_COLORS = {
    wood: ['#d39248', '#9a5c25', '#e9b878'],
    glass: ['rgba(170,226,255,0.55)', 'rgba(110,180,220,0.9)', '#e8f8ff'],
    stone: ['#a5abb0', '#666c71', '#c9ced2'],
    tnt: ['#d8432f', '#7a1a12', '#ffd84a'],
  };
  const BIRD_COLORS = {
    red: '#d8261e', blue: '#4aa8e8', yellow: '#f7d117', black: '#2a2a2e', white: '#f4f1ea', big: '#a51b1b',
  };
  const PLANET_COLORS = [['#9b86e0', '#5a45a3'], ['#f0a066', '#a8522b'], ['#6cc6d9', '#2f7d93'], ['#c4d36a', '#7a8a2a']];

  function rnd(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // ---------------- birds ----------------

  function eye(ctx, x, y, r, lookX, lookY, closed) {
    if (closed) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.45;
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
      return;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = r * 0.15; ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x + lookX * r * 0.4, y + lookY * r * 0.35, r * 0.45, 0, TAU); ctx.fill();
  }

  function brows(ctx, r, x1, x2, y, color, thick) {
    ctx.fillStyle = color || '#111';
    ctx.beginPath();
    ctx.moveTo(x1 - 0.2 * r, y + 0.22 * r);
    ctx.lineTo(x2 + 0.18 * r, y - 0.02 * r);
    ctx.lineTo(x2 + 0.18 * r, y - 0.02 * r - (thick || 0.14) * r);
    ctx.lineTo(x1 - 0.2 * r, y + 0.22 * r + (thick || 0.14) * r + 0.06 * r);
    ctx.closePath(); ctx.fill();
  }

  function beak(ctx, x, y, r, len, color) {
    ctx.strokeStyle = 'rgba(120,60,0,0.6)'; ctx.lineWidth = r * 0.04; ctx.lineJoin = 'round';
    ctx.fillStyle = '#e8890c';
    ctx.beginPath();
    ctx.moveTo(x - 0.04 * r, y - 0.06 * r);
    ctx.lineTo(x + len * 0.78 * r, y - 0.08 * r);
    ctx.quadraticCurveTo(x + 0.22 * r, y - 0.34 * r, x - 0.02 * r, y - 0.26 * r);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color || '#ffb21f';
    ctx.beginPath();
    ctx.moveTo(x - 0.06 * r, y + 0.16 * r);
    ctx.quadraticCurveTo(x + len * 0.45 * r, y + 0.22 * r, x + len * r, y - 0.06 * r);
    ctx.lineTo(x - 0.06 * r, y - 0.08 * r);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function body(ctx, r, color, outline) {
    const g = ctx.createRadialGradient(-0.3 * r, 0.35 * r, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, shade(color, 0.25));
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = outline || 'rgba(0,0,0,0.45)'; ctx.lineWidth = r * 0.07; ctx.stroke();
  }

  function shade(hex, amt) {
    if (hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  function drawBird(ctx, type, r, o) {
    o = o || {};
    const closed = !!o.blink;
    const lookX = o.lookX == null ? 1 : o.lookX, lookY = o.lookY || 0;
    const c = BIRD_COLORS[type];
    if (type === 'yellow') {
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.moveTo(-0.1 * r, 1.0 * r); ctx.lineTo(-0.35 * r, 1.35 * r); ctx.lineTo(0.05 * r, 1.1 * r); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-1.0 * r, -0.55 * r); ctx.lineTo(-1.4 * r, -0.45 * r); ctx.lineTo(-1.0 * r, -0.35 * r); ctx.fill();
      const g = ctx.createLinearGradient(0, r, 0, -r);
      g.addColorStop(0, '#ffe96a'); g.addColorStop(1, '#e8b80c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-1.05 * r, -0.8 * r); ctx.lineTo(1.1 * r, -0.72 * r); ctx.lineTo(-0.1 * r, 1.12 * r); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = r * 0.07; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = '#fff6c7';
      ctx.beginPath(); ctx.moveTo(-0.7 * r, -0.76 * r); ctx.lineTo(0.7 * r, -0.72 * r); ctx.lineTo(0, -0.35 * r); ctx.closePath(); ctx.fill();
      eye(ctx, 0.0, 0.05 * r, 0.2 * r, lookX, lookY, closed);
      eye(ctx, 0.36 * r, 0.02 * r, 0.18 * r, lookX, lookY, closed);
      brows(ctx, r, -0.1 * r, 0.5 * r, 0.22 * r, '#5a2a00');
      beak(ctx, 0.35 * r, -0.25 * r, r, 0.75);
      return;
    }
    if (type === 'white') {
      ctx.save(); ctx.scale(0.95, 1.08);
      body(ctx, r, c, 'rgba(0,0,0,0.35)');
      ctx.restore();
      ctx.fillStyle = '#f39ab0';
      ctx.beginPath(); ctx.arc(-0.05 * r, 1.12 * r, 0.14 * r, 0, TAU); ctx.arc(0.12 * r, 1.08 * r, 0.12 * r, 0, TAU); ctx.fill();
      eye(ctx, 0.08 * r, 0.2 * r, 0.2 * r, lookX, lookY, closed);
      eye(ctx, 0.48 * r, 0.18 * r, 0.18 * r, lookX, lookY, closed);
      brows(ctx, r, 0.0, 0.6 * r, 0.38 * r, '#222', 0.1);
      beak(ctx, 0.5 * r, -0.12 * r, r, 0.6);
      return;
    }
    // round birds
    if (type !== 'black') {
      ctx.fillStyle = '#1b1b1b';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-0.85 * r, (-0.1 + i * 0.12) * r); ctx.lineTo(-1.35 * r, (-0.25 + i * 0.22) * r); ctx.lineTo(-0.85 * r, (0.02 + i * 0.12) * r); ctx.fill();
      }
      ctx.fillStyle = type === 'blue' ? '#2e7fc0' : c;
      ctx.beginPath(); ctx.ellipse(-0.05 * r, 1.0 * r, 0.12 * r, 0.3 * r, -0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.18 * r, 0.98 * r, 0.1 * r, 0.24 * r, 0.3, 0, TAU); ctx.fill();
    }
    body(ctx, r, c);
    if (type === 'black') {
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.moveTo(0, 0.95 * r); ctx.quadraticCurveTo(0.15 * r, 1.3 * r, -0.1 * r, 1.45 * r); ctx.stroke();
      ctx.fillStyle = o.fuse ? '#ffef5a' : '#ff9a1f';
      ctx.beginPath(); ctx.arc(-0.1 * r, 1.48 * r, (o.fuse ? 0.16 : 0.1) * r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.arc(0, -0.15 * r, 0.62 * r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else {
      ctx.fillStyle = type === 'big' ? '#e8b49a' : (type === 'blue' ? '#cfe9fb' : '#f4dfc4');
      ctx.beginPath(); ctx.ellipse(0.12 * r, -0.5 * r, 0.62 * r, 0.42 * r, 0, 0, TAU); ctx.fill();
    }
    const big = type === 'big';
    eye(ctx, 0.2 * r, 0.18 * r, (big ? 0.15 : 0.22) * r, lookX, lookY, closed);
    eye(ctx, 0.58 * r, 0.16 * r, (big ? 0.14 : 0.2) * r, lookX, lookY, closed);
    if (type === 'blue') brows(ctx, r, 0.12 * r, 0.62 * r, 0.33 * r, '#163a5c', 0.08);
    else brows(ctx, r, 0.08 * r, 0.7 * r, big ? 0.24 * r : 0.33 * r, type === 'black' ? '#c22' : '#111', big ? 0.24 : 0.16);
    beak(ctx, 0.55 * r, -0.12 * r, r, big ? 0.55 : 0.5);
  }

  // ---------------- pigs ----------------

  function drawPig(ctx, pig, t) {
    const r = pig.r;
    const hurt = pig.hp / pig.maxHp < 0.6;
    if (pig.blink < -0.14) pig.blink = 2 + Math.random() * 4;
    const closed = pig.blink < 0;
    const base = pig.type === 'large' || pig.type === 'king' ? '#6dbb35' : '#7fcc3f';
    // ears
    ctx.fillStyle = base; ctx.strokeStyle = '#3b7a18'; ctx.lineWidth = r * 0.06;
    for (const ex of [-0.55, 0.45]) {
      ctx.beginPath(); ctx.arc(ex * r, 0.78 * r, 0.22 * r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5ea52c';
      ctx.beginPath(); ctx.arc(ex * r, 0.8 * r, 0.11 * r, 0, TAU); ctx.fill();
      ctx.fillStyle = base;
    }
    const g = ctx.createRadialGradient(-0.3 * r, 0.35 * r, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, '#b6ee7a'); g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3b7a18'; ctx.lineWidth = r * 0.07; ctx.stroke();
    if (hurt) {
      ctx.fillStyle = 'rgba(70,60,110,0.3)';
      ctx.beginPath(); ctx.ellipse(0.45 * r, 0.3 * r, 0.25 * r, 0.18 * r, 0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-0.2 * r, -0.55 * r, 0.18 * r, 0.12 * r, 0, 0, TAU); ctx.fill();
    }
    // eyes look toward the slingshot (left)
    eye(ctx, -0.48 * r, 0.32 * r, 0.17 * r, -1, 0, closed);
    eye(ctx, 0.12 * r, 0.36 * r, 0.17 * r, -1, 0, closed || hurt);
    if (pig.type === 'large' || pig.type === 'king') {
      ctx.fillStyle = '#2d5a10';
      ctx.fillRect(-0.68 * r, 0.52 * r, 0.36 * r, 0.08 * r);
      ctx.fillRect(-0.04 * r, 0.56 * r, 0.36 * r, 0.08 * r);
    }
    // snout
    ctx.fillStyle = '#a8e46a'; ctx.strokeStyle = '#4c8a22'; ctx.lineWidth = r * 0.05;
    ctx.beginPath(); ctx.ellipse(-0.2 * r, -0.08 * r, 0.34 * r, 0.25 * r, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2f5d14';
    ctx.beginPath(); ctx.ellipse(-0.32 * r, -0.08 * r, 0.06 * r, 0.1 * r, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-0.08 * r, -0.08 * r, 0.06 * r, 0.1 * r, 0, 0, TAU); ctx.fill();
    // mouth
    ctx.strokeStyle = '#2f5d14'; ctx.lineWidth = r * 0.05;
    ctx.beginPath(); ctx.arc(-0.15 * r, -0.42 * r, 0.2 * r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    if (PIG_HAT[pig.type]) PIG_HAT[pig.type](ctx, r);
  }

  const PIG_HAT = {
    helmet(ctx, r) {
      const g = ctx.createLinearGradient(0, r * 1.1, 0, r * 0.3);
      g.addColorStop(0, '#d5dbe0'); g.addColorStop(1, '#8b939a');
      ctx.fillStyle = g; ctx.strokeStyle = '#4e555b'; ctx.lineWidth = r * 0.06;
      ctx.beginPath(); ctx.arc(0, 0.12 * r, 1.0 * r, Math.PI * 0.08, Math.PI * 0.92); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6f777e';
      ctx.fillRect(-1.05 * r, 0.32 * r, 2.1 * r, 0.14 * r);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(-0.35 * r, 0.82 * r, 0.25 * r, 0.08 * r, 0.3, 0, TAU); ctx.fill();
    },
    king(ctx, r) {
      ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#a77a00'; ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(-0.55 * r, 0.72 * r); ctx.lineTo(-0.62 * r, 1.35 * r); ctx.lineTo(-0.3 * r, 1.05 * r);
      ctx.lineTo(0, 1.45 * r); ctx.lineTo(0.3 * r, 1.05 * r); ctx.lineTo(0.62 * r, 1.35 * r); ctx.lineTo(0.55 * r, 0.72 * r);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e03a3a';
      for (const x of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.arc(x * r, 0.86 * r, 0.07 * r, 0, TAU); ctx.fill(); }
    },
  };

  // ---------------- blocks ----------------

  function blockPath(ctx, b) {
    ctx.beginPath();
    if (b.shape === 'circle') ctx.arc(0, 0, b.r, 0, TAU);
    else if (b.shape === 'tri') { ctx.moveTo(b.pts[0][0], b.pts[0][1]); ctx.lineTo(b.pts[1][0], b.pts[1][1]); ctx.lineTo(b.pts[2][0], b.pts[2][1]); ctx.closePath(); }
    else ctx.rect(-b.w / 2, -b.h / 2, b.w, b.h);
  }

  function makeCracks(b) {
    const R = rnd(b.seed);
    const w = b.w || b.r * 2, h = b.h || b.r * 2;
    const cracks = [];
    for (let i = 0; i < 3; i++) {
      const side = Math.floor(R() * 4);
      let x = (R() - 0.5) * w, y = (R() - 0.5) * h;
      if (side === 0) y = h / 2; else if (side === 1) y = -h / 2; else if (side === 2) x = w / 2; else x = -w / 2;
      const pts = [[x, y]];
      for (let k = 0; k < 4; k++) {
        x += (-x * 0.35) + (R() - 0.5) * w * 0.35;
        y += (-y * 0.35) + (R() - 0.5) * h * 0.35;
        pts.push([x, y]);
      }
      cracks.push(pts);
    }
    return cracks;
  }

  function drawBlock(ctx, b, px) {
    const p = b.body.getPosition();
    const col = MAT_COLORS[b.mat];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(b.body.getAngle());
    blockPath(ctx, b);
    ctx.fillStyle = col[0];
    ctx.fill();
    ctx.save();
    ctx.clip();
    const w = b.w || b.r * 2, h = b.h || b.r * 2;
    const R = rnd(b.seed + 3);
    if (b.mat === 'wood') {
      ctx.strokeStyle = 'rgba(110,60,20,0.35)'; ctx.lineWidth = 1.3 * px;
      const horiz = w >= h, n = 3;
      for (let i = 1; i <= n; i++) {
        const o = (i / (n + 1) - 0.5) * (horiz ? h : w) + (R() - 0.5) * 0.04;
        ctx.beginPath();
        if (horiz) { ctx.moveTo(-w / 2, o); ctx.bezierCurveTo(-w / 6, o + 0.03, w / 6, o - 0.03, w / 2, o); }
        else { ctx.moveTo(o, -h / 2); ctx.bezierCurveTo(o + 0.03, -h / 6, o - 0.03, h / 6, o, h / 2); }
        ctx.stroke();
      }
      if (Math.max(w, h) > 0.8) {
        ctx.beginPath(); ctx.ellipse((R() - 0.5) * w * 0.5, (R() - 0.5) * h * 0.5, Math.min(w, h) * 0.18, Math.min(w, h) * 0.1, horiz ? 0 : Math.PI / 2, 0, TAU);
        ctx.stroke();
      }
    } else if (b.mat === 'glass') {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3 * px;
      ctx.beginPath(); ctx.moveTo(-w / 2 + w * 0.15, h / 2); ctx.lineTo(-w / 2, h / 2 - h * 0.45); ctx.stroke();
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.moveTo(-w / 2 + w * 0.32, h / 2); ctx.lineTo(-w / 2, h / 2 - h * 0.8); ctx.stroke();
    } else if (b.mat === 'stone') {
      ctx.fillStyle = 'rgba(60,66,72,0.25)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.arc((R() - 0.5) * w, (R() - 0.5) * h, 0.04 + R() * 0.08, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-w / 2, h / 2 - 0.07, w, 0.07);
    } else if (b.mat === 'tnt') {
      ctx.fillStyle = '#7a1a12';
      ctx.fillRect(-w / 2, h / 2 - h * 0.14, w, h * 0.08);
      ctx.fillRect(-w / 2, -h / 2 + h * 0.06, w, h * 0.08);
      ctx.save();
      const k = Math.min(w, h) / 30;
      ctx.scale(k, -k);
      ctx.fillStyle = col[2];
      ctx.font = '13px LilitaOne, "Arial Black", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TNT', 0, 1);
      ctx.restore();
    }
    // bevel
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3 * px;
    blockPath(ctx, b); ctx.stroke();
    // cracks
    const dmg = 1 - b.hp / b.maxHp;
    if (dmg > 0.2) {
      if (!b.cracks) b.cracks = makeCracks(b);
      const n = dmg > 0.7 ? 3 : dmg > 0.45 ? 2 : 1;
      ctx.strokeStyle = b.mat === 'glass' ? 'rgba(255,255,255,0.95)' : 'rgba(40,22,8,0.75)';
      ctx.lineWidth = 1.6 * px; ctx.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        const c = b.cracks[i];
        ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]);
        for (let k = 1; k < c.length; k++) ctx.lineTo(c[k][0], c[k][1]);
        ctx.stroke();
      }
    }
    ctx.restore();
    blockPath(ctx, b);
    ctx.strokeStyle = col[1]; ctx.lineWidth = 1.6 * px; ctx.stroke();
    ctx.restore();
  }

  // ---------------- scenery ----------------

  const THEMES = {
    island: { sky: ['#3fa6ee', '#bfe8ff'], far: '#93cdb1', near: '#6fb85e', grass: '#5cae38', dirt: '#8b5a2b', dirtDark: '#6a4220' },
    demo: { sky: ['#f48b55', '#ffe0a8'], far: '#c48a8f', near: '#94616f', grass: '#8a9b3c', dirt: '#93643a', dirtDark: '#6b4524' },
    space: { sky: ['#07071d', '#2b0f4d'] },
  };

  function hillLayer(ctx, W, baseY, amp, color, offset, freq, seed) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, baseY + 400);
    for (let x = 0; x <= W + 8; x += 8) {
      const u = (x + offset) * freq;
      const y = baseY - amp * (0.55 + 0.3 * Math.sin(u + seed) + 0.15 * Math.sin(u * 2.7 + seed * 2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, baseY + 400); ctx.closePath(); ctx.fill();
  }

  function skyline(ctx, W, baseY, color, offset, scale, seed) {
    ctx.fillStyle = color;
    const bw = 46 * scale;
    const start = Math.floor(offset / bw) - 1;
    for (let i = start; i < start + W / bw + 3; i++) {
      const R = rnd(i * 31 + seed);
      const h = (60 + R() * 120) * scale, w = bw * (0.6 + R() * 0.35);
      const x = i * bw - offset;
      ctx.fillRect(x, baseY - h, w, h + 400);
      if (R() > 0.6) ctx.fillRect(x + w * 0.4, baseY - h - 18 * scale, 3 * scale, 18 * scale);
    }
  }

  function cloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 22 * s, 0, TAU); ctx.arc(x + 26 * s, y - 10 * s, 28 * s, 0, TAU);
    ctx.arc(x + 56 * s, y, 22 * s, 0, TAU); ctx.arc(x + 28 * s, y + 8 * s, 22 * s, 0, TAU);
    ctx.fill();
  }

  function drawBackground(ctx, theme, W, H, cam, t) {
    const th = THEMES[theme];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const groundY = H / 2 + cam.y * cam.s;
    if (theme === 'space') {
      const R = rnd(7);
      for (let i = 0; i < 160; i++) {
        const x = ((R() * W * 1.5 - cam.x * cam.s * 0.08) % (W * 1.5) + W * 1.5) % (W * 1.5);
        const y = R() * H;
        const tw = 0.5 + 0.5 * Math.sin(t * (1 + R() * 3) + i);
        ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.6 * tw * R()})`;
        ctx.fillRect(x, y, 1.5 + R() * 1.5, 1.5 + R() * 1.5);
      }
      const ng = ctx.createRadialGradient(W * 0.7, H * 0.3, 10, W * 0.7, H * 0.3, H * 0.7);
      ng.addColorStop(0, 'rgba(180,80,200,0.25)'); ng.addColorStop(1, 'rgba(180,80,200,0)');
      ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
      return;
    }
    // sun
    ctx.fillStyle = theme === 'demo' ? 'rgba(255,240,200,0.9)' : 'rgba(255,250,210,0.85)';
    ctx.beginPath(); ctx.arc(W * 0.82 - cam.x * cam.s * 0.02, groundY - H * 0.62, 34, 0, TAU); ctx.fill();
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 6; i++) {
      const R = rnd(i + 11);
      const span = W + 300;
      const x = ((R() * span + t * (6 + R() * 6) - cam.x * cam.s * 0.15) % span + span) % span - 150;
      cloud(ctx, x, groundY - H * (0.45 + R() * 0.4), 0.6 + R() * 0.6);
    }
    if (theme === 'demo') {
      skyline(ctx, W, groundY, th.far, cam.x * cam.s * 0.2, 1, 3);
      skyline(ctx, W, groundY, th.near, cam.x * cam.s * 0.4, 1.4, 9);
    } else {
      hillLayer(ctx, W, groundY, H * 0.32, th.far, cam.x * cam.s * 0.2, 0.006, 1);
      hillLayer(ctx, W, groundY, H * 0.18, th.near, cam.x * cam.s * 0.45, 0.011, 4);
    }
  }

  function drawGround(ctx, theme, view, px) {
    const th = THEMES[theme];
    const x1 = view.x1 - 200, x2 = view.x2 + 200;
    ctx.fillStyle = th.dirt; ctx.fillRect(x1, -40, x2 - x1, 40);
    ctx.fillStyle = th.dirtDark;
    for (let x = Math.floor(view.x1 - 60); x < view.x2 + 60; x += 3) {
      const R = rnd(x + 1000);
      ctx.beginPath(); ctx.ellipse(x + R() * 2, -0.8 - R() * 3, 0.25 + R() * 0.3, 0.12 + R() * 0.1, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = th.grass; ctx.fillRect(x1, -0.35, x2 - x1, 0.35);
    ctx.fillStyle = shade(th.grass, 0.2); ctx.fillRect(x1, -0.1, x2 - x1, 0.1);
    // tufts
    ctx.fillStyle = shade(th.grass, -0.15);
    for (let x = Math.floor(view.x1 - 60); x < view.x2 + 60; x += 1.3) {
      const R = rnd(Math.round(x * 10));
      const h = 0.12 + R() * 0.18;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 0.06, h); ctx.lineTo(x + 0.12, 0); ctx.lineTo(x + 0.2, h * 0.8); ctx.lineTo(x + 0.26, 0); ctx.fill();
    }
  }

  function drawTerrain(ctx, theme, terrain, px) {
    const th = THEMES[theme] && THEMES[theme].dirt ? THEMES[theme] : THEMES.island;
    for (const t of terrain) {
      const pts = t.pts;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      if (t.style === 'rock') {
        const x1 = Math.min(...pts.map(q => q[0])), y2 = Math.max(...pts.map(q => q[1]));
        ctx.fillStyle = '#8d8a86'; ctx.fill();
        ctx.save(); ctx.clip();
        const R = rnd(Math.round(x1 * 13 + y2 * 7));
        ctx.fillStyle = 'rgba(60,55,50,0.25)';
        for (let k = 0; k < 8; k++) {
          ctx.beginPath(); ctx.arc(pts[0][0] + R() * (pts[1][0] - pts[0][0]), pts[0][1] + R() * (pts[2][1] - pts[0][1]), 0.1 + R() * 0.25, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x1, y2 - 0.12, 200, 0.12);
        ctx.restore();
        ctx.strokeStyle = '#55524e'; ctx.lineWidth = 2 * px; ctx.stroke();
        continue;
      }
      ctx.fillStyle = th.dirt; ctx.fill();
      ctx.strokeStyle = th.dirtDark; ctx.lineWidth = 2 * px; ctx.stroke();
      ctx.strokeStyle = th.grass; ctx.lineWidth = 0.32; ctx.lineCap = 'round';
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
        if (dx / l < -0.5) { ctx.beginPath(); ctx.moveTo(a[0], a[1] - 0.12); ctx.lineTo(b[0], b[1] - 0.12); ctx.stroke(); }
      }
      ctx.lineCap = 'butt';
    }
  }

  function drawPlanet(ctx, p, i, t, px) {
    const col = PLANET_COLORS[i % PLANET_COLORS.length];
    const fg = ctx.createRadialGradient(p.x, p.y, p.r, p.x, p.y, p.field);
    fg.addColorStop(0, 'rgba(140,200,255,0.16)'); fg.addColorStop(1, 'rgba(140,200,255,0.02)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.field, 0, TAU); ctx.fill();
    ctx.setLineDash([0.4, 0.4]);
    ctx.strokeStyle = 'rgba(170,215,255,0.35)'; ctx.lineWidth = 1.5 * px;
    ctx.lineDashOffset = -t * 0.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.field, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    const g = ctx.createRadialGradient(p.x - p.r * 0.35, p.y + p.r * 0.35, p.r * 0.1, p.x, p.y, p.r);
    g.addColorStop(0, shade(col[0], 0.25)); g.addColorStop(1, col[1]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    const R = rnd(i * 13 + 5);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let k = 0; k < 6; k++) {
      const a = R() * TAU, d = R() * p.r * 0.7, cr = p.r * (0.08 + R() * 0.15);
      ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, cr, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2 * px;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
  }

  // ---------------- slingshot ----------------

  const SL = { lx: -0.4, ly: 2.42, rx: 0.36, ry: 2.34 };

  function slingArm(ctx, x, y, front) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#5a3416'; ctx.lineWidth = 0.34;
    if (front) {
      ctx.beginPath(); ctx.moveTo(x, y + 1.3); ctx.quadraticCurveTo(x - 0.35, y + 1.6, x + SL.lx, y + SL.ly); ctx.stroke();
      ctx.strokeStyle = '#8a5527'; ctx.lineWidth = 0.22;
      ctx.beginPath(); ctx.moveTo(x, y + 1.3); ctx.quadraticCurveTo(x - 0.35, y + 1.6, x + SL.lx, y + SL.ly); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 1.35); ctx.quadraticCurveTo(x + 0.3, y + 1.6, x + SL.rx, y + SL.ry); ctx.stroke();
      ctx.strokeStyle = '#8a5527'; ctx.lineWidth = 0.22;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 1.35); ctx.quadraticCurveTo(x + 0.3, y + 1.6, x + SL.rx, y + SL.ry); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function band(ctx, ax, ay, bx, by) {
    ctx.strokeStyle = '#3a1c0c'; ctx.lineWidth = 0.13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // ---------------- particles ----------------

  const DEBRIS = {
    wood: { colors: ['#d39248', '#b8742f', '#e9b878', '#9a5c25'], edge: '#6e3f17', dust: 'rgba(214,186,140,' },
    glass: { colors: ['rgba(205,240,255,0.9)', 'rgba(170,225,250,0.85)', 'rgba(235,250,255,0.95)'], edge: 'rgba(255,255,255,0.95)', dust: 'rgba(235,248,255,' },
    stone: { colors: ['#a5abb0', '#8a9095', '#c4c9cc', '#7a8085'], edge: '#4f5458', dust: 'rgba(185,185,180,' },
    tnt: { colors: ['#3a2a22', '#d8432f', '#5a3a2a'], edge: '#1a0f0a', dust: 'rgba(90,80,75,' },
  };

  class FX {
    constructor() { this.parts = []; this.texts = []; this.trauma = 0; this.flash = 0; this.time = 0; }

    clear() { this.parts.length = 0; this.texts.length = 0; this.trauma = 0; this.flash = 0; }

    add(p) { if (this.parts.length < 1100) this.parts.push(p); }

    // Screen shake builds up and decays; small knocks add a little, explosions a lot.
    addShake(amount) { this.trauma = Math.min(1, this.trauma + amount); }
    shakeOffset() {
      const k = this.trauma * this.trauma * 16, t = this.time * 60;
      return { x: k * (Math.sin(t * 1.7) + Math.sin(t * 2.9)) * 0.5, y: k * (Math.cos(t * 2.3) + Math.sin(t * 3.7)) * 0.5 };
    }

    debris(mat, x, y, w, h, angle, vx, vy) {
      const D = DEBRIS[mat] || DEBRIS.wood;
      const area = w * h;
      const n = Math.max(6, Math.min(24, Math.round(6 + area * 16)));
      const c = Math.cos(angle || 0), s = Math.sin(angle || 0);
      for (let i = 0; i < n; i++) {
        const lx = (Math.random() - 0.5) * w, ly = (Math.random() - 0.5) * h;
        const px = x + lx * c - ly * s, py = y + lx * s + ly * c;
        const out = 2 + Math.random() * 4.5;
        const dx = px - x, dy = py - y, dl = Math.hypot(dx, dy) || 1;
        const p = {
          type: 'chunk', shape: mat === 'glass' ? 'shard' : mat === 'stone' ? 'rock' : 'splinter',
          x: px, y: py, vx: vx * 0.5 + dx / dl * out + (Math.random() - 0.5) * 2, vy: vy * 0.5 + dy / dl * out + Math.random() * 3,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16, life: 2.2 + Math.random() * 1.6, max: 3.8,
          color: D.colors[Math.floor(Math.random() * D.colors.length)], edge: D.edge,
        };
        if (p.shape === 'splinter') { p.w = 0.14 + Math.random() * 0.4; p.h = 0.05 + Math.random() * 0.05; }
        else if (p.shape === 'shard') {
          const r = 0.07 + Math.random() * 0.2;
          p.pts = [0, 1, 2].map(k => { const a = k * TAU / 3 + Math.random() * 0.8; return [Math.cos(a) * r, Math.sin(a) * r * (0.4 + Math.random())]; });
        } else {
          const r = 0.06 + Math.random() * 0.17;
          p.pts = [0, 1, 2, 3, 4].map(k => { const a = k * TAU / 5 + Math.random() * 0.5; const rr = r * (0.7 + Math.random() * 0.5); return [Math.cos(a) * rr, Math.sin(a) * rr]; });
        }
        this.add(p);
      }
      if (mat === 'glass') {
        for (let i = 0; i < 6; i++) {
          this.add({ type: 'glint', x: x + (Math.random() - 0.5) * w, y: y + (Math.random() - 0.5) * h, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, life: 0.35 + Math.random() * 0.4, max: 0.75, noGrav: true, w: 0.12 + Math.random() * 0.1 });
        }
      }
      this.smoke(x, y, Math.max(0.5, Math.max(w, h) * 0.6), D.dust, Math.min(8, 3 + Math.round(area * 4)));
      this.addShake(mat === 'stone' ? 0.1 : mat === 'wood' ? 0.06 : 0.04);
    }

    impactDust(x, y, strength, mat) {
      const D = DEBRIS[mat] || DEBRIS.wood;
      this.smoke(x, y, 0.25 + strength * 0.5, D.dust, 2 + Math.round(strength * 3));
    }

    smoke(x, y, size, rgbaPrefix, n) {
      for (let i = 0; i < (n || 6); i++) {
        this.add({
          type: 'smoke', x: x + (Math.random() - 0.5) * size, y: y + (Math.random() - 0.5) * size,
          vx: (Math.random() - 0.5) * 1.6, vy: 0.3 + Math.random() * 0.9, life: 0.8 + Math.random() * 0.7, max: 1.5,
          r: size * (0.35 + Math.random() * 0.5), grow: 1.5, color: rgbaPrefix || 'rgba(255,255,255,', noGrav: true,
        });
      }
    }

    feathers(type, x, y, n) {
      const c = BIRD_COLORS[type] || '#fff';
      for (let i = 0; i < n; i++) {
        this.add({
          type: 'feather', x, y, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5, rot: Math.random() * TAU,
          vr: (Math.random() - 0.5) * 8, life: 1.2 + Math.random() * 0.8, max: 2, w: 0.28, h: 0.1, color: c, drag: true,
        });
      }
    }

    explosion(x, y, r) {
      this.add({ type: 'fireball', x, y, r: r * 0.25, max: r * 0.8, life: 0.45, t: 0, noGrav: true });
      this.add({ type: 'ring', x, y, r: 0.2, max: r * 1.1, life: 0.4, t: 0 });
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * TAU, sp = 5 + Math.random() * 13;
        this.add({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.5, max: 0.8, color: Math.random() > 0.5 ? '#ffd23a' : '#ff7a1a', noGrav: Math.random() > 0.4 });
      }
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * TAU, d = Math.random() * r * 0.5;
        this.add({ type: 'smoke', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 + 0.8, life: 1.1 + Math.random() * 0.8, max: 1.9, r: r * 0.3, grow: 1.7, color: 'rgba(80,72,68,', noGrav: true });
      }
      this.flash = 0.28;
      this.addShake(0.75);
    }

    pigPop(x, y, r) {
      this.add({ type: 'ring', x, y, r: r * 0.5, max: r * 2.2, life: 0.3, t: 0, color: '200,255,170' });
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        this.add({ type: 'smoke', x: x + Math.cos(a) * r * 0.6, y: y + Math.sin(a) * r * 0.6, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4, life: 0.6 + Math.random() * 0.4, max: 1, r: r * 0.45, grow: 1.25, color: 'rgba(235,250,225,', noGrav: true });
      }
      for (let i = 0; i < 7; i++) {
        this.add({ type: 'star', x, y, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5, life: 0.9, max: 0.9, rot: 0, vr: 6, w: 0.24 });
      }
      this.addShake(0.08);
    }

    text(x, y, str, color, size) {
      this.texts.push({ x, y, str, color: color || '#fff', size: size || 18, life: 1.3, max: 1.3 });
    }

    update(dt, sim) {
      this.time += dt;
      for (const p of this.parts) {
        p.life -= dt;
        if (p.type === 'ring' || p.type === 'fireball') { p.t += dt; continue; }
        const ox = p.x, oy = p.y;
        if (!p.noGrav && !p.rest) {
          const g = sim ? sim.gravityAt(p.x, p.y) : { x: 0, y: -10 };
          p.vx += g.x * dt * (p.drag ? 0.15 : 1); p.vy += g.y * dt * (p.drag ? 0.15 : 1);
        }
        if (p.drag) { p.vx *= 0.97; p.vy *= 0.97; }
        if (p.rest) continue;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
        if (p.type === 'smoke') p.r *= 1 + dt * (p.grow - 1) * 2;
        // chunks bounce off the ground and hills, then settle
        if (p.type === 'chunk' && sim && sim.solidAt(p.x, p.y)) {
          if (!sim.solidAt(p.x, oy)) { p.y = oy; p.vy *= -0.3; p.vx *= 0.7; p.vr *= 0.6; if (Math.abs(p.vy) < 0.8) { p.vy = 0; if (Math.abs(p.vx) < 0.4) p.rest = true; } }
          else { p.x = ox; p.y = oy; p.vx *= -0.3; p.vy *= 0.5; }
        }
      }
      this.parts = this.parts.filter(p => p.life > 0);
      for (const tx of this.texts) { tx.life -= dt; tx.y += dt * 1.2; }
      this.texts = this.texts.filter(tx => tx.life > 0);
      this.trauma = Math.max(0, this.trauma - dt * 1.4);
      this.flash = Math.max(0, this.flash - dt);
    }

    draw(ctx, px) {
      for (const p of this.parts) {
        const a = Math.max(0, Math.min(1, p.life / 0.6));
        if (p.type === 'chunk') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a;
          ctx.fillStyle = p.color; ctx.strokeStyle = p.edge; ctx.lineWidth = px;
          if (p.shape === 'splinter') { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
          else {
            ctx.beginPath(); ctx.moveTo(p.pts[0][0], p.pts[0][1]);
            for (let k = 1; k < p.pts.length; k++) ctx.lineTo(p.pts[k][0], p.pts[k][1]);
            ctx.closePath(); ctx.fill(); ctx.stroke();
          }
          ctx.restore();
        } else if (p.type === 'feather') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a;
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, p.w, p.h, 0, 0, TAU); ctx.fill();
          ctx.restore();
        } else if (p.type === 'smoke') {
          ctx.fillStyle = p.color + (0.5 * Math.min(1, p.life * 1.4)).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        } else if (p.type === 'spark') {
          ctx.strokeStyle = p.color; ctx.globalAlpha = a; ctx.lineWidth = 3 * px;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (p.type === 'glint') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.time * 6); ctx.globalAlpha = a;
          ctx.fillStyle = '#ffffff'; starPath(ctx, 0, 0, p.w, p.w * 0.25); ctx.fill();
          ctx.restore();
        } else if (p.type === 'ring') {
          const k = Math.min(1, p.t / 0.35), col = p.color || '255,230,150';
          ctx.strokeStyle = `rgba(${col},${(1 - k).toFixed(3)})`; ctx.lineWidth = 0.35 * (1 - k) + px;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (p.max - p.r) * k, 0, TAU); ctx.stroke();
        } else if (p.type === 'fireball') {
          const k = Math.min(1, p.t / 0.45), rr = p.r + (p.max - p.r) * Math.sqrt(k);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
          g.addColorStop(0, `rgba(255,250,210,${(1 - k).toFixed(3)})`);
          g.addColorStop(0.4, `rgba(255,190,60,${(0.9 * (1 - k)).toFixed(3)})`);
          g.addColorStop(1, 'rgba(255,90,20,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.fill();
        } else if (p.type === 'star') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a;
          ctx.fillStyle = '#fff6a0'; starPath(ctx, 0, 0, p.w, p.w * 0.45); ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  function starPath(ctx, x, y, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  // ---------------- main draw ----------------

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.W = 1; this.H = 1; this.dpr = 1;
    }

    resize(W, H, dpr) {
      this.W = W; this.H = H; this.dpr = dpr;
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
    }

    toScreen(cam, x, y) {
      return { x: (x - cam.x) * cam.s + this.W / 2, y: (cam.y - y) * cam.s + this.H / 2 };
    }

    draw(v) {
      const { ctx, W, H, dpr } = this;
      const sim = v.sim, cam = v.cam, theme = v.theme, t = v.time;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackground(ctx, theme, W, H, cam, t);
      if (!sim) return;

      let shx = 0, shy = 0;
      if (v.fx.trauma > 0) { const o = v.fx.shakeOffset(); shx = o.x; shy = o.y; }
      const s = cam.s;
      ctx.setTransform(s * dpr, 0, 0, -s * dpr, (W / 2 - cam.x * s + shx) * dpr, (H / 2 + cam.y * s + shy) * dpr);
      const px = 1 / s;

      sim.planets.forEach((p, i) => drawPlanet(ctx, p, i, t, px));
      if (!sim.space && sim.level.ground !== false) drawGround(ctx, theme, sim.view, px);
      drawTerrain(ctx, theme, sim.terrain, px);

      // previous shot trail
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const d of v.lastTrail || []) { ctx.beginPath(); ctx.arc(d.x, d.y, d.big ? 0.12 : 0.07, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (const d of sim.trail) { ctx.beginPath(); ctx.arc(d.x, d.y, d.big ? 0.12 : 0.07, 0, TAU); ctx.fill(); }

      const sx = sim.sling.x, sy = sim.sling.y;
      if (sim.space) {
        ctx.fillStyle = '#6d6478';
        ctx.beginPath(); ctx.ellipse(sx, sy - 0.15, 0.9, 0.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#8a8196';
        ctx.beginPath(); ctx.ellipse(sx - 0.15, sy - 0.05, 0.6, 0.22, 0, 0, TAU); ctx.fill();
      }
      slingArm(ctx, sx, sy, false);

      // birds waiting in line
      const queue = v.queue || [];
      for (const q of queue) {
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot || 0);
        drawBird(ctx, q.type, q.r, { blink: q.blink, lookX: 1 });
        ctx.restore();
      }

      for (const b of sim.blocks) drawBlock(ctx, b, px);
      for (const p of sim.pigs) {
        const q = p.body.getPosition();
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(p.body.getAngle());
        drawPig(ctx, p, t);
        ctx.restore();
      }
      for (const e of sim.projectiles) {
        const q = e.body.getPosition();
        ctx.save(); ctx.translate(q.x, q.y);
        if (e.kind === 'egg') {
          ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5 * px;
          ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r * 1.25, 0, 0, TAU); ctx.fill(); ctx.stroke();
        } else {
          const vel = e.body.getLinearVelocity();
          ctx.rotate(e.hitT < 0 ? Math.atan2(vel.y, vel.x) : e.body.getAngle());
          drawBird(ctx, e.type, e.r, { fuse: e.type === 'black' && e.hitT >= 0 && Math.sin(t * 30) > 0 });
        }
        ctx.restore();
      }

      // bird sitting in the slingshot
      const lx = sx + SL.lx, ly = sy + SL.ly, rx = sx + SL.rx, ry = sy + SL.ry;
      if (v.slingBird) {
        const b = v.slingBird;
        const r = b.r;
        let backX = b.x, backY = b.y;
        if (v.aim) {
          const dx = b.x - sim.sling.restX, dy = b.y - sim.sling.restY, d = Math.hypot(dx, dy) || 1;
          backX = b.x + dx / d * r * 0.9; backY = b.y + dy / d * r * 0.9;
        } else {
          backX = b.x - r * 0.8;
        }
        band(ctx, rx, ry, backX, backY);
        ctx.fillStyle = '#3a1c0c';
        ctx.beginPath(); ctx.arc(backX, backY, r * 0.45, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(b.x, b.y);
        if (v.aim) {
          const dx = sim.sling.restX - b.x, dy = sim.sling.restY - b.y;
          if (Math.hypot(dx, dy) > 0.2) ctx.rotate(Math.atan2(dy, dx));
        }
        drawBird(ctx, b.type, r, { blink: b.blink });
        ctx.restore();
        band(ctx, lx, ly, backX, backY);
      } else {
        band(ctx, lx, ly, rx, ry);
      }
      slingArm(ctx, sx, sy, true);

      // aiming guide
      if (v.aim && v.aim.pts) {
        const n = v.aim.pts.length;
        for (let i = 2; i < n; i += 3) {
          const p = v.aim.pts[i];
          const k = 1 - i / n;
          ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.6 * k).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, 0.05 + 0.08 * k, 0, TAU); ctx.fill();
        }
      }

      v.fx.draw(ctx, px);

      // screen-space overlays
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const tx of v.fx.texts) {
        const p = this.toScreen(cam, tx.x, tx.y);
        const a = Math.min(1, tx.life / tx.max * 2.5);
        const size = tx.size * (1 + 0.3 * Math.max(0, tx.life - tx.max + 0.2) * 5);
        ctx.globalAlpha = a;
        ctx.font = `${Math.round(size)}px LilitaOne, "Arial Black", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineJoin = 'round';
        ctx.strokeText(tx.str, p.x, p.y);
        ctx.fillStyle = tx.color; ctx.fillText(tx.str, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      if (v.fx.flash > 0) {
        ctx.fillStyle = `rgba(255,245,220,${(v.fx.flash * 1.6).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  // Small standalone portraits (used by menus and the bird hint).
  function birdPortrait(type, size) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    const r = size * 0.3;
    ctx.setTransform(dpr, 0, 0, -dpr, size * dpr / 2, size * dpr * 0.56);
    drawBird(ctx, type, r, {});
    return c;
  }

  function pigPortrait(type, size) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, -dpr, size * dpr / 2, size * dpr * 0.58);
    drawPig(ctx, { r: size * 0.3, hp: 1, maxHp: 1, type, blink: 5 }, 0);
    return c;
  }

  root.Render = { Renderer, FX, drawBird, drawPig, birdPortrait, pigPortrait, SLING: SL, BIRD_COLORS };
})(typeof self !== 'undefined' ? self : this);
