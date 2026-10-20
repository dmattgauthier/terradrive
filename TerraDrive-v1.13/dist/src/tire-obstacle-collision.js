import * as CANNON from '../vendor/cannon-es.js';

const V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** The spring/tread solver owns rolling support. These finite-width tire
 * primitives supply only sidewall collisions with solid obstacles, where a
 * circular rolling-plane sweep would incorrectly let a sideways-sliding tire
 * climb like a ball. No speed-triggered roll torque or forced flip is used. */
export function createTireObstacleShapes(body, wheels, spec) {
  const inertia = body.inertia.clone(), inverse = body.invInertia.clone();
  const entries = wheels.map(wheel => {
    const shape = spec.tracks ? new CANNON.Box(V(spec.tracks.width * .5, .12, spec.tracks.length * .5))
      : new CANNON.Cylinder(spec.tireRadius, spec.tireRadius, spec.tireWidth, 12);
    shape.terraSidewallWheel = wheel;
    const index = body.shapes.length;
    body.addShape(shape, V());
    return { wheel, shape, index };
  });
  // Wheel rotational inertia already lives in the tire solve. Contact proxy
  // installation must not double-count it or change the chassis CG/tensor.
  body.inertia.copy(inertia); body.invInertia.copy(inverse); body.updateInertiaWorld(true);
  const sideways = new CANNON.Quaternion().setFromAxisAngle(V(0, 0, 1), -Math.PI / 2);
  return () => {
    for (const { wheel, index } of entries) {
      body.shapeOffsets[index].set(wheel.mount.x, wheel.mount.y - wheel.length + (spec.tracks ? -spec.tireRadius + .12 : 0), wheel.mount.z);
      const steer = new CANNON.Quaternion().setFromAxisAngle(V(0, 1, 0), wheel.steer);
      if (spec.tracks) body.shapeOrientations[index].copy(steer);
      else steer.mult(sideways, body.shapeOrientations[index]);
    }
    body.aabbNeedsUpdate = true;
    if (body.world) body.world.broadphase.dirty = true;
  };
}

function sameContact(equation, contact) {
  return equation.bi === contact.bi && equation.bj === contact.bj
    && equation.ri.distanceSquared(contact.ri) < 1e-16 && equation.rj.distanceSquared(contact.rj) < 1e-16;
}

export function installTireObstacleCollision(world) {
  if (world._terraTireObstacleCollision) return world._terraTireObstacleCollision;
  const narrowphase = world.narrowphase, original = narrowphase.getContacts;
  const state = { stats: { generated: 0, retained: 0, rejected: 0 } };
  narrowphase.getContacts = function(p1, p2, activeWorld, contacts, oldContacts, friction, frictionPool) {
    original.call(this, p1, p2, activeWorld, contacts, oldContacts, friction, frictionPool);
    for (const equation of friction) equation.terraForceToImpulseScale = 1;
    const rejected = [], retained = [], counts = new Map();
    let write = 0, generated = 0;
    for (const contact of contacts) {
      const tireShape = contact.si?.terraSidewallWheel ? contact.si : contact.sj?.terraSidewallWheel ? contact.sj : null;
      if (!tireShape) { contacts[write++] = contact; continue; }
      generated++;
      const wheel = tireShape.terraSidewallWheel, body = tireShape === contact.si ? contact.bi : contact.bj;
      const other = body === contact.bi ? contact.bj : contact.bi;
      const axle = body.quaternion.vmult(V(Math.cos(wheel.steer), 0, -Math.sin(wheel.steer)));
      const sidewall = Math.abs(contact.ni.dot(axle)) >= .92;
      const supportNormal = contact.ni.scale(body === contact.bi ? -1 : 1);
      const up = body.quaternion.vmult(V(0, 1, 0));
      const bearing = wheel.contact && wheel.obstacleHit?.obstacle === other.terraObstacle;
      // A taller face above the hub cannot be climbed by the suspension cast.
      // Retain its obstructing tire contact; ordinary rolling support remains
      // exclusively in the spring/tread solve so a log is not counted twice.
      const obstruction = !bearing && supportNormal.dot(up) < .20;
      if (!sidewall && !obstruction) { rejected.push(contact); continue; }
      // Tire pressure/load already determines carcass travel. Reuse that
      // compliance for a bounded sidewall contact stiffness; this is an explicit
      // estimate, not named-tire laboratory lateral-impact calibration.
      const stiffness = clamp(wheel.staticLoad * 3 / Math.max(.008, wheel.deflection), 120000, 2400000);
      contact.setSpookParams(stiffness, 4, activeWorld.dt);
      retained.push(contact); contacts[write++] = contact;
      counts.set(other, (counts.get(other) || 0) + 1);
    }
    contacts.length = write;
    if (generated) {
      let f = 0;
      for (const equation of friction) {
        if (rejected.some(contact => sameContact(equation, contact))) { frictionPool.push(equation); continue; }
        const sidewall = retained.find(contact => sameContact(equation, contact));
        if (sidewall) {
          const other = sidewall.si.terraSidewallWheel ? sidewall.bj : sidewall.bi;
          const scale = activeWorld.dt / Math.max(1, counts.get(other));
          equation.minForce *= scale; equation.maxForce *= scale;
          equation.terraForceToImpulseScale = scale;
        }
        friction[f++] = equation;
      }
      friction.length = f; this.contactPointPool.push(...rejected);
    }
    state.stats = { generated, retained: retained.length, rejected: rejected.length };
  };
  world._terraTireObstacleCollision = state;
  return state;
}
