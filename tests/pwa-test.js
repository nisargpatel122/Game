// Installable-app check: serves the folder over http://localhost, lets the
// service worker install, then goes offline and reloads. The game must still
// start, and the manifest and icons must be valid.
//   node tests/pwa-test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
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
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { active: !!reg.active, manifest: !!document.querySelector('link[rel=manifest]'), apple: !!document.querySelector('link[rel=apple-touch-icon]') };
  });
  check(sw.active, 'service worker installs and activates');
  check(sw.manifest && sw.apple, 'manifest and home-screen icon links are added over http');
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    return (await c.keys()).map((r) => new URL(r.url).pathname);
  });
  check(['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'].every((p) => cached.includes(p)), 'game, manifest and icons are cached (' + cached.length + ' files)');
  // offline reload, both the root and index.html
  await ctx.setOffline(true);
  for (const u of [url, url + 'index.html']) {
    await page.goto(u);
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => ({ booted: !!(window.NN && NN.app && NN.app.game), state: NN.app && NN.app.game.state, title: NN.app && NN.app.ui.screen }));
    check(st.booted && st.title === 'title', `offline ${u.replace(url, '/') || '/'} starts the game (state ${st.state}, screen ${st.title})`);
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
