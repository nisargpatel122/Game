/*
 * Auto-flipper bot. Plays the attract-mode demo and the headless balance
 * simulations. It watches each ball, flips when the ball is about to meet a
 * flipper, and (when skilled) catches balls in the cradle and aims at a lit
 * shot using a learned timing table.
 */
(function (NN) {
  'use strict';

  function Bot(game, opts) {
    opts = opts || {};
    this.game = game;
    this.skill = opts.skill == null ? 0.7 : opts.skill;   // 0..1
    this.aim = opts.aim !== false && this.skill >= 0.5;
    this.rng = NN.U.rng(opts.seed || 99);
    this.hold = { L: 0, R: 0 };
    this.state = { L: 'idle', R: 'idle' };
    this.timer = { L: 0, R: 0 };
    this.plan = { L: null, R: null };
    this.plungeT = 0;
    this.sc = { nx: 0, ny: 0, d: 0, lat: 0, ax: 0 };
    this.table = opts.timing || NN.BOT_TIMING || null;
  }

  Bot.prototype.press = function (side, down) {
    const g = this.game;
    if (g.buttons[side] === down) return;
    g.applyInput({ type: 'flip', side: side, down: down });
  };

  // is ball b heading into flipper f's swept area?
  Bot.prototype.threat = function (b, f) {
    const dx = b.x - f.px, dy = b.y - f.py;
    const dist = Math.hypot(dx, dy);
    if (dist > f.length + 45) return false;
    if (b.y > f.py + 40) return false;
    f.closest(b.x, b.y, this.sc);
    // on the top side of the bat, close, and coming down or slow
    const lead = Math.max(0, b.vy) * 0.03;
    return this.sc.d < 18 + lead && b.vy > -250;
  };

  Bot.prototype.update = function (dt) {
    const g = this.game;
    const W = g.world;
    // plunge any ball waiting in the shooter lane
    const sb = g.shooterBall();
    if (sb && g.state === 'playing' && Math.hypot(sb.vx, sb.vy) < 5 && !W.plunger.launching) {
      this.plungeT += dt;
      if (this.plungeT > 0.6) {
        this.plungeT = 0;
        W.plungerLaunch(0.55 + this.rng() * 0.45);
      }
    } else this.plungeT = 0;
    if (g.rules.selecting && this.rng() < dt * 1.5) g.rules.selectConfirm();
    for (const side of ['L', 'R']) this.updateSide(side, dt);
  };

  Bot.prototype.updateSide = function (side, dt) {
    const g = this.game, W = g.world;
    const f = W.flipperById[side];
    const flippers = side === 'R' ? [f, W.flipperById.U] : [f];
    this.timer[side] -= dt;
    let threat = null;
    for (const b of W.balls) {
      if (b.state !== 'play' || b.layer !== 0) continue;
      for (const ff of flippers) if (this.threat(b, ff)) { threat = { b: b, f: ff }; break; }
      if (threat) break;
    }
    const st = this.state[side];
    if (st === 'idle') {
      if (threat) {
        // reaction: skilled bots react almost instantly, sloppy ones late or early
        const jitter = (1 - this.skill) * 0.05;
        this.timer[side] = Math.max(0, (this.rng() - 0.3) * jitter);
        this.state[side] = 'arming';
      }
    } else if (st === 'arming') {
      if (this.timer[side] <= 0) {
        this.press(side, true);
        this.state[side] = 'up';
        this.timer[side] = 0.14 + this.rng() * 0.08;
      }
    } else if (st === 'up') {
      if (this.timer[side] <= 0) {
        // keep holding if a ball is resting on this flipper (cradle), then shoot later
        let resting = null;
        for (const b of W.balls) {
          if (b.state !== 'play') continue;
          if (Math.hypot(b.x - f.px, b.y - f.py) < f.length && Math.hypot(b.vx, b.vy) < 120) resting = b;
        }
        if (resting && this.aim && W.balls.length <= 2) {
          this.state[side] = 'cradle';
          this.timer[side] = 0.4 + this.rng() * 0.6;
        } else {
          this.press(side, false);
          this.state[side] = 'cool';
          this.timer[side] = 0.06;
        }
      }
    } else if (st === 'cradle') {
      if (this.timer[side] <= 0) {
        // release, let the ball roll, re-flip after a chosen delay
        this.press(side, false);
        this.state[side] = 'aimwait';
        this.timer[side] = this.pickDelay(side);
      }
    } else if (st === 'aimwait') {
      if (this.timer[side] <= 0) {
        this.press(side, true);
        this.state[side] = 'up2';
        this.timer[side] = 0.18;
      }
    } else if (st === 'up2') {
      if (this.timer[side] <= 0) {
        this.press(side, false);
        this.state[side] = 'cool';
        this.timer[side] = 0.06;
      }
    } else if (st === 'cool') {
      if (this.timer[side] <= 0) this.state[side] = 'idle';
    }
  };

  // Choose a release-to-flip delay aimed at a lit shot (from the timing table)
  Bot.prototype.pickDelay = function (side) {
    const T = this.table && this.table[side];
    if (T) {
      const lamps = this.game.rules.lamps();
      const wanted = [];
      for (const s of NN.MAJOR_SHOTS) {
        const l = lamps['arrow_' + s];
        if (l && (typeof l === 'number' ? l > 1 : l.s > 1)) wanted.push(s);
      }
      const pool = wanted.length ? wanted : ['leftRamp', 'rightRamp', 'scoop', 'leftOrbit', 'rightOrbit'];
      const opts = [];
      for (const s of pool) if (T[s]) for (const d of T[s]) opts.push(d);
      if (opts.length) {
        const d = opts[Math.floor(this.rng() * opts.length)];
        return d + (this.rng() - 0.5) * (1 - this.skill) * 0.03;
      }
    }
    return 0.28 + this.rng() * 0.14;
  };

  NN.Bot = Bot;
})(globalThis.NN || (globalThis.NN = {}));
