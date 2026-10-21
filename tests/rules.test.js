// Rules engine tests: skill shot, lanes, ball save, missions, multiball, combos,
// tilt, extra balls, wizard, plus full bot-played games headless.
const { NN, test, run, note, assert } = require('./lib');
const DT = 1 / 480;

function newGame(diff) {
  const g = new NN.Game({ seed: 5 });
  g.startGame(diff || 'arcade', 42);
  return g;
}
function run_(g, s) { const n = Math.round(s / DT); for (let i = 0; i < n; i++) g.tick(DT); }
function sensor(g, id, dir, x, y) {
  const b = g.world.balls[0] || g.world.addBall(200, 500);
  g.handleEvent({ type: 'sensor', id: id, dir: dir == null ? 1 : dir, ball: b, x: x || b.x, y: y || b.y });
}
function scoopBall(g) {
  const b = g.world.addBall(240, 338);
  b.state = 'held'; b.holder = 'scoop';
  g.onScoop(b);
  return b;
}
function inPlayBall(g) {
  // launch the served ball so it is out of the shooter lane
  g.world.balls.length = 0;
  return g.world.addBall(240, 600, 0, 0);
}

test('new game state', () => {
  const g = newGame();
  const R = g.rules;
  assert(R.score === 0 && R.ball === 1, 'score 0, ball 1');
  assert(R.missionLit, 'mission lit at start');
  assert(R.kickbackLit, 'kickback lit at start');
  assert(g.world.balls.length === 1 && g.shooterBall(), 'ball waiting in the shooter lane');
});

test('skill shot: lit lane on the plunge scores and grows', () => {
  const g = newGame();
  const R = g.rules;
  R.skillLane = 1;
  g.applyInput({ type: 'flip', side: 'R', down: true }); // lane change right
  g.applyInput({ type: 'flip', side: 'R', down: false });
  assert(R.skillLane === 2, 'right flipper moves the lit lane right');
  sensor(g, 'shooterLane', 1);
  const before = R.score;
  sensor(g, 'lane3', 1);
  assert(R.score - before >= NN.SCORES.skill, 'skill shot awarded');
  assert(R.gstats.skillShots === 1, 'skill shot counted');
  assert(R.skillValue === NN.SCORES.skill + NN.SCORES.skillStep, 'skill value grows');
});

test('top diverter: up for the plunge, down once the ball reaches the playfield', () => {
  const g = newGame();
  run_(g, 0.5);
  assert(g.shooterBall() && g.diverter.active, 'post up while the ball waits in the shooter lane');
  g.applyInput({ type: 'flip', side: 'L', down: true });
  run_(g, 0.01);
  assert(!g.diverter.active, 'holding the left flipper drops it');
  g.applyInput({ type: 'flip', side: 'L', down: false });
  run_(g, 0.01);
  assert(g.diverter.active, 'and it pops back up');
  // where the knocked-down ball lands first is down to physics (the sweep in
  // table.test.js covers that); here only the game logic is checked
  const PF = { bumper: 1, sling: 1, target: 1, drop: 1, spin: 1, sensor: 1, capture: 1 };
  let hit = false, sw = null, upAtSwitch = false;
  const orig = g.handleEvent.bind(g);
  g.handleEvent = (e) => {
    if (e.type === 'hit' && e.id === 'diverter') hit = true;
    if (!sw && PF[e.type] && e.id !== 'shooterLane' && e.id !== 'orbitTop') { sw = e.type + ' ' + (e.id || ''); upAtSwitch = g.diverter.active; }
    orig(e);
  };
  g.world.plungerLaunch(1);
  run_(g, 0.15);
  assert(!g.shooterBall() && g.diverter.active, 'stays up while the plunge goes round the arch');
  for (let i = 0; i < 480 * 3 && !sw; i++) g.tick(DT);
  assert(hit && sw && upAtSwitch, 'the plunge hit the post and reached the playfield with the post still up (' + sw + ')');
  run_(g, 0.01);
  assert(!g.diverter.active, 'down after the first playfield switch, so orbit shots loop');
  note('full plunge: post, then ' + sw);

  // multiball: with another ball in play the post stays down, so that ball's
  // loop shots are not blocked by a launch
  const m = newGame();
  run_(m, 0.5);
  assert(m.diverter.active, 'post up for a lone plunge');
  m.world.addBall(240, 600, 0, 0);
  run_(m, 0.01);
  assert(m.shooterBall() && !m.diverter.active, 'post down while another ball is in play');

  // super skill: hold the left flipper through the plunge
  const h = newGame();
  run_(h, 0.5);
  h.applyInput({ type: 'flip', side: 'L', down: true });
  run_(h, 0.05);
  h.world.plungerLaunch(1);
  run_(h, 1.2);
  assert(!h.diverter.active, 'post stays down for a left-flipper plunge');
  assert(h.rules.superSkillUntil > h.time, 'the plunge went round and lit the super skill');
});

test('Orion belt raises the bonus multiplier', () => {
  const g = newGame();
  const R = g.rules;
  R.skillActive = false;
  sensor(g, 'lane1'); sensor(g, 'lane2'); sensor(g, 'lane3');
  assert(R.bonusX === 2, 'bonus 2X after the belt, got ' + R.bonusX);
  assert(R.lanes.every((v) => !v), 'lanes reset');
});

test('ball save returns a drained ball, then ball ends after it expires', () => {
  const g = newGame();
  const R = g.rules;
  const b = inPlayBall(g);
  g.handleEvent({ type: 'bumper', id: 'bumperA', ball: b, x: 200, y: 200, speed: 500 });
  assert(R.ballSaveActive(), 'ball save running');
  b.state = 'gone';
  run_(g, 0.05);
  assert(R.gstats.ballSaves === 1, 'ball saved');
  run_(g, 2);
  assert(g.world.balls.length >= 1, 'replacement ball served');
  // keep the replacement out of play (nobody is flipping) while the save runs out
  for (const bb of g.world.balls) { bb.state = 'play'; bb.x = 240; bb.y = 600; bb.vx = bb.vy = 0; bb.frozen = true; }
  const step = g.world.moveBall.bind(g.world);
  g.world.moveBall = (bb, h) => { if (!bb.frozen) step(bb, h); };
  run_(g, 10);
  g.world.moveBall = step;
  // drain everything now that the save is over
  for (const bb of g.world.balls) bb.state = 'gone';
  run_(g, 0.05);
  assert(g.state === 'bonus', 'bonus count after the drain, state=' + g.state);
  run_(g, 8);
  assert(R.ball === 2 && g.state === 'playing', 'ball 2 started');
});

test('bonus count can be skipped with both flippers', () => {
  const g = newGame();
  const R = g.rules;
  const b = inPlayBall(g);
  R.firstSwitch(); R.ballSaveUntil = -1;
  for (let i = 0; i < 5; i++) R.shot('leftRamp', {});
  b.state = 'gone';
  run_(g, 0.05);
  assert(g.state === 'bonus', 'bonus started');
  g.applyInput({ type: 'flip', side: 'L', down: true });
  g.applyInput({ type: 'flip', side: 'R', down: true });
  run_(g, 0.6);
  assert(R.ball === 2, 'skipped to ball 2');
});

test('mission: select at the Black Hole, complete COMET CHASE', () => {
  const g = newGame();
  const R = g.rules;
  inPlayBall(g);
  R.firstSwitch();
  scoopBall(g);
  assert(R.selecting, 'mission select running');
  assert(R.selecting.list[0].def.id === 'comet', 'first mission offered');
  g.applyInput({ type: 'plunger', down: true });
  assert(R.mission && R.mission.def.id === 'comet', 'mission started');
  run_(g, 3);
  assert(!g.scoopBall, 'ball ejected after the intro');
  for (let i = 0; i < 6; i++) R.shot(i % 2 ? 'leftRamp' : 'rightRamp', {});
  assert(!R.mission, 'mission over');
  assert(R.missions[0].done && R.missionsCompleted === 1, 'mission completed');
  assert(!R.missionLit, 'mission needs relighting');
  for (let i = 1; i <= 4; i++) g.handleEvent({ type: 'target', id: 'planet' + i, ball: g.world.balls[0], x: 0, y: 0 });
  assert(R.missionLit, 'planets relight the mission');
});

test('mission timer runs out', () => {
  const g = newGame();
  const R = g.rules;
  inPlayBall(g);
  scoopBall(g);
  R.selectConfirm();
  run_(g, 3);
  assert(R.mission, 'mission running');
  run_(g, 45);
  assert(!R.mission && !R.missions[0].done, 'mission failed on time');
});

test('every mission can be completed', () => {
  for (let k = 0; k < NN.MISSIONS.length; k++) {
    const g = newGame();
    const R = g.rules;
    inPlayBall(g);
    scoopBall(g);
    R.selecting.i = k;
    R.selectConfirm();
    run_(g, 3);
    const id = R.mission.def.id;
    const b = g.world.balls[0];
    for (let n = 0; n < 200 && R.mission; n++) {
      if (id === 'comet') R.shot('leftRamp', {});
      else if (id === 'pulsar') g.handleEvent({ type: 'spin', id: 'spinner' });
      else if (id === 'meteor') g.handleEvent({ type: 'bumper', id: 'bumperA', ball: b, x: 0, y: 0 });
      else if (id === 'rogue') R.shot(NN.MAJOR_SHOTS.filter((x) => x !== 'comet')[R.mission.st.at], {});
      else if (id === 'constellation') R.shot(R.mission.st.seq[R.mission.st.i], {});
      else if (id === 'horizon') {
        if (R.mission.st.phase === 1) for (let i = 1; i <= 3; i++) g.handleEvent({ type: 'drop', id: 'drop' + i, ball: b, x: 0, y: 0 });
        else { const s = scoopBall(g); run_(g, 3); }
      }
      run_(g, 0.05);
    }
    assert(R.missions[k].done, NN.MISSIONS[k].name + ' should complete');
  }
});

test('lock two balls to start Nebula Multiball; jackpots and super jackpot', () => {
  const g = newGame();
  const R = g.rules;
  let b = inPlayBall(g);
  R.firstSwitch();
  R.shot('leftRamp', {});
  assert(R.lockLit, 'left ramp lights lock');
  sensor(g, 'rampRMade', 1);
  assert(R.locked === 1 && g.lockBalls.length === 1, 'ball 1 locked');
  run_(g, 2);
  assert(g.shooterBall(), 'new ball served after the lock');
  g.world.plungerLaunch(0.6);
  run_(g, 1.5);
  R.shot('leftRamp', {});
  b = g.world.addBall(370, 300, 0, -500);
  g.handleEvent({ type: 'sensor', id: 'rampRMade', dir: 1, ball: b, x: 0, y: 0 });
  assert(R.mb, 'multiball started');
  run_(g, 6);
  assert(g.ballsInPlay() >= 3 || g.world.balls.filter((x) => x.state !== 'held').length >= 3, 'three balls in play, got ' + g.ballsInPlay());
  const s0 = R.score;
  R.shot('leftRamp', {});
  R.shot('rightRamp', {});
  assert(R.gstats.jackpots === 2, 'two jackpots');
  assert(R.mb.superLit, 'super jackpot lit');
  scoopBall(g);
  assert(R.gstats.superJackpots === 1, 'super jackpot collected');
  assert(g.timeScale < 1, 'slow-motion beat on the super jackpot');
  assert(R.extraBallLit, 'first super lights extra ball');
  assert(R.score - s0 > NN.SCORES.superJackpot, 'big points');
});

test('combos chain within the window and grow the multiplier', () => {
  const g = newGame();
  const R = g.rules;
  inPlayBall(g);
  R.shot('leftRamp', {}); run_(g, 1);
  R.shot('rightRamp', {}); run_(g, 1);
  R.shot('leftOrbit', {});
  assert(R.comboCount === 3 && R.comboMult === 1.5, 'three-way combo x1.5, got ' + R.comboCount + ' x' + R.comboMult);
  run_(g, 5);
  R.shot('leftRamp', {});
  assert(R.comboCount === 1, 'combo resets after the window');
});

test('nudging: DANGER warnings, then TILT kills flippers and the bonus', () => {
  const g = newGame();
  const R = g.rules;
  const b = inPlayBall(g);
  R.firstSwitch(); R.ballSaveUntil = -1;
  let warnings = 0, tilted = false;
  for (let i = 0; i < 20 && !tilted; i++) {
    g.applyInput({ type: 'nudge', dir: 'L' });
    if (R.tiltWarningsUsed > warnings) warnings = R.tiltWarningsUsed;
    tilted = R.tilted;
    run_(g, 0.1);
  }
  assert(tilted, 'tilted after many nudges');
  assert(warnings >= 2, 'warned before tilting');
  assert(!g.flippersEnabled && !g.world.flipperById.L.enabled, 'flippers dead');
  const score = R.score;
  b.state = 'gone';
  run_(g, 5);
  assert(R.score === score, 'no bonus on a tilted ball');
  assert(R.ball === 2 && g.flippersEnabled, 'next ball, flippers back');
});

test('spaced-out nudges never tilt', () => {
  const g = newGame();
  const R = g.rules;
  inPlayBall(g);
  for (let i = 0; i < 12; i++) { g.applyInput({ type: 'nudge', dir: 'R' }); run_(g, 2.5); }
  assert(!R.tilted && R.tiltWarningsUsed === 0, 'no warnings');
});

test('extra ball after two missions; shoot again keeps the ball number', () => {
  const g = newGame();
  const R = g.rules;
  inPlayBall(g);
  R.firstSwitch(); R.ballSaveUntil = -1;
  for (let k = 0; k < 2; k++) {
    R.startMission(R.missions[k]);
    R.endMission(true);
  }
  assert(R.extraBallLit, 'extra ball lit');
  R.shot('leftOrbit', {});
  assert(R.extraBallsPending === 1, 'extra ball pending');
  for (const b of g.world.balls) b.state = 'gone';
  run_(g, 0.05);
  g.bonus.skip = true;
  run_(g, 1);
  assert(R.ball === 1 && g.state === 'playing', 'shoot again on ball 1');
});

test('replay score awards an extra ball once', () => {
  const g = newGame();
  const R = g.rules;
  inPlayBall(g);
  R.award(R.cfg.replay + 10);
  R.award(R.cfg.replay);
  assert(R.extraBallsPending === 1 && R.replayAwarded, 'one replay');
});

test('asteroids light the kickback, which fires once', () => {
  const g = newGame();
  const R = g.rules;
  const b = inPlayBall(g);
  R.kickbackLit = false;
  for (let i = 1; i <= 3; i++) g.handleEvent({ type: 'drop', id: 'drop' + i, ball: b, x: 0, y: 0 });
  assert(R.kickbackLit, 'kickback lit');
  assert(!g.dropColliders.drop1.active, 'targets down');
  run_(g, 1.5);
  assert(g.dropColliders.drop1.active, 'targets reset');
  b.x = 30; b.y = 920; b.vy = 900;
  g.handleEvent({ type: 'sensor', id: 'kickback', dir: 1, ball: b });
  assert(b.vy < -2000 && !R.kickbackLit, 'kicked back up');
});

test('SUPERNOVA: all six missions light the wizard mode', () => {
  const g = newGame();
  const R = g.rules;
  inPlayBall(g);
  R.firstSwitch();
  for (const m of R.missions) { R.startMission(m); R.endMission(true); }
  assert(R.supernovaLit, 'supernova lit');
  run_(g, 3.5);
  scoopBall(g);
  assert(R.wizard, 'wizard running');
  run_(g, 8);
  assert(g.ballsInPlay() >= 4, 'four-ball light show, got ' + g.ballsInPlay());
  for (const s of NN.MAJOR_SHOTS) R.shot(s, {});
  assert(R.wizard.finalLit, 'supernova jackpot lit');
  const s0 = R.score;
  scoopBall(g);
  assert(R.score - s0 >= NN.SCORES.supernovaFinal, 'supernova jackpot');
});

test('casual difficulty: 5 balls and a longer ball save', () => {
  const g = newGame('casual');
  assert(g.rules.cfg.balls === 5, 'five balls');
  inPlayBall(g);
  g.rules.firstSwitch();
  assert(g.rules.ballSaveUntil - g.time >= 15 - 0.01, 'long ball save');
});

test('bot plays full headless games without errors', () => {
  const results = [];
  for (let k = 0; k < 4; k++) {
    const g = new NN.Game({ seed: 100 + k });
    g.quiet = true;
    g.startGame('arcade', 200 + k);
    g.bot = new NN.Bot(g, { skill: 0.8, seed: 300 + k });
    let t = 0;
    while (g.state !== 'gameover' && t < 1800) { g.tick(DT); t += DT; }
    assert(g.state === 'gameover', 'game should end (t=' + t.toFixed(0) + ')');
    results.push(`${(t / 60).toFixed(1)} min ${NN.U.formatScore(g.rules.score)}`);
  }
  note('games: ' + results.join(' | '));
});

test('DMD renders every scene and a whole game without errors', () => {
  const g = newGame();
  const d = new NN.DMD();
  const kinds = ['award', 'ballStart', 'skillshot', 'combo', 'jackpot', 'superjackpot', 'multiball', 'lock', 'blackhole',
    'mode_start', 'mode_step', 'mode_complete', 'mode_end', 'extraball', 'replay', 'shootagain', 'tilt', 'danger', 'ballsaved', 'wizard'];
  for (const k of kinds) {
    g.rules.scene = { kind: k, t1: 'JACKPOT', t2: '12,000,000', dur: 2, prio: 5, t: 0, n: 3 };
    let lit = 0;
    for (let i = 0; i < 30; i++) { d.render(g, 1 / 30); }
    for (const v of d.buf) if (v) lit++;
    assert(lit > 30 || k === 'tilt', k + ' scene should draw something');
  }
  g.rules.scene = null;
  inPlayBall(g);
  scoopBall(g);
  d.render(g, 0.02);
  assert(d.buf.some((v) => v), 'mission select draws');
  // a whole bot game through every state
  const h = new NN.Game({ seed: 9 });
  h.quiet = true;
  h.startGame('arcade', 9);
  h.bot = new NN.Bot(h, { skill: 0.8, seed: 9 });
  let t = 0;
  while (h.state !== 'gameover' && t < 900) { h.tick(DT); t += DT; if ((t * 480 | 0) % 16 === 0) d.render(h, 1 / 30); }
  d.render(h, 0.02);
  h.state = 'attract';
  for (let i = 0; i < 600; i++) d.render(h, 1 / 30);
});

if (require.main === module) run().then((f) => process.exit(f ? 1 : 0));
