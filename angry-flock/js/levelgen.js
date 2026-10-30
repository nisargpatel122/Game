/* Angry Flock — level generator.
 * Builds varied levels from a seed using the same stacking helpers as the hand-made
 * levels: houses, multi-floor buildings, towers, castle keeps, bunkers, vaults, brick
 * walls, crates, boulders, TNT, hills, cliffs, floating rocks and planets.
 *
 * Everything is driven by a seeded random generator, so a seed always produces the
 * same level. Changing this file changes every generated level, so re-run
 * tools/check-levels.js and tools/difficulty.js after any edit.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'));
  else root.LevelGen = factory(root.Sim);
})(typeof self !== 'undefined' ? self : this, function (Sim) {
  'use strict';

  const T = 0.22, S = 0.44, M = 0.88, L = 1.76, XL = 2.64;
  const FLOOR = L + T;

  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    const next = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const R = {
      f: (lo, hi) => lo + next() * (hi - lo),
      i: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      chance: (p) => next() < p,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      weighted(table) {
        let total = 0;
        for (const k in table) total += table[k];
        let x = next() * total;
        for (const k in table) { x -= table[k]; if (x <= 0) return k; }
        return Object.keys(table)[0];
      },
    };
    return R;
  }

  // Material for a piece, leaning towards stone as levels get tougher (d = 0..1).
  function material(R, theme, d) {
    const w = {
      village: { glass: 2, wood: 6, stone: 1 + 2 * d },
      castle: { glass: 0.5, wood: 2, stone: 4 + 3 * d },
      city: { glass: 3, wood: 4, stone: 1.5 + 2 * d },
      temple: { glass: 1, wood: 3, stone: 3 + 2 * d },
      ice: { glass: 7, wood: 1.5, stone: 1 + 2 * d },
      bunkers: { glass: 0.5, wood: 2, stone: 5 + 2 * d },
      lumber: { glass: 0.5, wood: 8, stone: 1 + d },
      mixed: { glass: 2.5, wood: 4, stone: 2 + 2.5 * d },
    }[theme] || { glass: 2, wood: 4, stone: 2 };
    return R.weighted(w);
  }

  // ---------------- modules ----------------
  // Each module knows its width (w), height (h), where pigs can go (slots) and how to build
  // itself with its left edge at x0 and base at y0. Slot "fit" decides which pigs fit there.

  function mHouse(R, ctx) {
    const w = R.chance(0.25) ? XL : L;
    const m = material(R, ctx.theme, ctx.d), top = R.chance(0.5) ? 'wood' : material(R, ctx.theme, ctx.d);
    const peak = R.f(0.7, 1.0);
    return {
      kind: 'house', w, h: FLOOR + peak, mats: [m, top],
      slots: [{ fit: w === XL ? 'big' : 'mid', depth: 1 }],
      build(b, x0, y0, pigs) { b.house(x0 + w / 2, y0, { m, w, top, pig: pigs[0] || undefined, peak }); },
    };
  }

  function mBuilding(R, ctx, opts) {
    opts = opts || {};
    const n = opts.n || R.i(1, ctx.big ? 5 : 4);
    const taper = n > 1 && R.chance(opts.taper != null ? opts.taper : 0.3);
    const maxFloors = taper ? n : (ctx.big ? 5 : 4);
    const floors = Math.max(1, Math.min(maxFloors, opts.floors || R.i(n >= 3 ? 1 : 2, Math.min(maxFloors, 2 + Math.round(1 + 2 * ctx.d + (ctx.big ? 1 : 0))))));
    const spec = [];
    let nn = n;
    for (let f = 0; f < floors; f++) {
      const m = opts.m || material(R, ctx.theme, ctx.d);
      const fl = { m, n: nn };
      if (f === 0 && R.chance(0.35 + 0.3 * ctx.d)) fl.post = 'stone';
      if (m === 'stone') fl.roof = R.chance(0.6) ? 'wood' : 'stone';
      spec.push(fl);
      if (taper) nn = Math.max(1, nn - 1);
    }
    const topN = spec[spec.length - 1].n;
    const deco = R.weighted({ none: 3, tris: 2, cups: 1.2, crenels: 1, tnt: 0.8 + ctx.tnt });
    let h = floors * FLOOR + (deco === 'tris' ? 0.8 : deco === 'cups' ? 0.84 : deco === 'crenels' ? S : deco === 'tnt' ? M : 0);
    const slots = [];
    spec.forEach((fl, f) => { for (let i = 0; i < fl.n; i++) slots.push({ fit: 'mid', depth: floors - f, floor: f, bay: i }); });
    if (deco === 'none') for (let i = 0; i < topN; i++) slots.push({ fit: 'top', depth: 0, floor: floors, bay: i });
    const w = n * L + T;
    return {
      kind: 'building', w, h, n, floors, mats: spec.map(s => s.m),
      slots, roof: deco === 'none' ? topN * L : 0,
      build(b, x0, y0, pigs) {
        const xc = x0 + w / 2;
        let k = 0;
        const floorsOut = spec.map((fl) => {
          const ps = [];
          for (let i = 0; i < fl.n; i++) ps.push(pigs[k++] || null);
          return Object.assign({}, fl, { pigs: ps });
        });
        const y = b.building(xc, y0, n, floorsOut);
        const left = xc - topN * L / 2;
        for (let i = 0; i < topN; i++) {
          const cx = left + (i + 0.5) * L;
          if (deco === 'tris') b.tri(R.chance(0.7) ? 'wood' : 'glass', cx, y, 1.4, 0.75);
          else if (deco === 'cups') b.cup(cx, y);
          else if (deco === 'tnt' && (i % 2 === 0)) b.cube('tnt', cx, y);
          else if (deco === 'none' && pigs[k]) { b.pig(pigs[k], cx, y); }
          if (deco === 'none') k++;
        }
        if (deco === 'crenels') b.crenels(spec[spec.length - 1].roof || spec[spec.length - 1].m, xc, y, topN * L);
      },
    };
  }

  function mTower(R, ctx) {
    const floors = R.i(2, Math.min(5, 2 + Math.round(3 * ctx.d + R.f(0, 1))));
    const spec = [];
    for (let f = 0; f < floors; f++) {
      const m = material(R, ctx.theme, ctx.d);
      spec.push(m === 'stone' ? { m, roof: 'wood' } : { m });
    }
    const top = R.weighted({ none: 2, tri: 2, crenels: 1, cup: 0.7 });
    const h = floors * FLOOR + (top === 'tri' ? 1.0 : top === 'crenels' ? S : top === 'cup' ? 0.84 : 0);
    const slots = spec.map((_, f) => ({ fit: 'mid', depth: floors - f, floor: f }));
    if (top === 'none') slots.push({ fit: 'top', depth: 0, floor: floors });
    return {
      kind: 'tower', w: L, h, mats: spec.map(s => s.m), slots,
      build(b, x0, y0, pigs) {
        const xc = x0 + L / 2;
        const y = b.tower(xc, y0, spec.map((fl, f) => Object.assign({ pig: pigs[f] || undefined }, fl)));
        if (top === 'tri') b.tri('wood', xc, y, L, 1.0);
        else if (top === 'crenels') b.crenels('stone', xc, y, L);
        else if (top === 'cup') b.cup(xc, y);
        else if (pigs[floors]) b.pig(pigs[floors], xc, y);
      },
    };
  }

  function mKeep(R, ctx) {
    const wide = R.chance(0.35 + 0.3 * ctx.d);
    const w = wide ? XL : L;
    const floors = R.i(1, 3);
    const king = wide && ctx.kingFree && R.chance(0.5);
    if (king) ctx.kingFree = false;
    const spec = [];
    for (let f = 0; f < floors; f++) spec.push({ m: 'stone', roof: R.chance(0.7) ? 'wood' : 'stone', w, h: king && f === floors - 1 ? 2.2 : L });
    const h = spec.reduce((s, fl) => s + fl.h + T, 0) + S;
    const slots = spec.map((fl, f) => ({ fit: king && f === floors - 1 ? 'king' : wide ? 'big' : 'mid', depth: floors - f + 1, floor: f }));
    return {
      kind: 'keep', w, h, mats: spec.map(() => 'stone'), slots,
      build(b, x0, y0, pigs) {
        const xc = x0 + w / 2;
        const y = b.tower(xc, y0, spec.map((fl, f) => Object.assign({ pig: pigs[f] || undefined }, fl)));
        b.crenels(R.chance(0.8) ? 'stone' : 'wood', xc, y, w);
      },
    };
  }

  function mBunker(R, ctx) {
    const small = R.chance(0.5);
    const s = small ? S : M, rows = small ? R.i(3, 4) : 2;
    const m = R.chance(0.65 + 0.3 * ctx.d) ? 'stone' : material(R, ctx.theme, ctx.d);
    const roof = R.chance(0.5) ? 'stone' : 'wood';
    const extra = R.weighted({ none: 2, tnt: 1 + ctx.tnt, pig: 1 });
    const w = 1.32 + 2 * s;
    const slots = [{ fit: 'bunker', depth: 3 }];
    if (extra === 'pig') slots.push({ fit: 'top', depth: 0 });
    return {
      kind: 'bunker', w, h: rows * s + T + (extra === 'tnt' ? M : extra === 'pig' ? 1.2 : 0), mats: [m, roof], slots,
      roof: extra === 'none' ? w : 0, base: rows * s + T,
      build(b, x0, y0, pigs) {
        const xc = x0 + w / 2;
        const y = b.bunker(xc, y0, { m, s, rows, roof, pig: pigs[0] || undefined });
        if (extra === 'tnt') b.cube('tnt', xc, y);
        else if (extra === 'pig' && pigs[1]) b.pig(pigs[1], xc, y);
      },
    };
  }

  function mVault(R, ctx) {
    // a 5-wide vault holds two things inside, a 4-wide one just one pig
    const cols = R.i(4, 5);
    const w = cols * M;
    const tnt = cols === 5 && R.chance(0.4 + ctx.tnt);
    return {
      kind: 'vault', w, h: 4 * M + 2 * T + S, mats: ['stone', 'stone', 'stone'],
      slots: cols === 5 ? [{ fit: 'vault', depth: 4 }, { fit: tnt ? 'none' : 'vault', depth: 4 }] : [{ fit: 'vault', depth: 4 }],
      build(b, x0, y0, pigs) {
        const xc = x0 + w / 2;
        b.wall('stone', xc, y0, cols, 1);
        b.stack('stone', xc - (cols - 1) / 2 * M, y0 + M, 3);
        b.stack('stone', xc + (cols - 1) / 2 * M, y0 + M, 3);
        if (cols === 4) { if (pigs[0]) b.pig(pigs[0], xc, y0 + M); }
        else {
          if (pigs[0]) b.pig(pigs[0], xc - 0.71, y0 + M);
          if (tnt) b.cube('tnt', xc + 0.71, y0 + M);
          else if (pigs[1]) b.pig(pigs[1], xc + 0.71, y0 + M);
        }
        const r = b.plank('stone', xc, y0 + 4 * M, w);
        const t = b.plank('wood', xc, r, w);
        b.crenels('stone', xc, t, w);
      },
    };
  }

  function mBrick(R, ctx) {
    const cols = R.i(1, 3), rows = R.i(2, 4 + Math.round(3 * ctx.d));
    const m = material(R, ctx.theme, ctx.d);
    const w = cols * 2 * S;
    const slots = cols >= 2 ? [{ fit: 'top', depth: 0 }] : [];
    return {
      kind: 'brick', w, h: rows * S + (slots.length ? 1.2 : 0), mats: [m], slots, roof: cols >= 2 ? w : 0, base: rows * S,
      build(b, x0, y0, pigs) {
        const y = b.brick(m, x0 + w / 2, y0, cols, rows);
        if (pigs[0]) b.pig(pigs[0], x0 + w / 2, y);
      },
    };
  }

  function mCrates(R, ctx) {
    const cols = R.i(2, 4), rows = R.i(1, 3);
    const mats = [material(R, ctx.theme, ctx.d), material(R, ctx.theme, ctx.d)];
    const tntP = 0.12 + ctx.tnt;
    const pattern = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pattern.push(R.chance(tntP) ? 'tnt' : mats[(r + c) % 2]);
    const w = cols * M;
    return {
      kind: 'crates', w, h: rows * M + 1.2, mats, slots: [{ fit: 'top', depth: 0 }], roof: w, base: rows * M,
      build(b, x0, y0, pigs) {
        const y = b.wall((c, r) => pattern[r * cols + c], x0 + w / 2, y0, cols, rows);
        if (pigs[0]) b.pig(pigs[0], x0 + w / 2, y);
      },
    };
  }

  function mTnt(R) {
    const two = R.chance(0.25);
    return {
      kind: 'tnt', w: M, h: two ? 2 * M : M, mats: [], slots: [],
      build(b, x0, y0) { b.stack('tnt', x0 + M / 2, y0, two ? 2 : 1); },
    };
  }

  function mPlanks(R) {
    const n = R.i(4, 7);
    return {
      kind: 'planks', w: XL, h: n * T + 1.2, mats: ['wood'], slots: [{ fit: 'top', depth: 0 }], roof: XL, base: n * T,
      build(b, x0, y0, pigs) {
        for (let r = 0; r < n; r++) b.plank('wood', x0 + XL / 2, y0 + r * T, XL);
        if (pigs[0]) b.pig(pigs[0], x0 + XL / 2, y0 + n * T);
      },
    };
  }

  function mHenge(R) {
    const top = R.weighted({ cup: 2, crenels: 1 });
    return {
      kind: 'henge', w: XL, h: FLOOR + (top === 'cup' ? 0.84 : S), mats: ['stone'], slots: [{ fit: 'big', depth: 1 }],
      build(b, x0, y0, pigs) {
        const xc = x0 + XL / 2;
        const y = b.frame('stone', xc, y0, XL);
        if (pigs[0]) b.pig(pigs[0], xc, y0);
        if (top === 'cup') b.cup(xc, y, 'stone', 'stone');
        else b.crenels('stone', xc, y, XL);
      },
    };
  }

  function mPanes(R) {
    const n = R.i(2, 4);
    return {
      kind: 'panes', w: S, h: n * S, mats: ['glass'], slots: [],
      build(b, x0, y0) { b.stack('glass', x0 + S / 2, y0, n, S); },
    };
  }

  const MODULES = { house: mHouse, building: mBuilding, tower: mTower, keep: mKeep, bunker: mBunker, vault: mVault, brick: mBrick, crates: mCrates, tnt: mTnt, planks: mPlanks, henge: mHenge, panes: mPanes };

  const THEME_MODULES = {
    village: { house: 4, building: 3, brick: 1.5, crates: 1, tnt: 1, planks: 0.7 },
    castle: { keep: 4, brick: 2.5, building: 3, tnt: 0.8, house: 0.6, henge: 0.5 },
    city: { building: 5, tower: 3, tnt: 1.2, house: 0.7, crates: 0.6 },
    temple: { building: 4, henge: 2, brick: 1, tnt: 0.6, tower: 0.8 },
    ice: { building: 4, tower: 2, panes: 2, brick: 1.2, house: 1 },
    bunkers: { bunker: 4, vault: 1.6, brick: 2, tnt: 1, crates: 0.8, building: 1 },
    lumber: { planks: 2.5, building: 3, house: 2, tnt: 1, crates: 1 },
    mixed: { house: 1.5, building: 3, tower: 1.5, keep: 1.2, bunker: 1, brick: 1, crates: 0.8, tnt: 0.8, henge: 0.5, planks: 0.5, vault: 0.5 },
  };

  // ---------------- ground ----------------
  // Returns flat areas modules can stand on: { x1, x2, y, maxH }.
  function terrain(R, b, kind, xMin, xMax) {
    const areas = [];
    if (kind === 'flat') {
      areas.push({ x1: xMin, x2: xMax, y: 0, maxH: 99 });
    } else if (kind === 'mesa') {
      const h = R.f(1.5, 3.2), slope = R.f(1.2, 1.8);
      const x1 = R.f(xMin + 2.2, xMin + 4.5), x2 = Math.min(xMax - slope - 0.2, x1 + R.f(7, 11));
      b.mesa(x1, x2, h, slope);
      if (x1 - slope - 0.3 - xMin > 1.0) areas.push({ x1: xMin, x2: x1 - slope - 0.3, y: 0, maxH: 99 });
      areas.push({ x1: x1 + 0.1, x2: x2 - 0.1, y: h, maxH: 99 });
    } else if (kind === 'cliff') {
      const h = R.f(2, 4.2), x1 = R.f(xMin + 3, xMin + 7);
      b.cliff(x1, xMax + 1.5, h);
      areas.push({ x1: xMin, x2: x1 - 0.3, y: 0, maxH: 99 });
      areas.push({ x1: x1 + 0.2, x2: xMax + 1.3, y: h, maxH: 99 });
    } else if (kind === 'steps') {
      const n = R.i(2, 3), stepH = R.f(1.3, 1.8);
      let x = R.f(xMin + 2.5, xMin + 4);
      const w = (xMax + 1 - x) / n;
      areas.push({ x1: xMin, x2: x - 0.3, y: 0, maxH: 99 });
      for (let i = 1; i <= n; i++) {
        b.cliff(x, xMax + 1.5, stepH * i);
        areas.push({ x1: x + 0.15, x2: Math.min(x + w, xMax + 1.3) - 0.15, y: stepH * i, maxH: 99 });
        x += w;
      }
    } else if (kind === 'isles') {
      let x = xMin + R.f(0.5, 1.5);
      while (x < xMax - 2.6) {
        const w = R.f(2.6, 4.2), top = R.f(1.0, 6.0);
        const x2 = Math.min(x + w, xMax);
        if (x2 - x < 2.4) break;
        b.rock(x, x2, top - 0.6, top);
        areas.push({ x1: x + 0.05, x2: x2 - 0.05, y: top, maxH: 99 });
        if (top - 0.6 > 2.2) areas.push({ x1: x + 0.1, x2: x2 - 0.1, y: 0, maxH: top - 0.75 });
        const gap = R.f(0.8, 2.2);
        if (gap > 1.4) areas.push({ x1: x2 + 0.15, x2: x2 + gap - 0.15, y: 0, maxH: 99 });
        x = x2 + gap;
      }
    }
    areas.sort((a, c) => a.x1 - c.x1 || a.y - c.y);
    return areas;
  }

  // ---------------- pigs & birds ----------------
  const FIT_PIGS = {
    mid: { small: 4, medium: 3, helmet: 2 },
    big: { large: 3, medium: 2, helmet: 2 },
    king: { king: 1 },
    top: { small: 4, medium: 2, helmet: 1 },
    bunker: { medium: 3, helmet: 3, small: 2 },
    vault: { helmet: 3, medium: 2, small: 2 },
  };

  function pigFor(R, fit, d) {
    const t = Object.assign({}, FIT_PIGS[fit]);
    if (t.helmet) t.helmet *= 0.6 + 2.2 * d;
    return R.weighted(t);
  }

  // A sensible bird line-up for what the structure is made of: glass -> Blues,
  // wood -> Chuck, stone -> Bomb/Terence, hidden pigs -> Matilda, Red as an all-rounder.
  function birdsFor(R, stats, firstMat) {
    const total = stats.glass + stats.wood + stats.stone + 1e-6;
    const weights = {
      blue: 0.2 + 3 * stats.glass / total,
      yellow: 0.3 + 3 * stats.wood / total,
      black: 0.3 + 3 * stats.stone / total + 0.3 * stats.tnt,
      big: 2 * stats.stone / total,
      white: 0.1 + 0.9 * stats.hidden,
      red: 0.9,
    };
    const first = { glass: 'blue', wood: 'yellow', stone: stats.stone / total > 0.5 && R.chance(0.4) ? 'big' : 'black' }[firstMat] || 'red';
    const pref = [first];
    while (pref.length < 8) {
      const bird = R.weighted(weights);
      const n = pref.length;
      if (n >= 2 && pref[n - 1] === bird && pref[n - 2] === bird) continue;
      pref.push(bird);
    }
    if (pref.slice(0, 4).indexOf('red') < 0) pref.splice(R.i(1, 3), 0, 'red');
    return pref.slice(0, 8);
  }

  function matStats(blocks) {
    const s = { glass: 0, wood: 0, stone: 0, tnt: 0 };
    for (const k of blocks) {
      const area = k.r ? Math.PI * k.r * k.r : (k.tri ? k.w * k.h / 2 : k.w * k.h);
      if (k.m === 'tnt') s.tnt++;
      else s[k.m] += area;
    }
    return s;
  }

  // ---------------- names ----------------
  const NAMES = {
    village: [['Sleepy', 'Muddy', 'Sunny', 'Windy', 'Quiet', 'Snoutville', 'Oinkwood', 'Mossy', 'Hilltop', 'Riverside'], ['Village', 'Hamlet', 'Cottages', 'Farm', 'Crossing', 'Market', 'Barns', 'Square', 'Green']],
    castle: [['Iron', 'Royal', 'Crumbling', 'Grim', 'Old', 'Stormy', 'Twin', 'Grand', 'Hog', 'Granite'], ['Keep', 'Citadel', 'Bastion', 'Stronghold', 'Castle', 'Fort', 'Ramparts', 'Battlements', 'Gatehouse']],
    city: [['Downtown', 'Uptown', 'Snout', 'Neon', 'Busy', 'Midtown', 'Harbor', 'Pigsburg', 'Hamhattan', 'Bacon'], ['Heights', 'Towers', 'Blocks', 'Plaza', 'Avenue', 'District', 'Skyline', 'High-Rise', 'Corner']],
    temple: [['Ancient', 'Golden', 'Lost', 'Sunken', 'Sacred', 'Jungle', 'Forgotten', 'Moonlit', 'Silent', 'Hidden'], ['Temple', 'Shrine', 'Ruins', 'Pyramid', 'Altar', 'Sanctum', 'Steps', 'Monument', 'Tomb']],
    ice: [['Frosty', 'Crystal', 'Glacier', 'Shiny', 'Icy', 'Sparkle', 'Polar', 'Frozen', 'Snowy', 'Clear'], ['Palace', 'Greenhouse', 'Gallery', 'Spires', 'Halls', 'Pavilion', 'Lanterns', 'Domes', 'Conservatory']],
    bunkers: [['Concrete', 'Hidden', 'Deep', 'Secret', 'Steel', 'Hog', 'Last', 'Silent', 'Rocky', 'Sneaky'], ['Bunkers', 'Vaults', 'Shelters', 'Lair', 'Den', 'Outpost', 'Trenches', 'Burrows', 'Hideout']],
    lumber: [['Timber', 'Sawdust', 'Oak', 'Pine', 'Splinter', 'Log', 'Woodchip', 'Maple', 'Birch', 'Cedar'], ['Yard', 'Mill', 'Camp', 'Depot', 'Works', 'Stacks', 'Cabins', 'Lodge', 'Pile']],
    mixed: [['Pig', 'Hog', 'Snout', 'Curly', 'Grunt', 'Trotter', 'Muddy', 'Bristle', 'Ham', 'Swill'], ['Town', 'Fortress', 'Compound', 'Outpost', 'Junction', 'Settlement', 'Quarter', 'Encampment', 'Palace']],
    space: [['Orbit', 'Crater', 'Comet', 'Lunar', 'Nebula', 'Asteroid', 'Galaxy', 'Starlight', 'Meteor', 'Zero-G'], ['Base', 'Outpost', 'Station', 'Colony', 'Belt', 'Ring', 'Moons', 'Drift', 'Dock']],
    demo: [['Old', 'Condemned', 'Rickety', 'Tall', 'Wide', 'Crooked', 'Busy', 'Empty', 'Grand', 'Downtown'], ['Offices', 'Warehouse', 'Apartments', 'Factory', 'Hotel', 'Depot', 'Mall', 'Garage', 'Tower', 'Station', 'Library', 'Museum']],
  };

  function names(R, theme) {
    const [a, b] = NAMES[theme] || NAMES.mixed;
    const out = [];
    for (let i = 0; i < 6; i++) out.push(R.pick(a) + ' ' + R.pick(b));
    return out;
  }

  // ---------------- composers ----------------
  const ROOFTOP = { house: 3, tower: 2, bunker: 1.5, building: 1.5, brick: 0.8, crates: 0.8, tnt: 0.8 };

  function compose(R, b, ctx, areas, pickModule, maxModules) {
    const placed = [];
    for (const area of areas) {
      let x = area.x1 + R.f(0, 0.5);
      let tries = 0;
      while (placed.length < maxModules && tries < 10) {
        const room = area.x2 - x;
        if (room < S + 0.05) break;
        const mod = pickModule(R, ctx);
        if (mod.w > room || mod.h > area.maxH || mod.h > ctx.maxHeight - area.y) { tries++; continue; }
        const base = { mod, x0: x, y0: area.y };
        placed.push(base);
        x += mod.w + R.f(0.2, 0.75);
        tries = 0;
        // Sometimes build another, smaller structure on a flat roof (and now and then a third tier).
        let parent = base, chance = ctx.stack;
        while (parent.mod.roof && R.chance(chance)) {
          const top = parent.y0 + (parent.mod.base != null ? parent.mod.base : parent.mod.h);
          const limit = Math.min(area.maxH - (top - area.y), ctx.maxHeight - top);
          let kidPlaced = null;
          for (let k = 0; k < 6 && !kidPlaced; k++) {
            const kid = MODULES[R.weighted(ROOFTOP)](R, Object.assign({}, ctx, { big: false }));
            if (kid.w > parent.mod.roof - 0.05 || kid.h > limit) continue;
            parent.mod.stacked = true;
            kidPlaced = { mod: kid, x0: 0, y0: top, onTop: parent };
            placed.push(kidPlaced);
          }
          if (!kidPlaced) break;
          parent = kidPlaced;
          chance *= 0.45;
        }
      }
    }
    // rooftop structures sit centred on whatever they stand on
    for (const p of placed) if (p.onTop) p.x0 = p.onTop.x0 + (p.onTop.mod.w - p.mod.w) / 2;
    return placed;
  }

  // The pig shuffle below draws random numbers inside its comparator, so the result depends
  // on exactly which comparisons the sort makes. Rather than trust each browser's built-in
  // sort, this repeats, comparison for comparison, what V8 (Chrome and Node) does for arrays
  // under 64 long: find the opening run (reversing it if strictly descending), then binary
  // insertion for the rest.
  function sortLikeV8(a, cmp) {
    const n = a.length;
    if (n < 2) return a;
    const desc = cmp(a[1], a[0]) < 0;
    let run = 2;
    for (; run < n; run++) {
      const o = cmp(a[run], a[run - 1]);
      if (desc ? o >= 0 : o < 0) break;
    }
    if (desc) for (let i = 0, j = run - 1; i < j; i++, j--) [a[i], a[j]] = [a[j], a[i]];
    for (let start = run; start < n; start++) {
      const pivot = a[start];
      let left = 0, right = start;
      while (left < right) {
        const mid = left + ((right - left) >> 1);
        if (cmp(pivot, a[mid]) < 0) right = mid;
        else left = mid + 1;
      }
      for (let p = start; p > left; p--) a[p] = a[p - 1];
      a[left] = pivot;
    }
    return a;
  }

  function assignPigs(R, placed, ctx) {
    const slots = [];
    placed.forEach((p, i) => p.mod.slots.forEach((s, j) => {
      if (s.fit === 'none' || (p.mod.stacked && s.fit === 'top')) return;
      slots.push({ p: i, j, s });
    }));
    const want = Math.max(ctx.minPigs, Math.min(ctx.maxPigs, Math.round(slots.length * R.f(0.5, 0.85))));
    // Harder levels hide pigs deeper inside; easier ones leave more of them out on top.
    const score = (s) => s.s.depth * (0.3 + ctx.d) + (s.s.fit === 'top' ? (1 - ctx.d) * 1.5 : 0) + R.f(0, 1.5);
    sortLikeV8(slots, (a, c) => score(c) - score(a));
    const pigs = placed.map(p => p.mod.slots.map(() => null));
    let kingUsed = false;
    for (const s of slots.slice(0, want)) {
      let fit = s.s.fit;
      if (fit === 'king' && kingUsed) fit = 'big';
      const type = pigFor(R, fit, ctx.d);
      if (type === 'king') kingUsed = true;
      pigs[s.p][s.j] = type;
    }
    return pigs;
  }

  function islandLevel(seed) {
    const R = rng(seed);
    const theme = R.weighted({ village: 1, castle: 1.2, city: 1.1, temple: 0.9, ice: 0.8, bunkers: 0.8, lumber: 0.7, mixed: 1.4 });
    const d = R.f(0, 1);
    const ground = R.weighted({ flat: 4, mesa: 1.5, cliff: 1, steps: 0.8, isles: 1 });
    const ctx = { theme, d, tnt: R.f(0, 0.25), kingFree: theme === 'castle' || theme === 'mixed', big: R.chance(0.3 + 0.4 * d), maxHeight: 10.5, minPigs: 5, maxPigs: 16, stack: 0.45 + 0.4 * d };
    const table = THEME_MODULES[theme];
    const pick = (RR, c) => MODULES[RR.weighted(table)](RR, c);
    const out = { theme, ground, d, names: names(R, theme) };
    out.build = (b) => {
      const areas = terrain(R, b, ground, 12.6, 28);
      const placed = compose(R, b, ctx, areas, pick, R.i(5, 8 + Math.round(3 * d)));
      const pigs = assignPigs(R, placed, ctx);
      placed.forEach((p, i) => p.mod.build(b, p.x0, p.y0, pigs[i]));
      const stats = matStats(b.blocks);
      stats.hidden = placed.reduce((s, p, i) => s + p.mod.slots.filter((sl, j) => pigs[i][j] && (sl.fit === 'bunker' || sl.fit === 'vault' || sl.depth >= 3)).length, 0) / Math.max(1, b.pigs.length);
      const firstMat = placed.length && placed[0].mod.mats.length ? placed[0].mod.mats[0] : 'wood';
      out.pref = birdsFor(R, stats, firstMat === 'tnt' ? 'wood' : firstMat);
    };
    return out;
  }

  function demoLevel(seed) {
    const R = rng(seed);
    const theme = R.weighted({ city: 2, castle: 1, temple: 1, village: 0.8, ice: 0.8, lumber: 0.8, mixed: 1.4 });
    const d = R.f(0, 1);
    const ground = R.weighted({ flat: 5, mesa: 1.2, cliff: 0.8, steps: 0.6 });
    const ctx = { theme, d, tnt: R.f(0, 0.25), kingFree: false, big: true, maxHeight: 12, minPigs: 0, maxPigs: 0, stack: 0.5 };
    const table = Object.assign({}, THEME_MODULES[theme]);
    delete table.bunker; delete table.vault;
    table.building = (table.building || 1) * 1.6;
    const pick = (RR, c) => MODULES[RR.weighted(table)](RR, c);
    const out = { theme, ground, d, names: names(R, 'demo') };
    out.build = (b) => {
      const areas = terrain(R, b, ground, 12.6, 28);
      const placed = compose(R, b, ctx, areas, pick, R.i(5, 10));
      placed.forEach((p) => p.mod.build(b, p.x0, p.y0, []));
      const stats = matStats(b.blocks);
      stats.hidden = 0.2;
      const firstMat = placed.length && placed[0].mod.mats.length ? placed[0].mod.mats[0] : 'wood';
      out.pref = birdsFor(R, stats, firstMat === 'tnt' ? 'wood' : firstMat);
    };
    return out;
  }

  // Space: planets with small outposts on them, sometimes a cloud of floating junk.
  function spaceLevel(seed, onPlanet) {
    const R = rng(seed);
    const d = R.f(0, 1);
    const out = { theme: 'space', ground: 'space', d, names: names(R, 'space') };
    out.build = (b, def) => {
      const planets = [];
      const n = R.weighted({ 1: 1, 2: 1.4, 3: 0.8 });
      for (let tries = 0; planets.length < +n && tries < 60; tries++) {
        const r = R.f(2.4, 3.8);
        const p = { x: R.f(10.5, 24.5), y: R.f(-4.5, 5), r, field: r * R.f(2.1, 2.6), g: R.f(10, 14) };
        if (p.x - p.field < 3.5) continue;
        if (planets.some(q => Math.hypot(q.x - p.x, q.y - p.y) < q.r + p.r + 3)) continue;
        planets.push(p);
      }
      def.planets = planets;
      const ctx = { theme: 'mixed', d, tnt: R.f(0, 0.3), kingFree: false, big: false };
      const outposts = [];
      for (const p of planets) {
        const count = R.i(2, 3);
        const used = [];
        for (let k = 0; k < count; k++) {
          let ang = 0, ok = false;
          // Only spots where this planet alone pulls (another planet's pull would tip it over).
          const clear = (deg) => [1.2, 3.0].every((h) => {
            const a = deg * Math.PI / 180, x = p.x + (p.r + h) * Math.cos(a), y = p.y + (p.r + h) * Math.sin(a);
            return planets.every(q => q === p || Math.hypot(q.x - x, q.y - y) > q.field + 0.8);
          });
          for (let t = 0; t < 16 && !ok; t++) {
            ang = R.f(-60, 220);
            ok = used.every(u => Math.abs(u - ang) > 55) && clear(ang);
          }
          if (!ok) continue;
          used.push(ang);
          const kind = R.weighted({ tower: 2, house: 2.2, bunker: 1.4, pig: 1.5, tnt: 0.7, crates: 0.7 });
          outposts.push({ p, ang, kind });
        }
      }
      // A flat rock pad sunk into the planet so outposts stand on level ground.
      const pad = (p, angDeg, w) => {
        const a = angDeg * Math.PI / 180, rot = a - Math.PI / 2, c = Math.cos(rot), sn = Math.sin(rot);
        const ox = p.x + p.r * Math.cos(a), oy = p.y + p.r * Math.sin(a);
        const tf = (x, y) => [ox + c * x - sn * y, oy + sn * x + c * y];
        b.terrain.push({ pts: [tf(-w / 2, -0.8), tf(w / 2, -0.8), tf(w / 2, 0), tf(-w / 2, 0)], style: 'rock' });
      };
      for (const o of outposts) {
        const padW = { tower: L + 0.3, house: L + 0.3, bunker: 1.32 + 2 * S + 0.3, crates: 2 * M + 0.3 }[o.kind];
        if (padW) pad(o.p, o.ang, padW);
        onPlanet(b, o.p, o.ang, (l) => {
          if (o.kind === 'pig') { l.pig(pigFor(R, 'top', d), 0, 0); return; }
          if (o.kind === 'tnt') { l.cube('tnt', 0, 0); return; }
          let mod;
          if (o.kind === 'tower') {
            const floors = R.i(1, 2 + Math.round(d));
            mod = { w: L, build: (bb, x0, y0) => {
              const spec = [];
              for (let f = 0; f < floors; f++) spec.push({ m: material(R, 'mixed', d), pig: f === 0 || R.chance(0.6) ? pigFor(R, 'mid', d) : undefined });
              for (const fl of spec) if (fl.m === 'stone') fl.roof = 'wood';
              bb.tower(x0 + L / 2, y0, spec);
            } };
          } else if (o.kind === 'house') {
            mod = { w: L, build: (bb, x0, y0) => bb.house(x0 + L / 2, y0, { m: material(R, 'mixed', d), pig: pigFor(R, 'mid', d) }) };
          } else if (o.kind === 'bunker') {
            mod = { w: 1.32 + 2 * S, build: (bb, x0, y0) => bb.bunker(x0 + (1.32 + 2 * S) / 2, y0, { m: R.chance(0.6) ? 'stone' : 'wood', s: S, rows: 3, pig: pigFor(R, 'bunker', d) }) };
          } else {
            mod = { w: 2 * M, build: (bb, x0, y0) => { const y = bb.wall((c, r) => (R.chance(0.2) ? 'tnt' : material(R, 'mixed', d)), x0 + M, y0, 2, 1); bb.pig(pigFor(R, 'top', d), x0 + M, y); } };
          }
          mod.build(l, -mod.w / 2, 0);
        });
      }
      // floating junk outside the gravity fields
      if (R.chance(0.45)) {
        const cx = R.f(11, 19), cy = R.f(-3, 5);
        const spots = [];
        for (let k = 0; k < R.i(3, 7); k++) {
          const x = cx + R.f(-2.5, 2.5), y = cy + R.f(-2.2, 2.2);
          if (planets.some(p => Math.hypot(p.x - x, p.y - y) < p.field + 1.2)) continue;
          if (spots.some(q => Math.hypot(q[0] - x, q[1] - y) < 2.0)) continue;
          spots.push([x, y]);
          if (R.chance(0.35)) b.pig(R.chance(0.7) ? 'small' : 'medium', x, y);
          else b.box(material(R, 'ice', d), x, y, R.chance(0.5) ? M : L, R.chance(0.5) ? M : T, R.f(0, 90));
        }
      }
      // make sure there's always something to pop
      if (b.pigs.length < 2 && planets.length) onPlanet(b, planets[0], 90, (l) => l.pig('medium', 0, 0));
      const stats = matStats(b.blocks);
      stats.hidden = 0.1;
      out.pref = birdsFor(R, stats, R.pick(['wood', 'glass', 'stone']));
    };
    return out;
  }

  return { islandLevel, demoLevel, spaceLevel, rng, sortLikeV8 };
});
