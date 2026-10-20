// Loads the built index.html in headless Chromium, records console errors and
// any network requests, and takes screenshots at desktop and phone sizes.
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const out = process.argv[2] || path.join(require('os').tmpdir(), 'neon-nebula-shots');
fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const results = { errors: [], requests: [] };
  async function session(name, viewport, opts, script) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.touch });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') results.errors.push(`[${name}] ${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => results.errors.push(`[${name}] pageerror: ${e.message}`));
    // the double-click version must load nothing but itself
    page.on('request', (r) => { if (r.url() !== url && !r.url().startsWith('data:')) results.requests.push(r.url()); });
    await page.goto(url);
    await page.waitForTimeout(1200);
    await script(page, async (label) => { await page.screenshot({ path: path.join(out, `${name}-${label}.png`) }); });
    await ctx.close();
  }
  const play = async (page, shot, touch) => {
    await shot('title');
    if (touch) await page.tap('[data-act=play]'); else await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    await shot('ready');
    // pull and launch
    if (touch) {
      const vp = page.viewportSize();
      await page.mouse.move(vp.width - 10, vp.height * 0.8);
    } else {
      await page.keyboard.down('Space');
      await page.waitForTimeout(500);
      await shot('pulled');
      await page.keyboard.up('Space');
    }
    await page.waitForTimeout(1500);
    await shot('play1');
    for (let i = 0; i < 6; i++) {
      await page.keyboard.down('KeyZ'); await page.keyboard.down('Slash');
      await page.waitForTimeout(120);
      await page.keyboard.up('KeyZ'); await page.keyboard.up('Slash');
      await page.waitForTimeout(500);
    }
    await shot('play2');
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(300);
    await shot('pause');
  };
  await session('desktop', { width: 1366, height: 768 }, {}, (p, s) => play(p, s, false));
  await session('phone', { width: 390, height: 844 }, { dpr: 3, touch: true }, async (page, shot) => {
    await shot('title');
    await page.tap('[data-act=play]');
    await page.waitForTimeout(900);
    await shot('ready');
    // multi-touch flippers, plunger drag and swipe nudge via pointer events
    const r = await page.evaluate(async () => {
      const cv = document.getElementById('game');
      const g = NN.app.game;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const ev = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
      const out = {};
      ev('pointerdown', 1, 60, 700); ev('pointerdown', 2, 290, 700);
      await wait(120);
      out.bothUp = g.world.flipperById.L.pressed && g.world.flipperById.R.pressed && g.world.flipperById.U.pressed;
      ev('pointerup', 1, 60, 700);
      await wait(80);
      out.leftDownRightHeld = !g.world.flipperById.L.pressed && g.world.flipperById.R.pressed;
      ev('pointerup', 2, 290, 700);
      await wait(80);
      out.allDown = !g.world.flipperById.L.pressed && !g.world.flipperById.R.pressed;
      // plunger: drag down in the shooter lane strip
      ev('pointerdown', 3, 380, 640);
      for (let i = 1; i <= 10; i++) { ev('pointermove', 3, 380, 640 + i * 12); await wait(30); }
      await wait(300);
      out.pull = +g.world.plunger.pull.toFixed(1);
      ev('pointerup', 3, 380, 760);
      await wait(60);
      out.launched = g.world.plunger.launching || g.world.plunger.pull === 0;
      await wait(1200);
      // swipe up nudges
      const before = g.rules.tiltBob;
      ev('pointerdown', 4, 100, 700); ev('pointermove', 4, 100, 680); ev('pointermove', 4, 104, 620); ev('pointerup', 4, 104, 620);
      await wait(100);
      out.nudged = g.rules.tiltBob > before;
      return out;
    });
    console.log('touch:', JSON.stringify(r));
    if (!(r.bothUp && r.leftDownRightHeld && r.allDown && r.pull > 20 && r.launched && r.nudged)) results.errors.push('[phone] touch controls check failed ' + JSON.stringify(r));
    await shot('touchplay');
  });
  await browser.close();
  console.log('errors:', results.errors.length ? '\n  ' + results.errors.join('\n  ') : 'none');
  console.log('network requests:', results.requests.length ? results.requests.join(', ') : 'none');
  process.exit(results.errors.length || results.requests.length ? 1 : 0);
})();
