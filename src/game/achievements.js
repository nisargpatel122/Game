/*
 * Achievements. Each check looks at the current game's stats (g), score and
 * lifetime stats (life). Checked live during play and again at game over.
 */
(function (NN) {
  'use strict';

  NN.ACHIEVEMENTS = [
    { id: 'first', name: 'FIRST CONTACT', desc: 'Play your first game', check: (g, s, life) => life.games >= 1 },
    { id: 'skill', name: 'SKILLED PILOT', desc: 'Make a skill shot', check: (g) => g.skillShots >= 1 },
    { id: 'superskill', name: 'SUPER SKILL', desc: 'Hold left flipper, plunge, then left ramp', check: (g) => g.superSkills >= 1 },
    { id: 'ramps10', name: 'LIFTOFF', desc: '10 ramps in one game', check: (g) => g.ramps >= 10 },
    { id: 'orbits10', name: 'ORBITAL', desc: '10 orbits in one game', check: (g) => g.orbits >= 10 },
    { id: 'comet5', name: 'COMET RIDER', desc: 'Comet Lane 5 times in one game', check: (g) => g.comets >= 5 },
    { id: 'mission', name: 'MISSION SPECIALIST', desc: 'Complete a mission', check: (g) => g.missions >= 1 },
    { id: 'mission3', name: 'COMMANDER', desc: 'Complete 3 missions in one game', check: (g) => g.missions >= 3 },
    { id: 'supernova', name: 'SUPERNOVA', desc: 'Complete all six missions', check: (g) => g.supernovas >= 1 },
    { id: 'multiball', name: 'NEBULA MULTIBALL', desc: 'Start multiball', check: (g) => g.multiballs >= 1 },
    { id: 'jackpot', name: 'JACKPOT', desc: 'Score a jackpot', check: (g) => g.jackpots >= 1 },
    { id: 'super', name: 'SUPER JACKPOT', desc: 'Score a super jackpot', check: (g) => g.superJackpots >= 1 },
    { id: 'combo3', name: 'COMBO PILOT', desc: '3-way combo', check: (g) => g.maxCombo >= 3 },
    { id: 'combo6', name: 'HYPERDRIVE', desc: '6-way combo', check: (g) => g.maxCombo >= 6 },
    { id: 'kickback', name: 'SAVED BY THE BELL', desc: 'Use the kickback', check: (g) => g.kickbacks >= 1 },
    { id: 'extraball', name: 'EXTRA LIFE', desc: 'Earn an extra ball', check: (g) => g.extraBalls >= 1 },
    { id: 'bumpers100', name: 'METEOR SHOWER', desc: '100 bumper hits in one game', check: (g) => g.bumpers >= 100 },
    { id: 'spins100', name: 'SPIN DOCTOR', desc: '100 spins on one ball', check: (g) => g.maxSpinsBall >= 100 },
    { id: 'score100m', name: '100 MILLION', desc: 'Score 100,000,000', check: (g, s) => s >= 100000000 },
    { id: 'score500m', name: 'HALF BILLION', desc: 'Score 500,000,000', check: (g, s) => s >= 500000000 },
    { id: 'billion', name: 'BILLIONAIRE', desc: 'Score 1,000,000,000', check: (g, s) => s >= 1000000000 },
    { id: 'marathon', name: 'MARATHON', desc: 'A 10 minute game', check: (g) => g.time >= 600 },
    { id: 'tilt', name: 'GENTLE GIANT', desc: 'Tilt the machine', check: (g) => g.tilts >= 1 },
    { id: 'games25', name: 'REGULAR', desc: 'Play 25 games', check: (g, s, life) => life.games >= 25 },
  ];

  // Returns the list of newly unlocked achievements and marks them in `have`.
  NN.checkAchievements = function (have, g, score, life) {
    const fresh = [];
    for (const a of NN.ACHIEVEMENTS) {
      if (have[a.id]) continue;
      try {
        if (a.check(g, score, life)) { have[a.id] = Date.now(); fresh.push(a); }
      } catch (e) { /* ignore */ }
    }
    return fresh;
  };
})(globalThis.NN || (globalThis.NN = {}));
