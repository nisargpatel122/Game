/*
 * App entry point: boots everything, runs the frame loop, routes game events
 * to sound / effects / vibration, and handles pausing, high scores, stats,
 * achievements, wake lock and the installable (PWA) extras.
 */
(function (NN) {
  'use strict';

  const app = {};
  NN.app = app;

  const shortPts = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
    if (n >= 1000) return Math.round(n / 1000) + 'K';
    return String(n);
  };

  app.isTouch = function () {
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || app.renderer && app.renderer.isTouch;
  };

  app.boot = function () {
    app.canvas = document.getElementById('game');
    app.settings = NN.loadSettings();
    app.tuning = NN.loadTuning();
    app.lastInitials = NN.Store.get('initials', 'AAA');
    app.game = new NN.Game({ tuning: app.tuning, seed: (Date.now() % 100000) + 1 });
    app.game.rules.highScores = NN.loadScores(app.settings.difficulty);
    app.game.lastScore = NN.Store.get('lastScore', 0);
    app.fx = new NN.FX();
    app.renderer = new NN.Renderer(app.canvas, app.game, app.fx);
    app.renderer.isTouch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    app.practice = { active: false, drop: app.practiceDrop };
    app.ui = new NN.UI(app);
    app.input = new NN.Input(app);
    app.achievements = NN.loadAchievements();
    app.applySettings();
    app.game.startAttract();
    app.ui.open('title');
    app.last = performance.now();
    app.qualityT = 0; app.slowFrames = 0; app.frames = 0;
    app.achT = 0;
    let rz = null;
    const onResize = () => { clearTimeout(rz); rz = setTimeout(() => app.renderer.resize(), 120); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', app.onVisibility);
    const unlock = () => { NN.Audio.unlock(); app.applySettings(); if (!app.game.paused && app.game.state !== 'playing') NN.Music.setState(app.settings.music > 0 ? 'select' : 'off'); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    app.installPWA();
    requestAnimationFrame(app.loop);
  };

  app.loop = function (ts) {
    requestAnimationFrame(app.loop);
    let dt = (ts - app.last) / 1000;
    app.last = ts;
    if (dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;
    const g = app.game;
    try {
      app.input.pollGamepad();
      if (!g.paused) g.frame(ts); else g.lastFrameMs = ts;
      app.processFx();
      app.fx.update(g.paused ? 0 : dt * (g.timeScale < 1 ? 0.6 : 1));
      app.updateAudio();
      app.renderer.draw(g.paused ? 0 : dt);
    } catch (err) {
      if (!app.errShown) { app.errShown = true; console.error(err); }
    }
    // achievements, checked twice a second while playing
    app.achT += dt;
    if (app.achT > 0.5 && g.state === 'playing' && !g.rules.demo) {
      app.achT = 0;
      const life = Object.assign({}, NN.loadStats());
      app.unlock(NN.checkAchievements(app.achievements, g.rules.gstats, g.rules.score, life));
    }
    app.adaptQuality(dt);
  };

  // drop resolution if the device cannot keep up (never goes back up mid-session)
  app.adaptQuality = function (dt) {
    const g = app.game;
    if (g.paused || app.ui.captures() && g.state !== 'attract') return;
    app.frames++;
    app.qualityT += dt;
    if (dt > 1 / 45) app.slowFrames++;
    if (app.qualityT >= 2.5) {
      if (app.frames > 60 && app.slowFrames / app.frames > 0.25 && app.renderer.quality > 0.6) {
        app.renderer.quality = Math.max(0.6, app.renderer.quality - 0.15);
        app.renderer.resize();
      }
      app.qualityT = 0; app.slowFrames = 0; app.frames = 0;
    }
  };

  app.updateAudio = function () {
    const g = app.game;
    if (!NN.Audio.ready) return;
    let sp = 0, rs = 0;
    if (!g.paused && g.state === 'playing') {
      for (const b of g.world.balls) {
        if (b.state === 'play' && b.layer === 0 && b.x < 464) sp = Math.max(sp, Math.hypot(b.vx, b.vy));
        if (b.state === 'wire' || (b.state === 'play' && b.layer > 0)) rs = Math.max(rs, Math.hypot(b.vx, b.vy));
      }
    }
    NN.Audio.updateRolling(sp, rs);
  };

  app.processFx = function () {
    const g = app.game, fx = app.fx, A = NN.Audio;
    const quietAttract = g.state === 'attract' || g.rules.demo;
    const col = NN.COLORS;
    for (const e of g.fxq) {
      switch (e.type) {
        case 'sound':
          if (!quietAttract) A.play(e.id, e);
          break;
        case 'points':
          if (e.x != null) fx.text(e.x, e.y, (e.big ? NN.U.formatScore(e.pts) : shortPts(e.pts)), e.big);
          break;
        case 'flash': {
          fx.hit(e.id);
          const id = e.id || '';
          if (/^bumper/.test(id)) { fx.sparks(e.x, e.y, col.magenta, 10, 260); fx.ring(e.x, e.y, col.magenta, 24, 46, 0.3); }
          else if (/^sling/.test(id)) { fx.slings[id] = 1; fx.sparks(e.x, e.y, col.orange, 7, 220); }
          else if (/^planet/.test(id)) fx.sparks(e.x, e.y, col.lime, 8, 200);
          else if (/^drop/.test(id)) fx.sparks(e.x, e.y, col.amber, 9, 220);
          else if (/^lane/.test(id)) fx.sparks(e.x, e.y, col.cyan, 6, 140);
          else if (id === 'kickback') fx.burst(e.x, e.y - 20, [col.lime, '#ffffff'], 24, 380);
          else if (id === 'scoop') fx.ring(e.x, e.y, col.violet, 10, 70, 0.6);
          else if (id === 'post') fx.sparks(e.x, e.y, '#ffffff', 3, 120);
          break;
        }
        case 'shake':
          fx.shake(e.amt * 0.55);
          break;
        case 'lampshow':
          fx.lampShow(e.id, e.dur, e.color);
          if (!quietAttract) {
            if (e.id === 'flashAll') { fx.flashScreen('#ff2b4f', 0.5); fx.burst(237, 520, [col.red, col.amber, '#ffffff'], 40, 520); }
            else if (e.id === 'rainbow') { fx.flashScreen('#ffffff', 0.7); fx.burst(237, 480, [col.magenta, col.cyan, col.amber, col.lime], 90, 700); }
            else if (e.id === 'strobe') { fx.flashScreen(col.cyan, 0.6); fx.burst(237, 600, [col.cyan, col.magenta], 60, 600); }
            else if (e.id === 'supernova') { fx.flashScreen('#ffffff', 1); fx.burst(237, 662, ['#ffffff', col.amber, col.magenta, col.cyan], 160, 900); }
            else if (e.id === 'radial') fx.flashScreen(e.color || col.cyan, 0.35);
          }
          break;
        case 'music':
          if (!quietAttract) NN.Music.setState(app.settings.music > 0 ? e.state : 'off');
          break;
        case 'vibrate':
          if (app.settings.vibration && !quietAttract && navigator.vibrate) { try { navigator.vibrate(e.ms); } catch (err) { /* unsupported */ } }
          break;
        case 'gameover':
          g.lastScore = e.score;
          if (!e.demo) app.onGameOver(e);
          break;
        case 'gamestart':
          A.play('gamestart');
          break;
        case 'bonusStart':
          break;
        case 'debug':
          console.warn(e.msg);
          break;
      }
    }
    g.fxq.length = 0;
  };

  // ------------------------------------------------------------ flow ---
  app.startGame = function () {
    const g = app.game;
    app.ui.close();
    g.paused = false;
    g.rules.highScores = NN.loadScores(app.settings.difficulty);
    app.input.releaseAll();
    g.startGame(app.settings.difficulty, (Date.now() % 1e9) | 0);
    document.getElementById('pauseBtn').classList.add('show');
    app.renderer.touchHintUntil = app.fx.t + (app.hintsShown ? 0 : 7);
    app.hintsShown = true;
    NN.Music.setState(app.settings.music > 0 ? 'normal' : 'off');
    app.requestWakeLock();
    app.goFullscreen();
    app.canvas.focus();
  };

  // phones playing in a browser tab get the whole screen (installed apps and
  // desktops are left alone; iPhones do not support this and skip it)
  app.goFullscreen = function () {
    const d = document, el = d.documentElement;
    if (!app.isTouch() || !d.fullscreenEnabled || d.fullscreenElement || !el.requestFullscreen) return;
    if (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return;
    try { const p = el.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (err) { /* not allowed */ }
  };

  app.togglePause = function () {
    const g = app.game;
    if (g.state !== 'playing' && g.state !== 'bonus') return;
    if (g.paused) app.resume();
    else app.pause();
  };

  app.pause = function () {
    const g = app.game;
    if (g.paused || (g.state !== 'playing' && g.state !== 'bonus')) return;
    g.paused = true;
    app.musicBefore = NN.Music.want;
    NN.Music.setState('off');
    NN.Audio.updateRolling(0, 0);
    app.input.releaseAll();
    app.ui.open('pause');
  };

  app.resume = function () {
    const g = app.game;
    app.ui.close();
    app.input.releaseAll();
    g.paused = false;
    g.lastFrameMs = performance.now();
    if (app.musicBefore && app.settings.music > 0) NN.Music.setState(app.musicBefore);
    app.requestWakeLock();
    app.canvas.focus();
  };

  app.toTitle = function () {
    const g = app.game;
    g.paused = false;
    app.ui.close();
    g.startAttract();
    document.getElementById('pauseBtn').classList.remove('show');
    NN.Music.setState(app.settings.music > 0 ? 'select' : 'off');
    app.ui.open('title');
    app.releaseWakeLock();
  };

  app.anyStart = function () {
    if (app.ui.screen === 'gameover' && !app.gameOverReady()) return;
    if (!app.ui.captures()) app.startGame();
  };

  app.gameOverReady = function () { return performance.now() - (app.gameOverAt || 0) > 1200; };

  app.onGameOver = function (e) {
    app.gameOverAt = performance.now();
    document.getElementById('pauseBtn').classList.remove('show');
    NN.Store.set('lastScore', e.score);
    // lifetime stats
    const st = NN.loadStats(), g = e.stats;
    st.games++; st.totalScore += e.score; st.bestScore = Math.max(st.bestScore, e.score);
    st.playTime += g.time; st.ramps += g.ramps; st.orbits += g.orbits; st.jackpots += g.jackpots;
    st.superJackpots += g.superJackpots; st.missions += g.missions; st.multiballs += g.multiballs;
    st.supernovas += g.supernovas; st.extraBalls += g.extraBalls; st.maxCombo = Math.max(st.maxCombo, g.maxCombo);
    st.skillShots += g.skillShots; st.tilts += g.tilts; st.bumpers += g.bumpers; st.spins += g.spins;
    NN.saveStats(st);
    app.unlock(NN.checkAchievements(app.achievements, g, e.score, st));
    // high score table
    const list = NN.loadScores(e.difficulty);
    let rank = null;
    if (e.score > 0 && (list.length < 10 || e.score > list[list.length - 1].score)) {
      rank = list.filter((r) => r.score >= e.score).length;
    }
    app.pending = { score: e.score, difficulty: e.difficulty };
    NN.Audio.play('gameover');
    NN.Music.setState('off');
    app.releaseWakeLock();
    setTimeout(() => app.ui.showGameOver({ score: e.score, stats: g, rank: rank }), 700);
  };

  app.saveHighScore = function (name) {
    const p = app.pending;
    if (!p) return;
    const list = NN.loadScores(p.difficulty).map((r) => Object.assign({}, r, { mine: false }));
    list.push({ name: name, score: p.score, date: Date.now(), mine: true });
    list.sort((a, b) => b.score - a.score);
    NN.saveScores(p.difficulty, list.slice(0, 10));
    app.lastInitials = name;
    NN.Store.set('initials', name);
    app.game.rules.highScores = NN.loadScores(app.settings.difficulty);
  };

  app.unlock = function (fresh) {
    if (!fresh || !fresh.length) return;
    NN.saveAchievements(app.achievements);
    for (const a of fresh) {
      app.ui.toast('<b>ACHIEVEMENT</b><br>' + a.name + ' · ' + a.desc, true, 'achievement');
    }
  };

  app.toggleMute = function () {
    const m = NN.Audio.toggleMute();
    app.ui.toast(m ? 'Sound off (M)' : 'Sound on (M)');
  };

  app.applySettings = function () {
    const s = app.settings;
    NN.Audio.setVolume(s.sound);
    NN.Audio.setMusicVolume(s.music);
    NN.Music.setEnabled(s.music > 0);
    app.fx.shakeEnabled = !!s.shake;
    if (app.input) app.input.enableMotion(!!s.motionNudge && app.isTouch());
  };
  app.saveSettings = function () { NN.saveSettings(app.settings); };

  app.applyTuning = function () {
    app.game.applyTuning(app.tuning);
    NN.saveTuning(app.tuning);
  };

  app.togglePractice = function () {
    app.practice.active = !app.practice.active;
  };
  app.practiceDrop = function (cssX, cssY) {
    const w = app.renderer.toWorld(cssX, cssY);
    if (w[0] < 20 || w[0] > 490 || w[1] < 20 || w[1] > 1000) return;
    app.game.world.addBall(w[0], w[1], 0, 0);
  };

  app.onVisibility = function () {
    if (document.hidden) {
      app.pause();
      NN.Audio.suspend();
    } else {
      NN.Audio.resume();
      if (app.game.state === 'playing' && !app.game.paused) app.requestWakeLock();
    }
  };

  // keep the screen on while playing
  app.requestWakeLock = function () {
    try {
      if ('wakeLock' in navigator && !app.wakeLock) {
        navigator.wakeLock.request('screen').then((l) => { app.wakeLock = l; l.addEventListener('release', () => { app.wakeLock = null; }); }).catch(() => {});
      }
    } catch (e) { /* not supported */ }
  };
  app.releaseWakeLock = function () {
    try { if (app.wakeLock) app.wakeLock.release(); } catch (e) { /* ignore */ }
    app.wakeLock = null;
  };

  // Installable app extras only when served over http(s); the double-clicked
  // file:// version makes no requests at all.
  app.installPWA = function () {
    if (!/^https?:$/.test(location.protocol)) return;
    const add = (rel, href) => { const l = document.createElement('link'); l.rel = rel; l.href = href; document.head.appendChild(l); };
    add('manifest', 'manifest.webmanifest');
    add('apple-touch-icon', 'apple-touch-icon.png');
    if ('serviceWorker' in navigator) {
      const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {});
      if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
    }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', app.boot);
    else app.boot();
  }
})(globalThis.NN || (globalThis.NN = {}));
