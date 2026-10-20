/*
 * Keyboard, multi-touch, gamepad and shake-to-nudge. Every event is handed to
 * the game with its real timestamp so it lands on the right physics tick.
 */
(function (NN) {
  'use strict';

  const KEYS = {
    KeyZ: 'L', ShiftLeft: 'L', ArrowLeft: 'L',
    Slash: 'R', ShiftRight: 'R', ArrowRight: 'R', NumpadDivide: 'R',
    Space: 'P', ArrowDown: 'P', Enter: 'P', NumpadEnter: 'P',
    KeyX: 'NL', Period: 'NR', ArrowUp: 'NU',
  };

  function Input(app) {
    this.app = app;
    this.keys = {};
    this.pointers = new Map();
    this.cornerTaps = [];
    this.pad = { prev: [] };
    this.lastMotion = 0;
    this.motionOn = false;
    this.bind();
  }

  Input.prototype.bind = function () {
    const cv = this.app.canvas;
    window.addEventListener('keydown', (e) => this.onKey(e, true), { passive: false });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { passive: false });
    cv.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    cv.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    cv.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    cv.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
    cv.addEventListener('lostpointercapture', (e) => this.onPointerUp(e), { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    // block scrolling, pinch zoom and double-tap zoom everywhere except scrollable panels
    document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('.panel, #tuning')) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
    // Safari only lets sound start inside certain gestures, so try on all of them
    const unlock = () => NN.Audio.unlock();
    for (const ev of ['touchend', 'click', 'pointerup']) document.addEventListener(ev, unlock, { passive: true, capture: true });
  };

  Input.prototype.releaseAll = function () {
    const g = this.app.game;
    for (const side of ['L', 'R']) if (g.buttons[side]) g.queueInput({ type: 'flip', side: side, down: false }, performance.now());
    if (g.buttons.plunger) g.queueInput({ type: 'plunger', down: false }, performance.now());
    this.keys = {};
    this.pointers.clear();
  };

  Input.prototype.onKey = function (e, down) {
    const app = this.app;
    const code = e.code;
    const act = KEYS[code];
    if (act || code === 'Space' || code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    NN.Audio.unlock();
    // menus and dialogs get the keys first
    if (app.ui.captures()) {
      if (down) app.ui.key(code, e);
      return;
    }
    if (down && (code === 'KeyP' || code === 'Escape')) { app.togglePause(); return; }
    if (down && code === 'KeyM') { app.toggleMute(); return; }
    if (down && code === 'Backquote') { app.ui.toggleTuning(); return; }
    if (!act) return;
    const g = app.game;
    const ms = e.timeStamp || performance.now();
    if (g.state !== 'playing' && g.state !== 'bonus') {
      if (down) app.anyStart();
      return;
    }
    if (act === 'L' || act === 'R') {
      this.keys[code] = down;
      // either key for a side keeps it held
      const held = Object.keys(this.keys).some((k) => this.keys[k] && KEYS[k] === act);
      g.queueInput({ type: 'flip', side: act, down: held }, ms);
    } else if (act === 'P') {
      this.keys[code] = down;
      const held = Object.keys(this.keys).some((k) => this.keys[k] && KEYS[k] === 'P');
      g.queueInput({ type: 'plunger', down: held }, ms);
    } else if (down) {
      g.queueInput({ type: 'nudge', dir: act === 'NL' ? 'L' : act === 'NR' ? 'R' : 'U' }, ms);
    }
  };

  // ------------------------------------------------------------- touch ---
  Input.prototype.onPointerDown = function (e) {
    e.preventDefault();
    const app = this.app;
    NN.Audio.unlock();
    app.renderer.isTouch = app.renderer.isTouch || e.pointerType === 'touch';
    if (app.ui.captures()) return;
    try { app.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const x = e.clientX, y = e.clientY;
    // five quick taps in the top-left corner open the tuning panel
    if (x < 70 && y < 70 + (app.renderer.sa.t || 0)) {
      const now = performance.now();
      this.cornerTaps = this.cornerTaps.filter((t) => now - t < 2000);
      this.cornerTaps.push(now);
      if (this.cornerTaps.length >= 5) { this.cornerTaps = []; app.ui.toggleTuning(); return; }
    }
    const g = app.game;
    if (app.practice && app.practice.active) { app.practice.drop(x, y); return; }
    if (g.state !== 'playing' && g.state !== 'bonus') { app.anyStart(); return; }
    const W = app.renderer.cssW, H = app.renderer.cssH;
    const ms = e.timeStamp || performance.now();
    // plunger zone: the shooter lane strip in the lower part of the screen
    const lane = app.renderer.toScreen(466, 0)[0] / app.renderer.dpr;
    const inPlungerZone = x > lane - 16 && y > H * 0.42 && (g.shooterBall() || g.world.plunger.pull > 0);
    const p = { id: e.pointerId, x0: x, y0: y, t0: performance.now(), nudged: false };
    if (inPlungerZone) {
      p.kind = 'plunger';
      p.range = Math.max(60, Math.min(160, H * 0.16));
    } else {
      p.kind = 'flip';
      p.side = x < W / 2 ? 'L' : 'R';
      this.setFlip(p.side, true, ms, p.id);
    }
    this.pointers.set(e.pointerId, p);
  };

  Input.prototype.setFlip = function (side, down, ms) {
    const g = this.app.game;
    // a side stays up while any finger holds it
    let held = down;
    if (!down) for (const q of this.pointers.values()) if (q.kind === 'flip' && q.side === side && !q.ending) held = true;
    g.queueInput({ type: 'flip', side: side, down: held }, ms);
  };

  Input.prototype.onPointerMove = function (e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const g = this.app.game;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
    if (p.kind === 'plunger') {
      const frac = Math.max(0, Math.min(1, dy / p.range));
      if (frac > 0.02) p.dragged = true;
      g.queueInput({ type: 'plungerSet', frac: frac }, e.timeStamp || performance.now());
    } else if (!p.nudged) {
      // quick upward swipe = nudge
      const dt = performance.now() - p.t0;
      if (dt < 260 && dy < -45) {
        p.nudged = true;
        const dir = Math.abs(dx) > Math.abs(dy) * 0.7 ? (dx < 0 ? 'L' : 'R') : 'U';
        g.queueInput({ type: 'nudge', dir: dir }, e.timeStamp || performance.now());
      }
    }
  };

  Input.prototype.onPointerUp = function (e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const ms = e.timeStamp || performance.now();
    const g = this.app.game;
    if (p.kind === 'plunger') {
      if (p.dragged) g.queueInput({ type: 'plungerGo' }, ms);
      else g.queueInput({ type: 'plungerTap', power: 0.72 }, ms);
      this.pointers.delete(e.pointerId);
    } else {
      p.ending = true;
      this.pointers.delete(e.pointerId);
      this.setFlip(p.side, false, ms);
    }
  };

  // ----------------------------------------------------------- gamepad ---
  Input.prototype.pollGamepad = function () {
    if (!navigator.getGamepads) return;
    let gp = null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const app = this.app, g = app.game;
    const b = gp.buttons.map((x) => x && (x.pressed || x.value > 0.5));
    const prev = this.pad.prev;
    const edge = (i) => b[i] && !prev[i];
    const rel = (i) => !b[i] && prev[i];
    const ms = performance.now();
    if (b.some((v) => v)) NN.Audio.unlock();
    if (app.ui.captures()) {
      if (edge(12) || (gp.axes[1] < -0.6 && !this.pad.up)) app.ui.key('ArrowUp');
      if (edge(13) || (gp.axes[1] > 0.6 && !this.pad.down)) app.ui.key('ArrowDown');
      if (edge(14) || edge(4) || edge(6)) app.ui.key('ArrowLeft');
      if (edge(15) || edge(5) || edge(7)) app.ui.key('ArrowRight');
      if (edge(0)) app.ui.key('Enter');
      if (edge(1)) app.ui.key('Escape');
      if (edge(9)) app.ui.key('Escape');
    } else if (g.state === 'playing' || g.state === 'bonus') {
      const L = b[4] || b[6], R = b[5] || b[7];
      const pL = prev[4] || prev[6], pR = prev[5] || prev[7];
      if (L !== pL) g.queueInput({ type: 'flip', side: 'L', down: L }, ms);
      if (R !== pR) g.queueInput({ type: 'flip', side: 'R', down: R }, ms);
      if (edge(0) || rel(0)) g.queueInput({ type: 'plunger', down: !!b[0] }, ms);
      if (edge(2)) g.queueInput({ type: 'nudge', dir: 'L' }, ms);
      if (edge(1)) g.queueInput({ type: 'nudge', dir: 'R' }, ms);
      if (edge(3)) g.queueInput({ type: 'nudge', dir: 'U' }, ms);
      if (edge(9)) app.togglePause();
    } else if (edge(0) || edge(9) || edge(4) || edge(5)) {
      app.anyStart();
    }
    this.pad.up = gp.axes[1] < -0.6; this.pad.down = gp.axes[1] > 0.6;
    this.pad.prev = b;
  };

  // ------------------------------------------------------ shake to nudge ---
  Input.prototype.enableMotion = function (on) {
    const self = this;
    if (on && !this.motionHandler) {
      const start = () => {
        this.motionHandler = (e) => {
          const a = e.acceleration || e.accelerationIncludingGravity;
          if (!a) return;
          const now = performance.now();
          const mag = Math.hypot(a.x || 0, a.y || 0);
          const base = e.acceleration ? 0 : 9.8;
          if (Math.abs(mag - base) > 14 && now - self.lastMotion > 450) {
            self.lastMotion = now;
            const g = self.app.game;
            if (g.state === 'playing') g.queueInput({ type: 'nudge', dir: Math.abs(a.x || 0) > Math.abs(a.y || 0) ? ((a.x || 0) > 0 ? 'R' : 'L') : 'U' }, now);
          }
        };
        window.addEventListener('devicemotion', this.motionHandler);
      };
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then((r) => { if (r === 'granted') start(); }).catch(() => {});
      } else start();
    } else if (!on && this.motionHandler) {
      window.removeEventListener('devicemotion', this.motionHandler);
      this.motionHandler = null;
    }
  };

  NN.Input = Input;
})(globalThis.NN || (globalThis.NN = {}));
