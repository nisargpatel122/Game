#!/usr/bin/env node
/* Difficulty meter.
 * Simulates a player who, for each bird, gets a handful of attempts (--tries, default 12)
 * and keeps the best one, like retrying a shot until it looks good. That whole run is
 * repeated with different luck (--runs, default 8). Reports:
 *   win   - share of runs that beat the level
 *   birds - average share of the birds used in winning runs (lower = birds to spare)
 *   pigs  - average share of pigs popped (or of the goal reached, for demolition)
 *   score - a single 0-100 difficulty number used to order levels (higher = harder)
 * Usage: node tools/difficulty.js [levelId ...] [--tries=12] [--runs=8] [--json]
 */
'use strict';
const Sim = require('../js/sim.js');
const WORLDS = require('../js/levels.js');

const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? +a.split('=')[1] : def; };
const TRIES = opt('tries', 12), RUNS = opt('runs', 8);
const asJson = args.includes('--json');
const ids = args.filter(a => !a.startsWith('--'));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function playShot(sim, shot) {
  sim.launch(shot.vx, shot.vy);
  let t = 0, g = 0, tapped = shot.tap == null;
  while (sim.state === 'flying' && g++ < 2400) {
    sim.step();
    t += Sim.STEP;
    if (!tapped && t >= shot.tap) { sim.ability(); tapped = true; }
  }
  g = 0;
  while (sim.state === 'aim' && sim.winTimer >= 0 && g++ < 300) sim.step();
}

function progress(sim) {
  return sim.objective.type === 'demolish'
    ? Math.min(1, sim.demolishPct() / sim.objective.pct)
    : (sim.pigsTotal - sim.pigs.length) / Math.max(1, sim.pigsTotal);
}

function botRun(level, seed, TRIES) {
  const rand = rng(seed);
  let snap = new Sim(level).snapshot();
  let last = null;
  for (let i = 0; i < level.birds.length; i++) {
    const type = level.birds[i];
    let best = null;
    for (let k = 0; k < TRIES; k++) {
      const sim = Sim.restore(level, snap);
      const ang = (level.space ? -50 + rand() * 120 : -5 + rand() * 72) * Math.PI / 180;
      const pow = (0.45 + rand() * 0.55) * sim.maxSpeed;
      const tap = ['red', 'big'].includes(type) ? null : 0.3 + rand() * 1.4;
      playShot(sim, { vx: Math.cos(ang) * pow, vy: Math.sin(ang) * pow, tap });
      const val = (sim.state === 'won' ? 1e6 : 0) + progress(sim) * 1e5 + sim.score;
      if (!best || val > best.val) best = { val, sim };
      if (sim.state === 'won') break;
    }
    last = best.sim;
    // Demolition always plays every bird, so count the win at the bird that reached the goal.
    const goalMet = last.objective.type === 'demolish' && last.demolishPct() >= last.objective.pct;
    if (last.state === 'won' || goalMet) return { won: true, used: i + 1, prog: 1 };
    if (last.state !== 'aim') break;
    snap = last.snapshot();
  }
  return { won: false, used: level.birds.length, prog: last ? progress(last) : 0 };
}

function measure(level, o) {
  const tries = (o && o.tries) || TRIES, runs = (o && o.runs) || RUNS;
  let wins = 0, usedSum = 0, progSum = 0;
  for (let r = 0; r < runs; r++) {
    const res = botRun(level, 1000 + r * 7919, tries);
    progSum += res.prog;
    if (res.won) { wins++; usedSum += res.used / level.birds.length; }
  }
  const win = wins / runs, birds = wins ? usedSum / wins : 1, prog = progSum / runs;
  // Losing runs count fully; winning runs count by how many birds they needed.
  const score = Math.round(100 * ((1 - win) * (0.6 + 0.4 * (1 - prog)) + win * 0.6 * birds));
  return { id: level.id, name: level.name, birds: level.birds.length, blocks: level.blocks.length, pigs: level.pigs.length, win, birdsUsed: birds, prog, score };
}

module.exports = { measure };
if (require.main !== module) return;

const levels = WORLDS.flatMap(w => w.levels).filter(l => !ids.length || ids.includes(l.id));
for (const level of levels) {
  const t0 = Date.now();
  const m = measure(level);
  if (asJson) console.log(JSON.stringify(m));
  else {
    console.log(`${m.id.padEnd(5)} ${m.name.padEnd(20)} difficulty=${String(m.score).padStart(3)}  win=${(100 * m.win).toFixed(0).padStart(3)}%  ` +
      `birdsUsed=${(100 * m.birdsUsed).toFixed(0).padStart(3)}% of ${m.birds}  progress=${(100 * m.prog).toFixed(0).padStart(3)}%  ` +
      `blocks=${m.blocks} pigs=${m.pigs}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  }
}
