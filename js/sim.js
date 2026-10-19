/* Angry Flock — physics simulation.
 * Pure game logic on top of Planck.js (a Box2D port). No drawing here, so the
 * same code runs in the browser and in Node (used by tools/check-levels.js).
 * Units are metres, y points up, ground top is y = 0.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./vendor/planck.min.js'));
  } else {
    root.Sim = factory(root.planck);
  }
})(typeof self !== 'undefined' ? self : this, function (pl) {
  'use strict';

  const Vec2 = pl.Vec2;
  const GRAVITY = 10;
  const STEP = 1 / 60;
  const SLING_HEIGHT = 2.3;
  const DAMAGE_SPEED = 1.5; // approach speed (m/s) below which contacts do no damage
  const COLLAPSE_DAMAGE = 0.45; // blocks hurt each other less than birds hurt them

  const MATERIALS = {
    glass: { density: 1.2, friction: 0.35, restitution: 0.05, hp: 4, score: 300 },
    wood: { density: 1.6, friction: 0.7, restitution: 0.05, hp: 11, score: 500 },
    stone: { density: 4.0, friction: 0.85, restitution: 0.02, hp: 32, score: 800 },
    tnt: { density: 1.4, friction: 0.7, restitution: 0.05, hp: 3, score: 500,
      explode: { r: 3.4, power: 28, dmg: 30 } },
  };
  const REF_AREA = 0.77; // a 0.88 m square; block hp scales with area relative to this

  // vs = damage multiplier against materials (like the original's bird strengths)
  const BIRDS = {
    red: { r: 0.42, density: 5, vs: { stone: 0.8 }, name: 'Red', tip: 'Pull back and release!' },
    blue: { r: 0.3, density: 5, vs: { glass: 3.5, wood: 0.5, stone: 0.3 }, name: 'Blues',
      tip: 'Tap mid-air to split into three. Great against glass!' },
    yellow: { r: 0.42, density: 4.5, vs: { wood: 2.6, glass: 1.2, stone: 0.5 }, name: 'Chuck',
      tip: 'Tap mid-air for a burst of speed. Smashes wood!' },
    black: { r: 0.5, density: 6, vs: { stone: 1.4 }, name: 'Bomb',
      tip: 'Tap to explode. He also blows up on his own after a hit.' },
    white: { r: 0.48, density: 4.5, vs: {}, name: 'Matilda',
      tip: 'Tap mid-air to drop an explosive egg straight down.' },
    big: { r: 0.78, density: 6, vs: { stone: 1.6, wood: 1.3 }, name: 'Terence',
      tip: 'Big and heavy. Just aim at the base!' },
  };

  const PIGS = {
    small: { r: 0.42, hp: 2.2 },
    medium: { r: 0.58, hp: 3.6 },
    large: { r: 0.78, hp: 5.5 },
    helmet: { r: 0.58, hp: 9, helmet: true },
    king: { r: 0.9, hp: 13, crown: true },
  };

  const PIG_SCORE = 5000;
  const SPARE_BIRD_SCORE = 10000;

  let nextId = 1;

  // Deterministic little PRNG so cracks/textures look the same every time.
  function rand(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function len(x, y) { return Math.sqrt(x * x + y * y); }

  class Sim {
    constructor(level, opts) {
      opts = opts || {};
      this.level = level;
      this.onEvent = opts.onEvent || function () {};
      this.t = 0;
      this.score = 0;
      this.state = 'aim';
      this.birdQueue = level.birds.slice();
      this.birdIndex = 0;
      this.projectiles = []; // live birds and eggs
      this.blocks = [];
      this.pigs = [];
      this.terrain = [];
      this.planets = (level.planets || []).map(p => Object.assign({ g: 12, field: p.r * 2.4 }, p));
      this.space = !!level.space;
      this.objective = level.objective || { type: 'pigs' };
      this.toDestroy = [];
      this.explosions = [];
      this.trail = [];
      this.noDamage = true;
      this.shot = null;
      this.winTimer = -1;
      this.endTimer = 0;
      this.hitSoundCooldown = 0;

      const sling = level.sling || { x: 0, y: 0 };
      this.sling = { x: sling.x, y: sling.y, restX: sling.x, restY: sling.y + SLING_HEIGHT };
      this.maxSpeed = level.maxSpeed || 22;

      this._build();
      this._computeBounds();
      // Let structures settle before the player sees them, with damage off.
      for (let i = 0; i < 120; i++) this._physicsStep();
      this.noDamage = false;
      this.toDestroy.length = 0;
      this.explosions.length = 0;
      this.score = 0;
      this.blocksTotal = this.blocks.length;
      this.pigsTotal = this.pigs.length;
      this.blockScoreTotal = this.blocks.reduce((s, b) => s + MATERIALS[b.mat].score, 0);
    }

    // ---------- construction ----------

    _build() {
      const L = this.level;
      this.world = new pl.World({ gravity: this.space ? Vec2(0, 0) : Vec2(0, -GRAVITY) });
      this.world.on('pre-solve', (c) => this._preSolve(c));

      if (!this.space && L.ground !== false) {
        const g = this.world.createBody({ type: 'static' });
        g.createFixture(pl.Box(200, 10, Vec2(40, -10)), { friction: 0.9 });
        g.setUserData({ kind: 'ground' });
      }
      for (const t of L.terrain || []) this._addTerrain(t);
      for (const p of this.planets) {
        const b = this.world.createBody({ type: 'static', position: Vec2(p.x, p.y) });
        b.createFixture(pl.Circle(p.r), { friction: 0.9 });
        b.setUserData({ kind: 'planet', planet: p });
        p.body = b;
      }
      for (const d of L.blocks || []) this._addBlock(d);
      for (const d of L.pigs || []) this._addPig(d);
    }

    _addTerrain(t) {
      const b = this.world.createBody({ type: 'static' });
      let ent;
      if (t.pts) {
        b.createFixture(pl.Polygon(t.pts.map(p => Vec2(p[0], p[1]))), { friction: 0.9 });
        ent = { kind: 'terrain', pts: t.pts, style: t.style || 'earth' };
      } else {
        const w = t.x2 - t.x1, h = t.y2 - t.y1;
        b.createFixture(pl.Box(w / 2, h / 2, Vec2(t.x1 + w / 2, t.y1 + h / 2)), { friction: 0.9 });
        ent = { kind: 'terrain', pts: [[t.x1, t.y1], [t.x2, t.y1], [t.x2, t.y2], [t.x1, t.y2]], style: t.style || 'earth' };
      }
      b.setUserData(ent);
      this.terrain.push(ent);
    }

    _addBlock(d) {
      const mat = MATERIALS[d.m];
      if (!mat) throw new Error('Unknown material ' + d.m);
      const body = this.world.createBody({
        type: 'dynamic',
        position: Vec2(d.x, d.y),
        angle: (d.a || 0) * Math.PI / 180,
      });
      let shape, area, ent;
      const id = nextId++;
      if (d.r) {
        shape = pl.Circle(d.r);
        area = Math.PI * d.r * d.r;
        ent = { shape: 'circle', r: d.r };
      } else if (d.tri) {
        const pts = [[-d.w / 2, -d.h / 2], [d.w / 2, -d.h / 2], d.tri === 'right' ? [-d.w / 2, d.h / 2] : [0, d.h / 2]];
        shape = pl.Polygon(pts.map(p => Vec2(p[0], p[1])));
        area = d.w * d.h / 2;
        ent = { shape: 'tri', pts, w: d.w, h: d.h };
      } else {
        shape = pl.Box(d.w / 2, d.h / 2);
        area = d.w * d.h;
        ent = { shape: 'box', w: d.w, h: d.h };
      }
      body.createFixture(shape, { density: mat.density, friction: mat.friction, restitution: mat.restitution });
      const hp = mat.hp * Math.min(2.6, Math.max(0.5, area / REF_AREA));
      Object.assign(ent, { kind: 'block', id, mat: d.m, body, hp, maxHp: hp, dead: false, seed: id * 7919 });
      if (this.space) { body.setLinearDamping(0.05); body.setAngularDamping(0.1); }
      body.setUserData(ent);
      this.blocks.push(ent);
      return ent;
    }

    _addPig(d) {
      const type = PIGS[d.p] || PIGS.small;
      const body = this.world.createBody({
        type: 'dynamic',
        position: Vec2(d.x, d.y),
        angularDamping: 2.5,
        linearDamping: this.space ? 0.05 : 0,
      });
      body.createFixture(pl.Circle(type.r), { density: 1.0, friction: 0.9, restitution: 0.1 });
      const ent = {
        kind: 'pig', id: nextId++, type: d.p || 'small', r: type.r, body,
        hp: type.hp, maxHp: type.hp, dead: false, blink: Math.random() * 4,
      };
      body.setUserData(ent);
      this.pigs.push(ent);
      return ent;
    }

    _computeBounds() {
      let x1 = this.sling.x - 4, x2 = this.sling.x + 10, y1 = this.space ? this.sling.y - 6 : 0, y2 = this.sling.y + 8;
      const grow = (x, y, r) => {
        x1 = Math.min(x1, x - r); x2 = Math.max(x2, x + r);
        y1 = Math.min(y1, y - r); y2 = Math.max(y2, y + r);
      };
      for (const b of this.blocks) { const p = b.body.getPosition(); grow(p.x, p.y, Math.max(b.w || 0, b.h || 0, b.r || 0)); }
      for (const p of this.pigs) { const q = p.body.getPosition(); grow(q.x, q.y, p.r); }
      for (const t of this.terrain) for (const q of t.pts) grow(q[0], q[1], 0);
      for (const p of this.planets) grow(p.x, p.y, p.r + 1);
      // The camera's natural framing of the level.
      this.view = this.level.view || {
        x1: this.space ? x1 - 1.5 : x1, x2: x2 + (this.space ? 2 : 1.2),
        y1: this.space ? y1 - 2 : -1.2,
        y2: Math.max(y2 + 2.5, this.space ? y2 + 2 : 12),
      };
      const m = this.space ? 30 : 25;
      this.bounds = { x1: this.view.x1 - m, x2: this.view.x2 + m, y1: this.space ? this.view.y1 - m : -20, y2: this.view.y2 + 60 };
    }

    // ---------- gravity (space levels have planets with local gravity fields) ----------

    gravityAt(x, y) {
      if (!this.space) return { x: 0, y: -GRAVITY };
      let gx = 0, gy = 0;
      for (const p of this.planets) {
        const dx = p.x - x, dy = p.y - y;
        const d = len(dx, dy);
        if (d < p.field && d > 0.001) {
          gx += dx / d * p.g;
          gy += dy / d * p.g;
        }
      }
      return { x: gx, y: gy };
    }

    _applyFieldGravity() {
      for (let b = this.world.getBodyList(); b; b = b.getNext()) {
        if (!b.isDynamic() || !b.isAwake()) continue;
        const p = b.getPosition();
        const g = this.gravityAt(p.x, p.y);
        if (g.x || g.y) {
          const m = b.getMass();
          b.applyForceToCenter(Vec2(g.x * m, g.y * m), false);
        }
      }
    }

    // ---------- shooting ----------

    get currentBird() { return this.birdQueue[this.birdIndex]; }
    get birdsLeft() { return this.birdQueue.length - this.birdIndex; }

    launch(vx, vy) {
      if (this.state !== 'aim') return;
      const type = this.currentBird;
      const bird = this._spawnBird(type, this.sling.restX, this.sling.restY, vx, vy);
      this.birdIndex++;
      this.state = 'flying';
      this.shot = { t: 0, goneT: 0, main: bird };
      this.trail = [];
      this.onEvent('launch', { type, x: bird.body.getPosition().x, y: bird.body.getPosition().y });
    }

    _spawnBird(type, x, y, vx, vy, group) {
      const spec = BIRDS[type];
      const body = this.world.createBody({
        type: 'dynamic', position: Vec2(x, y), bullet: true, angularDamping: 0.6,
        linearVelocity: Vec2(vx, vy),
      });
      body.createFixture(pl.Circle(spec.r), {
        density: spec.density, friction: 0.8, restitution: 0.25,
        filterGroupIndex: group || 0,
      });
      const ent = {
        kind: 'bird', type, r: spec.r, body, id: nextId++,
        t: 0, hitT: -1, slowT: 0, abilityUsed: type === 'red' || type === 'big', dead: false,
      };
      body.setUserData(ent);
      this.projectiles.push(ent);
      return ent;
    }

    // Tap during flight. Returns true if something happened.
    ability() {
      if (this.state !== 'flying' || !this.shot) return false;
      const bird = this.shot.main;
      if (!bird || bird.dead || bird.abilityUsed) return false;
      const type = bird.type;
      if (type !== 'black' && bird.hitT >= 0) return false; // must be used before impact
      const b = bird.body, p = b.getPosition(), v = b.getLinearVelocity();
      bird.abilityUsed = true;
      if (type === 'blue') {
        const sp = len(v.x, v.y) || 1;
        const nx = -v.y / sp, ny = v.x / sp;
        for (const s of [-1, 1]) {
          const ang = 0.2 * s;
          const c = Math.cos(ang), si = Math.sin(ang);
          const kid = this._spawnBird('blue', p.x + nx * s * 0.7, p.y + ny * s * 0.7, v.x * c - v.y * si, v.x * si + v.y * c);
          kid.abilityUsed = true;
        }
      } else if (type === 'yellow') {
        const sp = len(v.x, v.y) || 1;
        const ns = Math.min(42, sp * 1.8 + 9);
        b.setLinearVelocity(Vec2(v.x / sp * ns, v.y / sp * ns));
      } else if (type === 'black') {
        this._explodeBird(bird);
      } else if (type === 'white') {
        const group = -(nextId++);
        b.getFixtureList().setFilterData({ groupIndex: group, categoryBits: 1, maskBits: 0xffff });
        const egg = this.world.createBody({
          type: 'dynamic', position: Vec2(p.x, p.y - 0.5), bullet: true,
          linearVelocity: Vec2(v.x * 0.15, -24),
        });
        egg.createFixture(pl.Circle(0.3), { density: 8, friction: 0.5, filterGroupIndex: group });
        const ent = { kind: 'egg', r: 0.3, body: egg, id: nextId++, t: 0, dead: false };
        egg.setUserData(ent);
        this.projectiles.push(ent);
        b.setLinearVelocity(Vec2(v.x * 1.3 + 6, 14));
      } else {
        return false;
      }
      this.onEvent('ability', { type, x: p.x, y: p.y });
      return true;
    }

    _explodeBird(bird) {
      const p = bird.body.getPosition();
      this.explosions.push({ x: p.x, y: p.y, r: 3.4, power: 34, dmg: 38 });
      this._removeProjectile(bird, false);
    }

    _removeProjectile(ent, poof) {
      if (ent.dead) return;
      ent.dead = true;
      const p = ent.body.getPosition();
      this.toDestroy.push(ent);
      if (poof) this.onEvent('poof', { x: p.x, y: p.y, kind: ent.kind, type: ent.type });
    }

    // Points along the predicted flight for the aiming guide.
    predict(vx, vy, steps) {
      const pts = [];
      let x = this.sling.restX, y = this.sling.restY;
      for (let i = 1; i <= steps; i++) {
        const g = this.gravityAt(x, y);
        vx += g.x * STEP; vy += g.y * STEP;
        x += vx * STEP; y += vy * STEP;
        if (this._solidAt(x, y)) break;
        pts.push({ x, y });
      }
      return pts;
    }

    _solidAt(x, y) {
      if (!this.space && this.level.ground !== false && y < 0) return true;
      for (const p of this.planets) if (len(x - p.x, y - p.y) < p.r) return true;
      return false;
    }

    // ---------- contacts & damage ----------

    _preSolve(contact) {
      if (this.noDamage) return;
      const bA = contact.getFixtureA().getBody(), bB = contact.getFixtureB().getBody();
      const eA = bA.getUserData(), eB = bB.getUserData();
      if (!eA || !eB) return;
      const man = contact.getManifold();
      if (!man.pointCount) return;
      const wm = contact.getWorldManifold(null);
      if (!wm) return;
      let px = 0, py = 0;
      for (let i = 0; i < man.pointCount; i++) { px += wm.points[i].x; py += wm.points[i].y; }
      px /= man.pointCount; py /= man.pointCount;
      const pt = Vec2(px, py);
      const vA = bA.getLinearVelocityFromWorldPoint(pt), vB = bB.getLinearVelocityFromWorldPoint(pt);
      const n = wm.normal;
      const approach = -((vB.x - vA.x) * n.x + (vB.y - vA.y) * n.y);

      // Eggs burst on any touch; birds remember their first impact.
      if (eA.kind === 'egg' || eB.kind === 'egg') {
        const egg = eA.kind === 'egg' ? eA : eB;
        if (!egg.dead) {
          const p = egg.body.getPosition();
          this.explosions.push({ x: p.x, y: p.y, r: 2.8, power: 26, dmg: 34 });
          this._removeProjectile(egg, false);
        }
      }
      for (const e of [eA, eB]) {
        if (e.kind === 'bird' && e.hitT < 0 && approach > 0.5) {
          e.hitT = e.t;
          e.body.setLinearDamping(0.4);
          if (approach > 3) this.onEvent('birdHit', { x: px, y: py, type: e.type, speed: approach });
        }
      }

      if (approach <= DAMAGE_SPEED) return;
      const mA = bA.isDynamic() ? bA.getMass() : 0, mB = bB.isDynamic() ? bB.getMass() : 0;
      const mEff = mA && mB ? mA * mB / (mA + mB) : (mA || mB);
      const base = mEff * (approach - DAMAGE_SPEED);
      this._impact(eA, eB, base, px, py, approach);
      this._impact(eB, eA, base, px, py, approach);
    }

    _impact(target, other, base, x, y, speed) {
      if (target.dead) return;
      if (target.kind === 'block') {
        let mult = COLLAPSE_DAMAGE;
        if (other.kind === 'bird') {
          mult = 1;
          const vs = BIRDS[other.type].vs[target.mat];
          if (vs !== undefined) mult = vs;
        }
        this.damageBlock(target, base * mult, x, y, speed);
      } else if (target.kind === 'pig') {
        this.damagePig(target, base, x, y);
      }
    }

    damageBlock(b, dmg, x, y, speed) {
      if (b.dead || dmg <= 0) return;
      b.hp -= dmg;
      if (b.hp <= 0) {
        b.dead = true;
        this.toDestroy.push(b);
      } else if (dmg > 0.6 && this.hitSoundCooldown <= 0) {
        this.hitSoundCooldown = 3;
        this.onEvent('hit', { mat: b.mat, x, y, strength: Math.min(1, dmg / b.maxHp + (speed || 0) / 30) });
      }
    }

    damagePig(p, dmg, x, y) {
      if (p.dead || dmg <= 0) return;
      p.hp -= dmg;
      if (p.hp <= 0) {
        p.dead = true;
        this.toDestroy.push(p);
      } else if (dmg > 0.3) {
        this.onEvent('pigHurt', { x, y });
      }
    }

    _explode(ex) {
      this.onEvent('explode', ex);
      for (let b = this.world.getBodyList(); b; b = b.getNext()) {
        if (!b.isDynamic()) continue;
        const e = b.getUserData();
        if (!e || e.dead) continue;
        const p = b.getWorldCenter();
        const dx = p.x - ex.x, dy = p.y - ex.y;
        const d = len(dx, dy);
        if (d > ex.r) continue;
        const f = 1 - d / ex.r;
        const nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : 1;
        const imp = ex.power * f * Math.sqrt(Math.max(0.3, b.getMass()));
        b.applyLinearImpulse(Vec2(nx * imp, ny * imp), p, true);
        if (e.kind === 'block') this.damageBlock(e, ex.dmg * f, p.x, p.y, 0);
        else if (e.kind === 'pig') this.damagePig(e, ex.dmg * f * 0.5, p.x, p.y);
      }
    }

    _flushDestroyed() {
      while (this.toDestroy.length) {
        const e = this.toDestroy.shift();
        if (e.removed) continue;
        e.removed = true;
        const p = e.body.getPosition();
        const v = e.body.getLinearVelocity();
        if (e.kind === 'block') {
          const pts = this.noDamage ? 0 : MATERIALS[e.mat].score;
          this.blocks.splice(this.blocks.indexOf(e), 1);
          this.score += pts;
          this.onEvent('break', {
            mat: e.mat, x: p.x, y: p.y, w: e.w || e.r * 2, h: e.h || e.r * 2,
            angle: e.body.getAngle(), vx: v.x, vy: v.y, pts,
          });
          if (MATERIALS[e.mat].explode && !e.fellOut) {
            const ex = MATERIALS[e.mat].explode;
            this.explosions.push({ x: p.x, y: p.y, r: ex.r, power: ex.power, dmg: ex.dmg });
          }
        } else if (e.kind === 'pig') {
          this.pigs.splice(this.pigs.indexOf(e), 1);
          this.score += PIG_SCORE;
          this.onEvent('pigDie', { x: p.x, y: p.y, r: e.r, pts: PIG_SCORE, type: e.type });
        } else {
          this.projectiles.splice(this.projectiles.indexOf(e), 1);
        }
        this.world.destroyBody(e.body);
      }
    }

    // ---------- main loop ----------

    _physicsStep() {
      if (this.space) this._applyFieldGravity();
      this.world.step(STEP, 10, 8);
      // Anything that leaves the arena is gone (pigs count as popped).
      const B = this.bounds;
      if (B) {
        for (const list of [this.blocks, this.pigs, this.projectiles]) {
          for (const e of list) {
            if (e.dead) continue;
            const p = e.body.getPosition();
            if (p.x < B.x1 || p.x > B.x2 || p.y < B.y1 || p.y > B.y2) {
              e.dead = true;
              e.fellOut = true;
              this.toDestroy.push(e);
            }
          }
        }
      }
      let guard = 0;
      while ((this.explosions.length || this.toDestroy.length) && guard++ < 20) {
        this._flushDestroyed();
        const ex = this.explosions.splice(0);
        for (const e of ex) this._explode(e);
      }
    }

    step() {
      if (this.state === 'won' || this.state === 'lost') {
        this._physicsStep();
        return;
      }
      this.t += STEP;
      if (this.hitSoundCooldown > 0) this.hitSoundCooldown--;
      this._physicsStep();
      for (const p of this.pigs) p.blink -= STEP;

      if (this.state === 'flying') this._updateShot();

      // Win as soon as the objective is met.
      if (this.winTimer < 0 && this._objectiveDone(true)) this.winTimer = 0;
      if (this.winTimer >= 0) {
        this.winTimer += STEP;
        if (this.winTimer > 1.8) this._finish(true);
      }
    }

    _updateShot() {
      const shot = this.shot;
      shot.t += STEP;
      for (const e of this.projectiles.slice()) {
        if (e.dead) continue;
        e.t += STEP;
        const v = e.body.getLinearVelocity();
        const sp = len(v.x, v.y);
        if (e.kind === 'bird') {
          if (e === shot.main && shot.t < 8 && Math.round(e.t / STEP) % 3 === 0) {
            const p = e.body.getPosition();
            this.trail.push({ x: p.x, y: p.y, big: e.hitT < 0 && this.trail.length % 4 === 0 });
          }
          if (e.type === 'black' && e.hitT >= 0 && !e.abilityUsed && e.t - e.hitT > 1.8) {
            e.abilityUsed = true;
            this._explodeBird(e);
            continue;
          }
          e.slowT = sp < 0.6 ? e.slowT + STEP : 0;
          if ((e.hitT >= 0 && (e.slowT > 0.8 || e.t - e.hitT > 6)) || e.t > 14) this._removeProjectile(e, true);
        } else if (e.t > 6) {
          this._removeProjectile(e, true);
        }
      }
      this._flushDestroyed();

      if (this.projectiles.length) return;
      shot.goneT += STEP;
      if (this.winTimer >= 0) return;
      if (shot.goneT < 0.5 || (!this._calm() && shot.goneT < 4)) return;

      // Shot is over.
      this.shot = null;
      if (this.birdsLeft > 0 && !(this.objective.type === 'demolish' && this._demolishPct() >= 100)) {
        this.state = 'aim';
        this.onEvent('nextBird', { type: this.currentBird });
      } else {
        this._finish(this._objectiveDone(false));
      }
    }

    _calm() {
      for (let b = this.world.getBodyList(); b; b = b.getNext()) {
        if (!b.isDynamic() || !b.isAwake()) continue;
        const v = b.getLinearVelocity();
        if (len(v.x, v.y) > 0.25 || Math.abs(b.getAngularVelocity()) > 0.6) {
          if (this.space) {
            // Debris drifting through empty space never settles; ignore it.
            const p = b.getPosition(), g = this.gravityAt(p.x, p.y);
            if (!g.x && !g.y) continue;
          }
          return false;
        }
      }
      return true;
    }

    _demolishPct() {
      return this.blocksTotal ? Math.round(100 * (this.blocksTotal - this.blocks.length) / this.blocksTotal) : 100;
    }

    // early = checking mid-shot (ends the level right away)
    _objectiveDone(early) {
      if (this.objective.type === 'demolish') {
        const pct = this._demolishPct();
        return early ? pct >= 100 : pct >= this.objective.pct;
      }
      return this.pigs.length === 0;
    }

    _finish(won) {
      if (this.state === 'won' || this.state === 'lost') return;
      this.state = won ? 'won' : 'lost';
      this.spareBirds = 0;
      if (won && this.objective.type !== 'demolish') {
        this.spareBirds = this.birdsLeft;
        this.score += this.spareBirds * SPARE_BIRD_SCORE;
      }
      this.stars = won ? this._stars() : 0;
      this.onEvent(won ? 'win' : 'lose', { score: this.score, stars: this.stars, spare: this.spareBirds });
    }

    _stars() {
      if (this.objective.type === 'demolish') {
        const t = this.objective.pct, pct = this._demolishPct();
        if (pct >= t + (100 - t) * 0.7) return 3;
        if (pct >= t + (100 - t) * 0.35) return 2;
        return 1;
      }
      const th = this.starThresholds();
      return this.score >= th[1] ? 3 : this.score >= th[0] ? 2 : 1;
    }

    starThresholds() {
      if (this.level.stars) return this.level.stars;
      const pigPts = this.pigsTotal * PIG_SCORE;
      const spare = this.level.birds.length > 1 ? SPARE_BIRD_SCORE : 0;
      const round = v => Math.round(v / 1000) * 1000;
      return [round(pigPts + 0.25 * this.blockScoreTotal), round(pigPts + 0.45 * this.blockScoreTotal + spare)];
    }

    demolishPct() { return this._demolishPct(); }
  }

  Sim.MATERIALS = MATERIALS;
  Sim.BIRDS = BIRDS;
  Sim.PIGS = PIGS;
  Sim.STEP = STEP;
  Sim.GRAVITY = GRAVITY;
  Sim.SLING_HEIGHT = SLING_HEIGHT;
  Sim.rand = rand;
  return Sim;
});
