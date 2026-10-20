// Balance simulator: plays many headless games with bots of different skill
// and reports game length, scores, drain causes and feature frequency.
// Usage: node tests/balance.js [games-per-bot] [difficulty]
const NN = require('../tools/load.js');
const DT = 1 / 480;
const N = +(process.argv[2] || 20);
const diff = process.argv[3] || 'arcade';
const BOTS = {
  novice: { skill: 0.3, aim: false },
  average: { skill: 0.6, aim: false },
  solid: { skill: 0.75, aim: true, catchRate: 0.45 },
  good: { skill: 0.85, aim: true },
  expert: { skill: 0.97, aim: true },
};
const pick = process.argv[4] ? process.argv[4].split(',') : Object.keys(BOTS);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

function playGame(botCfg, seed, tuning) {
  const g = new NN.Game({ seed: seed, tuning: tuning });
  g.quiet = true;
  g.startGame(diff, seed * 7 + 1);
  g.bot = new NN.Bot(g, Object.assign({ seed: seed * 13 + 5 }, botCfg));
  const drains = { outlane: 0, center: 0, saved: 0 };
  let firstAward = -1;
  const orig = g.handleEvent.bind(g);
  g.handleEvent = (e) => {
    if (e.type === 'sensor' && /^outlane/.test(e.id) && e.dir === 1) e.ball.outlane = true;
    if (e.type === 'sensor' && /^inlane/.test(e.id)) e.ball.outlane = false;
    if (e.type === 'drain') drains[e.ball.outlane ? 'outlane' : 'center']++;
    orig(e);
  };
  const origShow = g.rules.show.bind(g.rules);
  g.rules.show = (s) => {
    if (firstAward < 0 && ['skillshot', 'mode_start', 'award', 'combo', 'lock', 'blackhole', 'jackpot'].includes(s.kind)) firstAward = g.time;
    origShow(s);
  };
  let t = 0;
  while (g.state !== 'gameover' && t < 3600) { g.tick(DT); t += DT; }
  const R = g.rules;
  return { t: t, score: R.score, drains: drains, saves: R.gstats.ballSaves, gs: R.gstats, firstAward: firstAward, kickbacks: R.gstats.kickbacks, eb: R.gstats.extraBalls };
}

module.exports = { playGame, BOTS };
if (require.main === module) {
  const tuning = process.env.TUNING ? JSON.parse(process.env.TUNING) : undefined;
  for (const name of pick) {
    const res = [];
    for (let i = 0; i < N; i++) res.push(playGame(BOTS[name], 1000 + i, tuning));
    const times = res.map((r) => r.t / 60), scores = res.map((r) => r.score / 1e6);
    const d = res.reduce((a, r) => { for (const k in r.drains) a[k] += r.drains[k]; return a; }, { outlane: 0, center: 0, saved: 0 });
    const tot = d.outlane + d.center;
    const G = (k) => avg(res.map((r) => r.gs[k])).toFixed(1);
    console.log(`${name.padEnd(8)} game ${med(times).toFixed(1)} min (avg ${avg(times).toFixed(1)}, max ${Math.max(...times).toFixed(1)}) | score med ${med(scores).toFixed(0)}M avg ${avg(scores).toFixed(0)}M | drains out ${(100 * d.outlane / tot).toFixed(0)}% ctr ${(100 * d.center / tot).toFixed(0)}% | saves ${G('ballSaves')} kick ${G('kickbacks')} EB ${G('extraBalls')}`);
    console.log(`         ramps ${G('ramps')} orbits ${G('orbits')} scoops ${G('scoops')} comets ${G('comets')} bumpers ${G('bumpers')} | missions ${G('missions')} MB ${G('multiballs')} jackpots ${G('jackpots')} super ${G('superJackpots')} nova ${G('supernovas')} combo ${G('maxCombo')} skill ${G('skillShots')} | 1st award ${med(res.map((r) => r.firstAward)).toFixed(0)}s`);
  }
}
