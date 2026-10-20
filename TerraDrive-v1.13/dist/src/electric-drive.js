/** Estimated electric-drive envelope. Factory wheel torque and shaft power are
 * separate limits; reductions are applied exactly once. No ICE converter/idle.
 * This is an explicit simulation calibration, not a GMC motor dyno or firmware.
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;

export function electricMotorOutput(spec, wheels, {
  throttle = 0, torqueScale = 1, direction = 1, enabled = true,
  regenDeceleration = 0, damage = 0, launch = false,
} = {}) {
  const e = spec.electric, efficiency = spec.drivetrain?.efficiency ?? .94;
  const reductions = [e.frontReduction, e.rearReduction, e.rearReduction];
  const wheelOmega = [(wheels[0].omega + wheels[1].omega) / 2, wheels[2].omega, wheels[3].omega];
  const motorOmega = wheelOmega.map((omega, i) => omega * reductions[i]);
  const motorRPM = motorOmega.map(omega => Math.abs(omega) * 60 / TAU);
  const ratedPower = spec.powerHP * 745.699872 / e.motors;
  // Normal mode's torque ramp is deliberately an estimate. Watts to Freedom
  // unlocks the advertised short-duration peak after its launch sequence.
  const torqueAvailability = launch ? 1 : .82;
  const health = 1 - clamp(damage, 0, 1) * .82;
  const motorTorque = motorOmega.map((omega, i) => {
    const fade = clamp((e.maxMotorRPM - motorRPM[i]) / 500, 0, 1);
    const envelope = Math.min(e.motorPeakTorqueNm * torqueAvailability, ratedPower / Math.max(1, Math.abs(omega)));
    return enabled ? envelope * clamp(throttle, 0, 1) * health * fade : 0;
  });
  const requestedTorque = motorTorque.reduce((sum, value) => sum + value, 0);
  const delivered = motorTorque.map(torque => torque * clamp(torqueScale, 0, 1) * direction);
  const radius = wheels.reduce((sum, wheel) => sum + wheel.radius, 0) / 4;
  const speed = wheels.reduce((sum, wheel) => sum + Math.abs(wheel.speedLong || 0), 0) / 4;
  const retardation = enabled ? clamp(regenDeceleration, 0, 3.2) * spec.mass * radius * clamp(speed / .7, 0, 1) : 0;
  // Three independently capped generators; ABS capacity protects the footprint
  // when lift-off regeneration encounters low grip or an unloaded wheel.
  let regenPowerW = 0;
  const regen = motorOmega.map((omega, i) => {
    const requested = retardation / 3 / reductions[i];
    const torqueCap = Math.min(e.motorPeakTorqueNm * .46, 200000 / 3 / Math.max(1, Math.abs(omega)));
    const wheelIndices = i === 0 ? [0, 1] : [i + 1];
    const grip = wheelIndices.reduce((sum, index) => {
      const w = wheels[index];
      return sum + (w.contact ? Math.max(0, w.capacity ?? (w.data?.mu || .6) * w.load) * w.radius * .78 : 0);
    }, 0) / reductions[i];
    const amount = Math.min(requested, torqueCap, grip) * Math.min(1, Math.abs(omega) / 4);
    regenPowerW += amount * Math.abs(omega) * .82;
    return -Math.sign(omega) * amount;
  });
  const output = delivered.map((value, i) => (value * efficiency + regen[i]) * reductions[i]);
  const wheelTorques = [output[0] / 2, output[0] / 2, output[1], output[2]];
  const positivePowerW = delivered.reduce((sum, value, i) => sum + Math.max(0, value * motorOmega[i]), 0);
  return {
    requestedTorque, motorTorque: delivered.reduce((sum, value) => sum + Math.abs(value), 0),
    wheelTorques, motorRPM, rpm: motorRPM.reduce((sum, value) => sum + value, 0) / motorRPM.length,
    positivePowerW, regenPowerW,
    regenForce: regen.reduce((sum, value, i) => sum + Math.abs(value) * reductions[i], 0) / Math.max(.15, radius),
    frontShare: Math.abs(output[0]) / Math.max(1, output.reduce((sum, value) => sum + Math.abs(value), 0)),
  };
}

export function electricRearSteer(spec, frontAngle, speed, mode = 'auto') {
  if (!spec.features?.fourWheelSteer || mode === 'off') return 0;
  const maximum = spec.steering.rearMaxAngle;
  if (mode === 'crab') return clamp(frontAngle, -maximum, maximum);
  const center = spec.steering.phaseChangeSpeed;
  const t = clamp((Math.abs(speed) - center * .68) / (center * .64), 0, 1);
  const phase = -1 + 1.35 * t * t * (3 - 2 * t);
  // Same-phase high-speed steering contributes only a small lateral demand.
  // This .12 g contribution cap is a documented simulation calibration, not
  // an OEM steering map. It keeps the 10° parking range out of highway inputs.
  const halfTrackRatio = spec.track / (2 * spec.wheelbase), maximumTangent = Math.tan(maximum);
  const virtualTangentLimit = maximumTangent * Math.max(0, 1 - halfTrackRatio * Math.abs(Math.tan(frontAngle)))
    / (1 + (phase < 0 ? 1 : -1) * maximumTangent * halfTrackRatio);
  // The inner wheel gains angle through Ackermann geometry. Limit the virtual
  // axle command so that the actual inner rear wheel also stays within 10°.
  const geometricLimit = Math.atan(virtualTangentLimit);
  const limit = phase > 0 ? Math.min(geometricLimit, Math.atan(.12 * 9.81 * spec.wheelbase / Math.max(1, speed * speed))) : geometricLimit;
  return clamp(frontAngle * .52 * phase, -limit, limit);
}
