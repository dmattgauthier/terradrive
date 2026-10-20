import { Vec3, Quaternion } from '../vendor/cannon-es.js';
import { winchMountLocal } from './recovery-mount.js?v=1.15.0';

// Optional aftermarket simulation kit, based on the WARN VR EVO 12 steel-line
// capacity and dimensions. Mount compatibility, cable compliance, motor curve,
// overload response and soil recovery remain explicit simulation estimates.
// Source: https://www.warn.com/products/vr-evo-12-winch-103254
export const WINCH_SPEC = Object.freeze({
  ratedPull: 12000 * 4.4482216153,
  ropeLength: 25.9,
  usableLength: 24.5,
  ropeDiameter: .0095,
  minLength: 1.15,
  noLoadSpeed: 8 / 60,
  loadedSpeed: 1.2 / 60,
  attachSpeed: .35,
  maxAngle: 80 * Math.PI / 180,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const point = v => ({ x: v.x, y: v.y, z: v.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const valid = v => v && [v.x, v.y, v.z].every(Number.isFinite);

/** A unilateral, finite cable attached to a fixed standing tree. The drum brake
 * holds deployed length when the remote is released. Force acts at the fairlead,
 * every physics substep, allowing yaw/pitch/roll instead of moving the chassis.
 */
export class WinchRecovery {
  constructor(physics, terrain, getAnchors) {
    this.physics = physics;
    this.terrain = terrain;
    this.getAnchors = getAnchors;
    this.equipped = false;
    this.anchor = null;
    this.command = 0;
    this.ropeLength = 0;
    this.tension = 0;
    this.lineSpeed = 0;
    this.status = 'Kit not fitted';
    this.message = '';
    this._checkIn = 0;
    this._shockTime = 0;
    this._blocked = '';
    this._force = new Vec3();
    this._relative = new Vec3();
    this._velocity = new Vec3();
    this._hook = new Vec3();
    this._local = new Vec3();
    this._direction = new Vec3();
    this._forward = new Vec3();
  }

  hookPoint() {
    const mount = winchMountLocal(this.physics.spec);
    this._local.set(mount.x, mount.y, mount.z);
    this.physics.body.pointToWorldFrame(this._local, this._hook);
    return point(this._hook);
  }

  _standingTrees() {
    return (this.getAnchors?.() || []).filter(tree => tree?.id && !tree.broken &&
      Number.isFinite(tree.x) && Number.isFinite(tree.z) && (tree.obstacle?.height ?? tree.height ?? 10) > 2);
  }

  _treePoint(tree, hook) {
    const radius = tree.obstacle?.radius ?? tree.trunkRadius ?? .32;
    const span = Math.hypot(hook.x - tree.x, hook.z - tree.z) || 1;
    return {
      x: tree.x + (hook.x - tree.x) / span * (radius + .035),
      y: (tree.y ?? this.terrain.heightAt?.(tree.x, tree.z) ?? this.terrain.sample(tree.x, tree.z).height) + .70,
      z: tree.z + (hook.z - tree.z) / span * (radius + .035),
    };
  }

  _angle(hook, anchor) {
    const body = this.physics.body;
    body.quaternion.vmult(new Vec3(0, 0, 1), this._forward);
    const dx = anchor.x - hook.x, dz = anchor.z - hook.z;
    // Signed bearing in the horizontal plane: +X is driver-left.
    return Math.atan2(dx * this._forward.z - dz * this._forward.x, dx * this._forward.x + dz * this._forward.z);
  }

  _lineObstruction(hook, anchor, anchorId) {
    const length = distance(hook, anchor), steps = Math.min(90, Math.max(8, Math.ceil(length / .28)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = hook.x + (anchor.x - hook.x) * t, z = hook.z + (anchor.z - hook.z) * t;
      const y = hook.y + (anchor.y - hook.y) * t;
      const height = this.terrain.heightAt?.(x, z) ?? this.terrain.sample(x, z).height;
      if (height > y + .025) return 'Ground blocks the cable. Reposition for a clear pull.';
    }
    // Trees are narrow, so test segment/cylinder intersections analytically.
    const dx = anchor.x - hook.x, dz = anchor.z - hook.z, length2 = dx * dx + dz * dz;
    for (const tree of this._standingTrees()) {
      if (tree.id === anchorId) continue;
      const t = clamp(((tree.x - hook.x) * dx + (tree.z - hook.z) * dz) / Math.max(.001, length2), 0, 1);
      if (t < .01 || t > .99) continue;
      const gap = Math.hypot(hook.x + dx * t - tree.x, hook.z + dz * t - tree.z);
      if (gap < (tree.obstacle?.radius ?? tree.trunkRadius ?? .32) + .025) return 'Another tree blocks the cable. Choose a clear anchor.';
    }
    // Separate scene colliders (signs, buildings and fallen logs) are not in the
    // terrain height field. A segment/slab test keeps cable out of their boxes.
    for (const obstacle of this.terrain.obstacles || []) {
      if (obstacle.id === anchorId || obstacle.shape !== 'box' || !obstacle.center || !obstacle.halfExtents) continue;
      const q = obstacle.quaternion || { x: 0, y: 0, z: 0, w: 1 };
      const inverse = new Quaternion(-q.x, -q.y, -q.z, q.w);
      const localStart = inverse.vmult(new Vec3(hook.x - obstacle.center.x, hook.y - obstacle.center.y, hook.z - obstacle.center.z));
      const localEnd = inverse.vmult(new Vec3(anchor.x - obstacle.center.x, anchor.y - obstacle.center.y, anchor.z - obstacle.center.z));
      let enter = 0, leave = 1;
      for (const axis of ['x', 'y', 'z']) {
        const delta = localEnd[axis] - localStart[axis], extent = obstacle.halfExtents[axis] + .012;
        if (Math.abs(delta) < 1e-8) { if (Math.abs(localStart[axis]) > extent) { enter = 2; break; } }
        else {
          const a = (-extent - localStart[axis]) / delta, b = (extent - localStart[axis]) / delta;
          enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
        }
      }
      if (enter <= leave && enter < .99 && leave > .01) return 'An obstacle blocks the cable. Reposition for a clear pull.';
    }
    return '';
  }

  candidates() {
    const hook = this.hookPoint();
    return this._standingTrees().map(tree => {
      const anchor = this._treePoint(tree, hook);
      const span = distance(hook, anchor), bearing = this._angle(hook, anchor);
      return { id: tree.id, center: { x: tree.x, y: tree.y ?? anchor.y - .7, z: tree.z },
        radius: tree.obstacle?.radius ?? tree.trunkRadius ?? .32,
        point: anchor, distance: span, bearing };
    }).filter(tree => tree.distance >= 2 && tree.distance <= WINCH_SPEC.usableLength - .2 && Math.abs(tree.bearing) <= WINCH_SPEC.maxAngle)
      .sort((a, b) => a.distance - b.distance).slice(0, 12).map(tree => {
        const obstruction = this._lineObstruction(hook, tree.point, tree.id);
        return { ...tree, available: !obstruction, reason: obstruction };
      });
  }

  setEquipped(enabled) {
    if (this.physics.body.velocity.length() > WINCH_SPEC.attachSpeed) return { ok: false, message: 'Stop before fitting or removing the winch.' };
    if (!enabled) this.detach();
    this.equipped = !!enabled;
    this.status = enabled ? 'Choose a tree anchor' : 'Kit not fitted';
    this.message = '';
    return { ok: true, message: enabled ? 'Recovery winch fitted. Choose a tree ahead in the Winch panel.' : 'Recovery winch removed.' };
  }

  attach(anchorId) {
    if (!this.equipped) return { ok: false, message: 'Fit the recovery winch first.' };
    if (this.anchor) return { ok: false, message: 'Detach the current cable before choosing another tree.' };
    if (this.physics.body.velocity.length() > WINCH_SPEC.attachSpeed) return { ok: false, message: 'Stop the vehicle before attaching the cable.' };
    const candidate = this.candidates().find(tree => tree.id === anchorId);
    if (!candidate) return { ok: false, message: 'Choose a standing tree ahead, within 24 m of the bumper.' };
    if (!candidate.available) return { ok: false, message: candidate.reason };
    this.anchor = candidate;
    this.ropeLength = Math.min(WINCH_SPEC.usableLength, candidate.distance + .18);
    this.tension = 0; this.lineSpeed = 0; this.command = 0;
    this._checkIn = 0; this._shockTime = 0; this._blocked = '';
    this.message = ''; this.status = 'Attached · hold E to reel in';
    return { ok: true, message: 'Cable attached around the tree with a strap. Hold E to reel in; Q pays out.' };
  }

  detach(message = '') {
    this.anchor = null; this.command = 0; this.ropeLength = 0; this.tension = 0; this.lineSpeed = 0;
    this._checkIn = 0; this._shockTime = 0; this._blocked = '';
    this._force.set(0, 0, 0);
    this.message = message;
    this.status = message || (this.equipped ? 'Choose a tree anchor' : 'Kit not fitted');
  }

  setCommand(command) {
    this.command = this.equipped && this.anchor ? clamp(Number(command) || 0, -1, 1) : 0;
  }

  step(dt) {
    this.lineSpeed = 0; this.tension = 0; this._force.set(0, 0, 0);
    if (!this.equipped || !this.anchor || !(dt > 0)) return;
    const tree = this._standingTrees().find(tree => tree.id === this.anchor.id);
    if (!tree) return this.detach('Anchor tree failed · cable released');
    const body = this.physics.body, hook = this.hookPoint(), anchor = this.anchor.point;
    if (!valid(hook) || !valid(anchor)) return this.detach('Cable released');
    const span = distance(hook, anchor);
    if (span > WINCH_SPEC.usableLength + 1.5) return this.detach('Cable overloaded · line released');
    if (Math.abs(this._angle(hook, anchor)) > 100 * Math.PI / 180) return this.detach('Pull moved behind the fairlead · line released');
    this._checkIn -= dt;
    if (this._checkIn <= 0) {
      this._blocked = this._lineObstruction(hook, anchor, this.anchor.id);
      this._checkIn = .12;
    }
    if (this._blocked) return this.detach(this._blocked + ' Cable released.');

    this._direction.set(anchor.x - hook.x, anchor.y - hook.y, anchor.z - hook.z);
    this._direction.scale(1 / Math.max(.001, span), this._direction);
    body.getVelocityAtWorldPoint(this._hook, this._velocity);
    const distanceRate = -this._velocity.dot(this._direction);
    // Effective wire-rope stiffness uses a compliant numerical cable. The drum
    // radius estimate reduces line pull as more rope winds onto outer layers.
    const deployed = clamp(this.ropeLength / WINCH_SPEC.usableLength, 0, 1);
    const availablePull = WINCH_SPEC.ratedPull * (.60 + .40 * deployed);
    const stiffness = clamp(4.5e6 / Math.max(3, this.ropeLength), 150000, 500000);
    const extension = Math.max(0, span - this.ropeLength);
    const preTension = extension > 0 ? Math.max(0, stiffness * extension + 8000 * distanceRate) : 0;
    const load = preTension / availablePull;
    const stoppingDistance = Math.max(0, span - 1.5);
    if (this.command > 0 && load < 1.02 && this.ropeLength > WINCH_SPEC.minLength && stoppingDistance > 0) {
      const speed = (WINCH_SPEC.noLoadSpeed * Math.pow(1 - clamp(load, 0, 1), 1.6) + WINCH_SPEC.loadedSpeed * clamp(load, 0, 1)) * this.command;
      this.lineSpeed = Math.min(speed, (this.ropeLength - WINCH_SPEC.minLength) / dt, stoppingDistance / dt);
      this.ropeLength -= this.lineSpeed * dt;
    } else if (this.command < 0 && this.ropeLength < WINCH_SPEC.usableLength) {
      this.lineSpeed = -Math.min(WINCH_SPEC.noLoadSpeed * -this.command, (WINCH_SPEC.usableLength - this.ropeLength) / dt);
      this.ropeLength -= this.lineSpeed * dt;
    }
    const stretch = Math.max(0, span - this.ropeLength);
    const rawTension = stretch > 0 ? Math.max(0, stiffness * stretch + 8000 * (distanceRate + this.lineSpeed)) : 0;
    this._shockTime = rawTension > WINCH_SPEC.ratedPull * 1.85 ? this._shockTime + dt : Math.max(0, this._shockTime - dt * 2);
    if (this._shockTime > .12) return this.detach('Cable overloaded · line released');
    this.tension = Math.min(rawTension, WINCH_SPEC.ratedPull * 1.7);
    this._direction.scale(this.tension, this._force);
    this._relative.set(hook.x - body.position.x, hook.y - body.position.y, hook.z - body.position.z);
    if (this.tension > 0) { body.wakeUp(); body.applyForce(this._force, this._relative); }
    this.status = this.command < 0 ? this.lineSpeed < 0 ? 'Paying out' : 'Cable fully deployed' : this.command > 0 ?
      span <= 1.5 || this.ropeLength <= WINCH_SPEC.minLength ? 'At the anchor · detach line' : load >= 1.02 ? 'Motor stalled · reduce load' : this.tension < 400 ? 'Taking up slack' : 'Pulling' :
      this.tension > 400 ? 'Drum brake holding' : 'Cable slack · hold E to reel in';
  }

  get state() {
    const hook = this.hookPoint(), span = this.anchor ? distance(hook, this.anchor.point) : 0;
    return {
      equipped: this.equipped, attached: !!this.anchor, anchorId: this.anchor?.id ?? null,
      hook, anchor: this.anchor ? { ...this.anchor.point } : null,
      treeCenter: this.anchor ? { ...this.anchor.center } : null, treeRadius: this.anchor?.radius ?? 0,
      ropeLength: this.ropeLength, distance: span, tension: this.tension,
      ratedPull: WINCH_SPEC.ratedPull, availablePull: WINCH_SPEC.ratedPull * (.60 + .40 * clamp(this.ropeLength / WINCH_SPEC.usableLength, 0, 1)),
      lineSpeed: this.lineSpeed, command: this.command, status: this.status, message: this.message,
      anchorForce: { x: -this._force.x, y: -this._force.y, z: -this._force.z },
    };
  }
}
