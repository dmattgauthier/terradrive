export function electricControlsHTML(spec) {
  if (spec.transmissionType !== 'electric') return '';
  return `<div class="ev-settings">
    <label for="rear-steer">Four-wheel steering <select id="rear-steer"><option value="auto">Auto</option><option value="off">Off</option><option value="crab">CrabWalk</option></select></label>
    <label for="ride-height">Air suspension <select id="ride-height"><option value="normal">Normal</option><option value="increased">Increased</option><option value="extract">Extract</option></select></label>
    <div class="ev-live"><span id="rear-steer-state">AUTO · REAR 0°</span><span id="air-height-state">NORMAL HEIGHT</span></div>
    <button class="regen-paddle" id="regen-paddle" type="button" aria-pressed="false" title="Hold to increase regenerative braking; B on the keyboard"><span>Hold Regen on Demand</span><kbd>B</kbd></button>
    <div class="ev-live"><span>REGENERATING</span><strong id="regen-power">0 kW</strong></div>
    <p class="ev-launch-state" id="launch-status" hidden></p>
    <p class="control-help">CrabWalk: stop and center the wheels. Rear steer Off: select N or P. Extract: select Terrain mode.</p>
  </div>`;
}

export function launchStatusText(phase) {
  return ({ lowering: 'Preparing launch · suspension lowering', brake: 'Launch ready · center the wheels and hold S / brake', throttle: 'Keep holding brake · press W / accelerator fully', release: 'Armed · release S / brake while holding the accelerator', launch: 'Watts to Freedom · peak launch output', standby: 'Launch standby · normal driving available. Stop, center the wheels and hold S / brake to prepare again.', off: '' })[phase] || '';
}

/** Independent held sources: releasing a different touch/mouse or keyboard
 * source must not cancel a paddle that is still physically held. */
export class RegenHoldInput {
  constructor(onChange = () => {}) { this.onChange = onChange; this.keyboard = false; this.pointers = new Set(); this.active = false; }
  setKeyboard(held) { this.keyboard = !!held; this._sync(); }
  setPointer(id, held) { if (held) this.pointers.add(id); else this.pointers.delete(id); this._sync(); }
  clear() { this.keyboard = false; this.pointers.clear(); this._sync(); }
  _sync() {
    const active = this.keyboard || this.pointers.size > 0;
    if (active === this.active) return;
    this.active = active; this.onChange(active);
  }
}
