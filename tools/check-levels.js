#!/usr/bin/env node
/* Headless level checker.
 *  1. Stability: each level must sit still (no pig deaths, no breakage, no drifting)
 *     when nobody shoots.
 *  2. Solvability: a greedy random-search "bot" tries to beat each level with the
 *     birds it is given, so we know every level can be won.
 * Usage: node tools/check-levels.js [levelId ...] [--tries=N]
 */
'use strict';
const Sim = require('../js/sim.js');
const WORLDS = require('../js/levels.js');

const args = process.argv.slice(2);
const only = args.filter(a => !a.startsWith('--'));
const triesArg = args.find(a => a.startsWith('--tries='));
const TRIES = triesArg ? +triesArg.split('=')[1] : 80;
const skipSolve = args.includes('--no-solve');

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function checkStable(level) {
  const sim = new Sim(level);
  const start = sim.blocks.map(b => ({ b, x: b.body.getPosition().x, y: b.body.getPosition().y }));
  const pigs0 = sim.pigs.length, blocks0 = sim.blocks.length;
  for (let i = 0; i < 300; i++) sim.step();
  let maxMove = 0;
  for (const s of start) {
    if (s.b.dead) continue;
    const p = s.b.body.getPosition();
    maxMove = Math.max(maxMove, Math.hypot(p.x - s.x, p.y - s.y));
  }
  const problems = [];
  if (sim.pigs.length !== pigs0) problems.push(`pigs died while idle (${pigs0} -> ${sim.pigs.length})`);
  if (sim.blocks.length !== blocks0) problems.push(`blocks broke while idle (${blocks0} -> ${sim.blocks.length})`);
  if (maxMove > 0.2) problems.push(`blocks drifted ${maxMove.toFixed(2)} m`);
  if (sim.state !== 'aim') problems.push(`state became ${sim.state}`);
  return { problems, pigs: pigs0, blocks: blocks0, view: sim.view, settledPigs: sim.pigs.length };
}

// Play a full sequence of shots; returns the sim at the end.
function play(level, shots) {
  const sim = new Sim(level);
  for (const shot of shots) {
    let guard = 0;
    while (sim.state !== 'aim' && sim.state !== 'won' && sim.state !== 'lost' && guard++ < 2000) sim.step();
    if (sim.state !== 'aim') break;
    sim.launch(shot.vx, shot.vy);
    let t = 0;
    guard = 0;
    while (sim.state === 'flying' && guard++ < 2400) {
      sim.step();
      t += Sim.STEP;
      if (shot.tap != null && t >= shot.tap && !shot.tapped) { sim.ability(); shot.tapped = true; }
    }
    shot.tapped = false;
    // let a pending win timer resolve
    guard = 0;
    while (sim.state === 'aim' && sim.winTimer >= 0 && guard++ < 300) sim.step();
  }
  return sim;
}

function evaluate(sim, level) {
  const objective = level.objective || { type: 'pigs' };
  let v = sim.score;
  if (objective.type === 'demolish') v += sim.demolishPct() * 1000;
  else v += (sim.pigsTotal - sim.pigs.length) * 20000;
  if (sim.state === 'won') v += 1e6;
  return v;
}

function solve(level) {
  const rand = rng(12345);
  const shots = [];
  const n = level.birds.length;
  let best = null;
  for (let i = 0; i < n; i++) {
    const type = level.birds[i];
    let bestShot = null, bestVal = -Infinity, bestSim = null;
    for (let k = 0; k < TRIES; k++) {
      const ang = (level.space ? -50 + rand() * 120 : -5 + rand() * 75) * Math.PI / 180;
      const pow = (0.45 + rand() * 0.55) * 22;
      const canTap = !['red', 'big'].includes(type);
      const shot = { vx: Math.cos(ang) * pow, vy: Math.sin(ang) * pow, tap: canTap ? 0.3 + rand() * 1.4 : null };
      const sim = play(level, shots.concat([shot]));
      const val = evaluate(sim, level);
      if (val > bestVal) { bestVal = val; bestShot = shot; bestSim = sim; }
      if (sim.state === 'won') break;
    }
    shots.push(bestShot);
    best = bestSim;
    if (best.state === 'won' || best.state === 'lost') break;
  }
  return { won: best.state === 'won', score: best.score, stars: best.stars || 0, shotsUsed: shots.length, thresholds: best.starThresholds(), pct: best.demolishPct(), pigsLeft: best.pigs.map(p => p.type).join(',') || 0 };
}

let failures = 0;
for (const w of WORLDS) {
  for (const level of w.levels) {
    if (only.length && !only.includes(level.id)) continue;
    const t0 = Date.now();
    const st = checkStable(level);
    let line = `${level.id.padEnd(5)} ${level.name.padEnd(20)} pigs=${st.pigs} blocks=${String(st.blocks).padEnd(3)} view=${(st.view.x2 - st.view.x1).toFixed(0)}x${(st.view.y2 - st.view.y1).toFixed(0)}`;
    if (st.problems.length) { failures++; line += '  UNSTABLE: ' + st.problems.join('; '); }
    if (!skipSolve) {
      const r = solve(level);
      line += r.won
        ? `  solved with ${r.shotsUsed}/${level.birds.length} birds, score ${r.score} (${r.stars}★, thresholds ${r.thresholds.join('/')}) pct=${r.pct}`
        : `  NOT SOLVED (pigs left ${r.pigsLeft}, pct ${r.pct})`;
      if (!r.won) failures++;
    }
    console.log(line + `  [${Date.now() - t0}ms]`);
  }
}
if (failures) { console.log(`\n${failures} problem(s)`); process.exitCode = 1; }
else console.log('\nAll levels OK');
