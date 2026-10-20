import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingInput } from '../dist/src/input.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';

function inputFixture(t) {
  const original = Object.fromEntries(['window', 'document', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const win = new EventTarget(), doc = new EventTarget();
  const buttons = Object.fromEntries(['left', 'right', 'throttle', 'brake', 'handbrake', 'winch-in', 'winch-out'].map(action => {
    const button = new EventTarget();
    const classes = new Set();
    button.dataset = { touch: action };
    button.classList = { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) };
    button.setPointerCapture = () => {};
    return [action, button];
  }));
  let pad = null, dialog = false;
  doc.activeElement = null;
  doc.hidden = false;
  doc.querySelector = () => dialog ? {} : null;
  doc.querySelectorAll = selector => Object.values(buttons).filter(b => !selector.endsWith('.active') || b.classList.contains('active'));
  for (const [name, value] of Object.entries({ window: win, document: doc, navigator: { getGamepads: () => [pad] } })) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  t.after(() => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const commands = [];
  const input = new DrivingInput(command => commands.push(command));
  const fire = (target, type, props = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, props);
    target.dispatchEvent(event);
  };
  return {
    input, commands, buttons, win, doc, fire,
    key: (key, type = 'keydown') => fire(win, type, { key, ctrlKey: false, metaKey: false, altKey: false, repeat: false }),
    touch: (action, type = 'pointerdown') => fire(buttons[action], type, { pointerId: 1 }),
    pad: value => { pad = value; },
    dialog: value => { dialog = value; },
  };
}

function gamepad(axis = 0, throttle = 0, brake = 0) {
  const buttons = Array.from({ length: 17 }, () => ({ value: 0, pressed: false }));
  buttons[7] = { value: throttle, pressed: throttle > 0.1 };
  buttons[6] = { value: brake, pressed: brake > 0.1 };
  return { connected: true, mapping: 'standard', axes: [axis, 0], buttons };
}

test('keyboard, arrows, touch and gamepad agree on driver-left and driver-right steering', t => {
  const f = inputFixture(t);
  for (const [key, sign] of [['a', -1], ['arrowleft', -1], ['d', 1], ['arrowright', 1]]) {
    f.key(key);
    assert.equal(f.input.read().steer, sign, key);
    f.key(key, 'keyup');
  }
  for (const [action, sign] of [['left', -1], ['right', 1]]) {
    f.touch(action);
    assert.equal(f.input.read().steer, sign, action);
    f.touch(action, 'pointerup');
  }
  for (const sign of [-1, 1]) {
    f.pad(gamepad(sign));
    assert.equal(f.input.read().steer, sign, 'standard gamepad axis');
  }
  f.pad(gamepad(0.1));
  assert.equal(f.input.read().steer, 0, 'joystick drift stays inside the dead zone');
});

test('digital steering and analog thumbstick precision remain distinct through release and interruption', t => {
  const f = inputFixture(t);
  f.pad(gamepad());
  f.key('d');
  assert.equal(f.input.read().steerSource, 'digital');
  f.key('d', 'keyup');
  assert.equal(f.input.read().steerSource, 'digital', 'A centered attached gamepad must not switch keyboard return-to-center behavior');
  for (const sign of [-1, 1]) {
    f.pad(gamepad(sign * (0.13 + 0.87 * 0.5)));
    const controls = f.input.read();
    assert.equal(controls.steerSource, 'analog');
    assert(Math.abs(controls.steer - sign * 0.25) < 1e-12, 'Mid stick should give precise quarter-scale steering, preserving its sign');
    f.pad(gamepad(sign));
    assert.equal(f.input.read().steer, sign, 'The analog end stop must retain full authority');
  }
  f.pad(gamepad());
  assert.equal(f.input.read().steer, 0);
  assert.equal(f.input.read().steerSource, 'analog', 'Stick release uses the same controller as its turn');
  f.touch('left');
  assert.equal(f.input.read().steerSource, 'digital');
  f.touch('left', 'pointerup');
  assert.equal(f.input.read().steerSource, 'digital');
  f.pad(gamepad(0.8)); f.input.read();
  f.fire(f.win, 'blur'); f.pad(gamepad());
  assert.equal(f.input.read().steer, 0);
  assert.equal(f.input.read().steerSource, 'digital', 'Cleared input must not retain a stale active steering source');
});

test('keyboard brake, touch brake and gamepad LT produce the same stop-then-reverse trajectory', t => {
  const f = inputFixture(t);
  const terrain = { sample: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'asphalt', mu: 1, rollingResistance: 0.012, softness: 0 }) };
  const outcomes = [];
  for (const mode of ['keyboard', 'touch', 'gamepad']) {
    f.input.clear(); f.pad(null);
    if (mode === 'keyboard') f.key('s');
    if (mode === 'touch') f.touch('brake');
    if (mode === 'gamepad') f.pad(gamepad(0, 0, 1));
    const controls = f.input.read();
    assert.equal(controls.autoDirection, true);
    assert.equal(controls.brake, 1);
    assert.equal(controls.throttle, 0);
    const physics = new VehiclePhysics(terrain, VEHICLES[0]);
    physics.reset({ x: 0, z: 0, heading: 0 });
    for (let frame = 0; frame < 360; frame++) physics.step(1 / 120, { throttle: 0.5, autoDirection: true });
    for (let frame = 0; frame < 600; frame++) physics.step(1 / 120, controls);
    assert.equal(physics.state.selector, 'R', mode);
    assert(physics.state.speed < -2, `${mode} should be backing up after the stop`);
    outcomes.push(physics.state.position.z);
  }
  assert.equal(outcomes[0], outcomes[1]);
  assert.equal(outcomes[1], outcomes[2]);
});

test('gamepad pedal pressure stays analog and both held pedals remain visible to the direction controller', t => {
  const f = inputFixture(t);
  f.pad(gamepad(0, 0.28, 0.64));
  const controls = f.input.read();
  assert.equal(controls.throttle, 0.28);
  assert.equal(controls.brake, 0.64);
  assert.equal(controls.autoDirection, true);
  f.key('w'); f.key('s');
  assert.equal(f.input.read().throttle, 1);
  assert.equal(f.input.read().brake, 1);
});

test('blur, lost touch capture, dialogs and paused input cannot leave reverse throttle held', t => {
  const f = inputFixture(t);
  f.key('s');
  f.touch('throttle');
  f.fire(f.win, 'blur');
  assert.equal(f.input.read().brake, 0);
  assert.equal(f.input.read().throttle, 0);
  f.touch('brake');
  assert.equal(f.input.read().brake, 1);
  f.touch('brake', 'lostpointercapture');
  assert.equal(f.input.read().brake, 0);
  f.key('s');
  f.dialog(true);
  assert.equal(f.input.read().brake, 0);
  f.dialog(false);
  assert.equal(f.input.read(false).brake, 0);
  f.doc.activeElement = { tagName: 'INPUT' };
  assert.equal(f.input.read().brake, 0);
});

test('winch controls are held, opposing directions cancel, and keyboard, touch and gamepad release immediately', t => {
  const f = inputFixture(t);
  assert.equal(f.input.read().winch, 0);
  f.key('e');
  assert.equal(f.input.read().winch, 1);
  f.fire(f.win, 'keydown', { key: 'e', repeat: true });
  assert.deepEqual(f.commands, [], 'Held reel keys must not enter the shortcut command handler');
  f.key('q');
  assert.equal(f.input.read().winch, 0);
  f.key('e', 'keyup');
  assert.equal(f.input.read().winch, -1);
  f.key('q', 'keyup');
  assert.equal(f.input.read().winch, 0);
  f.touch('winch-in');
  assert.equal(f.input.read().winch, 1);
  f.touch('winch-out');
  assert.equal(f.input.read().winch, 0);
  f.touch('winch-in', 'pointerup');
  assert.equal(f.input.read().winch, -1);
  f.touch('winch-out', 'pointercancel');
  assert.equal(f.input.read().winch, 0);
  const pad = gamepad();
  pad.buttons[12].pressed = true; f.pad(pad);
  assert.equal(f.input.read().winch, 1);
  f.key('q');
  assert.equal(f.input.read().winch, 0, 'Opposing sources must cancel too');
  f.key('q', 'keyup');
  pad.buttons[12].pressed = false; pad.buttons[13].pressed = true;
  assert.equal(f.input.read().winch, -1);
  pad.buttons[13].pressed = false;
  assert.equal(f.input.read().winch, 0);
});

test('Space, held touch parking brake and gamepad brake release without becoming latched', t => {
  const f = inputFixture(t);
  f.key(' ');
  assert.equal(f.input.read().handbrake, true);
  f.key(' ', 'keyup');
  assert.equal(f.input.read().handbrake, false);
  f.touch('handbrake');
  assert.equal(f.input.read().handbrake, true);
  f.touch('handbrake', 'lostpointercapture');
  assert.equal(f.input.read().handbrake, false);
  const pad = gamepad();
  pad.buttons[1].pressed = true; f.pad(pad);
  assert.equal(f.input.read().handbrake, true);
  pad.buttons[1].pressed = false;
  assert.equal(f.input.read().handbrake, false);
  assert.deepEqual(f.commands, []);
});

test('blur, hidden tabs and modal focus clear held winch and parking brake without stale reactivation', t => {
  const f = inputFixture(t);
  for (const interruption of ['blur', 'hidden', 'dialog', 'field']) {
    f.key('e'); f.key(' '); f.touch('winch-out'); f.touch('handbrake');
    assert.equal(f.input.read().handbrake, true);
    if (interruption === 'blur') f.fire(f.win, 'blur');
    if (interruption === 'hidden') { f.doc.hidden = true; f.fire(f.doc, 'visibilitychange'); }
    if (interruption === 'dialog') f.dialog(true);
    if (interruption === 'field') f.doc.activeElement = { tagName: 'INPUT' };
    assert.equal(f.input.read().winch, 0, interruption);
    assert.equal(f.input.read().handbrake, false, interruption);
    f.doc.hidden = false; f.dialog(false); f.doc.activeElement = null;
    assert.equal(f.input.read().winch, 0, `${interruption}: stale held input returned`);
    assert.equal(f.input.read().handbrake, false, `${interruption}: stale parking brake returned`);
    assert.equal(f.buttons.handbrake.classList.contains('active'), false);
    assert.equal(f.buttons['winch-out'].classList.contains('active'), false);
  }
});
