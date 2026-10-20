/*
 * Insert lights: positions, shapes and colours. Shared by the rules engine
 * (which decides what is lit) and the renderer (which draws them).
 *
 * shape: arrow | circle | pill | star | tri
 * ang:   direction an arrow points (radians, screen space)
 */
(function (NN) {
  'use strict';

  const D = Math.PI / 180;

  NN.buildInserts = function (T) {
    const L = T.landmarks;
    const I = [];
    const add = (o) => { I.push(Object.assign({ size: 1, text: '' }, o)); };

    // shot arrows, each pointing at its shot
    add({ id: 'arrow_leftOrbit', shape: 'arrow', x: 92, y: 600, ang: -124 * D, color: '#ff3df0', size: 1.1 });
    add({ id: 'arrow_leftRamp', shape: 'arrow', x: 158, y: 548, ang: -108 * D, color: '#36c8ff', size: 1.1 });
    add({ id: 'arrow_scoop', shape: 'arrow', x: L.scoop.x, y: 476, ang: -90 * D, color: '#b48cff', size: 1.15 });
    add({ id: 'arrow_rightRamp', shape: 'arrow', x: 316, y: 548, ang: -72 * D, color: '#36ffd8', size: 1.1 });
    add({ id: 'arrow_rightOrbit', shape: 'arrow', x: 382, y: 600, ang: -56 * D, color: '#ff3df0', size: 1.1 });
    add({ id: 'arrow_comet', shape: 'arrow', x: 386, y: 318, ang: -90 * D, color: '#3dff8a', size: 0.9 });

    // secondary lamps beside the shots
    add({ id: 'extraball', shape: 'pill', x: 70, y: 640, ang: -124 * D, color: '#ff9b2f', text: 'EXTRA', size: 0.8 });
    add({ id: 'lightlock', shape: 'pill', x: 166, y: 588, ang: -108 * D, color: '#ffe14d', text: 'LOCK', size: 0.75 });
    add({ id: 'lock', shape: 'pill', x: 308, y: 588, ang: -72 * D, color: '#ffe14d', text: 'LOCK', size: 0.8 });
    add({ id: 'lock1', shape: 'circle', x: 296, y: 616, color: '#ffe14d', size: 0.55 });
    add({ id: 'lock2', shape: 'circle', x: 314, y: 622, color: '#ffe14d', size: 0.55 });
    add({ id: 'mission', shape: 'pill', x: L.scoop.x, y: 512, color: '#ffffff', text: 'MISSION', size: 0.85 });
    add({ id: 'superjackpot', shape: 'pill', x: L.scoop.x, y: 438, color: '#ff2b4f', text: 'SUPER', size: 0.75 });
    add({ id: 'spinner', shape: 'circle', x: 31, y: 318, color: '#b48cff', size: 0.6 });

    // mission ring around the SUPERNOVA star in the middle of the playfield
    const ringC = { x: NN.TABLE_CONST.CX, y: 662 };
    L.missionRing = ringC;
    add({ id: 'supernova', shape: 'star', x: ringC.x, y: ringC.y, color: '#ffffff', size: 1.6 });
    NN.MISSIONS.forEach((m, i) => {
      const a = (-90 + i * 60) * D;
      add({ id: 'm_' + m.id, shape: 'circle', x: ringC.x + Math.cos(a) * 52, y: ringC.y + Math.sin(a) * 52, color: m.color, size: 0.95, label: m.name });
    });

    // bonus multipliers and shoot again at the bottom centre
    for (let i = 2; i <= 6; i++) {
      add({ id: 'bonus' + i, shape: 'circle', x: NN.TABLE_CONST.CX + (i - 4) * 24, y: 768, color: '#ffe14d', size: 0.6, text: i + 'X' });
    }
    add({ id: 'shootagain', shape: 'pill', x: NN.TABLE_CONST.CX, y: 812, color: '#ff2b4f', text: 'SHOOT AGAIN', size: 1.05 });

    // kickback in the left outlane
    add({ id: 'kickback', shape: 'tri', x: L.kickback.x, y: 900, ang: -90 * D, color: '#3dff8a', size: 0.75 });

    // Orion lanes
    for (const ln of T.draw.lanes) add({ id: ln.id, shape: 'star', x: ln.x, y: ln.y - 32, color: '#36c8ff', size: 0.75 });

    // planets: a lamp in front of each stand-up
    for (const t of T.draw.targets) {
      const cx = (t.ax + t.bx) / 2 + t.nx * 20, cy = (t.ay + t.by) / 2 + t.ny * 20;
      add({ id: 'l_' + t.id, shape: 'circle', x: cx, y: cy, color: '#3dff8a', size: 0.55, text: t.label });
    }
    // asteroids: a lamp in front of each drop target
    for (const d of T.draw.drops) {
      add({ id: 'l_' + d.id, shape: 'tri', x: d.x + d.nx * 22, y: d.y + d.ny * 22, ang: Math.atan2(-d.ny, -d.nx), color: '#ffe14d', size: 0.5 });
    }
    return I;
  };
})(globalThis.NN || (globalThis.NN = {}));
