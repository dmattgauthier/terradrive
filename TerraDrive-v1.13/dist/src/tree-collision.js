import * as CANNON from '../vendor/cannon-es.js';
import { applyTreeAngularImpulse, syncTreeObstacle } from './tree-dynamics.js?v=1.15.0';

/** Couple Cannon's contact manifold to the tree's one-degree-of-freedom hinge.
 * A kinematic trunk supplies geometry and contact velocity, but is NOT treated
 * as an infinite-mass animated wall: each equation includes the hinge's finite
 * inverse inertia. Its linear and angular constraint velocities are coupled
 * about the fixed root. The same solver therefore shares impulses across the
 * vehicle, the tree and simultaneous ordinary contacts.
 *
 * The trunk pose is integrated only by tree-dynamics. Cannon must not integrate
 * it a second time. Contacts are stock Cannon equations with one extra mass
 * contribution; pooled equations are restored automatically on ordinary pairs.
 */
const V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
const proto = CANNON.Equation.prototype;

function hingeTerms(equation) {
  const body = equation.bi.terraObstacle?.treeFall ? equation.bi
    : equation.bj.terraObstacle?.treeFall ? equation.bj : null;
  if (!body) return null;
  const state = body.terraObstacle.treeFall;
  const jacobian = body === equation.bi ? equation.jacobianElementA : equation.jacobianElementB;
  const arm = body.position.vsub(V(state.pivot.x, state.pivot.y, state.pivot.z));
  const axis = V(state.axis.x, state.axis.y, state.axis.z);
  const linear = axis.cross(arm);
  const lever = jacobian.spatial.dot(linear) + jacobian.rotational.dot(axis);
  return { body, state, axis, linear, lever };
}

function finiteHingeMass() {
  const ordinary = proto.computeGiMGt.call(this), hinge = hingeTerms(this);
  this.terraHingeTerms = hinge;
  return ordinary + (hinge ? hinge.lever * hinge.lever / hinge.state.inertia : 0);
}

function addHingeVelocity(deltaLambda) {
  proto.addToWlambda.call(this, deltaLambda);
  const hinge = this.terraHingeTerms;
  if (!hinge) return;
  const change = hinge.lever * deltaLambda / hinge.state.inertia;
  hinge.body.vlambda.addScaledVector(change, hinge.linear, hinge.body.vlambda);
  hinge.body.wlambda.addScaledVector(change, hinge.axis, hinge.body.wlambda);
}

function prepareEquation(equation) {
  // Contact and friction equations are pooled across different body pairs.
  // These guards inspect the CURRENT pair, so no stale tree mass can leak into
  // a later rock, challenge deck or standing-tree collision.
  equation.computeGiMGt = finiteHingeMass;
  equation.addToWlambda = addHingeVelocity;
}

export function installTreeCollision(world) {
  if (world._terraTreeCollision) return world._terraTreeCollision;
  const narrowphase = world.narrowphase, original = narrowphase.getContacts;
  const bridge = { equations: [], stats: { contacts: 0, frictionEquations: 0, normalImpulse: 0 } };
  const anchor = new CANNON.Body({ mass: 0, collisionFilterGroup: 0, collisionFilterMask: 0 });
  const groundEquations = new WeakMap();
  narrowphase.getContacts = function(p1, p2, activeWorld, contacts, oldContacts, friction, frictionPool) {
    original.call(this, p1, p2, activeWorld, contacts, oldContacts, friction, frictionPool);
    bridge.equations.length = 0;
    bridge.stats = { contacts: 0, frictionEquations: 0, normalImpulse: 0 };
    const counts = new Map();
    for (const contact of contacts) {
      const trunk = contact.bi.terraObstacle?.treeFall ? contact.bi
        : contact.bj.terraObstacle?.treeFall ? contact.bj : null;
      if (!trunk) continue;
      prepareEquation(contact); bridge.equations.push(contact); bridge.stats.contacts++;
      counts.set(trunk, (counts.get(trunk) || 0) + 1);
    }
    for (const equation of friction) {
      const trunk = equation.bi.terraObstacle?.treeFall ? equation.bi
        : equation.bj.terraObstacle?.treeFall ? equation.bj : null;
      if (!trunk) continue;
      prepareEquation(equation); bridge.equations.push(equation); bridge.stats.frictionEquations++;
      // This Cannon build clamps lambda (impulse), although its friction factory
      // returns mu*m*g (force). Convert units and share the budget per manifold.
      const scale = activeWorld.dt / Math.max(1, counts.get(trunk) || 1) / (equation.terraForceToImpulseScale || 1);
      equation.minForce *= scale; equation.maxForce *= scale;
    }
    for (const trunk of activeWorld.bodies) {
      const fall = trunk.terraObstacle?.treeFall;
      if (!fall?.contactDirection || !Number.isFinite(fall.contactAngle)
        || Math.abs(fall.angle - fall.contactAngle) > .0001) continue;
      let ground = groundEquations.get(trunk);
      if (!ground) {
        ground = new CANNON.Equation(trunk, anchor, 0, 1e9);
        ground.computeB = function() { return -this.computeGW(); };
        prepareEquation(ground); groundEquations.set(trunk, ground);
      }
      // One unilateral constraint governs the whole trunk. Gating individual
      // tree contacts loses the weight of an object above it when another
      // object lifts from below. All contacts retain finite inertia; this row
      // only prevents the NET angular velocity from moving into the ground.
      ground.jacobianElementA.spatial.setZero();
      ground.jacobianElementA.rotational.set(-fall.axis.x * fall.contactDirection,
        -fall.axis.y * fall.contactDirection, -fall.axis.z * fall.contactDirection);
      ground.jacobianElementB.spatial.setZero(); ground.jacobianElementB.rotational.setZero();
      ground.eps = 1e-12; ground.multiplier = 0;
      activeWorld.solver.addEquation(ground); bridge.equations.push(ground);
    }
  };
  bridge.finish = dt => {
    const impulses = new Map();
    for (const equation of bridge.equations) {
      if (!equation.enabled || !Number.isFinite(equation.multiplier)) continue;
      const trunk = equation.bi.terraObstacle?.treeFall ? equation.bi
        : equation.bj.terraObstacle?.treeFall ? equation.bj : null;
      if (!trunk) continue;
      const hinge = equation.terraHingeTerms;
      if (!hinge || hinge.body !== trunk) continue;
      impulses.set(trunk, (impulses.get(trunk) || 0) + hinge.lever * equation.multiplier * dt);
      if (equation.ni) bridge.stats.normalImpulse += Math.abs(equation.multiplier * dt);
    }
    for (const [trunk, angularImpulse] of impulses) {
      // Apply the solved total, including the unilateral ground reaction, once.
      // Replaying contact impulses individually would change the active ground
      // constraint halfway through the manifold.
      applyTreeAngularImpulse(trunk.terraObstacle.treeFall, angularImpulse, { constrained: true });
      const fall = trunk.terraObstacle.treeFall;
      const inward = fall.angularSpeed * fall.contactDirection;
      if (fall.contactDirection && Math.abs(fall.angle - fall.contactAngle) < .0001 && inward >= 0 && inward < 1e-5) {
        // Project only the sub-millimetre solver residual onto the active
        // unilateral rest constraint. Real outward motion still releases it.
        applyTreeAngularImpulse(fall, -fall.angularSpeed * fall.inertia, { constrained: true });
        fall.settled = true; fall.settlingAge = 0;
      }
      syncTreeObstacle(trunk.terraObstacle);
      const state = trunk.terraObstacle.treeFall;
      trunk.velocity.copy(state.velocity); trunk.angularVelocity.copy(state.angularVelocity);
    }
  };
  world._terraTreeCollision = bridge;
  return bridge;
}
