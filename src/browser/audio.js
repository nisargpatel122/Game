/*
 * All sound is synthesized with Web Audio: oscillators, filtered noise and
 * envelopes. Every sound varies its pitch slightly so repeats never grate.
 * A continuous rolling rumble follows the fastest ball.
 */
(function (NN) {
  'use strict';

  const A = {
    ctx: null, master: null, sfx: null, musicBus: null, comp: null,
    volume: 0.8, musicVolume: 0.45, muted: false, white: null, brown: null,
    voices: {}, rumble: null, rattle: null, ready: false,
  };

  A.unlock = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      A.ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) { return; }
    const c = A.ctx;
    A.comp = c.createDynamicsCompressor();
    A.comp.threshold.value = -14; A.comp.knee.value = 10; A.comp.ratio.value = 4;
    A.comp.attack.value = 0.003; A.comp.release.value = 0.18;
    A.master = c.createGain();
    A.master.connect(A.comp); A.comp.connect(c.destination);
    A.sfx = c.createGain(); A.sfx.connect(A.master);
    A.musicBus = c.createGain(); A.musicBus.connect(A.master);
    A.applyVolumes();
    // noise buffers
    const len = c.sampleRate * 2;
    A.white = c.createBuffer(1, len, c.sampleRate);
    const d = A.white.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.brown = c.createBuffer(1, len, c.sampleRate);
    const b = A.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    A.startRumble();
    A.ready = true;
    if (c.state === 'suspended') c.resume().catch(() => {});
  };

  A.applyVolumes = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    A.master.gain.setTargetAtTime(A.muted ? 0 : 1, t, 0.02);
    A.sfx.gain.setTargetAtTime(A.volume * 0.9, t, 0.02);
    A.musicBus.gain.setTargetAtTime(A.musicVolume * 0.55, t, 0.05);
  };

  A.setVolume = function (v) { A.volume = v; A.applyVolumes(); };
  A.setMusicVolume = function (v) { A.musicVolume = v; A.applyVolumes(); };
  A.toggleMute = function () { A.muted = !A.muted; A.applyVolumes(); return A.muted; };
  A.suspend = function () { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend().catch(() => {}); };
  A.resume = function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume().catch(() => {}); };

  // --------------------------------------------------------- building blocks ---
  const vary = (amt) => 1 + (Math.random() - 0.5) * 2 * (amt == null ? 0.04 : amt);

  function out(pan) {
    if (pan == null || !A.ctx.createStereoPanner) return A.sfx;
    const p = A.ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    p.connect(A.sfx);
    return p;
  }
  const panX = (x) => (x == null ? null : (x / 510 - 0.5) * 1.4);

  // oscillator with an exponential decay envelope and optional pitch glide
  function tone(type, f, t, dur, vol, o) {
    o = o || {};
    const c = A.ctx;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.glide || dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    const atk = o.attack || 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) {
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, t); fl.Q.value = o.q || 0.8;
      if (o.lpTo) fl.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur);
      osc.connect(fl); node = fl;
    }
    node.connect(g);
    g.connect(o.dest || out(o.pan));
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return osc;
  }

  // filtered white noise burst
  function noise(t, dur, vol, o) {
    o = o || {};
    const c = A.ctx;
    const src = c.createBufferSource();
    src.buffer = o.brown ? A.brown : A.white;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || out(o.pan));
    const off = Math.random() * 1.5;
    src.start(t, off);
    src.stop(t + dur + 0.02);
  }

  function bell(f, t, vol, dur, pan) {
    tone('sine', f, t, dur, vol, { pan: pan });
    tone('sine', f * 2.76, t, dur * 0.6, vol * 0.4, { pan: pan });
    tone('sine', f * 5.4, t, dur * 0.35, vol * 0.18, { pan: pan });
  }

  function chord(notes, t, dur, vol, type, o) {
    o = o || {};
    for (const n of notes) {
      tone(type || 'sawtooth', n, t, dur, vol, Object.assign({ lp: o.lp || 2400, lpTo: o.lpTo || 700, detune: -7, attack: o.attack || 0.01 }, o));
      tone(type || 'sawtooth', n, t, dur, vol * 0.7, Object.assign({ lp: o.lp || 2400, lpTo: o.lpTo || 700, detune: 7, attack: o.attack || 0.01 }, o));
    }
  }
  const N = (semi) => 440 * Math.pow(2, semi / 12);   // semitones from A4

  // limit simultaneous voices of one kind (spinner ticks, rollovers)
  function allow(id, max, gap) {
    const now = A.ctx.currentTime;
    const v = A.voices[id] || (A.voices[id] = { last: -1, list: [] });
    if (now - v.last < (gap || 0)) return false;
    v.list = v.list.filter((t) => t > now);
    if (v.list.length >= max) return false;
    v.list.push(now + 0.12);
    v.last = now;
    return true;
  }

  // ----------------------------------------------------------- the sounds ---
  const S = {};
  S.flipUp = (o) => {
    const t = A.ctx.currentTime, p = o.side === 'L' ? -0.35 : 0.35;
    tone('sine', 150 * vary(), t, 0.08, 0.6, { to: 42, pan: p });
    noise(t, 0.035, 0.45, { f: 2300 * vary(0.08), q: 1.3, pan: p });
    tone('square', 950 * vary(), t, 0.014, 0.07, { pan: p });
  };
  S.flipDown = (o) => {
    const t = A.ctx.currentTime, p = o.side === 'L' ? -0.35 : 0.35;
    noise(t, 0.03, 0.2, { f: 1500 * vary(0.08), q: 1.5, pan: p });
    tone('sine', 95, t, 0.05, 0.22, { to: 40, pan: p });
  };
  S.bumper = (o) => {
    const t = A.ctx.currentTime, p = panX(o.x), v = vary(0.06);
    tone('sine', 210 * v, t, 0.15, 0.75, { to: 52, pan: p });
    noise(t, 0.045, 0.5, { type: 'highpass', f: 1600, pan: p });
    tone('triangle', 1150 * v, t, 0.1, 0.22, { to: 480, pan: p });
    tone('square', 340 * v, t + 0.004, 0.05, 0.07, { to: 210, pan: p });
  };
  S.sling = (o) => {
    const t = A.ctx.currentTime, p = panX(o.x), v = vary(0.05);
    noise(t, 0.032, 0.55, { type: 'highpass', f: 2600, pan: p });
    tone('sine', 170 * v, t, 0.1, 0.55, { to: 58, pan: p });
    tone('sawtooth', 270 * v, t, 0.06, 0.1, { to: 170, lp: 2000, pan: p });
  };
  S.rollover = (o) => { if (!allow('roll', 3, 0.03)) return; bell(1320 * vary(0.03), A.ctx.currentTime, 0.16, 0.45, panX(o.x)); };
  S.laneLit = () => bell(1760 * vary(0.02), A.ctx.currentTime + 0.03, 0.14, 0.6);
  S.target = (o) => {
    const t = A.ctx.currentTime, p = panX(o.x);
    noise(t, 0.05, 0.42, { f: 950 * vary(), q: 2, pan: p });
    tone('sine', 270 * vary(), t, 0.07, 0.38, { to: 170, pan: p });
  };
  S.targetLit = (o) => { S.target(o || {}); bell(1568, A.ctx.currentTime + 0.02, 0.12, 0.5); };
  S.drop = (o) => {
    const t = A.ctx.currentTime, p = panX(o.x);
    noise(t, 0.09, 0.5, { type: 'lowpass', f: 700, pan: p });
    tone('sine', 125 * vary(), t, 0.11, 0.55, { to: 55, pan: p });
    noise(t + 0.03, 0.02, 0.25, { f: 3000, pan: p });
  };
  S.spin = () => {
    if (!allow('spin', 6, 0.012)) return;
    const t = A.ctx.currentTime;
    noise(t, 0.009, 0.16 * vary(0.3), { type: 'highpass', f: 5200 * vary(0.1), pan: -0.65 });
    tone('square', 2400 * vary(0.08), t, 0.006, 0.03, { pan: -0.65 });
  };
  S.hit = (o) => {
    const t = A.ctx.currentTime, p = panX(o.x);
    const k = Math.min(1, (o.v || 300) / 3000);
    const vol = 0.06 + 0.4 * k;
    if (!allow('hit', 5, 0.008)) return;
    if (o.kind === 'flipper') {
      tone('sine', 170 * vary(), t, 0.06, vol * 0.9, { to: 75, pan: p });
      noise(t, 0.02, vol * 0.4, { type: 'lowpass', f: 900, pan: p });
    } else if (o.kind === 'ball') {
      tone('sine', 3100 * vary(0.06), t, 0.02, vol * 0.5, { pan: p });
      tone('sine', 4700 * vary(0.06), t, 0.015, vol * 0.3, { pan: p });
    } else if (o.kind === 'plunger') {
      tone('sine', 140, t, 0.06, vol * 0.6, { to: 60 });
    } else if (o.mat === 'metal') {
      tone('sine', 2300 * vary(0.08), t, 0.035, vol * 0.45, { pan: p });
      tone('sine', 3700 * vary(0.08), t, 0.025, vol * 0.25, { pan: p });
      noise(t, 0.012, vol * 0.3, { type: 'highpass', f: 3000, pan: p });
    } else if (o.kind === 'post' || o.mat === 'rubber' || o.mat === 'sling') {
      tone('sine', 230 * vary(), t, 0.06, vol, { to: 120, pan: p });
      noise(t, 0.02, vol * 0.3, { f: 800, pan: p });
    } else if (o.mat === 'plastic') {
      noise(t, 0.03, vol * 0.6, { f: 1800 * vary(), q: 2, pan: p });
      tone('triangle', 600 * vary(), t, 0.03, vol * 0.25, { pan: p });
    } else {
      noise(t, 0.035, vol * 0.7, { f: 650 * vary(), q: 1.4, pan: p });
      tone('sine', 160 * vary(), t, 0.05, vol * 0.5, { to: 90, pan: p });
    }
  };
  S.rampEnter = (o) => {
    const t = A.ctx.currentTime, p = panX(o.x);
    noise(t, 0.4, 0.22, { f: 400, fTo: 2200, q: 3, attack: 0.05, pan: p });
    tone('sawtooth', 110, t, 0.38, 0.05, { to: 260, lp: 900, attack: 0.05, pan: p });
  };
  S.wire = () => {
    const t = A.ctx.currentTime;
    for (let i = 0; i < 8; i++) noise(t + i * 0.055, 0.05, 0.08 * vary(0.3), { f: 3200 * vary(0.15), q: 4 });
  };
  S.wireDrop = (o) => {
    const t = A.ctx.currentTime, p = panX(o.x);
    tone('sine', 145, t, 0.09, 0.45, { to: 65, pan: p });
    noise(t, 0.03, 0.3, { f: 1200, pan: p });
  };
  S.gate = () => {
    const t = A.ctx.currentTime;
    tone('square', 1900 * vary(), t, 0.012, 0.05, { pan: 0.7 });
    noise(t, 0.018, 0.12, { f: 3500, pan: 0.7 });
  };
  S.scoopIn = () => {
    const t = A.ctx.currentTime;
    noise(t, 0.45, 0.32, { type: 'lowpass', f: 2400, fTo: 160, attack: 0.01 });
    tone('sine', 62, t, 0.55, 0.45, { attack: 0.05 });
    tone('sine', 40, t + 0.05, 0.7, 0.4, { to: 32, attack: 0.08 });
  };
  S.scoopOut = () => {
    const t = A.ctx.currentTime;
    tone('sine', 130, t, 0.16, 0.75, { to: 40 });
    noise(t, 0.06, 0.4, { type: 'lowpass', f: 1200 });
  };
  S.kickback = () => {
    const t = A.ctx.currentTime;
    tone('sine', 95, t, 0.26, 0.95, { to: 34 });
    noise(t, 0.12, 0.6, { type: 'lowpass', f: 900 });
    tone('sine', 480, t + 0.02, 0.16, 0.08, { to: 1500 });
  };
  S.plungerPull = () => {
    const t = A.ctx.currentTime;
    for (let i = 0; i < 6; i++) noise(t + i * 0.085, 0.012, 0.18, { f: 3200 * vary(0.1), q: 3, pan: 0.85 });
  };
  S.plungerRelease = (o) => {
    const t = A.ctx.currentTime, pw = o.power || 0.5;
    noise(t, 0.07, 0.25 + 0.45 * pw, { f: 1300, q: 1.1, pan: 0.85 });
    tone('sine', 230, t, 0.11, 0.35 + 0.4 * pw, { to: 75, pan: 0.85 });
    tone('sine', 640 * vary(), t + 0.02, 0.22, 0.06, { to: 300, pan: 0.85 });
  };
  S.autolaunch = () => S.plungerRelease({ power: 1 });
  S.serve = () => {
    const t = A.ctx.currentTime;
    noise(t, 0.18, 0.28, { type: 'lowpass', f: 420, pan: 0.85 });
    tone('sine', 85, t + 0.1, 0.1, 0.3, { pan: 0.85 });
  };
  S.release = () => { const t = A.ctx.currentTime; tone('sine', 110, t, 0.12, 0.5, { to: 50 }); noise(t, 0.05, 0.3, { f: 900 }); };
  S.drain = () => {
    const t = A.ctx.currentTime;
    const notes = [N(-5), N(-9), N(-12)];
    notes.forEach((f, i) => {
      const d = i === 2 ? 0.75 : 0.24;
      tone('sawtooth', f, t + i * 0.26, d, 0.22, { lp: 1400, lpTo: 300, attack: 0.02, to: i === 2 ? f * 0.82 : null, glide: d });
      tone('triangle', f / 2, t + i * 0.26, d, 0.2, { attack: 0.02, to: i === 2 ? f * 0.41 : null, glide: d });
    });
  };
  S.ballsave = () => {
    const t = A.ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((s, i) => tone('triangle', N(3 + s), t + i * 0.07, 0.25, 0.2));
    bell(N(27), t + 0.36, 0.12, 0.8);
  };
  S.skillshot = () => {
    const t = A.ctx.currentTime;
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone('triangle', N(10 + s), t + i * 0.05, 0.3, 0.17));
    chord([N(10), N(14), N(17)], t + 0.35, 0.7, 0.07, 'sawtooth', { lp: 3000, lpTo: 900 });
  };
  S.superskill = () => { S.skillshot(); setTimeout(() => S.jackpot(), 180); };
  S.combo = (o) => {
    const t = A.ctx.currentTime;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
    const s = scale[Math.min(scale.length - 1, (o.n || 2) - 1)];
    bell(N(15 + s), t, 0.2, 0.7);
    tone('triangle', N(15 + s + 12), t + 0.04, 0.3, 0.08);
  };
  S.jackpot = () => {
    const t = A.ctx.currentTime;
    const C = [N(3), N(7), N(10), N(15)];
    chord(C, t, 0.16, 0.09);
    chord(C, t + 0.18, 0.16, 0.09);
    chord([N(5), N(8), N(12), N(17)], t + 0.36, 0.9, 0.1, 'sawtooth', { lp: 3200, lpTo: 900 });
    [15, 19, 22, 27, 31].forEach((s, i) => tone('square', N(s), t + 0.36 + i * 0.06, 0.18, 0.05, { lp: 4000 }));
    noise(t + 0.36, 1.2, 0.22, { type: 'highpass', f: 6500, attack: 0.01 });
    tone('sine', 70, t, 0.4, 0.6, { to: 40 });
  };
  S.superjackpot = () => {
    const t = A.ctx.currentTime;
    tone('sine', 62, t, 1.4, 1.0, { to: 28, attack: 0.01 });
    noise(t, 0.9, 0.5, { type: 'lowpass', f: 500, fTo: 80 });
    chord([N(-4), N(0), N(3), N(8)], t + 0.05, 0.5, 0.1);
    chord([N(3), N(7), N(10), N(15)], t + 0.55, 1.4, 0.11, 'sawtooth', { lp: 3600, lpTo: 700, attack: 0.02 });
    [15, 19, 22, 27, 31, 34, 39].forEach((s, i) => tone('square', N(s), t + 0.55 + i * 0.07, 0.25, 0.05));
    noise(t + 0.55, 2.0, 0.28, { type: 'highpass', f: 6000, attack: 0.02 });
  };
  S.multiball = () => {
    const t = A.ctx.currentTime;
    for (let i = 0; i < 3; i++) tone('sawtooth', 380, t + i * 0.38, 0.36, 0.12, { to: 820, glide: 0.18, lp: 2500 });
    setTimeout(() => S.jackpot(), 1150);
  };
  S.lock = () => {
    const t = A.ctx.currentTime;
    tone('sine', 120, t, 0.16, 0.6, { to: 50 });
    noise(t, 0.08, 0.35, { type: 'lowpass', f: 1000 });
    [0, 7, 12].forEach((s, i) => tone('triangle', N(7 + s), t + 0.15 + i * 0.09, 0.3, 0.16));
  };
  S.lockLit = () => { const t = A.ctx.currentTime; tone('triangle', N(12), t, 0.2, 0.16); tone('triangle', N(19), t + 0.12, 0.35, 0.16); };
  S.missionLit = () => { const t = A.ctx.currentTime; [0, 5, 9, 12].forEach((s, i) => bell(N(15 + s), t + i * 0.08, 0.12, 0.5)); };
  S.ebLit = () => { const t = A.ctx.currentTime; [0, 4, 7, 12, 7, 12].forEach((s, i) => tone('square', N(12 + s), t + i * 0.07, 0.12, 0.07, { lp: 3000 })); };
  S.kickbackLit = () => { const t = A.ctx.currentTime; tone('triangle', N(7), t, 0.2, 0.18); tone('triangle', N(14), t + 0.1, 0.3, 0.18); };
  S.extraball = () => {
    const t = A.ctx.currentTime;
    S.knocker();
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone('triangle', N(3 + s), t + 0.15 + i * 0.06, 0.4, 0.15));
    chord([N(3), N(7), N(10)], t + 0.6, 1.0, 0.08, 'sawtooth', { lp: 3000, lpTo: 800 });
  };
  S.knocker = () => {
    const t = A.ctx.currentTime;
    tone('sine', 92, t, 0.14, 1.0, { to: 48 });
    noise(t, 0.07, 0.7, { type: 'lowpass', f: 350 });
    noise(t, 0.02, 0.4, { f: 2000 });
  };
  S.shootagain = () => { const t = A.ctx.currentTime; [0, 7, 12, 19].forEach((s, i) => bell(N(10 + s), t + i * 0.1, 0.12, 0.6)); };
  S.tilt = () => {
    const t = A.ctx.currentTime;
    tone('square', 112, t, 1.1, 0.26, { lp: 700 });
    tone('square', 118, t, 1.1, 0.2, { lp: 700 });
  };
  S.danger = () => { const t = A.ctx.currentTime; for (let i = 0; i < 3; i++) tone('square', 880, t + i * 0.14, 0.08, 0.14, { lp: 2500 }); };
  S.timerTick = () => tone('sine', 1500, A.ctx.currentTime, 0.03, 0.14);
  S.select = () => tone('sine', 900 * vary(0.02), A.ctx.currentTime, 0.06, 0.18, { to: 1300 });
  S.blip = () => tone('triangle', 1400 * vary(0.03), A.ctx.currentTime, 0.05, 0.1);
  S.beltComplete = () => { const t = A.ctx.currentTime; [0, 4, 7, 12].forEach((s, i) => tone('triangle', N(15 + s), t + i * 0.05, 0.22, 0.15)); };
  S.dropsComplete = () => { const t = A.ctx.currentTime; chord([N(0), N(3), N(7)], t, 0.4, 0.08, 'sawtooth', { lp: 2600, lpTo: 600 }); };
  S.addaball = () => { const t = A.ctx.currentTime; noise(t, 0.5, 0.2, { f: 300, fTo: 3000, q: 2 }); S.lockLit(); };
  S.supernova = () => {
    const t = A.ctx.currentTime;
    tone('sine', 50, t, 2.5, 1.0, { to: 25, attack: 0.02 });
    noise(t, 2.2, 0.35, { f: 200, fTo: 6000, q: 0.7, attack: 1.2 });
    chord([N(-12), N(-5), N(0), N(4)], t + 1.2, 2.2, 0.1, 'sawtooth', { lp: 4000, lpTo: 900, attack: 0.05 });
    [12, 16, 19, 24, 28, 31, 36].forEach((s, i) => tone('triangle', N(s), t + 1.2 + i * 0.08, 0.5, 0.1));
  };
  S.supernovaLit = () => { const t = A.ctx.currentTime; chord([N(0), N(4), N(7), N(12)], t, 1.5, 0.06, 'sawtooth', { lp: 5000, lpTo: 1200, attack: 0.3 }); };
  S.modeStart = () => {
    const t = A.ctx.currentTime;
    tone('sawtooth', 160, t, 0.6, 0.12, { to: 900, lp: 3000, attack: 0.05 });
    noise(t, 0.6, 0.18, { f: 300, fTo: 4000, q: 1.5, attack: 0.2 });
    chord([N(0), N(3), N(7)], t + 0.55, 0.8, 0.09, 'sawtooth', { lp: 3000, lpTo: 900 });
  };
  S.modeStep = () => { const t = A.ctx.currentTime; bell(N(19), t, 0.14, 0.5); bell(N(26), t + 0.08, 0.12, 0.6); };
  S.modeComplete = () => {
    const t = A.ctx.currentTime;
    chord([N(3), N(7), N(10)], t, 0.18, 0.09);
    chord([N(5), N(8), N(12)], t + 0.2, 0.18, 0.09);
    chord([N(7), N(10), N(14), N(19)], t + 0.4, 1.2, 0.1, 'sawtooth', { lp: 3600, lpTo: 900 });
    noise(t + 0.4, 1.2, 0.2, { type: 'highpass', f: 6500 });
  };
  S.modeFail = () => { const t = A.ctx.currentTime; tone('square', N(-2), t, 0.25, 0.1, { lp: 1500 }); tone('square', N(-7), t + 0.25, 0.5, 0.1, { lp: 1200 }); };
  S.search = () => { const t = A.ctx.currentTime; for (let i = 0; i < 3; i++) tone('sine', 120, t + i * 0.12, 0.08, 0.4, { to: 55 }); };
  S.bonusTick = (o) => {
    const t = A.ctx.currentTime, n = o.n || 0;
    tone('square', 520 * Math.pow(1.06, n), t, 0.06, 0.08, { lp: 2500 });
    noise(t, 0.02, 0.15, { f: 3000 });
    bell(1046 * Math.pow(1.06, n), t, 0.08, 0.3);
  };
  S.bonusTotal = () => { const t = A.ctx.currentTime; chord([N(3), N(7), N(10), N(15)], t, 0.9, 0.08, 'sawtooth', { lp: 3000, lpTo: 900 }); };
  S.nudge = () => {
    const t = A.ctx.currentTime;
    tone('sine', 72, t, 0.12, 0.55, { to: 38 });
    noise(t, 0.09, 0.25, { type: 'lowpass', f: 600 });
  };
  S.comet = () => {
    const t = A.ctx.currentTime;
    noise(t, 0.45, 0.2, { type: 'highpass', f: 1500, fTo: 7000, attack: 0.03 });
    [0, 7, 12, 19].forEach((s, i) => tone('triangle', N(19 + s), t + i * 0.05, 0.25, 0.1));
  };
  S.orbit = () => {
    const t = A.ctx.currentTime;
    noise(t, 0.55, 0.22, { f: 350, fTo: 1600, q: 2.5, attack: 0.1 });
    tone('triangle', N(7), t + 0.1, 0.3, 0.08, { to: N(14) });
  };
  S.rampMade = () => {
    const t = A.ctx.currentTime;
    tone('square', 440, t, 0.18, 0.08, { to: 880, lp: 3000 });
    bell(N(24), t + 0.12, 0.12, 0.5);
  };
  S.scoop = () => {
    const t = A.ctx.currentTime;
    tone('sine', 55, t, 0.8, 0.55, { attack: 0.02, to: 45 });
    tone('sine', 110, t, 0.5, 0.15, { attack: 0.02 });
    noise(t, 0.6, 0.12, { type: 'lowpass', f: 400 });
  };
  S.gamestart = () => {
    const t = A.ctx.currentTime;
    [0, 3, 7, 10, 12, 15, 19, 24].forEach((s, i) => tone('square', N(3 + s), t + i * 0.06, 0.18, 0.07, { lp: 3500 }));
    chord([N(3), N(7), N(10)], t + 0.5, 0.8, 0.08, 'sawtooth', { lp: 3000, lpTo: 800 });
  };
  S.gameover = () => {
    const t = A.ctx.currentTime;
    [12, 7, 3, 0].forEach((s, i) => tone('triangle', N(3 + s), t + i * 0.18, 0.4, 0.15));
    chord([N(-9), N(-5), N(0)], t + 0.75, 1.6, 0.07, 'sawtooth', { lp: 2000, lpTo: 400, attack: 0.05 });
  };
  S.menu = () => tone('triangle', 1200, A.ctx.currentTime, 0.04, 0.08);
  S.menuSelect = () => { const t = A.ctx.currentTime; tone('triangle', 900, t, 0.06, 0.1); tone('triangle', 1350, t + 0.05, 0.1, 0.1); };
  S.achievement = () => { const t = A.ctx.currentTime; [0, 4, 7, 12, 16].forEach((s, i) => bell(N(15 + s), t + i * 0.07, 0.1, 0.6)); };

  A.play = function (id, opts) {
    if (!A.ready || A.muted || !A.ctx || A.ctx.state !== 'running') return;
    const fn = S[id];
    if (!fn) return;
    try { fn(opts || {}); } catch (e) { /* a broken sound must never break the game */ }
  };

  // ------------------------------------------------- rolling rumble ---
  A.startRumble = function () {
    const c = A.ctx;
    const mk = (buf, type, f, q) => {
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(fl); fl.connect(g); g.connect(A.sfx);
      src.start();
      return { src: src, f: fl, g: g };
    };
    A.rumble = mk(A.brown, 'lowpass', 200, 0.7);
    A.rattle = mk(A.white, 'bandpass', 2600, 3);
  };

  // speed: fastest playfield ball (mm/s), rampSpeed: fastest ball on a ramp or wire
  A.updateRolling = function (speed, rampSpeed) {
    if (!A.rumble) return;
    const t = A.ctx.currentTime;
    const k = Math.min(1, speed / 3200);
    A.rumble.g.gain.setTargetAtTime(k * k * 0.5 + (speed > 30 ? 0.03 : 0), t, 0.06);
    A.rumble.f.frequency.setTargetAtTime(110 + speed * 0.16, t, 0.08);
    const r = Math.min(1, rampSpeed / 2500);
    A.rattle.g.gain.setTargetAtTime(r * 0.07, t, 0.05);
    A.rattle.f.frequency.setTargetAtTime(1800 + rampSpeed * 0.6, t, 0.1);
  };

  A.toneFn = tone; A.noiseFn = noise; A.chordFn = chord; A.N = N;
  NN.Audio = A;
})(globalThis.NN || (globalThis.NN = {}));
