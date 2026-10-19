/*
 * Flipper: a tapered capsule (big round base, smaller round tip) rotating about
 * its pivot. It is a kinematic body driven like a real flipper: a strong coil
 * snaps it up in about 30 ms and a weaker spring drops it back. Collisions use
 * the true surface velocity at the contact point, so tip shots are strong and
 * shots near the base are soft.
 *
 * Angles are screen angles (y down): 0 points right, +90deg points down.
 */
(function (NN) {
  'use strict';

  function Flipper(o, P) {
    this.id = o.id;
    this.side = o.side;              // 'L' (points right) or 'R' (points left)
    this.px = o.x; this.py = o.y;
    this.upper = !!o.upper;
    this.length = o.length;
    this.r1 = o.r1; this.r2 = o.r2;
    const d = Math.PI / 180;
    if (this.side === 'L') {
      this.rest = o.restDeg * d;      // below horizontal -> positive screen angle
      this.up = -o.upDeg * d;
    } else {
      this.rest = Math.PI - o.restDeg * d;
      this.up = Math.PI + o.upDeg * d;
    }
    this.dirUp = this.up > this.rest ? 1 : -1;
    this.angle = this.rest;
    this.omega = 0;
    this.pressed = false;
    this.enabled = true;
    this.mat = NN.MATERIALS.flipper;
    this.P = P;
    this.cos = Math.cos(this.angle); this.sin = Math.sin(this.angle);
    this.reach = this.length + this.r2 + 2;
    this.atUp = false;
  }

  Flipper.prototype.update = function (dt) {
    const P = this.P;
    const energised = this.pressed && this.enabled;
    const accelUp = P.flipperUpAccel * P.flipperSpeed * (this.upper ? 1.05 : 1);
    const maxUp = P.flipperUpMaxSpeed * P.flipperPower;
    const accelDown = P.flipperDownAccel;
    const maxDown = P.flipperDownMaxSpeed;
    const du = this.dirUp;
    // progress 0 at rest, 1 fully up
    if (energised) {
      this.omega += du * accelUp * dt;
      if (this.omega * du > maxUp) this.omega = du * maxUp;
    } else {
      this.omega -= du * accelDown * dt;
      if (-this.omega * du > maxDown) this.omega = -du * maxDown;
    }
    this.angle += this.omega * dt;
    this.atUp = false;
    if ((this.angle - this.up) * du >= 0) {
      // end-of-stroke stop
      this.angle = this.up;
      if (this.omega * du > 0) this.omega = 0;
      this.atUp = true;
    } else if ((this.angle - this.rest) * du <= 0) {
      this.angle = this.rest;
      if (this.omega * du < 0) {
        const b = -this.omega * P.flipperRestBounce;
        this.omega = Math.abs(b) > 2 ? b : 0;
      }
    }
    this.cos = Math.cos(this.angle);
    this.sin = Math.sin(this.angle);
  };

  // How far up the flipper is, 0..1
  Flipper.prototype.progress = function () {
    return (this.angle - this.rest) / (this.up - this.rest);
  };

  // Closest point query in world space. Writes nx, ny (outward), d (distance from surface),
  // lat (signed lateral coordinate in the flipper frame), ax (axial coordinate).
  Flipper.prototype.closest = function (x, y, out) {
    const dx = x - this.px, dy = y - this.py;
    const c = this.cos, s = this.sin;
    const ax = dx * c + dy * s;          // along the bat
    const lat = -dx * s + dy * c;        // perpendicular
    const h = this.length, r1 = this.r1, r2 = this.r2;
    const px = Math.abs(lat), py = ax;
    const b = (r1 - r2) / h;
    const a = Math.sqrt(1 - b * b);
    const k = -b * px + a * py;
    let nl, na, d;
    if (k < 0) {
      const L = Math.sqrt(px * px + py * py) || 1e-7;
      d = L - r1; nl = px / L; na = py / L;
    } else if (k > a * h) {
      const qy = py - h;
      const L = Math.sqrt(px * px + qy * qy) || 1e-7;
      d = L - r2; nl = px / L; na = qy / L;
    } else {
      d = px * a + py * b - r1; nl = a; na = b;
    }
    if (lat < 0) nl = -nl;
    // back to world: lateral axis is (-s, c), axial is (c, s)
    out.nx = -s * nl + c * na;
    out.ny = c * nl + s * na;
    out.d = d;
    out.lat = lat;
    out.ax = ax;
  };

  // Half thickness of the bat at axial position ax (used by the anti-tunnel guard)
  Flipper.prototype.halfWidthAt = function (ax) {
    const t = Math.max(0, Math.min(1, ax / this.length));
    return this.r1 + (this.r2 - this.r1) * t;
  };

  NN.Flipper = Flipper;
})(globalThis.NN || (globalThis.NN = {}));
