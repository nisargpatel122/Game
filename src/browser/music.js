/*
 * Optional synth music: a tiny step sequencer (bass, pad, arpeggio, drums) in
 * A minor that gets busier and faster for missions, multiball and SUPERNOVA.
 * Notes are scheduled slightly ahead on the audio clock so timing is tight.
 */
(function (NN) {
  'use strict';

  const M = { state: 'off', want: 'off', step: 0, nextT: 0, timer: null, enabled: true, bar: 0 };

  const STATES = {
    off: null,
    select: { bpm: 96, layers: { pad: 1, bass: 0.6, hat: 0.3 }, prog: 'calm' },
    normal: { bpm: 108, layers: { pad: 0.8, bass: 1, hat: 0.5, kick: 0.6 }, prog: 'main' },
    mode: { bpm: 116, layers: { pad: 0.7, bass: 1, hat: 0.8, kick: 1, snare: 0.6, arp: 0.8 }, prog: 'main' },
    multiball: { bpm: 126, layers: { pad: 0.6, bass: 1, hat: 1, kick: 1, snare: 1, arp: 1, hat16: 1 }, prog: 'drive' },
    wizard: { bpm: 132, layers: { pad: 0.9, bass: 1, hat: 1, kick: 1, snare: 1, arp: 1, hat16: 1, lead: 1 }, prog: 'epic' },
  };
  // chords as semitone offsets from A (root, third, fifth)
  const PROGS = {
    calm: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    main: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    drive: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]],
    epic: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-2, 2, 5]],
  };
  const LEAD = [12, 15, 19, 17, 15, 12, 10, 12, 15, 19, 22, 19, 17, 15, 14, 12];

  M.setState = function (s) {
    M.want = s;
    if (!NN.Audio.ctx) return;
    if (s !== 'off' && !M.timer && M.enabled) M.start();
  };

  M.setEnabled = function (on) {
    M.enabled = on;
    if (!on) M.stop();
    else if (M.want !== 'off') M.start();
  };

  M.start = function () {
    const A = NN.Audio;
    if (!A.ctx || M.timer) return;
    M.nextT = A.ctx.currentTime + 0.1;
    M.step = 0;
    M.timer = setInterval(M.schedule, 25);
  };

  M.stop = function () {
    if (M.timer) clearInterval(M.timer);
    M.timer = null;
    M.state = 'off';
  };

  M.schedule = function () {
    const A = NN.Audio;
    if (!A.ctx || A.ctx.state !== 'running') return;
    while (M.nextT < A.ctx.currentTime + 0.12) {
      // switch state on bar boundaries (16 steps)
      if (M.step % 16 === 0) {
        if (M.want !== M.state) M.state = M.want;
        if (M.state === 'off') { M.stop(); return; }
      }
      const st = STATES[M.state];
      if (!st) { M.stop(); return; }
      M.playStep(st, M.step, M.nextT);
      M.nextT += 60 / st.bpm / 4;
      M.step++;
    }
  };

  M.playStep = function (st, step, t) {
    const A = NN.Audio;
    const L = st.layers;
    const dest = A.musicBus;
    const prog = PROGS[st.prog];
    const barIdx = Math.floor(step / 16) % prog.length;
    const ch = prog[barIdx];
    const s16 = step % 16;
    const N = (semi) => 220 * Math.pow(2, semi / 12);      // A3 base
    const tone = A.toneFn, noise = A.noiseFn;
    const spb = 60 / st.bpm;
    // pad: chord at the start of each bar
    if (L.pad && s16 === 0) {
      for (const n of ch) {
        tone('sawtooth', N(n), t, spb * 4, 0.035 * L.pad, { lp: 1100, lpTo: 600, attack: 0.25, detune: -9, dest: dest });
        tone('sawtooth', N(n), t, spb * 4, 0.03 * L.pad, { lp: 1100, lpTo: 600, attack: 0.25, detune: 9, dest: dest });
      }
    }
    // bass: driving eighths, root / octave
    if (L.bass && s16 % 2 === 0) {
      const oct = (s16 / 2) % 2 === 1 ? 12 : 0;
      tone('sawtooth', N(ch[0] - 24 + oct), t, spb * 0.45, 0.11 * L.bass, { lp: 700, lpTo: 180, q: 4, dest: dest });
    }
    // arpeggio: sixteenths up through the chord
    if (L.arp) {
      const seq = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1] + 12, ch[2] + 12, ch[1]];
      tone('square', N(seq[s16 % 8] + 12), t, spb * 0.22, 0.025 * L.arp, { lp: 2600, dest: dest });
    }
    if (L.lead && s16 % 4 === 0) {
      const n = LEAD[(Math.floor(step / 4)) % LEAD.length];
      tone('triangle', N(n + 12), t, spb * 0.9, 0.05, { attack: 0.02, dest: dest });
    }
    // drums
    if (L.kick && (s16 === 0 || s16 === 8 || (L.snare && s16 === 10))) {
      tone('sine', 150, t, 0.16, 0.42 * L.kick, { to: 40, glide: 0.12, dest: dest });
    }
    if (L.snare && (s16 === 4 || s16 === 12)) {
      noise(t, 0.14, 0.14 * L.snare, { type: 'bandpass', f: 1800, q: 0.8, dest: dest });
      tone('triangle', 190, t, 0.08, 0.08 * L.snare, { to: 140, dest: dest });
    }
    if (L.hat) {
      const on = L.hat16 ? true : s16 % 2 === 0;
      if (on) noise(t, s16 % 4 === 2 ? 0.06 : 0.025, (s16 % 4 === 2 ? 0.05 : 0.03) * L.hat, { type: 'highpass', f: 7500, dest: dest });
    }
  };

  NN.Music = M;
})(globalThis.NN || (globalThis.NN = {}));
