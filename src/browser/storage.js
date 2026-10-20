/*
 * Everything saved on the device lives in localStorage. Every access is
 * guarded: private windows or blocked storage just fall back to defaults.
 */
(function (NN) {
  'use strict';

  const PREFIX = 'neonNebula.';
  const Store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        if (v == null) return fallback;
        return JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
  };

  NN.DEFAULT_SETTINGS = {
    sound: 0.8, music: 0.45, vibration: true, shake: true, difficulty: 'arcade', motionNudge: false,
    debug: false, showFps: false,
  };

  // Seed scores so there is always a score to beat
  const SEED = [
    ['NEO', 1500000000], ['ORB', 1000000000], ['ZAP', 750000000], ['NOV', 500000000], ['COM', 350000000],
    ['ION', 250000000], ['ARC', 150000000], ['SOL', 100000000], ['VEX', 60000000], ['LUX', 30000000],
  ];

  NN.Store = Store;
  NN.loadSettings = () => Object.assign({}, NN.DEFAULT_SETTINGS, Store.get('settings', {}));
  NN.saveSettings = (s) => Store.set('settings', s);
  NN.loadTuning = () => Store.get('tuning', {});
  NN.saveTuning = (t) => Store.set('tuning', t);
  NN.loadScores = (diff) => {
    const s = Store.get('scores.' + diff, null);
    if (Array.isArray(s) && s.length) return s;
    const scale = diff === 'casual' ? 0.75 : 1;
    return SEED.map((r) => ({ name: r[0], score: Math.round(r[1] * scale), seed: true }));
  };
  NN.saveScores = (diff, list) => Store.set('scores.' + diff, list.slice(0, 10));
  NN.loadStats = () => Object.assign({
    games: 0, totalScore: 0, bestScore: 0, playTime: 0, ramps: 0, orbits: 0, jackpots: 0, superJackpots: 0,
    missions: 0, multiballs: 0, supernovas: 0, extraBalls: 0, maxCombo: 0, skillShots: 0, tilts: 0, bumpers: 0, spins: 0,
  }, Store.get('stats', {}));
  NN.saveStats = (s) => Store.set('stats', s);
  NN.loadAchievements = () => Store.get('achievements', {});
  NN.saveAchievements = (a) => Store.set('achievements', a);
})(globalThis.NN || (globalThis.NN = {}));
