// Screenshots of many game states at several screen sizes for visual review.
// Usage: node tests/screens.js outdir [sizes]
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const out = process.argv[2] || path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(__dirname, '..', 'index.html');
const SIZES = {
  desktop: { viewport: { width: 1920, height: 1080 }, dpr: 1 },
  laptop: { viewport: { width: 1366, height: 768 }, dpr: 1 },
  phone: { viewport: { width: 390, height: 844 }, dpr: 3, touch: true },
  android: { viewport: { width: 360, height: 780 }, dpr: 2.75, touch: true },
  tablet: { viewport: { width: 820, height: 1180 }, dpr: 2, touch: true },
  landphone: { viewport: { width: 844, height: 390 }, dpr: 3, touch: true },
};
const pick = (process.argv[3] || Object.keys(SIZES).join(',')).split(',');

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const name of pick) {
    const S = SIZES[name];
    const ctx = await browser.newContext({ viewport: S.viewport, deviceScaleFactor: S.dpr, hasTouch: !!S.touch, isMobile: !!S.touch });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
    await page.goto(url);
    await page.waitForTimeout(900);
    const shot = (label) => page.screenshot({ path: path.join(out, `${name}-${label}.png`) });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const settle = (ms) => page.waitForTimeout(ms);
    await shot('01-title');
    await ev(() => NN.app.startGame());
    await settle(700);
    await shot('02-ballstart');
    // play a bit: launch, then fake some progress
    await ev(() => { const g = NN.app.game; g.world.plungerLaunch(0.62); });
    await settle(2200);
    await ev(() => {
      const g = NN.app.game, R = g.rules;
      R.firstSwitch();
      R.lanes = [true, false, true]; R.planets = [true, false, true, false]; R.bonusX = 3; R.lockLit = true; R.kickbackLit = true;
      R.startMission(R.missions[1]);
      R.mission.st.count = 18;
      R.score = 48250000;
    });
    await settle(2600);
    await shot('03-mission');
    // multiball with jackpots lit
    await ev(() => {
      const g = NN.app.game, R = g.rules;
      R.endMission(true);
      R.locked = 1; g.lockBalls = [];
      const b = g.world.addBall(392, 263); g.lockBall(b);
      R.onLock();
    });
    await settle(5500);
    await shot('04-multiball');
    await ev(() => { NN.app.game.rules.shot('leftRamp', { x: 140, y: 400 }); });
    await settle(450);
    await shot('05-jackpot');
    await ev(() => { const g = NN.app.game; g.rules.shot('rightRamp', { x: 330, y: 420 }); const b = g.world.addBall(240, 338); b.state = 'held'; b.holder = 'scoop'; g.onScoop(b); });
    await settle(600);
    await shot('06-superjackpot');
    // bonus count
    await ev(() => { const g = NN.app.game; for (const b of g.world.balls) if (b.state !== 'held' || b.holder !== 'lock') b.state = 'gone'; g.scoopBall = null; g.rules.mb = null; g.rules.ballSaveUntil = -1; g.rules.ballSaveArmed = false; for (const b of g.world.balls) b.state = 'gone'; });
    await settle(1500);
    await shot('07-bonus');
    // pause + settings + howto
    await ev(() => { const g = NN.app.game; g.bonus = null; g.state = 'playing'; g.rules.startBall(); g.serveBall(false); NN.app.pause(); });
    await settle(300);
    await shot('08-pause');
    await ev(() => NN.app.ui.open('settings'));
    await settle(200);
    await shot('09-settings');
    await ev(() => NN.app.ui.open('howto'));
    await settle(200);
    await shot('10-howto');
    await ev(() => { NN.app.ui.open('scores'); });
    await settle(200);
    await shot('11-scores');
    await ev(() => { NN.app.ui.open('stats'); });
    await settle(200);
    await shot('12-stats');
    // game over with initials
    await ev(() => { NN.app.ui.close(); NN.app.game.paused = false; NN.app.game.state = 'gameover'; NN.app.onGameOver({ score: 812345670, stats: NN.app.game.rules.gstats, difficulty: 'arcade' }); });
    await settle(1100);
    await shot('13-gameover');
    // tuning + debug
    await ev(() => { NN.app.toTitle(); NN.app.ui.close(); NN.app.ui.toggleTuning(); NN.app.renderer.debug = true; });
    await settle(1500);
    await shot('14-tuning-debug');
    await ctx.close();
  }
  await browser.close();
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
})();
