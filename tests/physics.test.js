// Physics harness: thousands of random balls at every surface and flipper.
const { NN, test, run, note, assert, makeWorld, freeSpot, installChecker } = require('./lib');

const DT = 1 / 480;

function stepFor(w, seconds, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    if (each && each(i * DT) === false) return;
    w.tick(DT);
  }
}

test('flipper snaps up in about 30 ms and drops back slower', () => {
  const { w } = makeWorld();
  const f = w.flipperById.L;
  f.pressed = true;
  let t = 0;
  while (f.progress() < 0.999 && t < 0.2) { w.tick(DT); t += DT; }
  const up = t;
  f.pressed = false;
  t = 0;
  while (f.progress() > 0.001 && t < 0.3) { w.tick(DT); t += DT; }
  const down = t;
  note(`up ${(up * 1000).toFixed(1)} ms, down ${(down * 1000).toFixed(1)} ms`);
  assert(up > 0.018 && up < 0.04, 'up stroke should be about 30 ms');
  assert(down > up * 1.3, 'drop should be slower than the up stroke');
});

test('random balls at every surface: nothing tunnels, sticks inside or escapes', () => {
  const rng = NN.U.rng(12345);
  const { w, P } = makeWorld();
  const stats = installChecker(w);
  const N = 3000;
  let drained = 0;
  for (let i = 0; i < N; i++) {
    w.balls.length = 0;
    const p = freeSpot(w, rng);
    const ang = rng() * Math.PI * 2;
    const sp = 300 + rng() * (P.maxSpeed - 300);
    const b = w.addBall(p.x, p.y, Math.cos(ang) * sp, Math.sin(ang) * sp);
    const hold = { L: rng() < 0.5, R: rng() < 0.5 };
    stepFor(w, 2.0, () => {
      if (rng() < 0.02) hold.L = !hold.L;
      if (rng() < 0.02) hold.R = !hold.R;
      w.flipperById.L.pressed = hold.L;
      w.flipperById.R.pressed = hold.R;
      if (b.state !== 'play') return false;
    });
    if (b.state === 'gone') drained++;
  }
  note(`${N} balls, ${stats.substeps} substeps, max move/substep ${stats.maxMove.toFixed(2)} mm (limit ${(P.ballRadius * P.maxSubstepMove).toFixed(2)}), max substeps ${w.maxSubstepsSeen}, crossing fixes ${w.crossFixes || 0}, drained ${drained}`);
  for (const s of stats.samples) note(s);
  note('largest move: ' + stats.maxMoveAt);
  assert(stats.crossings === 0, `${stats.crossings} wall crossings`);
  assert(stats.inside === 0, `${stats.inside} balls inside solids`);
  assert(stats.flipperInside === 0, `${stats.flipperInside} balls inside flippers`);
  assert(stats.escapes === 0, `${stats.escapes} escapes`);
  assert(stats.maxMove <= P.ballRadius / 3 + 0.01, 'ball moved more than r/3 in a substep');
});

test('flipper barrage: fast balls hit flippers mid-swing and never pass through', () => {
  const rng = NN.U.rng(777);
  const { w, P } = makeWorld();
  const stats = installChecker(w);
  const N = 4000;
  let throughs = 0;
  for (let i = 0; i < N; i++) {
    w.balls.length = 0;
    const side = rng() < 0.5 ? 'L' : 'R';
    const f = w.flipperById[side];
    f.pressed = false; f.angle = f.rest; f.omega = 0; f.cos = Math.cos(f.angle); f.sin = Math.sin(f.angle);
    const other = w.flipperById[side === 'L' ? 'R' : 'L'];
    other.pressed = false;
    // aim at a random point along the swept arc of the bat
    const along = 10 + rng() * (f.length + 4);
    const sweep = f.rest + (f.up - f.rest) * rng();
    const tx = f.px + Math.cos(sweep) * along, ty = f.py + Math.sin(sweep) * along;
    const speed = 1500 + rng() * (P.maxSpeed - 1500);
    // come from above, from a random direction
    const ang = Math.PI / 2 + (rng() - 0.5) * 2.4; // direction of travel: downward-ish
    const dist = 60 + rng() * 40;
    const sx = tx - Math.cos(ang) * dist, sy = ty - Math.sin(ang) * dist;
    const b = w.addBall(sx, sy, 0, 0);
    if (!NN.Shapes) continue;
    const dx = tx - sx, dy = ty - sy, dl = Math.hypot(dx, dy);
    b.vx = (dx / dl) * speed; b.vy = (dy / dl) * speed;
    // reject starts that overlap anything
    const sc = { nx: 0, ny: 0, d: 0 };
    let bad = false;
    for (const c of w.colliders) { NN.Shapes.closest(c, b.x, b.y, sc); if (sc.d < b.r + 1) { bad = true; break; } }
    for (const ff of w.flippers) { ff.closest(b.x, b.y, sc); if (sc.d < b.r + 2) bad = true; }
    if (bad || !require('./lib').insideCabinet(w.table, b.x, b.y, b.r, -1)) { w.balls.length = 0; continue; }
    const arrive = dl / speed;
    const pressAt = Math.max(0, arrive - rng() * 0.035);
    let t = 0;
    const startSide = Math.sign(-(b.x - f.px) * f.sin + (b.y - f.py) * f.cos);
    stepFor(w, 0.5, () => {
      f.pressed = t >= pressAt && t < pressAt + 0.25;
      t += DT;
      if (b.state !== 'play') return false;
    });
    // never end up under the bat having come from above while it is alongside
    const lat = -(b.x - f.px) * f.sin + (b.y - f.py) * f.cos;
    const ax = (b.x - f.px) * f.cos + (b.y - f.py) * f.sin;
    if (b.state === 'play' && Math.sign(lat) !== startSide && ax > 5 && ax < f.length - 5 && Math.abs(lat) < f.r1 + b.r + 2) throughs++;
  }
  note(`${N} shots, max substeps ${w.maxSubstepsSeen}, crossing fixes ${w.crossFixes || 0}`);
  for (const s of stats.samples) note(s);
  assert(stats.flipperInside === 0, `${stats.flipperInside} substeps with a ball inside a flipper`);
  assert(stats.crossings === 0 && stats.inside === 0, 'wall violations');
  assert(throughs === 0, `${throughs} balls ended up through a flipper`);
});

function cradleTest(side) {
  const { w } = makeWorld();
  const f = w.flipperById[side];
  f.pressed = true;
  stepFor(w, 0.1);
  // drop the ball onto the middle of the raised bat
  const x = f.px + Math.cos(f.up) * 45, y = f.py + Math.sin(f.up) * 45 - 40;
  const b = w.addBall(x, y, 0, 200);
  stepFor(w, 3.0);
  const v1 = Math.hypot(b.vx, b.vy);
  const p1 = { x: b.x, y: b.y };
  stepFor(w, 3.0);
  const moved = Math.hypot(b.x - p1.x, b.y - p1.y);
  note(`${side}: cradled at (${b.x.toFixed(1)}, ${b.y.toFixed(1)}) speed ${v1.toFixed(2)} mm/s, drift ${moved.toFixed(3)} mm over 3 s`);
  assert(b.state === 'play', 'ball should not drain from a held flipper');
  assert(v1 < 5 && moved < 0.5, 'ball should rest in the cradle');
  assert(Math.hypot(b.x - f.px, b.y - f.py) < 40, 'ball should rest near the flipper base');
  return { w, b, f };
}
test('ball settles in the left cradle and stays', () => { cradleTest('L'); });
test('ball settles in the right cradle and stays', () => { cradleTest('R'); });

test('tip shots are strong, base shots are soft (true surface velocity)', () => {
  const speeds = [];
  const len = makeWorld().w.flipperById.L.length;
  const points = [0.29, 0.5, 0.71, 0.89].map((k) => Math.round(len * k));
  for (const along of points) {
    let best = 0;
    // sweep the flip timing and keep the best result for each contact point
    for (let trig = 4; trig <= 58; trig += 3) {
      const { w } = makeWorld();
      const f = w.flipperById.L;
      const sx = f.px + Math.cos(f.rest) * along;
      const surfY = f.py + Math.sin(f.rest) * along - f.halfWidthAt(along) / Math.cos(f.rest);
      const b = w.addBall(sx, surfY - 13.5 - 50, 0, 1200);
      stepFor(w, 0.12, () => {
        if (b.y > surfY - 13.5 - trig) f.pressed = true;
        best = Math.max(best, Math.hypot(b.vx, b.vy));
      });
    }
    speeds.push(best);
  }
  note('exit speed by contact point (' + points.join(', ') + ' mm from pivot): ' + speeds.map((s) => s.toFixed(0)).join(', ') + ' mm/s');
  // soft at the base, rising along the bat, and as strong at the tip as anywhere
  // (the bat's top speed caps it, so the outer half is a plateau)
  for (let i = 1; i < 3; i++) assert(speeds[i] > speeds[i - 1], 'speed should grow from the base outward');
  assert(speeds[3] > 0.95 * Math.max(...speeds), 'the tip should be on the plateau');
  assert(speeds[3] > 1.3 * speeds[0], 'tip shots should be much stronger than base shots');
  assert(speeds[3] > 4000, 'tip shot should be strong');
});

test('plunger: visible pull, launch power matches pull', () => {
  const out = [];
  for (const frac of [0.15, 0.4, 0.7, 1.0]) {
    const { w, T, P } = makeWorld();
    const b = w.addBall(T.ballStart.x, T.ballStart.y);
    stepFor(w, 0.3);
    w.plungerPull(true);
    let t = 0;
    const target = P.plungerMaxPull * frac;
    stepFor(w, 2, () => { if (w.plunger.pull >= target) return false; });
    w.plunger.pulling = false;
    stepFor(w, 0.15);
    const ballDrop = b.y - T.ballStart.y;
    w.plunger.pulling = true;
    w.plungerPull(false);
    let top = 1e9, vmax = 0;
    stepFor(w, 2.5, () => { top = Math.min(top, b.y); vmax = Math.max(vmax, -b.vy); t += DT; });
    out.push(`${(frac * 100) | 0}%: launch ${vmax.toFixed(0)} mm/s, ball followed pull ${ballDrop.toFixed(1)} mm, top y ${top.toFixed(0)}`);
    if (frac === 1.0) assert(top < 300, 'full plunge should clear the shooter lane');
    if (frac === 0.15) assert(top > 330, 'weak plunge should not clear the lane');
    assert(ballDrop > target - 2, 'ball should follow the plunger back');
  }
  for (const o of out) note(o);
});

test('no dead zones on the open table: dropped balls always drain', () => {
  const rng = NN.U.rng(99);
  const { w, T } = makeWorld();
  const stuck = [];
  let n = 0;
  for (let i = 0; i < 600; i++) {
    w.balls.length = 0;
    const p = freeSpot(w, rng, [14, 14, 462, 1000]);
    const b = w.addBall(p.x, p.y, 0, 0);
    let t = 0;
    let slow = 0;
    stepFor(w, 30, () => {
      t += DT;
      if (b.state !== 'play') return false;
      slow = Math.hypot(b.vx, b.vy) < 15 ? slow + DT : 0;
      if (slow > 3) return false;
    });
    n++;
    if (b.state === 'play') stuck.push(`(${p.x.toFixed(0)},${p.y.toFixed(0)}) -> (${b.x.toFixed(0)},${b.y.toFixed(0)}) v=${Math.hypot(b.vx, b.vy).toFixed(1)} t=${t.toFixed(1)}`);
  }
  note(`${n} drops, ${stuck.length} never drained`);
  for (const s of stuck.slice(0, 10)) note('  stuck ' + s);
  assert(stuck.length === 0, 'balls got stuck');
});


// ---- flipper skills: these come out of the physics, nothing is scripted ----
function cradled(side) {
  const { w, P } = makeWorld();
  const f = w.flipperById[side];
  f.pressed = true;
  stepFor(w, 0.1);
  const b = w.addBall(f.px + Math.cos(f.up) * 45, f.py + Math.sin(f.up) * 45 - 30, 0, 100);
  stepFor(w, 2.0);
  return { w, P, f, b, other: w.flipperById[side === 'L' ? 'R' : 'L'] };
}

test('live catch: a fast ball off the inlane is caught by a held flipper', () => {
  let caught = 0;
  const speeds = [600, 900, 1200, 1500, 1800];
  for (const v of speeds) {
    const { w } = makeWorld();
    const f = w.flipperById.L;
    f.pressed = true;
    stepFor(w, 0.1);
    // ball comes down the left inlane
    const b = w.addBall(w.table.landmarks.inlaneL.x, 830, 0, v);
    stepFor(w, 3.0);
    if (b.state === 'play' && Math.hypot(b.vx, b.vy) < 5 && Math.hypot(b.x - f.px, b.y - f.py) < 40) caught++;
  }
  note(`caught ${caught}/${speeds.length} inlane feeds (600-1800 mm/s; faster feeds bounce, like a real flipper)`);
  assert(caught >= 4, 'held flipper should catch inlane feeds');
});

test('dead bounce: a ball dropped on a lowered flipper pops over toward the other flipper', () => {
  let across = 0, tries = 0;
  for (let x = 165; x <= 200; x += 5) {
    const { w } = makeWorld();
    const b = w.addBall(x, 760, 0, 600);
    let crossed = false;
    stepFor(w, 1.5, () => { if (b.x > 237) crossed = true; if (b.state !== 'play') return false; });
    tries++;
    if (crossed) across++;
  }
  note(`${across}/${tries} drops bounced across the centre line`);
  assert(across >= 1, 'dead bounces should be possible');
});

test('tap pass: release a cradled ball briefly, re-press, and it pops across to the other flipper', () => {
  const ok = [];
  for (let ticks = 20; ticks <= 60; ticks += 1) {
    for (const hold of [0, 6, 12, 24]) {
      const { w, f, b, other } = cradled('L');
      other.pressed = true;
      let i = 0;
      stepFor(w, 3.0, () => { f.pressed = !(i < ticks) && (hold === 0 || i < ticks + hold); i++; });
      if (b.state === 'play' && Math.hypot(b.x - other.px, b.y - other.py) < 45 && Math.hypot(b.vx, b.vy) < 5) ok.push(`${(ticks * DT * 1000).toFixed(0)}ms/${hold}`);
    }
  }
  note(`${ok.length} timings pass the ball across: ${ok.slice(0, 8).join(' ')}`);
  assert(ok.length >= 3, 'tap passes should be possible');
});

test('post pass: drop the flipper, let it roll, re-flip near the base to pass it across', () => {
  let passes = 0;
  const outcomes = [];
  for (let wait = 40; wait <= 200; wait += 10) {
    for (const hold of [12, 20, 30]) {
      const { w, f, b, other } = cradled('L');
      other.pressed = true;
      let t = 0;
      const tw = wait / 1000, th = hold / 1000;
      stepFor(w, 3.0, () => { f.pressed = t >= tw && t < tw + th; t += DT; });
      const onOther = b.state === 'play' && Math.hypot(b.x - other.px, b.y - other.py) < 45 && Math.hypot(b.vx, b.vy) < 5;
      if (onOther) { passes++; outcomes.push(`${wait}/${hold}`); }
    }
  }
  note(`${passes} timings pass the ball across: ${outcomes.slice(0, 8).join(' ')}`);
  assert(passes >= 1, 'a post pass should be possible');
});

if (require.main === module) run().then((f) => process.exit(f ? 1 : 0));
module.exports = { stepFor };
