#!/usr/bin/env node
/* Speed tuner. For each level, finds the ball-speed trim that puts its difficulty score
 * (tools/difficulty.js, same simulated player) on the target curve, and prints the trims
 * as the SPEED_TRIM table for js/levels.js. It measures each level at three speeds (same
 * luck each time), fits a line, and checks the answer. Slow: run it in the background.
 * Usage: node tools/tune.js [n | n-m ...] [--runs=64]
 */
'use strict';
const Bot = require('../js/bot.js');
const { LEVELS, target } = require('../js/levels.js');

const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? +a.split('=')[1] : def; };
const RUNS = opt('runs', 64);
const want = new Set();
for (const a of args.filter(x => !x.startsWith('--'))) {
  const [lo, hi] = a.split('-').map(Number);
  for (let n = lo; n <= (hi || lo); n++) want.add(n);
}
const levels = want.size ? LEVELS.filter(l => want.has(l.n)) : LEVELS;
const MAX = 1.5;

function score(level, trim) {
  const base = level.tune.speed;
  level.tune.speed = base - (level.trim || 0) + trim;
  let win = 0, p3 = 0, lost = 0;
  for (let s = 1; s <= RUNS; s++) {
    const r = Bot.play(level, { seed: s * 7 + level.n * 1009 });
    if (r.won) win++;
    if (r.won && r.lost === 0) p3++;
    lost += r.lost;
  }
  level.tune.speed = base;
  win /= RUNS; p3 /= RUNS; lost /= RUNS;
  return 100 * (0.45 * (1 - win) + 0.35 * (1 - p3) + 0.2 * Math.min(1, lost / level.tune.lives));
}

const out = {};
for (const level of levels) {
  const T = target(level.n);
  const xs = [-1.2, 0, 1.2], ys = xs.map(x => score(level, x));
  const mx = 0, my = (ys[0] + ys[1] + ys[2]) / 3;
  const slope = Math.max(0.5, ((xs[0] - mx) * (ys[0] - my) + (xs[2] - mx) * (ys[2] - my)) / (2 * 1.44));
  let x = Math.max(-MAX, Math.min(MAX, (T - my) / slope));
  x = Math.round(x * 10) / 10;
  const d = score(level, x);
  out[level.n] = x;
  const flag = Math.abs(d - T) > 6 ? (d > T ? '  << too hard' : '  << too easy') : '';
  console.log(`${String(level.n).padStart(3)} ${level.name.padEnd(20).slice(0, 20)} target ${T.toFixed(0).padStart(2)}  at -1.2/0/+1.2: ${ys.map(v => v.toFixed(0).padStart(2)).join('/')}  trim ${x >= 0 ? '+' : ''}${x.toFixed(1)} -> ${d.toFixed(0)}${flag}`);
}
const all = LEVELS.map(l => (out[l.n] != null ? out[l.n] : (l.trim || 0)));
console.log('\nSPEED_TRIM = [');
for (let i = 0; i < all.length; i += 10) console.log('    ' + all.slice(i, i + 10).map(v => v.toFixed(1)).join(', ') + ',');
console.log('  ];');
