/** Bounded, deterministic tire ejecta. Metres, seconds and world-space vectors.
 * Droplet/clod sizes and entrainment are visual estimates, not a fluid solver.
 * Emission uses contact load, actual circumferential/lateral speed and water depth;
 * Ballistic motion uses gravity and can strike both terrain/water and the
 * vehicle's actual exterior mesh. It never changes vehicle momentum or soil.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BASIS_FALLBACK = { forward: { x: 0, y: 0, z: 1 }, right: { x: -1, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
const unit = (v, fallback = { x: 0, y: 1, z: 0 }) => {
  const x = Number.isFinite(v?.x) ? v.x : 0, y = Number.isFinite(v?.y) ? v.y : 0, z = Number.isFinite(v?.z) ? v.z : 0;
  const length = Math.hypot(x, y, z);
  return length > 1e-5 ? { x: x / length, y: y / length, z: z / length } : fallback;
};
// Preserve complete published vectors exactly before interpolation. Optional
// or partial caller vectors use the same basis fallback on both frame ends.
const basisEndpoint = (value, name) => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
  && Math.hypot(value.x, value.y, value.z) > 1e-5
  ? value : unit(value, BASIS_FALLBACK[name]);
const dot = (a, b) => (a.x || 0) * b.x + (a.y || 0) * b.y + (a.z || 0) * b.z;
const surfaceHeight = sample => sample.height + Math.max(0, sample.waterDepth || 0);
const mixVector = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const copyWheel = w => ({ ...w, ground: { ...w.ground }, position: w.position && { ...w.position },
  forward: { ...w.forward }, right: { ...w.right }, normal: { ...w.normal }, velocity: w.velocity && { ...w.velocity } });
const radiusOf = p => p.size * Math.max(1, p.aspect || 1) * (p.kind === 'water' ? 1 : 1.03);

export class TireSpray {
  constructor({ capacity = 960, seed = 190931 } = {}) {
    this.capacity = capacity;
    this.particles = Array.from({ length: capacity }, () => ({ active: false }));
    this.fines = Array.from({ length: Math.min(capacity, 384) }, () => ({ active: false }));
    this.fineCursor = 0; this.fineSeed = (seed ^ 0x54a7019) >>> 0; this.fineEmitted = {}; this.fineBodyCollisions = 0;
    this.cursor = 0; this.seed = seed >>> 0; this.remainders = new Map();
    this.emitted = { mud: 0, water: 0 }; this.impacts = []; this.bodyImpacts = []; this.time = 0;
    this.previousWheels = new Map(); this.bodyCollisions = { mud: 0, water: 0, atRelease: 0, deflected: 0 };
  }

  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  clear() {
    for (const particle of [...this.particles, ...this.fines]) particle.active = false;
    this.remainders.clear(); this.previousWheels.clear(); this.impacts.length = this.bodyImpacts.length = 0;
  }

  update(dt, state, terrain, quality = 'high', collider = null) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, .1); this._frameDt = dt; this.time += dt; this.impacts.length = this.bodyImpacts.length = 0;
    this.collider = collider;
    if (collider?.beginFrame(state, dt) && this.previousWheels.size) this.clear();
    const qualityScale = quality === 'low' ? .28 : quality === 'medium' ? .66 : 1;
    const seen = new Set();
    for (const wheel of state.wheels || []) {
      const key = wheel.index;
      const velocity = wheel.velocity || state.velocity || { x: 0, y: 0, z: state.speed || 0 };
      const forward = unit(wheel.forward, BASIS_FALLBACK.forward);
      const right = unit(wheel.right, BASIS_FALLBACK.right), normal = unit(wheel.normal, BASIS_FALLBACK.normal);
      const speedLong = wheel.speedLong ?? dot(velocity, forward), speedLat = wheel.speedLat ?? dot(velocity, right);
      // A tire sliding across a rut still pushes wet material, even when its
      // wheel-plane forward speed and rotation are both near zero.
      const speed = Math.hypot(speedLong, speedLat);
      const rimSpeed = Math.abs(wheel.omega || 0) * (wheel.radius || .4);
      const churnSpeed = Math.max(speed, rimSpeed * .78);
      const contact = wheel.contact && (wheel.load ?? 1) > 0;
      const sample = contact ? terrain.sample(wheel.ground.x, wheel.ground.z) : null;
      // A submerged log/deck can throw the actual water above its support
      // surface. Its underlying sampled soil must never generate mud or film.
      const waterDepth = Math.max(0, wheel.constructed ? wheel.waterDepth || 0 : wheel.waterDepth ?? sample?.waterDepth ?? 0);
      const wetFilm = wheel.constructed ? 0 : clamp((wheel.moisture ?? sample?.moisture ?? 0) - .35, 0, 1);
      const water = waterDepth > .009 || wetFilm > .05 && speed > 4;
      const mud = !wheel.constructed && ['mud', 'wetland'].includes(wheel.surface) && waterDepth < .38;
      const snow = !wheel.constructed && wheel.surface === 'snow' && (wheel.snowDepth ?? sample?.snowDepth ?? 0) > .015;
      const sand = !wheel.constructed && wheel.surface === 'sand' && waterDepth < .08;
      const dust = !wheel.constructed && wheel.surface === 'dirt' && waterDepth < .005 && (wheel.moisture ?? sample?.moisture ?? 0) < .55;
      seen.add(key);
      if (!contact || churnSpeed < .65 || !water && !mud && !snow && !sand && !dust) { this.remainders.delete(key); continue; }
      const source = this.remainders.get(key) || { mud: 0, water: 0 };
      const loadScale = clamp((wheel.load ?? 5000) / 7000, .35, 1.65);
      const slip = clamp(Math.hypot(wheel.slip || 0, speedLat / Math.max(1.5, speed)), 0, 3);
      const motion = { velocity, forward, right, normal, speedLong, speedLat, rimSpeed, churnSpeed };
      const rates = {
        water: water ? clamp((churnSpeed * 8 + slip * 20) * Math.min(1.3, .18 + waterDepth * 7 + wetFilm * .22), 0, 200) : 0,
        mud: mud ? clamp((churnSpeed * 2.6 + slip * 25) * loadScale * (1 - clamp(waterDepth / .38, 0, .85)), 0, 70) : 0,
        snow: snow ? clamp((churnSpeed * 5 + slip * 27) * loadScale * Math.min(1, (wheel.snowDepth ?? sample?.snowDepth ?? .2) * 4), 0, 105) : 0,
        sand: sand ? clamp((churnSpeed * 3.6 + slip * 32) * loadScale * (1 - (sample?.moisture || 0) * .65), 0, 100) : 0,
        dust: dust ? clamp((churnSpeed * 3 + slip * 20) * (1 - (sample?.moisture || 0) * 1.7)
          * (wheel.surfaceDetail === 'grass' ? .10 + slip * .15 : 1), 0, 85) : 0,
      };
      for (const kind of snow ? ['snow'] : sand ? ['water', 'sand'] : dust ? ['water', 'dust'] : ['water', 'mud']) {
        source[kind] ??= 0;
        const before = source[kind], increment = rates[kind] * dt * qualityScale;
        source[kind] += increment;
        const count = Math.floor(source[kind]); source[kind] -= count;
        for (let i = 0; i < count; i++) {
          // Spread births over the actual traversed contact instead of making
          // a whole frame of new spray appear at the final wheel position.
          const fraction = clamp((1 - before + i) / increment, 0, 1);
          const prior = this.previousWheels.get(key);
          let contactWheel = wheel, contactMotion = motion;
          if (prior?.contact && prior.load > 0 && !!prior.constructed === !!wheel.constructed) {
            contactWheel = { ...wheel };
            for (const name of ['ground', 'position', 'velocity']) if (prior[name] && wheel[name]) contactWheel[name] = mixVector(prior[name], wheel[name], fraction);
            for (const name of ['forward', 'right', 'normal']) contactWheel[name] = unit(mixVector(
              basisEndpoint(prior[name], name), basisEndpoint(wheel[name], name), fraction), BASIS_FALLBACK[name]);
            for (const name of ['omega', 'speedLong', 'speedLat', 'radius', 'contactLength', 'contactWidth']) {
              if (Number.isFinite(prior[name]) && Number.isFinite(wheel[name])) contactWheel[name] = prior[name] + (wheel[name] - prior[name]) * fraction;
            }
            contactMotion = { ...motion, velocity: contactWheel.velocity || velocity, forward: contactWheel.forward,
              right: contactWheel.right, normal: contactWheel.normal, speedLong: contactWheel.speedLong ?? speedLong,
              speedLat: contactWheel.speedLat ?? speedLat, rimSpeed: Math.abs(contactWheel.omega || 0) * (contactWheel.radius || .4) };
            contactMotion.churnSpeed = Math.max(Math.hypot(contactMotion.speedLong, contactMotion.speedLat), contactMotion.rimSpeed * .78);
          }
          this._emit(kind, contactWheel, terrain.sample(contactWheel.ground.x, contactWheel.ground.z), contactMotion, waterDepth, fraction);
        }
      }
      this.remainders.set(key, source);
    }
    for (const key of this.remainders.keys()) if (!seen.has(key)) this.remainders.delete(key);
    this.previousWheels.clear(); for (const wheel of state.wheels || []) this.previousWheels.set(wheel.index, copyWheel(wheel));
    for (const p of [...this.particles, ...this.fines]) {
      if (!p.active) continue;
      const start = p._frameStart || 0; p._frameStart = 0;
      const duration = dt * (1 - start), steps = Math.max(1, Math.ceil(duration * 120));
      for (let step = 0; step < steps && p.active; step++) {
        const h = duration / steps;
        if (p.age + h >= p.life) { p.active = false; break; }
        const a = start + (1 - start) * step / steps, b = start + (1 - start) * (step + 1) / steps;
        this._advance(p, h, a, b, terrain); p.age += h; p.angle += p.spin * h;
      }
    }
  }

  _groundCrossing(from, to, p, terrain) {
    // A fast parcel can pass over both sides of a narrow rut shoulder or rock
    // crest in one integration segment. Check the crossed interval, rather
    // than testing only a low endpoint beyond the ridge. This remains bounded.
    const samples = Math.min(8, Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .055)));
    let low = 0, high = null, sample;
    for (let i = 1; i <= samples; i++) {
      const fraction = i / samples, position = mixVector(from, to, fraction);
      sample = terrain.sample(position.x, position.z);
      if (position.y <= surfaceHeight(sample) + p.size * .35) { high = fraction; break; }
      low = fraction;
    }
    if (high === null) return null;
    for (let i = 0; i < 5; i++) {
      const mid = (low + high) * .5, position = mixVector(from, to, mid);
      if (position.y > surfaceHeight(terrain.sample(position.x, position.z)) + p.size * .35) low = mid;
      else high = mid;
    }
    const position = mixVector(from, to, high); sample = terrain.sample(position.x, position.z);
    position.y = surfaceHeight(sample); return { fraction: high, position, sample };
  }

  _advance(p, dt, frameA, frameB, terrain, bounces = 0) {
    if (!(dt > 0)) return;
    // Exact constant linear-drag/gravity solution. Bounded 1/120 s collision
    // segments keep curved trajectories consistent at 30, 60 and 120 Hz.
    const drag = p.fine ? p.kind === 'water' ? 8 : p.kind === 'snow' ? 6 : 4.2 : p.kind === 'snow' ? 2.6 : p.kind === 'water' ? .62 : p.kind === 'sand' ? 1.25 : .18;
    const gravity = p.fine ? p.kind === 'dust' ? 1.1 : p.kind === 'snow' ? 2.1 : 5.5 : 9.81;
    const wind = p.fine ? { x: .45, z: .18 } : { x: 0, z: 0 };
    const decay = Math.exp(-drag * dt), integral = (1 - decay) / drag;
    const terminal = -gravity / drag, from = { x: p.x, y: p.y, z: p.z };
    const to = { x: p.x + (p.vx - wind.x) * integral + wind.x * dt, y: p.y + (p.vy - terminal) * integral + terminal * dt, z: p.z + (p.vz - wind.z) * integral + wind.z * dt };
    const body = this.collider?.sweep(from, to, radiusOf(p), frameA, frameB);
    const ground = this._groundCrossing(from, to, p, terrain);
    if (body && (!ground || body.fraction < ground.fraction)) {
      const elapsed = dt * body.fraction, hitDecay = Math.exp(-drag * elapsed);
      p.vx = wind.x + (p.vx - wind.x) * hitDecay; p.vz = wind.z + (p.vz - wind.z) * hitDecay; p.vy = terminal + (p.vy - terminal) * hitDecay;
      const normal = body.normal, radius = radiusOf(p);
      p.x = body.point.x + normal.x * (radius + .001); p.y = body.point.y + normal.y * (radius + .001); p.z = body.point.z + normal.z * (radius + .001);
      this._bodyHit(p, body);
      if (p.active && bounces < 1) this._advance(p, dt - elapsed, frameA + (frameB - frameA) * body.fraction, frameB, terrain, bounces + 1);
      else if (p.active) p.active = false;
      return;
    }
    p.vx = wind.x + (p.vx - wind.x) * decay; p.vz = wind.z + (p.vz - wind.z) * decay; p.vy = terminal + (p.vy - terminal) * decay;
    if (ground) {
      Object.assign(p, ground.position);
      if (!p.fine && ground.sample.waterDepth > .015 && this.impacts.length < 16) {
        this.impacts.push({ x: p.x, y: p.y, z: p.z,
          strength: clamp(-p.vy * p.size * (p.kind === 'water' ? .9 : 1.2), .012, .10) });
      }
      p.active = false;
    } else Object.assign(p, to);
  }

  _bodyHit(p, hit, atRelease = false) {
    if (p.fine) { this.fineBodyCollisions++; p.active = false; return; }
    this.bodyCollisions[p.kind] = (this.bodyCollisions[p.kind] || 0) + 1; if (atRelease) this.bodyCollisions.atRelease++;
    const velocity = hit.surfaceVelocity || { x: 0, y: 0, z: 0 }, n = hit.normal;
    const relative = { x: p.vx - velocity.x, y: p.vy - velocity.y, z: p.vz - velocity.z };
    const approach = dot(relative, n), speed = Math.hypot(relative.x, relative.y, relative.z);
    if (this.bodyImpacts.length < 16) this.bodyImpacts.push({ kind: p.kind, dirty: p.dirty, size: p.size,
      sourceWheel: p.sourceWheel, triangleId: hit.triangleId, point: { ...hit.point }, normal: { ...n },
      localPoint: { ...hit.localPoint }, localNormal: { ...hit.localNormal }, strength: clamp(Math.abs(approach) / 12, .08, 1), atRelease });
    // Cohesive clods and direct water hits adhere/lose their resolved parcel.
    // A glancing liquid parcel keeps damped tangential motion relative to the
    // moving panel; there is no elastic pinball or force fed into the chassis.
    if (p.kind !== 'water' || atRelease || (p.bodyBounces || 0) >= 1 || approach >= 0 || -approach / Math.max(.01, speed) > .72) { p.active = false; return; }
    const outward = -approach * .035, tangentScale = .56;
    p.vx = velocity.x + (relative.x - n.x * approach) * tangentScale + n.x * outward;
    p.vy = velocity.y + (relative.y - n.y * approach) * tangentScale + n.y * outward;
    p.vz = velocity.z + (relative.z - n.z * approach) * tangentScale + n.z * outward;
    p.size *= .76; p.bodyBounces = (p.bodyBounces || 0) + 1; this.bodyCollisions.deflected++;
  }

  _emit(kind, wheel, sample, motion, waterDepth, frameFraction = 0) {
    const p = this.particles[this.cursor++ % this.capacity];
    const { normal, forward, right, velocity, speedLong, speedLat, rimSpeed, churnSpeed } = motion;
    const direction = Math.abs(wheel.omega || 0) > .2 ? Math.sign(wheel.omega) : Math.sign(speedLong) || 1;
    const water = kind === 'water', lateralRatio = clamp(speedLat / Math.max(.65, churnSpeed), -1, 1);
    // Footprint side splash and material carried around the tread are separate
    // release mechanisms. Both start at the emitting tire, including steered
    // front wheels, reverse rotation and a stationary spinning driven wheel.
    const side = this.random() < .5 - lateralRatio * .44 ? -1 : 1;
    const spraySpeed = Math.min(water ? 18 : 13, churnSpeed);
    const pickupSpeed = Math.min(water ? 23 : 17, rimSpeed);
    const size = water ? .012 + this.random() ** 2 * .045 : .021 + this.random() ** 1.7 * .062;
    const width = wheel.contactWidth || .25, radius = wheel.radius || .4;
    const tread = rimSpeed > .65 && this.random() < (water ? .44 : .79) * clamp(rimSpeed / Math.max(.65, churnSpeed), 0, 1);
    let along, liftOffset, lateralOffset, longThrow, lift, lateral, carry;
    if (tread) {
      // Release behind the contact patch on the actual trailing tire arc. A
      // loaded tire's longer flat patch raises the first possible release.
      const patchAngle = Math.asin(clamp((wheel.contactLength || .18) / (2 * radius), 0, .82));
      const angle = Math.max(.30, patchAngle + .06) + this.random() * .60;
      along = -direction * Math.sin(angle) * radius;
      liftOffset = radius * (1 - Math.cos(angle));
      lateralOffset = side * width * (.22 + this.random() * .26);
      const entrainment = .55 + this.random() * .29;
      longThrow = -direction * pickupSpeed * Math.cos(angle) * entrainment;
      lift = .22 + pickupSpeed * Math.sin(angle) * entrainment;
      lateral = speedLat * .20 + side * (.18 + spraySpeed * this.random() * .11);
      carry = .90;
      if (wheel.tracked) {
        along = -direction * Math.max(.2, (wheel.contactLength || 1.35) * .5 - .035);
        liftOffset = .12; longThrow *= .78; lift *= .65;
      }
    } else {
      along = (this.random() - .5) * (wheel.contactLength || .22);
      liftOffset = .025 + this.random() * .04;
      // Born just outside the compressed sidewall, not inside the tread or a
      // shared exhaust-like location behind the vehicle.
      lateralOffset = side * (width * .52 + size * .75);
      longThrow = 0;
      lift = .30 + spraySpeed * (.07 + this.random() * .13);
      lateral = speedLat * .30 + side * (.45 + spraySpeed * (.12 + this.random() * .16));
      carry = .55;
    }
    const origin = { x: wheel.ground.x + right.x * lateralOffset + forward.x * along,
      y: wheel.ground.y + right.y * lateralOffset + forward.y * along + normal.y * liftOffset,
      z: wheel.ground.z + right.z * lateralOffset + forward.z * along };
    origin.x += normal.x * liftOffset; origin.z += normal.z * liftOffset;
    origin.y = Math.max(origin.y, (wheel.constructed ? wheel.ground.y : sample.height) + waterDepth + size * .8);
    Object.assign(p, {
      active: true, kind, age: 0, life: water ? .65 + this.random() * .45 : .9 + this.random() * .7,
      x: origin.x, y: origin.y, z: origin.z,
      vx: velocity.x * carry + forward.x * longThrow + right.x * lateral + normal.x * lift,
      vy: (velocity.y || 0) * carry + forward.y * longThrow + right.y * lateral + normal.y * lift,
      vz: velocity.z * carry + forward.z * longThrow + right.z * lateral + normal.z * lift,
      size, aspect: water ? 1.15 + this.random() * 1.1 : .65 + this.random() * .65,
      angle: this.random() * Math.PI * 2, spin: (this.random() - .5) * 15,
      shade: .72 + this.random() * .48, dirty: ['mud', 'wetland'].includes(wheel.surface || sample.surface),
      sourceWheel: wheel.index, sourcePosition: { ...origin }, sourceContact: { ...wheel.ground },
      release: tread ? 'tread' : 'side', birthTime: this.time - (1 - frameFraction) * (this._frameDt || 0),
      _frameStart: frameFraction, bodyBounces: 0,
    });
    p.fine = kind === 'dust';
    if (kind === 'sand') { p.size *= .42; p.life *= .72; p.aspect = .55 + this.random() * .55; }
    if (p.fine) { p.size = .055; p.life = 1.8; p.aspect = 1; p.vy *= .45; }
    this.emitted[kind] = (this.emitted[kind] || 0) + 1;
    // Trace pickup-to-release as well as subsequent flight: a submerged floor
    // or a tight wheel liner must intercept material before it is born inside
    // a body panel. This is the emitting tire's local path, not a rear outlet.
    if (this.collider) {
      const pickup = { x: wheel.ground.x + right.x * lateralOffset,
        y: wheel.ground.y + right.y * lateralOffset + .004,
        z: wheel.ground.z + right.z * lateralOffset };
      const hit = this.collider.sweep(pickup, origin, radiusOf(p), frameFraction, frameFraction);
      if (hit) this._bodyHit(p, hit, true);
    }
    const interval = kind === 'water' ? 3 : kind === 'mud' ? 4 : kind === 'snow' ? 2 : 1;
    if (p.active && !p.fine && this.emitted[kind] % interval === 0) this._spawnFine(p, frameFraction);
    return p;
  }

  _spawnFine(parent, frameFraction) {
    // A separate random stream keeps secondary mist/powder from changing the
    // established mud-clod trajectory or physical simulation in any way.
    this.fineSeed = (Math.imul(this.fineSeed, 1664525) + 1013904223) >>> 0;
    const random = this.fineSeed / 4294967296, p = this.fines[this.fineCursor++ % this.fines.length];
    Object.assign(p, parent, { active: true, fine: true, age: 0, size: .035 + random * .055,
      aspect: 1, life: parent.kind === 'water' ? .55 + random * .4 : 1.1 + random * .8,
      vx: parent.vx * .82, vy: parent.vy * .65 + .18, vz: parent.vz * .82,
      spin: (random - .5) * 2, _frameStart: frameFraction });
    this.fineEmitted[p.kind] = (this.fineEmitted[p.kind] || 0) + 1;
  }
}
