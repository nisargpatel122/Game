#!/usr/bin/env node
/* Level checker. For every level (or the ones named on the command line):
 *   - each map row is 11 characters of known bricks
 *   - every breakable brick can be reached (gold only blocks; you can break through the rest)
 *   - sliding rows have room to slide
 *   - a skilled bot with unlimited balls clears it, every time, within the time limit
 * Usage: node tools/check-levels.js [n ...] [--runs=6] [--limit=420]
 */
'use strict';
const Sim = require('../js/sim.js');
const Bot = require('../js/bot.js');
const { LEVELS } = require('../js/levels.js');

const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? +a.split('=')[1] : def; };
const RUNS = opt('runs', 6), LIMIT = opt('limit', 420);
const pick = args.filter(a => !a.startsWith('--')).map(Number);
const levels = pick.length ? LEVELS.filter(l => pick.includes(l.n)) : LEVELS;

const SKILLED = { react: 0.15, err: 0.25, lapse: 0.01, speed: 26, aim: 0.06, edge: 0.75, greed: 0.9, dodge: 0.95 };

function reachProblems(level) {
  const map = level.map || [];
  const rows = map.length;
  const moving = new Set((level.move || []).flatMap(m => m.rows));
  // Empty rows above (the gap under the top wall) and below the wall.
  const top = Math.round(Sim.TOP / Sim.BH);
  const H = top + rows + 2;
  const solid = (r, c) => {
    const mr = r - top;
    if (mr < 0 || mr >= rows) return false;
    return map[mr][c] === '#' && !moving.has(mr);
  };
  const seen = new Set();
  const stack = [];
  for (let c = 0; c < Sim.FW; c++) { stack.push([H - 1, c]); seen.add((H - 1) + ',' + c); }
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= H || nc < 0 || nc >= Sim.FW) continue;
      const k = nr + ',' + nc;
      if (seen.has(k) || solid(nr, nc)) continue;
      seen.add(k);
      stack.push([nr, nc]);
    }
  }
  const bad = [];
  map.forEach((line, mr) => {
    for (let c = 0; c < Sim.FW; c++) {
      const ch = line[c];
      if (ch === '#' || ch === '.' || ch === ' ') continue;
      if (!seen.has((mr + top) + ',' + c)) bad.push(`row ${mr} col ${c} ('${ch}') is sealed in by gold`);
    }
  });
  return bad;
}

let failures = 0;
const t0 = Date.now();
for (const level of levels) {
  const problems = [];
  const map = level.map || [];
  map.forEach((line, i) => {
    if (line.length !== Sim.FW) problems.push(`row ${i} is ${line.length} characters, not ${Sim.FW}: "${line}"`);
    for (const ch of line) { try { Sim.parseCell(ch); } catch (e) { problems.push(`row ${i}: ${e.message}`); } }
  });
  if (!problems.length) {
    const sim = new Sim(level);
    if (!sim.total && !level.boss) problems.push('nothing to break');
    sim.groups.forEach((g, i) => { if (g.hi - g.lo < 0.5) problems.push(`sliding group ${i} has no room to slide`); });
    if (sim.lowest > Sim.DANGER_Y) problems.push('starts below the danger line');
    problems.push(...reachProblems(level));
  }
  let times = [];
  if (!problems.length) {
    for (let s = 1; s <= RUNS; s++) {
      const r = Bot.play(level, { seed: s * 101 + level.n, skill: SKILLED, lives: 999, limit: LIMIT });
      if (!r.won) problems.push(`bot run ${s} did not win (${r.timeout ? 'ran out of time' : r.reason}, ${r.left} bricks left${r.boss != null ? ', boss hp ' + r.boss : ''})`);
      times.push(r.time);
    }
  }
  const t = times.length ? `  clear ${Math.min(...times).toFixed(0)}-${Math.max(...times).toFixed(0)}s` : '';
  if (problems.length) {
    failures++;
    console.log(`✗ ${level.n} ${level.name}`);
    for (const p of problems) console.log('    ' + p);
  } else {
    console.log(`✓ ${level.n} ${level.name}${t}`);
  }
}
console.log(`\n${levels.length - failures}/${levels.length} levels OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(failures ? 1 : 0);
