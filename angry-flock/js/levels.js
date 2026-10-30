/* Angry Flock — level data.
 * Three worlds: Pig Island (classic slingshot), Space Hogs (planet gravity),
 * Demolition Crew (wreck a share of the building instead of popping pigs).
 * Structures are built with small helpers so blocks stack flush and stay stable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'), require('./levelgen.js'));
  else root.LEVELS = factory(root.Sim, root.LevelGen);
})(typeof self !== 'undefined' ? self : this, function (Sim, LevelGen) {
  'use strict';

  const T = 0.22, S = 0.44, M = 0.88, L = 1.76, XL = 2.64;

  // y arguments are the bottom of the piece; every helper returns the top y.
  function builder() {
    const blocks = [], pigs = [], terrain = [];
    const b = {
      blocks, pigs, terrain,
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

      // n bays side by side sharing their posts; pigs[i] goes in bay i.
      bays(x, y, n, o) {
        o = o || {};
        const w = o.w || L, h = o.h || L, m = o.m || 'wood', roof = o.roof || m, post = o.post || m;
        const x0 = x - n * w / 2;
        for (let i = 0; i <= n; i++) b.post(post, x0 + i * w, y, h);
        for (let i = 0; i < n; i++) {
          b.box(roof, x0 + (i + 0.5) * w, y + h, w, T);
          const pig = o.pigs && o.pigs[i];
          if (pig) b.pig(pig, x0 + (i + 0.5) * w, y);
        }
        return y + h + T;
      },
      // floors: [{ m, h, roof, post, pigs: [...] }] stacked as bays
      building(x, y, n, floors, w) {
        for (const f of floors) y = b.bays(x, y, f.n || n, Object.assign({ w }, f));
        return y;
      },
      // a grid of cubes, centred on x
      wall(m, x, y, cols, rows, s) {
        s = s || M;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const mm = typeof m === 'function' ? m(c, r) : m;
            if (mm) b.cube(mm, x + (c - (cols - 1) / 2) * s, y + r * s, s);
          }
        }
        return y + rows * s;
      },
      stack(m, x, y, n, s) { return b.wall(m, x, y, 1, n, s); },
      // small cubes along the top of a wall, with gaps
      crenels(m, x, y, w) {
        const n = Math.max(2, Math.floor(w / (2 * S)));
        const step = (w - S) / (n - 1);
        for (let i = 0; i < n; i++) b.cube(m, x - w / 2 + S / 2 + i * step, y, S);
        return y + S;
      },
      // frame with a pointed roof
      house(x, y, o) {
        o = o || {};
        const w = o.w || L;
        const top = b.frame(o.m || 'wood', x, y, w, o.h || L, o.roof);
        if (o.pig) b.pig(o.pig, x, y);
        return b.tri(o.top || o.roof || o.m || 'wood', x, top, w, o.peak || 0.9);
      },
      // two cube walls with a slab on top and a pig inside
      bunker(x, y, o) {
        o = o || {};
        const s = o.s || M, rows = o.rows || 2, inner = o.inner || 1.32, m = o.m || 'stone';
        b.stack(m, x - inner / 2 - s / 2, y, rows, s);
        b.stack(m, x + inner / 2 + s / 2, y, rows, s);
        if (o.pig) b.pig(o.pig, x, y);
        return b.plank(o.roof || m, x, y + rows * s, inner + 2 * s);
      },
      // square castle tower with battlements
      keep(x, y, o) {
        o = o || {};
        const floors = o.floors || 2, m = o.m || 'stone', w = o.w || L;
        for (let i = 0; i < floors; i++) {
          const base = y;
          y = b.frame(m, x, y, w, o.h || L, o.roof || m);
          const pig = o.pigs && o.pigs[i];
          if (pig) b.pig(pig, x, base);
        }
        return o.crenels === false ? y : b.crenels(o.crenels || m, x, y, w);
      },
      // running-bond brick wall (small pieces that crumble nicely), centred on x
      brick(m, x, y, cols, rows, s) {
        s = s || S;
        const W = cols * 2 * s, x0 = x - W / 2;
        for (let r = 0; r < rows; r++) {
          const yy = y + r * s, mm = typeof m === 'function' ? m(r) : m;
          if (r % 2 === 0) {
            for (let c = 0; c < cols; c++) b.box(mm, x0 + (c + 0.5) * 2 * s, yy, 2 * s, s);
          } else {
            b.box(mm, x0 + s / 2, yy, s, s);
            for (let c = 0; c < cols - 1; c++) b.box(mm, x0 + s + (c + 0.5) * 2 * s, yy, 2 * s, s);
            b.box(mm, x0 + W - s / 2, yy, s, s);
          }
        }
        return y + rows * s;
      },
      // a stone ball held between two small blocks, ready to roll
      cup(x, y, ball, side) {
        b.cube(side || 'wood', x - 0.65, y, S); b.cube(side || 'wood', x + 0.65, y, S);
        return b.ball(ball || 'stone', x, y, 0.42);
      },
      // ground features
      mesa(x1, x2, h, slope) {
        slope = slope == null ? 1.6 : slope;
        terrain.push({ pts: [[x1 - slope, -0.5], [x2 + slope, -0.5], [x2, h], [x1, h]] });
        return h;
      },
      cliff(x1, x2, h) { terrain.push({ x1, x2, y1: -0.5, y2: h }); return h; },
      rock(x1, x2, y1, y2) { terrain.push({ x1, x2, y1, y2, style: 'rock' }); return y2; },
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
    const out = Object.assign({ blocks: b.blocks, pigs: b.pigs }, def);
    if (b.terrain.length) out.terrain = (def.terrain || []).concat(b.terrain);
    return out;
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

  // ---------- 1-11 to 1-40: big layered forts ----------
  // Each design lists its birds in a sensible order (what the fort is made of decides who
  // goes first). ISLAND_BIRDS sets the play order, smallest forts first, and how many of
  // those birds each level gets; the counts are tuned with tools/difficulty.js so the
  // levels get steadily harder.
  const ISLAND_DESIGNS = {
    'Wooden Village': { pref: ['yellow', 'red', 'yellow', 'red', 'red', 'yellow'], build: (b) => {
      b.house(13.8, 0, { m: 'wood', pig: 'small' });
      const y = b.building(17.2, 0, 2, [{ m: 'wood', pigs: ['small', null] }, { m: 'wood', pigs: [null, 'medium'] }]);
      b.tri('wood', 16.32, y, 1.4, 0.7); b.tri('wood', 18.08, y, 1.4, 0.7);
      b.cube('tnt', 19.75, 0);
      b.house(21.4, 0, { m: 'wood', pig: 'small' });
      b.brick('wood', 24, 0, 2, 3);
      b.pig('medium', 25.9, 0);
    } },
    'Glass Gardens': { pref: ['blue', 'red', 'blue', 'yellow', 'red', 'blue'], build: (b) => {
      b.brick('wood', 15, 0, 2, 2);
      const y = b.building(19.6, 0, 4, [
        { m: 'glass', post: 'wood', pigs: ['small', null, 'small', null] },
        { m: 'glass', pigs: [null, 'medium', null, 'small'] },
      ]);
      for (const x of [16.96, 18.72, 20.48, 22.24]) b.tri('glass', x, y, 1.4, 0.7);
      b.brick('wood', 24.6, 0, 1, 3);
      b.pig('small', 25.9, 0);
    } },
    'Hill Village': { pref: ['yellow', 'black', 'blue', 'red', 'yellow', 'red'], build: (b) => {
      const h = b.mesa(15.5, 26, 2.5);
      b.house(17, h, { m: 'wood', pig: 'small' });
      const y = b.building(20.4, h, 2, [
        { m: 'stone', roof: 'wood', pigs: ['small', 'medium'] },
        { m: 'wood', pigs: ['small', null] },
        { m: 'glass', pigs: [null, 'small'] },
      ]);
      b.tri('wood', 20.4, y, 2 * L, 1.0);
      b.cube('tnt', 23, h);
      b.house(24.6, h, { m: 'glass', top: 'wood', pig: 'small' });
      b.pig('small', 13, 0);
    } },
    'Market Square': { pref: ['red', 'yellow', 'blue', 'black', 'red', 'yellow'], build: (b) => {
      b.house(13.8, 0, { m: 'wood', pig: 'small' });
      b.house(16.2, 0, { m: 'glass', top: 'wood', pig: 'small' });
      const f = b.wall('stone', 19, 0, 2, 1);
      b.cup(19, f, 'stone', 'stone');
      b.cube('tnt', 20.4, 0);
      b.house(21.8, 0, { m: 'wood', pig: 'small' });
      const y = b.building(25, 0, 2, [{ m: 'wood', pigs: ['small', 'medium'] }, { m: 'wood', pigs: [null, 'small'] }]);
      b.tri('wood', 25, y, 2 * L, 1.0);
    } },
    'Brick Barracks': { pref: ['yellow', 'black', 'red', 'yellow', 'red', 'black'], build: (b) => {
      b.brick('wood', 14.5, 0, 2, 4);
      const y = b.building(19, 0, 3, [
        { m: 'wood', post: 'stone', pigs: ['small', 'helmet', 'small'] },
        { m: 'wood', pigs: [null, 'small', null] },
      ]);
      b.tri('wood', 19, y, 3 * L, 1.2);
      b.brick('stone', 23.4, 0, 2, 3);
      b.pig('medium', 25.3, 0);
    } },
    'Harbor Docks': { pref: ['yellow', 'blue', 'red', 'black', 'red', 'white'], build: (b) => {
      const a = b.rock(14, 16.5, -0.5, 1.6);
      const c = b.wall((cc, r) => (cc === 1 && r === 0 ? 'tnt' : 'wood'), 15.25, a, 2, 2);
      b.pig('small', 15.25, c);
      const d = b.rock(18.5, 21, -0.5, 2.6);
      const t = b.building(19.75, d, 1, [{ m: 'wood', pigs: ['small'] }, { m: 'glass', pigs: ['small'] }]);
      b.tri('wood', 19.75, t, L, 0.9);
      const e = b.rock(23, 25.5, -0.5, 1.2);
      b.bunker(24.25, e, { m: 'wood', s: S, rows: 3, pig: 'medium' });
      b.pig('small', 17.5, 0);
      b.pig('small', 22, 0);
    } },
    'Stonehenge': { pref: ['big', 'black', 'red', 'black', 'yellow', 'big'], build: (b) => {
      for (const [x, pig] of [[14.6, 'medium'], [25.4, 'medium']]) {
        const t = b.frame('stone', x, 0, XL);
        b.pig(pig, x, 0);
        b.cup(x, t, 'stone', 'stone');
      }
      b.frame('stone', 18.2, 0, XL); b.pig('helmet', 18.2, 0);
      b.frame('stone', 21.8, 0, XL); b.pig('helmet', 21.8, 0);
      const p = b.plank('stone', 20, 1.98, XL);
      const t = b.frame('stone', 20, p, XL);
      b.pig('medium', 20, p);
      b.crenels('stone', 20, t, XL);
    } },
    'Twin Spires': { pref: ['yellow', 'blue', 'white', 'red', 'yellow', 'red'], build: (b) => {
      const floors = [{ m: 'stone', roof: 'wood' }, { m: 'wood', pig: 'small' }, { m: 'wood' }, { m: 'glass', pig: 'small' }];
      const y = b.tower(15.6, 0, floors);
      b.tower(22.4, 0, floors);
      b.building(19, 0, 2, [{ m: 'glass', pigs: ['small', 'small'] }, { m: 'wood' }]);
      const d = b.plank('wood', 19, y, 6.8);
      b.frame('glass', 19, d); b.pig('medium', 19, d);
    } },
    'Crystal Tower': { pref: ['blue', 'black', 'blue', 'red', 'blue', 'yellow'], build: (b) => {
      const y = b.building(19, 0, 3, [
        { m: 'stone', roof: 'glass', pigs: [null, 'helmet', null] },
        { m: 'glass', pigs: ['small', null, 'small'] },
        { m: 'glass', pigs: [null, 'small', null] },
        { m: 'glass', pigs: ['small', null, 'small'] },
        { n: 1, m: 'glass', pigs: ['medium'] },
      ]);
      b.tri('glass', 19, y, L, 1.2);
      b.frame('glass', 14.5, 0); b.pig('small', 14.5, 0);
      b.frame('glass', 23.5, 0); b.pig('small', 23.5, 0);
    } },
    'Lumber Yard': { pref: ['yellow', 'red', 'yellow', 'red', 'black', 'yellow'], build: (b) => {
      for (let r = 0; r < 6; r++) b.plank('wood', 14.6, r * T, XL);
      b.pig('small', 14.6, 6 * T);
      const y = b.bays(19, 0, 3, { m: 'wood', pigs: ['small', 'medium', 'small'] });
      for (const x of [17.24, 19, 20.76]) b.cup(x, y);
      const t = b.building(24.5, 0, 2, [{ m: 'wood', pigs: ['medium', null] }, { m: 'wood', pigs: [null, 'small'] }]);
      b.cup(23.62, t); b.cup(25.38, t);
    } },
    'Mountain Keep': { pref: ['yellow', 'black', 'white', 'big', 'red', 'yellow', 'red'], build: (b) => {
      b.cliff(17, 29, 1.6); b.cliff(20.6, 29, 3.2); b.cliff(24.2, 29, 4.8);
      b.house(14.5, 0, { m: 'wood', pig: 'small' });
      b.brick('wood', 16.3, 0, 1, 3);
      b.bays(18.8, 1.6, 2, { w: 1.6, m: 'wood', pigs: ['small', 'small'] });
      b.building(22.4, 3.2, 2, [{ m: 'stone', roof: 'wood', pigs: ['helmet', 'small'] }, { m: 'glass', pigs: [null, 'small'] }], 1.6);
      b.keep(26.6, 4.8, { m: 'stone', w: XL, h: 2.2, floors: 1, roof: 'wood', pigs: ['king'] });
    } },
    'Grand Bridge': { pref: ['yellow', 'blue', 'red', 'black', 'white', 'red', 'yellow'], build: (b) => {
      const h = b.mesa(12.6, 15.4, 3, 1.2);
      b.mesa(24.6, 27.4, 3, 1.2);
      const y = b.tower(14, h, [{ m: 'wood', pig: 'small' }, { m: 'stone', roof: 'wood' }]);
      b.tower(26, h, [{ m: 'wood', pig: 'small' }, { m: 'stone', roof: 'wood' }]);
      const d = b.plank('wood', 20, y, 12.4);
      b.frame('glass', 17.4, d); b.pig('small', 17.4, d);
      b.tri('wood', 20, b.frame('wood', 20, d), L, 0.8); b.pig('medium', 20, d);
      b.frame('glass', 22.6, d); b.pig('small', 22.6, d);
      b.building(20, 0, 3, [{ m: 'stone', roof: 'wood', pigs: ['small', 'helmet', 'small'] }]);
    } },
    'Pyramid Temple': { pref: ['big', 'black', 'yellow', 'white', 'red', 'black'], build: (b) => {
      const y = b.building(20, 0, 5, [
        { m: 'stone', roof: 'stone', pigs: [null, 'small', null, 'small', null] },
        { n: 4, m: 'wood', roof: 'stone', pigs: ['small', null, null, 'small'] },
        { n: 3, m: 'wood', pigs: [null, 'helmet', null] },
        { n: 2, m: 'glass', pigs: ['small', 'small'] },
        { n: 1, m: 'wood', pigs: ['medium'] },
      ]);
      b.tri('wood', 20, y, L, 1.0);
    } },
    'Bunker Complex': { pref: ['black', 'white', 'red', 'black', 'big', 'red'], build: (b) => {
      b.brick('stone', 12.6, 0, 1, 3);
      for (const [x, pig] of [[15, 'helmet'], [19, 'medium'], [23, 'helmet']]) b.bunker(x, 0, { s: S, rows: 4, pig, roof: 'stone' });
      const w = b.plank('wood', 19, 1.98, 10);
      b.frame('wood', 16.9, w); b.pig('small', 16.9, w);
      b.cube('tnt', 19, w);
      b.frame('wood', 21.1, w); b.pig('small', 21.1, w);
    } },
    'Ice Fortress': { pref: ['blue', 'blue', 'black', 'yellow', 'red', 'blue', 'black'], build: (b) => {
      b.brick('glass', 15, 0, 1, 5);
      b.stack('glass', 16.4, 0, 3, S);
      const y = b.building(20, 0, 3, [
        { m: 'stone', roof: 'wood', pigs: ['helmet', 'medium', 'helmet'] },
        { m: 'glass', post: 'wood', pigs: ['small', null, 'small'] },
        { n: 2, m: 'glass', pigs: ['small', 'small'] },
      ]);
      b.tri('glass', 20, y, 2 * L, 1.0);
      b.stack('glass', 23.6, 0, 3, S);
      b.brick('glass', 25, 0, 1, 5);
    } },
    'Cliff Castle': { pref: ['yellow', 'black', 'white', 'big', 'red', 'yellow', 'black'], build: (b) => {
      const h = b.cliff(19.5, 29.5, 3.5);
      b.house(15, 0, { m: 'wood', pig: 'small' });
      b.brick('wood', 17.4, 0, 1, 4);
      b.keep(21, h, { m: 'stone', roof: 'wood', pigs: ['helmet', 'small'] });
      b.building(24.4, h, 2, [{ m: 'wood', post: 'stone', pigs: ['medium', 'small'] }, { m: 'glass', pigs: ['small', null] }]);
      b.cube('tnt', 27, h);
      b.keep(28.4, h, { m: 'wood', floors: 1, pigs: ['small'] });
    } },
    'Watchtower Ridge': { pref: ['yellow', 'red', 'blue', 'black', 'red', 'white', 'yellow', 'red'], build: (b) => {
      const a = b.rock(13.6, 15.6, -0.5, 2.2);
      b.tri('wood', 14.6, b.tower(14.6, a, [{ m: 'wood', pig: 'small' }, { m: 'glass', pig: 'small' }]), L, 0.9);
      const c = b.rock(17.5, 19.5, -0.5, 3.8);
      b.crenels('stone', 18.5, b.tower(18.5, c, [{ m: 'stone', roof: 'wood', pig: 'helmet' }, { m: 'wood', pig: 'small' }]), L);
      const e = b.rock(21.5, 23.5, -0.5, 1.4);
      b.tower(22.5, e, [{ m: 'wood', pig: 'small' }, { m: 'wood', pig: 'small' }, { m: 'glass' }]);
      const g = b.rock(25.2, 27.2, -0.5, 3.0);
      b.keep(26.2, g, { m: 'stone', floors: 1, roof: 'wood', pigs: ['helmet'] });
      b.cube('tnt', 16.55, 0); b.cube('tnt', 20.5, 0);
      b.pig('small', 24.35, 0);
    } },
    'Stone Gate': { pref: ['black', 'yellow', 'big', 'red', 'black', 'red', 'yellow'], build: (b) => {
      b.keep(14.8, 0, { m: 'stone', roof: 'wood', pigs: ['small', 'helmet'] });
      const y = b.building(19, 0, 3, [
        { m: 'wood', post: 'stone', pigs: ['small', null, 'small'] },
        { m: 'wood', pigs: [null, 'medium', null] },
        { m: 'glass', pigs: [null, null, 'small'] },
      ]);
      b.crenels('wood', 19, y, 3 * L);
      b.keep(23.2, 0, { m: 'stone', roof: 'wood', pigs: ['helmet', 'small'] });
    } },
    'Hilltop Fortress': { pref: ['big', 'black', 'yellow', 'white', 'red', 'black', 'red'], build: (b) => {
      const h = b.mesa(16.5, 26.5, 2.5);
      b.keep(17.6, h, { m: 'stone', roof: 'wood', pigs: ['small', 'helmet'] });
      b.brick('stone', 19.6, h, 1, 4);
      const y = b.building(22, h, 2, [{ m: 'stone', roof: 'wood', pigs: ['medium', 'helmet'] }, { m: 'wood', pigs: ['small', 'small'] }]);
      const k = b.frame('wood', 22, y, XL, 2.2);
      b.pig('king', 22, y);
      b.crenels('stone', 22, k, XL);
      b.keep(25.4, h, { m: 'stone', roof: 'wood', pigs: ['helmet', 'small'] });
    } },
    'The Vault': { pref: ['black', 'big', 'black', 'red', 'white', 'black'], build: (b) => {
      for (const [x, pigs] of [[16.5, ['helmet', 'tnt']], [23.2, ['medium', 'small']]]) {
        b.wall('stone', x, 0, 5, 1);
        b.stack('stone', x - 2 * M, M, 3); b.stack('stone', x + 2 * M, M, 3);
        if (pigs[1] === 'tnt') { b.pig(pigs[0], x - 0.6, M); b.cube('tnt', x + 0.75, M); }
        else { b.pig(pigs[0], x - 0.6, M); b.pig(pigs[1], x + 0.75, M); }
        const r = b.plank('stone', x, 4 * M, 5 * M);
        const t = b.plank('wood', x, r, 5 * M);
        b.crenels('stone', x, t, 5 * M);
      }
    } },
    'Floating Citadel': { pref: ['yellow', 'red', 'blue', 'white', 'black', 'red', 'yellow', 'red'], build: (b) => {
      const a = b.rock(13.5, 17, 3.0, 3.6);
      b.tri('wood', 15.25, b.frame('wood', 15.25, a, XL), XL, 0.9); b.pig('medium', 15.25, a);
      const c = b.rock(19, 23, 5.4, 6.0);
      b.crenels('stone', 21, b.bays(21, c, 2, { m: 'stone', roof: 'wood', pigs: ['helmet', 'small'] }), 2 * L);
      const e = b.rock(24.5, 28, 2.2, 2.8);
      b.bunker(26.25, e, { m: 'wood', s: S, rows: 3, pig: 'medium' });
      b.building(21, 0, 2, [{ m: 'glass', pigs: ['small', 'small'] }, { m: 'wood' }]);
      b.frame('glass', 15.25, 0); b.pig('small', 15.25, 0);
    } },
    'Underground Lair': { pref: ['white', 'white', 'black', 'red', 'black', 'yellow', 'white', 'red'], build: (b) => {
      const h = b.cliff(13.5, 17, 3);
      b.cliff(22, 27, 3);
      const r1 = b.plank('wood', 19.5, h, 5.6);
      b.brick('glass', 19.5, r1, 3, 2);
      const t = b.bays(19.5, 0, 2, { m: 'wood', pigs: ['medium', 'small'] });
      b.pig('small', 19.5, t);
      b.house(15.2, h, { m: 'wood', pig: 'small' });
      b.building(24.5, h, 2, [{ m: 'glass', pigs: ['small', 'small'] }, { m: 'wood' }]);
    } },
    'Fortress Ring': { pref: ['blue', 'yellow', 'black', 'big', 'red', 'black', 'white'], build: (b) => {
      b.brick('glass', 14.2, 0, 1, 6); b.brick('glass', 25.8, 0, 1, 6);
      b.brick('wood', 15.6, 0, 1, 5); b.brick('wood', 24.4, 0, 1, 5);
      const y = b.keep(20, 0, { m: 'stone', w: XL, h: 2.2, floors: 1, roof: 'stone', pigs: ['king'], crenels: false });
      b.house(20, y, { m: 'wood', pig: 'helmet' });
      for (const x of [17.36, 22.64]) {
        const t = b.frame('wood', x, 0, 1.4);
        b.pig('small', x, 0);
        b.cube('tnt', x, t);
      }
    } },
    'Tower of Doom': { pref: ['yellow', 'black', 'white', 'big', 'red', 'yellow', 'red'], build: (b) => {
      const y = b.building(20, 0, 2, [
        { m: 'stone', roof: 'wood', pigs: ['helmet', 'small'] }, { m: 'wood', pigs: [null, 'medium'] },
        { m: 'glass', pigs: ['small', null] }, { m: 'wood', pigs: [null, 'small'] },
        { m: 'glass' }, { m: 'wood', pigs: ['small', 'small'] },
      ]);
      b.cup(19.12, y); b.cup(20.88, y);
      b.stack('tnt', 17.2, 0, 2);
      b.brick('stone', 15.4, 0, 1, 4);
      b.brick('wood', 23.6, 0, 1, 4);
      b.pig('medium', 25, 0);
    } },
    'Royal Palace': { pref: ['blue', 'yellow', 'black', 'red', 'big', 'white', 'red', 'yellow'], build: (b) => {
      const y = b.building(20, 0, 5, [
        { m: 'stone', roof: 'wood', pigs: ['small', null, 'helmet', null, 'small'] },
        { m: 'wood', pigs: [null, 'medium', null, 'medium', null] },
        { n: 3, m: 'glass', pigs: ['small', null, 'small'] },
      ]);
      const k = b.frame('wood', 20, y, XL, 2.2);
      b.pig('king', 20, y);
      b.crenels('stone', 20, k, XL);
      b.tower(13.6, 0, [{ m: 'wood', pig: 'small' }, { m: 'glass' }]);
      b.tower(26.4, 0, [{ m: 'wood', pig: 'small' }, { m: 'glass' }]);
    } },
    'Pig Mansion': { pref: ['yellow', 'blue', 'black', 'red', 'white', 'big', 'yellow', 'red'], build: (b) => {
      const y = b.building(20, 0, 6, [
        { m: 'stone', roof: 'wood', pigs: ['small', null, 'helmet', 'helmet', null, 'small'] },
        { m: 'wood', pigs: [null, 'medium', null, null, 'medium', null] },
        { m: 'glass', pigs: ['small', null, 'small', 'small', null, 'small'] },
        { n: 4, m: 'wood', pigs: [null, 'medium', 'medium', null] },
      ]);
      b.tri('wood', 18.24, y, 2 * L, 1.0); b.tri('wood', 21.76, y, 2 * L, 1.0);
      b.cube('tnt', 15.6, 1.98); b.cube('tnt', 24.4, 1.98);
    } },
    'Pig Metropolis': { pref: ['yellow', 'blue', 'black', 'red', 'white', 'big', 'black', 'red'], build: (b) => {
      b.tower(13.5, 0, [{ m: 'stone', roof: 'wood', pig: 'helmet' }, { m: 'wood' }, { m: 'wood', pig: 'small' }]);
      b.building(16.8, 0, 2, [
        { m: 'wood', post: 'stone', pigs: ['helmet', null] }, { m: 'wood', pigs: [null, 'small'] },
        { m: 'glass' }, { m: 'wood', pigs: ['medium', null] },
      ]);
      b.cube('tnt', 19.15, 0);
      const y = b.building(22.4, 0, 3, [
        { m: 'stone', roof: 'wood', pigs: ['helmet', null, 'helmet'] },
        { m: 'wood', pigs: [null, 'medium', null] },
        { m: 'glass', pigs: ['small', null, 'small'] },
      ]);
      b.tri('wood', 22.4, y, 3 * L, 1.2);
      b.cube('tnt', 25.65, 0);
      b.tower(27.2, 0, [{ m: 'stone', roof: 'wood', pig: 'helmet' }, { m: 'stone', roof: 'wood' }, { m: 'wood', pig: 'small' }]);
    } },
    'Skyline': { pref: ['yellow', 'black', 'blue', 'red', 'big', 'red', 'white', 'yellow'], build: (b) => {
      b.tower(13.8, 0, [{ m: 'wood', pig: 'small' }, { m: 'wood' }, { m: 'wood', pig: 'small' }, { m: 'wood' }]);
      b.building(17.3, 0, 2, [
        { m: 'stone', roof: 'wood', pigs: ['helmet', null] }, { m: 'wood', pigs: [null, 'small'] }, { m: 'glass' },
        { m: 'wood', pigs: ['small', null] }, { m: 'wood', pigs: [null, 'small'] },
      ]);
      b.cube('tnt', 19.7, 0);
      b.building(23, 0, 3, [
        { m: 'stone', roof: 'wood', pigs: ['helmet', null, 'helmet'] },
        { m: 'wood', pigs: [null, 'medium', null] },
        { m: 'glass', pigs: ['small', null, 'small'] },
      ]);
      b.tower(27.2, 0, [{ m: 'stone', roof: 'wood', pig: 'helmet' }, { m: 'stone', roof: 'wood', pig: 'small' }]);
    } },
    'Siege Castle': { pref: ['black', 'yellow', 'big', 'blue', 'red', 'white', 'black', 'red'], build: (b) => {
      b.keep(14.5, 0, { m: 'stone', floors: 3, roof: 'wood', pigs: ['small', 'helmet', 'small'] });
      b.brick('stone', 16.6, 0, 1, 6);
      const y = b.building(20.2, 0, 3, [
        { m: 'stone', roof: 'wood', pigs: ['helmet', 'helmet', 'helmet'] },
        { m: 'wood', post: 'stone', pigs: [null, 'small', null] },
        { n: 2, m: 'wood', pigs: ['small', 'small'] },
      ]);
      const k = b.frame('stone', 20.2, y, XL, 2.2);
      b.pig('king', 20.2, y);
      b.crenels('wood', 20.2, k, XL);
      b.brick('stone', 23.8, 0, 1, 6);
      b.keep(25.9, 0, { m: 'stone', floors: 3, roof: 'wood', pigs: ['helmet', 'small', 'small'] });
    } },
    "King's Last Stand": { pref: ['red', 'blue', 'yellow', 'black', 'white', 'big', 'black', 'red'], build: (b) => {
      const h = b.mesa(14.5, 27.5, 2.0);
      b.keep(15.6, h, { m: 'stone', floors: 3, roof: 'wood', pigs: ['helmet', 'small', 'small'] });
      b.brick('stone', 17.5, h, 1, 5);
      const y = b.building(21, h, 3, [
        { m: 'stone', roof: 'wood', pigs: ['helmet', 'helmet', 'helmet'] },
        { m: 'wood', post: 'stone', pigs: ['small', null, 'small'] },
        { n: 2, m: 'wood', post: 'stone', pigs: ['small', 'small'] },
      ]);
      const k = b.frame('stone', 21, y, XL, 2.2);
      b.pig('king', 21, y);
      b.crenels('stone', 21, k, XL);
      b.brick('stone', 24.5, h, 1, 5);
      b.keep(26.4, h, { m: 'stone', floors: 3, roof: 'wood', pigs: ['small', 'helmet', 'small'] });
      b.cube('tnt', 12.3, 0);
    } },
  };

  const ISLAND_BIRDS = [
    ['Pyramid Temple', 4], ['Twin Spires', 3],
    ['Wooden Village', 5], ['Hill Village', 6],
    ['Harbor Docks', 5], ['Crystal Tower', 4],
    ['Pig Mansion', 5], ['Glass Gardens', 4],
    ['The Vault', 3], ['Grand Bridge', 6],
    ['Tower of Doom', 4], ['Mountain Keep', 6],
    ['Stonehenge', 5], ['Fortress Ring', 3],
    ['Brick Barracks', 5], ['Ice Fortress', 3],
    ['Floating Citadel', 6], ['Market Square', 5],
    ['Cliff Castle', 5], ['Watchtower Ridge', 6],
    ['Stone Gate', 4], ['Royal Palace', 5],
    ['Bunker Complex', 3], ['Pig Metropolis', 5],
    ['Hilltop Fortress', 4], ['Skyline', 5],
    ['Lumber Yard', 4], ['Underground Lair', 5],
    ['Siege Castle', 7], ["King's Last Stand", 6],
  ];

  ISLAND_BIRDS.forEach(([name, n], i) => {
    const d = ISLAND_DESIGNS[name];
    island.push(level({ id: '1-' + (11 + i), rev: 2, name, pref: d.pref, birds: d.pref.slice(0, n) }, d.build));
  });

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

  // ---------- 3-7 to 3-26: big buildings ----------
  // Same scheme as Pig Island: designs + an order with tuned bird counts and goal %.
  const DEMO_DESIGNS = {
    'Row Houses': { pref: ['red', 'yellow', 'yellow', 'red', 'yellow', 'black'], build: (b) => {
      b.house(13.6, 0, { m: 'wood' });
      b.house(15.6, 0, { m: 'wood', top: 'glass' });
      const y = b.building(19.4, 0, 2, [{ m: 'wood' }, { m: 'wood' }]);
      b.tri('wood', 18.52, y, 1.4, 0.7); b.tri('wood', 20.28, y, 1.4, 0.7);
      b.brick('wood', 23, 0, 2, 4);
      b.house(25.4, 0, { m: 'wood', w: XL });
    } },
    'Water Works': { pref: ['yellow', 'red', 'black', 'yellow', 'red'], build: (b) => {
      for (const x of [16, 22.6]) {
        let y = b.tower(x, 0, [{ m: 'wood', w: XL }, { m: 'wood', w: XL }]);
        y = b.wall('glass', x, y, 3, 2);
        b.tri('wood', x, b.plank('wood', x, y, XL), XL, 0.8);
      }
      b.house(19.3, 0, { m: 'wood' });
      b.brick('wood', 25.6, 0, 1, 3);
    } },
    'Big Warehouse': { pref: ['red', 'yellow', 'black', 'red', 'yellow'], build: (b) => {
      const y = b.building(20, 0, 6, [{ m: 'wood' }, { m: 'wood' }]);
      b.cube('tnt', 17.36, 0); b.cube('tnt', 22.64, 0);
      for (let i = 0; i < 6; i++) b.tri('wood', 15.6 + i * L, y, 1.4, 0.7);
    } },
    'The Bridge': { pref: ['red', 'yellow', 'black', 'red', 'yellow'], build: (b) => {
      const h = b.cliff(13, 16.5, 2.5);
      b.cliff(23.5, 27, 2.5);
      b.brick('stone', 20, 0, 1, 5, 0.5);
      const d = b.plank('wood', 18.09, h, 3.78);
      b.plank('wood', 21.91, h, 3.78);
      b.frame('glass', 17.4, d); b.frame('wood', 20, d); b.frame('glass', 22.6, d);
      b.crenels('wood', 14.75, b.tower(14.75, h, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }]), L);
      b.crenels('wood', 25.25, b.tower(25.25, h, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }]), L);
    } },
    'Great Pyramid': { pref: ['big', 'black', 'yellow', 'red', 'black'], build: (b) => {
      const y = b.pyramid(['stone', 'stone', 'wood', 'wood', 'wood', 'glass', 'glass', 'glass'], 20, 0, 8);
      b.tri('wood', 20, y, M, 0.7);
    } },
    'Stadium': { pref: ['red', 'yellow', 'black', 'blue', 'red'], build: (b) => {
      const mats = ['stone', 'wood', 'wood', 'glass', 'glass'];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5 - r; c++) { b.cube(mats[r], 13.44 + c * M, r * M); b.cube(mats[r], 26.56 - c * M, r * M); }
      }
      const t = b.frame('glass', 20, 0, XL);
      const u = b.frame('glass', 20, t, XL);
      b.tri('wood', 20, b.plank('wood', 20, u, XL), XL, 0.7);
    } },
    'Viaduct': { pref: ['black', 'big', 'red', 'black', 'yellow'], build: (b) => {
      for (const x of [14.6, 17.3, 20, 22.7]) b.frame('stone', x, 0, XL);
      for (const x of [15.95, 18.65, 21.35]) b.frame('stone', x, 1.98);
      for (const x of [17.3, 20]) b.crenels('stone', x, b.frame('stone', x, 3.96, XL), XL);
    } },
    'Hilltop Hotel': { pref: ['yellow', 'red', 'black', 'red', 'yellow'], build: (b) => {
      const h = b.mesa(15.5, 26, 2.5);
      const y = b.building(21, h, 4, [{ m: 'wood', post: 'stone' }, { m: 'wood' }, { m: 'glass' }]);
      for (const x of [18.36, 20.12, 21.88, 23.64]) b.tri('wood', x, y, 1.4, 0.7);
      b.keep(16.4, h, { m: 'wood', floors: 2 });
    } },
    'Crate Warehouse': { pref: ['red', 'black', 'yellow', 'red', 'black'], build: (b) => {
      const mats = ['wood', 'glass', 'wood', 'stone', 'wood'];
      b.wall((c, r) => (r === 0 ? 'stone' : (c * 5 + r * 3) % 9 === 0 ? 'tnt' : mats[(c + r) % 5]), 19.5, 0, 8, 5);
    } },
    'Twin Towers': { pref: ['yellow', 'black', 'red', 'blue', 'big', 'red'], build: (b) => {
      const mats = [['stone', 'wood'], ['wood'], ['glass'], ['wood'], ['glass'], ['wood']];
      let y = 0;
      for (const x of [16.8, 22.2]) y = b.tower(x, 0, mats.map(([m, roof]) => ({ m, roof, w: XL })));
      const d = b.plank('wood', 19.5, y, 5.4);
      b.frame('glass', 19.5, d);
    } },
    'Factory': { pref: ['black', 'yellow', 'red', 'big', 'black'], build: (b) => {
      const y = b.building(18.5, 0, 4, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }]);
      b.brick('stone', 15.86, y, 1, 6); b.brick('stone', 19.38, y, 1, 6);
      b.cube('tnt', 22.6, 0);
      b.stack('glass', 24, 0, 4);
      b.ball('stone', 24, 4 * M, 0.42);
    } },
    'Clock Tower': { pref: ['yellow', 'red', 'black', 'big', 'yellow'], build: (b) => {
      const y = b.tower(20, 0, [
        { m: 'stone', w: XL, roof: 'wood' }, { m: 'stone', w: XL, roof: 'wood' },
        { m: 'wood' }, { m: 'wood' }, { m: 'glass' }, { m: 'wood' }, { m: 'glass' }, { m: 'wood' },
      ]);
      b.tri('wood', 20, y, L, 1.0);
      b.building(15.5, 0, 2, [{ m: 'wood' }, { m: 'wood' }]);
      b.building(24.5, 0, 2, [{ m: 'wood' }, { m: 'glass' }]);
    } },
    'Ziggurat': { pref: ['big', 'black', 'black', 'red', 'yellow'], build: (b) => {
      const rows = ['stone', 'stone', 'stone', 'wood', 'wood', 'wood', 'glass'];
      rows.forEach((m, r) => b.wall(m, 20, r * M, 9 - r, 1));
      b.tri('wood', 20, b.frame('wood', 20, rows.length * M), L, 0.9);
    } },
    'Apartment Block': { pref: ['yellow', 'black', 'big', 'red', 'yellow'], build: (b) => {
      const y = b.building(19.5, 0, 4, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }, { m: 'glass' }, { m: 'wood' }, { m: 'glass' }]);
      b.tri('wood', 17.74, y, 2 * L, 0.9); b.tri('wood', 21.26, y, 2 * L, 0.9);
    } },
    'Glass Office': { pref: ['blue', 'blue', 'red', 'blue', 'yellow'], build: (b) => {
      b.brick('glass', 14.6, 0, 1, 4);
      b.building(19.5, 0, 4, [{ m: 'stone', roof: 'glass' }, { m: 'glass' }, { m: 'glass' }, { m: 'glass' }]);
      b.brick('glass', 24.4, 0, 1, 4);
    } },
    'Stone Fortress': { pref: ['black', 'black', 'big', 'big', 'black'], build: (b) => {
      b.crenels('stone', 15.6, b.brick('stone', 15.6, 0, 2, 7), 2 * M);
      b.crenels('stone', 20, b.keep(20, 0, { m: 'stone', w: XL, roof: 'stone', crenels: false }), XL);
      b.cube('tnt', 20, 0);
      b.crenels('stone', 24.4, b.brick('stone', 24.4, 0, 2, 7), 2 * M);
    } },
    'Mega Block': { pref: ['big', 'black', 'yellow', 'red', 'black', 'yellow'], build: (b) => {
      const y = b.building(20, 0, 5, [
        { m: 'stone', roof: 'wood' }, { m: 'wood', post: 'stone' }, { m: 'wood' }, { m: 'glass' },
      ]);
      b.cube('tnt', 18.24, 0); b.cube('tnt', 21.76, 1.98);
      for (const x of [16.48, 20, 23.52]) b.tri('wood', x, y, 1.4, 0.8);
    } },
    'Downtown': { pref: ['yellow', 'black', 'blue', 'red', 'big', 'yellow'], build: (b) => {
      b.tower(13.6, 0, [{ m: 'wood' }, { m: 'wood' }, { m: 'wood' }, { m: 'wood' }]);
      b.building(17, 0, 2, [{ m: 'glass' }, { m: 'glass' }, { m: 'glass' }]);
      b.cube('tnt', 19.4, 0);
      b.building(22.2, 0, 2, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }, { m: 'glass' }, { m: 'wood' }]);
      b.tower(25.6, 0, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }, { m: 'wood' }]);
    } },
    'Castle': { pref: ['black', 'big', 'yellow', 'red', 'black', 'big'], build: (b) => {
      b.keep(14.4, 0, { m: 'stone', roof: 'wood' });
      b.brick('stone', 16.9, 0, 2, 6);
      b.crenels('wood', 20, b.building(20, 0, 2, [{ m: 'wood', post: 'stone' }, { m: 'wood' }, { m: 'glass' }]), 2 * L);
      b.brick('stone', 23.1, 0, 2, 6);
      b.keep(25.6, 0, { m: 'stone', roof: 'wood' });
    } },
    'Grand Finale': { pref: ['red', 'yellow', 'blue', 'black', 'white', 'big', 'black'], build: (b) => {
      b.tower(13.4, 0, [{ m: 'wood' }, { m: 'wood' }, { m: 'wood' }, { m: 'wood' }]);
      b.building(16.6, 0, 2, [{ m: 'glass' }, { m: 'wood' }, { m: 'glass' }, { m: 'wood' }, { m: 'glass' }]);
      b.cube('tnt', 18.95, 0);
      const y = b.building(22.2, 0, 3, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }, { m: 'glass' }, { m: 'wood' }]);
      b.tri('wood', 22.2, y, 3 * L, 1.1);
      b.cube('tnt', 25.4, 0);
      b.keep(27.2, 0, { m: 'stone', floors: 3, roof: 'wood' });
    } },
  };

  // [design, birds, goal %] - tuned with tools/difficulty.js for a steady climb
  const DEMO_ORDER = [
    ['Big Warehouse', 4, 60], ['Water Works', 4, 64], ['Crate Warehouse', 3, 93], ['Viaduct', 4, 57],
    ['Row Houses', 5, 55], ['Great Pyramid', 5, 55], ['Mega Block', 3, 95], ['The Bridge', 5, 55],
    ['Hilltop Hotel', 4, 71], ['Twin Towers', 3, 95], ['Clock Tower', 4, 87], ['Factory', 4, 72],
    ['Stadium', 5, 60], ['Ziggurat', 4, 55], ['Apartment Block', 3, 95], ['Downtown', 4, 90],
    ['Glass Office', 4, 90], ['Stone Fortress', 4, 86], ['Castle', 4, 66], ['Grand Finale', 4, 87],
  ];

  DEMO_ORDER.forEach(([name, n, pct], i) => {
    const d = DEMO_DESIGNS[name];
    demo.push(level({ id: '3-' + (7 + i), rev: 2, name, pref: d.pref, birds: d.pref.slice(0, n), objective: { type: 'demolish', pct } }, d.build));
  });


  // ---------- generated levels (js/levelgen.js) ----------
  // Each entry is [seed, birds] (plus goal % for Demolition). The seed decides the whole
  // structure; the bird count and goal were tuned with tools/difficulty.js, and each list
  // is ordered from easier to harder.
  const GEN_ISLAND = [
  ];
  const GEN_SPACE = [
  ];
  const GEN_DEMO = [
  ];

  const usedNames = new Set([...island, ...space, ...demo].map(l => l.name));
  function genName(g) {
    let name = g.names.find(n => !usedNames.has(n));
    for (let k = 2; !name; k++) if (!usedNames.has(g.names[0] + ' ' + k)) name = g.names[0] + ' ' + k;
    usedNames.add(name);
    return name;
  }
  function genLevel(def, g, n) {
    return level(Object.assign(def, { name: genName(g) }), (b, d) => { g.build(b, d); d.pref = g.pref; d.birds = g.pref.slice(0, n); });
  }
  GEN_ISLAND.forEach(([seed, n]) => island.push(genLevel({ id: '1-' + (island.length + 1), gen: seed }, LevelGen.islandLevel(seed), n)));
  GEN_SPACE.forEach(([seed, n]) => space.push(genLevel({ id: '2-' + (space.length + 1), gen: seed, space: true }, LevelGen.spaceLevel(seed, onPlanet), n)));
  GEN_DEMO.forEach(([seed, n, pct]) => demo.push(genLevel({ id: '3-' + (demo.length + 1), gen: seed, objective: { type: 'demolish', pct } }, LevelGen.demoLevel(seed), n)));

  const worlds = [
    { id: 1, name: 'Pig Island', desc: 'Classic slingshot. Pop every pig!', theme: 'island', levels: island },
    { id: 2, name: 'Space Hogs', desc: 'Planets bend your shots. Use their gravity!', theme: 'space', levels: space },
    { id: 3, name: 'Demolition Crew', desc: 'No pigs, just wreck the building.', theme: 'demo', levels: demo },
  ];
  worlds.helpers = { builder, onPlanet, level };
  return worlds;
});
