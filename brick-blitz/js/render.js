/* Brick Blitz — canvas renderer and effects. All art is drawn in code, and anything that is
 * drawn often (bricks, glows, capsules) is drawn once into a sprite and reused. */
(function (root) {
  'use strict';

  const Sim = root.Sim;
  const { FW, FH, BW, BH, PADDLE_Y, PADDLE_H, CAPSULE_W, CAPSULE_H, DANGER_Y, BALL_R } = Sim;
  const TAU = Math.PI * 2;
  const FONT = "'LilitaOne', 'Arial Black', system-ui, sans-serif";

  // light, mid, dark
  const BRICK = {
    red: ['#ff7486', '#ec2b48', '#8a0c22'],
    orange: ['#ffb45c', '#f2711a', '#8f3a06'],
    yellow: ['#fff07a', '#f5c518', '#8c6800'],
    lime: ['#d8ff6e', '#8fd61f', '#3f6d06'],
    green: ['#6bf7a0', '#18b864', '#05613a'],
    cyan: ['#7ff6ff', '#16b9e0', '#05587a'],
    blue: ['#78acff', '#2d5ef0', '#10267a'],
    purple: ['#c99bff', '#7a3cf0', '#33127a'],
    pink: ['#ff8fe0', '#ea2ea8', '#7a0c55'],
    white: ['#ffffff', '#c9d3e6', '#6b7690'],
    metal: ['#d6e2f2', '#8a9bb6', '#3a4760'],
    steel: ['#a9b3c2', '#5d6878', '#232a35'],
    gold: ['#fff3a6', '#f2b51c', '#7a4c00'],
    tnt: ['#ff7752', '#dc2a1c', '#640c06'],
    bonus: ['#ffd1f7', '#c04ef0', '#4c138a'],
    ball: ['#7d8fb8', '#33416a', '#121a33'],
    ghost: ['#f1e6ff', '#b9a2ee', '#6a52a8'],
    turret: ['#7a808e', '#3a3f4a', '#16181d'],
  };

  const THEMES = {
    neon: { top: '#140733', bot: '#3a0b52', far: '#07021a', line: '#ff3fd2', wall: '#22e6ff', accent: '#ff3fd2', dust: '#ffb3f0' },
    caves: { top: '#03161d', bot: '#0b3a45', far: '#010a0e', line: '#4ff0ff', wall: '#7cf5ff', accent: '#62ffd8', dust: '#bff9ff' },
    forge: { top: '#1a0604', bot: '#4d1306', far: '#0a0201', line: '#ff7a1a', wall: '#ff6a00', accent: '#ffb02e', dust: '#ffb066' },
    space: { top: '#02030e', bot: '#0d1036', far: '#000006', line: '#9d8cff', wall: '#a99bff', accent: '#ff6ad5', dust: '#ffffff' },
    cyber: { top: '#010910', bot: '#032338', far: '#000306', line: '#00ffa6', wall: '#00ffb0', accent: '#00d9ff', dust: '#9dffd9' },
  };

  // Paddle and ball styles, unlocked with stars.
  const SKINS = [
    { name: 'Classic', stars: 0, pad: ['#7ff6ff', '#139fd0', '#06405e'], glow: '#22e6ff', ball: '#ffffff', trail: '#7ff6ff' },
    { name: 'Sunset', stars: 15, pad: ['#ffd27a', '#ff6a3d', '#7a1c2e'], glow: '#ff7a4a', ball: '#fff2d6', trail: '#ff9a5a' },
    { name: 'Toxic', stars: 40, pad: ['#e6ff8a', '#69d61f', '#1f5a06'], glow: '#9dff3a', ball: '#f4ffd6', trail: '#b6ff4a' },
    { name: 'Royal', stars: 75, pad: ['#e2c6ff', '#8a3cf0', '#2c0f66'], glow: '#c38bff', ball: '#ffe9a6', trail: '#ffd23a' },
    { name: 'Inferno', stars: 120, pad: ['#ffe066', '#ff4a1c', '#5a0a04'], glow: '#ff5a1c', ball: '#fff0c2', trail: 'fire' },
    { name: 'Glacier', stars: 165, pad: ['#ffffff', '#9fd8ff', '#2f6aa8'], glow: '#bfe8ff', ball: '#e8f8ff', trail: '#bfe8ff' },
    { name: 'Rainbow', stars: 215, pad: ['#ffffff', '#ff5ad1', '#3a1a8a'], glow: '#ff5ad1', ball: '#ffffff', trail: 'rainbow' },
    { name: 'Golden', stars: 270, pad: ['#fff6b0', '#f2b51c', '#6a4200'], glow: '#ffd23a', ball: '#fff6c8', trail: '#ffd23a' },
  ];

  const POWER_LOOK = {
    expand: ['#7dffb0', '#13b862'], multi: ['#7fe8ff', '#1488e0'], laser: ['#ff8fa8', '#d81e4a'],
    slow: ['#9fd0ff', '#2f6ae0'], magnet: ['#e3b0ff', '#8a2ee0'], shield: ['#a8fff0', '#10b8a0'],
    fire: ['#ffd36b', '#ff5a10'], zap: ['#fff58a', '#e8b000'], life: ['#ff9ac2', '#ec2b6a'],
    shrink: ['#5a2626', '#2a0a0a'], fast: ['#5a2626', '#2a0a0a'],
  };

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function rnd(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------------------------------------------------------------- brick sprites
  function brickBase(ctx, w, h, pal, r) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal[0]);
    g.addColorStop(0.45, pal[1]);
    g.addColorStop(1, pal[2]);
    rr(ctx, 0, 0, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    // gloss on the top half
    const gl = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,0.55)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    rr(ctx, h * 0.08, h * 0.07, w - h * 0.16, h * 0.45, r * 0.7);
    ctx.fillStyle = gl;
    ctx.fill();
    // rim
    rr(ctx, 0.5, 0.5, w - 1, h - 1, r);
    ctx.lineWidth = Math.max(1, h * 0.05);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.stroke();
  }

  function cracks(ctx, w, h, level, seed) {
    const R = rnd(seed + 7);
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < level; k++) {
      let x = w * (0.2 + R() * 0.6), y = h * (0.2 + R() * 0.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      const n = 3 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        x += (R() - 0.5) * w * 0.35;
        y += (R() - 0.5) * h * 0.7;
        ctx.lineTo(Math.max(1, Math.min(w - 1, x)), Math.max(1, Math.min(h - 1, y)));
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(1, h * 0.07);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(0.5, h * 0.025);
      ctx.stroke();
    }
    ctx.restore();
  }

  function rivet(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(x, y + r * 0.3, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.fill();
  }

  function drawBrick(look, w, h) {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const r = h * 0.22;
    const pal = BRICK[look.color] || BRICK.white;
    const dmg = look.maxHp > 1 && look.maxHp < 99 ? 1 - look.hp / look.maxHp : 0;
    switch (look.kind) {
      case 'normal':
        brickBase(ctx, w, h, pal, r);
        if (look.maxHp > 1) {
          if (look.hp > 1) {
            rr(ctx, h * 0.16, h * 0.16, w - h * 0.32, h - h * 0.32, r * 0.6);
            ctx.lineWidth = Math.max(1, h * 0.09);
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.stroke();
            rivet(ctx, h * 0.3, h * 0.5, h * 0.07);
            rivet(ctx, w - h * 0.3, h * 0.5, h * 0.07);
          } else cracks(ctx, w, h, 2, look.seed);
        }
        break;
      case 'armor': {
        brickBase(ctx, w, h, pal, r);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = Math.max(1, h * 0.04);
        for (let i = 1; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(h * 0.2, h * i / 4); ctx.lineTo(w - h * 0.2, h * i / 4); ctx.stroke();
        }
        // pips: hits left
        const n = look.hp, pr = h * 0.1, gap = pr * 2.7;
        const x0 = w / 2 - (n - 1) * gap / 2;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.beginPath(); ctx.arc(x0 + i * gap, h * 0.56, pr * 1.25, 0, TAU); ctx.fill();
          ctx.fillStyle = '#eaf6ff';
          ctx.beginPath(); ctx.arc(x0 + i * gap, h * 0.53, pr, 0, TAU); ctx.fill();
        }
        if (dmg > 0) cracks(ctx, w, h, Math.ceil(dmg * 3), look.seed);
        break;
      }
      case 'steel': {
        brickBase(ctx, w, h, pal, r * 0.6);
        ctx.save();
        rr(ctx, 1, 1, w - 2, h - 2, r * 0.6);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = h * 0.12;
        for (let x = -h; x < w + h; x += h * 0.55) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke(); }
        ctx.restore();
        const rv = h * 0.08;
        rivet(ctx, h * 0.25, h * 0.27, rv); rivet(ctx, w - h * 0.25, h * 0.27, rv);
        rivet(ctx, h * 0.25, h * 0.73, rv); rivet(ctx, w - h * 0.25, h * 0.73, rv);
        if (dmg > 0) cracks(ctx, w, h, Math.ceil(dmg * 4), look.seed);
        break;
      }
      case 'gold': {
        brickBase(ctx, w, h, pal, r * 0.6);
        if (look.frame != null) {
          // a highlight sweeping across, one sprite per frame
          ctx.save();
          rr(ctx, 1, 1, w - 2, h - 2, r * 0.6);
          ctx.clip();
          const x = -w * 0.4 + (w * 1.8) * look.frame / 8;
          const g = ctx.createLinearGradient(x - h, 0, x + h, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(x - h * 0.6, h); ctx.lineTo(x + h * 0.1, 0); ctx.lineTo(x + h * 0.6, 0); ctx.lineTo(x - h * 0.1, h); ctx.fill();
          ctx.restore();
        }
        rr(ctx, h * 0.14, h * 0.14, w - h * 0.28, h - h * 0.28, r * 0.4);
        ctx.strokeStyle = 'rgba(122,76,0,0.55)';
        ctx.lineWidth = Math.max(1, h * 0.05);
        ctx.stroke();
        break;
      }
      case 'tnt': {
        brickBase(ctx, w, h, pal, r);
        ctx.save();
        rr(ctx, 1, 1, w - 2, h - 2, r);
        ctx.clip();
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(0, h * 0.3, w, h * 0.4);
        ctx.fillStyle = '#ffd21f';
        for (const [a, b] of [[0, w * 0.2], [w * 0.8, w]]) {
          ctx.save();
          ctx.beginPath(); ctx.rect(a, 0, b - a, h); ctx.clip();
          for (let x = a - h; x < b; x += h * 0.4) {
            ctx.beginPath(); ctx.moveTo(x, h * 0.7); ctx.lineTo(x + h * 0.2, h * 0.3); ctx.lineTo(x + h * 0.4, h * 0.3); ctx.lineTo(x + h * 0.2, h * 0.7); ctx.fill();
          }
          ctx.restore();
        }
        ctx.restore();
        ctx.fillStyle = '#ffd21f';
        ctx.font = `${Math.round(h * 0.42)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TNT', w / 2, h * 0.53);
        break;
      }
      case 'bonus': {
        brickBase(ctx, w, h, pal, r);
        ctx.font = `${Math.round(h * 0.78)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(1.5, h * 0.12);
        ctx.strokeStyle = '#4c138a';
        ctx.strokeText('?', w / 2, h * 0.56);
        ctx.fillStyle = '#ffe14a';
        ctx.fillText('?', w / 2, h * 0.56);
        for (const [sx, sy] of [[0.2, 0.3], [0.82, 0.65]]) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(w * sx, h * sy, h * 0.06, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'ball': {
        brickBase(ctx, w, h, pal, r);
        const g = ctx.createRadialGradient(w / 2 - h * 0.08, h * 0.42, 0, w / 2, h / 2, h * 0.3);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#9fe6ff');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.24, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(220,235,255,0.75)';
        ctx.lineWidth = Math.max(1, h * 0.07);
        for (const fx of [0.26, 0.4, 0.6, 0.74]) {
          ctx.beginPath(); ctx.moveTo(w * fx, h * 0.14); ctx.lineTo(w * fx, h * 0.86); ctx.stroke();
        }
        break;
      }
      case 'ghost': {
        ctx.globalAlpha = 0.82;
        brickBase(ctx, w, h, pal, r);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(80,50,140,0.75)';
        ctx.beginPath(); ctx.arc(w * 0.42, h * 0.48, h * 0.08, 0, TAU); ctx.arc(w * 0.58, h * 0.48, h * 0.08, 0, TAU); ctx.fill();
        break;
      }
      case 'turret': {
        brickBase(ctx, w, h, pal, r * 0.5);
        ctx.fillStyle = '#16181d';
        rr(ctx, w * 0.36, h * 0.55, w * 0.28, h * 0.45, h * 0.08);
        ctx.fill();
        const g = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, h * 0.26);
        g.addColorStop(0, '#ffd0c0');
        g.addColorStop(0.4, '#ff3a2a');
        g.addColorStop(1, '#5a0a04');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(w / 2, h * 0.48, h * 0.24, 0, TAU); ctx.fill();
        if (dmg > 0) cracks(ctx, w, h, 2, look.seed);
        break;
      }
    }
    return c;
  }

  function glowSprite(color, size) {
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, hexA(color, 1));
    g.addColorStop(0.25, hexA(color, 0.55));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  // ---------------------------------------------------------------- power-up icons
  function powerIcon(ctx, type, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const line = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s))); ctx.stroke(); };
    switch (type) {
      case 'expand': line([[-0.9, 0], [0.9, 0]]); line([[-0.55, -0.35], [-0.9, 0], [-0.55, 0.35]]); line([[0.55, -0.35], [0.9, 0], [0.55, 0.35]]); break;
      case 'shrink': line([[-1, 0], [-0.3, 0]]); line([[1, 0], [0.3, 0]]); line([[-0.6, -0.35], [-0.25, 0], [-0.6, 0.35]]); line([[0.6, -0.35], [0.25, 0], [0.6, 0.35]]); break;
      case 'multi': for (const [x, y] of [[-0.55, 0.25], [0.55, 0.25], [0, -0.35]]) { ctx.beginPath(); ctx.arc(x * s, y * s, s * 0.3, 0, TAU); ctx.fill(); } break;
      case 'slow':
        ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0, TAU); ctx.stroke();
        line([[0, -0.38], [0, 0], [0.3, 0.2]]);
        break;
      case 'fast': line([[-0.75, -0.45], [-0.25, 0], [-0.75, 0.45]]); line([[-0.1, -0.45], [0.4, 0], [-0.1, 0.45]]); line([[0.5, -0.45], [0.95, 0]]); break;
      case 'laser':
        for (const x of [-0.45, 0.45]) { ctx.beginPath(); ctx.moveTo(x * s, s * 0.6); ctx.lineTo(x * s, -s * 0.2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x * s - s * 0.16, -s * 0.2); ctx.lineTo(x * s, -s * 0.65); ctx.lineTo(x * s + s * 0.16, -s * 0.2); ctx.fill(); }
        break;
      case 'magnet':
        ctx.lineWidth = s * 0.3;
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.5, Math.PI, 0, true); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.05); ctx.lineTo(-s * 0.5, -s * 0.55); ctx.moveTo(s * 0.5, -s * 0.05); ctx.lineTo(s * 0.5, -s * 0.55); ctx.stroke();
        break;
      case 'shield': line([[-0.95, 0.45], [0.95, 0.45]]); ctx.beginPath(); ctx.arc(0, s * 0.45, s * 0.6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break;
      case 'fire':
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.85);
        ctx.bezierCurveTo(s * 0.7, -s * 0.2, s * 0.6, s * 0.7, 0, s * 0.7);
        ctx.bezierCurveTo(-s * 0.6, s * 0.7, -s * 0.7, -s * 0.1, -s * 0.15, -s * 0.35);
        ctx.bezierCurveTo(-s * 0.1, -s * 0.05, s * 0.1, -s * 0.35, 0, -s * 0.85);
        ctx.fill();
        break;
      case 'zap':
        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s * 0.9); ctx.lineTo(-s * 0.45, s * 0.1); ctx.lineTo(0, s * 0.1); ctx.lineTo(-s * 0.2, s * 0.9); ctx.lineTo(s * 0.5, -s * 0.15); ctx.lineTo(0.02 * s, -s * 0.15); ctx.closePath();
        ctx.fill();
        break;
      case 'life':
        ctx.beginPath();
        ctx.moveTo(0, s * 0.7);
        ctx.bezierCurveTo(-s * 1.1, -s * 0.05, -s * 0.5, -s * 0.85, 0, -s * 0.3);
        ctx.bezierCurveTo(s * 0.5, -s * 0.85, s * 1.1, -s * 0.05, 0, s * 0.7);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  function capsuleSprite(type, w, h) {
    const c = makeCanvas(w + 4, h + 4);
    const ctx = c.getContext('2d');
    ctx.translate(2, 2);
    const look = POWER_LOOK[type];
    const bad = !Sim.POWERS[type].good;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, look[0]);
    g.addColorStop(1, look[1]);
    rr(ctx, 0, 0, w, h, h / 2);
    ctx.fillStyle = g;
    ctx.fill();
    if (bad) {
      ctx.save();
      rr(ctx, 0, 0, w, h, h / 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,40,40,0.35)';
      for (let x = -h; x < w + h; x += h * 0.7) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h * 0.35, h); ctx.lineTo(x + h * 0.85, 0); ctx.lineTo(x + h * 0.5, 0); ctx.fill(); }
      ctx.restore();
    }
    const gl = ctx.createLinearGradient(0, 0, 0, h * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.7)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    rr(ctx, h * 0.18, h * 0.08, w - h * 0.36, h * 0.38, h * 0.2);
    ctx.fillStyle = gl;
    ctx.fill();
    rr(ctx, 0.5, 0.5, w - 1, h - 1, h / 2);
    ctx.strokeStyle = bad ? '#ff4a4a' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, h * 0.08);
    ctx.stroke();
    powerIcon(ctx, type, w / 2, h / 2, h * 0.36, bad ? '#ff6b6b' : '#ffffff');
    return c;
  }

  // ---------------------------------------------------------------- renderer
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.sprites = new Map();
      this.trails = new WeakMap();
      this.theme = 'neon';
      this.skin = SKINS[0];
      this.W = 1; this.H = 1; this.dpr = 1;
      this.safeTop = 0;
    }

    resize(W, H, dpr, safeTop) {
      this.W = W; this.H = H; this.dpr = dpr; this.safeTop = safeTop || 0;
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
      this.hud = 66 + this.safeTop;
      const s = Math.min((W - 12) / FW, (H - this.hud - 6) / FH);
      this.s = s;
      this.ox = Math.round((W - FW * s) / 2);
      this.oy = Math.round(this.hud + 2);
      this.sprites.clear();
      this.bg = null;
    }

    sx(x) { return this.ox + x * this.s; }
    sy(y) { return this.oy + y * this.s; }
    toWorld(px, py) { return { x: (px - this.ox) / this.s, y: (py - this.oy) / this.s }; }

    setSkin(i) { this.skin = SKINS[i] || SKINS[0]; this.sprites.forEach((v, k) => { if (k.startsWith('glow:')) this.sprites.delete(k); }); }

    sprite(key, make) {
      let c = this.sprites.get(key);
      if (!c) { c = make(); this.sprites.set(key, c); }
      return c;
    }

    brickSprite(b, frame) {
      const w = (BW * this.s - 2) * this.dpr, h = (BH * this.s - 2) * this.dpr;
      const hp = b.kind === 'gold' ? 0 : b.hp;
      const key = `b:${b.kind}:${b.color}:${hp}:${b.maxHp}:${frame == null ? '' : frame}:${b.kind === 'normal' && hp === 1 && b.maxHp > 1 ? b.id % 4 : 0}`;
      return this.sprite(key, () => drawBrick({ kind: b.kind, color: b.color, hp, maxHp: b.maxHp, frame, seed: b.id % 4 }, w, h));
    }

    glow(color) { return this.sprite('glow:' + color, () => glowSprite(color, 64)); }

    capsule(type) {
      return this.sprite('cap:' + type, () => capsuleSprite(type, CAPSULE_W * this.s * this.dpr, CAPSULE_H * this.s * this.dpr));
    }

    // ---------------- background ----------------
    buildBackground(themeKey) {
      const T = THEMES[themeKey];
      const W = this.W, H = this.H, dpr = this.dpr, s = this.s;
      const c = makeCanvas(W * dpr, H * dpr);
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = T.far;
      ctx.fillRect(0, 0, W, H);
      const fx = this.ox, fy = this.oy, fw = FW * s, fh = FH * s;
      const g = ctx.createLinearGradient(0, fy, 0, fy + fh);
      g.addColorStop(0, T.top);
      g.addColorStop(1, T.bot);
      ctx.fillStyle = g;
      ctx.fillRect(fx, fy, fw, fh);
      const R = rnd(7);
      ctx.save();
      ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
      if (themeKey === 'neon') {
        // sun on the horizon and a perspective floor (the moving lines are drawn per frame)
        const hy = fy + fh * 0.62;
        const sun = ctx.createLinearGradient(0, hy - fw * 0.36, 0, hy);
        sun.addColorStop(0, 'rgba(255,214,90,0.55)');
        sun.addColorStop(1, 'rgba(255,63,210,0.35)');
        ctx.fillStyle = sun;
        ctx.beginPath(); ctx.arc(fx + fw / 2, hy, fw * 0.3, Math.PI, 0); ctx.fill();
        ctx.fillStyle = T.top;
        for (let i = 0; i < 6; i++) ctx.fillRect(fx, hy - fw * 0.04 - i * fw * 0.045, fw, 2 + i * 0.6);
        const fl = ctx.createLinearGradient(0, hy, 0, fy + fh);
        fl.addColorStop(0, '#2a0640');
        fl.addColorStop(1, '#13021f');
        ctx.fillStyle = fl;
        ctx.fillRect(fx, hy, fw, fy + fh - hy);
        ctx.strokeStyle = hexA(T.line, 0.35);
        ctx.lineWidth = 1;
        for (let i = -8; i <= 8; i++) {
          ctx.beginPath(); ctx.moveTo(fx + fw / 2 + i * fw * 0.02, hy); ctx.lineTo(fx + fw / 2 + i * fw * 0.16, fy + fh); ctx.stroke();
        }
        for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.5})`; ctx.fillRect(fx + R() * fw, fy + R() * fh * 0.55, 1.2, 1.2); }
      } else if (themeKey === 'caves') {
        for (let i = 0; i < 14; i++) {
          const left = i % 2 === 0, x = left ? fx : fx + fw, y = fy + R() * fh, w = s * (0.6 + R() * 1.4), h = s * (1.5 + R() * 3);
          ctx.fillStyle = hexA(T.line, 0.06 + R() * 0.08);
          ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x + (left ? w : -w), y); ctx.lineTo(x, y + h / 2); ctx.fill();
        }
        for (let i = 0; i < 9; i++) {
          const x = fx + R() * fw, h = s * (0.8 + R() * 2.5), w = s * (0.3 + R() * 0.5);
          ctx.fillStyle = hexA(T.line, 0.05 + R() * 0.06);
          ctx.beginPath(); ctx.moveTo(x - w, fy); ctx.lineTo(x, fy + h); ctx.lineTo(x + w, fy); ctx.fill();
        }
      } else if (themeKey === 'forge') {
        const glow = ctx.createRadialGradient(fx + fw / 2, fy + fh * 1.05, 0, fx + fw / 2, fy + fh * 1.05, fh * 0.6);
        glow.addColorStop(0, 'rgba(255,90,10,0.32)');
        glow.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(fx, fy, fw, fh);
        // cracked volcanic rock with faint lava veins
        for (let i = 0; i < 12; i++) {
          let x = fx + R() * fw, y = fy + R() * fh;
          ctx.strokeStyle = `rgba(255,${80 + Math.floor(R() * 60)},20,${0.06 + R() * 0.08})`;
          ctx.lineWidth = 1 + R() * 2;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += (R() - 0.5) * s * 2.5; y += (R() - 0.3) * s * 1.6; ctx.lineTo(x, y); }
          ctx.stroke();
        }
      } else if (themeKey === 'space') {
        for (let i = 0; i < 3; i++) {
          const x = fx + R() * fw, y = fy + R() * fh, r = fw * (0.3 + R() * 0.4);
          const n = ctx.createRadialGradient(x, y, 0, x, y, r);
          n.addColorStop(0, i % 2 ? 'rgba(216,63,154,0.22)' : 'rgba(90,63,216,0.25)');
          n.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = n;
          ctx.fillRect(fx, fy, fw, fh);
        }
        ctx.fillStyle = 'rgba(180,170,255,0.18)';
        ctx.beginPath(); ctx.arc(fx + fw * 0.82, fy + fh * 0.7, s * 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(fx + fw * 0.82 + s * 0.5, fy + fh * 0.7 - s * 0.3, s * 1.4, 0, TAU); ctx.fill();
      } else if (themeKey === 'cyber') {
        ctx.strokeStyle = hexA(T.line, 0.1);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 26; i++) {
          let x = fx + Math.round(R() * FW) * s, y = fy + R() * fh;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            if (R() < 0.5) x += (R() < 0.5 ? -1 : 1) * s * (1 + Math.floor(R() * 2)); else y += s * (1 + Math.floor(R() * 3));
            ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.fillStyle = hexA(T.line, 0.18);
          ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
      // walls: glowing frame on the left, top and right
      const wall = (alpha, width) => {
        ctx.strokeStyle = hexA(T.wall, alpha);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(fx - 2, fy + fh + 20);
        ctx.lineTo(fx - 2, fy - 2);
        ctx.lineTo(fx + fw + 2, fy - 2);
        ctx.lineTo(fx + fw + 2, fy + fh + 20);
        ctx.stroke();
      };
      wall(0.12, 12); wall(0.25, 6); wall(0.95, 2);
      // the touch area under the field
      if (H - (fy + fh) > 30) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(fx, fy + fh + 4, fw, H - fy - fh - 4);
      }
      this.bg = c;
      this.bgTheme = themeKey;
    }

    drawAmbient(ctx, themeKey, t) {
      const T = THEMES[themeKey];
      const s = this.s, fx = this.ox, fy = this.oy, fw = FW * s, fh = FH * s;
      ctx.save();
      ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
      if (themeKey === 'neon') {
        const hy = fy + fh * 0.62;
        ctx.strokeStyle = hexA(T.line, 0.4);
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const p = ((i + (t * 0.35) % 1) / 8);
          const y = hy + (fy + fh - hy) * p * p;
          ctx.globalAlpha = p;
          ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(fx + fw, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        // drifting motes: embers rise, sparkles and stars drift, data falls
        const n = themeKey === 'space' ? 46 : 26;
        const dir = themeKey === 'forge' ? -1 : themeKey === 'cyber' ? 1 : -0.25;
        const R = rnd(31);
        ctx.fillStyle = T.dust;
        for (let i = 0; i < n; i++) {
          const sp = 0.3 + R() * 0.9, x0 = R(), y0 = R(), ph = R() * TAU;
          let y = (y0 + dir * t * sp * 0.03) % 1;
          if (y < 0) y += 1;
          const x = fx + (x0 + Math.sin(t * 0.5 + ph) * 0.01) * fw;
          const a = themeKey === 'space' ? 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + ph)) : 0.15 + 0.35 * R();
          ctx.globalAlpha = a;
          if (themeKey === 'cyber') ctx.fillRect(x, fy + y * fh, 1.5, s * 0.35);
          else { const r = themeKey === 'space' ? 0.9 + R() : 1 + R() * 1.4; ctx.fillRect(x - r / 2, fy + y * fh - r / 2, r, r); }
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // ---------------- frame ----------------
    draw(st) {
      const ctx = this.ctx, dpr = this.dpr;
      const sim = st.sim, fx = st.fx;
      if (!this.bg || this.bgTheme !== st.theme) this.buildBackground(st.theme);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawAmbient(ctx, st.theme, st.time);
      if (!sim) return;
      const sh = fx ? fx.shakeOffset(this.s) : { x: 0, y: 0 };
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.W, this.oy + FH * this.s);
      ctx.clip();
      ctx.translate(sh.x, sh.y);
      this.drawField(ctx, sim, st);
      if (fx) fx.draw(ctx, this);
      ctx.restore();
      if (fx && fx.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, fx.flash)})`;
        ctx.fillRect(0, 0, this.W, this.H);
      }
      if (!st.demo) this.drawHud(ctx, sim, st);
    }

    drawField(ctx, sim, st) {
      const s = this.s, t = st.time;
      // sinking-wall danger line
      if (sim.level.descend) {
        const near = Math.max(0, Math.min(1, 1 - (DANGER_Y - sim.lowest) / 4));
        ctx.strokeStyle = `rgba(255,60,60,${0.25 + 0.6 * near * (0.6 + 0.4 * Math.sin(t * 8))})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(this.sx(0), this.sy(DANGER_Y)); ctx.lineTo(this.sx(FW), this.sy(DANGER_Y)); ctx.stroke();
        ctx.setLineDash([]);
      }
      this.drawBricks(ctx, sim, st);
      if (sim.boss) this.drawBoss(ctx, sim, st);

      // capsules
      for (const c of sim.capsules) {
        const img = this.capsule(c.type);
        const w = CAPSULE_W * s, h = CAPSULE_H * s;
        const bob = Math.sin(c.t * 6) * 0.04 * s;
        const good = Sim.POWERS[c.type].good;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(c.t * 8);
        const gl = this.glow(good ? POWER_LOOK[c.type][1] : '#ff2a2a');
        ctx.drawImage(gl, this.sx(c.x) - w, this.sy(c.y) - w * 0.7, w * 2, w * 1.4);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        const pad = 2 / this.dpr; // the sprite has a 2-pixel margin
        ctx.drawImage(img, this.sx(c.x) - w / 2 - pad, this.sy(c.y) - h / 2 + bob - pad, w + 2 * pad, h + 2 * pad);
      }

      // lasers
      if (sim.bolts.length) {
        ctx.globalCompositeOperation = 'lighter';
        const gl = this.glow('#ff4a6a');
        for (const z of sim.bolts) {
          const x = this.sx(z.x), y = this.sy(z.y);
          ctx.drawImage(gl, x - s * 0.3, y - s * 0.2, s * 0.6, s * 0.8);
          ctx.fillStyle = '#ffe0e6';
          ctx.fillRect(x - 1.5, y, 3, s * 0.42);
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // enemy shots
      if (sim.shots.length) {
        const gl = this.glow('#ff5a1a');
        for (const z of sim.shots) {
          const x = this.sx(z.x), y = this.sy(z.y), r = z.r * s;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(gl, x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#fff1d6';
          ctx.beginPath(); ctx.arc(x, y, r * (0.75 + 0.15 * Math.sin(t * 20)), 0, TAU); ctx.fill();
        }
      }

      // shield
      if (sim.shield) {
        const y = this.sy(FH - 0.15);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(90,255,220,${0.55 + 0.25 * Math.sin(t * 6)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(this.sx(0), y); ctx.lineTo(this.sx(FW), y); ctx.stroke();
        ctx.strokeStyle = 'rgba(90,255,220,0.18)';
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      this.drawPaddle(ctx, sim, st);
      this.drawBalls(ctx, sim, st);

      // aim guide while serving
      if (sim.state === 'serve' && sim.balls[0] && sim.balls[0].stuck != null && !st.demo) {
        const b = sim.balls[0];
        const a = b.stuck * Sim.MAX_BOUNCE;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 1; i <= 6; i++) {
          const d = i * 0.55 + ((t * 1.4) % 1) * 0.55;
          ctx.globalAlpha = 1 - i / 7;
          ctx.beginPath(); ctx.arc(this.sx(b.x + Math.sin(a) * d), this.sy(b.y - Math.cos(a) * d), 0.07 * s, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    drawBricks(ctx, sim, st) {
      const s = this.s, t = st.time;
      const w = BW * s - 2, h = BH * s - 2;
      const intro = st.intro != null ? st.intro : 1;
      for (const b of sim.bricks) {
        if (!b.alive) continue;
        let x = this.sx(b.x) + 1, y = this.sy(b.y) + 1;
        let alpha = 1, scale = 1;
        if (intro < 1) {
          const d = Math.max(0, Math.min(1, (intro - (b.row * 0.035 + (b.col % 2) * 0.02)) / 0.45));
          const e = 1 - Math.pow(1 - d, 3);
          y -= (1 - e) * s * 3;
          alpha = d;
        }
        if (b.summoned && b.born != null) {
          const d = Math.min(1, (sim.time - b.born) / 0.35);
          scale = 0.3 + 0.7 * d;
          alpha *= d;
        }
        if (b.hidden) {
          // a faint shimmer every few seconds gives the hidden ones away, just barely
          const p = (t * 0.5 + b.id * 0.37) % 3;
          if (p < 0.6) {
            ctx.globalAlpha = 0.22 * Math.sin(p / 0.6 * Math.PI) * alpha;
            ctx.strokeStyle = '#e8dcff';
            ctx.lineWidth = 1.5;
            rr(ctx, x + 2, y + 2, w - 4, h - 4, h * 0.2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          continue;
        }
        const frame = b.kind === 'gold' ? Math.floor(((t * 0.6 + b.col * 0.09 + b.row * 0.05) % 2.2) * 8 / 1.2) : null;
        const img = this.brickSprite(b, frame != null && frame < 8 ? frame : null);
        if (b.flash > 0) scale *= 1 + b.flash * 0.08;
        ctx.globalAlpha = alpha;
        if (scale !== 1) ctx.drawImage(img, x + w / 2 - w * scale / 2, y + h / 2 - h * scale / 2, w * scale, h * scale);
        else ctx.drawImage(img, x, y, w, h);
        if (b.flash > 0) {
          ctx.globalAlpha = b.flash * 0.85 * alpha;
          ctx.fillStyle = '#ffffff';
          rr(ctx, x, y, w, h, h * 0.22);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (b.kind === 'turret' && sim.state === 'play' && b.fireT < 0.7) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1 - b.fireT / 0.7;
          const gl = this.glow('#ff3a2a');
          ctx.drawImage(gl, x + w / 2 - h, y + h * 0.5 - h, h * 2, h * 2);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
        if (b.kind === 'tnt') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.12 + 0.1 * Math.sin(t * 5 + b.id);
          ctx.drawImage(this.glow('#ff5a1a'), x - w * 0.2, y - h * 0.6, w * 1.4, h * 2.2);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    drawPaddle(ctx, sim, st) {
      const p = sim.paddle, s = this.s, sk = this.skin, t = st.time;
      const squash = st.paddleSquash || 0;
      const w = p.w * s * (1 + squash * 0.06), h = PADDLE_H * s * (1 - squash * 0.25);
      const x = this.sx(p.x) - w / 2 + (p.stun > 0 ? Math.sin(t * 70) * 2 : 0);
      const y = this.sy(PADDLE_Y) + squash * PADDLE_H * s * 0.25;
      const stun = p.stun > 0;
      const glowCol = stun ? '#9aa4b0' : sim.fx.magnet > 0 ? '#c86bff' : sim.fx.laser > 0 ? '#ff4a6a' : sk.glow;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.glow(glowCol), x - h * 1.5, y - h * 1.6, w + h * 3, h * 4.2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (sim.fx.laser > 0) {
        ctx.fillStyle = '#ccd3de';
        for (const cx of [x + h * 0.55, x + w - h * 0.55]) {
          rr(ctx, cx - h * 0.2, y - h * 0.55, h * 0.4, h * 0.9, h * 0.12);
          ctx.fill();
          ctx.fillStyle = '#ff4a6a';
          ctx.fillRect(cx - h * 0.1, y - h * 0.6, h * 0.2, h * 0.25);
          ctx.fillStyle = '#ccd3de';
        }
      }
      const pal = stun ? ['#d7dbe0', '#8a929c', '#3a4048'] : sk.pad;
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, pal[0]);
      g.addColorStop(0.5, pal[1]);
      g.addColorStop(1, pal[2]);
      rr(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = g;
      ctx.fill();
      rr(ctx, x + h * 0.4, y + h * 0.12, w - h * 0.8, h * 0.3, h * 0.15);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
      // end caps
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(x + h * 0.5, y + h * 0.5, h * 0.18, 0, TAU); ctx.arc(x + w - h * 0.5, y + h * 0.5, h * 0.18, 0, TAU); ctx.fill();
      if (sim.fx.magnet > 0) {
        ctx.strokeStyle = `rgba(200,107,255,${0.4 + 0.3 * Math.sin(t * 10)})`;
        ctx.lineWidth = 2;
        rr(ctx, x - 3, y - 3, w + 6, h + 6, h / 2 + 3);
        ctx.stroke();
      }
      if (stun) {
        ctx.strokeStyle = '#bfe8ff';
        ctx.lineWidth = 1.5;
        const R = rnd(Math.floor(t * 20));
        for (let i = 0; i < 3; i++) {
          let px = x + R() * w, py = y + R() * h;
          ctx.beginPath(); ctx.moveTo(px, py);
          for (let k = 0; k < 3; k++) { px += (R() - 0.5) * h * 2; py += (R() - 0.5) * h * 1.5; ctx.lineTo(px, py); }
          ctx.stroke();
        }
      }
    }

    drawBalls(ctx, sim, st) {
      const s = this.s, sk = this.skin, t = st.time;
      const fire = sim.fx.fire > 0;
      const r = BALL_R * s;
      for (const b of sim.balls) {
        const x = this.sx(b.x), y = this.sy(b.y);
        let tr = this.trails.get(b);
        if (!tr) { tr = []; this.trails.set(b, tr); }
        if (b.stuck == null) { tr.push(x, y); if (tr.length > 24) tr.splice(0, 2); } else tr.length = 0;
        // trail
        ctx.globalCompositeOperation = 'lighter';
        const n = tr.length / 2;
        for (let i = 0; i < n - 1; i++) {
          const k = (i + 1) / n;
          let col;
          if (fire || sk.trail === 'fire') col = i % 2 ? '#ff7a1a' : '#ffd23a';
          else if (sk.trail === 'rainbow') col = `hsl(${(t * 240 + i * 25) % 360},100%,65%)`;
          else col = sk.trail;
          ctx.globalAlpha = k * 0.5;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(tr[i * 2], tr[i * 2 + 1], r * (0.35 + 0.6 * k), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = fire ? 0.9 : 0.6;
        const gl = this.glow(fire ? '#ff7a1a' : (sk.trail.startsWith('#') ? sk.trail : sk.glow));
        ctx.drawImage(gl, x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, fire ? '#ffb02e' : sk.ball);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }

    // ---------------- bosses ----------------
    drawBoss(ctx, sim, st) {
      const b = sim.boss, s = this.s, t = st.time;
      const p = sim.paddle;
      // shards
      for (const sh of b.shards) {
        if (b.dead) break;
        const x = this.sx(sh.x), y = this.sy(sh.y), r = sh.s * s * 0.62;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(this.glow(b.kind === 'overlord' ? '#ff3a5a' : '#5ef0ff'), x - r * 2, y - r * 2, r * 4, r * 4);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, b.kind === 'overlord' ? '#ffb0c0' : '#e0fdff');
        g.addColorStop(1, b.kind === 'overlord' ? '#a0102a' : '#1690c0');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.8, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.8, y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (b.dead && b.deathT > 0.9) return;
      const cx = this.sx(b.x), cy = this.sy(b.y);
      const w = b.w * s, h = b.h * s;
      const hurt = b.flash;
      const shakeX = b.dead ? (Math.random() - 0.5) * 8 : hurt * Math.sin(t * 90) * 3;
      ctx.save();
      ctx.translate(cx + shakeX, cy);
      if (b.dead) ctx.globalAlpha = Math.max(0, 1 - b.deathT / 0.9);
      const angry = b.phase > 0;
      const eyeCol = angry ? '#ff3a2a' : '#ffd23a';
      const look = Math.max(-1, Math.min(1, (p.x - b.x) / 4));
      const eye = (ex, ey, er) => {
        ctx.fillStyle = '#fff6e0';
        ctx.beginPath(); ctx.ellipse(ex, ey, er, er * 0.85, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(ex + look * er * 0.35, ey + er * 0.15, er * 0.55, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a0a05';
        ctx.beginPath(); ctx.arc(ex + look * er * 0.4, ey + er * 0.18, er * 0.28, 0, TAU); ctx.fill();
      };
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.35 + 0.15 * Math.sin(t * 3);
      ctx.drawImage(this.glow(angry ? '#ff3a2a' : THEMES[st.theme].accent), -w, -h * 1.1, w * 2, h * 2.2);
      ctx.globalAlpha = b.dead ? Math.max(0, 1 - b.deathT / 0.9) : 1;
      ctx.globalCompositeOperation = 'source-over';
      switch (b.kind) {
        case 'golem': {
          const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
          g.addColorStop(0, '#b9a990'); g.addColorStop(0.5, '#7d6c55'); g.addColorStop(1, '#3a3024');
          rr(ctx, -w / 2, -h / 2, w, h, h * 0.18); ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-w * 0.3, -h / 2); ctx.lineTo(-w * 0.22, -h * 0.1); ctx.lineTo(-w * 0.35, h * 0.2); ctx.moveTo(w * 0.32, h / 2); ctx.lineTo(w * 0.2, h * 0.15); ctx.stroke();
          eye(-w * 0.2, -h * 0.08, h * 0.17); eye(w * 0.2, -h * 0.08, h * 0.17);
          ctx.fillStyle = '#2a2018';
          ctx.beginPath(); ctx.moveTo(-w * 0.34, -h * 0.32); ctx.lineTo(-w * 0.06, -h * (angry ? 0.16 : 0.24)); ctx.lineTo(-w * 0.06, -h * 0.32); ctx.fill();
          ctx.beginPath(); ctx.moveTo(w * 0.34, -h * 0.32); ctx.lineTo(w * 0.06, -h * (angry ? 0.16 : 0.24)); ctx.lineTo(w * 0.06, -h * 0.32); ctx.fill();
          rr(ctx, -w * 0.22, h * 0.18, w * 0.44, h * 0.16, h * 0.05); ctx.fillStyle = '#1a120c'; ctx.fill();
          ctx.fillStyle = '#e8dcc0';
          for (let i = 0; i < 4; i++) ctx.fillRect(-w * 0.2 + i * w * 0.11, h * 0.18, w * 0.06, h * 0.07);
          break;
        }
        case 'eye': {
          const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
          g.addColorStop(0, '#e0fdff'); g.addColorStop(0.5, '#38c6e8'); g.addColorStop(1, '#0a3a6a');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, 0); ctx.lineTo(0, h / 2); ctx.lineTo(-w / 2, 0); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2); ctx.stroke();
          eye(0, 0, h * 0.26);
          break;
        }
        case 'magma': {
          const pulse = 1 + 0.04 * Math.sin(t * 6);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.55 * pulse);
          g.addColorStop(0, '#fff2a0'); g.addColorStop(0.35, '#ff8a1a'); g.addColorStop(0.75, '#b8200a'); g.addColorStop(1, '#3a0802');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5 * pulse, h * 0.5 * pulse, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(40,6,0,0.75)'; ctx.lineWidth = 3;
          const R = rnd(5);
          for (let i = 0; i < 6; i++) {
            const a = R() * TAU;
            ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.2, Math.sin(a) * h * 0.2); ctx.lineTo(Math.cos(a + 0.3) * w * 0.45, Math.sin(a + 0.3) * h * 0.45); ctx.stroke();
          }
          eye(-w * 0.16, -h * 0.06, h * 0.13); eye(w * 0.16, -h * 0.06, h * 0.13);
          ctx.strokeStyle = '#3a0802'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, h * 0.18, w * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
          break;
        }
        case 'ship': {
          const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
          g.addColorStop(0, '#d0c2ff'); g.addColorStop(0.5, '#6a4ad8'); g.addColorStop(1, '#1e0f5a');
          ctx.fillStyle = 'rgba(160,240,255,0.55)';
          ctx.beginPath(); ctx.ellipse(0, -h * 0.15, w * 0.2, h * 0.5, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.ellipse(0, h * 0.05, w / 2, h * 0.36, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
          for (let i = 0; i < 7; i++) {
            const lx = -w * 0.38 + i * w * 0.127;
            ctx.fillStyle = (Math.floor(t * 6) + i) % 3 === 0 ? '#ffe14a' : '#ff5ad1';
            ctx.beginPath(); ctx.arc(lx, h * 0.12, h * 0.07, 0, TAU); ctx.fill();
          }
          eye(0, -h * 0.28, h * 0.16);
          break;
        }
        case 'overlord': {
          const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
          g.addColorStop(0, '#5a6274'); g.addColorStop(0.5, '#262b36'); g.addColorStop(1, '#0c0e12');
          ctx.fillStyle = '#1a1d24';
          ctx.beginPath(); ctx.moveTo(-w * 0.42, -h * 0.3); ctx.lineTo(-w * 0.55, -h * 0.75); ctx.lineTo(-w * 0.25, -h * 0.42); ctx.fill();
          ctx.beginPath(); ctx.moveTo(w * 0.42, -h * 0.3); ctx.lineTo(w * 0.55, -h * 0.75); ctx.lineTo(w * 0.25, -h * 0.42); ctx.fill();
          rr(ctx, -w / 2, -h / 2, w, h, h * 0.3); ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = '#00ffb0'; ctx.lineWidth = 1.5; ctx.stroke();
          const vis = ctx.createLinearGradient(-w * 0.4, 0, w * 0.4, 0);
          const vc = b.phase === 2 ? '#ff1a3a' : b.phase === 1 ? '#ff7a1a' : '#00ffb0';
          vis.addColorStop(0, 'rgba(0,0,0,0)'); vis.addColorStop(0.5, vc); vis.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = vis;
          rr(ctx, -w * 0.4, -h * 0.18, w * 0.8, h * 0.2, h * 0.08); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(look * w * 0.25, -h * 0.08, h * 0.06, 0, TAU); ctx.fill();
          ctx.fillStyle = '#0c0e12';
          for (let i = 0; i < 5; i++) ctx.fillRect(-w * 0.22 + i * w * 0.1, h * 0.18, w * 0.05, h * 0.18);
          break;
        }
      }
      if (hurt > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = hurt * 0.6;
        ctx.drawImage(this.glow('#ffffff'), -w * 0.6, -h * 0.6, w * 1.2, h * 1.2);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // ---------------- HUD ----------------
    drawHud(ctx, sim, st) {
      const W = this.W, top = this.safeTop;
      const fx = this.ox, fw = FW * this.s;
      ctx.textBaseline = 'middle';
      // score
      ctx.font = `26px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      const score = Math.round(st.shownScore).toLocaleString();
      const sxr = Math.min(W - 12, fx + fw);
      ctx.strokeText(score, sxr, top + 20);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(score, sxr, top + 20);
      // level label (left, after the pause button)
      const lx = Math.max(62, fx + 54);
      ctx.textAlign = 'left';
      ctx.font = `17px ${FONT}`;
      ctx.fillStyle = THEMES[st.theme].wall;
      ctx.fillText('LEVEL ' + sim.level.n, lx, top + 14);
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(sim.level.name, lx, top + 31);
      // lives
      const y2 = top + 52;
      const rl = 5.5;
      const nl = Math.max(0, sim.lives - (sim.state === 'play' || sim.state === 'serve' ? 1 : 0));
      for (let i = 0; i < Math.min(nl, 7); i++) {
        const x = lx + 6 + i * 15;
        const g = ctx.createRadialGradient(x - 1.5, y2 - 1.5, 0, x, y2, rl);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, this.skin.ball === '#ffffff' ? '#9fe6ff' : this.skin.ball);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y2, rl, 0, TAU); ctx.fill();
      }
      let x = lx + 10 + Math.min(nl, 7) * 15;
      // combo multiplier
      const mult = sim.multiplier();
      if (sim.combo >= 5 && sim.state === 'play') {
        const txt = 'x' + mult;
        ctx.font = `15px ${FONT}`;
        const tw = ctx.measureText(txt).width + 14;
        const pulse = 1 + Math.max(0, st.comboPulse || 0) * 0.25;
        ctx.save();
        ctx.translate(x + tw / 2, y2);
        ctx.scale(pulse, pulse);
        rr(ctx, -tw / 2, -10, tw, 20, 10);
        ctx.fillStyle = ['#ffd23a', '#ffd23a', '#ff9a2a', '#ff6a3a', '#ff4a8a', '#c86bff', '#5ad1ff', '#5affb0', '#ffffff'][mult] || '#ffffff';
        ctx.fill();
        ctx.fillStyle = '#2b1a0e';
        ctx.textAlign = 'center';
        ctx.fillText(txt, 0, 1);
        ctx.restore();
        x += tw + 8;
      }
      // boss health
      if (sim.boss) {
        const b = sim.boss;
        const bw = Math.min(150, fw * 0.36), bx = fx + fw / 2 - bw / 2, by = top + 47;
        rr(ctx, bx, by, bw, 10, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();
        const f = b.hp / b.maxHp;
        if (f > 0) {
          rr(ctx, bx + 1, by + 1, (bw - 2) * f, 8, 4);
          ctx.fillStyle = f > 0.5 ? '#ffd23a' : f > 0.25 ? '#ff8a1f' : '#ff3a3a';
          ctx.fill();
        }
        ctx.font = `10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('BOSS', bx + bw / 2, by - 6);
      } else if (sim.total) {
        // progress through the level
        const bw = Math.min(120, fw * 0.28), bx = fx + fw / 2 - bw / 2, by = top + 50;
        rr(ctx, bx, by, bw, 5, 2.5);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
        const f = 1 - sim.remaining / sim.total;
        if (f > 0) {
          rr(ctx, bx, by, bw * f, 5, 2.5);
          ctx.fillStyle = THEMES[st.theme].wall;
          ctx.fill();
        }
      }
      // active power-ups with their time left
      let px = Math.min(W - 12, fx + fw) - 12;
      const f = sim.fx;
      const icons = [];
      for (const k of ['expand', 'shrink', 'slow', 'fast', 'laser', 'magnet', 'fire']) if (f[k] > 0) icons.push([k, f[k] / Sim.POWERS[k].dur]);
      if (sim.shield) icons.push(['shield', 1]);
      for (const [k, frac] of icons) {
        const good = Sim.POWERS[k].good;
        const col = good ? POWER_LOOK[k][1] : '#a01818';
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(px, y2 - 2, 12, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, y2 - 2, 12, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(px, y2 - 2, 12, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
        powerIcon(ctx, k, px, y2 - 2, 6.5, '#ffffff');
        px -= 30;
      }
      // descending wall countdown
      if (sim.level.descend && sim.state === 'play') {
        const left = Math.ceil(sim.descendT);
        if (left <= 3) {
          ctx.font = `13px ${FONT}`;
          ctx.textAlign = 'right';
          ctx.fillStyle = '#ff6a6a';
          ctx.fillText('WALL DROPS ' + left, px + 10, y2);
        }
      }
    }
  }

  // ---------------------------------------------------------------- effects
  class FX {
    constructor() { this.parts = []; this.texts = []; this.bolts = []; this.trauma = 0; this.flash = 0; this.time = 0; }

    clear() { this.parts.length = 0; this.texts.length = 0; this.bolts.length = 0; this.trauma = 0; this.flash = 0; }

    add(p) { if (this.parts.length < 700) this.parts.push(p); }

    shake(a) { this.trauma = Math.min(1, this.trauma + a); }

    shakeOffset(s) {
      const k = this.trauma * this.trauma * s * 0.35;
      return { x: (Math.random() - 0.5) * 2 * k, y: (Math.random() - 0.5) * 2 * k };
    }

    update(dt) {
      this.time += dt;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      this.flash = Math.max(0, this.flash - dt * 3);
      const ps = this.parts;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
        p.vx *= p.drag || 1;
        p.vy = p.vy * (p.drag || 1) + (p.g || 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        t.y -= dt * 1.1;
        if (t.life <= 0) this.texts.splice(i, 1);
      }
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        this.bolts[i].life -= dt;
        if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
      }
    }

    // Brick shatters into shards of its colour.
    shatter(b, x, y, vx, vy, big) {
      const pal = BRICK[b.color] || BRICK.white;
      const n = big ? 14 : 9;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 2 + Math.random() * 5;
        this.add({
          kind: 'shard', x: x + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.3,
          vx: Math.cos(a) * sp + (vx || 0) * 0.15, vy: Math.sin(a) * sp - 2 + (vy || 0) * 0.15, g: 22,
          size: 0.1 + Math.random() * 0.16, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 20,
          color: pal[Math.floor(Math.random() * 2)], life: 0.5 + Math.random() * 0.5, max: 1,
        });
      }
      this.add({ kind: 'glow', x, y, size: 1.6, color: pal[1], life: 0.25, max: 0.25 });
    }

    sparks(x, y, color, n, speed, up) {
      for (let i = 0; i < n; i++) {
        const a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : Math.random() * TAU;
        const sp = (speed || 6) * (0.4 + Math.random() * 0.8);
        this.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 8, drag: 0.97, color, life: 0.25 + Math.random() * 0.3, max: 0.5 });
      }
    }

    ring(x, y, color, size, life) { this.add({ kind: 'ring', x, y, size: size || 1.5, color, life: life || 0.35, max: life || 0.35 }); }

    explosion(x, y, scale) {
      scale = scale || 1;
      this.add({ kind: 'glow', x, y, size: 4.5 * scale, color: '#ffb02e', life: 0.4, max: 0.4 });
      this.add({ kind: 'glow', x, y, size: 2.5 * scale, color: '#ffffff', life: 0.18, max: 0.18 });
      this.ring(x, y, '#ffd23a', 2.4 * scale, 0.4);
      this.sparks(x, y, '#ffd23a', 16, 11 * scale);
      this.sparks(x, y, '#ff5a1a', 12, 7 * scale);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * TAU;
        this.add({ kind: 'smoke', x, y, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5 - 0.8, drag: 0.96, size: 0.6 + Math.random() * 0.6, life: 0.7 + Math.random() * 0.4, max: 1.1 });
      }
      this.shake(0.45 * scale);
    }

    text(x, y, str, color, size) {
      if (this.texts.length > 30) this.texts.shift();
      this.texts.push({ x, y, str, color: color || '#fff', size: size || 14, life: 0.9, max: 0.9 });
    }

    lightning(x0, y0, targets) {
      for (const t of targets) {
        const pts = [[x0, y0]];
        const n = 7;
        for (let i = 1; i < n; i++) {
          const k = i / n;
          pts.push([x0 + (t.x - x0) * k + (Math.random() - 0.5) * 0.7, y0 + (t.y - y0) * k + (Math.random() - 0.5) * 0.4]);
        }
        pts.push([t.x, t.y]);
        this.bolts.push({ pts, life: 0.35, max: 0.35 });
        this.add({ kind: 'glow', x: t.x, y: t.y, size: 1.8, color: '#fff58a', life: 0.3, max: 0.3 });
      }
      this.flash = Math.max(this.flash, 0.25);
    }

    draw(ctx, R) {
      const s = R.s;
      for (const p of this.parts) {
        const k = p.life / p.max;
        const x = R.sx(p.x), y = R.sy(p.y);
        switch (p.kind) {
          case 'shard': {
            const sz = p.size * s;
            ctx.globalAlpha = Math.min(1, k * 2);
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(p.rot);
            ctx.fillRect(-sz / 2, -sz * 0.3, sz, sz * 0.6);
            ctx.restore();
            break;
          }
          case 'spark':
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = k;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * s * 0.025, y - p.vy * s * 0.025); ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            break;
          case 'glow': {
            const sz = p.size * s * (1.2 - k * 0.2);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = k;
            ctx.drawImage(R.glow(p.color), x - sz / 2, y - sz / 2, sz, sz);
            ctx.globalCompositeOperation = 'source-over';
            break;
          }
          case 'ring':
            ctx.globalAlpha = k;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3 * k + 1;
            ctx.beginPath(); ctx.arc(x, y, p.size * s * (1 - k * 0.8), 0, TAU); ctx.stroke();
            break;
          case 'smoke':
            ctx.globalAlpha = k * 0.35;
            ctx.fillStyle = '#3a2a2a';
            ctx.beginPath(); ctx.arc(x, y, p.size * s * (1.5 - k * 0.5), 0, TAU); ctx.fill();
            break;
        }
      }
      ctx.globalAlpha = 1;
      if (this.bolts.length) {
        ctx.globalCompositeOperation = 'lighter';
        for (const b of this.bolts) {
          const k = b.life / b.max;
          for (const [wdt, col] of [[7, `rgba(255,240,120,${0.25 * k})`], [2.5, `rgba(255,255,230,${k})`]]) {
            ctx.strokeStyle = col;
            ctx.lineWidth = wdt;
            ctx.beginPath();
            b.pts.forEach(([px, py], i) => (i ? ctx.lineTo(R.sx(px), R.sy(py)) : ctx.moveTo(R.sx(px), R.sy(py))));
            ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        const k = t.life / t.max;
        ctx.globalAlpha = Math.min(1, k * 2.5);
        ctx.font = `${Math.round(t.size * (1 + (1 - k) * 0.15))}px ${FONT}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.strokeText(t.str, R.sx(t.x), R.sy(t.y));
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, R.sx(t.x), R.sy(t.y));
      }
      ctx.globalAlpha = 1;
    }
  }

  // Small canvases for the menus.
  function capsuleIcon(type, h) {
    const c = makeCanvas(h * 2.2 * 2, h * 2);
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    const img = capsuleSprite(type, h * 2.1, h * 0.95);
    ctx.drawImage(img, 0, 0, h * 2.2, h);
    c.style.width = h * 2.2 + 'px';
    c.style.height = h + 'px';
    return c;
  }

  function brickIcon(kind, color, hp, w) {
    const h = w / 2;
    const c = drawBrick({ kind, color, hp: hp || 1, maxHp: hp || 1, frame: kind === 'gold' ? 3 : null, seed: 1 }, w * 2, h * 2);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    return c;
  }

  // Paddle + ball preview for the style picker.
  function skinPreview(i, w) {
    const sk = SKINS[i], h = w * 0.55;
    const c = makeCanvas(w * 2, h * 2);
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    const pw = w * 0.7, ph = w * 0.1, px = (w - pw) / 2, py = h * 0.7;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(glowSprite(sk.glow, 64), px - ph * 1.5, py - ph * 1.6, pw + ph * 3, ph * 4.2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, sk.pad[0]); g.addColorStop(0.5, sk.pad[1]); g.addColorStop(1, sk.pad[2]);
    rr(ctx, px, py, pw, ph, ph / 2); ctx.fillStyle = g; ctx.fill();
    const br = w * 0.055, bx = w * 0.62, by = h * 0.35;
    for (let i = 0; i < 6; i++) {
      const k = (i + 1) / 7;
      ctx.globalAlpha = k * 0.5;
      ctx.fillStyle = sk.trail === 'rainbow' ? `hsl(${i * 50},100%,65%)` : sk.trail === 'fire' ? (i % 2 ? '#ff7a1a' : '#ffd23a') : sk.trail;
      ctx.beginPath(); ctx.arc(bx - (6 - i) * br * 1.1, by + (6 - i) * br * 0.9, br * (0.4 + 0.6 * k), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const bg = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.35, 0, bx, by, br);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, sk.ball);
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    return c;
  }

  root.Render = { Renderer, FX, THEMES, SKINS, BRICK, capsuleIcon, brickIcon, skinPreview };
})(typeof self !== 'undefined' ? self : this);
