/* Brick Blitz — game controller: screens, input, effects, progress. */
(function () {
  'use strict';

  const STEP = Sim.STEP;
  const { FW } = Sim;
  const { LEVELS, WORLDS } = window;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const renderer = new Render.Renderer(canvas);
  const fx = new Render.FX();
  const params = new URLSearchParams(location.search);

  // ---------------- saved progress ----------------
  const SAVE_KEY = 'brickblitz-v1';
  const save = { levels: {}, sound: true, music: true, tips: {}, skin: 0 };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) { /* private mode */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage full or blocked */ } }
  Sfx.soundOn = save.sound;
  Sfx.musicOn = save.music;
  renderer.setSkin(save.skin);

  const unlockAll = params.has('unlock');
  const levelSave = (l) => save.levels[l.id] || { stars: 0, score: 0 };
  const starsOf = (levels) => levels.reduce((s, l) => s + levelSave(l).stars, 0);
  const totalStars = () => starsOf(LEVELS);
  const unlocked = (n) => unlockAll || n === 1 || levelSave(LEVELS[n - 2]).stars > 0;

  // ---------------- game state ----------------
  const G = {
    screen: 'title', level: null, sim: null, bot: null, demo: false, theme: 'neon',
    time: 0, acc: 0, paused: false, ending: null, shownScore: 0, intro: 1,
    paddleSquash: 0, comboPulse: 0, slow: null, timeScale: 1, tipTimer: 0, worldIdx: 0,
  };
  window.__game = G; // handy for debugging from the console

  // ---------------- sim events -> sound, effects, haptics ----------------
  const POWER_NAMES = {
    expand: ['Wide Paddle', 'Your paddle grows for 15 seconds.'],
    shrink: ['Tiny Paddle', 'Red capsules are bad news: your paddle shrinks for a while. Dodge them!'],
    multi: ['Multiball', 'Every ball splits into three.'],
    slow: ['Slow Ball', 'Balls slow down for 12 seconds.'],
    fast: ['Speed Up', 'A red one: balls speed up for a while.'],
    laser: ['Lasers', 'Your paddle fires lasers on its own for 10 seconds.'],
    magnet: ['Magnet', 'The ball sticks to your paddle. Let go or tap to fire it.'],
    fire: ['Fireball', 'Balls burn straight through bricks for 8 seconds.'],
    life: ['Extra Ball', 'One more ball in reserve.'],
    shield: ['Safety Net', 'Saves one ball that falls past your paddle.'],
    zap: ['Lightning', 'Strikes five bricks at once.'],
  };
  const MULT_COLORS = ['#fff', '#fff', '#ffd23a', '#ff9a2a', '#ff6a3a', '#ff4a8a', '#c86bff', '#5ad1ff', '#5affb0'];

  function onSimEvent(type, d) {
    const demo = G.demo;
    const sound = demo ? () => {} : (n, o) => Sfx.play(n, o);
    const buzz = demo ? () => {} : (ms) => Sfx.vibrate(ms);
    switch (type) {
      case 'paddle':
        sound('paddle');
        fx.sparks(d.x, d.y, renderer.skin.glow, 5, 5, true);
        G.paddleSquash = 1;
        buzz(8);
        break;
      case 'wall':
        sound('wall');
        fx.sparks(d.x, d.y, '#ffffff', 2, 3);
        break;
      case 'hit':
        sound(d.b.kind === 'steel' || d.b.kind === 'armor' ? 'steel' : 'hit');
        fx.sparks(d.x, d.y, '#ffffff', 4, 4);
        break;
      case 'gold':
        sound('gold');
        fx.sparks(d.x, d.y, '#ffe46a', 5, 5);
        break;
      case 'reveal':
        sound('reveal');
        fx.ring(d.x, d.y, '#e8dcff', 1.2, 0.4);
        break;
      case 'break': {
        sound('break', { combo: d.combo });
        fx.shatter(d.b, d.x, d.y, 0, 0, d.b.maxHp > 1 || d.b.kind !== 'normal');
        if (d.mult >= 2) fx.text(d.x, d.y, '+' + d.pts, MULT_COLORS[d.mult] || '#fff', 13);
        else if (d.pts >= 300) fx.text(d.x, d.y, '+' + d.pts, '#ffffff', 12);
        if (d.combo > 1 && (d.combo - 1) % 4 === 0) {
          G.comboPulse = 1;
          if (d.combo >= 9) sound('combo', { n: d.combo });
        }
        break;
      }
      case 'explode':
        sound('explode');
        fx.explosion(d.x, d.y, demo ? 0.6 : 1);
        if (demo) fx.trauma = 0;
        buzz(35);
        break;
      case 'drop': sound('drop'); break;
      case 'power': {
        const nm = POWER_NAMES[d.type][0];
        sound(d.good ? 'powerGood' : 'powerBad');
        fx.text(d.x, Sim.PADDLE_Y - 0.8, nm.toUpperCase(), d.good ? '#7dffb0' : '#ff6b6b', 15);
        fx.ring(d.x, Sim.PADDLE_Y, d.good ? '#7dffb0' : '#ff4a4a', 1.4, 0.35);
        buzz(20);
        if (!demo && !save.tips['p_' + d.type]) {
          save.tips['p_' + d.type] = 1;
          persist();
          showTip(Render.capsuleIcon(d.type, 18), nm, POWER_NAMES[d.type][1], 4, true);
        }
        break;
      }
      case 'multi': sound('multi'); break;
      case 'zap':
        sound('zap');
        fx.lightning(d.x, d.y, d.targets);
        buzz(30);
        break;
      case 'laser': sound('laser'); break;
      case 'boltHit': fx.sparks(d.x, d.y, '#ff8aa0', 2, 3); break;
      case 'freeBall':
        sound('freeBall');
        fx.ring(d.x, d.y, '#9fe6ff', 1.2, 0.4);
        break;
      case 'magnet': sound('magnet'); G.paddleSquash = 0.6; break;
      case 'launch':
        sound('launch');
        $('hint').classList.add('hidden');
        if (G.tipServe) { G.tipServe = false; G.tipTimer = Math.min(G.tipTimer, 0.01); }
        break;
      case 'shieldSave':
        sound('shield');
        fx.sparks(d.x, d.y, '#5affdc', 14, 7, true);
        fx.flash = Math.max(fx.flash, 0.15);
        break;
      case 'ballOut': if (d.left > 0) sound('ballOut'); break;
      case 'lifeLost':
        sound('lifeLost');
        fx.sparks(G.sim.paddle.x, Sim.FH - 0.3, '#ff4a4a', 18, 9, true);
        fx.shake(0.5);
        buzz(150);
        break;
      case 'serve':
        if (!demo && G.sim && G.sim.lives > 0) $('hint').classList.remove('hidden');
        break;
      case 'stun':
        sound('stun');
        fx.sparks(d.x, d.y, '#bfe8ff', 10, 6, true);
        fx.shake(0.25);
        buzz(60);
        break;
      case 'turret': sound('turret'); break;
      case 'bossShot': sound('bossShot'); break;
      case 'bossHit':
        sound('bossHit');
        fx.sparks(d.x, d.y, '#ffd23a', 8, 7);
        fx.shake(0.15);
        buzz(12);
        break;
      case 'bossPhase':
        sound('bossPhase');
        fx.flash = Math.max(fx.flash, 0.3);
        fx.shake(0.5);
        fx.text(d.x, d.y - 1.6, 'ENRAGED!', '#ff5a5a', 18);
        break;
      case 'bossDie': {
        sound('bossDie');
        for (let i = 0; i < 6; i++) {
          setTimeout(() => {
            fx.explosion(d.x + (Math.random() - 0.5) * d.w, d.y + (Math.random() - 0.5) * d.h, 1.3);
            if (!G.demo) Sfx.vibrate(40);
          }, i * 220);
        }
        fx.flash = 0.6;
        slowMo(0.35, 1.2);
        break;
      }
      case 'summon':
        sound('summon');
        for (const b of d.bricks) fx.ring(b.x + 0.5, b.y + 0.25, '#ffffff', 0.9, 0.3);
        break;
      case 'descendWarn': sound('warn'); break;
      case 'descend': sound('descend'); fx.shake(0.3); break;
      case 'expire': sound('expire'); break;
      case 'win': {
        if (demo) break;
        G.ending = { won: true, t: 0 };
        slowMo(0.22, 0.9);
        fx.flash = Math.max(fx.flash, 0.35);
        for (const b of G.sim.balls) fx.sparks(b.x, b.y, '#ffd23a', 16, 9);
        $('hint').classList.add('hidden');
        break;
      }
      case 'fail':
        if (demo) break;
        G.ending = { won: false, t: 0 };
        $('hint').classList.add('hidden');
        if (d.reason === 'wall') { fx.shake(0.8); Sfx.play('descend'); }
        break;
    }
  }

  function slowMo(scale, secs) {
    if (!G.slow || scale <= G.slow.scale || G.slow.t <= 0) G.slow = { scale, t: secs };
  }

  // ---------------- tips ----------------
  const TIPS = [
    ['armored', /[ROYLGCBPMW]/, ['normal', 'red', 2], 'Armoured', 'Bricks with a white frame take two hits.'],
    ['metal', /[2-5]/, ['armor', 'metal', 3], 'Metal', 'The dots show how many hits a metal brick has left.'],
    ['tnt', /\*/, ['tnt', 'tnt'], 'TNT', 'Blows up everything around it, and sets off other TNT.'],
    ['bonus', /\?/, ['bonus', 'bonus'], 'Bonus Brick', 'Always drops a power-up. Catch the good ones, dodge the red ones.'],
    ['cage', /\+/, ['ball', 'ball'], 'Ball Cage', 'Break it to free an extra ball.'],
    ['gold', /#/, ['gold', 'gold'], 'Gold', "Can't be broken. Bounce the ball around it."],
    ['ghost', /~/, ['ghost', 'ghost', 1], 'Ghost Bricks', 'Invisible until hit. Watch for a faint shimmer.'],
    ['steel', /@/, ['steel', 'steel', 6], 'Steel', 'Takes six hits. Lasers and fireballs make it easier.'],
    ['turret', /\^/, ['turret', 'turret', 2], 'Turret', 'Shoots at your paddle. A hit stuns it for a moment.'],
  ];

  function levelTip(level) {
    if (level.n === 1 && !save.tips.howto) {
      save.tips.howto = 1;
      persist();
      const touch = matchMedia('(pointer: coarse)').matches;
      showTip(Render.capsuleIcon('expand', 18), 'How to play', touch
        ? 'Drag anywhere to move the paddle, and let go to launch. Hit the ball with the ends of the paddle to steer it.'
        : 'Move the mouse (or use the arrow keys) to steer the paddle, and click or press Space to launch.', 60);
      return;
    }
    const map = level.map.join('');
    const special = [
      ['boss', !!level.boss, null, 'Boss Fight', 'Hit the boss until its health bar is empty. Dodge its shots: a hit stuns your paddle.'],
      ['move', !!level.move, null, 'Sliding Rows', 'Some rows slide from side to side. Time your shots.'],
      ['descend', !!level.descend, null, 'Sinking Wall', 'The wall drops a row every few seconds. Clear it before it reaches the red line!'],
    ];
    for (const [key, has, icon, title, text] of special) {
      if (has && !save.tips[key]) {
        save.tips[key] = 1;
        persist();
        showTip(icon, title, text, 60);
        return;
      }
    }
    for (const [key, re, icon, title, text] of TIPS) {
      if (re.test(map) && !save.tips[key]) {
        save.tips[key] = 1;
        persist();
        showTip(Render.brickIcon(icon[0], icon[1], icon[2], 36), title, text, 60);
        return;
      }
    }
  }

  // Level tips sit mid-screen while the ball waits on the paddle, and go away on launch;
  // tips during play sit at the top, out of the ball's way.
  function showTip(icon, title, text, secs, top) {
    const tip = $('tip');
    tip.classList.toggle('top', !!top);
    G.tipServe = !top;
    tip.innerHTML = '';
    if (icon) tip.appendChild(icon);
    const span = document.createElement('span');
    span.innerHTML = '<b></b> ';
    span.querySelector('b').textContent = title;
    span.appendChild(document.createTextNode(text));
    tip.appendChild(span);
    tip.classList.remove('hidden');
    G.tipTimer = secs || 4.5;
  }

  // ---------------- level lifecycle ----------------
  function startLevel(n) {
    const level = LEVELS[n - 1];
    G.level = level;
    G.worldIdx = level.world;
    G.demo = false;
    G.bot = null;
    G.theme = WORLDS[level.world].theme;
    G.sim = new Sim(level, { seed: (Math.random() * 4294967296) >>> 0, onEvent: onSimEvent, intro: 1.0 });
    G.ending = null;
    G.shownScore = 0;
    G.intro = 0;
    G.slow = null;
    G.timeScale = 1;
    G.acc = 0;
    G.paused = false;
    drag = null;
    fx.clear();
    showScreen('play');
    const banner = $('banner');
    banner.classList.add('hidden');
    void banner.offsetWidth; // restart the animation
    $('banner-top').textContent = level.boss ? 'BOSS FIGHT' : 'LEVEL ' + level.n;
    $('banner-top').classList.toggle('boss', !!level.boss);
    $('banner-name').textContent = level.name;
    banner.classList.remove('hidden');
    clearTimeout(G.bannerTimer);
    G.bannerTimer = setTimeout(() => banner.classList.add('hidden'), 1700);
    $('hint').textContent = matchMedia('(pointer: coarse)').matches ? 'Tap to launch' : 'Click or press Space to launch';
    $('hint').classList.remove('hidden');
    $('tip').classList.add('hidden');
    Sfx.playTrack(level.boss ? 'boss' : G.theme);
    Sfx.play('start');
    G.tipTimer = 0;
    G.tipServe = false;
    levelTip(level);
  }

  // A bot plays an early level behind the menus.
  function startDemo() {
    const pool = LEVELS.filter(l => !l.boss && l.n <= Math.max(20, Math.min(100, highestUnlocked())));
    const level = pool[Math.floor(Math.random() * pool.length)];
    G.level = level;
    G.demo = true;
    G.theme = WORLDS[level.world].theme;
    G.sim = new Sim(level, { seed: (Math.random() * 4294967296) >>> 0, onEvent: onSimEvent });
    G.bot = new Bot.Bot(G.sim, { seed: (Math.random() * 1e9) >>> 0, skill: { err: 0.25, lapse: 0.01, speed: 26, edge: 0.75 } });
    G.sim.lives = 99;
    G.ending = null;
    G.intro = 0;
    G.slow = null;
    G.timeScale = 1;
    fx.clear();
  }

  function highestUnlocked() {
    let n = 1;
    while (n < LEVELS.length && unlocked(n + 1)) n++;
    return n;
  }

  function updateEnding(dt) {
    if (!G.ending || G.ending.shown) return;
    G.ending.t += dt;
    if (G.ending.t > (G.ending.won ? 1.7 : 1.3)) {
      G.ending.shown = true;
      showResult(G.ending.won);
    }
  }

  // ---------------- screens ----------------
  const SCREENS = ['title', 'worlds', 'levels', 'styles', 'pause', 'result'];

  function showScreen(name) {
    G.screen = name;
    for (const s of SCREENS) $('scr-' + s).classList.toggle('hidden', s !== name);
    $('hud').classList.toggle('hidden', name !== 'play');
    if (name !== 'play') { $('tip').classList.add('hidden'); $('hint').classList.add('hidden'); $('banner').classList.add('hidden'); }
    if (name === 'title') buildTitle();
    if (name === 'worlds') buildWorlds();
    if (name === 'levels') buildLevels();
    if (name === 'styles') buildStyles();
    if ((name === 'title' || name === 'worlds' || name === 'levels' || name === 'styles') && !G.demo) {
      startDemo();
      Sfx.playTrack('menu');
    }
  }

  const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"/></svg>';
  const LOCK_SVG = '<svg class="lock" viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z"/></svg>';

  function buildTitle() {
    $('title-stars').innerHTML = `${STAR_SVG}<span>${totalStars()} / ${LEVELS.length * 3}</span>`;
  }

  const WORLD_PICS = [
    [['tnt', 'tnt'], ['ball', 'ball'], ['normal', 'pink', 2]],
    [['ghost', 'ghost', 1], ['steel', 'steel', 6], ['normal', 'cyan']],
    [['turret', 'turret', 2], ['tnt', 'tnt'], ['normal', 'orange']],
    [['gold', 'gold'], ['normal', 'purple', 2], ['armor', 'metal', 3]],
    [['steel', 'steel', 6], ['turret', 'turret', 2], ['normal', 'lime']],
  ];

  function buildWorlds() {
    const list = $('world-list');
    list.innerHTML = '';
    WORLDS.forEach((w, wi) => {
      const first = w.levels[0].n;
      const open = unlocked(first);
      const stars = starsOf(w.levels);
      const card = document.createElement('button');
      card.className = 'world-card ' + w.theme + (open ? '' : ' locked');
      card.innerHTML = `<div class="wnum"></div><h3></h3><div class="pics"></div><p></p><div class="wstars">${STAR_SVG}<span>${stars}/${w.levels.length * 3}</span></div>`;
      card.querySelector('.wnum').textContent = `World ${wi + 1} · Levels ${first}-${first + w.levels.length - 1}`;
      card.querySelector('h3').textContent = w.name;
      card.querySelector('p').textContent = open ? w.desc : `Beat level ${first - 1} to unlock`;
      const pics = card.querySelector('.pics');
      for (const [k, c, hp] of WORLD_PICS[wi]) pics.appendChild(Render.brickIcon(k, c, hp, 34));
      card.addEventListener('click', () => {
        Sfx.unlock();
        if (!open) { Sfx.play('ballOut'); return; }
        Sfx.play('click');
        G.worldIdx = wi;
        showScreen('levels');
      });
      list.appendChild(card);
    });
    $('total-stars').innerHTML = `${STAR_SVG}<span>${totalStars()}</span>`;
  }

  function buildLevels() {
    const w = WORLDS[G.worldIdx];
    $('levels-title').textContent = w.name;
    $('world-stars').innerHTML = `${STAR_SVG}<span>${starsOf(w.levels)}/${w.levels.length * 3}</span>`;
    const grid = $('level-grid');
    grid.innerHTML = '';
    const next = w.levels.find(l => unlocked(l.n) && !levelSave(l).stars);
    for (const l of w.levels) {
      const btn = document.createElement('button');
      const open = unlocked(l.n);
      btn.className = 'level-btn' + (open ? '' : ' locked') + (open && l.boss ? ' boss' : '') + (l === next ? ' next' : '');
      if (open) {
        const st = levelSave(l).stars;
        btn.innerHTML = `${l.boss ? '<span class="boss-tag">BOSS</span>' : ''}<span>${l.n}</span><div class="lstars">${[0, 1, 2].map(i => STAR_SVG.replace('<svg', `<svg class="${i < st ? 'on' : ''}"`)).join('')}</div>`;
        btn.addEventListener('click', () => { Sfx.unlock(); Sfx.play('click'); goFullscreen(); startLevel(l.n); });
      } else {
        btn.innerHTML = LOCK_SVG;
      }
      btn.setAttribute('aria-label', 'Level ' + l.n + (open ? '' : ' (locked)'));
      grid.appendChild(btn);
    }
  }

  function buildStyles() {
    const have = totalStars();
    $('style-stars').innerHTML = `${STAR_SVG}<span>${have}</span>`;
    const grid = $('style-grid');
    grid.innerHTML = '';
    Render.SKINS.forEach((sk, i) => {
      const card = document.createElement('button');
      const open = have >= sk.stars || unlockAll;
      card.className = 'style-card' + (open ? '' : ' locked') + (save.skin === i ? ' on' : '');
      card.appendChild(Render.skinPreview(i, 140));
      const name = document.createElement('div');
      name.textContent = sk.name;
      card.appendChild(name);
      if (!open) {
        const need = document.createElement('div');
        need.className = 'need';
        need.innerHTML = `${STAR_SVG}<span>${sk.stars}</span>`;
        card.appendChild(need);
      }
      card.addEventListener('click', () => {
        Sfx.unlock();
        if (!open) { Sfx.play('ballOut'); return; }
        Sfx.play('click');
        save.skin = i;
        persist();
        renderer.setSkin(i);
        buildStyles();
      });
      grid.appendChild(card);
    });
  }

  function showResult(won) {
    const sim = G.sim, level = G.level;
    const prev = levelSave(level);
    const before = totalStars();
    const stars = won ? sim.stars : 0;
    const newBest = won && sim.score > prev.score;
    if (won) {
      save.levels[level.id] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, sim.score) };
      persist();
    }
    const after = totalStars();
    const title = $('r-title');
    title.textContent = won ? (level.boss ? 'Boss Defeated!' : 'Level Cleared!') : sim.failReason === 'wall' ? 'Crushed!' : 'Out of Balls';
    title.classList.toggle('fail', !won);
    $('r-score').textContent = sim.score.toLocaleString();
    $('r-new').classList.toggle('hidden', !newBest);
    const lines = $('r-lines');
    lines.innerHTML = '';
    const line = (a, b) => { for (const t of [a, b]) { const s = document.createElement('span'); s.textContent = t; lines.appendChild(s); } };
    if (won && sim.bonus) {
      line(`Balls left × ${sim.lives}`, '+' + sim.bonus.lives.toLocaleString());
      if (sim.bonus.perfect) line('Perfect', '+' + sim.bonus.perfect.toLocaleString());
      if (sim.bonus.time) line('Speed bonus', '+' + sim.bonus.time.toLocaleString());
      if (sim.comboBest >= 8) line('Best combo', '×' + sim.comboBest);
    }
    let sub;
    if (won) {
      sub = stars === 3 ? 'Perfect! No balls lost.' : stars === 2 ? 'Lost 1 ball. Lose none for 3 stars.' : 'Lose at most 1 ball for 2 stars.';
      if (level.n === LEVELS.length) sub = 'You beat Brick Blitz! Can you get 3 stars everywhere?';
      else if (level.boss) sub = `${WORLDS[level.world + 1].name} unlocked!`;
      const skin = Render.SKINS.find(sk => sk.stars > before && sk.stars <= after);
      if (skin) sub += ` New style unlocked: ${skin.name}!`;
    } else if (sim.failReason === 'wall') sub = 'The wall reached the red line. Clear the lowest rows first!';
    else if (sim.boss) sub = `The boss had ${Math.ceil(100 * sim.boss.hp / sim.boss.maxHp)}% health left. Try again!`;
    else sub = sim.remaining === 1 ? 'Just 1 brick left. So close!' : `${sim.remaining} bricks left. Try again!`;
    $('r-sub').textContent = sub;
    const starEls = $('r-stars').querySelectorAll('.star');
    starEls.forEach(s => s.classList.remove('on'));
    for (let i = 0; i < stars; i++) setTimeout(() => { starEls[i].classList.add('on'); Sfx.play('star', { i }); }, 350 + i * 380);
    $('r-next').classList.toggle('hidden', !(level.n < LEVELS.length && unlocked(level.n + 1)));
    Sfx.play(won ? 'win' : 'lose');
    showScreen('result');
  }

  function pause(on) {
    if (G.screen !== 'play' && G.screen !== 'pause') return;
    if (G.ending) return;
    G.paused = on;
    drag = null;
    showScreen(on ? 'pause' : 'play');
    if (!on && G.sim && G.sim.state === 'serve') $('hint').classList.remove('hidden');
  }

  // ---------------- input ----------------
  // Touch: the paddle follows the finger's movement from wherever it lands, and lifting
  // the finger launches a ball sitting on the paddle. Mouse: the paddle follows the pointer.
  let drag = null;
  const keys = {};

  function playing() { return G.screen === 'play' && !G.paused && G.sim && !G.demo && !G.ending; }

  canvas.addEventListener('pointerdown', (e) => {
    Sfx.unlock();
    if (!playing()) return;
    if (e.pointerType === 'mouse') {
      G.sim.input.x = renderer.toWorld(e.clientX, e.clientY).x;
      G.sim.input.launch = true;
      return;
    }
    if (drag) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
    drag = { id: e.pointerId, x: e.clientX, padX: G.sim.paddle.x };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!playing()) return;
    if (e.pointerType === 'mouse') { G.sim.input.x = renderer.toWorld(e.clientX, e.clientY).x; return; }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = (e.clientX - drag.x) / renderer.s;
    const half = G.sim.paddle.w / 2;
    let x = drag.padX + dx;
    // Past a wall, re-anchor so moving back responds at once.
    if (x < half) { drag.padX = half - dx; x = half; }
    if (x > FW - half) { drag.padX = FW - half - dx; x = FW - half; }
    G.sim.input.x = x;
  });

  function endDrag(e) {
    if (!drag || drag.id !== e.pointerId) return;
    drag = null;
    if (playing() && G.sim.balls.some(b => b.stuck != null)) G.sim.input.launch = true;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', (e) => { if (drag && drag.id === e.pointerId) drag = null; });

  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (G.screen === 'play' && (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w')) { if (playing()) G.sim.input.launch = true; e.preventDefault(); }
    if (e.key === 'Escape' || e.key === 'p') { if (G.screen === 'play') pause(true); else if (G.screen === 'pause') pause(false); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  function keyboard(dt) {
    if (!playing()) return;
    const dir = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
    if (dir) G.sim.input.x = G.sim.paddle.x + dir * 17 * dt;
  }

  // ---------------- main loop ----------------
  // Full sharpness on high-density phones, stepping down if frames take too long.
  let dprCap = 3, slowFrames = 0, timedFrames = 0;
  function watchFrameRate(interval) {
    if (G.screen !== 'play' || G.paused || interval > 0.25) return;
    timedFrames++;
    if (interval > 1 / 40) slowFrames++;
    if (timedFrames >= 120) {
      if (slowFrames > 60 && dprCap > 1.5) { dprCap = dprCap > 2 ? 2 : 1.5; resize(); }
      slowFrames = 0;
      timedFrames = 0;
    }
  }

  let last = performance.now();
  function frame(now) {
    watchFrameRate((now - last) / 1000);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!G.paused) {
      G.time += dt;
      let target = 1;
      if (G.slow && G.slow.t > 0) { G.slow.t -= dt; target = G.slow.scale; }
      G.timeScale += (target - G.timeScale) * Math.min(1, dt * (target < G.timeScale ? 14 : 3));
      const sdt = dt * G.timeScale;
      keyboard(dt);
      const sim = G.sim;
      if (sim) {
        G.acc += sdt;
        let n = 0;
        while (G.acc >= STEP && n < 8) {
          if (G.bot) G.bot.think();
          sim.step();
          G.acc -= STEP;
          n++;
        }
        if (n === 8) G.acc = 0;
        G.shownScore += (sim.score - G.shownScore) * Math.min(1, dt * 8);
        if (Math.abs(sim.score - G.shownScore) < 1) G.shownScore = sim.score;
        if (G.demo && (sim.state === 'won' || sim.state === 'failed' || sim.playTime > 150)) {
          G.demoEnd = (G.demoEnd || 0) + dt;
          if (G.demoEnd > 2) { G.demoEnd = 0; startDemo(); }
        }
      }
      G.intro = Math.min(1, G.intro + dt / 1.1);
      G.paddleSquash = Math.max(0, G.paddleSquash - dt * 7);
      G.comboPulse = Math.max(0, G.comboPulse - dt * 4);
      fx.update(sdt);
      updateEnding(dt);
      if (G.tipTimer > 0) {
        G.tipTimer -= dt;
        if (G.tipTimer <= 0) $('tip').classList.add('hidden');
      }
    }
    renderer.draw({
      sim: G.sim, theme: G.theme, time: G.time, fx, intro: G.intro, demo: G.demo,
      shownScore: G.shownScore, paddleSquash: G.paddleSquash, comboPulse: G.comboPulse,
    });
    requestAnimationFrame(frame);
  }

  // ---------------- buttons ----------------
  function bind(id, fn) {
    $(id).addEventListener('click', (e) => { e.stopPropagation(); Sfx.unlock(); Sfx.play('click'); fn(); });
  }

  bind('btn-play', () => {
    goFullscreen();
    const n = highestUnlocked();
    G.worldIdx = LEVELS[n - 1].world;
    showScreen('worlds');
  });
  bind('btn-styles', () => showScreen('styles'));
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { Sfx.play('click'); showScreen(b.dataset.back); }));
  bind('btn-pause', () => pause(true));
  bind('p-resume', () => pause(false));
  bind('p-restart', () => startLevel(G.level.n));
  bind('p-levels', () => { G.paused = false; G.worldIdx = G.level.world; G.demo = false; showScreen('levels'); });
  bind('r-retry', () => startLevel(G.level.n));
  bind('r-levels', () => { G.worldIdx = G.level.world; showScreen('levels'); });
  bind('r-next', () => startLevel(G.level.n + 1));

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
    if (standalone || document.fullscreenElement || !document.documentElement.requestFullscreen || !matchMedia('(pointer: coarse)').matches) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait'))
      .catch(() => {});
  }

  // ---------------- layout ----------------
  function resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const safeTop = $('safe-probe').getBoundingClientRect().height || 0;
    renderer.resize(W, H, Math.min(dprCap, window.devicePixelRatio || 1), safeTop);
    const btn = $('btn-pause');
    btn.style.left = Math.max(8, renderer.ox + 4) + 'px';
    btn.style.top = (safeTop + 12) + 'px';
    const sideways = matchMedia('(pointer: coarse)').matches && W > H * 1.1 && H < 600;
    $('rotate').classList.toggle('hidden', !sideways);
    if (sideways && G.screen === 'play') pause(true);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (G.screen === 'play') pause(true); Sfx.pauseAll(true); } else Sfx.pauseAll(false);
  });
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
  // Bricks with text on them are drawn once the font is ready.
  if (document.fonts && document.fonts.load) document.fonts.load('20px LilitaOne').then(() => renderer.sprites.clear()).catch(() => {});

  resize();
  const jump = +params.get('level');
  if (jump >= 1 && jump <= LEVELS.length) startLevel(jump);
  else showScreen('title');
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !params.has('nosw')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
