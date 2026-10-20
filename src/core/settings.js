/*
 * NEON NEBULA — every tuning value in one place.
 *
 * World units are millimetres and seconds. y grows toward the player
 * (down the table). The baseline is a real machine: 27 mm steel ball,
 * 51 x 107 cm playfield tilted 6.5 degrees, 3 inch flippers. The "feel"
 * values on top of that make it fast, heavy and snappy.
 */
(function (NN) {
  'use strict';

  NN.PHYSICS_DEFAULTS = {
    // ---- Real machine baseline -------------------------------------------
    ballRadius: 13.5,          // mm, 27 mm steel ball
    gravity: 9810,             // mm/s^2
    slopeDeg: 6.5,             // playfield tilt
    rollingInertia: 5 / 7,     // a rolling solid sphere accelerates at 5/7 g sin(slope)

    // ---- Feel ---------------------------------------------------------------
    gravityScale: 1.9,         // >1 makes the ball heavier and faster than a real table
    rollingFriction: 70,       // mm/s^2 deceleration of a rolling ball
    airDrag: 0.015,            // fraction of speed lost per second
    maxSpeed: 8000,            // mm/s hard speed cap
    bounciness: 1.0,           // multiplier on every restitution value
    restThreshold: 40,         // mm/s: slower impacts do not bounce (lets the ball settle)

    // ---- Simulation ---------------------------------------------------------
    tickHz: 480,               // fixed physics tick, independent of frame rate
    maxSubstepMove: 0.3,       // ball moves at most this fraction of its radius per substep
    maxSubsteps: 24,

    // ---- Flippers -----------------------------------------------------------
    flipperLength: 78,         // mm pivot centre to tip centre (a touch over a 3 inch bat)
    flipperBaseRadius: 12.5,
    flipperTipRadius: 7,
    flipperRestDeg: 30,        // degrees below horizontal at rest
    flipperUpDeg: 28,          // degrees above horizontal when held up
    flipperUpAccel: 2600,      // rad/s^2 while the coil is energised (steady pull through the stroke)
    flipperUpMaxSpeed: 75,     // rad/s cap (end-of-stroke tip speed about 5.5 m/s)
    flipperDownAccel: 900,    // rad/s^2 return spring
    flipperDownMaxSpeed: 22,   // rad/s
    flipperRestBounce: 0.2,    // bounce off the rest stop
    flipperPower: 1.0,         // tuning-panel multiplier on swing speed (shot strength)
    flipperSpeed: 1.0,         // tuning-panel multiplier on swing acceleration (snap)
    upperFlipperLength: 54,
    upperFlipperBaseRadius: 10,
    upperFlipperTipRadius: 6,

    // ---- Active devices -----------------------------------------------------
    bumperKick: 2500,          // mm/s outgoing speed from a pop bumper
    bumperCooldown: 0.05,      // s
    slingKick: 2000,           // mm/s outgoing speed from a slingshot
    slingThreshold: 350,       // mm/s impact needed to fire a slingshot
    slingCooldown: 0.12,
    kickbackSpeed: 3300,       // mm/s straight back up the left outlane
    scoopEjectSpeed: 1900,

    // ---- Plunger ------------------------------------------------------------
    plungerMaxPull: 60,        // mm of visible travel
    plungerPullSpeed: 1.6,     // fraction of full pull per second while held
    plungerMaxLaunch: 4600,    // mm/s at full pull
    plungerMinLaunch: 500,     // mm/s at the smallest pull

    // ---- Nudge and tilt -----------------------------------------------------
    nudgeImpulse: 330,         // mm/s added to every ball
    nudgeTablePx: 5,           // visual table shift in mm
    tiltPerNudge: 1.0,
    tiltDecay: 0.55,           // tilt bob units per second
    tiltWarnLevel: 2.6,        // bob level that gives a DANGER warning
    tiltWarnings: 2,           // warnings allowed per ball; the next one tilts

    // ---- Ball save ----------------------------------------------------------
    ballSaveTime: 8,           // s (Casual uses ballSaveTimeCasual)
    ballSaveTimeCasual: 15,
  };

  // Surface materials. e = restitution, eFall = how much bounce drops at high
  // impact speed (rubber goes dead when hit hard), mu = friction.
  NN.MATERIALS = {
    rubber:  { e: 0.80, eFall: 0.35, mu: 0.50 },  // posts and rings: bouncy, grippy
    metal:   { e: 0.30, eFall: 0.00, mu: 0.06 },  // lane guides: slick and dead
    wall:    { e: 0.45, eFall: 0.10, mu: 0.18 },  // cabinet walls
    plastic: { e: 0.40, eFall: 0.10, mu: 0.15 },  // ramp walls
    flipper: { e: 0.55, eFall: 0.40, mu: 0.30 },  // flipper rubber
    target:  { e: 0.50, eFall: 0.20, mu: 0.20 },
    drop:    { e: 0.30, eFall: 0.10, mu: 0.20 },
    bumper:  { e: 0.60, eFall: 0.20, mu: 0.20 },
    sling:   { e: 0.75, eFall: 0.30, mu: 0.40 },
    plunger: { e: 0.20, eFall: 0.00, mu: 0.30 },
  };

  // Settings the tuning panel exposes. key -> [min, max, step, label]
  NN.TUNING_SLIDERS = {
    gravityScale: [1.0, 3.0, 0.05, 'Gravity'],
    slopeDeg: [4.0, 9.0, 0.1, 'Table slope'],
    flipperPower: [0.6, 1.5, 0.01, 'Flipper power'],
    flipperSpeed: [0.5, 1.6, 0.01, 'Flipper speed'],
    bounciness: [0.5, 1.4, 0.01, 'Bounciness'],
    ballSaveTime: [0, 20, 0.5, 'Ball save (s)'],
  };

  NN.makePhysicsSettings = function (overrides) {
    const p = Object.assign({}, NN.PHYSICS_DEFAULTS);
    if (overrides) {
      for (const k in overrides) {
        if (k in p && typeof overrides[k] === 'number' && isFinite(overrides[k])) p[k] = overrides[k];
      }
    }
    return p;
  };
})(globalThis.NN || (globalThis.NN = {}));
