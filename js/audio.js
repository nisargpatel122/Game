/* Angry Flock — synthesized sound effects and a small music loop (no audio files needed). */
(function (root) {
  'use strict';

  const Sfx = {
    ctx: null, master: null, sfxGain: null, musicGain: null, noise: null,
    soundOn: true, musicOn: true, musicTimer: null, musicStep: 0, nextNoteTime: 0,

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16; this.musicGain.connect(this.master);
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
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.musicTimer = setInterval(() => this._scheduleMusic(), 50);
      } else if (!on && this.musicTimer) {
        clearInterval(this.musicTimer); this.musicTimer = null;
      }
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
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t); o.stop(t + dur + 0.05);
    },

    hiss(dur, ftype, freq, vol, q, slideTo, delay) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + (delay || 0);
      const src = this.ctx.createBufferSource(); src.buffer = this.noise;
      src.playbackRate.value = 0.7 + Math.random() * 0.6;
      const f = this.ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
      if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    },

    play(name, o) {
      if (!this.ctx || !this.soundOn) return;
      o = o || {};
      const v = o.vol == null ? 1 : o.vol;
      switch (name) {
        case 'stretch': this.tone(140, 0.25, 'sawtooth', 0.04 * v, 260); this.hiss(0.2, 'bandpass', 900, 0.05, 3); break;
        case 'launch':
          this.hiss(0.35, 'bandpass', 700, 0.35, 1.5, 2600);
          this.tone(520, 0.18, 'square', 0.06, 900, 0.02);
          break;
        case 'squawk': {
          const f = { red: 700, blue: 1100, yellow: 900, black: 380, white: 820, big: 260 }[o.type] || 700;
          this.tone(f, 0.12, 'square', 0.07, f * 1.5);
          this.tone(f * 1.4, 0.16, 'triangle', 0.06, f * 0.9, 0.1);
          break;
        }
        case 'hit_wood': this.hiss(0.14, 'lowpass', 900, 0.4 * v); this.tone(190, 0.12, 'triangle', 0.25 * v, 110); break;
        case 'hit_glass': this.tone(2300 + Math.random() * 600, 0.18, 'sine', 0.12 * v); this.tone(3400, 0.1, 'sine', 0.06 * v); break;
        case 'hit_stone': this.hiss(0.16, 'lowpass', 400, 0.5 * v); this.tone(90, 0.15, 'sine', 0.35 * v, 60); break;
        case 'hit_tnt': this.hiss(0.1, 'lowpass', 800, 0.3 * v); break;
        case 'break_wood':
          this.hiss(0.3, 'bandpass', 500, 0.6, 1.2, 250);
          for (let i = 0; i < 3; i++) this.tone(300 + Math.random() * 200, 0.05, 'square', 0.05, 120, i * 0.04);
          break;
        case 'break_glass':
          this.hiss(0.35, 'highpass', 3000, 0.25);
          for (let i = 0; i < 6; i++) this.tone(2000 + Math.random() * 3000, 0.12 + Math.random() * 0.15, 'sine', 0.06, null, i * 0.03);
          break;
        case 'break_stone': this.hiss(0.5, 'lowpass', 600, 0.7, 1, 120); this.tone(70, 0.3, 'sine', 0.3, 40); break;
        case 'break_tnt': break;
        case 'explode':
          this.hiss(1.0, 'lowpass', 1400, 1.0, 0.8, 90);
          this.tone(80, 0.6, 'sine', 0.7, 30);
          this.tone(50, 0.9, 'triangle', 0.4, 25, 0.05);
          break;
        case 'pigDie':
          this.tone(380, 0.08, 'square', 0.08, 700);
          this.tone(600, 0.14, 'square', 0.07, 300, 0.08);
          this.tone(300, 0.16, 'sine', 0.3, 70, 0.02);
          break;
        case 'pigHurt': this.tone(260, 0.1, 'square', 0.05, 200); this.tone(230, 0.1, 'square', 0.05, 170, 0.1); break;
        case 'pigLaugh':
          for (let i = 0; i < 4; i++) this.tone(320 + (i % 2) * 60, 0.09, 'square', 0.05, 260, i * 0.12);
          break;
        case 'ability': this.tone(800, 0.16, 'sine', 0.2, 1700); this.hiss(0.15, 'highpass', 2000, 0.1); break;
        case 'boost': this.hiss(0.4, 'bandpass', 600, 0.5, 2, 3000); this.tone(400, 0.3, 'sawtooth', 0.08, 1400); break;
        case 'poof': this.hiss(0.25, 'bandpass', 1400, 0.15, 1.5, 600); break;
        case 'birdHit': this.tone(o.type === 'big' ? 300 : 650, 0.1, 'square', 0.05, 400); break;
        case 'click': this.tone(900, 0.05, 'triangle', 0.15, 600); break;
        case 'star': this.tone(880 * Math.pow(1.26, o.i || 0), 0.3, 'triangle', 0.25); this.tone(1760 * Math.pow(1.26, o.i || 0), 0.25, 'sine', 0.1, null, 0.03); break;
        case 'bonus': this.tone(1200, 0.08, 'square', 0.06, 1800); break;
        case 'win':
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.25, null, i * 0.11));
          this.tone(1046, 0.6, 'sine', 0.15, null, 0.45);
          break;
        case 'lose':
          [440, 392, 349, 262].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.07, f * 0.95, i * 0.18));
          break;
      }
    },

    vibrate(ms) { try { if (this.soundOn && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } },

    // A light, bouncy loop: bass + pentatonic melody.
    _scheduleMusic() {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const beat = 60 / 112 / 2;
      const bass = [48, 48, 55, 55, 53, 53, 55, 52];
      const mel = [72, 0, 76, 79, 0, 76, 74, 0, 72, 74, 76, 0, 79, 81, 79, 76,
        74, 0, 72, 69, 0, 72, 74, 0, 76, 74, 72, 0, 69, 72, 67, 0];
      while (this.nextNoteTime < ctx.currentTime + 0.2) {
        const i = this.musicStep, t = this.nextNoteTime - ctx.currentTime;
        if (i % 4 === 0) this.tone(midi(bass[(i / 4) % bass.length]), beat * 3.5, 'triangle', 0.5, null, t, this.musicGain);
        const m = mel[i % mel.length];
        if (m) this.tone(midi(m), beat * 1.6, 'square', 0.12, null, t, this.musicGain);
        if (i % 2 === 1) this.hissMusic(t);
        this.musicStep = (i + 1) % 64;
        this.nextNoteTime += beat;
      }
    },

    hissMusic(delay) {
      const t = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource(); src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(f); f.connect(g); g.connect(this.musicGain);
      src.start(t, Math.random()); src.stop(t + 0.08);
    },
  };

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  root.Sfx = Sfx;
})(typeof self !== 'undefined' ? self : this);
