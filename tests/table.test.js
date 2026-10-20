// Full-table harness: robustness on every layer, no dead zones, and every
// major shot reachable from a cradled ball.
const { NN, test, run, note, assert, makeWorld, freeSpot, installChecker, insideCabinet } = require('./lib');
const DT = 1 / 480;
function stepFor(w, s, each) { const n = Math.round(s / DT); for (let i = 0; i < n; i++) { if (each && each(i * DT) === false) return; w.tick(DT); } }

const SHOT_EVENTS = {
  leftOrbit: (e) => e.type === 'sensor' && e.id === 'orbitTop' && e.dir === 1 && e.ball.flags.upL,
  rightOrbit: (e) => e.type === 'sensor' && e.id === 'orbitTop' && e.dir === -1 && e.ball.flags.upR,
  leftRamp: (e) => e.type === 'sensor' && e.id === 'rampLMade',
  rightRamp: (e) => e.type === 'sensor' && e.id === 'rampRMade',
  scoop: (e) => e.type === 'capture' && e.id === 'scoop',
  comet: (e) => e.type === 'sensor' && e.id === 'comet' && e.dir === 1,
  drops: (e) => e.type === 'drop',
  planetsLeft: (e) => e.type === 'target' && (e.id === 'planet1' || e.id === 'planet2'),
  planetsCentre: (e) => e.type === 'target' && (e.id === 'planet3' || e.id === 'planet4'),
  bumpers: (e) => e.type === 'bumper',
  lanes: (e) => e.type === 'sensor' && /^lane/.test(e.id),
};

// Cradle a ball on flipper `fid`, release it, re-press after `delay` seconds and
// report the first shot the ball makes.
function cradleShot(fid, delay, P) {
  const { w } = makeWorld(P);
  const f = w.flipperById[fid];
  f.pressed = true;
  stepFor(w, 0.08);
  const b = w.addBall(f.px + Math.cos(f.up) * 40, f.py + Math.sin(f.up) * 40 - 24, 0, 50);
  stepFor(w, 1.6);
  if (Math.hypot(b.vx, b.vy) > 5) return { shot: 'nocradle' };
  w.events.length = 0;
  let t = 0, first = null;
  const hits = new Set();
  stepFor(w, 3.2, () => {
    f.pressed = t >= delay && t < delay + 0.4;
    t += DT;
    for (const e of w.events) {
      for (const k in SHOT_EVENTS) {
        if (SHOT_EVENTS[k](e)) { hits.add(k); if (!first && !['bumpers', 'lanes'].includes(k)) first = k; }
      }
    }
    w.events.length = 0;
    if (b.state !== 'play') return false;
  });
  return { shot: first || (b.state === 'gone' ? 'drain' : 'none'), hits: hits };
}
module.exports.cradleShot = cradleShot;

// Ball rolls down an inlane onto the lowered flipper; flip `delay` s after it
// crosses the inlane switch (shooting on the fly).
function inlaneShot(fid, delay, P) {
  const { w, T } = makeWorld(P);
  const f = w.flipperById[fid];
  const side = fid === 'L' ? T.landmarks.inlaneL : T.landmarks.inlaneR;
  const b = w.addBall(side.x, 790, 0, 700);
  let t = 0, first = null, crossed = -1;
  stepFor(w, 3.5, () => {
    for (const e of w.events) {
      if (e.type === 'sensor' && /^inlane/.test(e.id) && crossed < 0) crossed = t;
      if (crossed >= 0) for (const k in SHOT_EVENTS) if (SHOT_EVENTS[k](e) && !first && !['bumpers', 'lanes'].includes(k)) first = k;
    }
    w.events.length = 0;
    f.pressed = crossed >= 0 && t >= crossed + delay && t < crossed + delay + 0.4;
    t += DT;
    if (b.state !== 'play') return false;
  });
  return { shot: first || (b.state === 'gone' ? 'drain' : 'none') };
}
module.exports.inlaneShot = inlaneShot;

test('full table: random balls on every layer never tunnel or escape', () => {
  const rng = NN.U.rng(4242);
  const { w, P, T } = makeWorld();
  const stats = installChecker(w);
  let n = 0;
  for (let i = 0; i < 2500; i++) {
    w.balls.length = 0;
    let b;
    if (i % 5 === 0) {
      // start on a ramp, moving up or down it
      const r = T.ramps[(i / 5) % 2 | 0];
      const k = 1 + Math.floor(rng() * (r.axis.length - 2));
      const p = r.axis[k];
      const dx = r.axis[k + 1][0] - p[0], dy = r.axis[k + 1][1] - p[1], dl = Math.hypot(dx, dy);
      const sp = (rng() < 0.5 ? 1 : -1) * (500 + rng() * 3000);
      b = w.addBall(p[0], p[1], (dx / dl) * sp + (rng() - 0.5) * 400, (dy / dl) * sp, r.layer);
    } else {
      const p = freeSpot(w, rng);
      const a = rng() * Math.PI * 2, sp = 300 + rng() * (P.maxSpeed - 300);
      b = w.addBall(p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp);
    }
    const hold = { L: rng() < 0.5, R: rng() < 0.5 };
    stepFor(w, 2.5, () => {
      if (rng() < 0.02) hold.L = !hold.L;
      if (rng() < 0.02) hold.R = !hold.R;
      w.flipperById.L.pressed = hold.L;
      w.flipperById.R.pressed = hold.R;
      w.flipperById.U.pressed = hold.R;
      if (b.state === 'held') { b.state = 'gone'; }
      if (b.state === 'gone') return false;
    });
    n++;
  }
  note(`${n} balls, max substeps ${w.maxSubstepsSeen}, max move ${stats.maxMove.toFixed(2)} mm, crossing fixes ${w.crossFixes || 0}`);
  for (const s of stats.samples) note(s);
  assert(stats.crossings === 0, `${stats.crossings} wall crossings`);
  assert(stats.inside === 0, `${stats.inside} balls inside solids`);
  assert(stats.flipperInside === 0, `${stats.flipperInside} inside flippers`);
  assert(stats.escapes === 0, `${stats.escapes} escapes`);
});

test('no dead zones: balls dropped anywhere always drain or get captured', () => {
  const rng = NN.U.rng(2024);
  const { w } = makeWorld();
  const stuck = [];
  let n = 0, captured = 0, wires = 0;
  for (let i = 0; i < 1500; i++) {
    w.balls.length = 0;
    const p = freeSpot(w, rng, [14, 14, 462, 1000]);
    const v0 = [(rng() - 0.5) * 200, (rng() - 0.5) * 200];
    const b = w.addBall(p.x, p.y, v0[0], v0[1]);
    let slow = 0, t = 0;
    stepFor(w, 40, () => {
      t += DT;
      for (const e of w.events) if (e.type === 'wire') wires++;
      w.events.length = 0;
      if (b.state === 'held') { captured++; return false; }
      if (b.state !== 'play' && b.state !== 'wire') return false;
      slow = b.state === 'play' && Math.hypot(b.vx, b.vy) < 15 ? slow + DT : 0;
      if (slow > 4) return false;
    });
    n++;
    if (b.state === 'play' || b.state === 'wire') stuck.push(`(${p.x.toFixed(1)},${p.y.toFixed(1)} v ${v0[0].toFixed(1)},${v0[1].toFixed(1)}) -> (${b.x.toFixed(0)},${b.y.toFixed(0)}) v=${Math.hypot(b.vx, b.vy).toFixed(1)} t=${t.toFixed(1)}`);
  }
  note(`${n} drops: ${captured} captured by the scoop, ${wires} wire rides, ${stuck.length} stuck`);
  for (const s of stuck.slice(0, 12)) note('  stuck ' + s);
  assert(stuck.length === 0, 'balls got stuck');
});

test('every major shot can be made from a cradled ball', () => {
  const table = {};
  for (const fid of ['L', 'R', 'U']) {
    table[fid] = {};
    for (let d = 0; d <= 0.6; d += 0.002) {
      const r = cradleShot(fid, d);
      table[fid][r.shot] = (table[fid][r.shot] || 0) + 1;
    }
  }
  const need = ['leftOrbit', 'rightOrbit', 'leftRamp', 'rightRamp', 'scoop', 'comet', 'drops', 'planetsLeft', 'planetsCentre'];
  const missing = [];
  for (const k of need) {
    const by = ['L', 'R', 'U'].filter((f) => table[f][k]);
    if (!by.length) missing.push(k);
  }
  for (const fid of ['L', 'R', 'U']) {
    note(`${fid}: ` + Object.entries(table[fid]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  }
  assert(missing.length === 0, 'unreachable: ' + missing.join(', '));
});

test('shots on the fly from each inlane (report)', () => {
  for (const fid of ['L', 'R']) {
    const tally = {};
    for (let d = 0; d <= 0.45; d += 0.0025) {
      const r = inlaneShot(fid, d);
      tally[r.shot] = (tally[r.shot] || 0) + 1;
    }
    note(`${fid} flipper, ball from its inlane: ` + Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  }
});

if (require.main === module) run().then((f) => process.exit(f ? 1 : 0));
