import * as CANNON from '../vendor/cannon-es.js';

/** Cannon represents a concave deck with convex pieces. Their shared internal
 * faces are bookkeeping boundaries, not extra walls. Filter those contacts
 * before the solver, retain a spatially distributed surface manifold and share
 * Cannon's existing chassis-friction budget across that manifold.
 *
 * Tire grip is still solved separately by VehiclePhysics. This does not add
 * adhesion, alter gravity, move a vehicle onto a route, or remove exposed sides
 * and undersides. Standalone boxes (pylons/slalom blocks) are unchanged.
 */
export function installChallengeCollisionFilter(world, course) {
  if (world._terraChallengeCollisionFilter) {
    world._terraChallengeCollisionFilter.course = course;
    return world._terraChallengeCollisionFilter;
  }
  const narrowphase = world.narrowphase, original = narrowphase.getContacts;
  const state = { course, stats: { generated: 0, internalRejected: 0, redundantRemoved: 0, retained: 0, frictionEquations: 0 } };
  const vec = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
  const inverse = new CANNON.Quaternion(), worldNormal = vec(), localNormal = vec(), worldPoint = vec(), localPoint = vec(), planeDelta = vec();
  const bodyHasDeck = body => body.shapes.some(shape => !!shape.terraCourse);

  function classify(contact) {
    const shapeA = !!contact.si?.terraCourse, shape = shapeA ? contact.si : contact.sj;
    if (!shape?.terraCourse) return null;
    const body = shapeA ? contact.bi : contact.bj, other = shapeA ? contact.bj : contact.bi;
    const metadata = shape.terraCourse, shapeIndex = body.shapes.indexOf(shape);
    if (shapeIndex < 0 || !Array.isArray(metadata.exposedFaces)) return null;
    const relative = shapeA ? contact.ri : contact.rj;
    body.position.vadd(relative, worldPoint); body.pointToLocalFrame(worldPoint, localPoint);
    localPoint.vsub(body.shapeOffsets[shapeIndex], localPoint);
    body.shapeOrientations[shapeIndex].conjugate(inverse); inverse.vmult(localPoint, localPoint);
    contact.ni.scale(shapeA ? 1 : -1, worldNormal); body.vectorToLocalFrame(worldNormal, localNormal); inverse.vmult(localNormal, localNormal);
    let faceIndex = -1, alignment = -.5;
    for (const index of metadata.exposedFaces) {
      const normal = shape.faceNormals[index], anchor = shape.vertices[shape.faces[index][0]];
      localPoint.vsub(anchor, planeDelta);
      const distance = Math.abs(planeDelta.dot(normal)), match = localNormal.dot(normal);
      // Contact clipping can return a point slightly along a neighboring edge.
      // The plane proximity and outward normal must both identify a real face.
      if (distance <= .065 && match >= .50 && match > alignment) { alignment = match; faceIndex = index; }
    }
    if (faceIndex < 0) return { rejected: true };
    const normal = shape.faceNormals[faceIndex];
    if (faceIndex < 2) {
      body.shapeOrientations[shapeIndex].vmult(normal, worldNormal); body.quaternion.vmult(worldNormal, worldNormal);
      worldNormal.scale(shapeA ? 1 : -1, contact.ni);
    }
    const a = contact.bi.position.vadd(contact.ri), b = contact.bj.position.vadd(contact.rj);
    const penetration = Math.max(0, -b.vsub(a).dot(contact.ni));
    return { contact, point: worldPoint.clone(), normal: worldNormal.clone(), penetration, other,
      key: `${other.id}:${metadata.featureId}:${faceIndex === 0 ? 'top' : faceIndex === 1 ? 'underside' : 'side'}` };
  }

  function manifold(candidates) {
    // Keep the deepest representative where adjacent convexes report the same
    // patch. Then retain distant support points so a long chassis cannot rock
    // around a single central collision point.
    const clustered = [];
    for (const item of candidates.sort((a, b) => b.penetration - a.penetration)) {
      if (!clustered.some(old => old.point.distanceSquared(item.point) < .32 ** 2 && old.normal.dot(item.normal) > .985)) clustered.push(item);
    }
    if (clustered.length <= 8) return clustered;
    const chosen = [clustered.shift()];
    while (chosen.length < 8 && clustered.length) {
      let selected = 0, score = -1;
      for (let i = 0; i < clustered.length; i++) {
        const distance = Math.min(...chosen.map(old => old.point.distanceSquared(clustered[i].point)));
        const value = distance + Math.min(.12, clustered[i].penetration) * .20;
        if (value > score) { score = value; selected = i; }
      }
      chosen.push(clustered.splice(selected, 1)[0]);
    }
    return chosen;
  }

  narrowphase.getContacts = function(p1, p2, activeWorld, contacts, oldContacts, friction, frictionPool) {
    original.call(this, p1, p2, activeWorld, contacts, oldContacts, friction, frictionPool);
    const stats = { generated: 0, internalRejected: 0, redundantRemoved: 0, retained: 0, frictionEquations: 0 };
    const ordinary = [], buckets = new Map(), deckContacts = [], rejected = [];
    for (const contact of contacts) {
      const entry = classify(contact);
      if (!entry) { ordinary.push(contact); continue; }
      stats.generated++;
      if (entry.rejected) { stats.internalRejected++; rejected.push(contact); continue; }
      let bucket = buckets.get(entry.key); if (!bucket) buckets.set(entry.key, bucket = []); bucket.push(entry);
    }
    if (stats.generated === 0) { state.stats = stats; return; }
    const retained = new Set();
    for (const bucket of buckets.values()) for (const item of manifold(bucket)) { retained.add(item.contact); deckContacts.push(item); }
    for (const bucket of buckets.values()) for (const item of bucket) if (!retained.has(item.contact)) { rejected.push(item.contact); stats.redundantRemoved++; }
    stats.retained = deckContacts.length;
    contacts.length = 0; contacts.push(...ordinary, ...deckContacts.map(item => item.contact));
    this.contactPointPool.push(...rejected);
    // Existing friction equations have no reference to their source contact.
    // Deck groups contain only deck convexes, so their body identity safely
    // identifies the equations to replace; box/terrain/tree pairs are retained.
    let write = 0;
    for (const equation of friction) {
      if (bodyHasDeck(equation.bi) || bodyHasDeck(equation.bj)) frictionPool.push(equation);
      else friction[write++] = equation;
    }
    friction.length = write;
    const counts = new Map();
    for (const item of deckContacts) counts.set(item.other.id, (counts.get(item.other.id) || 0) + 1);
    const previousMaterial = this.currentContactMaterial;
    for (const item of deckContacts) {
      const c = item.contact, ma = c.si.material || c.bi.material, mb = c.sj.material || c.bj.material;
      this.currentContactMaterial = ma && mb ? activeWorld.getContactMaterial(ma, mb) || activeWorld.defaultContactMaterial : activeWorld.defaultContactMaterial;
      const first = friction.length; this.createFrictionEquationsFromContact(c, friction);
      for (let i = first; i < friction.length; i++) {
        // Vendored Cannon computes mu*m*g but clamps solver lambda directly;
        // lambda is an impulse (its published multiplier is lambda/dt). Convert
        // that force estimate to impulse and share it across the manifold.
        // Without dt a 120 Hz step can remove ~mu*g m/s at every tiny scrape.
        // Actual tire forces retain their independent load-based friction.
        const scale = activeWorld.dt / counts.get(item.other.id);
        friction[i].minForce *= scale; friction[i].maxForce *= scale; stats.frictionEquations++;
      }
    }
    this.currentContactMaterial = previousMaterial; state.stats = stats;
  };
  world._terraChallengeCollisionFilter = state;
  return state;
}
