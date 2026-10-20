/** Reusable service-brake-settled native capture fixtures. Runtime classes are passed
 * by the caller from its --source-root, never silently imported from another
 * checkout. No prescribed vehicle/wheel velocities or synthetic contact paths.
 * Controls call VehiclePhysics directly: settling is the service brake, without
 * DrivingInput's automatic reverse selection. Driving uses accelerator/steering.
 */
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };

export const TIRE_SPRAY_DRIVING_SCENARIOS = freeze([
  {
    id: 'hummer-mud-turn', vehicle: 'hummer-ev-suv-3x', spawn: { x: 33, z: -114, heading: 0 },
    settleSeconds: 2, settleInput: { brake: 1 }, seconds: 6, dt: 1 / 60, captureSeconds: [6], stockControls: true,
    cameras: [
      { id: 'overview', eye: [19.389601010738613, 6.274826183587944, -111.65091413183379],
        target: [14.189601010738613, 4.424826183587944, -105.95091413183379], fov: 48 },
      { id: 'rear-wheel-and-rocker', eye: [17.72, 4.35, -106.14], target: [15.633935457389729, 4.040985288975551, -104.7286396664692], fov: 50 },
    ],
    cameraDatum: 'Fixed world coordinates chosen from the recorded six-second stock Hummer run; not recomputed from each candidate pose.',
  },
  {
    id: 'wrangler-mud-crawl', vehicle: 'wrangler-rubicon', spawn: { x: 33, z: -114, heading: 0 },
    settleSeconds: 2, settleInput: { brake: 1 }, seconds: 6, dt: 1 / 60, captureSeconds: [6], stockControls: true,
    cameras: [
      { id: 'rear-wheel-opening', eye: [35.855, 4.14795858629813, -110.34114],
        target: [33.36271949868388, 3.65795858629813, -111.751140446977], fov: 48 },
      { id: 'front-wheel-opening', eye: [34.9668, 4.312835119440478, -107.4738],
        target: [32.46818156483387, 3.822835119440478, -108.88383285475729], fov: 48 },
    ],
    cameraDatum: 'Fixed world coordinates chosen from the recorded six-second stock2H Wrangler run; no emission forced from a dry or unsupported tire.',
  },
]);

export function tireSprayDrivingInput(frame) {
  return { throttle: .8, steer: frame > 60 ? .45 : 0, steerSource: 'analog' };
}

/** The caller supplies a real terrain world and the production classes loaded
 * from its chosen immutable source. prepareVehicle can temporarily install the
 * native harness canvas adapter around World.setVehicle. capture is synchronous
 * so geometry can be exported at the exact driven state, then resumed.
 */
export function runTireSprayDrivingScenario({ world, scenario = TIRE_SPRAY_DRIVING_SCENARIOS[0],
  VehiclePhysics, TireSprayView, spec, prepareVehicle = vehicle => world.setVehicle(vehicle), capture = () => {} }) {
  if (!world?.terrain || !world?.scene || !VehiclePhysics || !TireSprayView || !spec || spec.id !== scenario.vehicle) {
    throw new Error('Supply the real world, source-selected runtime classes, and the fixture vehicle specification.');
  }
  world.terrain.resetDeformation(); world._syncDeformation?.(); world._syncWaterDepth?.(true);
  for (const ripple of world._waterRipples || []) ripple.set(0, 0, -100, 0);
  world._waterWheelHistory?.clear(); world._nearDetailState = null;
  prepareVehicle(spec);
  if (!world.vehicle || world.spec.id !== spec.id) throw new Error('The fixture must drive the world’s actual selected VehicleView.');
  if (!world.tireSpray) world.tireSpray = new TireSprayView(world.scene, world.terrain);
  world.tireSpray.clear(); world.tireSpray.setVehicle?.(world.vehicle); world.tireSpray.group.visible = true;
  if (world.tireSpray.impactMarks) world.tireSpray.impactMarks.group.visible = true;
  const simulation = new VehiclePhysics(world.terrain, spec); simulation.reset(scenario.spawn);
  let elapsedFrames = 0, waterLandings = 0, panelImpactEvents = 0, maxActive = 0;
  const tick = input => {
    const state = simulation.step(scenario.dt, input); elapsedFrames++;
    world.clock = elapsedFrames * scenario.dt;
    // Match the production order relevant to this bounded mud route. The same
    // VehicleView whose triangles are rendered supplies the spray collider.
    world.vehicle.update(state, {}); world._syncDeformation?.(); world._updateWater?.(scenario.dt, state);
    world.tireSpray.update(scenario.dt, state, world.quality || 'high');
    for (const impact of world.tireSpray.simulation.impacts || []) {
      waterLandings++;
      if (!world._waterRipples?.length) continue;
      const slot = (world._waterRippleCursor || 0) % world._waterRipples.length; world._waterRippleCursor = (world._waterRippleCursor || 0) + 1;
      world._waterRipples[slot].set(impact.x, impact.z, world.clock, impact.strength); world._waterMotions[slot].set(0, 0, 0, .06);
    }
    panelImpactEvents += world.tireSpray.simulation.bodyImpacts?.length || 0;
    maxActive = Math.max(maxActive, world.tireSpray.mud.count + world.tireSpray.water.count);
    world._updateGroundProximity?.(state.position);
    return state;
  };
  for (let frame = 0; frame < Math.round(scenario.settleSeconds / scenario.dt); frame++) tick(scenario.settleInput);
  // The numerical acceptance starts its clean spray history after the same
  // brake settle. No settled chassis state is altered here.
  world.tireSpray.clear(); waterLandings = panelImpactEvents = maxActive = 0;
  for (let frame = 0; frame < Math.round(scenario.seconds / scenario.dt); frame++) {
    const state = tick(tireSprayDrivingInput(frame)), seconds = (frame + 1) * scenario.dt;
    if (!scenario.captureSeconds.some(time => Math.abs(seconds - time) < scenario.dt * .25)) continue;
    world._syncWaterDepth?.(true); world.scene.updateMatrixWorld(true);
    const marks = world.tireSpray.impactMarks;
    const metadata = {
      fixture: scenario.id, vehicle: spec.id, ordinaryInput: true, syntheticVelocityWrites: 0, directTerrainStampCalls: 0,
      inputAdapter: 'VehiclePhysics controls directly; stationary service-brake settling without automatic reverse selection, then normal accelerator and analog steering.',
      seconds, settleSeconds: scenario.settleSeconds, frameDT: scenario.dt, spawn: scenario.spawn,
      settleInput: scenario.settleInput,
      controls: { driveMode: simulation.controls.driveMode, tractionControl: simulation.controls.tractionControl,
        accelerator: .8, steering: .45, steeringBeginsAfterSeconds: 1, steeringSource: 'analog' },
      position: state.position, quaternion: state.quaternion, wheelPositions: state.wheels.map(w => ({ index: w.index, position: w.position, ground: w.ground })),
      speedKmh: state.speedKmh, odometerM: state.odometer, condition: state.damage.condition,
      emitted: { ...world.tireSpray.simulation.emitted }, bodyCollisions: { ...world.tireSpray.simulation.bodyCollisions },
      panelImpactEvents, waterLandings, maxActive, activeMud: world.tireSpray.mud.count, activeWater: world.tireSpray.water.count,
      depositedMudVertices: marks?.mud.geometry.drawRange.count || 0, depositedWaterVertices: marks?.water.geometry.drawRange.count || 0,
      retainedDeposits: marks?.records.filter(Boolean).length || 0, colliderTriangles: world.tireSpray.collider?.triangleCount || 0,
      colliderRefits: world.tireSpray.collider?.refits || 0, soilVolumes: { ...world.terrain.soilVolumes },
      cameraTracksVehicle: false, cameraDatum: scenario.cameraDatum,
      omittedOtherParticleSystems: 'Soft airborne dust and rain streaks are outside this mud/water fixture; actual tire ejecta, body deposits and their water-impact ripples are included.',
    };
    capture({ world, state, simulation, scenario, seconds, cameras: scenario.cameras, metadata });
  }
  return { state: simulation.state, simulation, world };
}
