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

    // ---------- 1-11 to 1-40: bigger, more complex forts ----------
    level({ id: '1-11', name: 'Row Houses', birds: ['red', 'red', 'yellow'] }, (b) => {
      b.house(15, 0, { m: 'wood', pig: 'small' });
      b.house(18, 0, { m: 'wood', top: 'glass', pig: 'small' });
      b.house(21, 0, { m: 'glass', top: 'wood', pig: 'medium' });
      b.house(24, 0, { m: 'wood', w: XL, pig: 'medium' });
    }),

    level({ id: '1-12', name: 'Greenhouse', birds: ['blue', 'blue', 'blue', 'red'] }, (b) => {
      const y = b.building(19, 0, 3, [
        { m: 'glass', pigs: ['small', 'small', 'small'] },
        { m: 'glass', pigs: [null, 'small', null] },
      ]);
      b.tri('glass', 19, y, 3 * L, 1.1);
      b.frame('wood', 24, 0); b.pig('small', 24, 0);
    }),

    level({ id: '1-13', name: 'Bunker Line', birds: ['black', 'red', 'yellow'] }, (b) => {
      b.bunker(15.5, 0, { pig: 'medium', roof: 'wood' });
      const y = b.bunker(19.5, 0, { pig: 'helmet' });
      b.pig('small', 19.5, y);
      b.bunker(23.5, 0, { m: 'wood', pig: 'medium' });
    }),

    level({ id: '1-14', name: 'Tall Order', birds: ['yellow', 'red', 'blue'] }, (b) => {
      b.tower(16.5, 0, [{ m: 'stone', roof: 'wood' }, { m: 'wood', pig: 'small' }, { m: 'glass' }, { m: 'wood', pig: 'small' }, { m: 'glass', pig: 'small' }]);
      b.cube('stone', 18.25, 0);
      b.building(21, 0, 2, [{ m: 'wood', post: 'stone', pigs: ['medium', null] }, { m: 'glass', pigs: [null, 'small'] }, { m: 'wood' }]);
    }),

    level({ id: '1-15', name: 'Mesa Fort', birds: ['yellow', 'black', 'red', 'blue'] }, (b) => {
      const h = b.mesa(16, 25, 2.5);
      b.building(19.2, h, 2, [{ m: 'stone', roof: 'wood', pigs: ['small', 'medium'] }, { m: 'wood', pigs: ['small', null] }]);
      b.keep(23, h, { m: 'wood', floors: 1, pigs: ['helmet'] });
      b.pig('small', 13, 0);
    }),

    level({ id: '1-16', name: 'Rolling Stones', birds: ['red', 'yellow', 'red', 'blue'] }, (b) => {
      const y = b.bays(18.5, 0, 3, { m: 'wood', pigs: ['small', 'medium', 'small'] });
      for (const x of [16.74, 18.5, 20.26]) {
        b.cube('wood', x - 0.65, y, S); b.cube('wood', x + 0.65, y, S);
        b.ball('stone', x, y, 0.42);
      }
      b.frame('glass', 24, 0, XL); b.pig('large', 24, 0);
    }),

    level({ id: '1-17', name: 'Gatehouse', birds: ['black', 'red', 'yellow', 'red'] }, (b) => {
      b.keep(15.5, 0, { m: 'stone', roof: 'wood', pigs: ['helmet', 'small'] });
      const y = b.bays(19, 0, 2, { m: 'wood', pigs: ['small', 'small'] });
      b.bays(19, y, 2, { m: 'glass', pigs: [null, 'medium'] });
      b.keep(22.5, 0, { m: 'stone', roof: 'wood', pigs: ['small', 'helmet'] });
    }),

    level({ id: '1-18', name: 'Ice Palace', birds: ['blue', 'blue', 'white'] }, (b) => {
      const y = b.building(19, 0, 3, [
        { m: 'glass', post: 'wood', pigs: ['small', 'medium', 'small'] },
        { n: 2, m: 'glass', pigs: ['small', 'small'] },
        { n: 1, m: 'glass', pigs: ['small'] },
      ]);
      b.tri('glass', 19, y, L, 1.0);
      b.tri('glass', 16.75, 1.98, 0.7, 0.6); b.tri('glass', 21.25, 1.98, 0.7, 0.6);
    }),

    level({ id: '1-19', name: 'TNT Warehouse', birds: ['red', 'yellow', 'red'] }, (b) => {
      const y = b.building(18.5, 0, 3, [{ m: 'wood', pigs: ['small', null, 'small'] }, { m: 'wood', pigs: [null, 'medium', null] }]);
      b.cube('tnt', 18.5, 0);
      b.cube('tnt', 16.74, y); b.cube('tnt', 20.26, y);
      const t = b.bunker(24.2, 0, { m: 'wood', pig: 'small' });
      b.cube('tnt', 24.2, t);
    }),

    level({ id: '1-20', name: 'Hilltop Keep', birds: ['big', 'black', 'yellow', 'red'] }, (b) => {
      const h = b.mesa(17.5, 25.5, 3);
      b.keep(21.5, h, { m: 'stone', w: XL, h: 2.2, roof: 'wood', pigs: ['helmet', 'king'] });
      b.house(18.6, h, { m: 'wood', pig: 'small' });
      b.house(24.4, h, { m: 'glass', top: 'wood', pig: 'small' });
    }),

    level({ id: '1-21', name: 'Twin Bridges', birds: ['yellow', 'blue', 'red', 'black'] }, (b) => {
      const y = b.tower(15.5, 0, [{ m: 'wood', pig: 'small' }, { m: 'wood' }, { m: 'stone', roof: 'wood' }]);
      b.tower(22.5, 0, [{ m: 'wood', pig: 'small' }, { m: 'wood' }, { m: 'stone', roof: 'wood' }]);
      const d = b.plank('wood', 19, y, 7.0);
      b.frame('glass', 17.8, d); b.pig('small', 17.8, d);
      b.frame('glass', 20.2, d); b.pig('small', 20.2, d);
      b.bunker(19, 0, { m: 'wood', s: S, rows: 3, pig: 'medium' });
    }),

    level({ id: '1-22', name: 'Fortress Walls', birds: ['black', 'big', 'red', 'yellow'] }, (b) => {
      const w = b.wall('stone', 15.5, 0, 2, 3);
      b.crenels('stone', 15.5, w, 2 * M);
      b.building(20.5, 0, 3, [
        { m: 'wood', post: 'stone', pigs: ['small', 'helmet', 'small'] },
        { m: 'glass', pigs: [null, 'small', null] },
      ]);
      b.stack('stone', 25, 0, 2);
      b.pig('medium', 26.3, 0);
    }),

    level({ id: '1-23', name: 'Pagoda', birds: ['red', 'yellow', 'blue', 'white'] }, (b) => {
      const y = b.building(19, 0, 3, [
        { m: 'wood', pigs: ['small', 'medium', 'small'] },
        { n: 2, m: 'wood', pigs: ['small', 'small'] },
        { n: 1, m: 'wood', pigs: ['medium'] },
      ]);
      b.tri('wood', 19, y, L, 1.0);
      b.tri('glass', 16.75, 1.98, 0.7, 0.6); b.tri('glass', 21.25, 1.98, 0.7, 0.6);
      b.tri('glass', 17.65, 3.96, 0.7, 0.6); b.tri('glass', 20.35, 3.96, 0.7, 0.6);
    }),

    level({ id: '1-24', name: 'Cliffside', birds: ['yellow', 'red', 'black', 'red'] }, (b) => {
      const h = b.cliff(20, 29.5, 4);
      b.building(23.5, h, 2, [{ m: 'wood', pigs: ['small', 'medium'] }, { m: 'glass', pigs: ['small', null] }]);
      b.keep(27.5, h, { m: 'stone', floors: 1, roof: 'wood', pigs: ['helmet'] });
      b.frame('wood', 18, 0); b.pig('small', 18, 0);
    }),

    level({ id: '1-25', name: 'Floating Isles', birds: ['red', 'yellow', 'blue', 'red'] }, (b) => {
      const a = b.rock(14, 17, 2.6, 3.2);
      b.frame('wood', 15.5, a); b.pig('small', 15.5, a);
      const c = b.rock(19, 22.5, 5.4, 6.0);
      b.house(20.75, c, { m: 'glass', top: 'wood', pig: 'small' });
      b.frame('glass', 20.75, 0); b.pig('medium', 20.75, 0);
      const e = b.rock(24.5, 27.5, 1.8, 2.4);
      b.bunker(26, e, { m: 'wood', s: S, rows: 3, pig: 'small' });
    }),

    level({ id: '1-26', name: 'Stonehenge', birds: ['big', 'black', 'red', 'yellow'] }, (b) => {
      for (const [x, pig] of [[15.5, 'medium'], [19.5, 'helmet'], [23.5, 'medium']]) {
        const y = b.frame('stone', x, 0, XL);
        b.pig(pig, x, 0);
        if (x === 19.5) { b.frame('wood', x, y); b.pig('small', x, y); }
        else { b.cube('stone', x - 0.65, y, S); b.cube('stone', x + 0.65, y, S); b.ball('stone', x, y, 0.42); }
      }
    }),

    level({ id: '1-27', name: 'Domino Effect', birds: ['red', 'red', 'yellow'] }, (b) => {
      for (const x of [14, 15.2, 16.4, 17.6, 18.8]) b.box('wood', x, 0, T, 2.2);
      b.building(21.8, 0, 2, [{ m: 'glass', pigs: ['small', 'small'] }]);
      b.keep(25.5, 0, { m: 'stone', floors: 1, roof: 'wood', pigs: ['helmet'] });
    }),

    level({ id: '1-28', name: 'Pig City', birds: ['yellow', 'black', 'blue', 'red', 'red'] }, (b) => {
      b.tower(14.8, 0, [{ m: 'wood', pig: 'small' }, { m: 'wood', pig: 'small' }, { m: 'wood' }]);
      b.building(18.6, 0, 2, [
        { m: 'glass', pigs: ['small', null] }, { m: 'glass', pigs: [null, 'small'] },
        { m: 'glass' }, { m: 'glass', pigs: ['small', null] },
      ]);
      b.cube('tnt', 21.3, 0);
      b.building(24.2, 0, 2, [{ m: 'stone', roof: 'wood', pigs: ['helmet', 'medium'] }, { m: 'wood', pigs: [null, 'small'] }]);
    }),

    level({ id: '1-29', name: 'The Vault', birds: ['black', 'big', 'red'] }, (b) => {
      for (const [x, pig] of [[17.5, 'helmet'], [22.5, 'medium']]) {
        b.wall('stone', x, 0, 4, 1);
        b.stack('stone', x - 1.5 * M, M, 2); b.stack('stone', x + 1.5 * M, M, 2);
        b.pig(pig, x, M);
        const y = b.plank('stone', x, 3 * M, 4 * M);
        b.cube('tnt', x, y);
        if (x > 20) { b.cube('wood', x - 1.2, y); b.cube('wood', x + 1.2, y); b.plank('wood', x, y + M, 3.3); b.pig('small', x, y + M + T); }
      }
    }),

    level({ id: '1-30', name: 'Siege Castle', birds: ['red', 'black', 'yellow', 'blue', 'big'] }, (b) => {
      b.keep(14.5, 0, { m: 'stone', roof: 'wood', pigs: ['small', 'helmet'] });
      b.stack('stone', 16.6, 0, 3);
      const y = b.building(20.2, 0, 3, [
        { m: 'stone', roof: 'wood', pigs: ['medium', 'helmet', 'medium'] },
        { m: 'wood', pigs: [null, 'small', null] },
      ]);
      const k = b.frame('wood', 20.2, y, XL, 2.2);
      b.pig('king', 20.2, y);
      b.crenels('wood', 20.2, k, XL);
      b.stack('stone', 23.8, 0, 3);
      b.keep(25.9, 0, { m: 'stone', roof: 'wood', pigs: ['helmet', 'small'] });
    }),

    level({ id: '1-31', name: 'Skyline', birds: ['yellow', 'yellow', 'black', 'red', 'blue'] }, (b) => {
      b.tower(14.5, 0, [{ m: 'wood', pig: 'small' }, { m: 'wood' }, { m: 'wood', pig: 'small' }]);
      b.tower(17.6, 0, [{ m: 'glass' }, { m: 'wood', pig: 'small' }, { m: 'glass' }, { m: 'wood' }, { m: 'glass', pig: 'small' }]);
      b.building(21.3, 0, 2, [
        { m: 'stone', roof: 'wood', pigs: ['medium', null] }, { m: 'wood', pigs: [null, 'small'] },
        { m: 'glass', pigs: ['small', null] }, { m: 'wood' },
      ]);
      b.tower(24.8, 0, [{ m: 'stone', roof: 'wood', pig: 'helmet' }, { m: 'stone', roof: 'wood', pig: 'helmet' }]);
    }),

    level({ id: '1-32', name: 'Crate Mountain', birds: ['red', 'black', 'yellow'] }, (b) => {
      const y = b.building(19.5, 0, 4, [
        { m: 'wood', post: 'stone', roof: 'stone', pigs: ['small', null, 'medium', null] },
        { n: 3, m: 'wood', pigs: [null, 'small', null] },
        { n: 2, m: 'glass', pigs: ['small', 'small'] },
        { n: 1, m: 'wood', pigs: ['medium'] },
      ]);
      b.tri('wood', 19.5, y, L, 0.9);
      b.cube('wood', 15.3, 0); b.cube('wood', 23.7, 0);
    }),

    level({ id: '1-33', name: 'Sky Bridge', birds: ['yellow', 'blue', 'red', 'black', 'red'] }, (b) => {
      const h = b.mesa(13, 16, 3, 1.4);
      b.mesa(23, 26, 3, 1.4);
      const y = b.tower(14.5, h, [{ m: 'wood', pig: 'small' }, { m: 'stone', roof: 'wood' }]);
      b.tower(24.5, h, [{ m: 'wood', pig: 'small' }, { m: 'stone', roof: 'wood' }]);
      const d = b.plank('wood', 19.5, y, 10.4);
      b.frame('glass', 17.5, d); b.pig('small', 17.5, d);
      b.pig('medium', 19.5, d);
      b.frame('glass', 21.5, d); b.pig('small', 21.5, d);
      b.bunker(19.5, 0, { m: 'stone', pig: 'medium', roof: 'wood' });
    }),

    level({ id: '1-34', name: 'Underground', birds: ['white', 'white', 'black', 'red', 'black'] }, (b) => {
      const h = b.cliff(14, 17, 3);
      b.cliff(22, 26, 3);
      const r = b.plank('stone', 19.5, h, 5.4);
      b.plank('wood', 19.5, r, 5.4);
      b.pig('medium', 17.7, 0);
      b.frame('wood', 19.5, 0); b.pig('small', 19.5, 0);
      b.pig('medium', 21.3, 0);
      b.house(15.5, h, { m: 'wood', pig: 'small' });
      b.house(24, h, { m: 'glass', top: 'wood', pig: 'small' });
    }),

    level({ id: '1-35', name: 'Fort Knox', birds: ['blue', 'yellow', 'black', 'big', 'red'] }, (b) => {
      b.stack('glass', 14.8, 0, 3);
      b.stack('wood', 16.4, 0, 4);
      const y = b.keep(19.5, 0, { m: 'stone', w: XL, h: 2.2, floors: 1, roof: 'stone', pigs: ['king'], crenels: false });
      b.house(19.5, y, { m: 'wood', pig: 'helmet' });
      b.stack('wood', 22.6, 0, 4);
      b.stack('glass', 24.2, 0, 3);
    }),

    level({ id: '1-36', name: 'Watchtowers', birds: ['yellow', 'red', 'blue', 'black', 'red', 'black'] }, (b) => {
      const a = b.rock(14, 16, -0.5, 2.0);
      b.tower(15, a, [{ m: 'wood', pig: 'small' }, { m: 'wood', pig: 'small' }]);
      const c = b.rock(18.5, 20.5, -0.5, 3.5);
      b.tower(19.5, c, [{ m: 'glass', pig: 'small' }, { m: 'wood', pig: 'small' }, { m: 'glass' }]);
      const e = b.rock(23, 25, -0.5, 1.0);
      b.tower(24, e, [{ m: 'wood', pig: 'helmet' }, { m: 'glass', pig: 'small' }]);
      b.cube('tnt', 22.2, 0);
    }),

    level({ id: '1-37', name: 'Balancing Act', birds: ['red', 'red', 'yellow', 'blue'] }, (b) => {
      const a = b.rock(18.6, 19.4, -0.5, 2.5);
      const p = b.plank('wood', 19, a, 4.4);
      b.frame('glass', 17.7, p); b.pig('small', 17.7, p);
      b.frame('glass', 20.3, p); b.pig('small', 20.3, p);
      const c = b.rock(23.6, 24.4, -0.5, 1.5);
      const q = b.plank('wood', 24, c, 3.52);
      b.cube('stone', 22.68, q); b.cube('stone', 25.32, q);
      b.pig('small', 24, q);
      b.plank('glass', 24, q + M, 3.52);
      b.frame('wood', 15, 0); b.pig('medium', 15, 0);
    }),

    level({ id: '1-38', name: 'The Citadel', birds: ['yellow', 'black', 'big', 'red', 'blue'] }, (b) => {
      const h1 = b.cliff(17, 28, 1.5);
      const h2 = b.cliff(21.5, 28, 3.0);
      b.house(15, 0, { m: 'wood', pig: 'small' });
      b.bays(19.2, h1, 2, { m: 'wood', pigs: ['small', 'medium'] });
      const y = b.keep(24.8, h2, { m: 'stone', w: XL, h: 2.2, floors: 1, roof: 'wood', pigs: ['king'] });
      b.cube('tnt', 22.3, h2);
      b.frame('glass', 27, h2, 1.4); b.pig('small', 27, h2);
    }),

    level({ id: '1-39', name: 'Pig Mansion', birds: ['yellow', 'blue', 'black', 'red', 'white', 'red'] }, (b) => {
      const y = b.building(20, 0, 5, [
        { m: 'stone', roof: 'wood', pigs: ['small', null, 'helmet', null, 'small'] },
        { m: 'wood', pigs: [null, 'medium', null, 'medium', null] },
        { m: 'glass', pigs: ['small', null, null, null, 'small'] },
      ]);
      b.tri('wood', 20, y, L, 1.0);
      b.cube('tnt', 18.24, y); b.cube('tnt', 21.76, y);
    }),

    level({ id: '1-40', name: "King's Last Stand", birds: ['red', 'blue', 'yellow', 'black', 'white', 'big'] }, (b) => {
      const h = b.mesa(15, 26, 2.0);
      b.keep(16.5, h, { m: 'stone', roof: 'wood', pigs: ['helmet', 'small'] });
      let y = b.building(20.5, h, 3, [
        { m: 'stone', roof: 'wood', pigs: ['medium', 'helmet', 'medium'] },
        { m: 'wood', pigs: ['small', null, 'small'] },
      ]);
      y = b.bays(20.5, y, 2, { m: 'glass', pigs: ['small', 'small'] });
      const k = b.frame('wood', 20.5, y, XL, 2.2);
      b.pig('king', 20.5, y);
      b.crenels('stone', 20.5, k, XL);
      b.keep(24.5, h, { m: 'stone', roof: 'wood', pigs: ['small', 'helmet'] });
      b.cube('tnt', 13.2, 0);
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

    // ---------- 3-7 to 3-26: bigger buildings ----------
    level({ id: '3-7', name: 'Two Story', birds: ['red', 'yellow', 'yellow'], objective: { type: 'demolish', pct: 65 } }, (b) => {
      const y = b.building(19, 0, 4, [{ m: 'wood' }, { m: 'wood' }]);
      for (const x of [16.36, 18.12, 19.88, 21.64]) b.tri('wood', x, y, 1.4, 0.7);
    }),

    level({ id: '3-8', name: 'Glass Office', birds: ['blue', 'red', 'blue'], objective: { type: 'demolish', pct: 85 } }, (b) => {
      b.building(19, 0, 3, [{ m: 'stone', roof: 'glass' }, { m: 'glass' }, { m: 'glass' }, { m: 'glass' }]);
    }),

    level({ id: '3-9', name: 'Stone Arches', birds: ['black', 'big', 'red'], objective: { type: 'demolish', pct: 60 } }, (b) => {
      for (const x of [15.5, 18.4, 21.3]) b.frame('stone', x, 0, XL);
      for (const x of [16.95, 19.85]) { const t = b.frame('stone', x, 1.98); b.crenels('stone', x, t, L); }
      const t = b.frame('stone', 18.4, 3.96, XL);
      b.crenels('stone', 18.4, t, XL);
    }),

    level({ id: '3-10', name: 'Crate Stack', birds: ['red', 'black', 'yellow', 'red'], objective: { type: 'demolish', pct: 75 } }, (b) => {
      const mats = ['wood', 'glass', 'wood', 'stone'];
      b.wall((c, r) => (r === 0 ? 'stone' : (c * 7 + r * 3) % 5 === 0 ? 'tnt' : mats[(c + r) % 4]), 19.5, 0, 6, 5);
    }),

    level({ id: '3-11', name: 'Water Tower', birds: ['yellow', 'red', 'black'], objective: { type: 'demolish', pct: 70 } }, (b) => {
      let y = b.tower(19.5, 0, [{ m: 'wood', w: XL }, { m: 'wood', w: XL }, { m: 'wood', w: XL }]);
      y = b.wall('glass', 19.5, y, 3, 2);
      y = b.plank('wood', 19.5, y, XL);
      b.tri('wood', 19.5, y, XL, 0.8);
      b.house(15.5, 0, { m: 'wood' });
      b.house(23.5, 0, { m: 'wood' });
    }),

    level({ id: '3-12', name: 'Twin Towers II', birds: ['yellow', 'black', 'red', 'blue', 'big'], objective: { type: 'demolish', pct: 85 } }, (b) => {
      const mats = [['stone', 'wood'], ['wood'], ['glass'], ['wood'], ['glass'], ['wood']];
      for (const x of [16.8, 22.2]) b.tower(x, 0, mats.map(([m, roof]) => ({ m, roof, w: XL })));
    }),

    level({ id: '3-13', name: 'Warehouse', birds: ['red', 'yellow', 'black', 'red'], objective: { type: 'demolish', pct: 70 } }, (b) => {
      const y = b.building(20, 0, 5, [{ m: 'wood' }, { m: 'wood' }]);
      b.cube('tnt', 18.24, 0); b.cube('tnt', 21.76, 0);
      for (const x of [16.48, 18.24, 20, 21.76, 23.52]) b.tri('wood', x, y, 1.4, 0.7);
    }),

    level({ id: '3-14', name: 'Big Pyramid', birds: ['big', 'black', 'yellow', 'red'], objective: { type: 'demolish', pct: 60 } }, (b) => {
      b.pyramid(['stone', 'stone', 'wood', 'wood', 'glass', 'glass', 'glass'], 20, 0, 7);
    }),

    level({ id: '3-15', name: 'Apartment Block', birds: ['yellow', 'black', 'big', 'red'], objective: { type: 'demolish', pct: 80 } }, (b) => {
      const y = b.building(19.5, 0, 3, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }, { m: 'glass' }, { m: 'wood' }, { m: 'glass' }]);
      b.tri('wood', 19.5, y, L, 0.9);
    }),

    level({ id: '3-16', name: 'Hilltop Hotel', birds: ['yellow', 'red', 'black', 'red'], objective: { type: 'demolish', pct: 65 } }, (b) => {
      const h = b.mesa(16, 25, 2.5);
      b.building(20.5, h, 4, [{ m: 'wood', post: 'stone' }, { m: 'wood' }, { m: 'glass' }]);
    }),

    level({ id: '3-17', name: 'Factory', birds: ['black', 'yellow', 'red', 'big'], objective: { type: 'demolish', pct: 70 } }, (b) => {
      const y = b.building(18.5, 0, 4, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }]);
      b.stack('stone', 15.86, y, 4, S); b.stack('stone', 19.38, y, 4, S);
      b.stack('glass', 24, 0, 4);
      b.ball('stone', 24, 4 * M, 0.42);
    }),

    level({ id: '3-18', name: 'The Bridge', birds: ['red', 'yellow', 'black'], objective: { type: 'demolish', pct: 70 } }, (b) => {
      const h = b.cliff(13, 16.5, 2.5);
      b.cliff(23.5, 27, 2.5);
      b.tower(20, 0, [{ m: 'wood', h: 2.28 }]);
      const d = b.plank('wood', 18.09, h, 3.78);
      b.plank('wood', 21.91, h, 3.78);
      b.frame('glass', 17.4, d); b.frame('wood', 20, d); b.frame('glass', 22.6, d);
      b.tower(14.75, h, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }]);
      b.tower(25.25, h, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }]);
    }),

    level({ id: '3-19', name: 'Ziggurat', birds: ['big', 'black', 'black', 'red'], objective: { type: 'demolish', pct: 55 } }, (b) => {
      const rows = ['stone', 'stone', 'wood', 'wood', 'glass'];
      rows.forEach((m, r) => b.wall(m, 20, r * M, 7 - r, 1));
      const t = b.frame('wood', 20, rows.length * M);
      b.tri('wood', 20, t, L, 0.9);
    }),

    level({ id: '3-20', name: 'Castle', birds: ['black', 'big', 'yellow', 'red', 'black'], objective: { type: 'demolish', pct: 65 } }, (b) => {
      b.keep(15.2, 0, { m: 'stone', roof: 'wood' });
      b.crenels('stone', 17.4, b.wall('stone', 17.4, 0, 2, 2), 2 * M);
      const g = b.building(20.6, 0, 2, [{ m: 'wood', post: 'stone' }, { m: 'wood' }]);
      b.crenels('wood', 20.6, g, 2 * L);
      b.crenels('stone', 23.8, b.wall('stone', 23.8, 0, 2, 2), 2 * M);
      b.keep(26, 0, { m: 'stone', roof: 'wood' });
    }),

    level({ id: '3-21', name: 'Clock Tower', birds: ['yellow', 'red', 'black', 'big'], objective: { type: 'demolish', pct: 75 } }, (b) => {
      const y = b.tower(20, 0, [
        { m: 'stone', w: XL, roof: 'wood' }, { m: 'stone', w: XL, roof: 'wood' },
        { m: 'wood' }, { m: 'wood' }, { m: 'glass' }, { m: 'wood' }, { m: 'glass' },
      ]);
      b.tri('wood', 20, y, L, 1.0);
      b.house(16, 0, { m: 'wood' });
      b.house(24, 0, { m: 'wood' });
    }),

    level({ id: '3-22', name: 'Stadium', birds: ['red', 'yellow', 'black', 'blue'], objective: { type: 'demolish', pct: 65 } }, (b) => {
      const mats = ['stone', 'wood', 'wood', 'glass'];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4 - r; c++) {
          b.cube(mats[r], 14.2 + c * M, r * M);
          b.cube(mats[r], 25.8 - c * M, r * M);
        }
      }
      const t = b.frame('glass', 20, 0, XL);
      b.frame('glass', 20, t, XL);
    }),

    level({ id: '3-23', name: 'Downtown', birds: ['yellow', 'black', 'blue', 'red', 'big'], objective: { type: 'demolish', pct: 70 } }, (b) => {
      b.tower(14.6, 0, [{ m: 'wood' }, { m: 'wood' }, { m: 'wood' }, { m: 'wood' }]);
      b.building(18, 0, 2, [{ m: 'glass' }, { m: 'glass' }, { m: 'glass' }]);
      b.cube('tnt', 20.5, 0);
      b.tower(22.5, 0, [{ m: 'stone', w: XL, roof: 'wood' }, { m: 'wood', w: XL }, { m: 'wood', w: XL }]);
      b.house(25.8, 0, { m: 'wood' });
    }),

    level({ id: '3-24', name: 'Stone Fortress', birds: ['black', 'black', 'big', 'big'], objective: { type: 'demolish', pct: 55 } }, (b) => {
      b.crenels('stone', 16, b.wall('stone', 16, 0, 2, 3), 2 * M);
      b.keep(19.5, 0, { m: 'stone', w: XL, roof: 'stone' });
      b.cube('tnt', 19.5, 0);
      b.crenels('stone', 23, b.wall('stone', 23, 0, 2, 3), 2 * M);
    }),

    level({ id: '3-25', name: 'Mega Block', birds: ['big', 'black', 'yellow', 'red', 'black'], objective: { type: 'demolish', pct: 75 } }, (b) => {
      const y = b.building(20, 0, 5, [
        { m: 'stone', roof: 'wood' }, { m: 'wood', post: 'stone' }, { m: 'wood' }, { m: 'glass' },
      ]);
      b.cube('tnt', 18.24, 0); b.cube('tnt', 21.76, 1.98);
      for (const x of [16.48, 20, 23.52]) b.tri('wood', x, y, 1.4, 0.8);
    }),

    level({ id: '3-26', name: 'Grand Finale', birds: ['red', 'yellow', 'blue', 'black', 'white', 'big'], objective: { type: 'demolish', pct: 75 } }, (b) => {
      b.tower(13.8, 0, [{ m: 'wood' }, { m: 'wood' }, { m: 'wood' }]);
      b.building(17.2, 0, 2, [{ m: 'glass' }, { m: 'wood' }, { m: 'glass' }, { m: 'wood' }]);
      b.cube('tnt', 19.7, 0);
      b.building(23, 0, 3, [{ m: 'stone', roof: 'wood' }, { m: 'wood' }, { m: 'glass' }]);
      b.cube('tnt', 21.24, 0); b.cube('tnt', 24.76, 1.98);
      b.keep(27.4, 0, { m: 'stone', roof: 'wood' });
    }),
  ];

  return [
    { id: 1, name: 'Pig Island', desc: 'Classic slingshot. Pop every pig!', theme: 'island', levels: island },
    { id: 2, name: 'Space Hogs', desc: 'Planets bend your shots. Use their gravity!', theme: 'space', levels: space },
    { id: 3, name: 'Demolition Crew', desc: 'No pigs, just wreck the building.', theme: 'demo', levels: demo },
  ];
});
