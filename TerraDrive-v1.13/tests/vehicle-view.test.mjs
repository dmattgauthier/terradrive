import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { VehicleView } from '../dist/src/vehicle-view.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { deriveVehicle } from '../dist/src/upgrades.js';
import { createShowroomPose } from '../dist/src/garage.js';
import { winchBodyMount, winchMountLocal, vehicleBodyRise } from '../dist/src/recovery-mount.js';

const spec = VEHICLES[0];
function frame(vehicle = spec, deflection = 0.025, pressure = 35) {
  const radius = vehicle.tireRadius;
  return {
    position: { x: 0, y: vehicle.cgHeight + 0.02, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
    wheels: Array.from({ length: 4 }, (_, i) => ({
      position: { x: (i % 2 ? -1 : 1) * vehicle.width * 0.42, y: radius - deflection, z: vehicle.wheelbase * (i < 2 ? 1 - vehicle.frontWeightFraction : -vehicle.frontWeightFraction) },
      steer: 0, rotation: 0, radius: radius - deflection, unloadedRadius: radius, deflection,
      normal: { x: 0, y: 1, z: 0 }, contact: true, contactLength: 2 * Math.sqrt(radius ** 2 - (radius - deflection) ** 2), contactWidth: vehicle.tireWidth * 0.91,
      pressure, load: 5200, contactProfile: [],
    })),
  };
}
function rubberPoints(wheel) {
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wheel.tireSpin.rotation.x), points = [];
  for (const entry of wheel.deformation.meshes) {
    const p = entry.mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(p, i).applyQuaternion(spin));
  }
  return points;
}
function footprint(view, radius) {
  const points = rubberPoints(view.wheels[0]), bottom = Math.min(...points.map(p => p.y)), patch = points.filter(p => Math.abs(p.y + radius) < 0.002);
  return { bottom, top: Math.max(...points.map(p => p.y)), width: 2 * Math.max(...points.map(p => Math.abs(p.x))), length: Math.max(...patch.map(p => p.z)) - Math.min(...patch.map(p => p.z)) };
}
function profileOnPlane(wheel, normal, rise = 0) {
  const across = new THREE.Vector3(1, 0, 0).addScaledVector(normal, -normal.x).normalize(), along = across.clone().cross(normal).normalize();
  const center = new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z).addScaledVector(normal, -wheel.radius);
  wheel.contactProfile = [];
  for (const u of [-0.5, 0, 0.5]) for (const v of [-0.5, 0, 0.5]) {
    const point = center.clone().addScaledVector(along, u * wheel.contactLength).addScaledVector(across, v * wheel.contactWidth);
    if (!u && !v) point.addScaledVector(normal, rise);
    wheel.contactProfile.push({ x: point.x, y: point.y, z: point.z });
  }
}

test('tire footprint grows at lower pressure without resizing the rim or upper tire', () => {
  const scene = new THREE.Scene(), view = new VehicleView(scene, spec);
  const rim = view.wheels[0].rimSpin.children.filter(mesh => mesh.isMesh).map(mesh => mesh.geometry.attributes.position.array.slice());
  view.update(frame(spec, 0.018, 40)); const high = footprint(view, spec.tireRadius - 0.018);
  view.update(frame(spec, 0.075, 12)); const low = footprint(view, spec.tireRadius - 0.075);
  assert.ok(Math.abs(high.bottom + spec.tireRadius - 0.018) < 0.00005);
  assert.ok(Math.abs(low.bottom + spec.tireRadius - 0.075) < 0.00005);
  assert.ok(low.length > high.length * 1.45, 'Lower-pressure carcass must form a longer ground contact patch');
  assert.ok(low.width > high.width + 0.025, 'Loaded sidewall must bulge locally at lower pressure');
  assert.ok(Math.abs(high.top - low.top) < 0.00001, 'Upper rubber must stay round instead of whole-tire squashing');
  assert.ok(Math.abs(high.top - spec.tireRadius) < 0.003, 'Nominal radius includes tread, rather than adding protruding tread outside it');
  assert.deepEqual(view.wheels[0].tireShape.scale.toArray(), [1, 1, 1]);
  view.wheels[0].rimSpin.children.filter(mesh => mesh.isMesh).forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, rim[i]));
  view.dispose(); assert.equal(scene.children.length, 0);
});

test('spinning tire footprint follows the world slope and local obstacle support while rims stay rigid', () => {
  const scene = new THREE.Scene(), view = new VehicleView(scene, spec), state = frame(spec, 0.055, 16);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, 0.40, -0.10)), normal = new THREE.Vector3(0.22, 0.954, 0.18).normalize();
  state.quaternion = q;
  for (const wheel of state.wheels) { wheel.steer = 0.23; wheel.rotation = 1.18; wheel.normal = normal; profileOnPlane(wheel, normal); }
  view.update(state);
  const w = view.wheels[0], heights = rubberPoints(w).map(p => p.applyQuaternion(w.root.quaternion).dot(normal));
  assert.ok(Math.min(...heights) >= -state.wheels[0].radius - 0.00005, 'Rubber must remain above the actual sloped support plane');
  assert.ok(heights.filter(h => Math.abs(h + state.wheels[0].radius) < 0.0025).length > 100, 'A real flat patch must remain fixed against the slope while rubber spins');
  const flat = frame(spec, 0.05, 16); for (const wheel of flat.wheels) profileOnPlane(wheel, new THREE.Vector3(0, 1, 0), 0.024);
  view.update(flat);
  const center = rubberPoints(view.wheels[0]).filter(p => Math.abs(p.x) < 0.002 && Math.abs(p.z) < 0.002 && p.y < 0);
  assert.ok(center.length > 0, 'Crown geometry must have vertices across its center');
  assert.ok(Math.min(...center.map(p => p.y)) > -flat.wheels[0].radius + 0.022, 'Crown vertices must conform to the sampled small central ridge');
  view.dispose();
});

test('airborne tires restore pristine rubber and repeated stationary frames reuse the cached deformation', () => {
  const scene = new THREE.Scene(), view = new VehicleView(scene, VEHICLES[2]), state = frame(VEHICLES[2], 0.035, 19);
  view.update(state); const count = view.wheels[0].deformation.updates;
  for (let i = 0; i < 12; i++) view.update(state);
  assert.equal(view.wheels[0].deformation.updates, count);
  for (const wheel of state.wheels) { wheel.contact = false; wheel.deflection = 0; wheel.load = 0; wheel.radius = wheel.unloadedRadius; wheel.rotation = 2.3; }
  view.update(state);
  for (const entry of view.wheels[0].deformation.meshes) {
    assert.deepEqual(entry.mesh.geometry.attributes.position.array, entry.position);
    assert.deepEqual(entry.mesh.geometry.attributes.normal.array, entry.normal);
  }
  view.dispose();
});

test('actual physical contact fields feed finite deforming geometry on all four tires', () => {
  const ground = { sample: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'asphalt', mu: 1, rollingResistance: 0.012, softness: 0, maxSink: 0, waterDepth: 0 }) };
  const physics = new VehiclePhysics(ground, spec), scene = new THREE.Scene(), view = new VehicleView(scene, spec);
  physics.reset({ x: 0, z: 0, heading: 0 }); for (let i = 0; i < 420; i++) physics.step(1 / 120, {});
  view.update(physics.state);
  for (const [i, wheel] of view.wheels.entries()) {
    assert.ok(wheel.deformation.metrics?.deflection > 0, `Physical wheel ${i} must report loaded deflection`);
    assert.equal(wheel.deformation.metrics.supportSamples, 9);
    for (const p of rubberPoints(wheel)) assert.ok(Number.isFinite(p.lengthSq()));
  }
  view.dispose();
});

test('localized dents, glass fractures, lamp breakage and bent suspension survive repaint then repair exactly', () => {
  const scene = new THREE.Scene(), view = new VehicleView(scene, spec), state = frame();
  const offset = view.body.position, local = (x, y, z) => ({ x: x + offset.x, y: y + offset.y, z: z + offset.z });
  const profile = { revision: 1, condition: 0.65, body: 0.35, engine: 0.1, suspension: [0.7, 0, 0, 0], tires: [0.8, 0, 0, 0], dents: [
    { id: 'door', point: local(0.85, 0.88, 0), normal: { x: 1, y: 0, z: 0 }, radius: 0.42, depth: 0.16, severity: 0.75 },
    { id: 'lamp', point: local(0.63, 1.03, 2.20), normal: { x: 0, y: 0, z: 1 }, radius: 0.35, depth: 0.19, severity: 0.9 },
    { id: 'glass', point: local(0.82, 1.5, -0.1), normal: { x: 1, y: 0, z: 0 }, radius: 0.38, depth: 0.08, severity: 0.8 },
  ] };
  state.damage = profile; view.update(state);
  assert.ok(view.damageView.metrics.changedVertices > 300);
  assert.equal(view.damageView.group.children.length, 3, 'Impacts should generate localized scuffs, exposed metal and glazing cracks');
  assert.ok(view.damageView.entries.some(entry => entry.mesh.material === view.materials.white && Math.max(...entry.mesh.geometry.attributes.tdDamage.array) > 0.7), 'Only locally hit lamp vertices should receive the extinguishing mask');
  // Painted trim can live in a separate shadow batch. Exercise the main body
  // skin, independent of the order in which those trim meshes are constructed.
  const paint = view.damageView.entries.filter(entry => entry.mesh.material === view.materials.paint).sort((a, b) => b.position.length - a.position.length)[0];
  let changed = 0, untouched = 0;
  for (let i = 0; i < paint.position.length; i += 3) {
    if (Math.abs(paint.mesh.geometry.attributes.position.array[i] - paint.position[i]) > 0.0001) changed++;
    if (paint.position[i] < -0.6) { assert.equal(paint.mesh.geometry.attributes.position.array[i], paint.position[i], 'Opposite side of vehicle must not crumple or scale'); untouched++; }
  }
  assert.ok(changed > 100 && untouched > 100);
  const damagePositions = paint.mesh.geometry.attributes.position.array.slice(), mask = paint.mesh.geometry.attributes.tdDamage.array.slice();
  assert.equal(view.setPaint('#3a8'), '#33aa88'); assert.equal(view.setPaint('invalid'), false);
  view.update(state, { paint: '#245da4' }); assert.equal(view.materials.paint.color.getHexString(), '245da4');
  assert.deepEqual(paint.mesh.geometry.attributes.position.array, damagePositions); assert.deepEqual(paint.mesh.geometry.attributes.tdDamage.array, mask);
  assert.ok(view.links.some(link => link.wheel === 0 && link.mesh.geometry.attributes.position.array.some((n, i) => Math.abs(n - link.pristine[i]) > 0.015)), 'Hit suspension links should bend independently of chassis shape');
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  view.materials.white.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance *= 1.0 - smoothstep'));
  assert.ok(shader.vertexShader.includes('vTdDamage = tdDamage;'));
  state.damage = { revision: 2, condition: 1, body: 0, engine: 0, suspension: [0, 0, 0, 0], tires: [0, 0, 0, 0], dents: [] };
  view.update(state);
  assert.equal(view.damageView.group.children.length, 0); assert.equal(view.materials.paint.color.getHexString(), '245da4', 'Repair should retain selected paint');
  for (const entry of view.damageView.entries) {
    assert.deepEqual(entry.mesh.geometry.attributes.position.array, entry.position);
    assert.deepEqual(entry.mesh.geometry.attributes.normal.array, entry.normal);
    assert.ok(entry.mesh.geometry.attributes.tdDamage.array.every(n => n === 0));
  }
  for (const link of view.links) assert.deepEqual(link.mesh.geometry.attributes.position.array, link.pristine);
  // Physics retains many impacts by expanding a compatible-facing cluster. Its
  // published radius must remain visible beyond the original single-hit limit.
  state.damage = { revision: 3, suspension: [0, 0, 0, 0], tires: [0, 0, 0, 0], dents: [{ id: 'merged-side', point: local(0.85, 0.88, -0.8), normal: { x: 1, y: 0, z: 0 }, radius: 2.2, depth: 0.10, severity: 0.8 }] };
  view.update(state);
  assert.ok(paint.position.some((value, i) => i % 3 === 0 && value > 0.65 && paint.position[i + 2] > 0.95 && Math.abs(paint.mesh.geometry.attributes.position.array[i] - value) > 0.001), 'Expanded merged-impact radius must reach the newly hit distant part of the same side');
  view.dispose(); assert.equal(scene.children.length, 0);
});

test('visible reverse lamps stay at the rear and lighting channels remain independent', () => {
  for(const spec of VEHICLES) {
    const scene=new THREE.Scene(),view=new VehicleView(scene,spec),state=frame(spec);
    const reverseMeshes=[];
    view.body.traverse(mesh=>{if(mesh.isMesh&&mesh.material===view.materials.reverse)reverseMeshes.push(mesh);});
    assert.ok(reverseMeshes.length,`${spec.id} must contain visible reversing-light optics`);
    for(const mesh of reverseMeshes) {
      mesh.geometry.computeBoundingBox();
      assert.ok(mesh.geometry.boundingBox.max.z<-.5,`${spec.id} reversing-light material must not illuminate front trim or headlamps`);
    }
    state.selector='D';view.update(state,{headlights:false});
    const whiteOff=view.materials.white.emissiveIntensity,tailOff=view.materials.red.emissiveIntensity;
    assert.equal(view.materials.reverse.emissiveIntensity,0);
    state.selector='R';view.update(state,{headlights:false});
    assert.ok(view.materials.reverse.emissiveIntensity>0);
    assert.equal(view.materials.white.emissiveIntensity,whiteOff);
    assert.equal(view.materials.headlampCore.emissiveIntensity,0,'Reverse must not switch on the headlamp projectors');
    assert.equal(view.materials.headlampReflector.emissiveIntensity,0,'Reverse must not light the headlamp reflector bowls');
    view.update(state,{headlights:true,brake:1});
    assert.ok(view.materials.white.emissiveIntensity>whiteOff);
    assert.ok(view.materials.headlampCore.emissiveIntensity>0);
    assert.ok(view.materials.headlampReflector.emissiveIntensity>0);
    assert.ok(view.materials.red.emissiveIntensity>tailOff);
    assert.equal(view.materials.redPaint.emissive.getHex(),0,'Painted red trim must not be wired to the brake-lamp channel');
    view.dispose();assert.equal(scene.children.length,0);
  }
});

test('optional winch fairlead stays aligned to the physical mount through body offsets and chassis rotation', () => {
  for (const spec of VEHICLES) {
    const scene = new THREE.Scene(), view = new VehicleView(scene, spec), state = frame(spec);
    assert.equal(view.winchEnabled, false);
    assert.equal(view.winchKit, null, 'Stock vehicles must not contain aftermarket kit geometry');
    const bodyMount = winchBodyMount(spec), localMount = winchMountLocal(spec);
    const bodyToChassis = new THREE.Vector3(bodyMount.x, bodyMount.y, bodyMount.z).add(view.body.position);
    assert.ok(bodyToChassis.distanceTo(new THREE.Vector3(localMount.x, localMount.y, localMount.z)) < 1e-12, `${spec.id} model nose and force solver must share the same origin`);
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(.19, 1.17, -.13));
    state.position = { x: 31, y: 4.3, z: -18 }; state.quaternion = quaternion;
    view.update(state, { paint: '#285787', winchEnabled: true });
    scene.updateMatrixWorld(true);
    assert.ok(view.winchKit?.parent === view.root && view.winchKit.userData.aftermarket);
    const anchor = view.getWinchAnchor(), expected = bodyToChassis.applyQuaternion(quaternion).add(new THREE.Vector3(31, 4.3, -18));
    assert.ok(anchor.distanceTo(expected) < 1e-10);
    assert.ok(view.winchKit.localToWorld(new THREE.Vector3()).distanceTo(anchor) < 1e-10, 'Cable must leave the visible hawse centre');
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    const exitRay = new THREE.Raycaster(anchor.clone().addScaledVector(forward, .0001), forward, 0, 10);
    assert.equal(exitRay.intersectObject(view.root, true).length, 0, `${spec.id} cable exit must be an open slot ahead of the stock nose`);
    const kit = view.winchKit, geometries = [], materials = new Set();
    kit.traverse(object => { if (object.geometry) geometries.push(object.geometry); if (object.material) materials.add(object.material); });
    assert.ok(geometries.length <= 5, 'Winch kit should be batched into a few material draws');
    let disposed = 0; for (const geometry of geometries) geometry.addEventListener('dispose', () => disposed++);
    view.setWinchEnabled(false); assert.equal(kit.parent, null);
    view.setWinchEnabled(true); assert.equal(view.winchKit, kit, 'Toggling must reuse the kit instead of accumulating geometry');
    assert.equal(view.materials.paint.color.getHexString(), '285787');
    view.setWinchEnabled(false); view.dispose();
    assert.equal(disposed, geometries.length, 'Disposal must also release a detached cached kit');
    assert.equal(scene.children.length, 0);
  }
});

test('standard-mirror spans match Honda, Ford and period Mercedes dimensions without resizing the wheel rigs', () => {
  // Ford MY24 Equipment Installation Guide p6, W144: 2189mm. Mercedes
  // period W906 drawing: 2426mm; ©2016 MY17 Crew brochure p44: 95.5in.
  // Honda Canada MY24 sedan dimensional table: 2081mm including mirrors.
  for(const [style,target] of [['bronco',2.189],['van',2.426],['sedan',2.081]]) {
    const spec = VEHICLES.find(v => v.bodyStyle === style), scene = new THREE.Scene(), view = new VehicleView(scene, spec);
    view.update(frame(spec)); scene.updateMatrixWorld(true);
    const width = new THREE.Box3().setFromObject(view.root).getSize(new THREE.Vector3()).x;
    assert.ok(Math.abs(width - target) < .001, `${spec.id} actual model width with mirrors: ${width}m`);
    assert.ok(Math.abs(view.wheels[0].root.position.z - view.wheels[2].root.position.z - spec.wheelbase) < 1e-10);
    view.dispose();
  }
});

test('Civic upper grille remains an actual recessed opening with no painted aperture overlap', () => {
  const scene = new THREE.Scene(), view = new VehicleView(scene, VEHICLES.find(v => v.bodyStyle === 'sedan'));
  scene.updateMatrixWorld(true);
  for (const x of [-.27, -.20, .20, .27]) {
    const start = view.body.localToWorld(new THREE.Vector3(x, .685, 5));
    const hit = new THREE.Raycaster(start, new THREE.Vector3(0, 0, -1), 0, 10).intersectObject(view.body, true)[0];
    assert.equal(hit?.object.material, view.materials.black, 'A front ray must reach the black grille backing rather than an invalid overlapping paint triangle');
    assert.ok(view.body.worldToLocal(hit.point.clone()).z < 2.26, 'Grille backing must sit behind the surrounding fascia');
  }
  view.dispose();
});

test('replacement tire categories change actual tread geometry, while selected rims and SUV spares retain their dimensions', () => {
  const scene = new THREE.Scene(), view = new VehicleView(scene, spec), records = {};
  for (const [selection, expected] of [['road', 'road-performance'], ['allTerrain', 'all-terrain'], ['mud', 'mud-terrain'], ['sand', 'sand']]) {
    const build = deriveVehicle(spec, { tires: selection, size: 'large', suspension: 'trail' });
    view.setSpec(build);
    const wheel = view.wheels[0], tread = wheel.tireSpin.children.find(mesh => mesh.material === view.materials.tread);
    assert.ok(tread?.geometry?.attributes.position.count > 1000, 'Replacement tread must contain real lug vertices');
    assert.equal(wheel.root.userData.tire.profile, expected);
    assert.ok(Math.abs(wheel.rimRadius * 2 - 17 * .0254) < 1e-12, 'Larger SUV tires keep the selected 17-inch metal rim');
    const points = rubberPoints(wheel), top = Math.max(...points.map(p => p.y));
    assert.ok(Math.abs(top - build.tireRadius) < .003, 'Replacement nominal diameter includes its raised tread');
    const spare = [];
    view.body.traverse(object => { if (object.userData.tire) spare.push(object); });
    assert.equal(spare.length, 1);
    assert.deepEqual(spare[0].userData.tire, wheel.root.userData.tire, 'Visible mounted spare must use the same tire and rim package');
    let spareLugs = null; spare[0].traverse(object => { if (object.isInstancedMesh) spareLugs = object; });
    assert.equal(spareLugs?.count, wheel.root.userData.tire.rows * wheel.root.userData.tire.circumferentialBlocks);
    records[selection] = { positions: tread.geometry.attributes.position.array.slice(), depth: wheel.root.userData.tire.treadDepth };
  }
  assert.ok(records.mud.positions.length < records.road.positions.length / 2, 'Mud tread must have separated open lugs instead of merely recolored road blocks');
  assert.ok(records.mud.depth > records.road.depth * 2);
  assert.notDeepEqual(records.allTerrain.positions, records.road.positions);
  assert.notDeepEqual(records.sand.positions, records.mud.positions);
  const civic = deriveVehicle(VEHICLES.find(v => v.bodyStyle === 'sedan'), { tires: 'allTerrain', size: 'large', suspension: 'trail' });
  view.setSpec(civic);
  assert.ok(Math.abs(view.wheels[0].rimRadius * 2 - 16 * .0254) < 1e-12, 'Civic rally package must replace its 18-inch rim with the selected 16-inch wheel');
  view.dispose(); assert.equal(scene.children.length, 0);
});

test('installed lift raises the actual loaded body and fairlead while live differentials remain on wheel centers', () => {
  for (const base of VEHICLES) {
    const factory = deriveVehicle(base), effective = deriveVehicle(base, {
      tires: base.bodyStyle === 'sedan' ? 'allTerrain' : base.bodyStyle === 'van' ? 'sand' : 'mud',
      size: 'large', suspension: 'trail', drivetrain: ['sedan', 'van'].includes(base.bodyStyle) ? 'conversion' : 'stock',
    });
    const scene = new THREE.Scene(), view = new VehicleView(scene, factory);
    view.update(createShowroomPose(factory)); scene.updateMatrixWorld(true);
    const original = view.body.getWorldPosition(new THREE.Vector3());
    view.setSpec(effective); const pose = createShowroomPose(effective);
    view.update(pose, { winchEnabled: true }); scene.updateMatrixWorld(true);
    const raised = view.body.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(raised.y - original.y - vehicleBodyRise(effective)) < .012, `${base.id} loaded body rise must follow tires and suspension once, including tire flex and spring sag`);
    const mount = winchBodyMount(effective), visualMount = view.body.localToWorld(new THREE.Vector3(mount.x, mount.y, mount.z));
    assert.ok(visualMount.distanceTo(view.getWinchAnchor()) < 1e-10, `${base.id} physical fairlead must stay on the raised bumper after mass/CG changes`);
    for (const wheel of pose.wheels) {
      assert.ok(wheel.contact && wheel.load > 0);
      assert.ok(Math.abs(wheel.position.y - wheel.radius) < .005, 'Lift must not bury tires or suspend them above the floor');
    }
    for (const axle of view.axles) {
      const [a, b] = pose.wheels.slice(axle.axle * 2, axle.axle * 2 + 2).map(w => new THREE.Vector3(w.position.x, w.position.y, w.position.z));
      const center = a.add(b).multiplyScalar(.5);
      assert.ok(axle.diff.getWorldPosition(new THREE.Vector3()).distanceTo(center) < 1e-10, 'A solid-axle differential must follow its two hubs, not body lift');
    }
    view.dispose(); assert.equal(scene.children.length, 0);
  }
});

test('converted driveline shafts connect body-mounted components to moving hubs through chassis rotation and articulation', () => {
  for (const base of VEHICLES.filter(v => ['sedan', 'van'].includes(v.bodyStyle))) {
    const scene = new THREE.Scene(), view = new VehicleView(scene, base);
    const factoryHalfShafts = view.driveLinks.filter(link => link.target.wheel !== undefined).length;
    assert.equal(factoryHalfShafts, base.bodyStyle === 'sedan' ? 2 : 0);
    const effective = deriveVehicle(base, { drivetrain: 'conversion', suspension: 'trail', size: 'large', tires: base.bodyStyle === 'sedan' ? 'allTerrain' : 'sand' });
    view.setSpec(effective);
    const pose = frame(effective), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.21, .47, -.15));
    pose.quaternion = q; pose.position = { x: 17, y: 3.6, z: -21 };
    for (const [i, wheel] of pose.wheels.entries()) {
      const p = new THREE.Vector3(wheel.position.x, wheel.position.y - effective.cgHeight + (i % 2 ? -.06 : .09), wheel.position.z).applyQuaternion(q).add(new THREE.Vector3(17, 3.6, -21));
      wheel.position = { x: p.x, y: p.y, z: p.z }; wheel.contact = false; wheel.load = 0; wheel.deflection = 0; wheel.radius = wheel.unloadedRadius;
    }
    view.update(pose); scene.updateMatrixWorld(true);
    assert.equal(view.driveLinks.filter(link => link.target.wheel !== undefined).length, base.bodyStyle === 'sedan' ? 4 : 2, 'A conversion must add the previously undriven axle half-shafts');
    assert.ok(view.driveLinks.some(link => link.target.wheel === undefined), 'A conversion needs a real longitudinal propshaft');
    for (const link of view.driveLinks) {
      const from = view.body.localToWorld(new THREE.Vector3(...link.bodyPoint));
      let to;
      if (link.target.wheel !== undefined) { const p = pose.wheels[link.target.wheel].position; to = new THREE.Vector3(p.x, p.y, p.z); }
      else if (link.target.body) to = view.body.localToWorld(new THREE.Vector3(...link.target.body));
      else { const a = pose.wheels[link.target.axle * 2].position, b = pose.wheels[link.target.axle * 2 + 1].position; to = new THREE.Vector3(a.x + b.x, a.y + b.y, a.z + b.z).multiplyScalar(.5); }
      const ends = [-.5, .5].map(y => link.mesh.localToWorld(new THREE.Vector3(0, y, 0)));
      assert.ok(ends[0].distanceTo(from) < 1e-8 && ends[1].distanceTo(to) < 1e-8, 'Visible shaft cylinder must meet the actual body and wheel joints, not just update metadata');
    }
    view.dispose(); assert.equal(scene.children.length, 0);
  }
});

test('replacing effective specs releases old body, wheel and articulated-shaft resources without leaving detached rigs', () => {
  const scene = new THREE.Scene(), view = new VehicleView(scene, VEHICLES[2]), oldObjects = new Set(), geometries = new Set(), materials = new Set();
  scene.traverse(object => {
    if (object !== scene && object !== view.root && object !== view.body) oldObjects.add(object);
    if (object.geometry) geometries.add(object.geometry);
    for (const material of object.material ? [].concat(object.material) : []) materials.add(material);
  });
  const releasedGeometry = new Set(), releasedMaterial = new Set();
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => releasedGeometry.add(geometry)));
  materials.forEach(material => material.addEventListener('dispose', () => releasedMaterial.add(material)));
  view.setSpec(deriveVehicle(VEHICLES[2], { drivetrain: 'conversion', suspension: 'trail', size: 'large', tires: 'allTerrain' }));
  assert.equal(releasedGeometry.size, geometries.size);
  assert.equal(releasedMaterial.size, materials.size);
  scene.traverse(object => assert.ok(!oldObjects.has(object), 'Old buffers and detached wheel/shaft groups must not survive a spec rebuild'));
  view.dispose(); assert.equal(scene.children.length, 0);
});

test('shared lens normal textures release once on upgrade rebuild and final disposal', () => {
  const scene=new THREE.Scene(),spec=VEHICLES.find(vehicle=>vehicle.bodyStyle==='van'),view=new VehicleView(scene,spec);
  const textures=()=>new Set(Object.values(view.materials).map(material=>material.normalMap).filter(Boolean));
  const initial=textures(),released=new Map();
  assert.ok(initial.size>0,'The actual prismatic lens detail allocates a normal texture');
  for(const texture of initial)texture.addEventListener('dispose',()=>released.set(texture,(released.get(texture)||0)+1));
  view.setSpec(deriveVehicle(spec,{suspension:'trail',tires:'allTerrain'}));
  for(const texture of initial)assert.equal(released.get(texture),1,'Shared clear/red lens texture must be released exactly once when replacing geometry');
  const current=textures(),finalReleased=new Map();
  for(const texture of current){
    assert.ok(!initial.has(texture),'The replacement rig must own fresh texture resources');
    texture.addEventListener('dispose',()=>finalReleased.set(texture,(finalReleased.get(texture)||0)+1));
  }
  view.dispose();
  for(const texture of current)assert.equal(finalReleased.get(texture),1,'Final disposal must also release normal textures exactly once');
  assert.equal(scene.children.length,0);
});
