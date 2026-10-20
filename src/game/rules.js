/*
 * NEON NEBULA rules engine. Pure logic: reacts to switch events from the game,
 * keeps score and modes, and asks the game to hold, eject, lock or serve balls.
 * Presentation is requested through fx() events and show() display scenes, so
 * the same rules run headless in Node.
 */
(function (NN) {
  'use strict';

  const U = NN.U;
  const MAJOR = NN.MAJOR_SHOTS;

  NN.RULES_CONFIG = {
    arcade: { balls: 3, ballSave: 8, replay: 120000000, tiltWarnings: 2, missionBonusTime: 0, mbSave: 12, label: 'ARCADE' },
    casual: { balls: 5, ballSave: 15, replay: 70000000, tiltWarnings: 3, missionBonusTime: 10, mbSave: 18, label: 'CASUAL' },
  };

  const SC = {
    sling: 10000, bumper: 50000, spin: 15000, lane: 100000, beltComplete: 1000000,
    inlane: 25000, outlane: 50000, planet: 75000, planetsComplete: 1500000,
    drop: 100000, dropsComplete: 2000000,
    ramp: 750000, rampStep: 100000, orbit: 600000, scoop: 500000, comet: 1000000, cometStep: 250000,
    skill: 2500000, skillStep: 1000000, superSkill: 7500000,
    combo: 500000, jackpot: 5000000, jackpotStep: 1000000, superJackpot: 25000000, superStep: 10000000,
    missionComplete: 10000000, missionStep: 5000000,
    supernovaShot: 5000000, supernovaFinal: 50000000,
    lock: 1000000, mbStart: 2000000, extraBallValue: 5000000, kickback: 250000,
  };
  NN.SCORES = SC;
  const COMBO_WINDOW = 4.0;

  function Rules(game) {
    this.game = game;
    this.rng = U.rng(12345);
    this.display = [];
    this.scene = null;
    this.highScores = [];
    this.demo = false;
    this.newGame('arcade');
    this.gameActive = false;
  }

  Rules.prototype.fx = function (e) { this.game.fx(e); };

  // Display scene: { kind, t1, t2, dur, prio }
  Rules.prototype.show = function (s) {
    s = Object.assign({ dur: 2, prio: 1, t: 0 }, s);
    if (!this.scene) { this.scene = s; return; }
    if (s.prio >= this.scene.prio) {
      // interrupt; the interrupted scene comes back afterwards unless it is the
      // same kind (a newer combo replaces an older one) or nearly finished
      if (this.scene.kind !== s.kind && this.scene.t < this.scene.dur * 0.6) this.display.unshift(this.scene);
      this.scene = s;
      return;
    }
    const same = this.display.findIndex((q) => q.kind === s.kind);
    if (same >= 0) this.display[same] = s;
    else this.display.push(s);
    this.display.sort((a, b) => b.prio - a.prio);
    if (this.display.length > 4) this.display.length = 4;
  };

  // ---------------------------------------------------------------- game ---
  Rules.prototype.newGame = function (difficulty, seed) {
    this.difficulty = difficulty || 'arcade';
    this.cfg = NN.RULES_CONFIG[this.difficulty];
    if (seed != null) this.rng = U.rng(seed);
    this.score = 0;
    this.ball = 1;
    this.extraBallsPending = 0;
    this.extraBallsAwarded = 0;
    this.gameActive = true;
    this.gameOver = false;
    this.replayAwarded = false;
    this.missions = NN.MISSIONS.map((m) => ({ def: m, done: false }));
    this.missionLit = true;
    this.mission = null;
    this.missionsCompleted = 0;
    this.supernovaLit = false;
    this.wizard = null;
    this.supernovas = 0;
    this.lockLit = false;
    this.locked = 0;
    this.leftRampsForLock = 1;
    this.leftRampProgress = 0;
    this.mb = null;
    this.mbCount = 0;
    this.kickbackLit = true;
    this.extraBallLit = false;
    this.ebLitReasons = { mission2: false, super: false };
    this.cometValue = SC.comet;
    this.skillValue = SC.skill;
    this.jackpotsTotal = 0;
    this.superJackpots = 0;
    this.planets = [false, false, false, false];
    this.display.length = 0;
    this.scene = null;
    this.selecting = null;
    this.gstats = {
      ramps: 0, orbits: 0, scoops: 0, comets: 0, spins: 0, bumpers: 0, jackpots: 0, superJackpots: 0,
      missions: 0, multiballs: 0, maxCombo: 0, skillShots: 0, superSkills: 0, extraBalls: 0,
      kickbacks: 0, tilts: 0, ballSaves: 0, supernovas: 0, drops: 0, planets: 0, time: 0,
      ballsPlayed: 0, maxSpinsBall: 0,
    };
    this.newBallState();
  };

  Rules.prototype.newBallState = function () {
    this.bonusX = 1;
    this.lanes = [false, false, false];
    this.skillLane = this.rng.int(3);
    this.skillActive = true;
    this.superSkillUntil = -1;
    this.plunged = false;
    this.ballSaveArmed = true;    // starts on first playfield switch
    this.ballSaveUntil = -1;
    this.tilted = false;
    this.tiltBob = 0;
    this.tiltWarningsUsed = 0;
    this.comboCount = 0;
    this.lastMajor = -99;
    this.comboMult = 1;
    this.bstats = { ramps: 0, orbits: 0, bumpers: 0, spins: 0, targets: 0, combos: 0, missions: 0, comets: 0, scoops: 0, jackpots: 0 };
    this.dropsState = [false, false, false];
    this.game.resetDrops && this.game.resetDrops();
    this.cometValue = Math.max(SC.comet, this.cometValue * 0.5);
  };

  Rules.prototype.now = function () { return this.game.time; };

  Rules.prototype.award = function (pts, x, y, big) {
    if (!pts || this.tilted) return 0;
    pts = Math.round(pts / 10) * 10;
    this.score += pts;
    if (x != null) this.fx({ type: 'points', x: x, y: y, pts: pts, big: !!big });
    if (!this.replayAwarded && this.score >= this.cfg.replay && !this.demo) {
      this.replayAwarded = true;
      this.extraBallsPending++;
      this.extraBallsAwarded++;
      this.gstats.extraBalls++;
      this.show({ kind: 'replay', t1: 'REPLAY', t2: 'EXTRA BALL', dur: 2.5, prio: 6 });
      this.fx({ type: 'sound', id: 'knocker' });
      this.fx({ type: 'lampshow', id: 'extraball', dur: 1.5 });
    }
    return pts;
  };

  // ------------------------------------------------------------ ball flow ---
  Rules.prototype.startBall = function () {
    this.newBallState();
    this.gstats.ballsPlayed++;
    this.show({ kind: 'ballStart', t1: 'BALL ' + this.ball, t2: this.ball === 1 ? 'PULL THE PLUNGER' : 'SKILL SHOT', dur: 2.2, prio: 2 });
    this.fx({ type: 'music', state: 'normal' });
  };

  Rules.prototype.firstSwitch = function () {
    if (this.ballSaveArmed) {
      this.ballSaveArmed = false;
      this.ballSaveUntil = this.now() + (this.game.P.ballSaveTime != null ? this.ballSaveSeconds() : 8);
    }
  };

  Rules.prototype.ballSaveSeconds = function () {
    // the tuning panel's ball save value applies to Arcade; Casual adds its bonus on top
    const base = this.game.P.ballSaveTime;
    return this.difficulty === 'casual' ? Math.max(base, this.cfg.ballSave) : base;
  };

  Rules.prototype.ballSaveActive = function () {
    return this.ballSaveArmed || this.now() < this.ballSaveUntil;
  };

  // Called by the game when a ball drains. Returns 'saved', 'continue' or 'end'.
  Rules.prototype.onDrain = function (inPlayAfter) {
    if (this.tilted) {
      return inPlayAfter > 0 ? 'continue' : 'end';
    }
    const saving = this.ballSaveActive() || (this.mb && this.now() < this.mb.saveUntil) || (this.wizard && this.now() < this.wizard.saveUntil);
    if (saving && !this.ballSaveArmed) {
      this.gstats.ballSaves++;
      this.show({ kind: 'ballsaved', t1: 'BALL SAVED', t2: '', dur: 1.6, prio: 4 });
      this.fx({ type: 'sound', id: 'ballsave' });
      this.fx({ type: 'vibrate', ms: [30, 40, 30] });
      return 'saved';
    }
    if (this.ballSaveArmed && inPlayAfter === 0) {
      // drained before touching anything (e.g. weak plunge falling back): give it back
      return 'saved';
    }
    if (inPlayAfter >= 1) {
      if (this.mb && inPlayAfter <= 1) this.endMultiball();
      if (this.wizard && inPlayAfter <= 1) this.endWizard();
      return 'continue';
    }
    this.fx({ type: 'sound', id: 'drain' });
    this.fx({ type: 'vibrate', ms: 120 });
    return 'end';
  };

  Rules.prototype.endBallModes = function () {
    if (this.mission) this.endMission(false, true);
    if (this.mb) this.endMultiball();
    if (this.wizard) this.endWizard();
    this.selecting = null;
  };

  // Bonus items for the end-of-ball count
  Rules.prototype.bonusItems = function () {
    const b = this.bstats;
    const items = [
      ['RAMPS', b.ramps, 200000], ['ORBITS', b.orbits, 150000], ['COMETS', b.comets, 300000],
      ['BLACK HOLES', b.scoops, 250000], ['BUMPERS', b.bumpers, 10000], ['SPINS', b.spins, 5000],
      ['TARGETS', b.targets, 50000], ['COMBOS', b.combos, 250000], ['MISSIONS', b.missions, 2000000],
      ['JACKPOTS', b.jackpots, 500000],
    ];
    return items.filter((it) => it[1] > 0).map((it) => ({ label: it[0], count: it[1], value: it[1] * it[2] }));
  };

  // After the bonus: next ball, extra ball or game over. Returns 'next', 'shootAgain' or 'over'.
  Rules.prototype.advanceBall = function () {
    if (this.extraBallsPending > 0) {
      this.extraBallsPending--;
      this.show({ kind: 'shootagain', t1: 'SHOOT AGAIN', t2: 'SAME PLAYER', dur: 2, prio: 5 });
      this.fx({ type: 'sound', id: 'shootagain' });
      return 'shootAgain';
    }
    if (this.ball >= this.cfg.balls) {
      this.gameOver = true;
      this.gameActive = false;
      return 'over';
    }
    this.ball++;
    return 'next';
  };

  // ------------------------------------------------------------- tilting ---
  Rules.prototype.onNudge = function () {
    if (this.tilted || !this.gameActive) return null;
    const P = this.game.P;
    this.tiltBob += P.tiltPerNudge;
    if (this.tiltBob >= P.tiltWarnLevel) {
      this.tiltWarningsUsed++;
      this.tiltBob = 1.0;
      if (this.tiltWarningsUsed > this.cfg.tiltWarnings) {
        this.doTilt();
        return 'tilt';
      }
      this.show({ kind: 'danger', t1: 'DANGER', t2: this.tiltWarningsUsed === this.cfg.tiltWarnings ? 'LAST WARNING' : 'DANGER', dur: 1.4, prio: 7 });
      this.fx({ type: 'sound', id: 'danger' });
      return 'danger';
    }
    return null;
  };

  Rules.prototype.doTilt = function () {
    this.tilted = true;
    this.gstats.tilts++;
    this.endBallModes();
    this.show({ kind: 'tilt', t1: 'TILT', t2: '', dur: 3.5, prio: 9 });
    this.fx({ type: 'sound', id: 'tilt' });
    this.fx({ type: 'music', state: 'off' });
    this.game.setFlippersEnabled(false);
  };

  // ----------------------------------------------------------- switches ---
  // kind: bumper sling target drop lane inlane outlane spin shot kickback launch
  Rules.prototype.sw = function (kind, id, e) {
    if (!this.gameActive || this.tilted) {
      if (this.tilted && kind === 'kickback') return false;
      return false;
    }
    const x = e && e.x, y = e && e.y;
    if (kind !== 'launch' && kind !== 'spin') this.firstSwitch();
    if (kind !== 'lane' && kind !== 'launch' && kind !== 'plungePath') this.skillActive = this.skillActive && kind === 'spin';
    switch (kind) {
      case 'bumper': {
        this.bstats.bumpers++; this.gstats.bumpers++;
        let v = SC.bumper;
        v += this.missionEvent('bumper', id);
        this.award(v, x, y);
        break;
      }
      case 'sling':
        this.award(SC.sling);
        break;
      case 'spin': {
        this.bstats.spins++; this.gstats.spins++;
        if (this.bstats.spins > this.gstats.maxSpinsBall) this.gstats.maxSpinsBall = this.bstats.spins;
        let v = SC.spin + this.missionEvent('spin', id);
        this.award(v);
        break;
      }
      case 'lane': return this.onLane(id, e);
      case 'inlane':
        this.award(SC.inlane);
        break;
      case 'outlane':
        this.award(SC.outlane);
        break;
      case 'target': this.onPlanet(id, e); break;
      case 'drop': this.onDrop(id, e); break;
      case 'kickback': return this.onKickback(e);
      case 'launch':
        if (!this.plunged) { this.plunged = true; }
        break;
      case 'plungePath':
        // the plunge went all the way round the top and down the left orbit
        if (this.skillActive) {
          this.skillActive = false;
          this.superSkillUntil = this.now() + 6;
          this.show({ kind: 'award', t1: 'SUPER SKILL', t2: 'SHOOT THE LEFT RAMP', dur: 2.2, prio: 3 });
          this.fx({ type: 'sound', id: 'modeStep' });
        }
        break;
    }
    return false;
  };

  Rules.prototype.onLane = function (id, e) {
    const i = +id.slice(4) - 1;
    if (this.skillActive) {
      this.skillActive = false;
      if (i === this.skillLane) {
        const v = this.award(this.skillValue, e.x, e.y, true);
        this.gstats.skillShots++;
        this.show({ kind: 'skillshot', t1: 'SKILL SHOT', t2: U.formatScore(v), dur: 2.4, prio: 5 });
        this.fx({ type: 'sound', id: 'skillshot' });
        this.fx({ type: 'lampshow', id: 'sweepUp', dur: 1.2 });
        this.fx({ type: 'shake', amt: 2 });
        this.skillValue += SC.skillStep;
      }
    }
    this.firstSwitch();
    this.award(SC.lane, e.x, e.y);
    if (!this.lanes[i]) {
      this.lanes[i] = true;
      this.fx({ type: 'sound', id: 'laneLit' });
    }
    if (this.lanes.every((v) => v)) this.beltComplete();
    return false;
  };

  Rules.prototype.beltComplete = function () {
    this.lanes = [false, false, false];
    if (this.bonusX < 6) this.bonusX++;
    this.award(SC.beltComplete);
    this.show({ kind: 'award', t1: 'ORION BELT', t2: 'BONUS ' + this.bonusX + 'X', dur: 1.8, prio: 3 });
    this.fx({ type: 'sound', id: 'beltComplete' });
    this.fx({ type: 'lampshow', id: 'lanes', dur: 0.8 });
  };

  Rules.prototype.onPlanet = function (id, e) {
    const i = +id.slice(6) - 1;
    this.bstats.targets++;
    this.gstats.planets++;
    let v = SC.planet + this.missionEvent('target', id);
    this.award(v, e.x, e.y);
    if (!this.planets[i]) {
      this.planets[i] = true;
      this.fx({ type: 'sound', id: 'targetLit' });
    } else {
      this.fx({ type: 'sound', id: 'target' });
    }
    if (this.planets.every((v) => v)) {
      this.planets = [false, false, false, false];
      this.award(SC.planetsComplete);
      this.fx({ type: 'lampshow', id: 'planets', dur: 1 });
      if (!this.missionLit && !this.mission && !this.wizard && !this.supernovaLit) {
        this.missionLit = true;
        this.show({ kind: 'award', t1: 'PLANETS ALIGNED', t2: 'MISSION IS LIT', dur: 2, prio: 3 });
        this.fx({ type: 'sound', id: 'missionLit' });
      } else {
        this.show({ kind: 'award', t1: 'PLANETS ALIGNED', t2: U.formatScore(SC.planetsComplete), dur: 1.6, prio: 2 });
        this.fx({ type: 'sound', id: 'beltComplete' });
      }
    }
  };

  Rules.prototype.dropsDown = function () { return this.dropsState.filter((v) => v).length; };
  Rules.prototype.resetDrops = function () {
    this.dropsState = [false, false, false];
    this.game.resetDrops();
  };

  Rules.prototype.onDrop = function (id, e) {
    const i = +id.slice(4) - 1;
    if (this.dropsState[i]) return;
    this.dropsState[i] = true;
    this.game.dropTarget(id, true);
    this.bstats.targets++;
    this.gstats.drops++;
    this.award(SC.drop + this.missionEvent('drop', id), e.x, e.y);
    if (this.dropsDown() === 3) {
      this.award(SC.dropsComplete);
      this.fx({ type: 'lampshow', id: 'drops', dur: 0.8 });
      this.missionEvent('dropsComplete');
      if (this.mb && !this.mb.addedBall) {
        this.mb.addedBall = true;
        this.game.addBalls(1);
        this.show({ kind: 'award', t1: 'ADD A BALL', t2: '', dur: 1.8, prio: 5 });
        this.fx({ type: 'sound', id: 'addaball' });
      } else if (!this.kickbackLit) {
        this.kickbackLit = true;
        this.show({ kind: 'award', t1: 'ASTEROIDS CLEARED', t2: 'KICKBACK IS LIT', dur: 1.8, prio: 3 });
        this.fx({ type: 'sound', id: 'kickbackLit' });
      } else {
        this.show({ kind: 'award', t1: 'ASTEROIDS CLEARED', t2: U.formatScore(SC.dropsComplete), dur: 1.5, prio: 2 });
        this.fx({ type: 'sound', id: 'dropsComplete' });
      }
      this.game.schedule(1.2, () => this.resetDrops());
    }
  };

  Rules.prototype.onKickback = function (e) {
    if (!this.kickbackLit || this.tilted) return false;
    this.kickbackLit = false;
    this.gstats.kickbacks++;
    this.award(SC.kickback);
    this.show({ kind: 'award', t1: 'KICKBACK', t2: '', dur: 1.2, prio: 3 });
    return true;
  };

  // --------------------------------------------------------- major shots ---
  Rules.prototype.shot = function (name, e) {
    if (!this.gameActive || this.tilted) return;
    this.firstSwitch();
    this.skillActive = false;
    const now = this.now();
    const x = e && e.x, y = e && e.y;
    // combos
    if (now - this.lastMajor <= COMBO_WINDOW) this.comboCount++;
    else this.comboCount = 1;
    this.lastMajor = now;
    this.comboMult = Math.min(5, 1 + 0.5 * (this.comboCount - 1));
    if (this.comboCount >= 2) {
      this.bstats.combos++;
      if (this.comboCount > this.gstats.maxCombo) this.gstats.maxCombo = this.comboCount;
      const cv = this.award(SC.combo * this.comboCount);
      this.show({ kind: 'combo', t1: this.comboCount + '-WAY COMBO', t2: U.formatScore(cv) + '  X' + this.comboMult, dur: 1.4, prio: 3, n: this.comboCount, replace: true });
      this.fx({ type: 'sound', id: 'combo', n: this.comboCount });
    }
    let v = 0;
    const m = this.comboMult;
    switch (name) {
      case 'leftRamp': case 'rightRamp':
        this.bstats.ramps++; this.gstats.ramps++;
        v = SC.ramp + SC.rampStep * Math.min(10, this.bstats.ramps);
        this.fx({ type: 'sound', id: 'rampMade' });
        break;
      case 'leftOrbit': case 'rightOrbit':
        this.bstats.orbits++; this.gstats.orbits++;
        v = SC.orbit;
        this.fx({ type: 'sound', id: 'orbit' });
        break;
      case 'scoop':
        this.bstats.scoops++; this.gstats.scoops++;
        v = SC.scoop;
        break;
      case 'comet':
        this.bstats.comets++; this.gstats.comets++;
        v = this.cometValue;
        this.cometValue += SC.cometStep;
        this.show({ kind: 'award', t1: 'COMET LANE', t2: U.formatScore(v * m), dur: 1.3, prio: 2 });
        this.fx({ type: 'sound', id: 'comet' });
        // spot the next unlit Orion lane
        { const k = this.lanes.indexOf(false); if (k >= 0) { this.lanes[k] = true; if (this.lanes.every((q) => q)) this.beltComplete(); } }
        break;
    }
    this.award(v * m, x, y);

    // super skill shot
    if (name === 'leftRamp' && now < this.superSkillUntil) {
      this.superSkillUntil = -1;
      const sv = this.award(SC.superSkill, x, y, true);
      this.gstats.superSkills++;
      this.show({ kind: 'skillshot', t1: 'SUPER SKILL', t2: U.formatScore(sv), dur: 2.5, prio: 6 });
      this.fx({ type: 'sound', id: 'superskill' });
      this.fx({ type: 'lampshow', id: 'rainbow', dur: 1.5 });
      this.fx({ type: 'shake', amt: 3 });
    }

    if (this.wizard) { this.wizardShot(name, e); return; }
    if (this.mb) this.multiballShot(name, e);
    this.missionEvent('shot', name, e);

    // features
    if (name === 'leftRamp' && !this.mb && !this.lockLit) {
      this.leftRampProgress++;
      if (this.leftRampProgress >= this.leftRampsForLock) {
        this.leftRampProgress = 0;
        this.lockLit = true;
        this.show({ kind: 'award', t1: 'LOCK IS LIT', t2: 'SHOOT RIGHT RAMP', dur: 1.8, prio: 3 });
        this.fx({ type: 'sound', id: 'lockLit' });
      }
    }
    if (name === 'leftOrbit' && this.extraBallLit) {
      this.extraBallLit = false;
      this.awardExtraBall();
    }
  };

  // Right ramp made: true means the game should lock the ball
  Rules.prototype.wantsLock = function () {
    return this.gameActive && !this.tilted && this.lockLit && !this.mb && !this.wizard;
  };

  Rules.prototype.onLock = function () {
    this.lockLit = false;
    this.locked++;
    this.award(SC.lock);
    if (this.locked >= 2) {
      this.startMultiball();
      return 'multiball';
    }
    this.show({ kind: 'lock', t1: 'BALL ' + this.locked + ' LOCKED', t2: 'DOCKING BAY', dur: 2, prio: 4 });
    this.fx({ type: 'sound', id: 'lock' });
    this.fx({ type: 'lampshow', id: 'sweepRight', dur: 0.9 });
    return 'locked';
  };

  Rules.prototype.awardExtraBall = function () {
    if (this.extraBallsAwarded >= 3) {
      this.award(SC.extraBallValue);
      this.show({ kind: 'award', t1: 'EXTRA BALL', t2: U.formatScore(SC.extraBallValue), dur: 2, prio: 5 });
      return;
    }
    this.extraBallsPending++;
    this.extraBallsAwarded++;
    this.gstats.extraBalls++;
    this.show({ kind: 'extraball', t1: 'EXTRA BALL', t2: 'SHOOT AGAIN', dur: 2.6, prio: 6 });
    this.fx({ type: 'sound', id: 'extraball' });
    this.fx({ type: 'lampshow', id: 'extraball', dur: 1.6 });
  };

  Rules.prototype.lightExtraBall = function (reason) {
    if (this.ebLitReasons[reason]) return;
    this.ebLitReasons[reason] = true;
    this.extraBallLit = true;
    this.show({ kind: 'award', t1: 'EXTRA BALL', t2: 'IS LIT', dur: 1.8, prio: 4 });
    this.fx({ type: 'sound', id: 'ebLit' });
  };

  // ------------------------------------------------------------- scoop ---
  // The scoop has captured a ball. Returns hold time in seconds before eject.
  Rules.prototype.onScoop = function (e) {
    if (!this.gameActive || this.tilted) return 0.6;
    const novaWasLit = this.supernovaLit;
    const missionLitBefore = this.missionLit;
    const missionBefore = this.mission;
    this.shot('scoop', e);
    if (missionBefore && !this.mission) return 2.6; // this shot completed a mission
    if (novaWasLit && this.supernovaLit && !this.mb && !this.wizard) {
      this.startWizard();
      return 3.2;
    }
    if (this.wizard && this.wizard.finalLit) {
      this.wizardFinal();
      return 3.0;
    }
    if (this.mb && this.mb.superLit) {
      this.collectSuper();
      return 2.6;
    }
    if (missionLitBefore && this.missionLit && !this.mission && !this.mb && !this.wizard) {
      this.beginMissionSelect();
      return -1; // hold until a mission is picked
    }
    if (this.mission) {
      this.mission.timeLeft += 5;
      this.show({ kind: 'award', t1: 'BLACK HOLE', t2: '+5 SECONDS', dur: 1.2, prio: 2 });
    } else {
      this.show({ kind: 'blackhole', t1: 'BLACK HOLE', t2: U.formatScore(SC.scoop * this.comboMult), dur: 1.3, prio: 2 });
    }
    this.fx({ type: 'sound', id: 'scoop' });
    return 1.2;
  };

  // --------------------------------------------------------- missions ---
  Rules.prototype.availableMissions = function () {
    return this.missions.filter((m) => !m.done);
  };

  Rules.prototype.beginMissionSelect = function () {
    const avail = this.availableMissions();
    if (!avail.length) return;
    this.selecting = { list: avail, i: 0, until: this.now() + 6 };
    this.fx({ type: 'sound', id: 'scoop' });
    this.fx({ type: 'music', state: 'select' });
    this.showSelect();
  };

  Rules.prototype.showSelect = function () {
    const s = this.selecting;
    const m = s.list[s.i].def;
    this.show({ kind: 'select', t1: m.name, t2: m.line1 + ' ' + m.line2, dur: 99, prio: 8, replace: true, idx: s.i, count: s.list.length, color: m.color });
  };

  Rules.prototype.selectStep = function (dir) {
    const s = this.selecting;
    if (!s) return;
    s.i = (s.i + dir + s.list.length) % s.list.length;
    s.until = Math.max(s.until, this.now() + 3);
    this.fx({ type: 'sound', id: 'select' });
    this.showSelect();
  };

  Rules.prototype.selectConfirm = function () {
    const s = this.selecting;
    if (!s) return;
    this.selecting = null;
    const pick = s.list[s.i];
    if (this.scene && this.scene.kind === 'select') this.scene = null;
    this.startMission(pick);
    this.game.schedule(2.2, () => this.game.ejectScoop());
  };

  Rules.prototype.startMission = function (m) {
    this.missionLit = false;
    const st = {};
    m.def.start(st, this);
    this.mission = { def: m.def, entry: m, st: st, timeLeft: m.def.time + this.cfg.missionBonusTime, started: this.now() };
    this.show({ kind: 'mode_start', t1: m.def.name, t2: m.def.line1 + ' ' + m.def.line2, dur: 2.4, prio: 6, color: m.def.color });
    this.fx({ type: 'sound', id: 'modeStart' });
    this.fx({ type: 'music', state: 'mode' });
    this.fx({ type: 'lampshow', id: 'radial', dur: 1.4, color: m.def.color });
  };

  // forward an event to the running mission; returns extra points
  Rules.prototype.missionEvent = function (kind, id, e) {
    const M = this.mission;
    if (!M) return 0;
    const pts = M.def.event(M.st, this, kind, id, e) || 0;
    if (pts) {
      if (kind === 'shot') {
        this.award(pts * this.comboMult, e && e.x, e && e.y, true);
        this.fx({ type: 'sound', id: 'modeStep' });
        this.show({ kind: 'mode_step', t1: M.def.name, t2: M.def.status(M.st), dur: 1.2, prio: 3 });
      } else if (kind === 'dropsComplete') {
        this.award(pts);
      }
    }
    if (M.def.done(M.st)) this.endMission(true);
    return kind === 'shot' || kind === 'dropsComplete' ? 0 : pts;
  };

  Rules.prototype.endMission = function (success, quiet) {
    const M = this.mission;
    if (!M) return;
    this.mission = null;
    if (success) {
      M.entry.done = true;
      this.missionsCompleted++;
      this.bstats.missions++;
      this.gstats.missions++;
      const v = SC.missionComplete + SC.missionStep * (this.missionsCompleted - 1);
      this.award(v, null, null, true);
      this.show({ kind: 'mode_complete', t1: M.def.name, t2: 'COMPLETE ' + U.formatScore(v), dur: 2.8, prio: 7, color: M.def.color });
      this.fx({ type: 'sound', id: 'modeComplete' });
      this.fx({ type: 'lampshow', id: 'rainbow', dur: 2 });
      this.fx({ type: 'shake', amt: 4 });
      if (this.missionsCompleted === 2) this.lightExtraBall('mission2');
      if (this.availableMissions().length === 0) {
        this.supernovaLit = true;
        this.missionLit = false;
        this.game.schedule(3, () => {
          this.show({ kind: 'award', t1: 'SUPERNOVA', t2: 'IS LIT', dur: 2.5, prio: 7 });
          this.fx({ type: 'sound', id: 'supernovaLit' });
        });
      }
    } else if (!quiet) {
      this.show({ kind: 'mode_end', t1: M.def.name, t2: 'MISSION OVER', dur: 1.8, prio: 4 });
      this.fx({ type: 'sound', id: 'modeFail' });
    }
    if (!quiet) this.fx({ type: 'music', state: this.mb ? 'multiball' : 'normal' });
  };

  // ------------------------------------------------------- multiball ---
  Rules.prototype.startMultiball = function () {
    this.mbCount++;
    this.gstats.multiballs++;
    this.locked = 0;
    this.leftRampsForLock = Math.min(3, this.leftRampsForLock + 1);
    this.mb = {
      jackpots: { leftRamp: true, rightRamp: true },
      value: SC.jackpot + SC.jackpotStep * this.jackpotsTotal,
      superLit: false, superValue: SC.superJackpot + SC.superStep * this.superJackpots,
      saveUntil: this.now() + this.cfg.mbSave + 3, addedBall: false, collected: 0,
    };
    this.award(SC.mbStart);
    this.show({ kind: 'multiball', t1: 'NEBULA', t2: 'MULTIBALL', dur: 3, prio: 8 });
    this.fx({ type: 'sound', id: 'multiball' });
    this.fx({ type: 'music', state: 'multiball' });
    this.fx({ type: 'lampshow', id: 'strobe', dur: 2.5 });
    this.fx({ type: 'shake', amt: 4 });
    this.game.startMultiballRelease();
  };

  Rules.prototype.multiballShot = function (name, e) {
    const mb = this.mb;
    if ((name === 'leftRamp' || name === 'rightRamp') && mb.jackpots[name]) {
      mb.jackpots[name] = false;
      const v = this.award(mb.value * this.comboMult, e && e.x, e && e.y, true);
      this.jackpotsTotal++;
      mb.collected++;
      this.bstats.jackpots++;
      this.gstats.jackpots++;
      this.show({ kind: 'jackpot', t1: 'JACKPOT', t2: U.formatScore(v), dur: 2, prio: 7 });
      this.fx({ type: 'sound', id: 'jackpot' });
      this.fx({ type: 'lampshow', id: 'flashAll', dur: 1 });
      this.fx({ type: 'shake', amt: 5 });
      this.fx({ type: 'vibrate', ms: [40, 30, 60] });
      mb.value += SC.jackpotStep;
      if (!mb.jackpots.leftRamp && !mb.jackpots.rightRamp) {
        mb.superLit = true;
        this.game.schedule(1.6, () => {
          if (this.mb === mb) this.show({ kind: 'award', t1: 'SUPER JACKPOT', t2: 'IS LIT', dur: 1.8, prio: 6 });
        });
      }
    }
  };

  Rules.prototype.collectSuper = function () {
    const mb = this.mb;
    mb.superLit = false;
    const v = this.award(mb.superValue, null, null, true);
    this.superJackpots++;
    this.gstats.superJackpots++;
    this.bstats.jackpots++;
    mb.superValue += SC.superStep;
    mb.jackpots = { leftRamp: true, rightRamp: true };
    this.show({ kind: 'superjackpot', t1: 'SUPER JACKPOT', t2: U.formatScore(v), dur: 3, prio: 9 });
    this.fx({ type: 'sound', id: 'superjackpot' });
    this.fx({ type: 'slowmo', scale: 0.3, dur: 0.9 });
    this.fx({ type: 'lampshow', id: 'rainbow', dur: 2.5 });
    this.fx({ type: 'shake', amt: 8 });
    this.fx({ type: 'vibrate', ms: [80, 40, 80, 40, 160] });
    if (this.superJackpots === 1) this.lightExtraBall('super');
  };

  Rules.prototype.endMultiball = function () {
    if (!this.mb) return;
    this.mb = null;
    this.show({ kind: 'award', t1: 'MULTIBALL', t2: 'OVER', dur: 1.4, prio: 3 });
    this.fx({ type: 'music', state: this.mission ? 'mode' : 'normal' });
  };

  // ------------------------------------------------------- SUPERNOVA ---
  Rules.prototype.startWizard = function () {
    this.supernovaLit = false;
    const lit = {};
    for (const s of MAJOR) lit[s] = true;
    this.wizard = { lit: lit, collected: 0, value: SC.supernovaShot, finalLit: false, saveUntil: this.now() + 25 };
    this.supernovas++;
    this.gstats.supernovas++;
    this.show({ kind: 'wizard', t1: 'SUPERNOVA', t2: 'EVERY SHOT IS LIT', dur: 3.5, prio: 9 });
    this.fx({ type: 'sound', id: 'supernova' });
    this.fx({ type: 'music', state: 'wizard' });
    this.fx({ type: 'lampshow', id: 'supernova', dur: 3.5 });
    this.fx({ type: 'shake', amt: 6 });
    this.game.schedule(2.8, () => this.game.addBalls(3));
  };

  Rules.prototype.wizardShot = function (name, e) {
    const W = this.wizard;
    if (W.lit[name]) {
      W.lit[name] = false;
      W.collected++;
      const v = this.award(W.value * this.comboMult, e && e.x, e && e.y, true);
      W.value += 1000000;
      this.show({ kind: 'jackpot', t1: 'SUPERNOVA ' + W.collected + '/6', t2: U.formatScore(v), dur: 1.6, prio: 7 });
      this.fx({ type: 'sound', id: 'jackpot' });
      this.fx({ type: 'lampshow', id: 'flashAll', dur: 0.8 });
      this.fx({ type: 'shake', amt: 4 });
      if (W.collected >= MAJOR.length) {
        W.finalLit = true;
        this.show({ kind: 'award', t1: 'SUPERNOVA JACKPOT', t2: 'SHOOT BLACK HOLE', dur: 2.2, prio: 8 });
        this.fx({ type: 'sound', id: 'supernovaLit' });
      }
    }
  };

  Rules.prototype.wizardFinal = function () {
    const W = this.wizard;
    const v = this.award(SC.supernovaFinal * this.supernovas, null, null, true);
    W.finalLit = false;
    for (const s of MAJOR) W.lit[s] = true;
    W.collected = 0;
    W.value += 2000000;
    this.show({ kind: 'superjackpot', t1: 'SUPERNOVA', t2: U.formatScore(v), dur: 3.5, prio: 10 });
    this.fx({ type: 'sound', id: 'superjackpot' });
    this.fx({ type: 'slowmo', scale: 0.25, dur: 1.2 });
    this.fx({ type: 'lampshow', id: 'supernova', dur: 3 });
    this.fx({ type: 'shake', amt: 9 });
    this.fx({ type: 'vibrate', ms: [100, 50, 100, 50, 300] });
  };

  Rules.prototype.endWizard = function () {
    if (!this.wizard) return;
    this.wizard = null;
    // missions start over for another run at SUPERNOVA
    for (const m of this.missions) m.done = false;
    this.missionsCompleted = 0;
    this.missionLit = true;
    this.show({ kind: 'award', t1: 'SUPERNOVA', t2: 'TOTAL ' + U.formatScore(this.score), dur: 2.2, prio: 5 });
    this.fx({ type: 'music', state: 'normal' });
  };

  // ------------------------------------------------------------ input ---
  // Flipper buttons: lane change, mission select, bonus skip
  Rules.prototype.onFlipper = function (side, down) {
    if (!down) return;
    if (this.selecting) { this.selectStep(side === 'L' ? -1 : 1); return; }
    if (!this.gameActive || this.tilted) return;
    // lane change: rotate lit lanes (and the skill shot lane while it is live)
    if (side === 'L') {
      this.lanes.push(this.lanes.shift());
      if (this.skillActive) this.skillLane = (this.skillLane + 2) % 3;
    } else {
      this.lanes.unshift(this.lanes.pop());
      if (this.skillActive) this.skillLane = (this.skillLane + 1) % 3;
    }
  };

  // -------------------------------------------------------------- tick ---
  Rules.prototype.tick = function (dt) {
    const P = this.game.P;
    if (this.tiltBob > 0) this.tiltBob = Math.max(0, this.tiltBob - P.tiltDecay * dt);
    // display scenes
    if (this.scene) {
      this.scene.t += dt;
      if (this.scene.t >= this.scene.dur) this.scene = this.display.length ? this.display.shift() : null;
    }
    if (!this.gameActive) return;
    this.gstats.time += dt;
    if (this.selecting && this.now() >= this.selecting.until) this.selectConfirm();
    const M = this.mission;
    if (M && !this.game.holdingForShow()) {
      if (M.def.tick) M.def.tick(M.st, this, dt);
      M.timeLeft -= dt;
      if (M.timeLeft <= 5 && M.timeLeft + dt > Math.ceil(M.timeLeft) && M.timeLeft > 0) this.fx({ type: 'sound', id: 'timerTick' });
      if (M.timeLeft <= 0) this.endMission(false);
    }
    if (this.comboCount > 0 && this.now() - this.lastMajor > COMBO_WINDOW) { this.comboCount = 0; this.comboMult = 1; }
  };

  Rules.prototype.nextHighScore = function () {
    let best = null;
    for (const h of this.highScores) if (h.score > this.score && (!best || h.score < best.score)) best = h;
    return best;
  };

  // ------------------------------------------------------------- lamps ---
  // Returns { id: state } where state is 0 off, 1 on, 2 slow blink, 3 fast blink,
  // or an object { s, c } with a colour override.
  Rules.prototype.lamps = function () {
    const L = {};
    const R = this;
    if (!this.gameActive || this.tilted) return L;
    // arrows
    for (const s of MAJOR) {
      const id = 'arrow_' + s;
      if (R.wizard) {
        if ((s === 'scoop' && R.wizard.finalLit) || R.wizard.lit[s]) L[id] = { s: 3, c: '#ffffff' };
        continue;
      }
      if (R.mb && R.mb.jackpots[s]) { L[id] = { s: 3, c: '#ff2b4f' }; continue; }
      if (s === 'scoop' && R.mb && R.mb.superLit) { L[id] = { s: 3, c: '#ff2b4f' }; continue; }
      if (R.mission) {
        const lit = R.mission.def.lit(R.mission.st, R);
        if (lit[s]) { L[id] = { s: 2, c: R.mission.def.color }; continue; }
      }
      if (s === 'scoop' && R.supernovaLit) { L[id] = { s: 3, c: '#ffffff' }; continue; }
      if (s === 'scoop' && R.missionLit && !R.mission && !R.mb) { L[id] = { s: 2, c: '#ffffff' }; continue; }
      if (s === 'rightRamp' && R.lockLit && !R.mb) { L[id] = { s: 2, c: '#ffe14d' }; continue; }
      if (s === 'leftOrbit' && R.extraBallLit) { L[id] = { s: 2, c: '#ff9b2f' }; continue; }
      if (s === 'leftRamp' && !R.mb && !R.lockLit) { L[id] = { s: 1, c: '#36c8ff', dim: 0.35 }; continue; }
      if (R.comboCount >= 1 && R.now() - R.lastMajor < COMBO_WINDOW) { L[id] = { s: 2, c: '#3dff8a', dim: 0.5 }; continue; }
    }
    if (R.extraBallLit) L.extraball = 2;
    if (R.lockLit && !R.mb) L.lock = 2;
    if (!R.lockLit && !R.mb) L.lightlock = 1;
    if (R.locked >= 1) L.lock1 = 1;
    if (R.locked >= 2) L.lock2 = 1;
    if (R.missionLit && !R.mission && !R.mb) L.mission = 2;
    if (R.mb && R.mb.superLit) L.superjackpot = 3;
    if (R.mission && R.mission.def.id === 'pulsar') L.spinner = 3;
    R.missions.forEach((m) => {
      if (m.done) L['m_' + m.def.id] = 1;
      else if (R.mission && R.mission.def === m.def) L['m_' + m.def.id] = 3;
      else if (R.selecting && R.selecting.list[R.selecting.i] === m) L['m_' + m.def.id] = 3;
    });
    if (R.supernovaLit) L.supernova = 3;
    else if (R.wizard) L.supernova = 2;
    for (let i = 2; i <= 6; i++) if (R.bonusX >= i) L['bonus' + i] = 1;
    if (R.ballSaveActive() && !R.ballSaveArmed) L.shootagain = R.ballSaveUntil - R.now() < 2 ? 3 : 2;
    else if (R.extraBallsPending > 0) L.shootagain = 1;
    if (R.kickbackLit) L.kickback = 1;
    for (let i = 0; i < 3; i++) {
      if (R.skillActive && i === R.skillLane) L['lane' + (i + 1)] = 3;
      else if (R.lanes[i]) L['lane' + (i + 1)] = 1;
    }
    for (let i = 0; i < 4; i++) if (R.planets[i]) L['l_planet' + (i + 1)] = 1;
    const horizon = R.mission && R.mission.def.litDrops && R.mission.def.litDrops(R.mission.st);
    for (let i = 0; i < 3; i++) {
      if (!R.dropsState[i]) L['l_drop' + (i + 1)] = horizon ? 3 : (R.kickbackLit ? 0 : 2);
    }
    return L;
  };

  // Default display data
  Rules.prototype.status = function () {
    let line = '';
    if (this.wizard) line = 'SUPERNOVA ' + this.wizard.collected + '/6';
    else if (this.mission) line = this.mission.def.name + '  ' + Math.max(0, Math.ceil(this.mission.timeLeft));
    else if (this.mb) line = this.mb.superLit ? 'SHOOT SUPER JACKPOT' : 'SHOOT JACKPOTS';
    else if (this.supernovaLit) line = 'SHOOT BLACK HOLE';
    else if (this.missionLit) line = 'MISSION LIT';
    else if (this.lockLit) line = 'LOCK IS LIT';
    return {
      score: this.score, ball: this.ball, balls: this.cfg.balls, line: line,
      mission: this.mission ? { name: this.mission.def.name, time: this.mission.timeLeft, progress: this.mission.def.progress(this.mission.st), status: this.mission.def.status(this.mission.st), color: this.mission.def.color } : null,
      next: this.nextHighScore(), bonusX: this.bonusX, missionsDone: this.missionsCompleted,
      combo: this.comboCount, comboMult: this.comboMult, mb: !!this.mb, wizard: !!this.wizard,
    };
  };

  NN.Rules = Rules;
})(globalThis.NN || (globalThis.NN = {}));
