/* Brick Blitz — a simulated player. The level tools use it to check that every level can be
 * beaten and to measure how hard each one is, and it plays the demo behind the title screen.
 * It sees the game the way a person roughly does: it reacts a beat late, misjudges fast balls,
 * now and then loses track of one, and aims for bricks with the paddle's edges. */
(function (root) {
  'use strict';

  const Sim = root.Sim || require('./sim.js');
  const { FW, PADDLE_Y, MAX_BOUNCE, CAPSULE_H, CAPSULE_W, CAPSULE_VY, STEP, BW, BH } = Sim;

  // An average player. Lower err/lapse/aim and higher speed is a better player.
  const AVERAGE = {
    react: 0.2,   // seconds before reacting to a ball that changed direction
    err: 0.85,    // misjudged landing spot (field units) for an 11/s ball, grows with speed
    lapse: 0.06,  // chance per return of reacting late, grows with speed
    late: 0.35,   // how late, at most (seconds)
    speed: 20,    // fastest the finger moves the paddle
    aim: 0.12,    // noise when steering the ball with the paddle edge
    edge: 0.6,    // how far toward the paddle edge it dares to aim (0..1)
    greed: 0.8,   // chance of going for a good power-up
    dodge: 0.75,  // chance of dodging a bad power-up or a shot
  };

  function gauss(rand) {
    return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  }

  // Where a ball crosses the paddle line, bouncing off the side walls (bricks ignored).
  function landing(ball) {
    if (ball.vy <= 0) return null;
    const t = (PADDLE_Y - ball.r - ball.y) / ball.vy;
    if (t < 0) return null;
    const lo = ball.r, span = FW - 2 * ball.r;
    let x = ball.x + ball.vx * t - lo;
    x = ((x % (2 * span)) + 2 * span) % (2 * span);
    if (x > span) x = 2 * span - x;
    return { x: x + lo, t };
  }

  class Bot {
    constructor(sim, opts) {
      opts = opts || {};
      this.sim = sim;
      this.rand = Sim.rng(opts.seed || 1);
      this.skill = Object.assign({}, AVERAGE, opts.skill);
      sim.input.maxSpeed = this.skill.speed;
      this.look = 0;
      this.target = sim.paddle.x;
      this.track = null;
      this.serveX = null;
      this.holdT = 0;
    }

    think() {
      const sim = this.sim;
      this.look -= STEP;
      if (sim.state === 'serve') {
        if (this.serveX == null) { this.serveX = 1.5 + this.rand() * (FW - 3); this.holdT = 0.25 + this.rand() * 0.5; }
        sim.input.x = this.serveX;
        if (Math.abs(sim.paddle.x - this.serveX) < 0.05) {
          this.holdT -= STEP;
          if (this.holdT <= 0) sim.input.launch = true;
        }
        return;
      }
      this.serveX = null;
      if (sim.state !== 'play') return;
      if (this.look > 0) { sim.input.x = this.target; return; }
      this.look = 0.05;

      const p = sim.paddle, half = p.w / 2;
      // Magnet: aim, then let go.
      const stuck = sim.balls.find(b => b.stuck != null);
      if (stuck && stuck.stuckT > 0.25 + this.rand() * 0.4) sim.input.launch = true;

      // The ball that will reach the paddle first.
      let urgent = null, land = null;
      for (const b of sim.balls) {
        if (b.stuck != null) continue;
        const l = landing(b);
        if (l && (!land || l.t < land.t)) { urgent = b; land = l; }
      }
      let want;
      if (!urgent) {
        // Everything is flying upward: drift under the lowest ball.
        let low = null;
        for (const b of sim.balls) if (b.stuck == null && (!low || b.y > low.y)) low = b;
        want = low ? low.x : p.x;
        this.track = null;
      } else {
        const tr = this._track(urgent, land);
        if (tr.wait > 0) { tr.wait -= this.look; sim.input.x = this.target; return; }
        const fade = 0.45 + 0.55 * Math.min(1, land.t / 0.9);
        const seen = land.x + tr.err * fade;
        want = seen - tr.aim * half;
        want = this._powerUps(want, land, half);
        want = this._dodge(want, seen, land, half);
      }
      this.target = Math.max(half, Math.min(FW - half, want));
      sim.input.x = this.target;
    }

    // A new return of the ball: misjudge it a little (or a lot), and pick a brick to aim at.
    _track(ball, land) {
      const tr = this.track;
      if (tr && tr.ball === ball && Math.abs(tr.vx - ball.vx) + Math.abs(tr.vy - ball.vy) < 0.6) return tr;
      const sk = this.skill, rand = this.rand;
      const sp = Math.hypot(ball.vx, ball.vy) / 11;
      const err = gauss(rand) * sk.err * sp * sp;
      // It takes a moment to notice the ball changed course, longer now and then.
      let wait = sk.react * (0.75 + rand() * 0.5);
      if (rand() < sk.lapse * sp * sp) wait += rand() * sk.late;
      const aim = this._aim(land.x) + gauss(rand) * sk.aim;
      this.track = { ball, vx: ball.vx, vy: ball.vy, err, wait, aim: Math.max(-0.95, Math.min(0.95, aim)) };
      return this.track;
    }

    // Choose where on the paddle to take the ball (-1 left edge .. 1 right edge) so it heads
    // for an exposed brick, banking off a side wall if that's easier.
    _aim(lx) {
      const sim = this.sim, sk = this.skill;
      // The paddle can't go past the walls, which limits where on it a ball near a wall can land.
      const half = sim.paddle.w / 2;
      const tmin = Math.max(-sk.edge, (lx - (FW - half)) / half), tmax = Math.min(sk.edge, (lx - half) / half);
      const open = [];
      for (const b of sim.bricks) {
        if (!b.alive || b.hidden || b.kind === 'gold') continue;
        const below = sim.bricks.some(o => o.alive && o !== b && Math.abs(o.x - b.x) < 0.5 && o.y > b.y && o.y - b.y < BH * 1.5);
        if (!below) open.push(b);
      }
      if (sim.boss && !sim.boss.dead) open.push({ x: sim.boss.x - BW / 2, y: sim.boss.y, boss: true });
      if (!open.length) return Math.max(tmin, Math.min(tmax, (this.rand() - 0.5) * 0.6));
      const tgt = open[Math.floor(this.rand() * open.length)];
      const tx = tgt.x + BW / 2, ty = tgt.y + BH / 2;
      // The ball leaves at t * MAX_BOUNCE from vertical, where t = (ball - paddle) / half.
      // Try the direct shot and banks off either wall; take the one the paddle can make.
      let best = null, bestMiss = Infinity;
      for (const x of [tx, -tx, 2 * FW - tx]) {
        const t = Math.atan2(x - lx, PADDLE_Y - ty) / MAX_BOUNCE;
        const ok = Math.max(tmin, Math.min(tmax, t));
        const miss = Math.abs(ok - t) + Math.abs(t) * 0.01;
        if (miss < bestMiss) { bestMiss = miss; best = ok; }
      }
      return best;
    }

    // Go for a good capsule if there's time to catch it and still get back to the ball.
    _powerUps(want, land, half) {
      const sim = this.sim, sk = this.skill, p = sim.paddle;
      for (const c of sim.capsules) {
        const good = Sim.POWERS[c.type].good;
        if (!good) continue;
        const tc = (PADDLE_Y - c.y - CAPSULE_H / 2) / CAPSULE_VY;
        if (tc < 0 || tc > 2) continue;
        if (this.rand() > sk.greed) continue;
        const reach = Math.abs(c.x - p.x) - half;
        if (reach > sk.speed * tc) continue;
        const back = Math.max(0, Math.abs(want - c.x) - half * 0.6) / sk.speed;
        if (tc + back + 0.15 < land.t) return c.x;
        // The capsule will arrive with the ball: catch both if one paddle position covers them.
        if (Math.abs(tc - land.t) < 0.4 && Math.abs(c.x - want) < half + CAPSULE_W / 2 - 0.1) return want;
      }
      return want;
    }

    // Shift the paddle so a bad capsule or a shot misses it, as long as the ball is still caught.
    _dodge(want, seen, land, half) {
      const sim = this.sim, sk = this.skill;
      const threats = [];
      for (const c of sim.capsules) {
        if (Sim.POWERS[c.type].good) continue;
        const tc = (PADDLE_Y - c.y - CAPSULE_H / 2) / CAPSULE_VY;
        if (tc > 0 && tc < 0.8) threats.push({ x: c.x, w: CAPSULE_W / 2, t: tc });
      }
      for (const s of sim.shots) {
        const ts = (PADDLE_Y - s.y) / s.vy;
        if (ts > 0 && ts < 0.8) threats.push({ x: s.x + s.vx * ts, w: s.r, t: ts });
      }
      for (const th of threats) {
        if (Math.abs(th.x - want) > half + th.w) continue;
        if (this.rand() > sk.dodge) continue;
        for (const side of [-1, 1]) {
          const alt = th.x + side * (half + th.w + 0.08);
          // Still under the ball if it arrives first; any spot will do if it arrives later.
          if (land.t > th.t + 0.35 || Math.abs(seen - alt) < half * 0.85) return alt;
        }
      }
      return want;
    }
  }

  // Play a level to the end. Returns what happened.
  function play(level, opts) {
    opts = opts || {};
    const sim = new Sim(level, { seed: opts.seed });
    const bot = new Bot(sim, { seed: (opts.seed || 1) * 7919 + 13, skill: opts.skill });
    if (opts.lives) sim.lives = opts.lives;
    const limit = (opts.limit || 480) / STEP;
    let n = 0;
    while (sim.state !== 'won' && sim.state !== 'failed' && n++ < limit) {
      bot.think();
      sim.step();
    }
    return {
      won: sim.state === 'won', state: sim.state, reason: sim.failReason, lost: sim.lost,
      time: sim.playTime, score: sim.score, stars: sim.stars, left: sim.remaining,
      boss: sim.boss ? sim.boss.hp : null, timeout: n >= limit,
    };
  }

  const api = { Bot, play, landing, AVERAGE };
  root.Bot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
