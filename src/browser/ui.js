/*
 * Menus and overlays: title, how to play, pause, settings, high scores,
 * stats and achievements, game over with initials, tuning panel and toasts.
 * Keyboard / gamepad: arrows move, Enter or Space selects, Esc goes back.
 */
(function (NN) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => NN.U.formatScore(n);

  function UI(app) {
    this.app = app;
    this.ov = $('ov');
    this.screen = null;
    this.stack = [];
    this.sel = 0;
    this.toastQ = [];
    this.toastBusy = false;
    this.tuning = $('tuning');
    this.initials = null;
    this.buildTuning();
    $('pauseBtn').addEventListener('click', (e) => { e.preventDefault(); NN.Audio.unlock(); app.togglePause(); });
  }

  UI.prototype.captures = function () { return !!this.screen; };

  UI.prototype.open = function (name, opts) {
    if (this.screen && this.screen !== name) this.stack.push(this.screen);
    this.render(name, opts);
  };

  UI.prototype.back = function () {
    const prev = this.stack.pop();
    if (prev) this.render(prev);
    else this.close();
  };

  UI.prototype.close = function () {
    this.screen = null;
    this.stack = [];
    this.ov.className = 'overlay';
    this.ov.innerHTML = '';
    this.app.onMenuClosed && this.app.onMenuClosed();
  };

  UI.prototype.render = function (name, opts) {
    this.screen = name;
    this.sel = 0;
    const html = this['scr_' + name](opts || {});
    this.ov.innerHTML = '<div class="panel" role="dialog">' + html + '</div>';
    this.ov.className = 'overlay show' + (name === 'title' || name === 'gameover' ? ' clear' : '') + (name === 'title' ? ' title' : '');
    this.wire();
  };

  UI.prototype.buttons = function () { return Array.from(this.ov.querySelectorAll('[data-act]')); };

  UI.prototype.wire = function () {
    const btns = this.buttons();
    btns.forEach((b, i) => {
      b.addEventListener('click', (e) => { e.preventDefault(); NN.Audio.unlock(); this.sel = i; this.activate(b); });
    });
    this.ov.querySelectorAll('input[type=range]').forEach((r) => {
      r.addEventListener('input', () => this.onSlider(r));
    });
    this.highlight();
  };

  UI.prototype.highlight = function () {
    const btns = this.buttons();
    btns.forEach((b, i) => b.classList.toggle('sel', i === this.sel));
  };

  UI.prototype.key = function (code, e) {
    if (this.screen === 'gameover' && this.initials && !this.initials.done) return this.initialsKey(code, e);
    if (this.screen === 'gameover' && !this.initials && this.app.gameOverReady()) {
      if (code !== 'Escape' && code !== 'Tab') { this.app.startGame(); return; }
    }
    const btns = this.buttons();
    if (code === 'ArrowDown' || code === 'ArrowRight' || code === 'Slash' || code === 'ShiftRight' || code === 'Tab') {
      this.sel = (this.sel + 1) % Math.max(1, btns.length); this.highlight(); NN.Audio.play('menu');
    } else if (code === 'ArrowUp' || code === 'ArrowLeft' || code === 'KeyZ' || code === 'ShiftLeft') {
      this.sel = (this.sel - 1 + btns.length) % Math.max(1, btns.length); this.highlight(); NN.Audio.play('menu');
    } else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
      if (btns[this.sel]) this.activate(btns[this.sel]);
    } else if (code === 'Escape' || code === 'Backspace' || code === 'KeyP') {
      if (this.screen === 'pause') this.app.resume();
      else if (this.screen === 'title') { /* stay */ }
      else this.back();
    }
  };

  UI.prototype.activate = function (b) {
    const act = b.getAttribute('data-act');
    const app = this.app;
    NN.Audio.play('menuSelect');
    switch (act) {
      case 'play': app.startGame(); break;
      case 'howto': this.open('howto'); break;
      case 'scores': this.open('scores'); break;
      case 'stats': this.open('stats'); break;
      case 'settings': this.open('settings'); break;
      case 'back': this.back(); break;
      case 'resume': app.resume(); break;
      case 'restart': app.startGame(); break;
      case 'quit': app.toTitle(); break;
      case 'again': app.startGame(); break;
      case 'menu': app.toTitle(); break;
      case 'diff': {
        const s = app.settings;
        s.difficulty = s.difficulty === 'arcade' ? 'casual' : 'arcade';
        app.saveSettings();
        this.render(this.screen);
        break;
      }
      case 'toggle': {
        const k = b.getAttribute('data-key');
        app.settings[k] = !app.settings[k];
        app.applySettings();
        app.saveSettings();
        b.classList.toggle('on', !!app.settings[k]);
        b.textContent = app.settings[k] ? 'ON' : 'OFF';
        break;
      }
      case 'tab': this.render('scores', { diff: b.getAttribute('data-diff') }); break;
      case 'ini-up': this.initialsStep(+b.getAttribute('data-i'), 1); break;
      case 'ini-down': this.initialsStep(+b.getAttribute('data-i'), -1); break;
      case 'ini-ok': this.initialsConfirmAll(); break;
    }
  };

  UI.prototype.onSlider = function (r) {
    const k = r.getAttribute('data-key');
    this.app.settings[k] = +r.value;
    this.app.applySettings();
    this.app.saveSettings();
  };

  // ------------------------------------------------------------ screens ---
  UI.prototype.scr_title = function () {
    const d = this.app.settings.difficulty;
    return '<div class="logo"><span class="a">NEON</span><span class="b">NEBULA</span><span class="sub">P I N B A L L</span></div>' +
      '<button class="btn primary" data-act="play">PLAY</button>' +
      '<div class="row"><button class="btn" data-act="diff">' + (d === 'arcade' ? 'ARCADE · 3 BALLS' : 'CASUAL · 5 BALLS') + '</button></div>' +
      '<div class="row"><button class="btn" data-act="howto">HOW TO PLAY</button><button class="btn" data-act="scores">HIGH SCORES</button></div>' +
      '<div class="row"><button class="btn" data-act="stats">STATS</button><button class="btn" data-act="settings">SETTINGS</button></div>' +
      '<div class="hint">' + (this.app.isTouch() ? 'Tap left / right side for flippers · drag the plunger down' : 'Z / Shift / ← and / / Shift / → flip · hold Space to launch') + '<br>No ads. Ever. Works offline.</div>';
  };

  UI.prototype.scr_howto = function () {
    const touch = this.app.isTouch();
    const ctrl = touch
      ? '<p>Tap the <b>left</b> or <b>right</b> half of the screen to flip. Both at once works.</p><p>Drag the <b>plunger</b> (bottom right) down and let go to launch. A quick tap launches too.</p><p>Swipe <b>up</b> quickly to nudge the table.</p>'
      : '<p>Flippers: <span class="k">Z</span> <span class="k">L-Shift</span> <span class="k">←</span> and <span class="k">/</span> <span class="k">R-Shift</span> <span class="k">→</span></p><p>Plunger: hold <span class="k">Space</span> or <span class="k">↓</span>, release to launch.</p><p>Nudge: <span class="k">X</span> left, <span class="k">.</span> right, <span class="k">↑</span> forward. <span class="k">P</span> pause, <span class="k">M</span> mute.</p><p>Gamepad: shoulders flip, A launches, X / B / Y nudge.</p>';
    return '<h2>HOW TO PLAY</h2><div class="card">' +
      '<h3>CONTROLS</h3>' + ctrl +
      '<h3>SHOOT THE BLINKING ARROWS</h3><p>Lit arrows show what to shoot next. Each flipper\'s easiest shot is the ramp on its own side.</p>' +
      '<h3>SKILL SHOT</h3><p>One Orion lane at the top is lit. Flippers move it. Plunge into the lit lane for a big bonus. A full plunge round the top, then the left ramp, is a SUPER SKILL SHOT.</p>' +
      '<h3>MISSIONS</h3><p>Shoot the BLACK HOLE when MISSION is lit to start one of six timed missions (flippers choose). Hit all four PLANET targets to relight it. Finish all six for <b>SUPERNOVA</b>.</p>' +
      '<h3>NEBULA MULTIBALL</h3><p>The left ramp lights LOCK. The right ramp locks a ball in the Docking Bay. Lock two to start 3-ball multiball. Ramps score JACKPOTS, then the Black Hole scores the SUPER JACKPOT.</p>' +
      '<h3>MORE</h3><p>Major shots in a row are COMBOS. Clear the ASTEROID drop targets to light the KICKBACK. ORION lanes raise the bonus multiplier. The upper flipper shoots the COMET LANE.</p>' +
      '<p>Nudge to save a ball, but too much is DANGER, then TILT.</p>' +
      '</div><button class="btn" data-act="back">BACK</button>';
  };

  UI.prototype.scr_pause = function () {
    return '<h2>PAUSED</h2>' +
      '<button class="btn primary" data-act="resume">RESUME</button>' +
      '<button class="btn" data-act="restart">RESTART</button>' +
      '<button class="btn" data-act="settings">SETTINGS</button>' +
      '<button class="btn" data-act="howto">HOW TO PLAY</button>' +
      '<button class="btn" data-act="quit">QUIT TO TITLE</button>';
  };

  UI.prototype.scr_settings = function () {
    const s = this.app.settings;
    const tog = (k) => '<button class="toggle' + (s[k] ? ' on' : '') + '" data-act="toggle" data-key="' + k + '">' + (s[k] ? 'ON' : 'OFF') + '</button>';
    const row = (label, ctl) => '<div class="setting"><label>' + label + '</label>' + ctl + '</div>';
    let h = '<h2>SETTINGS</h2>';
    h += row('Sound', '<input type="range" min="0" max="1" step="0.05" value="' + s.sound + '" data-key="sound" aria-label="Sound volume">');
    h += row('Music', '<input type="range" min="0" max="1" step="0.05" value="' + s.music + '" data-key="music" aria-label="Music volume">');
    h += row('Vibration', tog('vibration'));
    h += row('Screen shake', tog('shake'));
    h += row('Difficulty', '<button class="toggle on" data-act="diff">' + (s.difficulty === 'arcade' ? 'ARCADE' : 'CASUAL') + '</button>');
    if (this.app.isTouch()) h += row('Shake phone to nudge', tog('motionNudge'));
    h += '<div class="hint">Casual: 5 balls and longer ball saves. Arcade: 3 balls, standard rules.</div>';
    h += '<button class="btn" data-act="back">BACK</button>';
    return h;
  };

  UI.prototype.scr_scores = function (o) {
    const diff = o.diff || this.app.settings.difficulty;
    const list = NN.loadScores(diff);
    let h = '<h2>HIGH SCORES</h2><div class="tabs">' +
      '<button class="toggle' + (diff === 'arcade' ? ' on' : '') + '" data-act="tab" data-diff="arcade">ARCADE</button>' +
      '<button class="toggle' + (diff === 'casual' ? ' on' : '') + '" data-act="tab" data-diff="casual">CASUAL</button></div>';
    h += '<table class="scores">';
    list.forEach((r, i) => {
      h += '<tr class="' + (r.mine ? 'me' : '') + '"><td class="n">' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td class="s">' + fmt(r.score) + '</td></tr>';
    });
    h += '</table><button class="btn" data-act="back">BACK</button>';
    return h;
  };

  UI.prototype.scr_stats = function () {
    const st = NN.loadStats();
    const have = NN.loadAchievements();
    const mins = Math.round(st.playTime / 60);
    const rows = [
      ['Games played', st.games], ['Best score', fmt(st.bestScore)], ['Average score', fmt(st.games ? st.totalScore / st.games : 0)],
      ['Time played', mins + ' min'], ['Ramps', st.ramps], ['Orbits', st.orbits], ['Missions completed', st.missions],
      ['Multiballs', st.multiballs], ['Jackpots', st.jackpots], ['Super jackpots', st.superJackpots], ['Supernovas', st.supernovas],
      ['Best combo', st.maxCombo + '-way'], ['Extra balls', st.extraBalls],
    ];
    let h = '<h2>STATS</h2><div class="stats">';
    for (const r of rows) h += '<span>' + r[0] + '</span><span>' + r[1] + '</span>';
    const got = NN.ACHIEVEMENTS.filter((a) => have[a.id]).length;
    h += '</div><h2 style="margin-top:18px">ACHIEVEMENTS ' + got + '/' + NN.ACHIEVEMENTS.length + '</h2><div class="ach">';
    for (const a of NN.ACHIEVEMENTS) h += '<div class="' + (have[a.id] ? 'got' : '') + '"><b>' + esc(a.name) + '</b>' + esc(a.desc) + '</div>';
    h += '</div><button class="btn" data-act="back">BACK</button>';
    return h;
  };

  UI.prototype.scr_gameover = function (o) {
    const score = o.score || 0;
    let h = '<h2>GAME OVER</h2><div class="big-score">' + fmt(score) + '</div>';
    if (o.rank != null && this.initials && !this.initials.done) {
      h += '<div class="hint" style="color:#ffb238;font-size:14px">NEW HIGH SCORE · #' + (o.rank + 1) + '</div>';
      h += '<div class="initials">';
      for (let i = 0; i < 3; i++) {
        h += '<div class="slot' + (i === this.initials.i ? ' cur' : '') + '"><button data-act="ini-up" data-i="' + i + '" aria-label="next letter">▲</button>' +
          '<div class="ch">' + this.initials.chars[i] + '</div><button data-act="ini-down" data-i="' + i + '" aria-label="previous letter">▼</button></div>';
      }
      h += '</div><button class="btn primary" data-act="ini-ok">OK</button>';
      h += '<div class="hint">' + (this.app.isTouch() ? 'Tap ▲ ▼ to pick each letter, then OK' : 'Type your initials, or use ← → to change and Space to confirm') + '</div>';
    } else {
      if (o.rank != null) h += '<div class="hint" style="color:#ffb238;font-size:14px">HIGH SCORE #' + (o.rank + 1) + '</div>';
      const g = o.stats || {};
      h += '<div class="stats" style="margin:10px 0">' +
        '<span>Ramps</span><span>' + (g.ramps || 0) + '</span><span>Missions</span><span>' + (g.missions || 0) + '</span>' +
        '<span>Jackpots</span><span>' + (g.jackpots || 0) + '</span><span>Best combo</span><span>' + (g.maxCombo || 0) + '</span></div>';
      h += '<button class="btn primary" data-act="again">PLAY AGAIN</button><button class="btn" data-act="menu">MENU</button>';
      h += '<div class="hint">Press any key or tap to play again</div>';
    }
    return h;
  };

  // ------------------------------------------------------------ initials ---
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
  UI.prototype.startInitials = function (last) {
    this.initials = { chars: (last || 'AAA').split(''), i: 0, done: false };
  };
  UI.prototype.initialsStep = function (i, d) {
    const I = this.initials;
    I.i = i;
    const k = LETTERS.indexOf(I.chars[i]);
    I.chars[i] = LETTERS[(k + d + LETTERS.length) % LETTERS.length];
    NN.Audio.play('menu');
    this.render('gameover', this.goOpts);
  };
  UI.prototype.initialsKey = function (code, e) {
    const I = this.initials;
    if (/^Key[A-Z]$/.test(code) || /^Digit\d$/.test(code)) {
      I.chars[I.i] = code.slice(-1);
      NN.Audio.play('menu');
      if (I.i < 2) I.i++; else return this.initialsConfirmAll();
      this.render('gameover', this.goOpts);
    } else if (code === 'ArrowUp' || code === 'ArrowRight' || code === 'Slash' || code === 'ShiftRight') this.initialsStep(I.i, 1);
    else if (code === 'ArrowDown' || code === 'ArrowLeft' || code === 'KeyZ' || code === 'ShiftLeft') this.initialsStep(I.i, -1);
    else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
      if (I.i < 2) { I.i++; NN.Audio.play('menuSelect'); this.render('gameover', this.goOpts); } else this.initialsConfirmAll();
    } else if (code === 'Backspace' && I.i > 0) { I.i--; this.render('gameover', this.goOpts); }
  };
  UI.prototype.initialsConfirmAll = function () {
    const I = this.initials;
    I.done = true;
    const name = I.chars.join('').trim() || 'ACE';
    this.app.saveHighScore(name);
    this.initials = null;
    NN.Audio.play('achievement');
    this.render('gameover', this.goOpts);
  };

  UI.prototype.showGameOver = function (opts) {
    this.goOpts = opts;
    this.stack = [];
    if (opts.rank != null) this.startInitials(this.app.lastInitials);
    else this.initials = null;
    this.render('gameover', opts);
  };

  // --------------------------------------------------------------- toast ---
  // deferred toasts (achievements) wait for a quiet moment when the only place
  // to show them would be over the playfield
  UI.prototype.toast = function (html, defer, sound) {
    this.toastQ.push({ html: html, defer: !!defer, sound: sound });
    if (!this.toastBusy) this.nextToast();
  };
  UI.prototype.nextToast = function () {
    const el = $('toast');
    const q = this.toastQ[0];
    if (!q) { this.toastBusy = false; return; }
    this.toastBusy = true;
    const g = this.app.game, L = this.app.renderer && this.app.renderer.L;
    if (q.defer && L && !L.panelL && g.state === 'playing' && !g.paused) {
      setTimeout(() => this.nextToast(), 500);
      return;
    }
    this.toastQ.shift();
    const h = q.html;
    if (q.sound) NN.Audio.play(q.sound);
    el.innerHTML = h;
    this.placeToast(el);
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => this.nextToast(), 400); }, 2600);
  };

  // keep toasts off the score display and the playfield where we can: in the
  // left side panel on wide screens, else just under the dot-matrix display
  UI.prototype.placeToast = function (el) {
    const R = this.app.renderer, L = R && R.L;
    if (!L) return;
    if (L.panelL) {
      el.style.left = (L.panelL.x + L.panelL.w / 2) + 'px';
      el.style.top = (L.panelL.y + Math.max(0, Math.min(L.panelL.h - 110, 330))) + 'px';
      el.style.maxWidth = Math.max(200, L.panelL.w) + 'px';
      el.className = '';
    } else {
      el.style.left = '50%';
      el.style.top = (L.dmd.y + L.dmd.h + 8) + 'px';
      el.style.maxWidth = '';
      el.className = 'compact';
    }
  };

  // -------------------------------------------------------------- tuning ---
  UI.prototype.buildTuning = function () {
    const el = this.tuning;
    const tun = this.app.tuning;
    let h = '<h4>TUNING</h4>';
    for (const k in NN.TUNING_SLIDERS) {
      const d = NN.TUNING_SLIDERS[k];
      const v = tun[k] != null ? tun[k] : NN.PHYSICS_DEFAULTS[k];
      h += '<div class="t-row"><span>' + d[3] + '</span><input type="range" min="' + d[0] + '" max="' + d[1] + '" step="' + d[2] + '" value="' + v + '" data-tk="' + k + '"><span class="val" id="tv_' + k + '">' + (+v).toFixed(2) + '</span></div>';
    }
    h += '<button class="btn" id="t_reset">RESET TO DEFAULTS</button>';
    h += '<div class="row"><button class="btn" id="t_debug">DEBUG VIEW</button><button class="btn" id="t_fps">FPS</button></div>';
    h += '<button class="btn" id="t_practice">PRACTICE: DROP A BALL</button>';
    h += '<button class="btn" id="t_close">CLOSE</button>';
    h += '<div class="hint" style="text-align:left">Saved on this device. Practice: tap or click anywhere on the table to drop a ball there.</div>';
    el.innerHTML = h;
    el.querySelectorAll('input[data-tk]').forEach((r) => {
      r.addEventListener('input', () => {
        const k = r.getAttribute('data-tk');
        this.app.tuning[k] = +r.value;
        $('tv_' + k).textContent = (+r.value).toFixed(2);
        this.app.applyTuning();
      });
    });
    $('t_reset').addEventListener('click', () => {
      this.app.tuning = {};
      this.app.applyTuning();
      this.buildTuning();
      this.tuning.classList.add('show');
    });
    $('t_debug').addEventListener('click', () => { this.app.renderer.debug = !this.app.renderer.debug; });
    $('t_fps').addEventListener('click', () => { this.app.renderer.showFps = !this.app.renderer.showFps; });
    $('t_practice').addEventListener('click', () => { this.app.togglePractice(); $('t_practice').textContent = this.app.practice.active ? 'PRACTICE: ON (TAP TABLE)' : 'PRACTICE: DROP A BALL'; });
    $('t_close').addEventListener('click', () => this.toggleTuning());
  };

  UI.prototype.toggleTuning = function () {
    this.tuning.classList.toggle('show');
  };

  NN.UI = UI;
})(globalThis.NN || (globalThis.NN = {}));
