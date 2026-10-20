import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingInput } from '../dist/src/input.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { SURFACES } from '../dist/src/terrain.js';
import { launchStatusText } from '../dist/src/electric-controls.js';

const spec = VEHICLES.find(vehicle => vehicle.id === 'hummer-ev-suv-3x');
const flatGround = { sample() { return { ...SURFACES.asphalt, height: 0,
  normal: { x: 0, y: 1, z: 0 }, waterDepth: 0, softness: 0, maxSink: 0 }; } };
const dt = 1 / 60;

// Use the production keyboard mapper and the actual launch sequence. Body,
// wheel speed and launch phase are never injected after the initial reset.
function armed(ground = flatGround) {
  const win = new EventTarget(), doc = new EventTarget();
  Object.assign(doc, { activeElement: null, hidden: false, querySelector: () => null, querySelectorAll: () => [] });
  for (const [name, value] of Object.entries({ window: win, document: doc, navigator: { getGamepads: () => [] } }))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const driving = new DrivingInput(() => {}), physics = new VehiclePhysics(ground, spec);
  let held = new Set();
  const key = (value, pressed) => {
    const event = new Event(pressed ? 'keydown' : 'keyup', { cancelable: true });
    Object.assign(event, { key: value, ctrlKey: false, altKey: false, metaKey: false, repeat: false });
    win.dispatchEvent(event);
  };
  const set = ({ throttle = 0, brake = 0, steer = 0, handbrake = false } = {}) => {
    const wanted = new Set();
    if (throttle) wanted.add('w'); if (brake) wanted.add('s');
    if (steer) wanted.add(steer > 0 ? 'd' : 'a'); if (handbrake) wanted.add(' ');
    for (const value of held) if (!wanted.has(value)) key(value, false);
    for (const value of wanted) if (!held.has(value)) key(value, true);
    held = wanted;
  };
  const run = (seconds, controls = {}, inspect = () => {}) => {
    set(controls);
    for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
      const raw = driving.read(); physics.step(dt, raw); inspect(physics.state, raw);
    }
    return physics.state;
  };
  physics.reset({ x: 0, z: 0, heading: 0 }); run(2);
  assert.equal(physics.setControl('wattsToFreedom', true).ok, true);
  run(3); assert.equal(physics.state.launchPhase, 'brake');
  run(.1, { brake: 1 }); assert.equal(physics.state.launchPhase, 'throttle');
  run(.1, { brake: 1, throttle: 1 }); assert.equal(physics.state.launchPhase, 'release');
  assert.equal(physics.state.powerKW, 0, 'Staging must not drive through the held brakes');
  return { physics, run };
}

test('brief left and right key corrections keep accelerator authority and peak launch output', () => {
  for (const steer of [-1, 1]) {
    const { physics, run } = armed();
    run(.75, { throttle: 1 }); const speedBefore = physics.state.speed;
    run(.1, { throttle: 1, steer }, (state, raw) => {
      assert.equal(raw.steer, steer, 'The fixture must exercise the full raw digital event');
      assert.equal(state.driverInput.throttle, 1);
      assert.equal(state.launchPhase, 'launch', 'A brief key correction must be judged after steering smoothing');
      assert.ok(state.powerKW > 0);
    });
    run(.75, { throttle: 1 });
    assert.equal(physics.state.launchPhase, 'launch');
    assert.ok(physics.state.speed > speedBefore + 3, 'Acceleration continues after the steering key is released');
  }
});

test('a sustained turn releases peak boost into drivable standby without silently relaunching', () => {
  for (const steer of [-1, 1]) {
    const { physics, run } = armed(); run(.75, { throttle: 1 });
    const speedBefore = physics.state.speed, headingBefore = physics.state.heading;
    run(.5, { throttle: 1, steer }, state => assert.equal(state.driverInput.throttle, 1));
    assert.equal(physics.state.launchPhase, 'standby');
    assert.ok(Math.abs(physics.state.heading - headingBefore) > .01, 'Tire forces must actually turn the vehicle');
    assert.ok(physics.state.powerKW > 0 && physics.state.speed > speedBefore);
    run(.75, { throttle: 1 });
    assert.equal(physics.state.launchPhase, 'standby', 'Centering while moving must not skip the next launch sequence');
    assert.equal(physics.state.driverInput.throttle, 1);
    assert.equal(physics.controls.wattsToFreedom, true);
    assert.match(launchStatusText(physics.state.launchPhase), /normal driv/i);
  }
});

test('lifting, service braking and the emergency brake recover normal propulsion after release', () => {
  for (const action of [{}, { brake: 1 }, { handbrake: true }]) {
    const { physics, run } = armed(); run(.75, { throttle: 1 });
    run(.2, action); assert.equal(physics.state.launchPhase, 'standby');
    const speedBefore = physics.state.speed;
    run(.75, { throttle: 1 });
    assert.equal(physics.state.launchPhase, 'standby');
    assert.equal(physics.state.driverInput.throttle, 1);
    assert.ok(physics.state.powerKW > 0 && physics.state.speed > speedBefore + 1);
  }
});

test('launch timeout preserves accelerator authority at every rolling frame', () => {
  const { physics, run } = armed();
  run(9.1, { throttle: 1 }, state => assert.equal(state.driverInput.throttle, 1));
  assert.equal(physics.state.launchPhase, 'standby');
  assert.ok(physics.state.powerKW > 0);
});

test('standby preserves brake priority and requires stopped centered staging before another launch', () => {
  const { physics, run } = armed(); run(.75, { throttle: 1 });
  run(.1, { throttle: 1, brake: 1 }, state => {
    assert.equal(state.launchPhase, 'standby');
    assert.equal(state.driverInput.throttle, 0, 'Brake priority must apply while both pedals remain held in rolling standby');
    assert.equal(state.driverInput.brake, 1);
  });
  run(.4, { throttle: 1 }); assert.equal(physics.state.driverInput.throttle, 1);
  run(4, { brake: 1, steer: 1 });
  assert.ok(Math.abs(physics.state.speed) < .25);
  assert.equal(physics.state.launchPhase, 'standby', 'Turned wheels cannot arm the next peak launch');
  run(1, { brake: 1 }); assert.equal(physics.state.launchPhase, 'throttle');
  // Abandon an incomplete brake stage: ordinary acceleration must be available.
  run(.1); assert.equal(physics.state.launchPhase, 'standby');
  run(.1, { brake: 1 }); assert.equal(physics.state.launchPhase, 'throttle');
  run(.1, { brake: 1, throttle: 1 }); assert.equal(physics.state.launchPhase, 'release');
  run(.1, { throttle: 1 }); assert.equal(physics.state.launchPhase, 'launch');
  assert.ok(physics.state.powerKW > 0);
});

test('a real gap releases boost without leaving the throttle inhibited after wheel contact returns', () => {
  const gap = { sample(x, z) { return { ...flatGround.sample(x, z), height: z >= 12 && z <= 15 ? -3 : 0 }; } };
  const { physics, run } = armed(gap);
  let lostSupport = false, returnedSupport = false;
  run(3.5, { throttle: 1 }, state => {
    if (state.groundedWheels < 3) lostSupport = true;
    if (lostSupport && state.groundedWheels === 4) returnedSupport = true;
    assert.equal(state.driverInput.throttle, 1);
  });
  assert.ok(lostSupport && returnedSupport, 'The physical contact model must actually traverse the gap and regain support');
  assert.equal(physics.state.launchPhase, 'standby');
  assert.ok(physics.state.powerKW > 0);
});
