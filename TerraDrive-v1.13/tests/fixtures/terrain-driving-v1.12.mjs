/** Bounded ordinary-input terrain study. All setup precedes live settling.
 * These controls were selected on immutable published v1.11.1. No result
 * from a candidate source can alter their timing, spawn or input values.
 */
export const TERRAIN_DRIVING_FIXTURES = Object.freeze({
  referenceVersion: '1.11.1',
  vehicle: 'wrangler-rubicon',
  frameDT: 1 / 60,
  settleSeconds: 1.5,
  settleInput: { brake: 1, handbrake: true },
  scenarios: [
    { id: 'mud-rolling-37psi', surface: 'mud', pressurePSI: 37, driveMode: '4H', tractionControl: true,
      spawn: { x: 48, z: -163, heading: 0 }, seconds: 10,
      phases: [{ from: 0, to: 10, throttle: .38 }], purpose: 'Gentle rolling mud track at normal catalog pressure.' },
    { id: 'mud-rolling-14psi', surface: 'mud', pressurePSI: 14, driveMode: '4H', tractionControl: true,
      spawn: { x: 48, z: -163, heading: 0 }, seconds: 10,
      phases: [{ from: 0, to: 10, throttle: .38 }], purpose: 'Same ordinary controls with lower pressure; footprint and motion are allowed to change.' },
    { id: 'sand-rolling-37psi', surface: 'sand', pressurePSI: 37, driveMode: '4H', tractionControl: true,
      spawn: { x: 195, z: -178, heading: 0 }, seconds: 10,
      phases: [{ from: 0, to: 10, throttle: .38 }], purpose: 'Gentle rolling dry-sand track at normal catalog pressure.' },
    { id: 'sand-rolling-14psi', surface: 'sand', pressurePSI: 14, driveMode: '4H', tractionControl: true,
      spawn: { x: 195, z: -178, heading: 0 }, seconds: 10,
      phases: [{ from: 0, to: 10, throttle: .38 }], purpose: 'Same dry-sand controls with lower pressure; no forced equal speed or travel.' },
    { id: 'mud-wheelspin-turn', surface: 'mud', pressurePSI: 37, driveMode: '2H', tractionControl: false,
      spawn: { x: 48, z: -163, heading: 0 }, seconds: 8,
      phases: [{ from: 0, to: 4, throttle: 1 }, { from: 4, to: 4.5, throttle: 1, steer: .8 },
        { from: 4.5, to: 5.2, steer: .8, handbrake: true }, { from: 5.2, to: 8, steer: .8 }],
      purpose: 'A genuinely stuck, spinning RWD mud case. Its small travel must not be described as a high-speed drifting maneuver.' },
    { id: 'sand-handbrake-slide', surface: 'sand', pressurePSI: 37, driveMode: '4H', tractionControl: false,
      spawn: { x: 195, z: -178, heading: 0 }, seconds: 9,
      phases: [{ from: 0, to: 4.5, throttle: 1 }, { from: 4.5, to: 5, throttle: 1, steer: .8 },
        { from: 5, to: 5.7, steer: .8, handbrake: true }, { from: 5.7, to: 9, steer: .8 }],
      purpose: 'An actual powered run-up followed by steering, rear-wheel emergency braking and coasting on dry sand.' },
  ],
});

export function controlsAt(scenario, t) {
  const phase = scenario.phases.find(row => t >= row.from && t < row.to);
  return { throttle: phase?.throttle || 0, brake: phase?.brake || 0,
    steer: phase?.steer || 0, handbrake: !!phase?.handbrake };
}

/** Standard gamepad triggers/stick plus real Space key events. The stick
 * conversion inverts the public controller's dead zone/response curve so
 * the retained fixture names the resulting requested steering fraction.
 */
export function createOrdinaryInput(DrivingInput) {
  const windowTarget = new EventTarget(), documentTarget = new EventTarget();
  documentTarget.activeElement = null; documentTarget.hidden = false;
  documentTarget.querySelector = () => null; documentTarget.querySelectorAll = () => [];
  let pad = null, spaceHeld = false;
  for (const [name, value] of Object.entries({ window: windowTarget, document: documentTarget,
    navigator: { getGamepads: () => [pad] } }))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const input = new DrivingInput(() => {});
  return { input, set({ throttle = 0, brake = 0, steer = 0, handbrake = false } = {}) {
    if (spaceHeld !== handbrake) {
      const event = new Event(handbrake ? 'keydown' : 'keyup', { cancelable: true });
      Object.assign(event, { key: ' ', ctrlKey: false, metaKey: false, altKey: false, repeat: false });
      windowTarget.dispatchEvent(event); spaceHeld = handbrake;
    }
    const buttons = Array.from({ length: 17 }, () => ({ value: 0, pressed: false }));
    buttons[7] = { value: throttle, pressed: throttle > .1 };
    buttons[6] = { value: brake, pressed: brake > .1 };
    const axis = steer === 0 ? 0 : Math.sign(steer) * (.13 + .87 * Math.sqrt(Math.abs(steer)));
    pad = { connected: true, mapping: 'standard', axes: [axis, 0], buttons };
    return input.read();
  } };
}

/** Fixed ground-only cameras measured on pristine published v1.11.1. */
export const WORKED_SOIL_CAMERAS = Object.freeze({
  'mud-wheelspin-turn': { eye: [51.4,6.23472558259964,-166.6], target: [48,3.4647255825996397,-163.3] },
  'sand-handbrake-slide': { eye: [196.9,12.782296681404114,-144], target: [192.5,8.912296681404113,-137.4] },
});
