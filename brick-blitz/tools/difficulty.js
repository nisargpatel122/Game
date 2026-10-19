#!/usr/bin/env node
/* Difficulty meter. An average simulated player (js/bot.js) plays each level many times
 * with the level's real number of balls. Reports:
 *   win   - share of runs that beat the level
 *   3star - share of runs that beat it without losing a ball
 *   lost  - balls lost per run
 *   time  - seconds to clear (winning runs)
 *   score - one 0-100 difficulty number (higher = harder)
 * Usage: node tools/difficulty.js [n | n-m ...] [--runs=24] [--json] [--skill=0.6]
 */
'use strict';
const Bot = require('../js/bot.js');
const { LEVELS } = require('../js/levels.js');

const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? +a.split('=')[1] : def; };
const RUNS = opt('runs', 24);
const asJson = args.includes('--json');
const want = new Set();
for (const a of args.filter(x => !x.startsWith('--'))) {
  const [lo, hi] = a.split('-').map(Number);
  for (let n = lo; n <= (hi || lo); n++) want.add(n);
}
const levels = want.size ? LEVELS.filter(l => want.has(l.n)) : LEVELS;
const skill = {};
if (args.some(a => a.startsWith('--skill='))) skill.err = opt('skill', 0.6);

function measure(level) {
  const runs = [];
  for (let s = 1; s <= RUNS; s++) runs.push(Bot.play(level, { seed: s * 7 + level.n * 1009, skill }));
  const won = runs.filter(r => r.won);
  const win = won.length / RUNS;
  const p3 = runs.filter(r => r.won && r.lost === 0).length / RUNS;
  const lost = runs.reduce((a, r) => a + r.lost, 0) / RUNS;
  const time = won.length ? won.reduce((a, r) => a + r.time, 0) / won.length : 0;
  const lives = (level.tune && level.tune.lives) || 3;
  const score = 100 * (0.45 * (1 - win) + 0.35 * (1 - p3) + 0.2 * Math.min(1, lost / lives));
  return { n: level.n, name: level.name, win, p3, lost, time, score, timeouts: runs.filter(r => r.timeout).length };
}

const out = [];
for (const level of levels) {
  const m = measure(level);
  out.push(m);
  if (!asJson) {
    const bar = '#'.repeat(Math.round(m.score / 4));
    console.log(`${String(m.n).padStart(3)} ${m.name.padEnd(22).slice(0, 22)} win ${(m.win * 100).toFixed(0).padStart(3)}%  3* ${(m.p3 * 100).toFixed(0).padStart(3)}%  lost ${m.lost.toFixed(2)}  ${m.time.toFixed(0).padStart(3)}s  ${m.score.toFixed(0).padStart(3)} ${bar}${m.timeouts ? '  (' + m.timeouts + ' timeouts)' : ''}`);
  }
}
if (asJson) console.log(JSON.stringify(out));
