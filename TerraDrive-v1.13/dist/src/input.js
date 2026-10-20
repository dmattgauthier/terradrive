const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const idleInput = () => ({ throttle: 0, brake: 0, steer: 0, steerSource: 'digital', handbrake: false, winch: 0, autoDirection: true });

/** Keyboard, multitouch and the standard browser gamepad mapping. */
export class DrivingInput {
  constructor(onCommand) {
    this.keys = new Set();
    this.touch = new Set();
    this.onCommand = onCommand;
    this.gamepadEnabled = true;
    this.padButtons = [];
    this.last = idleInput();
    const captured = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'e', 'q'];
    window.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || this.blocked()) return;
      const key = e.key.toLowerCase();
      if (captured.includes(key)) e.preventDefault();
      this.keys.add(key);
      if (!e.repeat && !captured.includes(key)) this.onCommand(key, e);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    document.querySelectorAll('[data-touch]').forEach(button => {
      const action = button.dataset.touch;
      button.addEventListener('pointerdown', e => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        this.touch.add(action); button.classList.add('active');
      });
      const end = () => { this.touch.delete(action); button.classList.remove('active'); };
      button.addEventListener('pointerup', end);
      button.addEventListener('pointercancel', end);
      button.addEventListener('lostpointercapture', end);
      button.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  blocked() {
    const target = document.activeElement;
    return !!document.querySelector('dialog[open]') || !!target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName);
  }

  clear() {
    this.keys.clear(); this.touch.clear(); this.padButtons = [];
    document.querySelectorAll('[data-touch].active').forEach(b => b.classList.remove('active'));
    this.last = idleInput();
  }

  read(enabled = true) {
    if (this.blocked()) { this.clear(); return this.last; }
    if (!enabled) {
      // Start/Options must be able to resume a paused drive.
      if (this.gamepadEnabled && navigator.getGamepads) {
        const pad = Array.from(navigator.getGamepads()).find(p => p?.connected && p.mapping === 'standard');
        const pressed = !!pad?.buttons[9]?.pressed;
        if (pressed && !this.padButtons[9]) this.onCommand('escape');
        this.padButtons[9] = pressed;
      }
      return (this.last = idleInput());
    }
    const down = (...keys) => keys.some(k => this.keys.has(k));
    let throttle = down('w', 'arrowup') || this.touch.has('throttle') ? 1 : 0;
    let brake = down('s', 'arrowdown') || this.touch.has('brake') ? 1 : 0;
    // Input direction is driver's left (−1) / right (+1). The physics layer
    // converts this to the +Y yaw sign for a +Z-forward vehicle.
    let steer = (down('d', 'arrowright') || this.touch.has('right') ? 1 : 0) - (down('a', 'arrowleft') || this.touch.has('left') ? 1 : 0);
    const digitalSteerActive = down('a', 'd', 'arrowleft', 'arrowright') || this.touch.has('left') || this.touch.has('right');
    let steerSource = digitalSteerActive ? 'digital' : this.last.steerSource;
    let handbrake = down(' ') || this.touch.has('handbrake');
    let winchIn = down('e') || this.touch.has('winch-in');
    let winchOut = down('q') || this.touch.has('winch-out');
    if (this.gamepadEnabled && navigator.getGamepads) {
      const pad = Array.from(navigator.getGamepads()).find(p => p?.connected && p.mapping === 'standard');
      if (pad) {
        const axis = pad.axes[0] || 0;
        if (Math.abs(axis) > 0.13) {
          const amount = clamp((Math.abs(axis) - 0.13) / 0.87, 0, 1);
          // A thumbstick needs finer resolution near its center. Its end stops
          // still request the entire road-wheel angle, at every vehicle speed.
          steer = Math.sign(axis) * amount * amount;
          steerSource = 'analog';
        }
        throttle = Math.max(throttle, pad.buttons[7]?.value || 0);
        brake = Math.max(brake, pad.buttons[6]?.value || 0);
        handbrake ||= !!pad.buttons[1]?.pressed;
        winchIn ||= !!pad.buttons[12]?.pressed;
        winchOut ||= !!pad.buttons[13]?.pressed;
        const commands = { 0: 'x', 3: 'c', 4: 'r', 5: 'f', 9: 'escape' };
        for (const [index, command] of Object.entries(commands)) {
          const pressed = !!pad.buttons[index]?.pressed;
          if (pressed && !this.padButtons[index]) this.onCommand(command);
          this.padButtons[index] = pressed;
        }
      } else this.padButtons = [];
    }
    // Keyboard, touch and triggers all enter the same stop-before-reverse
    // controller in VehiclePhysics. Raw service-brake simulation callers do
    // not opt in and retain conventional independent pedal behavior.
    return (this.last = { throttle: clamp(throttle, 0, 1), brake: clamp(brake, 0, 1), steer: clamp(steer, -1, 1), steerSource, handbrake, winch: Number(winchIn) - Number(winchOut), autoDirection: true });
  }
}
