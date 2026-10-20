/*
 * NEON NEBULA table geometry. Millimetres, y toward the player.
 * The main playfield spans x 12..462 (centre 237); the shooter lane is x 466..498.
 *
 * buildTable() returns plain data: static colliders, flipper definitions,
 * sensors, ramps, wires, plus drawing hints for the renderer.
 */
(function (NN) {
  'use strict';

  const S = NN.Shapes;
  const D = Math.PI / 180;
  const CX = 237;                  // main playfield centre line
  const mx = (x) => 2 * CX - x;    // mirror left <-> right

  NN.TABLE_CONST = { CX: CX, W: 510, H: 1070 };

  NN.buildTable = function (P) {
    const T = {
      width: 510, height: 1070,
      drainY: 1012, drainMaxX: 463,
      colliders: [], flippers: [], sensors: [], ramps: [], wires: {}, spinners: [],
      draw: { walls: [], posts: [], slings: [], guides: [] },
      solids: [],                       // closed polygons the ball can never be inside
      landmarks: {},
    };
    const C = T.colliders;
    const add = (c) => { if (Array.isArray(c)) { for (const x of c) C.push(x); } else C.push(c); return c; };
    const wall = (pts, o) => {
      o = Object.assign({ mat: 'wall', r: 3 }, o || {});
      const segs = add(S.polyline(pts, o));
      T.draw.walls.push({ pts: pts, r: o.r, color: o.color || 'cyan', mask: o.mask == null ? 1 : o.mask, neon: o.neon !== false, kind: o.kind || 'wall' });
      return segs;
    };
    const post = (x, y, r, o) => {
      o = Object.assign({ mat: 'rubber', kind: 'post' }, o || {});
      add(S.circle(x, y, r, o));
      T.draw.posts.push({ x: x, y: y, r: r, color: o.color || 'white', mask: o.mask == null ? 1 : o.mask });
    };
    const lineSensor = (id, ax, ay, bx, by, dx, dy, o) => {
      const s = Object.assign({ id: id, type: 'line', ax: ax, ay: ay, bx: bx, by: by, dx: dx, dy: dy, mask: 1 }, o || {});
      T.sensors.push(s);
      return s;
    };
    const circleSensor = (id, x, y, r, o) => {
      const s = Object.assign({ id: id, type: 'circle', x: x, y: y, r: r, mask: 1 }, o || {});
      T.sensors.push(s);
      return s;
    };
    T.helpers = { add: add, wall: wall, post: post, lineSensor: lineSensor, circleSensor: circleSensor };

    // ------------------------------------------------------------ cabinet ---
    // Top arc from the left wall over to the right edge of the shooter lane.
    const ARC_C = [255, 255], ARC_R = 243;
    add(S.arc(ARC_C[0], ARC_C[1], ARC_R, Math.PI, Math.PI, { mat: 'wall', r: 0 }));
    T.draw.walls.push({ arc: [ARC_C[0], ARC_C[1], ARC_R, Math.PI, Math.PI], r: 0, color: 'magenta', neon: true, outer: true });
    // Outer side walls (zero thickness, the cabinet is beyond them)
    // left cabinet wall below the orbit mouth (the upper part comes with the orbit)
    add(S.seg(12, 700, 12, 1060, { mat: 'wall' }));
    add(S.seg(498, 255, 498, 1068, { mat: 'wall' }));
    add(S.seg(466, 1068, 498, 1068, { mat: 'wall' }));
    T.draw.walls.push({ pts: [[12, 700], [12, 1000]], r: 0, color: 'magenta', neon: true, outer: true });
    T.draw.walls.push({ pts: [[498, 255], [498, 1068]], r: 0, color: 'magenta', neon: true, outer: true });
    T.landmarks.arc = { cx: ARC_C[0], cy: ARC_C[1], R: ARC_R };

    // Shooter lane inner wall (also the right outlane's outer wall)
    wall([[464, 1068], [464, 332]], { r: 2, mat: 'metal', color: 'violet' });
    post(464, 332, 3, { mat: 'metal', color: 'violet' });
    // One-way gate at the top of the shooter lane: lets the plunged ball out,
    // deflects balls coming down the arc into the right orbit lane instead.
    add(S.seg(466, 333, 498, 300, { mat: 'metal', r: 1.5, kind: 'gate', id: 'shooterGate', oneWay: { nx: -0.718, ny: -0.696 } }));
    T.draw.gates = [{ id: 'shooterGate', ax: 466, ay: 333, bx: 498, by: 300 }];

    // Plunger
    T.plunger = { x0: 466, x1: 498, y: 1002 };
    T.ballStart = { x: 482, y: 1002 - P.ballRadius - 0.2 };
    lineSensor('shooterLane', 466, 940, 498, 940, 0, -1, {});

    // ------------------------------------------------------- lower field ---
    // Flippers
    // pivots sit far enough apart that the gap between the resting tips stays
    // about 45 mm (1.7 balls) whatever the bat length
    const FL = { x: 147 - (P.flipperLength - 70) * Math.cos(P.flipperRestDeg * D), y: 935 };
    const FR = { x: mx(FL.x), y: FL.y };
    const flipDef = (id, side, p) => ({
      id: id, side: side, x: p.x, y: p.y,
      length: P.flipperLength, r1: P.flipperBaseRadius, r2: P.flipperTipRadius,
      restDeg: P.flipperRestDeg, upDeg: P.flipperUpDeg,
    });
    T.flippers.push(flipDef('L', 'L', FL));
    T.flippers.push(flipDef('R', 'R', FR));
    T.landmarks.flipperL = FL; T.landmarks.flipperR = FR;

    // Inlane guide (outlane/inlane divider). The diagonal runs at the flipper's
    // rest angle and ends just above the flipper base so the ball rolls straight
    // onto the bat and can rest in the cradle when the flipper is held up.
    const restA = P.flipperRestDeg * D;
    const ca = Math.cos(restA), sa = Math.sin(restA);
    // top surface of the resting bat, extended back toward the inlane
    const topX = FL.x + sa * P.flipperBaseRadius, topY = FL.y - ca * P.flipperBaseRadius;
    const gEnd = [topX - ca * 14 - sa * 3, topY - sa * 14 + ca * 3];
    const DIV_X = 51;
    const bendL = (gEnd[0] - DIV_X) / ca;
    const gBend = [DIV_X, gEnd[1] - sa * bendL];
    const DIV_TOP = 786;
    // Left divider + outlane channel wall
    const divL = [[DIV_X, DIV_TOP], gBend, gEnd];
    wall(divL, { r: 3, mat: 'metal', color: 'cyan' });
    wall([gBend, [DIV_X, 962]], { r: 3, mat: 'metal', color: 'cyan', neon: false });
    post(DIV_X, DIV_TOP - 2, 5, { color: 'cyan' });
    // Right mirror
    const divR = divL.map((p) => [mx(p[0]), p[1]]);
    wall(divR, { r: 3, mat: 'metal', color: 'cyan' });
    wall([[mx(gBend[0]), gBend[1]], [mx(DIV_X), 962]], { r: 3, mat: 'metal', color: 'cyan', neon: false });
    post(mx(DIV_X), DIV_TOP - 2, 5, { color: 'cyan' });
    T.landmarks.inlaneL = { x: (DIV_X + 93) / 2, y: 800 };
    T.landmarks.inlaneR = { x: mx((DIV_X + 93) / 2), y: 800 };

    // Slingshots: outer side runs parallel to the divider, lower side parallel to the
    // inlane diagonal, kicker face toward the centre.
    const SL_X = 93, SL_TOP = 756;
    const off = 42; // centre-line spacing between divider and sling walls (36 mm lane + walls)
    // lower edge line: divider diagonal shifted by `off` along its up-right normal (sa, -ca)
    const lx0 = gBend[0] + sa * off, ly0 = gBend[1] - ca * off;
    const tBL = (SL_X - lx0) / ca;
    const BL = [SL_X, ly0 + sa * tBL];
    const BR = [BL[0] + ca * 52, BL[1] + sa * 52];
    const TOP = [SL_X, SL_TOP];
    const sling = (id, top, bl, br, flip) => {
      // passive sides
      add(S.seg(top[0], top[1], bl[0], bl[1], { r: 3, mat: 'metal' }));
      add(S.seg(bl[0], bl[1], br[0], br[1], { r: 3, mat: 'metal' }));
      // rubber kicker face
      add(S.seg(top[0], top[1], br[0], br[1], { r: 7, mat: 'sling', kind: 'sling', id: id }));
      add(S.circle(top[0], top[1], 7, { mat: 'rubber', kind: 'post' }));
      add(S.circle(br[0], br[1], 7, { mat: 'rubber', kind: 'post' }));
      add(S.circle(bl[0], bl[1], 6, { mat: 'rubber', kind: 'post' }));
      T.draw.slings.push({ id: id, top: top, bl: bl, br: br, flip: flip });
      T.solids.push([top, bl, br]);
    };
    sling('slingL', TOP, BL, BR, false);
    sling('slingR', [mx(TOP[0]), TOP[1]], [mx(BL[0]), BL[1]], [mx(BR[0]), BR[1]], true);

    // Inlane / outlane rollovers
    lineSensor('outlaneL', 12, 830, DIV_X - 3, 830, 0, 1);
    lineSensor('inlaneL', DIV_X + 3, 820, SL_X - 3, 820, 0, 1);
    lineSensor('inlaneR', mx(SL_X - 3), 820, mx(DIV_X + 3), 820, 0, 1);
    lineSensor('outlaneR', mx(DIV_X - 3), 830, 462, 830, 0, 1);
    T.landmarks.rollovers = [
      { id: 'outlaneL', x: 31, y: 830 }, { id: 'inlaneL', x: 72, y: 820 },
      { id: 'inlaneR', x: mx(72), y: 820 }, { id: 'outlaneR', x: mx(31), y: 830 },
    ];

    // Kickback at the bottom of the left outlane
    lineSensor('kickback', 12, 925, DIV_X - 3, 925, 0, 1);
    T.landmarks.kickback = { x: 31, y: 945 };

    // Apron lip: keeps balls under the apron from bouncing back into view
    add(S.seg(12, 1040, 462, 1040, { mat: 'wall', r: 0 }));

    if (NN.buildUpperTable) NN.buildUpperTable(T, P);
    return T;
  };
})(globalThis.NN || (globalThis.NN = {}));
