// Where does a plunge go? Launches the ball many times the way players do
// (full pull, medium pull, a touch tap, soft pulls) and reports the path it
// takes and which flipper gets it first. Used to keep launches varied and the
// skill shot reachable.
//   node tools/plunge-map.js [launches-per-style] [--json]
const NN = require('./load.js');
const DT = 1 / 480;
const N = +(process.argv[2] || 40);
const asJson = process.argv.includes('--json');

// how a player launches: hold the plunger for a time (keyboard / drag), or tap
const STYLES = {
  full: { hold: 1.0 },                 // pull all the way
  strong: { holdRange: [0.45, 0.62] }, // 70-100 %
  medium: { holdRange: [0.25, 0.45] }, // 40-70 %
  soft: { holdRange: [0.12, 0.25] },   // 20-40 %
  tap: { tap: true },                  // touch tap without a drag
};

function launchOnce(style, seed) {
  const g = new NN.Game({ seed: seed });
  g.quiet = true;
  g.startGame('arcade', seed * 31 + 7);
  let t = 0;
  while (!g.shooterBall() && t < 3) { g.tick(DT); t += DT; }
  for (let i = 0; i < 240; i++) g.tick(DT);     // settle on the plunger
  const R = g.rules;
  const lit = R.skillLane;
  const seen = { lanes: [], bumpers: 0, wires: [], orbitTop: false, scoop: false, ramps: [], slings: 0, skill: false };
  const orig = g.handleEvent.bind(g);
  g.handleEvent = (e) => {
    if (e.type === 'sensor' && /^lane[123]$/.test(e.id) && e.dir === 1) seen.lanes.push(+e.id.slice(4) - 1);
    if (e.type === 'sensor' && e.id === 'orbitTop') seen.orbitTop = true;
    if (e.type === 'sensor' && /Made$/.test(e.id)) seen.ramps.push(e.id);
    if (e.type === 'bumper') seen.bumpers++;
    if (e.type === 'sling') seen.slings++;
    if (e.type === 'wire') seen.wires.push(e.id);
    if (e.type === 'capture') seen.scoop = true;
    orig(e);
  };
  const skills0 = R.gstats.skillShots;
  // a varied but repeatable hold time per launch
  const rnd = NN.U.rng(seed * 977 + 13);
  const S = STYLES[style];
  if (S.tap) {
    g.applyInput({ type: 'plungerTap' });
  } else {
    const hold = S.hold || S.holdRange[0] + rnd() * (S.holdRange[1] - S.holdRange[0]);
    g.applyInput({ type: 'plunger', down: true });
    for (let i = 0, n = Math.round(hold / DT); i < n; i++) g.tick(DT);
    g.applyInput({ type: 'plunger', down: false });
  }
  let end = 'timeout';
  t = 0;
  while (t < 10) {
    g.tick(DT); t += DT;
    const b = g.world.balls.find((x) => x.state === 'play' && x.layer === 0 && x.x < 464 && x.y > 860);
    if (b) { end = b.x < 237 ? 'L' : 'R'; break; }
    if (g.state !== 'playing' || (g.world.balls.length === 0)) { end = 'drain'; break; }
    if (g.shooterBall() && t > 1.5 && !g.world.plunger.launching) { end = 'fellBack'; break; }
  }
  seen.skill = R.gstats.skillShots > skills0;
  const path = seen.lanes.length ? 'lanes' : seen.bumpers ? 'bumpers' : seen.scoop ? 'scoop' : seen.ramps.length ? 'ramp' : seen.wires.length ? seen.wires[0] : seen.orbitTop ? 'orbit' : 'other';
  return { end, path, t, lit, lanes: seen.lanes, skill: seen.skill, bumpers: seen.bumpers };
}

function summarise(style) {
  const rows = [];
  for (let i = 0; i < N; i++) rows.push(launchOnce(style, 101 + i * 7));
  const count = (f) => rows.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
  const outcome = count((r) => r.path + '>' + r.end);
  const top = Math.max(...Object.values(outcome)) / rows.length;
  return {
    style,
    paths: count((r) => r.path),
    firstFlipper: count((r) => r.end),
    topOutcomeShare: +top.toFixed(2),          // share of the single most common path+flipper
    skillShotRate: +(rows.filter((r) => r.skill).length / rows.length).toFixed(2),
    anyLaneRate: +(rows.filter((r) => r.lanes.length).length / rows.length).toFixed(2),
    medianSecondsToFlipper: +rows.map((r) => r.t).sort((a, b) => a - b)[Math.floor(rows.length / 2)].toFixed(2),
  };
}

const out = Object.keys(STYLES).map(summarise);
if (asJson) console.log(JSON.stringify(out, null, 1));
else {
  for (const s of out) {
    console.log(`${s.style.padEnd(7)} top outcome ${(s.topOutcomeShare * 100).toFixed(0)}% | skill ${(s.skillShotRate * 100).toFixed(0)}% lanes ${(s.anyLaneRate * 100).toFixed(0)}% | ${s.medianSecondsToFlipper}s | first flipper ${JSON.stringify(s.firstFlipper)} | paths ${JSON.stringify(s.paths)}`);
  }
}
