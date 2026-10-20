/*
 * Upper playfield: orbits, ramps (own layers + wire returns), pop bumpers,
 * Orion lanes, Black Hole scoop, asteroid drop targets, planet stand-ups,
 * upper flipper and spinner.
 */
(function (NN) {
  'use strict';

  const S = NN.Shapes;
  const D = Math.PI / 180;

  // Offset a polyline sideways by d (a number or one value per point)
  function offsetLine(pts, d) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const di = Array.isArray(d) ? d[i] : d;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      // normal (ty, -tx) points to the right of travel when y is down
      out.push([pts[i][0] + ty * di, pts[i][1] - tx * di]);
    }
    return out;
  }
  NN.offsetLine = offsetLine;

  NN.buildUpperTable = function (T, P) {
    const H = T.helpers;
    const add = H.add, wall = H.wall, post = H.post, lineSensor = H.lineSensor, circleSensor = H.circleSensor;
    const AC = [255, 255];
    const L = T.landmarks;
    L.shots = {};
    L.inserts = [];

    // ------------------------------------------------------------ orbits ---
    // Left orbit. The cabinet wall bends into a big curved mouth placed where the
    // right flipper's cross-court shots arrive, so they are turned smoothly up the
    // lane; failed orbits roll back out of the curve toward the centre. Orbit walls
    // are metal: slick and dead.
    const TW = Object.assign({ lcx: 150, lcy: 410, lR: 138, lEnd: 145, lpost: 400, rcy: 465, rEnd: 35, rpost: 455 }, NN.TABLE_TWEAKS || {});
    const arcPts = (c, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = (a0 + (n ? (a1 - a0) * i / n : 0)) * D; o.push([c.cx + c.R * Math.cos(a), c.cy + c.R * Math.sin(a)]); } return o; };
    // Outer wall: straight, then leaning out into a funnel; inner wall flares the
    // other way so a ball drifting off the outer wall is guided back into the lane.
    const OW = TW.outer || [[12, 255], [12, 420], [30, 560], [46, 625]];
    const IW = TW.inner || [[51, 255], [51, 300], [90, 430]];
    add(S.polyline(OW, { mat: 'metal', r: 2 }));
    T.draw.walls.push({ pts: OW, r: 2, color: 'magenta', neon: true, outer: true });
    const oEnd = OW[OW.length - 1];
    // below the funnel the wall angles toward the centre, so balls falling down
    // the side are steered to the inlane, not dumped into the outlane
    const LT = TW.ltip || [70, 700];
    wall([oEnd, LT, [12, 762]], { r: 2, color: 'magenta' });
    T.solids.push(OW.slice(1).concat([LT, [12, 762]]));
    L.leftWallBelowMouth = [oEnd, LT];
    wall(IW, { r: 3, mat: 'metal', color: 'cyan' });
    add(S.arc(AC[0], AC[1], 204, 180 * D, 34 * D, { mat: 'metal', r: 3 }));
    T.draw.walls.push({ arc: [AC[0], AC[1], 204, 180 * D, 34 * D], r: 3, color: 'cyan', neon: true });
    const ip = IW[IW.length - 1];
    post(ip[0], ip[1], 5, { color: 'cyan' });

    // Right orbit: the same funnel, mirrored inside the shooter lane wall
    const ROW = OW.slice(1).map((p) => [474 - p[0], p[1]]);
    add(S.polyline(ROW, { mat: 'metal', r: 2 }));
    T.draw.walls.push({ pts: ROW, r: 2, color: 'magenta', neon: true });
    const roEnd = ROW[ROW.length - 1];
    const RT = [474 - LT[0], LT[1]];
    wall([roEnd, RT, [462, 762]], { r: 2, color: 'magenta' });
    T.solids.push([[462, ROW[0][1]]].concat(ROW.slice(1), [RT, [462, 762]]));
    L.rightWallBelowMouth = [roEnd, RT];
    const RIW = TW.rinner || [[425, 255], [425, 395], [404, 455]];
    wall(RIW, { r: 3, mat: 'metal', color: 'cyan' });
    add(S.arc(AC[0], AC[1], 170, 324 * D, 36 * D, { mat: 'metal', r: 3 }));
    T.draw.walls.push({ arc: [AC[0], AC[1], 170, 324 * D, 36 * D], r: 3, color: 'cyan', neon: true });
    const rip = RIW[RIW.length - 1];
    post(rip[0], rip[1], 5, { color: 'cyan' });
    L.rightOrbitInner = RIW;

    // Spinner in the left orbit
    T.spinners.push({ id: 'spinner', x0: 13, x1: 49, y: 278, gain: 0.03, slow: 0.05, friction: 1.6, drag: 3 });
    lineSensor('spinner', 12, 278, 49, 278, 0, -1, { actions: [{ do: 'spinner', spinner: 'spinner' }] });

    // Orbit switches. Crossing the top switch going up = orbit shot. Coming back
    // down from the top flags the ball so the lower switch hands it to the wire
    // return that feeds the inlane.
    lineSensor('loTop', 12, 296, 49, 296, 0, -1, { actions: [
      { dir: -1, do: 'flag', flag: 'descL', value: true }, { dir: -1, do: 'flag', flag: 'upL', value: false },
      { dir: 1, do: 'flag', flag: 'descL', value: false }, { dir: 1, do: 'flag', flag: 'upL', value: true }] });
    lineSensor('loReturn', 12, 385, 74, 385, 0, 1, { actions: [{ dir: 1, do: 'wire', wire: 'wireLO', requireFlag: 'descL' }] });
    lineSensor('roTop', 424, 342, 463, 342, 0, -1, { actions: [
      { dir: -1, do: 'flag', flag: 'descR', value: true }, { dir: -1, do: 'flag', flag: 'upR', value: false },
      { dir: 1, do: 'flag', flag: 'descR', value: false }, { dir: 1, do: 'flag', flag: 'upR', value: true }] });
    // An orbit only counts once the ball goes over the top of the loop: this
    // switch at the top centre checks which lane the ball came up.
    lineSensor('orbitTop', 255, 10, 255, 52, 1, 0);
    lineSensor('roReturn', 412, 385, 463, 385, 0, 1, { actions: [{ dir: 1, do: 'wire', wire: 'wireRO', requireFlag: 'descR' }] });
    L.shots.leftOrbit = { sensor: 'loTop', dir: 1, x: 31, y: 600, ang: -60 };
    L.shots.rightOrbit = { sensor: 'roTop', dir: 1, x: 444, y: 610, ang: -120 };

    // -------------------------------------------------------------- ramps ---
    const RW = 22; // half width (wall centre lines); the mouth flares into a funnel
    const ramp = (id, layer, axis, color) => {
      const mask = 1 << layer;
      const widths = axis.map((p, i) => (i === 0 ? 31 : i === 1 ? 24 : RW));
      const left = offsetLine(axis, widths.map((x) => -x)), right = offsetLine(axis, widths);
      for (const side of [left, right]) {
        add(S.polyline(side, { mat: 'plastic', r: 2, mask: mask }));
      }
      const n = axis.length;
      // end cap beyond the apex switch
      add(S.seg(left[n - 1][0], left[n - 1][1], right[n - 1][0], right[n - 1][1], { mat: 'plastic', r: 2, mask: mask }));
      // mouth posts exist on the playfield and on the ramp
      add(S.circle(left[0][0], left[0][1], 4, { mat: 'metal', kind: 'post', mask: 1 | mask }));
      add(S.circle(right[0][0], right[0][1], 4, { mat: 'metal', kind: 'post', mask: 1 | mask }));
      // entry flap: crossing up the ramp lifts the ball onto the ramp layer
      const dx = axis[1][0] - axis[0][0], dy = axis[1][1] - axis[0][1], dl = Math.hypot(dx, dy);
      lineSensor(id + 'Entry', left[0][0], left[0][1], right[0][0], right[0][1], dx / dl, dy / dl, {
        mask: 1 | mask,
        actions: [{ dir: 1, do: 'layer', to: layer, fromLayer: 0 }, { dir: -1, do: 'layer', to: 0, fromLayer: layer }],
      });
      // made switch just below the apex
      const a = axis[n - 2], b = axis[n - 1];
      const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey);
      const px = b[0] - (ex / el) * 28, py = b[1] - (ey / el) * 28;
      lineSensor(id + 'Made', px + (ey / el) * RW, py - (ex / el) * RW, px - (ey / el) * RW, py + (ex / el) * RW, ex / el, ey / el, {
        mask: mask, actions: [{ dir: 1, do: 'wire', wire: id === 'rampL' ? 'wireLR' : 'wireRR' }],
      });
      T.ramps.push({ id: id, layer: layer, axis: axis, left: left, right: right, slopeAccel: 2600, apexHeight: 55, color: color });
    };
    ramp('rampL', 1, [[138, 488], [115, 425], [104, 350], [100, 287]], 'blue');
    ramp('rampR', 2, [[336, 488], [359, 425], [370, 350], [374, 287]], 'teal');
    L.shots.leftRamp = { sensor: 'rampLMade', dir: 1, x: 138, y: 505, ang: -98 };
    L.shots.rightRamp = { sensor: 'rampRMade', dir: 1, x: 336, y: 505, ang: -82 };

    // Wire-form returns. h = height above the playfield (for drawing).
    const wire = (id, pts, o) => {
      T.wires[id] = Object.assign({ id: id, pts: pts, accel: 450, drag: 0.45, minSpeed: 450, maxSpeed: 2200, exitSpeed: 1050 }, o || {});
    };
    wire('wireLR', [[100, 287, 55], [88, 262, 55], [64, 251, 52], [40, 262, 48], [30, 300, 44], [30, 420, 36], [31, 540, 28], [38, 620, 18], [54, 700, 8], [71, 768, 0]]);
    wire('wireLO', [[32, 392, 0], [30, 450, 6], [28, 520, 10], [31, 580, 12], [32, 600, 12], [40, 645, 14], [54, 700, 8], [71, 768, 0]]);
    wire('wireRR', [[374, 287, 55], [386, 262, 55], [410, 251, 52], [440, 270, 48], [447, 310, 44], [447, 420, 36], [446, 540, 28], [438, 620, 18], [420, 700, 8], [403, 768, 0]]);
    wire('wireRO', [[442, 392, 0], [444, 450, 6], [446, 520, 10], [443, 580, 12], [443, 600, 12], [436, 645, 14], [420, 700, 8], [403, 768, 0]]);
    L.lock = { x: 392, y: 263, x2: 416, y2: 258 };

    // ------------------------------------------------------- pop bumpers ---
    // offset from the lane centres so a ball dropping out of a lane is never kicked
    // straight back up into it
    const bumpers = [['bumperA', 176, 208], ['bumperB', 276, 192], ['bumperC', 240, 270]];
    T.draw.bumpers = [];
    for (const b of bumpers) {
      add(S.circle(b[1], b[2], 24, { mat: 'bumper', kind: 'bumper', id: b[0] }));
      T.draw.bumpers.push({ id: b[0], x: b[1], y: b[2], r: 24 });
    }

    // -------------------------------------------------- Orion top lanes ---
    T.draw.lanes = [];
    const guides = [165, 205, 245, 285];
    for (const gx of guides) {
      wall([[gx, 92], [gx, 140]], { r: 3, mat: 'metal', color: 'white' });
    }
    for (let i = 0; i < 3; i++) {
      const x0 = guides[i] + 3, x1 = guides[i + 1] - 3;
      lineSensor('lane' + (i + 1), x0, 118, x1, 118, 0, 1);
      T.draw.lanes.push({ id: 'lane' + (i + 1), x: (x0 + x1) / 2, y: 118 });
    }

    // ------------------------------------------------- Black Hole scoop ---
    const SC = { x: 240, y: 336 };
    const SR = 23;
    // funnel flares guide near misses into the hole
    const FL = Object.assign({ fx: 21, fy: 40, fz: 354 }, (NN.TABLE_TWEAKS || {}).scoop || {});
    wall([[SC.x - SR - FL.fx, FL.fz + FL.fy], [SC.x - SR, FL.fz], [SC.x - SR, SC.y]], { r: 3, mat: 'metal', color: 'violet' });
    wall([[SC.x + SR, SC.y], [SC.x + SR, FL.fz], [SC.x + SR + FL.fx, FL.fz + FL.fy]], { r: 3, mat: 'metal', color: 'violet' });
    L.scoopFlareL = [SC.x - SR - FL.fx, FL.fz + FL.fy];
    L.scoopFlareR = [SC.x + SR + FL.fx, FL.fz + FL.fy];
    add(S.arc(SC.x, SC.y, SR, 180 * D, 180 * D, { mat: 'metal', r: 3 }));
    T.draw.walls.push({ arc: [SC.x, SC.y, SR, 180 * D, 180 * D], r: 3, color: 'violet', neon: true });
    circleSensor('scoop', SC.x, SC.y + 2, 12, { capture: true });
    L.scoop = { x: SC.x, y: SC.y, ejectX: SC.x, ejectY: 380 };
    L.shots.scoop = { sensor: 'scoop', x: SC.x, y: 425, ang: -90 };

    // ------------------------------------------------ planet stand-ups ---
    T.draw.targets = [];
    const standup = (id, ax, ay, bx, by, fx, fy, label) => {
      add(S.seg(ax, ay, bx, by, { mat: 'target', kind: 'target', id: id, r: 4 }));
      const c = T.colliders[T.colliders.length - 1];
      c.front = { nx: fx, ny: fy };
      T.draw.targets.push({ id: id, ax: ax, ay: ay, bx: bx, by: by, nx: fx, ny: fy, label: label });
    };
    // left pair on the wall just below the orbit mouth: shots a little too wide
    // for the orbit find them
    {
      const wa = L.leftWallBelowMouth[0], wb = L.leftWallBelowMouth[1];
      const dx = wb[0] - wa[0], dy = wb[1] - wa[1], dl = Math.hypot(dx, dy);
      const ux = dx / dl, uy = dy / dl, fx = uy, fy = -ux; // face normal toward the playfield
      const nx = fx > 0 ? fx : -fx, ny = fx > 0 ? fy : -fy;
      const tgt = (id, t, label) => {
        const cx = wa[0] + dx * t + nx * 6, cy = wa[1] + dy * t + ny * 6;
        standup(id, cx - ux * 9, cy - uy * 9, cx + ux * 9, cy + uy * 9, nx, ny, label);
      };
      tgt('planet1', 0.28, 'M');
      tgt('planet2', 0.72, 'J');
    }
    // centre pair extend the Black Hole's flares, sloped so nothing rests on them
    {
      const a = L.scoopFlareL, b = L.scoopFlareR;
      standup('planet3', a[0] - 3, a[1] + 3, a[0] - 15, a[1] + 11, 0.554, 0.832, 'S');
      standup('planet4', b[0] + 3, b[1] + 3, b[0] + 15, b[1] + 11, -0.554, 0.832, 'N');
    }

    // --------------------------------------------- asteroid drop targets ---
    // Bank of three on the wall face below the right orbit funnel, facing the left
    // flipper: shots a little too wide for the right orbit find them. A recessed
    // wall sits behind them for when they are down.
    T.draw.drops = [];
    {
      const wa = L.rightWallBelowMouth[0], wb = L.rightWallBelowMouth[1];
      const dx = wb[0] - wa[0], dy = wb[1] - wa[1], dl = Math.hypot(dx, dy);
      const ux = dx / dl, uy = dy / dl;
      let nx = uy, ny = -ux;
      if (nx > 0) { nx = -nx; ny = -ny; }       // face toward the playfield (left)
      for (let i = 0; i < 3; i++) {
        const t = 0.2 + 0.3 * i;
        const cx = wa[0] + dx * t + nx * 9, cy = wa[1] + dy * t + ny * 9;
        const id = 'drop' + (i + 1);
        add(S.seg(cx - ux * 8.5, cy - uy * 8.5, cx + ux * 8.5, cy + uy * 8.5, { mat: 'drop', kind: 'drop', id: id, r: 4 }));
        const c = T.colliders[T.colliders.length - 1];
        c.front = { nx: nx, ny: ny };
        T.draw.drops.push({ id: id, x: cx, y: cy, bx: ux, by: uy, nx: nx, ny: ny });
      }
      L.drops = { x: wa[0] + dx * 0.5 + nx * 9, y: wa[1] + dy * 0.5 + ny * 9, nx: nx, ny: ny };
    }

    // ------------------------------------------------------ upper flipper ---
    // seated against the flared right orbit wall at the foot of the Comet Lane
    // (the wall is vertical where the base sits, so nothing can wedge on top of it)
    const UF = { x: 413, y: 390 };
    T.flippers.push({
      id: 'U', side: 'R', upper: true, x: UF.x, y: UF.y,
      length: P.upperFlipperLength, r1: P.upperFlipperBaseRadius, r2: P.upperFlipperTipRadius,
      restDeg: P.flipperRestDeg, upDeg: P.flipperUpDeg,
    });
    L.flipperU = UF;

    // Comet Lane: the upper flipper's own shot, a short lane straight up the
    // bumper exit channel. The ball leaves it into the inner arc and is turned
    // back over the Orion lanes and into the bumpers. Balls falling out of the
    // bumpers into the lane feed the upper flipper.
    wall([[345, 335], [345, 268]], { r: 3, mat: 'metal', color: 'lime' });
    post(345, 268, 4, { mat: 'rubber', color: 'lime' });
    lineSensor('comet', 348, 300, 422, 300, 0, -1);
    L.shots.comet = { sensor: 'comet', dir: 1, x: 380, y: 360, ang: -90 };
  };
})(globalThis.NN || (globalThis.NN = {}));
