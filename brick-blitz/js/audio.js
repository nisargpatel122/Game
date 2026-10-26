/* Brick Blitz — synthesized sound effects and music (no audio files). */
(function (root) {
  'use strict';

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // Bricks broken in a row climb this scale (major pentatonic), so a long combo sings.
  const SCALE = [0, 2, 4, 7, 9];

  // One loop per world. chords: four bars; bass: which eighth notes play the root.
  const TRACKS = {
    menu: { bpm: 104, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [1, 0, 0, 1, 0, 0, 1, 0], arp: 'triangle', arpVol: 0.1, drums: 1 },
    neon: { bpm: 112, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [1, 0, 1, 0, 1, 0, 1, 1], arp: 'square', arpVol: 0.07, drums: 2 },
    caves: { bpm: 92, chords: [[62, 65, 69], [60, 64, 67], [58, 62, 65], [60, 64, 67]], bass: [1, 0, 0, 0, 1, 0, 0, 0], arp: 'triangle', arpVol: 0.13, drums: 1 },
    forge: { bpm: 128, chords: [[52, 55, 59], [53, 57, 60], [52, 55, 59], [50, 53, 57]], bass: [1, 1, 0, 1, 1, 0, 1, 0], arp: 'sawtooth', arpVol: 0.05, drums: 3 },
    space: { bpm: 100, chords: [[60, 64, 67, 71], [62, 66, 69], [64, 67, 71], [62, 66, 69]], bass: [1, 0, 0, 0, 0, 0, 1, 0], arp: 'sine', arpVol: 0.14, drums: 1 },
    cyber: { bpm: 136, chords: [[54, 57, 61], [50, 54, 57], [52, 56, 59], [49, 52, 56]], bass: [1, 0, 1, 1, 1, 0, 1, 1], arp: 'square', arpVol: 0.06, drums: 3 },
    boss: { bpm: 146, chords: [[52, 55, 58], [51, 55, 58], [52, 55, 58], [53, 56, 60]], bass: [1, 1, 1, 1, 1, 1, 1, 1], arp: 'sawtooth', arpVol: 0.05, drums: 3 },
  };
  const ARP = [0, 1, 2, 1, 0, 2, 1, 2];

  const Sfx = {
    ctx: null, master: null, sfxGain: null, musicGain: null, noise: null,
    soundOn: true, musicOn: true, track: 'menu', musicTimer: null, step: 0, nextNote: 0, last: {},

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.15;
        comp.connect(this.ctx.destination);
        this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(comp);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.connect(this.master);
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16; this.musicGain.connect(lp);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.setSound(this.soundOn);
        this.setMusic(this.musicOn);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    setSound(on) { this.soundOn = on; if (this.sfxGain) this.sfxGain.gain.value = on ? 1 : 0; },

    setMusic(on) {
      this.musicOn = on;
      if (!this.ctx) return;
      if (on && !this.musicTimer) {
        this.nextNote = this.ctx.currentTime + 0.1;
        this.step = 0;
        this.musicTimer = setInterval(() => this._schedule(), 50);
      } else if (!on && this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
    },

    // Switch loops at the next bar line.
    playTrack(name) {
      if (!TRACKS[name] || name === this.track) return;
      this.pending = name;
    },

    pauseAll(paused) {
      if (!this.ctx) return;
      if (paused) this.ctx.suspend(); else this.ctx.resume();
    },

    tone(freq, dur, type, vol, slideTo, delay, dest) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t); o.stop(t + dur + 0.05);
    },

    hiss(dur, ftype, freq, vol, q, slideTo, delay, dest) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + (delay || 0);
      const src = this.ctx.createBufferSource(); src.buffer = this.noise;
      src.playbackRate.value = 0.7 + Math.random() * 0.6;
      const f = this.ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
      if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    },

    // Rate-limit sounds that can fire many times in one instant.
    _gate(name, gap) {
      const now = this.ctx.currentTime;
      if (now - (this.last[name] || 0) < gap) return false;
      this.last[name] = now;
      return true;
    },

    play(name, o) {
      if (!this.ctx || !this.soundOn) return;
      o = o || {};
      switch (name) {
        case 'paddle':
          this.tone(330, 0.09, 'triangle', 0.32, 220);
          this.tone(660, 0.05, 'sine', 0.08);
          this.hiss(0.04, 'bandpass', 2200, 0.08, 2);
          break;
        case 'wall':
          if (!this._gate('wall', 0.05)) return;
          this.tone(1500, 0.03, 'sine', 0.05, 1200);
          break;
        case 'break': {
          if (!this._gate('break', 0.025)) return;
          const n = Math.max(0, (o.combo || 1) - 1);
          const note = 72 + SCALE[n % 5] + 12 * Math.min(2, Math.floor(n / 5));
          const f = midi(note);
          this.tone(f, 0.22, 'triangle', 0.22);
          this.tone(f * 2, 0.12, 'sine', 0.07, null, 0.005);
          this.hiss(0.08, 'highpass', 3500, 0.12);
          break;
        }
        case 'hit':
          if (!this._gate('hit', 0.03)) return;
          this.tone(900, 0.06, 'square', 0.05, 700);
          this.tone(1800, 0.05, 'sine', 0.06);
          break;
        case 'steel':
          if (!this._gate('steel', 0.03)) return;
          this.hiss(0.08, 'bandpass', 2600, 0.25, 4);
          this.tone(420, 0.1, 'square', 0.05, 300);
          break;
        case 'gold':
          if (!this._gate('gold', 0.04)) return;
          this.tone(2400, 0.18, 'sine', 0.1);
          this.tone(3600, 0.12, 'sine', 0.05, null, 0.01);
          break;
        case 'reveal':
          for (let i = 0; i < 4; i++) this.tone(1200 + i * 300, 0.12, 'sine', 0.05, null, i * 0.03);
          break;
        case 'explode':
          if (!this._gate('explode', 0.06)) return;
          this.hiss(0.7, 'lowpass', 1600, 0.9, 0.8, 90);
          this.tone(90, 0.5, 'sine', 0.6, 32);
          this.tone(55, 0.7, 'triangle', 0.35, 28, 0.04);
          break;
        case 'drop': this.tone(880, 0.1, 'sine', 0.08, 1320); break;
        case 'powerGood':
          [0, 4, 7, 12].forEach((s, i) => this.tone(midi(76 + s), 0.12, 'square', 0.06, null, i * 0.045));
          this.tone(midi(88), 0.25, 'triangle', 0.12, null, 0.18);
          break;
        case 'powerBad':
          this.tone(300, 0.35, 'sawtooth', 0.1, 120);
          this.tone(310, 0.35, 'square', 0.05, 125, 0.02);
          break;
        case 'multi': [0, 5, 9].forEach((s, i) => this.tone(midi(84 + s), 0.1, 'triangle', 0.15, null, i * 0.05)); break;
        case 'laser':
          if (!this._gate('laser', 0.08)) return;
          this.tone(1600, 0.09, 'square', 0.04, 400);
          break;
        case 'zap':
          this.hiss(0.45, 'highpass', 2500, 0.45, 1);
          for (let i = 0; i < 5; i++) this.tone(200 + Math.random() * 1200, 0.06, 'sawtooth', 0.08, 80, i * 0.05);
          break;
        case 'freeBall': this.tone(520, 0.08, 'square', 0.06, 1040); this.tone(1040, 0.15, 'triangle', 0.12, null, 0.07); break;
        case 'magnet': this.tone(160, 0.08, 'square', 0.1, 120); break;
        case 'launch': this.hiss(0.18, 'bandpass', 900, 0.15, 2, 3000); this.tone(400, 0.12, 'triangle', 0.1, 900); break;
        case 'shield':
          this.hiss(0.3, 'highpass', 3000, 0.25);
          this.tone(500, 0.2, 'triangle', 0.2, 1200);
          break;
        case 'ballOut': this.tone(400, 0.15, 'triangle', 0.08, 200); break;
        case 'lifeLost':
          this.tone(600, 0.6, 'sawtooth', 0.12, 80);
          this.hiss(0.5, 'lowpass', 800, 0.4, 1, 100);
          break;
        case 'stun':
          this.tone(120, 0.3, 'sawtooth', 0.12, 90);
          this.hiss(0.25, 'bandpass', 3000, 0.25, 3);
          break;
        case 'turret': if (this._gate('turret', 0.1)) this.tone(700, 0.12, 'square', 0.04, 1400); break;
        case 'bossShot': if (this._gate('bossShot', 0.1)) { this.tone(500, 0.18, 'sawtooth', 0.07, 1500); this.hiss(0.12, 'bandpass', 1500, 0.1, 2); } break;
        case 'bossHit':
          if (!this._gate('bossHit', 0.05)) return;
          this.tone(110, 0.22, 'sine', 0.5, 60);
          this.hiss(0.15, 'lowpass', 900, 0.4);
          this.tone(260, 0.1, 'square', 0.06, 180);
          break;
        case 'bossPhase':
          this.tone(80, 0.9, 'sawtooth', 0.2, 160);
          this.tone(82, 0.9, 'square', 0.1, 150, 0.03);
          this.hiss(0.8, 'lowpass', 500, 0.5, 1, 1500);
          break;
        case 'bossDie':
          for (let i = 0; i < 6; i++) {
            this.hiss(0.6, 'lowpass', 1400, 0.7, 0.8, 80, i * 0.22);
            this.tone(90 - i * 6, 0.5, 'sine', 0.5, 30, i * 0.22);
          }
          break;
        case 'summon': this.tone(300, 0.25, 'sine', 0.12, 900); break;
        case 'warn': [0, 0.18].forEach(d => this.tone(220, 0.12, 'square', 0.08, null, d)); break;
        case 'descend': this.hiss(0.5, 'lowpass', 300, 0.7, 0.7, 60); this.tone(55, 0.4, 'sine', 0.4, 35); break;
        case 'expire': this.tone(700, 0.12, 'sine', 0.06, 350); break;
        case 'click': this.tone(900, 0.05, 'triangle', 0.15, 600); break;
        case 'star':
          this.tone(880 * Math.pow(1.26, o.i || 0), 0.3, 'triangle', 0.25);
          this.tone(1760 * Math.pow(1.26, o.i || 0), 0.25, 'sine', 0.1, null, 0.03);
          break;
        case 'combo': {
          const base = 520 * Math.pow(1.06, Math.min(24, o.n || 5));
          [1, 1.26, 1.5, 2].forEach((m, i) => this.tone(base * m, 0.14, 'square', 0.06, null, i * 0.045));
          break;
        }
        case 'win':
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.25, null, i * 0.11));
          this.tone(1046, 0.6, 'sine', 0.15, null, 0.45);
          break;
        case 'lose':
          [440, 392, 349, 262].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.07, f * 0.95, i * 0.18));
          break;
        case 'start':
          [0, 7, 12].forEach((s, i) => this.tone(midi(72 + s), 0.14, 'square', 0.06, null, i * 0.08));
          break;
      }
    },

    vibrate(ms) { try { if (this.soundOn && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } },

    _schedule() {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const tr = TRACKS[this.track];
      const eighth = 60 / tr.bpm / 2;
      while (this.nextNote < ctx.currentTime + 0.25) {
        const i = this.step, t = this.nextNote - ctx.currentTime;
        const inBar = i % 8, bar = Math.floor(i / 8) % 4;
        const chord = tr.chords[bar];
        const out = this.musicGain;
        if (tr.bass[inBar]) this.tone(midi(chord[0] - 24), eighth * 0.9, 'triangle', 0.55, null, t, out);
        const note = chord[ARP[inBar] % chord.length] + 12;
        this.tone(midi(note), eighth * 0.8, tr.arp, tr.arpVol, null, t, out);
        if (inBar === 0) this.tone(midi(chord[1]), eighth * 7, 'sine', 0.05, null, t, out);
        // drums: 1 = soft, 2 = backbeat, 3 = four on the floor
        if (tr.drums >= 2 ? inBar % 2 === 0 && (tr.drums === 3 || inBar % 4 === 0) : inBar === 0) this.tone(120, 0.12, 'sine', 0.6, 45, t, out);
        if (tr.drums >= 2 && (inBar === 2 || inBar === 6)) this.hiss(0.1, 'bandpass', 1800, 0.25, 0.8, null, t, out);
        if (inBar % 2 === 1) this.hiss(0.04, 'highpass', 7000, tr.drums >= 2 ? 0.18 : 0.08, 1, null, t, out);
        this.step = (i + 1) % 32;
        this.nextNote += eighth;
        if (this.step % 8 === 0 && this.pending) { this.track = this.pending; this.pending = null; this.step = 0; return; }
      }
    },
  };

  root.Sfx = Sfx;
})(typeof self !== 'undefined' ? self : this);
