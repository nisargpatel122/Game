/* Angry Flock — level data.
 * Three worlds: Pig Island (classic slingshot), Space Hogs (planet gravity),
 * Demolition Crew (wreck a share of the building instead of popping pigs).
 * Structures are built with small helpers so blocks stack flush and stay stable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'));
  else root.LEVELS = factory(root.Sim);
})(typeof self !== 'undefined' ? self : this, function (Sim) {
  'use strict';

  const T = 0.22, S = 0.44, M = 0.88, L = 1.76, XL = 2.64;

  // y arguments are the bottom of the piece; every helper returns the top y.
  function builder() {
    const blocks = [], pigs = [];
    const b = {
      blocks, pigs,
      box(m, x, y, w, h, a) { blocks.push({ m, x, y: y + h / 2, w, h, a: a || 0 }); return y + h; },
      post(m, x, y, h) { return b.box(m, x, y, T, h || L); },
      plank(m, x, y, w) { return b.box(m, x, y, w || L, T); },
      cube(m, x, y, s) { return b.box(m, x, y, s || M, s || M); },
      ball(m, x, y, r) { blocks.push({ m, x, y: y + r, r }); return y + 2 * r; },
      tri(m, x, y, w, h, right) { blocks.push({ m, x, y: y + h / 2, w, h, tri: right ? 'right' : 'iso' }); return y + h; },
      pig(p, x, y) { const r = Sim.PIGS[p].r; pigs.push({ p, x, y: y + r + 0.005 }); return y + 2 * r; },
      frame(m, x, y, w, h, roof) {
        w = w || L; h = h || L;
        b.post(m, x - w / 2 + T / 2, y, h);
        b.post(m, x + w / 2 - T / 2, y, h);
        return b.plank(roof || m, x, y + h, w);
      },
      // floors: [{ m, w, h, roof, pig }]
      tower(x, y, floors) {
        for (const f of floors) {
          const base = y;
          y = b.frame(f.m, x, y, f.w, f.h, f.roof);
          if (f.pig) b.pig(f.pig, x, base);
        }
        return y;
      },
      pyramid(mats, x, y, rows, s) {
        s = s || M;
        for (let r = 0; r < rows; r++) {
          const n = rows - r;
          const m = Array.isArray(mats) ? mats[Math.min(r, mats.length - 1)] : mats;
          for (let i = 0; i < n; i++) b.cube(m, x + (i - (n - 1) / 2) * s, y + r * s, s);
        }
        return y + rows * s;
      },
    };
    return b;
  }

  // Build a structure in "local" coordinates (x along the surface, y = height)
  // and stand it on a planet's surface at the given angle.
  function onPlanet(b, planet, angleDeg, build) {
    const local = builder();
    build(local);
    const a = angleDeg * Math.PI / 180, rot = a - Math.PI / 2;
    const c = Math.cos(rot), s = Math.sin(rot);
    const ox = planet.x + planet.r * Math.cos(a), oy = planet.y + planet.r * Math.sin(a);
    const tf = (o) => {
      const x = o.x, y = o.y;
      o.x = ox + c * x - s * y;
      o.y = oy + s * x + c * y;
    };
    for (const k of local.blocks) { tf(k); k.a = (k.a || 0) + rot * 180 / Math.PI; b.blocks.push(k); }
    for (const p of local.pigs) { tf(p); b.pigs.push(p); }
  }

  function level(def, build) {
    const b = builder();
    build(b, def);
    return Object.assign({ blocks: b.blocks, pigs: b.pigs }, def);
  }

  // ======================= World 1: Pig Island =======================
  const island = [
    level({ id: '1-1', name: 'Hello Piggies', birds: ['red', 'red', 'red'] }, (b) => {
      b.tower(15, 0, [{ m: 'wood', pig: 'small' }]);
      b.tower(19.5, 0, [{ m: 'wood' }, { m: 'wood', pig: 'small' }]);
    }),

    level({ id: '1-2', name: 'Glass House', birds: ['red', 'blue', 'blue'] }, (b) => {
      let y = b.tower(16, 0, [{ m: 'wood', w: XL, pig: 'medium' }]);
      b.tower(16, y, [{ m: 'glass', pig: 'small' }]);
      b.tower(20.5, 0, [{ m: 'glass', pig: 'small' }, { m: 'glass', pig: 'small' }]);
    }),

    level({ id: '1-3', name: 'Timber!', birds: ['red', 'yellow', 'yellow'] }, (b) => {
      const top = b.tower(17, 0, [{ m: 'wood', pig: 'small' }, { m: 'wood' }, { m: 'wood', pig: 'small' }]);
      b.pig('small', 17, top);
      b.tower(20.5, 0, [{ m: 'wood', w: XL, pig: 'medium' }]);
      b.cube('wood', 23, 0);
    }),

    level({ id: '1-4', name: 'Rock Solid', birds: ['red', 'black', 'red'] }, (b) => {
      const y = b.tower(17.5, 0, [{ m: 'stone', w: XL, roof: 'wood', pig: 'helmet' }]);
      b.tower(17.5, y, [{ m: 'wood', pig: 'small' }]);
      b.cube('stone', 20.6, 0); b.cube('stone', 20.6, M);
      b.pig('medium', 22.2, 0);
      b.cube('wood', 23.6, 0);
    }),

    level({
      id: '1-5', name: 'Hilltop Fort', birds: ['yellow', 'blue', 'red', 'red'],
      terrain: [{ pts: [[12.5, 0], [26, 0], [24, 3], [15, 3]] }],
    }, (b) => {
      b.tower(17, 3, [{ m: 'wood', pig: 'small' }, { m: 'glass', pig: 'small' }]);
      b.tower(20.8, 3, [{ m: 'glass', w: XL, pig: 'medium' }]);
      b.cube('wood', 23, 3);
    }),

    level({ id: '1-6', name: 'TNT Party', birds: ['red', 'red', 'red'] }, (b) => {
      let y = b.tower(15.5, 0, [{ m: 'wood', pig: 'small' }]);
      b.cube('tnt', 15.5, y);
      b.pig('medium', 17.5, 0);
      y = b.tower(19.5, 0, [{ m: 'wood', pig: 'small' }]);
      b.cube('tnt', 19.5, y);
      b.cube('tnt', 22, 0);
      b.pig('large', 23.4, 0);
    }),

    level({ id: '1-7', name: 'Twin Towers', birds: ['blue', 'yellow', 'red', 'black'] }, (b) => {
      b.tower(16, 0, [{ m: 'wood', pig: 'small' }, { m: 'glass', pig: 'small' }, { m: 'glass', pig: 'small' }]);
      b.tower(20.5, 0, [{ m: 'stone', pig: 'helmet' }, { m: 'wood', pig: 'small' }, { m: 'glass' }]);
    }),

    level({ id: '1-8', name: 'Egg Drop', birds: ['white', 'white', 'red'] }, (b) => {
      b.cube('stone', 15.4, 0); b.cube('stone', 15.4, M);
      b.tower(17.6, 0, [{ m: 'stone', w: XL, h: 1.32, pig: 'medium' }]);
      b.cube('stone', 19.8, 0); b.cube('stone', 19.8, M);
      b.tower(22, 0, [{ m: 'stone', w: XL, h: 1.32, pig: 'small' }]);
    }),

    level({ id: '1-9', name: 'Big Brother', birds: ['big', 'red', 'black'] }, (b) => {
      b.tower(17.5, 0, [{ m: 'stone', w: XL, pig: 'helmet' }, { m: 'stone', w: XL, roof: 'wood', pig: 'medium' }]);
      b.cube('wood', 15.2, 0); b.cube('wood', 15.2, M);
      const y = b.pyramid('stone', 21.6, 0, 2);
      b.pig('small', 21.6, y);
    }),

    level({ id: '1-10', name: "King Pig's Castle", birds: ['red', 'blue', 'yellow', 'black', 'white'] }, (b) => {
      b.tower(15.5, 0, [{ m: 'wood', pig: 'small' }, { m: 'glass', pig: 'small' }]);
      let y = b.tower(19.2, 0, [{ m: 'stone', w: XL, roof: 'wood', pig: 'helmet' }, { m: 'wood', w: XL, pig: 'medium' }]);
      y = b.tower(19.2, y, [{ m: 'glass' }]);
      b.pig('king', 19.2, y);
      b.cube('tnt', 17.35, 0);
      b.tower(23, 0, [{ m: 'stone', pig: 'small' }, { m: 'wood', pig: 'small' }]);
    }),
  ];

  // ======================= World 2: Space Hogs =======================
  const space = [
    level({ id: '2-1', name: 'Lift Off', space: true, birds: ['red', 'red', 'red'] }, (b, d) => {
      const p = { x: 15, y: 0, r: 3, field: 7.5 };
      d.planets = [p];
      onPlanet(b, p, 90, (l) => { l.tower(0, 0, [{ m: 'wood', pig: 'small' }]); });
      onPlanet(b, p, 150, (l) => { l.pig('small', 0, 0); });
      onPlanet(b, p, 30, (l) => { l.pig('medium', 0, 0); });
    }),

    level({ id: '2-2', name: 'Slingshot Around', space: true, birds: ['red', 'yellow', 'blue'] }, (b, d) => {
      const p = { x: 14, y: 2, r: 2.6, field: 7 };
      d.planets = [p];
      onPlanet(b, p, 0, (l) => { l.tower(0, 0, [{ m: 'glass', pig: 'small' }]); });
      onPlanet(b, p, -70, (l) => { l.pig('medium', 0, 0); });
      onPlanet(b, p, 70, (l) => { l.cube('wood', 0, 0); });
    }),

    level({ id: '2-3', name: 'Floating Junk', space: true, birds: ['blue', 'blue', 'red'] }, (b, d) => {
      const p = { x: 17, y: -6, r: 2.4, field: 5.5 };
      d.planets = [p];
      onPlanet(b, p, 90, (l) => { l.pig('medium', 0, 0); });
      // A drifting cloud of glass and pigs in zero gravity.
      b.box('glass', 13, 3.4, M, M, 15); b.box('glass', 14.3, 1.2, L, T, 60);
      b.box('glass', 16.2, 4.4, L, T, -20); b.box('wood', 18, 2, M, M, 30);
      b.box('glass', 19.6, 4.6, M, M, 10);
      b.pig('small', 14.6, 2.6); b.pig('small', 17.4, 4.6); b.pig('small', 19.6, 1.8);
    }),

    level({ id: '2-4', name: 'Two Moons', space: true, birds: ['yellow', 'red', 'black', 'red'] }, (b, d) => {
      const p1 = { x: 12, y: -2.5, r: 2.2, field: 5.4 };
      const p2 = { x: 20.5, y: 4, r: 2.6, field: 6.2 };
      d.planets = [p1, p2];
      onPlanet(b, p1, 100, (l) => { l.tower(0, 0, [{ m: 'wood', pig: 'small' }]); });
      onPlanet(b, p2, 150, (l) => { l.tower(0, 0, [{ m: 'stone', pig: 'helmet' }]); });
      onPlanet(b, p2, 60, (l) => { l.pig('medium', 0, 0); });
    }),

    level({ id: '2-5', name: 'Ice Planet', space: true, birds: ['blue', 'white', 'red', 'blue'] }, (b, d) => {
      const p = { x: 16, y: 0.5, r: 3, field: 7.5 };
      d.planets = [p];
      for (const a of [20, 90, 160, 250]) {
        onPlanet(b, p, a, (l) => { l.tower(0, 0, [{ m: 'glass', pig: 'small' }]); });
      }
    }),

    level({ id: '2-6', name: 'Death Star Pig', space: true, birds: ['black', 'yellow', 'big', 'black', 'red'] }, (b, d) => {
      const p = { x: 18, y: 0, r: 4, field: 9.5, g: 14 };
      d.planets = [p];
      onPlanet(b, p, 90, (l) => {
        const y = l.tower(0, 0, [{ m: 'wood', w: XL, h: 2.2, roof: 'stone', pig: 'king' }]);
        l.cube('tnt', 0, y);
      });
      onPlanet(b, p, 140, (l) => { l.tower(0, 0, [{ m: 'wood', pig: 'medium' }]); });
      onPlanet(b, p, 40, (l) => { l.tower(0, 0, [{ m: 'glass', pig: 'helmet' }]); });
      onPlanet(b, p, 62, (l) => { l.cube('tnt', 0, 0); });
      onPlanet(b, p, 190, (l) => { l.cube('tnt', 0, 0); });
      onPlanet(b, p, -10, (l) => { l.pig('medium', 0, 0); });
    }),
  ];

  // ======================= World 3: Demolition Crew =======================
  const demo = [
    level({ id: '3-1', name: 'Warm Up', birds: ['red', 'yellow', 'yellow'], objective: { type: 'demolish', pct: 60 } }, (b) => {
      for (const x of [16.1, 17.9]) b.tower(x, 0, [{ m: 'wood' }, { m: 'wood' }, { m: 'wood' }]);
    }),

    level({ id: '3-2', name: 'Glass Tower', birds: ['blue', 'blue', 'red'], objective: { type: 'demolish', pct: 80 } }, (b) => {
      b.tower(18, 0, [{ m: 'glass' }, { m: 'glass' }, { m: 'glass' }, { m: 'glass' }, { m: 'glass' }]);
      b.cube('glass', 16.6, 0); b.cube('glass', 19.4, 0);
    }),

    level({ id: '3-3', name: 'The Great Wall', birds: ['black', 'big', 'red'], objective: { type: 'demolish', pct: 75 } }, (b) => {
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
          const m = r === 1 && c === 1 ? 'tnt' : 'stone';
          b.cube(m, 17 + c * M, r * M);
        }
      }
    }),

    level({ id: '3-4', name: 'The Pyramid', birds: ['big', 'black', 'yellow', 'red'], objective: { type: 'demolish', pct: 60 } }, (b) => {
      b.pyramid(['stone', 'wood', 'wood', 'glass', 'glass'], 19, 0, 5);
    }),

    level({ id: '3-5', name: 'City Block', birds: ['yellow', 'black', 'blue', 'red'], objective: { type: 'demolish', pct: 65 } }, (b) => {
      b.tower(15.5, 0, [{ m: 'wood' }, { m: 'wood' }, { m: 'wood' }]);
      b.cube('tnt', 17.4, 0);
      b.tower(19.3, 0, [{ m: 'glass' }, { m: 'glass' }, { m: 'glass' }, { m: 'glass' }]);
      b.cube('tnt', 21.2, 0);
      b.tower(23.1, 0, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }, { m: 'wood' }]);
    }),

    level({ id: '3-6', name: 'Skyscraper', birds: ['red', 'yellow', 'black', 'big'], objective: { type: 'demolish', pct: 85 } }, (b) => {
      const mats = ['stone', 'wood', 'glass', 'wood', 'stone', 'glass', 'wood'];
      let y = 0;
      mats.forEach((m, i) => {
        const base = y;
        y = b.frame(m, 19, y, XL, L, m === 'stone' ? 'wood' : m);
        if (i === 1 || i === 4) b.cube('tnt', 19, base);
      });
    }),
  ];

  return [
    { id: 1, name: 'Pig Island', desc: 'Classic slingshot. Pop every pig!', theme: 'island', levels: island },
    { id: 2, name: 'Space Hogs', desc: 'Planets bend your shots. Use their gravity!', theme: 'space', levels: space },
    { id: 3, name: 'Demolition Crew', desc: 'No pigs, just wreck the building.', theme: 'demo', levels: demo },
  ];
});
