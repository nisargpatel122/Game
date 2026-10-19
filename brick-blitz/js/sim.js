/* Brick Blitz — game rules and physics.
 * Deterministic (seeded random), so a level plays out the same in the browser and in Node,
 * where tools/ use it to test levels. Units: a brick is 1 wide and 0.5 tall, the field is
 * 11 x 20, and y points down. */
(function (root) {
  'use strict';

  const STEP = 1 / 120;
  const FW = 11, FH = 20, BW = 1, BH = 0.5;
  const TOP = 1.5;                       // first brick row; the gap above lets the ball get behind the wall
  const PADDLE_Y = 18.2, PADDLE_H = 0.42;
  const BALL_R = 0.2;
  const MAX_BOUNCE = 62 * Math.PI / 180; // the paddle's very edge sends the ball out this far from vertical
  const MIN_VY = 0.3;                    // the ball never flies flatter than this (share of its speed)
  const MIN_VX = 0.05;                   // ...or perfectly straight up and down
  const DANGER_Y = 15.5;                 // a sinking wall that reaches this line ends the level
  const MAX_BALLS = 12, MAX_LIVES = 7;
  const CAPSULE_W = 0.95, CAPSULE_H = 0.44, CAPSULE_VY = 4.2;
  const LASER_VY = 26, LASER_EVERY = 0.3;
  const STUN = 0.6;

  const COLORS = { r: 'red', o: 'orange', y: 'yellow', l: 'lime', g: 'green', c: 'cyan', b: 'blue', p: 'purple', m: 'pink', w: 'white' };

  // What breaking each kind is worth before the combo multiplier (normal and armor: per hit point).
  const KIND_PTS = { normal: 100, armor: 100, steel: 800, gold: 0, tnt: 150, bonus: 250, ball: 250, ghost: 300, turret: 500 };

  // w = how often it drops (relative); dur = seconds it lasts.
  const POWERS = {
    expand: { good: true, dur: 15, w: 14 },
    multi: { good: true, w: 16 },
    laser: { good: true, dur: 10, w: 10 },
    slow: { good: true, dur: 12, w: 9 },
    magnet: { good: true, dur: 15, w: 8 },
    shield: { good: true, w: 8 },
    fire: { good: true, dur: 8, w: 9 },
    zap: { good: true, w: 9 },
    life: { good: true, w: 3 },
    shrink: { good: false, dur: 12, w: 9 },
    fast: { good: false, dur: 10, w: 9 },
  };

  /* Level map legend (one character per brick, 11 per row):
   *   . or space  empty
   *   r o y l g c b p m w   1-hit bricks (red orange yellow lime green cyan blue purple pink white)
   *   R O Y L G C B P M W   the same colours, armoured: 2 hits
   *   2 3 4 5     metal bricks needing that many hits
   *   @           steel: 6 hits (lasers chip it, fireballs melt it)
   *   #           gold: unbreakable
   *   *           TNT: blows up everything around it
   *   ?           bonus: always drops a power-up
   *   +           ball cage: frees an extra ball
   *   ~           ghost: invisible until the first hit, then needs one more
   *   ^           turret: shoots at the paddle (2 hits) */
  function parseCell(ch) {
    if (ch === '.' || ch === ' ' || ch == null) return null;
    if (COLORS[ch]) return { kind: 'normal', color: COLORS[ch], hp: 1 };
    const lower = ch.toLowerCase();
    if (ch !== lower && COLORS[lower]) return { kind: 'normal', color: COLORS[lower], hp: 2 };
    if (ch >= '2' && ch <= '5') return { kind: 'armor', color: 'metal', hp: +ch };
    switch (ch) {
      case '@': return { kind: 'steel', color: 'steel', hp: 6 };
      case '#': return { kind: 'gold', color: 'gold', hp: Infinity };
      case '*': return { kind: 'tnt', color: 'tnt', hp: 1 };
      case '?': return { kind: 'bonus', color: 'bonus', hp: 1 };
      case '+': return { kind: 'ball', color: 'ball', hp: 1 };
      case '~': return { kind: 'ghost', color: 'ghost', hp: 2 };
      case '^': return { kind: 'turret', color: 'turret', hp: 2 };
    }
    throw new Error('Unknown brick character "' + ch + '"');
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Circle against an axis-aligned box: the push-out direction and depth, or null.
  function circleRect(px, py, r, x, y, w, h) {
    const cx = clamp(px, x, x + w), cy = clamp(py, y, y + h);
    const dx = px - cx, dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      return { nx: dx / d, ny: dy / d, pen: r - d };
    }
    // The centre is inside the box: leave by the nearest side.
    const l = px - x, rt = x + w - px, t = py - y, b = y + h - py;
    const m = Math.min(l, rt, t, b);
    if (m === t) return { nx: 0, ny: -1, pen: t + r };
    if (m === b) return { nx: 0, ny: 1, pen: b + r };
    if (m === l) return { nx: -1, ny: 0, pen: l + r };
    return { nx: 1, ny: 0, pen: rt + r };
  }

  class Sim {
    constructor(level, opts) {
      opts = opts || {};
      this.level = level;
      this.onEvent = opts.onEvent || null;
      this.rand = rng(opts.seed == null ? hashStr(String(level.n || level.name || 'level')) : opts.seed);
      this.tune = Object.assign({ speed: 10.5, ramp: 0.3, paddle: 2.3, drop: 0.12, bad: 1, lives: 3, turret: 3.4, shot: 7 }, level.tune);
      this.time = 0;
      this.playTime = 0;
      this.intro = opts.intro || 0;
      this.bricks = [];
      this.balls = [];
      this.capsules = [];
      this.bolts = [];
      this.shots = [];
      this.fuses = [];
      this.fx = { expand: 0, shrink: 0, slow: 0, fast: 0, laser: 0, magnet: 0, fire: 0 };
      this.shield = false;
      this.lives = this.tune.lives;
      this.lost = 0;
      this.score = 0;
      this.combo = 0;
      this.comboBest = 0;
      this.paddleHits = 0;
      this.caught = 0;
      this.stale = 0; // seconds since a breakable brick was last hit
      this.input = { x: null, launch: false, maxSpeed: Infinity };
      this.paddle = { x: FW / 2, w: this.tune.paddle, stun: 0, laserT: 0, vx: 0 };
      this.wallY = 0;
      this.wallTarget = 0;
      this.descendT = level.descend || 0;
      this.descendWarned = false;
      this.lowest = 0;
      this.stars = 0;
      this.bonus = null;
      this.failReason = null;
      this._buildBricks();
      this.boss = level.boss ? this._makeBoss(level.boss) : null;
      this.state = 'serve';
      this._serve();
    }

    emit(type, d) { if (this.onEvent) this.onEvent(type, d || {}); }

    // ---------------- setup ----------------
    _buildBricks() {
      const map = this.level.map || [];
      let id = 0;
      map.forEach((line, row) => {
        for (let col = 0; col < FW; col++) {
          const c = parseCell(line[col]);
          if (!c) continue;
          const x0 = col * BW, y0 = TOP + row * BH;
          this.bricks.push({
            id: id++, row, col, x0, y0, x: x0, y: y0,
            kind: c.kind, color: c.color, hp: c.hp, maxHp: c.hp, alive: true,
            hidden: c.kind === 'ghost', flash: 0, group: null, summoned: false,
            fireT: c.kind === 'turret' ? 1.5 + this.rand() * 2.5 : 0,
          });
        }
      });
      this.nextId = id;
      this.total = this.bricks.filter(b => b.kind !== 'gold').length;
      this.remaining = this.total;
      this.totalHp = this.bricks.reduce((s, b) => s + (b.kind === 'gold' ? 0 : b.maxHp), 0);
      // Rows (optionally just some columns of them) that slide from side to side as one
      // block, as far as the walls or the nearest brick that stays put.
      this.groups = (this.level.move || []).map((m, gi) => {
        const inGroup = (b) => m.rows.includes(b.row) && (!m.cols || (b.col >= m.cols[0] && b.col <= m.cols[1]));
        const members = this.bricks.filter(inGroup);
        let lo = 0, hi = 0;
        if (members.length) {
          const minCol = Math.min(...members.map(b => b.col)), maxCol = Math.max(...members.map(b => b.col));
          let left = -1, right = FW;
          for (const b of this.bricks) {
            if (!m.rows.includes(b.row) || inGroup(b)) continue;
            if (b.col < minCol) left = Math.max(left, b.col);
            if (b.col > maxCol) right = Math.min(right, b.col);
          }
          lo = left + 1 - minCol;
          hi = right - 1 - maxCol;
          if (m.range != null) { lo = Math.max(lo, -m.range); hi = Math.min(hi, m.range); }
        }
        members.forEach(b => { b.group = gi; });
        return { off: 0, dir: m.speed < 0 ? -1 : 1, speed: Math.abs(m.speed), lo, hi };
      });
    }

    _makeBoss(spec) {
      const b = Object.assign({ w: 3, h: 1.8, y: 3.6, ax: 3, ay: 0 }, spec);
      b.maxHp = b.hp;
      b.cx = FW / 2;
      b.cy = b.y;
      b.x = b.cx;
      b.t = 0;
      b.phase = 0;
      b.flash = 0;
      b.dead = false;
      b.deathT = 0;
      b.shotT = 2.2;
      b.summonT = b.phases[0].summon ? b.phases[0].summon.every : 0;
      b.shardA = 0;
      b.shards = [];
      if (spec.shards) for (let i = 0; i < spec.shards.n; i++) b.shards.push({ x: 0, y: 0, s: spec.shards.size || 0.7 });
      this._placeShards(b);
      return b;
    }

    _serve() {
      const side = this.rand() < 0.5 ? -1 : 1;
      this.balls = [this._newBall(this.paddle.x, PADDLE_Y - BALL_R, 0, 0)];
      this.balls[0].stuck = side * (0.2 + this.rand() * 0.25);
      this.state = 'serve';
      this.emit('serve');
    }

    _newBall(x, y, vx, vy) {
      return { x, y, vx, vy, r: BALL_R, alive: true, stuck: null, stuckT: 0, idle: 0, bossCD: 0 };
    }

    // ---------------- helpers ----------------
    speed() {
      const t = this.tune, f = this.fx;
      return t.speed * (1 + Math.min(t.ramp, this.paddleHits * 0.012)) * (f.slow > 0 ? 0.7 : 1) * (f.fast > 0 ? 1.28 : 1);
    }

    paddleWidth() {
      return this.tune.paddle * (this.fx.expand > 0 ? 1.5 : 1) * (this.fx.shrink > 0 ? 0.62 : 1);
    }

    _aimBall(ball, t) {
      const a = clamp(t, -1, 1) * MAX_BOUNCE;
      const s = this.speed();
      ball.vx = Math.sin(a) * s;
      ball.vy = -Math.cos(a) * s;
      this._fixAngle(ball);
    }

    _fixAngle(ball) {
      const s = Math.hypot(ball.vx, ball.vy) || this.speed();
      if (Math.abs(ball.vy) < MIN_VY * s) {
        ball.vy = (ball.vy < 0 ? -1 : 1) * MIN_VY * s;
        ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(s * s - ball.vy * ball.vy);
      }
      if (Math.abs(ball.vx) < MIN_VX * s) {
        const sx = ball.vx === 0 ? (this.rand() < 0.5 ? -1 : 1) : Math.sign(ball.vx);
        ball.vx = sx * MIN_VX * s;
        ball.vy = (ball.vy < 0 ? -1 : 1) * Math.sqrt(s * s - ball.vx * ball.vx);
      }
    }

    _reflect(ball, nx, ny) {
      const d = ball.vx * nx + ball.vy * ny;
      if (d >= 0) return false;
      ball.vx -= 2 * d * nx;
      ball.vy -= 2 * d * ny;
      // A ball that hasn't found the paddle or a breakable brick for a while gets nudged
      // so it can't loop forever between walls and gold.
      if (ball.idle > 8) {
        const a = (this.rand() - 0.5) * 0.35, c = Math.cos(a), s = Math.sin(a);
        const vx = ball.vx * c - ball.vy * s;
        ball.vy = ball.vx * s + ball.vy * c;
        ball.vx = vx;
      }
      this._fixAngle(ball);
      return true;
    }

    release(ball) {
      if (ball.stuck == null) return;
      this._aimBall(ball, ball.stuck);
      ball.stuck = null;
      ball.y = PADDLE_Y - ball.r - 0.01;
    }

    // ---------------- main step ----------------
    step() {
      const dt = STEP;
      this.time += dt;
      if (this.intro > 0) this.intro -= dt;
      const st = this.state;
      const live = st === 'play';
      if (live) this.playTime += dt;

      this._movePaddle(dt);

      if (live) {
        for (const k in this.fx) {
          if (this.fx[k] > 0) {
            this.fx[k] = Math.max(0, this.fx[k] - dt);
            if (this.fx[k] === 0) this._expire(k);
          }
        }
      }
      if (st === 'serve' || live) this._moveGroups(dt);
      if (live) this._descend(dt);
      this.wallY += clamp(this.wallTarget - this.wallY, -dt * 2, dt * 2);
      for (const b of this.bricks) {
        if (!b.alive) continue;
        b.x = b.x0 + (b.group != null ? this.groups[b.group].off : 0);
        b.y = b.y0 + this.wallY;
        if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 5);
      }
      if (this.boss) this._updateBoss(dt);

      // Launch the ball from the paddle (serve, or a magnet catch). A tap during the
      // level intro is kept until the intro ends.
      if (this.input.launch && this.intro <= 0) {
        this.input.launch = false;
        if (st === 'serve' || live) {
          let any = false;
          for (const ball of this.balls) if (ball.stuck != null) { this.release(ball); any = true; }
          if (any) {
            if (st === 'serve') this.state = 'play';
            this.emit('launch', { x: this.paddle.x });
          }
        }
      }

      this._moveBalls(dt);
      if (this.state === 'play') {
        this._assist(dt);
        this._moveCapsules(dt);
        this._lasers(dt);
        this._moveBolts(dt);
        this._moveShots(dt);
        this._turrets(dt);
        this._burnFuses(dt);
        if (!this.balls.length) this._loseLife();
      } else if (this.state === 'lost') {
        this.lostT -= dt;
        if (this.lostT <= 0) this._serve();
      } else if (this.state === 'won') {
        this._burnFuses(dt);
      }
    }

    _movePaddle(dt) {
      const p = this.paddle;
      p.w += (this.paddleWidth() - p.w) * Math.min(1, dt * 10);
      const half = p.w / 2;
      const before = p.x;
      if (p.stun > 0) p.stun -= dt;
      else if (this.input.x != null && this.state !== 'failed') {
        let d = this.input.x - p.x;
        const m = this.input.maxSpeed * dt;
        if (d > m) d = m; else if (d < -m) d = -m;
        p.x += d;
      }
      p.x = clamp(p.x, half, FW - half);
      p.vx = (p.x - before) / dt;
      for (const ball of this.balls) {
        if (ball.stuck == null) continue;
        ball.x = p.x + ball.stuck * half;
        ball.y = PADDLE_Y - ball.r;
        if (this.state === 'play') {
          ball.stuckT += dt;
          if (ball.stuckT > 2.5) { this.release(ball); this.emit('launch', { x: ball.x }); }
        }
      }
    }

    _expire(k) {
      if (k === 'magnet') for (const ball of this.balls) if (ball.stuck != null) this.release(ball);
      this.emit('expire', { type: k });
    }

    _moveGroups(dt) {
      for (const g of this.groups) {
        if (g.hi - g.lo < 0.01) continue;
        g.off += g.dir * g.speed * dt;
        if (g.off > g.hi) { g.off = g.hi; g.dir = -1; }
        if (g.off < g.lo) { g.off = g.lo; g.dir = 1; }
      }
    }

    _descend(dt) {
      if (this.level.descend) {
        this.descendT -= dt;
        if (this.descendT <= 1.2 && !this.descendWarned) { this.descendWarned = true; this.emit('descendWarn'); }
        if (this.descendT <= 0) {
          this.descendT = this.level.descend;
          this.descendWarned = false;
          this.wallTarget += BH;
          this.emit('descend');
        }
      }
      let low = 0;
      for (const b of this.bricks) if (b.alive && b.y + BH > low) low = b.y + BH;
      this.lowest = low;
      if (low > DANGER_Y) this._fail('wall');
    }

    // ---------------- balls ----------------
    _moveBalls(dt) {
      const target = this.speed();
      const ease = Math.min(1, dt * 4);
      for (const ball of this.balls) {
        if (ball.stuck != null) continue;
        ball.idle += dt;
        if (ball.bossCD > 0) ball.bossCD -= dt;
        const s = Math.hypot(ball.vx, ball.vy);
        if (s > 0 && this.state === 'play') {
          const k = (s + (target - s) * ease) / s;
          ball.vx *= k; ball.vy *= k;
        }
        const n = Math.max(1, Math.ceil(s * dt / (ball.r * 0.5)));
        const h = dt / n;
        for (let i = 0; i < n && ball.alive && ball.stuck == null; i++) {
          ball.x += ball.vx * h;
          ball.y += ball.vy * h;
          this._ballWalls(ball);
          if (this.state === 'play' || this.state === 'serve') {
            this._ballBricks(ball);
            if (this.boss) this._ballBoss(ball);
            this._ballPaddle(ball);
            if (this.shield && ball.vy > 0 && ball.y + ball.r > FH - 0.15) {
              ball.y = FH - 0.15 - ball.r;
              ball.vy = -Math.abs(ball.vy);
              this.shield = false;
              this.emit('shieldSave', { x: ball.x, y: FH - 0.15 });
            }
          }
          if (ball.y - ball.r > FH) ball.alive = false;
        }
      }
      const before = this.balls.length;
      this.balls = this.balls.filter(b => b.alive);
      if (this.balls.length < before && this.state === 'play') this.emit('ballOut', { left: this.balls.length });
    }

    _ballWalls(ball) {
      const r = ball.r;
      let hit = false;
      if (ball.x < r) { ball.x = r; if (ball.vx < 0) { this._reflect(ball, 1, 0); hit = true; } }
      else if (ball.x > FW - r) { ball.x = FW - r; if (ball.vx > 0) { this._reflect(ball, -1, 0); hit = true; } }
      if (ball.y < r) { ball.y = r; if (ball.vy < 0) { this._reflect(ball, 0, 1); hit = true; } }
      if (hit) this.emit('wall', { x: ball.x, y: ball.y });
    }

    _ballBricks(ball) {
      const r = ball.r;
      const fire = this.fx.fire > 0;
      for (let pass = 0; pass < 3; pass++) {
        let best = null, bc = null;
        for (const b of this.bricks) {
          if (!b.alive) continue;
          if (ball.x + r < b.x || ball.x - r > b.x + BW || ball.y + r < b.y || ball.y - r > b.y + BH) continue;
          const c = circleRect(ball.x, ball.y, r, b.x, b.y, BW, BH);
          if (!c) continue;
          if (fire && b.kind !== 'gold') {
            this._damage(b, 99, 'fire');
            ball.idle = 0;
            continue;
          }
          if (!bc || c.pen > bc.pen) { best = b; bc = c; }
        }
        if (!best) return;
        ball.x += bc.nx * bc.pen;
        ball.y += bc.ny * bc.pen;
        const bounced = this._reflect(ball, bc.nx, bc.ny);
        if (pass === 0 && bounced) {
          if (best.kind !== 'gold') ball.idle = 0;
          this._damage(best, 1, 'ball');
        }
      }
    }

    _ballPaddle(ball) {
      if (ball.vy <= 0) return;
      const p = this.paddle, half = p.w / 2;
      if (ball.y + ball.r < PADDLE_Y || ball.y > PADDLE_Y + PADDLE_H) return;
      if (ball.x < p.x - half - ball.r * 0.7 || ball.x > p.x + half + ball.r * 0.7) return;
      const t = clamp((ball.x - p.x) / half, -1, 1);
      ball.y = PADDLE_Y - ball.r;
      ball.idle = 0;
      this.combo = 0;
      this.paddleHits++;
      if (this.fx.magnet > 0) {
        ball.stuck = t;
        ball.stuckT = 0;
        ball.vx = 0; ball.vy = 0;
        this.emit('magnet', { x: ball.x, y: PADDLE_Y });
        return;
      }
      this._aimBall(ball, t);
      this.emit('paddle', { x: ball.x, y: PADDLE_Y, t });
    }

    // ---------------- bricks ----------------
    _damage(b, dmg, src) {
      if (!b.alive) return;
      if (b.kind === 'gold') { b.flash = 1; this.emit('gold', { b, x: b.x + BW / 2, y: b.y + BH / 2 }); return; }
      if (b.hidden) {
        b.hidden = false;
        b.flash = 1;
        b.hp -= 1;
        this.emit('reveal', { b, x: b.x + BW / 2, y: b.y + BH / 2 });
        if (dmg <= 1) return;
        dmg -= 1;
      }
      b.hp -= dmg;
      b.flash = 1;
      this.stale = 0;
      if (b.hp > 0) { this.emit('hit', { b, x: b.x + BW / 2, y: b.y + BH / 2, src }); return; }
      this._break(b, src);
    }

    _break(b, src) {
      b.alive = false;
      b.hp = 0;
      this.combo++;
      if (this.combo > this.comboBest) this.comboBest = this.combo;
      const mult = this.multiplier();
      const base = KIND_PTS[b.kind] * (b.kind === 'normal' || b.kind === 'armor' ? b.maxHp : 1);
      const pts = base * mult;
      this.score += pts;
      if (!b.summoned) this.remaining--;
      // With only a few bricks left, hidden ones show themselves.
      if (this.remaining <= 3) {
        for (const g of this.bricks) {
          if (!g.alive || !g.hidden) continue;
          g.hidden = false;
          g.hp = 1;
          g.flash = 1;
          this.emit('reveal', { b: g, x: g.x + BW / 2, y: g.y + BH / 2 });
        }
      }
      const x = b.x + BW / 2, y = b.y + BH / 2;
      this.emit('break', { b, x, y, pts, combo: this.combo, mult, src });
      if (b.kind === 'tnt') this.fuses.push({ x, y, t: 0.12 });
      if (b.kind === 'ball') this._freeBall(x, y);
      if (b.kind === 'bonus') this._drop(x, y, true);
      else if (this.capsules.length < 3 && this.rand() < this.tune.drop) this._drop(x, y, false);
      if (!this.boss && this.remaining <= 0 && this.state === 'play') this._win();
    }

    multiplier() { return Math.min(8, 1 + Math.floor((Math.max(1, this.combo) - 1) / 4)); }

    _freeBall(x, y) {
      if (this.balls.length >= MAX_BALLS) { this.score += 500; return; }
      const ball = this._newBall(x, y, 0, 0);
      const a = (this.rand() - 0.5) * 1.4;
      const s = this.speed();
      ball.vx = Math.sin(a) * s;
      ball.vy = -Math.cos(a) * s;
      this.balls.push(ball);
      this.emit('freeBall', { x, y });
    }

    _burnFuses(dt) {
      for (let i = this.fuses.length - 1; i >= 0; i--) {
        const f = this.fuses[i];
        f.t -= dt;
        if (f.t > 0) continue;
        this.fuses.splice(i, 1);
        this._explode(f.x, f.y);
      }
    }

    // TNT: 3 bricks wide, 5 rows tall.
    _explode(x, y) {
      this.emit('explode', { x, y });
      for (const b of this.bricks) {
        if (!b.alive || b.kind === 'gold') continue;
        if (Math.abs(b.x + BW / 2 - x) <= 1.05 && Math.abs(b.y + BH / 2 - y) <= 1.05) this._damage(b, 3, 'blast');
      }
      const bo = this.boss;
      if (bo && !bo.dead && Math.abs(bo.x - x) < bo.w / 2 + 1 && Math.abs(bo.y - y) < bo.h / 2 + 1) this._bossDamage(3);
    }

    // ---------------- power-ups ----------------
    // Help when stuck: if only a few bricks are left and nothing has been hit for a while
    // (or nothing at all for longer), a Lightning capsule falls from the top.
    _assist(dt) {
      this.stale += dt;
      if (this.boss || this.stale < (this.remaining <= 3 ? 15 : 25)) return;
      this.stale = 0;
      if (this.capsules.some(c => c.type === 'zap')) return;
      const x = 1 + this.rand() * (FW - 2);
      this.capsules.push({ x, y: 0.5, type: 'zap', t: 0 });
      this.emit('drop', { type: 'zap', x, y: 0.5, assist: true });
    }

    _drop(x, y, goodOnly) {
      const bag = [];
      let sum = 0;
      for (const k in POWERS) {
        const P = POWERS[k];
        if (goodOnly && !P.good) continue;
        if (k === 'life' && this.lives >= MAX_LIVES) continue;
        if (k === 'multi' && this.balls.length >= 8) continue;
        if (k === 'shield' && this.shield) continue;
        const w = P.w * (P.good ? 1 : this.tune.bad);
        if (w <= 0) continue;
        bag.push([k, w]);
        sum += w;
      }
      let pick = this.rand() * sum, type = bag[0][0];
      for (const [k, w] of bag) { pick -= w; if (pick <= 0) { type = k; break; } }
      this.capsules.push({ x: clamp(x, CAPSULE_W / 2, FW - CAPSULE_W / 2), y, type, t: 0 });
      this.emit('drop', { type, x, y });
    }

    _moveCapsules(dt) {
      const p = this.paddle, half = p.w / 2;
      for (let i = this.capsules.length - 1; i >= 0; i--) {
        const c = this.capsules[i];
        if (!c) continue;
        c.t += dt;
        c.y += CAPSULE_VY * dt;
        const hit = c.y + CAPSULE_H / 2 >= PADDLE_Y && c.y - CAPSULE_H / 2 <= PADDLE_Y + PADDLE_H &&
          c.x + CAPSULE_W / 2 >= p.x - half && c.x - CAPSULE_W / 2 <= p.x + half;
        if (hit) {
          this.capsules.splice(i, 1);
          this._apply(c.type, c.x);
        } else if (c.y > FH + 1) this.capsules.splice(i, 1);
      }
    }

    _apply(type, x) {
      const P = POWERS[type], f = this.fx;
      this.caught++;
      switch (type) {
        case 'expand': f.expand = P.dur; f.shrink = 0; break;
        case 'shrink': f.shrink = P.dur; f.expand = 0; break;
        case 'slow': f.slow = P.dur; f.fast = 0; break;
        case 'fast': f.fast = P.dur; f.slow = 0; break;
        case 'laser': f.laser = P.dur; break;
        case 'magnet': f.magnet = P.dur; break;
        case 'fire': f.fire = P.dur; break;
        case 'life': this.lives = Math.min(MAX_LIVES, this.lives + 1); break;
        case 'shield': this.shield = true; break;
        case 'multi': this._multi(); break;
        case 'zap': this._zap(); break;
      }
      if (P.good) this.score += 250;
      this.emit('power', { type, good: P.good, x: x == null ? this.paddle.x : x, y: PADDLE_Y });
    }

    _multi() {
      const src = this.balls.slice();
      for (const ball of src) {
        if (this.balls.length >= MAX_BALLS) break;
        if (ball.stuck != null) this.release(ball);
        for (const a of [-0.42, 0.42]) {
          if (this.balls.length >= MAX_BALLS) break;
          const c = Math.cos(a), s = Math.sin(a);
          const nb = this._newBall(ball.x, ball.y, ball.vx * c - ball.vy * s, ball.vx * s + ball.vy * c);
          this._fixAngle(nb);
          this.balls.push(nb);
        }
      }
      this.emit('multi', { n: this.balls.length });
    }

    // Lightning from the paddle strikes up to five bricks (and the boss).
    _zap() {
      const pool = this.bricks.filter(b => b.alive && b.kind !== 'gold');
      const targets = [];
      for (let i = 0; i < 5 && pool.length; i++) {
        const b = pool.splice(Math.floor(this.rand() * pool.length), 1)[0];
        targets.push({ x: b.x + BW / 2, y: b.y + BH / 2, b });
      }
      const bo = this.boss;
      if (bo && !bo.dead) targets.push({ x: bo.x, y: bo.y, boss: true });
      this.emit('zap', { x: this.paddle.x, y: PADDLE_Y, targets });
      for (const t of targets) {
        if (t.boss) this._bossDamage(2);
        else this._damage(t.b, 3, 'zap');
      }
    }

    _lasers(dt) {
      const p = this.paddle;
      if (this.fx.laser <= 0 || p.stun > 0) return;
      p.laserT -= dt;
      if (p.laserT > 0) return;
      p.laserT = LASER_EVERY;
      const off = p.w / 2 - 0.2;
      this.bolts.push({ x: p.x - off, y: PADDLE_Y - 0.1 }, { x: p.x + off, y: PADDLE_Y - 0.1 });
      this.emit('laser', { x: p.x });
    }

    _moveBolts(dt) {
      const bo = this.boss;
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        const z = this.bolts[i];
        if (!z) continue; // the level ended mid-loop and cleared the list
        z.y -= LASER_VY * dt;
        let gone = z.y < 0;
        if (!gone) {
          for (const b of this.bricks) {
            if (b.alive && z.x >= b.x && z.x <= b.x + BW && z.y >= b.y && z.y <= b.y + BH) {
              this._damage(b, 1, 'laser');
              gone = true;
              break;
            }
          }
        }
        if (!gone && bo && !bo.dead) {
          for (const s of bo.shards) {
            if (Math.abs(z.x - s.x) < s.s / 2 && Math.abs(z.y - s.y) < s.s / 2) { gone = true; break; }
          }
          if (!gone && Math.abs(z.x - bo.x) < bo.w / 2 && Math.abs(z.y - bo.y) < bo.h / 2) {
            this._bossDamage(0.5);
            gone = true;
          }
        }
        if (gone) {
          this.bolts.splice(i, 1);
          if (z.y >= 0) this.emit('boltHit', { x: z.x, y: z.y });
        }
      }
    }

    // ---------------- enemy shots ----------------
    _shoot(x, y, vx, vy) { this.shots.push({ x, y, vx, vy, r: 0.17 }); }

    _aimShot(x, y, speed, spread) {
      const dx = this.paddle.x - x, dy = PADDLE_Y - y;
      const a0 = Math.atan2(dx, dy);
      for (const da of spread || [0]) {
        const a = a0 + da;
        this._shoot(x, y, Math.sin(a) * speed, Math.cos(a) * speed);
      }
    }

    _moveShots(dt) {
      const p = this.paddle, half = p.w / 2;
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const s = this.shots[i];
        if (!s) continue;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.y + s.r >= PADDLE_Y && s.y - s.r <= PADDLE_Y + PADDLE_H && s.x + s.r >= p.x - half && s.x - s.r <= p.x + half) {
          this.shots.splice(i, 1);
          p.stun = STUN;
          this.emit('stun', { x: s.x, y: PADDLE_Y });
        } else if (s.y > FH + 0.5 || s.x < -1 || s.x > FW + 1) this.shots.splice(i, 1);
      }
    }

    _turrets(dt) {
      for (const b of this.bricks) {
        if (!b.alive || b.kind !== 'turret') continue;
        b.fireT -= dt;
        if (b.fireT > 0) continue;
        b.fireT = this.tune.turret * (0.8 + this.rand() * 0.4);
        if (b.hidden) continue;
        const x = b.x + BW / 2, y = b.y + BH;
        this._aimShot(x, y, this.tune.shot);
        this.emit('turret', { x, y });
      }
    }

    // ---------------- boss ----------------
    _placeShards(b) {
      const n = b.shards.length;
      if (!n) return;
      const R = this.level.boss.shards.r || 2.2;
      b.shards.forEach((s, i) => {
        const a = b.shardA + i * Math.PI * 2 / n;
        s.x = b.x + Math.cos(a) * R;
        s.y = b.y + Math.sin(a) * R * 0.62;
      });
    }

    _updateBoss(dt) {
      const b = this.boss;
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 4);
      if (b.dead) {
        b.deathT += dt;
        if (b.deathT > 1.6 && this.state === 'play') this._win();
        return;
      }
      const ph = b.phases[b.phase];
      if (this.state !== 'lost') b.t += dt * (ph.spd || 1);
      b.x = b.cx + b.ax * Math.sin(b.t);
      b.y = b.cy + b.ay * Math.sin(b.t * 1.6 + 0.7);
      if (b.shards.length) {
        b.shardA += dt * (ph.shardSpd != null ? ph.shardSpd : this.level.boss.shards.spd || 1);
        this._placeShards(b);
      }
      if (this.state !== 'play') return;
      if (ph.shot) {
        b.shotT -= dt;
        if (b.shotT <= 0) {
          b.shotT = ph.shot.every * (0.85 + this.rand() * 0.3);
          this._bossFire(ph.shot);
        }
      }
      if (ph.summon) {
        b.summonT -= dt;
        if (b.summonT <= 0) {
          b.summonT = ph.summon.every;
          this._summon(ph.summon);
        }
      }
    }

    _bossFire(shot) {
      const b = this.boss, x = b.x, y = b.y + b.h / 2, sp = shot.speed || 7;
      switch (shot.kind) {
        case 'spread': this._aimShot(x, y, sp, [-0.33, 0, 0.33]); break;
        case 'twin':
          this._shoot(x - b.w * 0.36, y, 0, sp);
          this._shoot(x + b.w * 0.36, y, 0, sp);
          break;
        case 'rain':
          for (let i = 0; i < (shot.n || 4); i++) this._shoot(0.6 + this.rand() * (FW - 1.2), y, 0, sp * (0.75 + this.rand() * 0.3));
          break;
        case 'fan':
          for (let i = 0; i < 7; i++) {
            const a = -0.9 + i * 0.3;
            this._shoot(x, y, Math.sin(a) * sp, Math.cos(a) * sp);
          }
          break;
        default: this._aimShot(x, y, sp);
      }
      this.emit('bossShot', { x, y, kind: shot.kind });
    }

    _summon(spec) {
      const b = this.boss;
      const [r0, r1] = spec.rows;
      const free = [];
      for (let row = r0; row <= r1; row++) {
        for (let col = 0; col < FW; col++) {
          const x = col * BW, y = TOP + row * BH;
          const taken = this.bricks.some(k => k.alive && Math.abs(k.x - x) < 0.99 && Math.abs(k.y - y) < 0.49);
          const nearBoss = x + BW > b.x - b.w / 2 - 0.4 && x < b.x + b.w / 2 + 0.4 && y + BH > b.y - b.h / 2 - 0.4 && y < b.y + b.h / 2 + 0.4;
          const nearBall = this.balls.some(z => z.x > x - 0.5 && z.x < x + BW + 0.5 && z.y > y - 0.5 && z.y < y + BH + 0.5);
          if (!taken && !nearBoss && !nearBall) free.push([col, row]);
        }
      }
      const made = [];
      for (let i = 0; i < spec.n && free.length; i++) {
        const [col, row] = free.splice(Math.floor(this.rand() * free.length), 1)[0];
        const ch = spec.chars[Math.floor(this.rand() * spec.chars.length)];
        const c = parseCell(ch);
        const x0 = col * BW, y0 = TOP + row * BH;
        const brick = {
          id: this.nextId++, row, col, x0, y0, x: x0, y: y0,
          kind: c.kind, color: c.color, hp: c.hp, maxHp: c.hp, alive: true,
          hidden: false, flash: 1, group: null, summoned: true, born: this.time,
          fireT: 2 + this.rand() * 2,
        };
        this.bricks.push(brick);
        made.push(brick);
      }
      // Forget long-gone summoned bricks so the list doesn't grow forever.
      if (this.bricks.length > 400) this.bricks = this.bricks.filter(k => k.alive || !k.summoned);
      if (made.length) this.emit('summon', { bricks: made, x: b.x, y: b.y });
    }

    _ballBoss(ball) {
      const b = this.boss;
      if (b.dead) return;
      for (const s of b.shards) {
        const c = circleRect(ball.x, ball.y, ball.r, s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
        if (!c) continue;
        ball.x += c.nx * c.pen; ball.y += c.ny * c.pen;
        if (this._reflect(ball, c.nx, c.ny)) this.emit('gold', { x: s.x, y: s.y, shard: true });
      }
      const c = circleRect(ball.x, ball.y, ball.r, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      if (!c) return;
      ball.x += c.nx * c.pen; ball.y += c.ny * c.pen;
      this._reflect(ball, c.nx, c.ny);
      if (ball.bossCD <= 0) {
        ball.bossCD = 0.15;
        ball.idle = 0;
        this._bossDamage(this.fx.fire > 0 ? 3 : 1, ball.x, ball.y);
      }
    }

    _bossDamage(d, x, y) {
      const b = this.boss;
      if (!b || b.dead) return;
      b.hp = Math.max(0, b.hp - d);
      b.flash = 1;
      this.score += Math.round(150 * d);
      this.emit('bossHit', { x: x == null ? b.x : x, y: y == null ? b.y : y, d });
      while (b.phase + 1 < b.phases.length && b.hp <= b.maxHp * b.phases[b.phase + 1].at) {
        b.phase++;
        b.shotT = Math.min(b.shotT, 1.2);
        if (b.phases[b.phase].summon) b.summonT = 1.5;
        this.emit('bossPhase', { phase: b.phase, x: b.x, y: b.y });
      }
      if (b.hp <= 0) {
        b.dead = true;
        this.score += 10000;
        this.shots.length = 0;
        this.emit('bossDie', { x: b.x, y: b.y, w: b.w, h: b.h });
      }
    }

    // ---------------- lives, winning, losing ----------------
    _loseLife() {
      if (this.boss && this.boss.dead) return; // the boss is already beaten; just wait for the win
      this.lives--;
      this.lost++;
      for (const k in this.fx) this.fx[k] = 0;
      this.capsules.length = 0;
      this.bolts.length = 0;
      this.shots.length = 0;
      this.combo = 0;
      this.paddleHits = 0;
      this.paddle.stun = 0;
      this.emit('lifeLost', { lives: this.lives });
      if (this.lives <= 0) this._fail('balls');
      else { this.state = 'lost'; this.lostT = 1.1; }
    }

    _fail(reason) {
      if (this.state === 'failed' || this.state === 'won') return;
      this.state = 'failed';
      this.failReason = reason;
      this.emit('fail', { reason });
    }

    par() { return this.level.par || Math.round(25 + this.totalHp * 0.8 + (this.boss ? this.boss.maxHp * 2.5 : 0)); }

    _win() {
      if (this.state === 'won' || this.state === 'failed') return;
      this.state = 'won';
      this.stars = this.lost === 0 ? 3 : this.lost === 1 ? 2 : 1;
      const time = Math.max(0, Math.round(this.par() - this.playTime)) * 50;
      this.bonus = { lives: this.lives * 1000, perfect: this.lost === 0 ? 5000 : 0, time };
      this.score += this.bonus.lives + this.bonus.perfect + this.bonus.time;
      this.capsules.length = 0;
      this.shots.length = 0;
      this.bolts.length = 0;
      for (const ball of this.balls) if (ball.stuck != null) this.release(ball);
      this.emit('win', { stars: this.stars });
    }
  }

  Object.assign(Sim, {
    STEP, FW, FH, BW, BH, TOP, PADDLE_Y, PADDLE_H, BALL_R, MAX_BOUNCE, DANGER_Y,
    CAPSULE_W, CAPSULE_H, CAPSULE_VY, MAX_BALLS, MAX_LIVES, STUN,
    COLORS, POWERS, KIND_PTS, parseCell, rng, hashStr,
  });

  root.Sim = Sim;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
})(typeof self !== 'undefined' ? self : this);
