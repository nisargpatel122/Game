/*
 * Game: ties physics, table and rules together on a fixed timestep.
 * Runs identically in the browser and headless in Node.
 *
 * Input is applied on the physics tick it belongs to: the browser passes the
 * real timestamp of every key/touch event and frame() maps it into sim time,
 * so a flipper press lands on the very next tick after it happened.
 */
(function (NN) {
  'use strict';

  function Game(opts) {
    opts = opts || {};
    this.P = NN.makePhysicsSettings(opts.tuning);
    this.T = NN.buildTable(this.P);
    this.inserts = NN.buildInserts(this.T);
    this.world = new NN.World(this.T, this.P);
    this.rng = NN.U.rng(opts.seed || 777);
    this.fxq = [];
    this.time = 0;
    this.timeScale = 1;
    this.slowLeft = 0;
    this.tickDt = 1 / this.P.tickHz;
    this.acc = 0;
    this.inputQueue = [];
    this.buttons = { L: false, R: false, plunger: false };
    this.flippersEnabled = true;
    this.state = 'idle';         // idle | attract | playing | bonus | gameover
    this.scheduled = [];
    this.serveQueue = [];
    this.scoopBall = null;
    this.lockBalls = [];
    this.mbReleasing = false;
    this.bonus = null;
    this.paused = false;
    this.tableShake = { x: 0, y: 0, vx: 0, vy: 0 };
    this.dropColliders = {};
    for (const c of this.world.colliders) if (c.kind === 'drop') this.dropColliders[c.id] = c;
    this.flipperHold = { L: 0, R: 0 };
    this.rules = new NN.Rules(this);
    this.bot = null;
    this.lastFrameMs = null;
  }

  Game.prototype.fx = function (e) {
    if (e.type === 'slowmo') this.slowmo(e.scale, e.dur);
    if (this.quiet) return;
    this.fxq.push(e);
    if (this.fxq.length > 400) this.fxq.splice(0, this.fxq.length - 400);
  };

  Game.prototype.schedule = function (delay, fn) {
    this.scheduled.push({ t: this.time + delay, fn: fn });
  };

  // Apply new tuning values without rebuilding the table
  Game.prototype.applyTuning = function (tuning) {
    const P = NN.makePhysicsSettings(tuning);
    for (const k in P) this.P[k] = P[k];
    this.world.updateGravity();
  };

  // ------------------------------------------------------------ lifecycle ---
  Game.prototype.clearTable = function () {
    this.world.balls.length = 0;
    this.scheduled.length = 0;
    this.serveQueue.length = 0;
    this.scoopBall = null;
    this.lockBalls = [];
    this.mbReleasing = false;
    this.bonus = null;
    this.timeScale = 1;
    this.slowLeft = 0;
    this.setFlippersEnabled(true);
    this.resetDrops();
    if (this.world.plunger) { this.world.plunger.pull = 0; this.world.plunger.pulling = false; this.world.plunger.launching = false; }
  };

  Game.prototype.startGame = function (difficulty, seed) {
    this.clearTable();
    this.bot = null;
    this.rules.demo = false;
    this.rules.newGame(difficulty || 'arcade', seed);
    this.state = 'playing';
    this.rules.startBall();
    this.serveBall(false);
    this.fx({ type: 'gamestart' });
  };

  Game.prototype.startAttract = function () {
    this.clearTable();
    this.rules.demo = true;
    this.rules.newGame('arcade', (this.rng() * 1e9) | 0);
    this.state = 'attract';
    this.bot = NN.Bot ? new NN.Bot(this, { skill: 0.85, demo: true }) : null;
    this.rules.startBall();
    this.serveBall(true);
  };

  // ----------------------------------------------------------- serving ---
  Game.prototype.shooterBall = function () {
    for (const b of this.world.balls) {
      if (b.state === 'play' && b.x > 464 && b.y > 600) return b;
    }
    return null;
  };

  Game.prototype.serveBall = function (auto) {
    this.serveQueue.push({ auto: !!auto });
    this.processServe();
  };

  Game.prototype.processServe = function () {
    if (!this.serveQueue.length || this.shooterBall() || this.world.plunger.launching) return;
    const s = this.serveQueue.shift();
    const T = this.T;
    const b = this.world.addBall(T.ballStart.x, T.ballStart.y - 20, 0, 0);
    b.fresh = true;
    this.fx({ type: 'sound', id: 'serve' });
    if (s.auto || this.state === 'attract') {
      this.schedule(0.65, () => {
        if (this.shooterBall() === b) {
          const power = this.state === 'attract' ? 0.55 + this.rng() * 0.45 : 0.97;
          this.world.plungerLaunch(power);
          this.fx({ type: 'sound', id: 'autolaunch' });
        }
      });
    }
  };

  Game.prototype.ballsInPlay = function () {
    let n = 0;
    for (const b of this.world.balls) {
      if (b.state === 'play' || b.state === 'wire' || (b.state === 'held' && b.holder === 'scoop')) n++;
    }
    return n + this.serveQueue.length;
  };

  // ------------------------------------------------------------- inputs ---
  Game.prototype.queueInput = function (ev, ms) {
    ev.ms = ms;
    this.inputQueue.push(ev);
  };

  Game.prototype.applyInput = function (ev) {
    const playing = this.state === 'playing';
    switch (ev.type) {
      case 'flip': {
        const side = ev.side;
        if (this.buttons[side] === ev.down) return;
        this.buttons[side] = ev.down;
        const live = (playing || this.state === 'attract') && this.flippersEnabled;
        const fl = this.world.flipperById[side];
        fl.pressed = ev.down && live;
        if (side === 'R') this.world.flipperById.U.pressed = ev.down && live;
        if (live) this.fx({ type: 'sound', id: ev.down ? 'flipUp' : 'flipDown', side: side });
        if (playing) this.rules.onFlipper(side, ev.down);
        if (this.state === 'bonus' && this.buttons.L && this.buttons.R && this.bonus) this.bonus.skip = true;
        break;
      }
      case 'plunger':
        if (!playing) return;
        this.buttons.plunger = ev.down;
        if (this.rules.selecting && ev.down) { this.rules.selectConfirm(); return; }
        this.world.plungerPull(ev.down);
        if (ev.down) this.fx({ type: 'sound', id: 'plungerPull' });
        break;
      case 'plungerSet':
        // touch drag: the plunger eases toward the finger
        if (!playing || this.rules.selecting || this.world.plunger.launching) return;
        if (ev.frac > 0.04 && !(this.world.plunger.target > 0)) this.fx({ type: 'sound', id: 'plungerPull' });
        this.world.plunger.pulling = false;
        this.world.plunger.target = ev.frac * this.P.plungerMaxPull;
        break;
      case 'plungerGo':
        if (!playing) return;
        if (this.rules.selecting) { this.rules.selectConfirm(); return; }
        this.world.plunger.target = null;
        this.world.plungerRelease();
        break;
      case 'plungerTap':
        // touch tap without a drag: a firm launch that suits the skill shot
        if (!playing) return;
        if (this.rules.selecting) { this.rules.selectConfirm(); return; }
        if (this.shooterBall() && !this.world.plunger.launching) this.world.plungerLaunch(ev.power || 0.72);
        break;
      case 'nudge':
        if (!playing) return;
        this.nudge(ev.dir);
        break;
    }
  };

  Game.prototype.nudge = function (dir) {
    const P = this.P;
    const imp = P.nudgeImpulse * (0.9 + this.rng() * 0.2);
    let dvx = 0, dvy = 0;
    if (dir === 'L') { dvx = imp; dvy = -imp * 0.35; this.tableShake.vx -= 320; }
    else if (dir === 'R') { dvx = -imp; dvy = -imp * 0.35; this.tableShake.vx += 320; }
    else { dvy = -imp; this.tableShake.vy -= 320; }
    this.world.nudge(dvx, dvy);
    this.fx({ type: 'sound', id: 'nudge' });
    this.fx({ type: 'vibrate', ms: 25 });
    const r = this.rules.onNudge();
    if (r === 'tilt') this.setFlippersEnabled(false);
  };

  Game.prototype.setFlippersEnabled = function (on) {
    this.flippersEnabled = on;
    for (const f of this.world.flippers) {
      f.enabled = on;
      if (!on) f.pressed = false;
      else f.pressed = f.id === 'L' ? this.buttons.L : this.buttons.R;
    }
  };

  // ------------------------------------------------------- frame / tick ---
  // Called once per animation frame with the frame timestamp in ms.
  Game.prototype.frame = function (nowMs) {
    if (this.lastFrameMs == null) this.lastFrameMs = nowMs;
    let realDt = (nowMs - this.lastFrameMs) / 1000;
    const frameStart = this.lastFrameMs;
    this.lastFrameMs = nowMs;
    if (realDt > 0.1) realDt = 0.1;      // never fast-forward after a stall
    if (realDt < 0) realDt = 0;
    if (this.paused) { this.inputQueue.length = 0; return; }
    if (this.slowLeft > 0) {
      this.slowLeft -= realDt;
      if (this.slowLeft <= 0) this.timeScale = 1;
    }
    const scale = this.timeScale;
    const simStart = this.time + this.acc;
    for (const q of this.inputQueue) {
      if (q.simT == null) q.simT = simStart + Math.max(0, Math.min(realDt, (q.ms - frameStart) / 1000)) * scale;
    }
    this.advance(realDt * scale);
  };

  Game.prototype.advance = function (simDt) {
    this.acc += simDt;
    let guard = 0;
    while (this.acc >= this.tickDt && guard++ < 200) {
      this.acc -= this.tickDt;
      while (this.inputQueue.length && (this.inputQueue[0].simT == null || this.inputQueue[0].simT <= this.time + this.tickDt)) {
        this.applyInput(this.inputQueue.shift());
      }
      this.tick(this.tickDt);
    }
    if (guard >= 200) this.acc = 0;
  };

  Game.prototype.tick = function (dt) {
    const W = this.world;
    if (this.bot && (this.state === 'attract' || this.state === 'playing')) this.bot.update(dt);
    W.tick(dt);
    for (let i = 0; i < W.events.length; i++) this.handleEvent(W.events[i]);
    W.events.length = 0;
    // remove drained balls
    for (let i = W.balls.length - 1; i >= 0; i--) {
      const b = W.balls[i];
      if (b.state === 'gone') { W.balls.splice(i, 1); this.onDrain(b); }
    }
    if (this.state === 'playing' || this.state === 'attract') {
      this.rules.tick(dt);
      this.ballSearch(dt);
    } else {
      this.rules.tick(dt);
    }
    if (this.state === 'bonus') this.bonusTick(dt);
    if (this.serveQueue.length) this.processServe();
    // scheduled callbacks
    if (this.scheduled.length) {
      for (let i = 0; i < this.scheduled.length; i++) {
        const s = this.scheduled[i];
        if (s.t <= this.time) { this.scheduled.splice(i, 1); i--; s.fn(); }
      }
    }
    // nudge shake spring
    const ts = this.tableShake;
    ts.vx += (-ts.x * 900 - ts.vx * 30) * dt; ts.vy += (-ts.y * 900 - ts.vy * 30) * dt;
    ts.x += ts.vx * dt; ts.y += ts.vy * dt;
    this.time += dt;
  };

  Game.prototype.holdingForShow = function () {
    return !!this.scoopBall || this.mbReleasing || !!this.rules.selecting;
  };

  // ------------------------------------------------------------- events ---
  Game.prototype.handleEvent = function (e) {
    const R = this.rules;
    switch (e.type) {
      case 'bumper':
        R.sw('bumper', e.id, e);
        this.fx({ type: 'sound', id: 'bumper', x: e.x, v: e.speed });
        this.fx({ type: 'flash', id: e.id, x: e.x, y: e.y });
        this.fx({ type: 'shake', amt: 0.7 });
        this.fx({ type: 'vibrate', ms: 12 });
        break;
      case 'sling':
        R.sw('sling', e.id, e);
        this.fx({ type: 'sound', id: 'sling', x: e.x });
        this.fx({ type: 'flash', id: e.id, x: e.x, y: e.y });
        this.fx({ type: 'vibrate', ms: 10 });
        break;
      case 'target':
        R.sw('target', e.id, e);
        this.fx({ type: 'flash', id: e.id, x: e.x, y: e.y });
        break;
      case 'drop':
        R.sw('drop', e.id, e);
        this.fx({ type: 'sound', id: 'drop', x: e.x });
        this.fx({ type: 'flash', id: e.id, x: e.x, y: e.y });
        break;
      case 'spin':
        R.sw('spin', e.id, e);
        this.fx({ type: 'sound', id: 'spin' });
        break;
      case 'sensor': this.onSensor(e); break;
      case 'capture':
        if (e.id === 'scoop') this.onScoop(e.ball);
        break;
      case 'escape':
        // should never happen; recover gracefully
        this.fx({ type: 'debug', msg: 'escape at ' + e.x + ',' + e.y });
        this.serveBall(true);
        break;
      case 'wire':
        this.fx({ type: 'sound', id: 'wire' });
        break;
      case 'wireExit':
        this.fx({ type: 'sound', id: 'wireDrop', x: e.ball.x });
        break;
      case 'gate':
        this.fx({ type: 'sound', id: 'gate' });
        break;
      case 'hit':
        this.fx({ type: 'sound', id: 'hit', kind: e.kind, mat: e.mat, v: e.speed, x: e.x });
        if (e.kind === 'post' && e.speed > 600) this.fx({ type: 'flash', id: 'post', x: e.x, y: e.y });
        break;
      case 'plungerRelease':
        this.fx({ type: 'sound', id: 'plungerRelease', power: e.power });
        break;
    }
  };

  Game.prototype.onSensor = function (e) {
    const R = this.rules, id = e.id, b = e.ball;
    if (/^lane\d$/.test(id)) {
      R.sw('lane', id, e);
      this.fx({ type: 'sound', id: 'rollover', x: e.ball.x });
      this.fx({ type: 'flash', id: id, x: e.ball.x, y: e.ball.y });
      return;
    }
    switch (id) {
      case 'inlaneL': case 'inlaneR':
        if (e.dir === 1) { R.sw('inlane', id, e); this.fx({ type: 'sound', id: 'rollover', x: b.x }); }
        break;
      case 'outlaneL': case 'outlaneR':
        if (e.dir === 1) { R.sw('outlane', id, e); this.fx({ type: 'sound', id: 'rollover', x: b.x }); }
        break;
      case 'loTop':
        if (e.dir === 1) R.shot('leftOrbit', { x: b.x, y: b.y + 40 });
        else R.sw('plungePath', id, e);
        break;
      case 'roTop':
        if (e.dir === 1) R.shot('rightOrbit', { x: b.x, y: b.y + 40 });
        break;
      case 'comet':
        if (e.dir === 1) R.shot('comet', { x: b.x, y: b.y + 30 });
        break;
      case 'rampLMade':
        R.shot('leftRamp', { x: b.x, y: b.y });
        break;
      case 'rampRMade': {
        const lock = R.wantsLock();
        R.shot('rightRamp', { x: b.x, y: b.y });
        if (lock) {
          this.lockBall(b);
          const r = R.onLock();
          if (r === 'locked') this.schedule(1.4, () => this.serveBall(false));
        }
        break;
      }
      case 'rampLEntry': case 'rampREntry':
        if (e.dir === 1) this.fx({ type: 'sound', id: 'rampEnter', x: b.x });
        break;
      case 'kickback':
        if (e.dir === 1 && R.sw('kickback', id, e)) this.fireKickback(b);
        break;
      case 'shooterLane':
        if (e.dir === 1) R.sw('launch', id, e);
        break;
    }
  };

  Game.prototype.fireKickback = function (b) {
    b.vy = -this.P.kickbackSpeed * (0.96 + this.rng() * 0.08);
    b.vx = 40 + this.rng() * 60;
    this.fx({ type: 'sound', id: 'kickback', x: b.x });
    this.fx({ type: 'flash', id: 'kickback', x: b.x, y: b.y });
    this.fx({ type: 'shake', amt: 2.5 });
    this.fx({ type: 'vibrate', ms: 40 });
  };

  // ------------------------------------------------------------- scoop ---
  Game.prototype.onScoop = function (b) {
    this.scoopBall = b;
    this.fx({ type: 'sound', id: 'scoopIn' });
    this.fx({ type: 'flash', id: 'scoop', x: b.x, y: b.y });
    const hold = this.rules.onScoop({ x: b.x, y: b.y + 50 });
    if (hold >= 0) this.schedule(hold, () => this.ejectScoop());
  };

  Game.prototype.ejectScoop = function () {
    const b = this.scoopBall;
    if (!b) return;
    this.scoopBall = null;
    const L = this.T.landmarks.scoop;
    b.state = 'play';
    b.holder = null;
    b.x = L.ejectX; b.y = L.ejectY;
    // toward the left flipper, with a little variation
    const a = (102 + (this.rng() - 0.5) * 6) * Math.PI / 180;
    const sp = this.P.scoopEjectSpeed * (0.95 + this.rng() * 0.1);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    b.flipSide = {};
    b.inside = { scoop: true };
    b.lastActive = this.world.time;
    this.fx({ type: 'sound', id: 'scoopOut' });
    this.fx({ type: 'shake', amt: 1.5 });
  };

  // -------------------------------------------------------------- locks ---
  Game.prototype.lockBall = function (b) {
    const L = this.T.landmarks.lock;
    b.state = 'held';
    b.holder = 'lock';
    b.wire = null;
    const slot = this.lockBalls.length;
    b.x = slot === 0 ? L.x : L.x2; b.y = slot === 0 ? L.y : L.y2;
    b.h = 55;
    b.layer = 2;
    this.lockBalls.push(b);
  };

  Game.prototype.startMultiballRelease = function () {
    this.mbReleasing = true;
    const balls = this.lockBalls.slice();
    this.lockBalls = [];
    balls.forEach((b, i) => {
      this.schedule(2.0 + i * 0.8, () => {
        this.world.sendToWire(b, 'wireRR', 1200);
        this.fx({ type: 'sound', id: 'release' });
      });
    });
    this.schedule(2.0 + balls.length * 0.8 + 0.2, () => {
      this.mbReleasing = false;
      // top up to three balls in play
      const want = 3 - this.ballsInPlay();
      for (let i = 0; i < want; i++) this.schedule(i * 0.9, () => this.serveBall(true));
    });
  };

  Game.prototype.addBalls = function (n) {
    for (let i = 0; i < n; i++) this.schedule(i * 0.9, () => this.serveBall(true));
  };

  // -------------------------------------------------------- drop targets ---
  Game.prototype.dropTarget = function (id, down) {
    const c = this.dropColliders[id];
    if (c) c.active = !down;
    this.fx({ type: 'drop', id: id, down: down });
  };

  Game.prototype.resetDrops = function () {
    const S = NN.Shapes, sc = { nx: 0, ny: 0, d: 0 };
    let blocked = false;
    for (const id in this.dropColliders) {
      const c = this.dropColliders[id];
      if (c.active) continue;
      // don't pop a target up through a ball
      for (const b of this.world.balls) {
        if (b.state !== 'play') continue;
        S.closest(c, b.x, b.y, sc);
        if (sc.d < b.r + 1) blocked = true;
      }
    }
    if (blocked) { this.schedule(0.3, () => this.resetDrops()); return; }
    for (const id in this.dropColliders) {
      if (!this.dropColliders[id].active) {
        this.dropColliders[id].active = true;
        this.fx({ type: 'drop', id: id, down: false });
      }
    }
    if (this.rules) this.rules.dropsState = [false, false, false];
  };

  // ------------------------------------------------------------- drains ---
  Game.prototype.onDrain = function (b) {
    if (this.state !== 'playing' && this.state !== 'attract') return;
    const inPlay = this.ballsInPlay();
    const r = this.rules.onDrain(inPlay);
    if (r === 'saved') {
      this.serveBall(true);
    } else if (r === 'end') {
      this.endOfBall();
    }
  };

  Game.prototype.endOfBall = function () {
    const R = this.rules;
    R.endBallModes();
    this.fx({ type: 'music', state: 'off' });
    if (R.tilted) {
      this.schedule(1.5, () => this.finishBall());
      this.state = 'bonus';
      this.bonus = { items: [], done: true, t: 0, wait: 2.0 };
      return;
    }
    const items = R.bonusItems();
    this.state = 'bonus';
    this.bonus = { items: items, i: -1, t: 0, total: 0, x: R.bonusX, phase: 'items', skip: false };
    this.fx({ type: 'bonusStart' });
  };

  // Item-by-item bonus count. Each item ticks up, then the multiplier, then the total.
  Game.prototype.bonusTick = function (dt) {
    const B = this.bonus;
    if (!B) return;
    if (B.done) {
      B.wait -= dt;
      return;
    }
    B.t += dt;
    const step = B.skip ? 0 : 0.62;
    if (B.phase === 'items') {
      if (B.i < 0 || B.t >= step) {
        B.t = 0;
        B.i++;
        if (B.i >= B.items.length) {
          B.phase = 'mult';
        } else {
          B.total += B.items[B.i].value;
          if (!B.skip) this.fx({ type: 'sound', id: 'bonusTick', n: B.i });
        }
      }
    } else if (B.phase === 'mult') {
      if (B.t >= (B.skip ? 0 : 0.8)) {
        B.t = 0;
        B.phase = 'total';
        B.grand = B.total * B.x;
        if (!B.skip) this.fx({ type: 'sound', id: 'bonusTotal' });
      }
    } else if (B.phase === 'total') {
      if (B.t >= (B.skip ? 0.25 : 1.3)) {
        this.rules.award(B.grand);
        B.phase = 'end';
        this.bonus = null;
        this.finishBall();
      }
    }
  };

  Game.prototype.finishBall = function () {
    this.bonus = null;
    const r = this.rules.advanceBall();
    if (r === 'over') {
      this.state = 'gameover';
      this.fx({ type: 'gameover', score: this.rules.score, stats: this.rules.gstats, difficulty: this.rules.difficulty, demo: this.rules.demo });
      if (this.rules.demo) this.schedule(4, () => this.startAttract());
      return;
    }
    this.state = this.rules.demo ? 'attract' : 'playing';
    this.setFlippersEnabled(true);
    this.rules.startBall();
    this.serveBall(this.rules.demo);
  };

  // --------------------------------------------------------- ball search ---
  // A ball resting where it shouldn't gets a gentle kick, like a real
  // machine pulsing its coils. Repeated failures re-serve the ball.
  Game.prototype.ballSearch = function (dt) {
    for (const b of this.world.balls) {
      if (b.state !== 'play') { b.stillT = 0; continue; }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 25) { b.stillT = 0; continue; }
      if (b.x > 464) { b.stillT = 0; continue; }        // resting on the plunger
      let cradled = false;
      for (const f of this.world.flippers) {
        if (f.pressed && Math.hypot(b.x - f.px, b.y - f.py) < f.length + 20) cradled = true;
      }
      if (cradled) { b.stillT = 0; continue; }
      b.stillT = (b.stillT || 0) + dt;
      if (b.stillT > 5) {
        b.stillT = 0;
        b.searches = (b.searches || 0) + 1;
        this.fx({ type: 'sound', id: 'search' });
        this.fx({ type: 'lampshow', id: 'flashAll', dur: 0.3 });
        if (b.searches > 4) {
          b.state = 'gone';
          this.world.removeBall(b);
          this.serveBall(true);
          return;
        }
        const a = -Math.PI / 2 + (this.rng() - 0.5) * 2.2;
        const kick = 500 + this.rng() * 500;
        b.vx += Math.cos(a) * kick; b.vy += Math.sin(a) * kick;
      }
    }
  };

  // ----------------------------------------------------------- slow-mo ---
  Game.prototype.slowmo = function (scale, dur) {
    this.timeScale = scale;
    this.slowLeft = dur;
  };

  NN.Game = Game;
})(globalThis.NN || (globalThis.NN = {}));
