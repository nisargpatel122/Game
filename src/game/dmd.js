/*
 * Dot-matrix display. Renders scenes into a 128 x 32 buffer of intensities
 * (0..15). Pure code, no canvas: the browser paints the dots, tests can read
 * the buffer. Hand-made bitmap fonts; the big score font is the 5x7 font
 * doubled with Scale2x so diagonals stay smooth.
 */
(function (NN) {
  'use strict';

  const W = 128, H = 32;

  // ------------------------------------------------------------- fonts ---
  const F5 = {
    A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.',
    C: '.###.#...##....#....#....#...#.###.', D: '####.#...##...##...##...##...#####.',
    E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
    G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#',
    I: '.###...#....#....#....#....#...###.', J: '..###...#....#....#....##..#..##...',
    K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
    M: '#...###.###.#.##.#.##...##...##...#', N: '#...##...###..##.#.##..###...##...#',
    O: '.###.#...##...##...##...##...#.###.', P: '####.#...##...#####.#....#....#....',
    Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
    S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..',
    U: '#...##...##...##...##...##...#.###.', V: '#...##...##...##...##...#.#.#...#..',
    W: '#...##...##...##.#.##.#.##.#.#.#.#.', X: '#...##...#.#.#...#...#.#.#...##...#',
    Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
    0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#...###.',
    2: '.###.#...#....#...#...#...#...#####', 3: '#####...#...#.....#.....##...#.###.',
    4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.',
    6: '..##..#...#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...',
    8: '.###.#...##...#.###.#...##...#.###.', 9: '.###.#...##...#.####....#...#..##..',
    ' ': '...................................', '.': '..........................##...##..',
    ',': '....................##....#...#....', '!': '..#....#....#....#....#.........#..',
    '?': '.###.#...#....#...#...#.........#..', ':': '......##...##.........##...##......',
    '-': '...............#####...............', '+': '.......#....#..#####..#....#.......',
    '/': '....#...#....#...#...#....#...#....', "'": '..#....#...#.......................',
    '%': '##..###.#...#...#...#.##.#..##.....', '*': '.....#.#.#.###.#####.###.#.#.#.....',
    '(': '...#...#...#....#....#.....#.....#.', ')': '.#.....#.....#....#....#...#...#...',
    '<': '...#...#...#...#.....#.....#.....#.', '>': '.#.....#.....#.....#...#...#...#...',
    '#': '.#.#..#.#.#####.#.#.#####.#.#..#.#.', '&': '.##..#..#.#.#...#...#.#.##..#..##.#',
    '=': '..........#####.....#####..........', '_': '..............................#####',
  };
  const F3 = {
    A: '.#.#.#####.##.#', B: '##.#.###.#.###.', C: '.###..#..#...##', D: '##.#.##.##.###.',
    E: '####..##.#..###', F: '####..##.#..#..', G: '.###..#.##.#.##', H: '#.##.#####.##.#',
    I: '###.#..#..#.###', J: '..#..#..##.#.#.', K: '#.##.###.#.##.#', L: '#..#..#..#..###',
    M: '#.########.##.#', N: '##.#.##.##.##.#', O: '.#.#.##.##.#.#.', P: '##.#.###.#..#..',
    Q: '.#.#.##.###..##', R: '##.#.###.#.##.#', S: '.###...#...###.', T: '###.#..#..#..#.',
    U: '#.##.##.##.####', V: '#.##.##.##.#.#.', W: '#.##.########.#', X: '#.##.#.#.#.##.#',
    Y: '#.##.#.#..#..#.', Z: '###..#.#.#..###', 0: '####.##.##.####', 1: '.#.##..#..#.###',
    2: '##...#.#.#..###', 3: '##...#.#...###.', 4: '#.##.####..#..#', 5: '####..##...###.',
    6: '.###..####.####', 7: '###..#.#..#..#.', 8: '####.#####.####', 9: '####.####..###.',
    ' ': '...............', '.': '.............#.', ',': '..........#.#..', ':': '....#.....#....',
    '-': '......###......', '/': '..#..#.#.#..#..', '!': '.#..#..#.....#.', '+': '....#.###.#....',
    "'": '.#..#..........', '<': '..#.#.#...#...#', '>': '#...#...#.#.#..', '?': '##...#.#.....#.',
    '%': '#.#..#.#.#..#.#', '*': '...#.#.#.#.#...', '#': '#.#####.#####.#', '&': '.#.#.#.#.#.#.##',
    '(': '.#.#..#..#...#.', ')': '.#...#..#..#.#.', '=': '...###...###...', '_': '............###',
  };

  function makeFont(src, w, h) {
    const glyphs = {};
    for (const ch in src) {
      const s = src[ch];
      const px = new Uint8Array(w * h);
      let maxc = -1, minc = w;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (s[y * w + x] === '#') { px[y * w + x] = 1; if (x > maxc) maxc = x; if (x < minc) minc = x; }
      }
      if (maxc < 0) { minc = 0; maxc = Math.floor(w / 2) - 1; }
      glyphs[ch] = { px: px, w: w, h: h, x0: minc, x1: maxc };
    }
    return { glyphs: glyphs, w: w, h: h };
  }

  // Scale2x (EPX) doubling: smooth diagonals for the big font
  function scale2x(g) {
    const w = g.w, h = g.h, W2 = w * 2, out = new Uint8Array(W2 * h * 2);
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : g.px[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), Dd = at(x, y + 1);
      let p1 = P, p2 = P, p3 = P, p4 = P;
      if (C === A && C !== Dd && A !== B) p1 = A;
      if (A === B && A !== C && B !== Dd) p2 = B;
      if (Dd === C && Dd !== B && C !== A) p3 = C;
      if (B === Dd && B !== A && Dd !== C) p4 = Dd;
      out[(y * 2) * W2 + x * 2] = p1; out[(y * 2) * W2 + x * 2 + 1] = p2;
      out[(y * 2 + 1) * W2 + x * 2] = p3; out[(y * 2 + 1) * W2 + x * 2 + 1] = p4;
    }
    return { px: out, w: W2, h: h * 2, x0: g.x0 * 2, x1: g.x1 * 2 + 1 };
  }

  const FONT_M = makeFont(F5, 5, 7);
  const FONT_S = makeFont(F3, 3, 5);
  const FONT_L = { glyphs: {}, w: 10, h: 14 };
  for (const ch in FONT_M.glyphs) FONT_L.glyphs[ch] = scale2x(FONT_M.glyphs[ch]);

  // ---------------------------------------------------------- the DMD ---
  function DMD() {
    this.buf = new Uint8Array(W * H);
    this.W = W; this.H = H;
    this.t = 0;
    this.stars = [];
    for (let i = 0; i < 40; i++) this.stars.push([Math.random() * W, Math.random() * H, 0.3 + Math.random()]);
    this.shownScore = 0;
    this.sceneT = 0;
    this.lastScene = null;
    this.attractPage = 0;
  }

  DMD.prototype.clear = function () { this.buf.fill(0); };

  DMD.prototype.px = function (x, y, v) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (v > this.buf[i]) this.buf[i] = v;
  };

  DMD.prototype.rect = function (x, y, w, h, v) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, v);
  };

  DMD.prototype.font = function (name) { return name === 'L' ? FONT_L : name === 'S' ? FONT_S : FONT_M; };

  // width of a string; mono = fixed-width digits
  DMD.prototype.measure = function (str, fname, mono) {
    const f = this.font(fname);
    let w = 0;
    for (const ch of str) {
      const g = f.glyphs[ch] || f.glyphs[' '];
      w += (mono && /[0-9]/.test(ch) ? g.w : g.x1 - g.x0 + 1) + (fname === 'L' ? 2 : 1);
    }
    return Math.max(0, w - (fname === 'L' ? 2 : 1));
  };

  DMD.prototype.text = function (str, x, y, fname, v, opts) {
    const f = this.font(fname);
    opts = opts || {};
    const mono = opts.mono;
    v = v == null ? 15 : v;
    if (opts.align === 'center') x = Math.round(x - this.measure(str, fname, mono) / 2);
    else if (opts.align === 'right') x = Math.round(x - this.measure(str, fname, mono));
    const gap = fname === 'L' ? 2 : 1;
    for (const ch of String(str)) {
      const g = f.glyphs[ch] || f.glyphs[' '];
      const ox = mono && /[0-9]/.test(ch) ? 0 : g.x0;
      const gw = mono && /[0-9]/.test(ch) ? g.w : g.x1 - g.x0 + 1;
      for (let j = 0; j < g.h; j++) for (let i = 0; i < gw; i++) {
        if (g.px[j * g.w + i + ox]) this.px(x + i, y + j, v);
      }
      x += gw + gap;
    }
    return x;
  };

  DMD.prototype.starfield = function (dt, speed, v) {
    for (const s of this.stars) {
      s[0] -= dt * speed * s[2] * 20;
      if (s[0] < 0) { s[0] += W; s[1] = Math.random() * H; }
      this.px(s[0], s[1], Math.round((v || 3) * s[2]));
    }
  };

  // big centred score that rolls up
  DMD.prototype.score = function (score, y, dt) {
    const target = score;
    const diff = target - this.shownScore;
    if (diff > 0) {
      // roll quickly but visibly: catch up within about 0.6 s
      this.shownScore += Math.max(Math.ceil(diff * Math.min(1, dt * 6)), Math.min(diff, 1110));
      if (this.shownScore > target) this.shownScore = target;
    } else this.shownScore = target;
    const s = NN.U.formatScore(this.shownScore);
    const f = this.measure(s, 'L', true) <= 126 ? 'L' : 'M';
    this.text(s, 64, y, f, 15, { align: 'center', mono: true });
  };

  // -------------------------------------------------------- rendering ---
  // view: { state, status, scene, bonus, attract, gameover, dt }
  DMD.prototype.render = function (game, dt) {
    this.t += dt;
    this.clear();
    const R = game.rules;
    const st = game.state;
    if (st === 'attract' || st === 'idle') return this.attract(game, dt);
    if (st === 'gameover' && !R.demo) return this.gameOver(game, dt);
    if (st === 'bonus' && game.bonus) return this.bonusScreen(game, dt);
    const sc = R.scene;
    if (sc !== this.lastScene) { this.lastScene = sc; this.sceneT = 0; }
    this.sceneT += dt;
    if (sc) return this.drawScene(sc, game, dt);
    this.scoreScreen(game, dt);
  };

  DMD.prototype.scoreScreen = function (game, dt) {
    const R = game.rules;
    const s = R.status();
    this.starfield(dt, 0.4, 2);
    this.score(s.score, 3, dt);
    // bottom line: mission timer bar, or ball + next high score to beat
    if (s.mission) {
      const m = s.mission;
      this.text(m.status, 2, 25, 'S', 12);
      const tl = Math.max(0, Math.ceil(m.time));
      const blink = m.time < 5 && Math.floor(this.t * 4) % 2 === 0;
      this.text(String(tl), 126, 25, 'S', blink ? 4 : 15, { align: 'right' });
      const bw = Math.round(40 * Math.max(0, Math.min(1, m.progress)));
      this.rect(64, 27, 40, 1, 3);
      this.rect(64, 26, bw, 3, 10);
    } else {
      const left = 'BALL ' + s.ball;
      this.text(left, 2, 25, 'S', 10);
      let right = '';
      if (s.line && Math.floor(this.t / 3) % 2 === 0) right = s.line;
      else if (s.next) right = 'BEAT ' + s.next.name + ' ' + NN.U.formatScore(s.next.score);
      else if (s.line) right = s.line;
      else right = s.bonusX > 1 ? 'BONUS ' + s.bonusX + 'X' : '';
      if (this.measure(right, 'S') > 92) right = right.replace('BEAT ', '');
      this.text(right, 126, 25, 'S', 10, { align: 'right' });
    }
    if (s.combo >= 2) this.text('X' + s.comboMult, 126, 1, 'S', 8, { align: 'right' });
  };

  const SCENES = {};
  DMD.prototype.drawScene = function (sc, game, dt) {
    const fn = SCENES[sc.kind] || SCENES.award;
    fn.call(this, sc, game, dt, this.sceneT);
  };

  // helpers for scene effects
  function slideIn(t, dur) { return Math.max(0, 1 - t / dur); }

  SCENES.award = function (sc, game, dt, t) {
    this.starfield(dt, 1.5, 3);
    const k = slideIn(t, 0.18);
    const off = Math.round(k * 70);
    const t2 = sc.t2 || '';
    if (t2) {
      this.text(sc.t1, 64 + off, 5, 'M', 15, { align: 'center' });
      this.text(t2, 64 - off, 18, 'M', 11, { align: 'center' });
    } else {
      this.text(sc.t1, 64 + off, 12, 'M', 15, { align: 'center' });
    }
  };

  SCENES.ballStart = function (sc, game, dt, t) {
    this.starfield(dt, 2, 3);
    this.text(sc.t1, 64, 2, 'L', 15, { align: 'center' });
    if (Math.floor(t * 3) % 2 === 0) this.text(sc.t2, 64, 24, 'S', 12, { align: 'center' });
  };

  SCENES.skillshot = function (sc, game, dt, t) {
    // radial burst
    const r = t * 90;
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      for (let q = 0; q < 3; q++) this.px(64 + Math.cos(ang) * (r - q * 4), 16 + Math.sin(ang) * (r - q * 4) * 0.5, 8 - q * 2);
    }
    const flash = t < 0.5 && Math.floor(t * 16) % 2 === 0;
    this.text(sc.t1, 64, 3, 'M', flash ? 6 : 15, { align: 'center' });
    this.text(sc.t2, 64, 16, 'L', 15, { align: 'center', mono: true });
  };

  SCENES.combo = function (sc, game, dt, t) {
    // speed streaks
    for (let i = 0; i < 14; i++) {
      const y = (i * 7 + 3) % 32, x = (W - ((t * 400 + i * 37) % (W + 40)));
      for (let k = 0; k < 14; k++) this.px(x + k, y, Math.max(0, 6 - k / 2));
    }
    const n = sc.n || 2;
    const bounce = Math.round(Math.max(0, 3 - t * 20));
    this.text(sc.t1, 64, 4 - bounce, 'M', 15, { align: 'center' });
    this.text(sc.t2, 64, 18, 'M', 10, { align: 'center' });
    for (let i = 0; i < Math.min(n, 10); i++) this.rect(4 + i * 4, 29, 2, 2, 12);
  };

  SCENES.jackpot = function (sc, game, dt, t) {
    // expanding rings
    for (let k = 0; k < 3; k++) {
      const r = ((t * 70) + k * 22) % 70;
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        this.px(64 + Math.cos(ang) * r, 16 + Math.sin(ang) * r * 0.45, Math.max(1, 9 - r / 9));
      }
    }
    const flash = t < 0.6 && Math.floor(t * 12) % 2 === 0;
    this.text(sc.t1, 64, 2, 'M', flash ? 5 : 15, { align: 'center' });
    this.text(sc.t2, 64, 15, 'L', 15, { align: 'center', mono: true });
  };

  SCENES.superjackpot = function (sc, game, dt, t) {
    const inv = t < 0.9 && Math.floor(t * 10) % 2 === 0;
    if (inv) this.rect(0, 0, W, H, 9);
    for (let k = 0; k < 2; k++) {
      const r = ((t * 110) + k * 50) % 110;
      for (let a = 0; a < 90; a++) {
        const ang = (a / 90) * Math.PI * 2;
        this.px(64 + Math.cos(ang) * r, 16 + Math.sin(ang) * r * 0.4, 13);
      }
    }
    if (inv) {
      // knock the text out of the lit background
      const tmp = new DMD();
      tmp.text(sc.t1, 64, 2, 'M', 15, { align: 'center' });
      tmp.text(sc.t2, 64, 15, 'L', 15, { align: 'center', mono: true });
      for (let i = 0; i < this.buf.length; i++) if (tmp.buf[i]) this.buf[i] = 0;
    } else {
      this.text(sc.t1, 64, 2, 'M', 15, { align: 'center' });
      this.text(sc.t2, 64, 15, 'L', 15, { align: 'center', mono: true });
    }
  };

  SCENES.multiball = function (sc, game, dt, t) {
    // three balls whizzing across
    for (let k = 0; k < 3; k++) {
      const x = ((t * 120 + k * 50) % (W + 30)) - 15, y = 8 + k * 8 + Math.sin(t * 9 + k) * 3;
      for (let a = 0; a < 6; a++) this.rect(x - a * 3, y, 3, 3, Math.max(1, 14 - a * 3));
    }
    const z = Math.min(1, t / 0.4);
    this.text(sc.t1, 64, 1, 'M', Math.round(6 + 9 * z), { align: 'center' });
    this.text(sc.t2, 64, 13, 'L', 15, { align: 'center' });
  };

  SCENES.lock = function (sc, game, dt, t) {
    this.starfield(dt, 1, 2);
    // docking bay doors closing
    const d = Math.min(1, t / 0.6);
    const gap = Math.round(30 * (1 - d));
    this.rect(0, 0, 64 - gap, 2, 6); this.rect(64 + gap, 0, 64 - gap, 2, 6);
    this.rect(0, 30, 64 - gap, 2, 6); this.rect(64 + gap, 30, 64 - gap, 2, 6);
    this.text(sc.t1, 64, 6, 'M', 15, { align: 'center' });
    this.text(sc.t2, 64, 18, 'M', 9, { align: 'center' });
  };

  SCENES.blackhole = function (sc, game, dt, t) {
    // swirling accretion spiral
    for (let i = 0; i < 160; i++) {
      const a = i * 0.25 + t * 6, r = 2 + i * 0.18;
      this.px(22 + Math.cos(a) * r, 16 + Math.sin(a) * r * 0.6, Math.max(1, 12 - i / 14));
    }
    this.text(sc.t1, 84, 6, 'M', 15, { align: 'center' });
    this.text(sc.t2, 84, 18, 'M', 10, { align: 'center' });
  };

  SCENES.mode_start = function (sc, game, dt, t) {
    // hyperspace zoom
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996, s = ((t * 1.6 + i * 0.137) % 1);
      const r = s * s * 80;
      const len = 1 + s * 6;
      for (let k = 0; k < len; k++) this.px(64 + Math.cos(a) * (r - k), 16 + Math.sin(a) * (r - k) * 0.5, Math.round(3 + s * 9));
    }
    const k = slideIn(t, 0.3);
    this.rect(0, 9, W, 14, 0);
    for (let i = 0; i < this.buf.length; i++) { const y = (i / W) | 0; if (y >= 8 && y < 24) this.buf[i] = 0; }
    this.text(sc.t1, 64 + Math.round(k * 100), 9, 'M', 15, { align: 'center' });
    if (t > 0.5) this.text(sc.t2, 64, 26, 'S', 11, { align: 'center' });
    this.rect(0, 7, W, 1, 6); this.rect(0, 18, W, 1, 6);
  };
  SCENES.wizard = function (sc, game, dt, t) {
    const r = t * 60;
    for (let a = 0; a < 120; a++) {
      const ang = (a / 120) * Math.PI * 2;
      const rr = r * (0.7 + 0.3 * Math.sin(a * 7 + t * 10));
      this.px(64 + Math.cos(ang) * rr, 16 + Math.sin(ang) * rr * 0.5, 12);
      this.px(64 + Math.cos(ang) * rr * 0.6, 16 + Math.sin(ang) * rr * 0.3, 7);
    }
    const flash = Math.floor(t * 6) % 2 === 0;
    this.text(sc.t1, 64, 4, 'L', flash ? 15 : 9, { align: 'center' });
    this.text(sc.t2, 64, 24, 'S', 12, { align: 'center' });
  };
  SCENES.mode_step = SCENES.award;
  SCENES.mode_complete = function (sc, game, dt, t) {
    for (let i = 0; i < 30; i++) {
      const x = (i * 53 + Math.floor(t * 10) * 17) % W, y = (i * 31 + Math.floor(t * 10) * 7) % H;
      this.px(x, y, 10);
    }
    this.text(sc.t1, 64, 4, 'M', 15, { align: 'center' });
    this.text(sc.t2, 64, 17, 'M', Math.floor(t * 5) % 2 === 0 ? 15 : 8, { align: 'center' });
  };
  SCENES.mode_end = SCENES.award;

  SCENES.extraball = function (sc, game, dt, t) {
    const flash = Math.floor(t * 8) % 2 === 0;
    if (flash) { this.rect(0, 0, W, 2, 12); this.rect(0, 30, W, 2, 12); }
    this.text(sc.t1, 64, 3, 'L', 15, { align: 'center' });
    this.text(sc.t2, 64, 23, 'S', 12, { align: 'center' });
  };
  SCENES.replay = SCENES.extraball;
  SCENES.shootagain = SCENES.extraball;

  SCENES.tilt = function (sc, game, dt, t) {
    if (Math.floor(t * 3) % 2 === 0) this.text('TILT', 64, 9, 'L', 15, { align: 'center' });
  };
  SCENES.danger = function (sc, game, dt, t) {
    const on = Math.floor(t * 8) % 2 === 0;
    if (on) this.rect(0, 0, W, H, 4);
    this.text('DANGER', 64, 5, 'L', 15, { align: 'center' });
    this.text(sc.t2 === 'LAST WARNING' ? 'LAST WARNING' : 'EASY ON THE NUDGE', 64, 24, 'S', 15, { align: 'center' });
  };
  SCENES.ballsaved = function (sc, game, dt, t) {
    this.starfield(dt, 3, 3);
    this.text('BALL SAVED', 64, 8, 'M', 15, { align: 'center' });
    const w = Math.round(Math.min(1, t / 0.5) * 60);
    this.rect(64 - w, 19, w * 2, 1, 9);
  };

  SCENES.select = function (sc, game, dt, t) {
    const R = game.rules;
    const sel = R.selecting;
    this.starfield(dt, 0.8, 2);
    this.text('CHOOSE MISSION', 64, 0, 'S', 9, { align: 'center' });
    this.text(sc.t1, 64, 8, 'M', 15, { align: 'center' });
    const pulse = Math.floor(t * 4) % 2 === 0 ? 15 : 8;
    this.text('<', 2, 8, 'M', pulse);
    this.text('>', 126, 8, 'M', pulse, { align: 'right' });
    this.text(sc.t2, 64, 18, 'S', 11, { align: 'center' });
    if (sel) {
      const left = Math.max(0, Math.ceil(sel.until - game.time));
      this.text('FLIP TO CHOOSE  LAUNCH TO GO ' + left, 64, 26, 'S', 7, { align: 'center' });
    }
  };

  // ----------------------------------------------------------- bonus ---
  DMD.prototype.bonusScreen = function (game, dt) {
    const B = game.bonus;
    if (B.done) { this.text('BONUS LOST', 64, 12, 'M', 12, { align: 'center' }); return; }
    if (B.phase === 'items' && B.i >= 0 && B.i < B.items.length) {
      const it = B.items[B.i];
      this.text(it.count + ' ' + it.label, 64, 3, 'M', 15, { align: 'center' });
      this.text(NN.U.formatScore(it.value), 64, 16, 'L', 15, { align: 'center', mono: true });
    } else if (B.phase === 'mult' || (B.phase === 'items' && B.i < 0)) {
      this.text('BONUS', 64, 3, 'M', 15, { align: 'center' });
      this.text(NN.U.formatScore(B.total) + ' X ' + B.x, 64, 17, 'M', 15, { align: 'center' });
    } else {
      this.text('TOTAL BONUS', 64, 2, 'M', 15, { align: 'center' });
      this.text(NN.U.formatScore(B.grand || 0), 64, 15, 'L', 15, { align: 'center', mono: true });
    }
  };

  DMD.prototype.gameOver = function (game, dt) {
    this.starfield(dt, 0.5, 2);
    this.text('GAME OVER', 64, 2, 'M', 15, { align: 'center' });
    this.text(NN.U.formatScore(game.rules.score), 64, 14, 'L', 15, { align: 'center', mono: true });
  };

  // --------------------------------------------------------- attract ---
  DMD.prototype.attract = function (game, dt) {
    const pages = 4;
    const T = 4.2;
    const page = Math.floor(this.t / T) % pages;
    const t = this.t % T;
    if (page === 0) {
      // logo with a sweeping shine
      this.starfield(dt, 1, 3);
      this.text('NEON', 64, 0, 'L', 13, { align: 'center' });
      this.text('NEBULA', 64, 17, 'L', 13, { align: 'center' });
      const sx = (t / T) * 200 - 40;
      for (let i = 0; i < this.buf.length; i++) {
        if (!this.buf[i]) continue;
        const x = i % W, y = (i / W) | 0;
        const d = Math.abs(x - sx + y * 0.6);
        if (d < 6) this.buf[i] = 15;
      }
    } else if (page === 1) {
      this.starfield(dt, 2, 4);
      const on = Math.floor(t * 2) % 2 === 0;
      this.text('PRESS START', 64, 6, 'M', on ? 15 : 7, { align: 'center' });
      this.text('FREE PLAY  NO ADS EVER', 64, 22, 'S', 9, { align: 'center' });
    } else if (page === 2) {
      const hs = game.rules.highScores || [];
      this.text('HIGH SCORES', 64, 0, 'S', 12, { align: 'center' });
      for (let i = 0; i < 3; i++) {
        const h = hs[i];
        const y = 8 + i * 8;
        if (!h) continue;
        this.text((i + 1) + ' ' + h.name, 4, y, 'S', 15);
        this.text(NN.U.formatScore(h.score), 124, y, 'S', 15, { align: 'right' });
      }
      if (!hs.length) this.text('BE THE FIRST', 64, 14, 'M', 12, { align: 'center' });
    } else {
      this.starfield(dt, 0.6, 2);
      this.text('LAST GAME', 64, 2, 'S', 10, { align: 'center' });
      this.score(game.lastScore || 0, 12, dt);
    }
  };

  NN.DMD = DMD;
  NN.DMD_FONTS = { M: FONT_M, S: FONT_S, L: FONT_L };
})(globalThis.NN || (globalThis.NN = {}));
