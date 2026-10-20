// Installable-app check. Serves the folder at http://127.0.0.1:<port>/neon-nebula/
// (the same path GitHub Pages uses) next to a stand-in for another game on the
// same site, lets the service worker install, then goes offline and reloads.
// The game must still start, must leave the other game's offline cache alone,
// must get its own app id, and its Install button must work.
//   node tests/pwa-test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const root = path.join(__dirname, '..');
const BASE = '/neon-nebula/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      // "offline": the server stops answering. (Playwright's setOffline alone does
      // not stop a service worker's own fetches, so it cannot prove offline play.)
      if (srv.offline) { req.socket.destroy(); return; }
      let p = decodeURIComponent(req.url.split('?')[0]);
      // a page standing in for another game on the same site (like Angry Flock)
      if (p.startsWith('/other/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>other</title>'); return; }
      if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
      p = p.slice(BASE.length - 1);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, path.normalize(p));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };
  // manifest + icons
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  check(man.name && man.short_name && man.start_url && man.display, 'manifest has name, short_name, start_url, display');
  for (const ic of man.icons) {
    const buf = fs.readFileSync(path.join(root, ic.src));
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    check(buf.slice(1, 4).toString() === 'PNG' && ic.sizes === w + 'x' + h, `icon ${ic.src} is a ${ic.sizes} PNG`);
  }
  check(man.icons.some((i) => i.purpose === 'maskable') && man.icons.some((i) => i.sizes === '512x512'), 'manifest has 512px and maskable icons');

  const srv = await serve();
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const url = origin + BASE;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // another game's offline cache, created before ours installs
  await page.goto(origin + '/other/index.html');
  await page.evaluate(async () => { const c = await caches.open('angryflock-v6'); await c.put('/other/index.html', new Response('other game')); });

  await page.goto(url);
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { active: !!reg.active, scope: reg.scope, manifest: !!document.querySelector('link[rel=manifest]'), apple: !!document.querySelector('link[rel=apple-touch-icon]') };
  });
  check(sw.active && sw.scope === url, 'service worker installs and activates for ' + BASE);
  check(sw.manifest && sw.apple, 'manifest and home-screen icon links are added over http');
  await page.waitForTimeout(500);
  const caches = await page.evaluate(async () => {
    const out = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });
  const ours = Object.keys(caches).filter((k) => k.startsWith('neon-nebula-'));
  check(ours.length === 1, 'exactly one Neon Nebula cache (' + ours.join(', ') + ')');
  const cached = ours.length ? caches[ours[0]] : [];
  check(['', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'].every((p) => cached.includes(BASE + p)), 'game, manifest and icons are cached (' + cached.length + ' files)');
  check(!!caches['angryflock-v6'] && caches['angryflock-v6'].includes('/other/index.html'), "the other game's offline cache is left alone");

  // Chrome's own view: installable, and an app id of our own
  const cdp = await ctx.newCDPSession(page);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  check(inst.installabilityErrors.length === 0, 'Chrome reports no installability errors' + (inst.installabilityErrors.length ? ': ' + JSON.stringify(inst.installabilityErrors) : ''));
  // Chrome resolves "id" against the site's root, so a plain "./" would claim the
  // whole site and clash with other games hosted there
  const am = await cdp.send('Page.getAppManifest');
  const id = am.manifest && am.manifest.id;
  check(id === url, "app id is this game's own address (" + id + '), not the whole site');

  // the in-game Install button, driven by a stand-in install prompt
  const offer = () => page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    window.__prompted = 0;
    e.prompt = () => { window.__prompted++; return Promise.resolve({ outcome: 'accepted' }); };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  const titleState = () => page.evaluate(() => {
    const b = document.querySelector('[data-act=install]');
    const btns = Array.from(document.querySelectorAll('#ov [data-act]'));
    return {
      button: !!b, underLogo: !!b && b.previousElementSibling && b.previousElementSibling.classList.contains('logo'),
      selected: (btns[NN.app.ui.sel] || {}).getAttribute && btns[NN.app.ui.sel].getAttribute('data-act'),
      playTop: document.querySelector('[data-act=play]').getBoundingClientRect().top, prompted: window.__prompted, kept: !!NN.app.installEvent,
    };
  });
  const before = await titleState();
  check(!before.button, 'no Install button before the browser offers installing');
  check(await offer(), "the browser's own install banner is replaced by the game's button");
  const shown = await titleState();
  check(shown.button && shown.underLogo, 'Install button appears under the logo');
  check(shown.selected === 'play' && Math.abs(shown.playTop - before.playTop) < 1, 'PLAY keeps its place and stays selected when the button appears');
  // a gamepad press is not a user gesture: the offer must survive it. (Playwright
  // runs page scripts as if tapped, so "no gesture" is simulated here.)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'userActivation', { value: { isActive: false }, configurable: true });
    NN.app.promptInstall();
    delete navigator.userActivation;
  });
  const pad = await titleState();
  check(pad.button && pad.kept && pad.prompted === 0, 'a press without a tap or click keeps the offer and the button');
  // a browser that refuses prompt() outright: the offer is kept as well
  await page.evaluate(async () => {
    const ev = NN.app.installEvent, real = ev.prompt;
    ev.prompt = () => Promise.reject(new DOMException('no gesture', 'NotAllowedError'));
    NN.app.promptInstall();
    await new Promise((r) => setTimeout(r, 50));
    ev.prompt = real;
  });
  const refused = await titleState();
  check(refused.button && refused.kept, 'a refused prompt keeps the offer and the button');
  await page.click('[data-act=install]');
  await page.waitForTimeout(100);
  const tapped = await titleState();
  check(tapped.prompted === 1 && !tapped.button, 'tapping it opens the install prompt and the button goes away');
  // after a game in full screen (phones), the button must still show on the title
  await offer();
  await page.click('[data-act=play]');
  await page.waitForTimeout(600);
  const fs1 = await page.evaluate(() => ({ fs: !!document.fullscreenElement, state: NN.app.game.state }));
  await page.evaluate(() => NN.app.toTitle());
  await page.waitForTimeout(300);
  const afterGame = await titleState();
  check(afterGame.button, 'Install button is back on the title after a game' + (fs1.fs ? ' played full screen' : ' (full screen was not entered here)'));

  // offline reload, both the folder and index.html
  if (await page.evaluate(() => !!document.fullscreenElement)) await page.evaluate(() => document.exitFullscreen());
  srv.offline = true;
  await ctx.setOffline(true);
  for (const u of [url, url + 'index.html']) {
    await page.goto(u);
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => ({ booted: !!(window.NN && NN.app && NN.app.game), state: NN.app && NN.app.game.state, title: NN.app && NN.app.ui.screen }));
    check(st.booted && st.title === 'title', `offline ${u.replace(origin, '')} starts the game (state ${st.state}, screen ${st.title})`);
  }
  // start a game offline with a tap
  await page.click('[data-act=play]');
  await page.waitForTimeout(800);
  const playing = await page.evaluate(() => NN.app.game.state);
  check(playing === 'playing', 'a game starts offline');
  check(errors.length === 0, 'no errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  srv.close();
  console.log(fails.length ? `${fails.length} PWA check(s) failed` : 'PWA checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
