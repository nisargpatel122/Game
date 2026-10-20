/*
 * The six missions, started at the Black Hole when MISSION is lit.
 * Each mission is a small state machine driven by the rules engine:
 *   start(m, R)          set up mission state
 *   event(m, R, kind, id) react to a shot / switch, return points scored
 *   lit(m, R)            map of shot -> true for the arrows to light
 *   progress(m)          0..1 for the display
 *   status(m)            short text for the display
 */
(function (NN) {
  'use strict';

  const MAJOR = ['leftOrbit', 'leftRamp', 'scoop', 'rightRamp', 'rightOrbit', 'comet'];
  NN.MAJOR_SHOTS = MAJOR;
  const SHOT_NAMES = {
    leftOrbit: 'LEFT ORBIT', leftRamp: 'LEFT RAMP', scoop: 'BLACK HOLE',
    rightRamp: 'RIGHT RAMP', rightOrbit: 'RIGHT ORBIT', comet: 'COMET LANE',
  };
  NN.SHOT_NAMES = SHOT_NAMES;

  NN.MISSIONS = [
    {
      id: 'comet', name: 'COMET CHASE', line1: 'SHOOT THE', line2: 'RAMPS', color: '#36c8ff', time: 40,
      start(m) { m.count = 0; m.goal = 6; },
      event(m, R, kind, id) {
        if (kind === 'shot' && (id === 'leftRamp' || id === 'rightRamp')) {
          m.count++;
          return 2000000 + 750000 * (m.count - 1);
        }
        return 0;
      },
      lit() { return { leftRamp: true, rightRamp: true }; },
      progress(m) { return m.count / m.goal; },
      status(m) { return 'RAMPS ' + m.count + '/' + m.goal; },
      done(m) { return m.count >= m.goal; },
    },
    {
      id: 'pulsar', name: 'PULSAR SPIN', line1: 'SPIN THE', line2: 'SPINNER', color: '#b48cff', time: 40,
      start(m) { m.count = 0; m.goal = 50; },
      event(m, R, kind, id) {
        if (kind === 'spin') { m.count++; return 150000; }
        if (kind === 'shot' && (id === 'leftOrbit' || id === 'rightOrbit')) return 500000;
        return 0;
      },
      lit() { return { leftOrbit: true, rightOrbit: true }; },
      progress(m) { return m.count / m.goal; },
      status(m) { return 'SPINS ' + Math.min(m.count, m.goal) + '/' + m.goal; },
      done(m) { return m.count >= m.goal; },
    },
    {
      id: 'meteor', name: 'METEOR STORM', line1: 'SMASH THE', line2: 'BUMPERS', color: '#ff7a2f', time: 35,
      start(m) { m.count = 0; m.goal = 30; },
      event(m, R, kind) {
        if (kind === 'bumper') { m.count++; return 400000; }
        return 0;
      },
      lit() { return { comet: true }; },
      progress(m) { return m.count / m.goal; },
      status(m) { return 'METEORS ' + Math.min(m.count, m.goal) + '/' + m.goal; },
      done(m) { return m.count >= m.goal; },
    },
    {
      id: 'rogue', name: 'ROGUE PLANET', line1: 'CATCH THE', line2: 'MOVING SHOT', color: '#3dff8a', time: 45,
      start(m, R) { m.count = 0; m.goal = 3; m.at = R.rng.int(MAJOR.length); m.moveT = 0; },
      tick(m, R, dt) {
        m.moveT += dt;
        if (m.moveT >= 3.2) { m.moveT = 0; m.at = (m.at + 1 + R.rng.int(MAJOR.length - 1)) % MAJOR.length; R.fx({ type: 'sound', id: 'blip' }); }
      },
      event(m, R, kind, id) {
        if (kind === 'shot' && id === MAJOR[m.at]) {
          m.count++;
          m.moveT = 0;
          m.at = (m.at + 1 + R.rng.int(MAJOR.length - 1)) % MAJOR.length;
          return 5000000 + 2500000 * (m.count - 1);
        }
        return 0;
      },
      lit(m) { const o = {}; o[MAJOR[m.at]] = true; return o; },
      progress(m) { return m.count / m.goal; },
      status(m) { return 'PLANET ' + m.count + '/' + m.goal; },
      done(m) { return m.count >= m.goal; },
    },
    {
      id: 'constellation', name: 'CONSTELLATION', line1: 'HIT THE STARS', line2: 'IN ORDER', color: '#ffe14d', time: 50,
      start(m, R) {
        const pool = MAJOR.slice();
        m.seq = [];
        while (m.seq.length < 5) m.seq.push(pool.splice(R.rng.int(pool.length), 1)[0]);
        m.i = 0;
      },
      event(m, R, kind, id) {
        if (kind === 'shot' && id === m.seq[m.i]) {
          m.i++;
          return 3000000 + 1000000 * m.i;
        }
        return 0;
      },
      lit(m) { const o = {}; if (m.i < m.seq.length) o[m.seq[m.i]] = true; return o; },
      progress(m) { return m.i / m.seq.length; },
      status(m) { return 'STAR ' + m.i + '/' + m.seq.length; },
      done(m) { return m.i >= m.seq.length; },
    },
    {
      id: 'horizon', name: 'EVENT HORIZON', line1: 'CLEAR ASTEROIDS', line2: 'THEN BLACK HOLE', color: '#ff3df0', time: 45,
      start(m, R) { m.phase = R.dropsDown() >= 3 ? 2 : 1; m.value = 25000000; R.resetDrops(); },
      tick(m, R, dt) {
        if (m.phase === 2) m.value = Math.max(5000000, m.value - 600000 * dt);
      },
      event(m, R, kind, id) {
        if (m.phase === 1 && kind === 'dropsComplete') {
          m.phase = 2;
          R.show({ kind: 'award', t1: 'EVENT HORIZON', t2: 'SHOOT BLACK HOLE', dur: 1.6 });
          R.fx({ type: 'sound', id: 'modeStep' });
          return 2000000;
        }
        if (m.phase === 2 && kind === 'shot' && id === 'scoop') {
          m.phase = 3;
          return Math.round(m.value / 10000) * 10000;
        }
        return 0;
      },
      lit(m) { return m.phase === 2 ? { scoop: true } : {}; },
      litDrops(m) { return m.phase === 1; },
      progress(m) { return m.phase === 1 ? 0.2 : m.phase === 2 ? 0.6 : 1; },
      status(m) { return m.phase === 1 ? 'CLEAR ASTEROIDS' : 'HURRY ' + NN.U.formatScore(Math.round(m.value / 10000) * 10000); },
      done(m) { return m.phase === 3; },
    },
  ];
})(globalThis.NN || (globalThis.NN = {}));
