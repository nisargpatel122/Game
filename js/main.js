/* Angry Flock — game controller: screens, input, camera, progress. */
(function () {
  'use strict';

  const STEP = Sim.STEP;
  const WORLDS = window.LEVELS;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const renderer = new Render.Renderer(canvas);
  const fx = new Render.FX();

  // ---------------- saved progress ----------------
  const SAVE_KEY = 'angryflock-v1';
  const save = { levels: {}, sound: true, music: true, tips: {} };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) { /* private mode */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  Sfx.soundOn = save.sound; Sfx.musicOn = save.music;

  const levelSave = (id) => save.levels[id] || { stars: 0, score: 0 };
  const worldStars = (w) => w.levels.reduce((s, l) => s + levelSave(l.id).stars, 0);
  const unlocked = (w, i) => i === 0 || levelSave(w.levels[i - 1].id).stars > 0;

  // ---------------- game state ----------------
  const G = {
    screen: 'title', worldIdx: 0, levelIdx: 0,
    sim: null, theme: 'island', level: null,
    cam: { x: 10, y: 6, s: 20 }, camMode: 'auto',
    paused: false, time: 0, acc: 0,
    aim: null, load: null, lastTrail: [], ending: null,
    shownScore: 0, hiddenQueue: 0, tipTimer: 0,
  };
  window.__game = G; // handy for debugging from the console

  // ---------------- sim events -> effects ----------------
  const MAT_TEXT = { wood: '#ffe2a8', glass: '#d8f4ff', stone: '#e6e8ea', tnt: '#ffd23a' };

  function onSimEvent(type, d) {
    switch (type) {
      case 'launch':
        Sfx.play('launch'); Sfx.play('squawk', { type: d.type });
        fx.feathers(d.type, d.x, d.y, 3);
        G.camMode = 'auto';
        break;
      case 'ability':
        if (d.type === 'yellow') Sfx.play('boost'); else if (d.type !== 'black') Sfx.play('ability');
        if (d.type !== 'black') fx.feathers(d.type, d.x, d.y, 4);
        break;
      case 'birdHit':
        Sfx.play('birdHit', d);
        fx.feathers(d.type, d.x, d.y, Math.min(8, 2 + Math.round(d.speed / 4)));
        break;
      case 'hit': Sfx.play('hit_' + d.mat, { vol: 0.4 + d.strength * 0.6 }); break;
      case 'break':
        fx.debris(d.mat, d.x, d.y, d.w, d.h, d.vx, d.vy);
        Sfx.play('break_' + d.mat);
        if (d.pts) fx.text(d.x, d.y, String(d.pts), MAT_TEXT[d.mat], 16);
        break;
      case 'pigDie':
        fx.pigPop(d.x, d.y, d.r);
        fx.text(d.x, d.y + d.r + 0.3, String(d.pts), '#a6f05a', 26);
        Sfx.play('pigDie'); Sfx.vibrate(25);
        break;
      case 'pigHurt': Sfx.play('pigHurt'); break;
      case 'explode':
        fx.explosion(d.x, d.y, d.r);
        Sfx.play('explode'); Sfx.vibrate(70);
        break;
      case 'poof':
        fx.smoke(d.x, d.y, 0.7, 'rgba(255,255,255,', 6);
        if (d.kind === 'bird') fx.feathers(d.type, d.x, d.y, 5);
        Sfx.play('poof');
        break;
      case 'nextBird': startLoad(); break;
      case 'win':
        G.ending = { won: true, t: 0, spare: d.spare, popped: 0 };
        break;
      case 'lose':
        G.ending = { won: false, t: 0, spare: 0, popped: 0 };
        setTimeout(() => Sfx.play('pigLaugh'), 300);
        break;
    }
  }

  // ---------------- level lifecycle ----------------
  function themeOf(wi) { return WORLDS[wi].theme === 'space' ? 'space' : WORLDS[wi].theme; }

  function startLevel(wi, li) {
    G.worldIdx = wi; G.levelIdx = li;
    G.level = WORLDS[wi].levels[li];
    levelPage[wi] = Math.floor(li / levelsPerPage().size);
    G.theme = themeOf(wi);
    G.sim = new Sim(G.level, { onEvent: onSimEvent });
    G.aim = null; G.ending = null; G.lastTrail = []; G.shownScore = 0; G.hiddenQueue = 0;
    G.camMode = 'auto'; G.paused = false; G.acc = 0;
    fx.clear();
    snapCamera();
    showScreen('play');
    $('best').textContent = 'Best ' + levelSave(G.level.id).score.toLocaleString();
    const demolish = G.sim.objective.type === 'demolish';
    $('goal').classList.toggle('hidden', !demolish);
    if (demolish) $('goal-mark').style.left = G.sim.objective.pct + '%';
    startLoad();
    levelTips();
  }

  function startLoad() {
    G.load = { t: 0, dur: 0.45 };
    const type = G.sim.currentBird;
    if (type && !save.tips[type] && type !== 'red') {
      save.tips[type] = 1; persist();
      showTip(type, Sim.BIRDS[type].name, Sim.BIRDS[type].tip);
    }
  }

  function levelTips() {
    const w = WORLDS[G.worldIdx];
    if (G.level.id === '1-1' && !save.tips.howto) {
      save.tips.howto = 1; persist();
      showTip('red', 'How to play', 'Drag the bird back and let go. Pop every pig!');
    } else if (w.theme === 'space' && !save.tips.space) {
      save.tips.space = 1; persist();
      showTip('blue', 'Space!', 'Inside the dashed circles, planets pull your birds. Outside, they fly straight.', 6);
    } else if (w.theme === 'demo' && !save.tips.demo) {
      save.tips.demo = 1; persist();
      showTip('big', 'Demolition', 'No pigs here. Wreck at least the goal % of blocks!', 5);
    }
  }

  function showTip(type, title, text, secs) {
    const tip = $('tip');
    tip.innerHTML = '';
    tip.appendChild(Render.birdPortrait(type, 34));
    const span = document.createElement('span');
    span.innerHTML = '<b></b> ';
    span.querySelector('b').textContent = title;
    span.appendChild(document.createTextNode(text));
    tip.appendChild(span);
    tip.classList.remove('hidden');
    G.tipTimer = secs || 4.5;
  }

  // ---------------- camera ----------------
  function fitView(view) {
    const W = renderer.W, H = renderer.H;
    const vw = view.x2 - view.x1, vh = view.y2 - view.y1;
    const s = Math.min(W / vw, H / vh);
    const space = G.sim && G.sim.space;
    return { x: (view.x1 + view.x2) / 2, y: space ? (view.y1 + view.y2) / 2 : view.y1 + H / (2 * s), s };
  }

  function cameraTarget() {
    const sim = G.sim;
    const base = fitView(sim.view);
    if (sim.state !== 'flying' || !sim.projectiles.length) return base;
    const v = Object.assign({}, sim.view);
    for (const e of sim.projectiles) {
      const p = e.body.getPosition();
      v.x1 = Math.min(v.x1, p.x - 3); v.x2 = Math.max(v.x2, p.x + 3);
      v.y1 = Math.min(v.y1, p.y - 3); v.y2 = Math.max(v.y2, p.y + 3);
    }
    const t = fitView(v);
    if (t.s < base.s * 0.5) {
      t.s = base.s * 0.5;
      if (!sim.space) t.y = Math.max(sim.view.y1 + renderer.H / (2 * t.s), t.y);
    }
    return t;
  }

  function snapCamera() { if (G.sim) Object.assign(G.cam, cameraTarget()); }

  function updateCamera(dt) {
    if (!G.sim || G.camMode !== 'auto') return;
    const t = cameraTarget();
    const k = 1 - Math.exp(-dt * 3.2);
    G.cam.x += (t.x - G.cam.x) * k;
    G.cam.y += (t.y - G.cam.y) * k;
    G.cam.s = Math.exp(Math.log(G.cam.s) + (Math.log(t.s) - Math.log(G.cam.s)) * k);
  }

  function screenToWorld(x, y) {
    return { x: (x - renderer.W / 2) / G.cam.s + G.cam.x, y: G.cam.y - (y - renderer.H / 2) / G.cam.s };
  }

  // ---------------- input ----------------
  const pointers = new Map();
  let pan = null, pinch = null;

  function maxPull() { return Math.max(2.0, Math.min(3.2, 90 / G.cam.s)); }

  function birdReady() { return G.sim && G.sim.state === 'aim' && !G.load && !G.ending; }

  canvas.addEventListener('pointerdown', (e) => {
    Sfx.unlock();
    if (G.screen !== 'play' || G.paused) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      G.aim = null; pan = null;
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: G.cam.s, world: screenToWorld(mid.x, mid.y) };
      return;
    }
    if (pointers.size > 2) return;
    const sim = G.sim;
    if (sim.state === 'flying' && sim.ability()) return;
    if (birdReady()) {
      const rest = { x: sim.sling.restX, y: sim.sling.restY };
      const sp = renderer.toScreen(G.cam, rest.x, rest.y);
      const r = Sim.BIRDS[sim.currentBird].r;
      if (Math.hypot(e.clientX - sp.x, e.clientY - sp.y) < Math.max(56, r * G.cam.s * 2.6)) {
        G.aim = { id: e.pointerId, x: rest.x, y: rest.y, pts: null, max: maxPull(), lastSound: 0 };
        if (G.tipTimer > 0) G.tipTimer = Math.min(G.tipTimer, 0.01);
        G.camMode = 'auto';
        Sfx.play('stretch');
        return;
      }
    }
    pan = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const fit = fitView(G.sim.view).s;
      const s = Math.max(fit * 0.6, Math.min(fit * 3, pinch.s * d / pinch.d));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      G.cam.s = s;
      G.cam.x = pinch.world.x - (mid.x - renderer.W / 2) / s;
      G.cam.y = pinch.world.y + (mid.y - renderer.H / 2) / s;
      G.camMode = 'user';
      return;
    }
    if (G.aim && G.aim.id === e.pointerId) {
      const sim = G.sim;
      const w = screenToWorld(e.clientX, e.clientY);
      let px = w.x - sim.sling.restX, py = w.y - sim.sling.restY;
      const l = Math.hypot(px, py);
      if (l > G.aim.max) { px *= G.aim.max / l; py *= G.aim.max / l; }
      G.aim.x = sim.sling.restX + px; G.aim.y = sim.sling.restY + py;
      const v = launchVelocity();
      G.aim.pts = v ? sim.predict(v.x, v.y, sim.space ? 150 : 50) : null;
      const pull = Math.hypot(px, py);
      if (Math.abs(pull - G.aim.lastSound) > 0.6) { G.aim.lastSound = pull; Sfx.play('stretch'); }
      return;
    }
    if (pan && pan.id === e.pointerId) {
      if (!pan.moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 8) return;
      pan.moved = true;
      G.camMode = 'user';
      G.cam.x -= dx / G.cam.s;
      G.cam.y += dy / G.cam.s;
      const v = G.sim.view;
      G.cam.x = Math.max(v.x1 - 10, Math.min(v.x2 + 10, G.cam.x));
      G.cam.y = Math.max(v.y1 - 10, Math.min(v.y2 + 15, G.cam.y));
    }
  });

  function launchVelocity() {
    const sim = G.sim, a = G.aim;
    const dx = sim.sling.restX - a.x, dy = sim.sling.restY - a.y;
    const l = Math.hypot(dx, dy);
    if (l < a.max * 0.15) return null;
    const speed = sim.maxSpeed * Math.min(1, l / a.max);
    return { x: dx / l * speed, y: dy / l * speed };
  }

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (G.aim && G.aim.id === e.pointerId) {
      const v = e.type === 'pointercancel' ? null : launchVelocity();
      if (v && birdReady()) {
        G.lastTrail = G.sim.trail.slice();
        G.sim.launch(v.x, v.y);
      }
      G.aim = null;
    }
    if (pan && pan.id === e.pointerId) pan = null;
    if (pointers.size < 2) pinch = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------- per-frame updates ----------------
  function queueLayout() {
    const sim = G.sim;
    const out = [];
    if (!sim) return out;
    let start = sim.birdIndex + (sim.state === 'aim' ? 1 : 0);
    let x = sim.sling.x - 1.0;
    const shown = sim.birdQueue.slice(start);
    const hide = G.hiddenQueue;
    shown.forEach((type, k) => {
      if (k < hide) return;
      const r = Sim.BIRDS[type].r;
      x -= r;
      const hop = Math.max(0, Math.sin(G.time * 2.4 + k * 1.7)) * 0.35 * (Math.sin(G.time * 0.7 + k) > 0.3 ? 1 : 0);
      out.push({ type, r, x, y: sim.sling.y + r + hop, blink: Math.sin(G.time * 1.3 + k * 2) > 0.97, k });
      x -= r + 0.25;
    });
    return out;
  }

  function slingBird() {
    const sim = G.sim;
    if (!sim || sim.state !== 'aim' || G.ending) return null;
    const type = sim.currentBird;
    if (!type) return null;
    const r = Sim.BIRDS[type].r;
    const rest = { x: sim.sling.restX, y: sim.sling.restY };
    if (G.load) {
      const k = Math.min(1, G.load.t / G.load.dur);
      const fromX = sim.sling.x - 1.0 - r, fromY = sim.sling.y + r;
      return { type, r, x: fromX + (rest.x - fromX) * k, y: fromY + (rest.y - fromY) * k + Math.sin(k * Math.PI) * 1.2 };
    }
    if (G.aim) return { type, r, x: G.aim.x, y: G.aim.y };
    return { type, r, x: rest.x, y: rest.y, blink: Math.sin(G.time * 1.1) > 0.98 };
  }

  function updateEnding(dt) {
    const e = G.ending;
    if (!e) return;
    e.t += dt;
    if (e.won) {
      // spare birds turn into bonus points one by one
      const due = Math.floor((e.t - 0.6) / 0.38) + 1;
      while (e.popped < e.spare && e.popped < due) {
        const q = queueLayout();
        const b = q[0];
        if (b) {
          fx.text(b.x, b.y + 1.2, '10000', '#ffd23a', 24);
          fx.feathers(b.type, b.x, b.y, 6);
          fx.smoke(b.x, b.y, 0.6, 'rgba(255,255,255,', 4);
        }
        Sfx.play('bonus');
        G.hiddenQueue++;
        e.popped++;
      }
      if (e.t > 0.9 + e.spare * 0.38 && !e.shown) { e.shown = true; showResult(true); }
    } else if (e.t > 1.4 && !e.shown) {
      e.shown = true; showResult(false);
    }
  }

  function updateHud(dt) {
    const sim = G.sim;
    if (!sim || G.screen !== 'play') return;
    const target = sim.score;
    if (G.shownScore !== target) {
      G.shownScore = Math.min(target, G.shownScore + Math.max(50, (target - G.shownScore) * dt * 6));
      if (target < G.shownScore) G.shownScore = target;
      $('score').textContent = Math.round(G.shownScore).toLocaleString();
    }
    if (sim.objective.type === 'demolish') {
      const pct = sim.demolishPct();
      $('goal-text').textContent = `Wrecked ${pct}%  ·  Goal ${sim.objective.pct}%`;
      $('goal-fill').style.width = pct + '%';
    }
    if (G.tipTimer > 0) {
      G.tipTimer -= dt;
      if (G.tipTimer <= 0) $('tip').classList.add('hidden');
    }
  }

  // ---------------- main loop ----------------
  // Draw at the screen's full sharpness (the S24 Ultra is ~2.8x), but step down
  // the resolution if the phone can't keep a smooth frame rate.
  let dprCap = 3, slowFrames = 0, timedFrames = 0;
  function watchFrameRate(interval) {
    if (G.screen !== 'play' || G.paused || interval > 0.25) return;
    timedFrames++;
    if (interval > 1 / 40) slowFrames++;
    if (timedFrames >= 120) {
      if (slowFrames > 60 && dprCap > 1.5) { dprCap = dprCap > 2 ? 2 : 1.5; resize(); }
      slowFrames = 0; timedFrames = 0;
    }
  }

  let last = performance.now();
  function frame(now) {
    watchFrameRate((now - last) / 1000);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!G.paused) {
      G.time += dt;
      if (G.sim) {
        G.acc += dt;
        let n = 0;
        while (G.acc >= STEP && n < 4) { G.sim.step(); G.acc -= STEP; n++; }
        if (n === 4) G.acc = 0;
      }
      if (G.load) { G.load.t += dt; if (G.load.t >= G.load.dur) G.load = null; }
      fx.update(dt, G.sim);
      updateEnding(dt);
      updateCamera(dt);
      updateHud(dt);
    }
    renderer.draw({
      sim: G.sim, cam: G.cam, theme: G.theme, time: G.time, fx,
      aim: G.aim, lastTrail: G.lastTrail, queue: queueLayout(), slingBird: slingBird(),
    });
    requestAnimationFrame(frame);
  }

  // ---------------- screens ----------------
  const SCREENS = ['title', 'worlds', 'levels', 'pause', 'result'];

  function showScreen(name) {
    G.screen = name;
    for (const s of SCREENS) $('scr-' + s).classList.toggle('hidden', s !== name);
    $('hud').classList.toggle('hidden', !(name === 'play' || name === 'pause' || name === 'result'));
    if (name !== 'play') $('tip').classList.add('hidden');
    if (name === 'pause' || name === 'result') $('hud').classList.add('hidden');
    if (name === 'worlds') buildWorlds();
    if (name === 'levels') buildLevels();
    if (name === 'title' || name === 'worlds' || name === 'levels') menuBackdrop();
  }

  // An idle level behind the menus.
  function menuBackdrop() {
    const wi = G.screen === 'levels' ? G.worldIdx : 0;
    const want = WORLDS[wi].levels[0];
    if (!G.sim || G.level !== want || G.sim.state !== 'aim') {
      G.level = want;
      G.theme = themeOf(wi);
      G.sim = new Sim(want, { onEvent: () => {} });
      G.ending = null; G.aim = null; G.load = null; G.hiddenQueue = 0; G.lastTrail = [];
      fx.clear();
    }
    G.camMode = 'auto';
    G.paused = false;
    snapCamera();
  }

  const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"/></svg>';
  const LOCK_SVG = '<svg class="lock" viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z"/></svg>';

  function buildWorlds() {
    const list = $('world-list');
    list.innerHTML = '';
    let total = 0, max = 0;
    const pics = { island: [['bird', 'red'], ['pig', 'small']], space: [['bird', 'blue'], ['pig', 'helmet']], demo: [['bird', 'big'], ['bird', 'black']] };
    WORLDS.forEach((w, wi) => {
      const stars = worldStars(w);
      total += stars; max += w.levels.length * 3;
      const card = document.createElement('button');
      card.className = 'world-card ' + w.theme;
      card.innerHTML = `<h3></h3><div class="pics"></div><p></p><div class="wstars">${STAR_SVG}<span>${stars}/${w.levels.length * 3}</span></div>`;
      card.querySelector('h3').textContent = w.name;
      card.querySelector('p').textContent = w.desc;
      const pc = card.querySelector('.pics');
      for (const [kind, type] of pics[w.theme]) pc.appendChild(kind === 'bird' ? Render.birdPortrait(type, 60) : Render.pigPortrait(type, 60));
      card.addEventListener('click', () => { Sfx.unlock(); Sfx.play('click'); G.worldIdx = wi; showScreen('levels'); });
      list.appendChild(card);
    });
    $('total-stars').innerHTML = `${STAR_SVG}<span>${total}/${max}</span>`;
  }

  const levelPage = {};

  function levelsPerPage() {
    const cols = window.innerWidth >= 790 ? 10 : 5;
    return { cols, size: cols * (window.innerHeight >= 440 ? 3 : 2) };
  }

  function buildLevels() {
    const w = WORLDS[G.worldIdx];
    $('levels-title').textContent = w.name;
    $('world-stars').innerHTML = `${STAR_SVG}<span>${worldStars(w)}/${w.levels.length * 3}</span>`;
    const { cols, size } = levelsPerPage();
    const pages = Math.ceil(w.levels.length / size);
    let page = levelPage[G.worldIdx];
    if (page == null) {
      // open on the page with the next level to beat
      let next = w.levels.findIndex((l, i) => unlocked(w, i) && !levelSave(l.id).stars);
      if (next < 0) next = 0;
      page = Math.floor(next / size);
    }
    page = Math.max(0, Math.min(pages - 1, page));
    levelPage[G.worldIdx] = page;

    const grid = $('level-grid');
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--bw', cols === 10 ? '56px' : '64px');
    grid.innerHTML = '';
    w.levels.slice(page * size, (page + 1) * size).forEach((l, k) => {
      const li = page * size + k;
      const btn = document.createElement('button');
      const open = unlocked(w, li);
      btn.className = 'level-btn' + (open ? '' : ' locked');
      if (open) {
        const st = levelSave(l.id).stars;
        btn.innerHTML = `<span>${li + 1}</span><div class="lstars">${[0, 1, 2].map(i => STAR_SVG.replace('<svg', `<svg class="${i < st ? 'on' : ''}"`)).join('')}</div>`;
        btn.addEventListener('click', () => { Sfx.unlock(); Sfx.play('click'); startLevel(G.worldIdx, li); });
      } else {
        btn.innerHTML = LOCK_SVG;
      }
      btn.setAttribute('aria-label', 'Level ' + (li + 1) + (open ? '' : ' (locked)'));
      grid.appendChild(btn);
    });
    $('lv-prev').classList.toggle('off', page === 0);
    $('lv-next').classList.toggle('off', page >= pages - 1);
    $('level-dots').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) => `<span class="${i === page ? 'on' : ''}"></span>`).join('') : '';
  }

  function turnPage(d) {
    const w = WORLDS[G.worldIdx];
    const pages = Math.ceil(w.levels.length / levelsPerPage().size);
    const p = (levelPage[G.worldIdx] || 0) + d;
    if (p < 0 || p >= pages) return;
    levelPage[G.worldIdx] = p;
    Sfx.play('click');
    buildLevels();
  }

  $('lv-prev').addEventListener('click', () => turnPage(-1));
  $('lv-next').addEventListener('click', () => turnPage(1));
  // swipe left/right on the level grid
  let swipeX = null;
  $('scr-levels').addEventListener('pointerdown', (e) => { swipeX = e.clientX; });
  $('scr-levels').addEventListener('pointerup', (e) => {
    if (swipeX == null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 60) turnPage(dx < 0 ? 1 : -1);
  });

  function showResult(won) {
    const sim = G.sim, id = G.level.id;
    const prev = levelSave(id);
    const stars = won ? sim.stars : 0;
    const newBest = won && sim.score > prev.score;
    if (won) {
      save.levels[id] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, sim.score) };
      persist();
    }
    $('r-title').textContent = won ? 'Level Cleared!' : 'Level Failed';
    $('r-title').classList.toggle('fail', !won);
    $('r-score').textContent = sim.score.toLocaleString();
    $('r-new').classList.toggle('hidden', !newBest);
    let sub = '';
    if (sim.objective.type === 'demolish') sub = `Wrecked ${sim.demolishPct()}% (goal ${sim.objective.pct}%)`;
    else if (!won) sub = sim.pigs.length === 1 ? '1 pig survived. Try again!' : `${sim.pigs.length} pigs survived. Try again!`;
    else if (sim.spareBirds) sub = `${sim.spareBirds} spare bird${sim.spareBirds > 1 ? 's' : ''} × 10,000 bonus`;
    $('r-sub').textContent = sub;
    const starEls = $('r-stars').querySelectorAll('.star');
    starEls.forEach(s => s.classList.remove('on'));
    for (let i = 0; i < stars; i++) {
      setTimeout(() => { starEls[i].classList.add('on'); Sfx.play('star', { i }); }, 350 + i * 380);
    }
    const w = WORLDS[G.worldIdx];
    const hasNext = G.levelIdx + 1 < w.levels.length ? unlocked(w, G.levelIdx + 1) : G.worldIdx + 1 < WORLDS.length;
    $('r-next').classList.toggle('hidden', !hasNext);
    Sfx.play(won ? 'win' : 'lose');
    showScreen('result');
  }

  function nextLevel() {
    const w = WORLDS[G.worldIdx];
    if (G.levelIdx + 1 < w.levels.length) startLevel(G.worldIdx, G.levelIdx + 1);
    else if (G.worldIdx + 1 < WORLDS.length) startLevel(G.worldIdx + 1, 0);
  }

  function pause(on) {
    if (G.screen !== 'play' && G.screen !== 'pause') return;
    G.paused = on;
    G.aim = null;
    showScreen(on ? 'pause' : 'play');
  }

  // ---------------- buttons ----------------
  function bind(id, fn) {
    $(id).addEventListener('click', (e) => { e.stopPropagation(); Sfx.unlock(); Sfx.play('click'); fn(); });
  }

  bind('btn-play', () => { goFullscreen(); showScreen('worlds'); });
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { Sfx.play('click'); showScreen(b.dataset.back); }));
  bind('btn-pause', () => pause(true));
  bind('btn-restart', () => startLevel(G.worldIdx, G.levelIdx));
  bind('p-resume', () => pause(false));
  bind('p-restart', () => startLevel(G.worldIdx, G.levelIdx));
  bind('p-levels', () => { G.paused = false; showScreen('levels'); });
  bind('r-retry', () => startLevel(G.worldIdx, G.levelIdx));
  bind('r-levels', () => showScreen('levels'));
  bind('r-next', nextLevel);

  function syncToggles() {
    for (const id of ['btn-sound', 'p-sound']) $(id).classList.toggle('is-off', !save.sound);
    for (const id of ['btn-music', 'p-music']) $(id).classList.toggle('is-off', !save.music);
  }
  function toggleSound() { save.sound = !save.sound; Sfx.setSound(save.sound); persist(); syncToggles(); }
  function toggleMusic() { save.music = !save.music; Sfx.setMusic(save.music); persist(); syncToggles(); }
  bind('btn-sound', toggleSound); bind('p-sound', toggleSound);
  bind('btn-music', toggleMusic); bind('p-music', toggleMusic);
  syncToggles();

  function goFullscreen() {
    const standalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
    if (standalone || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => {});
  }

  // ---------------- layout ----------------
  function resize() {
    const W = window.innerWidth, H = window.innerHeight;
    renderer.resize(W, H, Math.min(dprCap, window.devicePixelRatio || 1));
    const portrait = H > W * 1.05;
    $('rotate').classList.toggle('hidden', !portrait);
    if (portrait && G.screen === 'play') pause(true);
    if (G.camMode === 'auto') snapCamera();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (G.screen === 'play') pause(true); Sfx.pauseAll(true); }
    else Sfx.pauseAll(false);
  });
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

  // title art
  const tb = $('title-birds');
  for (const t of ['red', 'yellow', 'blue', 'black', 'white']) tb.appendChild(Render.birdPortrait(t, 60));
  tb.appendChild(Render.pigPortrait('helmet', 60));

  resize();
  // ?level=2-3 jumps straight into a level (handy for testing)
  const jump = new URLSearchParams(location.search).get('level');
  let jumped = false;
  if (jump) {
    WORLDS.forEach((w, wi) => w.levels.forEach((l, li) => { if (l.id === jump && !jumped) { jumped = true; startLevel(wi, li); } }));
  }
  if (!jumped) showScreen('title');
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
