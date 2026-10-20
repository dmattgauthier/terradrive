import { Terrain, SURFACES } from './terrain.js?v=1.15.0';
import { OffroadWorld } from './world.js?v=1.15.0';
import { VehiclePhysics } from './physics.js?v=1.15.0';
import { VEHICLES, VEHICLE_BY_ID } from './vehicles.js?v=1.15.0';
import { getGuideHTML } from './guide.js?v=1.15.0';
import { DrivingInput } from './input.js?v=1.15.0';
import { EngineAudio } from './audio.js?v=1.15.0';
import { GaragePreview, PAINTS } from './garage.js?v=1.15.0';
import { WinchRecovery } from './winch.js?v=1.15.0';
import { WinchView } from './winch-view.js?v=1.15.0';
import { DEFAULT_BUILD, deriveVehicle, normalizeBuild, validateBuild } from './upgrades.js?v=1.15.0';
import { workshopHTML } from './workshop-view.js?v=1.15.0';
import { surfaceFeedback, wheelSurfaceLabel } from './surface-feedback.js?v=1.15.0';
import { createChallengeCourse, challengeReservedAt } from './challenge-course.js?v=1.15.0';
import { electricControlsHTML, launchStatusText, RegenHoldInput } from './electric-controls.js?v=1.15.0';

const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const n = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const RAD_TO_DEG = 180 / Math.PI;
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, extra = '') => `<svg ${extra}><use href="#i-${id}"/></svg>`;
const setText = (id, text) => { const e = $(id); if (e && e.textContent !== String(text)) e.textContent = text; };
const storeKey = 'terra-drive-settings-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; } catch { /* Storage is optional. */ }
const vehiclePaints = Object.fromEntries(VEHICLES.map(vehicle => [vehicle.id, /^#[0-9a-f]{6}$/i.test(saved.vehiclePaints?.[vehicle.id] || '') ? saved.vehiclePaints[vehicle.id] : vehicle.color]));
const vehicleWinches = Object.fromEntries(VEHICLES.map(vehicle => [vehicle.id, saved.vehicleWinches?.[vehicle.id] === true]));
const vehicleBuilds = Object.fromEntries(VEHICLES.map(vehicle => {
  const restored = validateBuild(vehicle, saved.vehicleBuilds?.[vehicle.id]);
  return [vehicle.id, restored.ok ? restored.build : { ...DEFAULT_BUILD }];
}));
const oneOf = (value, list, fallback) => list.includes(value) ? value : fallback;
const options = {
  camera: oneOf(saved.camera, ['chase', 'hood', 'orbit', 'free'], 'chase'),
  weather: oneOf(saved.weather, ['dry', 'rain'], 'dry'),
  timeOfDay: oneOf(saved.timeOfDay, ['day', 'sunset'], 'sunset'),
  quality: oneOf(saved.quality, ['high', 'medium', 'low'], 'medium'),
  units: oneOf(saved.units, ['mph', 'kmh'], 'mph'),
  headlights: false,
  gamepad: saved.gamepad !== 'off',
};
let spec = configuredVehicle(VEHICLE_BY_ID[saved.vehicle]?.id || VEHICLES[0].id);
let workshopVehicleId = spec.id;
let workshopDraft = { ...vehicleBuilds[spec.id] };
let paused = false;
let currentZone = 'trail';
let guideTopic = 'controls';
let input;
let world;
let garagePreview;
let winch;
let winchView;
let winchCandidates = [];
let selectedWinchAnchor = '';
let lastAnchorRefresh = -Infinity;
let lastWinchMessage = '';
let lastNotice = '';
let tick = 0;
let frameNumber = 0;
let lastTime = performance.now();
let fpsCounter = 0;
let fpsElapsed = 0;
let fps = 60;
let lastMapTime = -1;
let lastUI = -1;
let lastHistory = -1;
let lastChart = -1;
let frameFailed = false;
let trackLimitNotified = false;
let audio = new EngineAudio();
const history = [];
const terrain = new Terrain();
terrain.course = createChallengeCourse();
terrain.setWeather(options.weather);
const physics = new VehiclePhysics(terrain, spec);
physics.reset(terrain.zones[0].spawn);
const regenHold = new RegenHoldInput(active => { if (spec.features.regenOnDemand) setControl('regenOnDemand', active, true); });
let regenVehicleId = spec.id;

const featureDefinitions = [
  { key: 'rearLocked', feature: 'rearLocker', label: 'Rear axle lock', short: 'REAR DIFFERENTIAL', on: 'LOCKED', off: 'OPEN' },
  { key: 'frontLocked', feature: 'frontLocker', label: 'Front axle lock', short: 'FRONT DIFFERENTIAL', on: 'LOCKED', off: 'OPEN' },
  { key: 'swayDisconnected', feature: 'swayDisconnect', label: 'Stabilizer disconnect', short: 'FRONT SWAY BAR', on: 'DISCONNECTED', off: 'CONNECTED' },
  { key: 'tractionControl', feature: 'tractionControl', label: 'Traction control', short: 'BRAKE / THROTTLE ASSIST', on: 'ENABLED', off: 'DISABLED' },
  { key: 'offRoadPlus', feature: 'offRoadPlus', label: 'Off Road+', short: 'OFF-ROAD TRACTION PROGRAM', on: 'ENABLED', off: 'DISABLED' },
  { key: 'hillDescent', feature: 'hillDescent', label: 'Hill Descent Control', short: 'LOW-SPEED DESCENT ASSIST', on: 'ENABLED', off: 'DISABLED' },
  { key: 'trailControl', feature: 'trailControl', label: 'Trail Control', short: 'LOW-SPEED CRUISE', on: 'ENABLED', off: 'DISABLED' },
  { key: 'trailTurnAssist', feature: 'trailTurnAssist', label: 'Trail Turn Assist', short: 'INSIDE REAR WHEEL BRAKE', on: 'ENABLED', off: 'DISABLED' },
  { key: 'trailOnePedal', feature: 'trailOnePedal', label: 'Trail One-Pedal Drive', short: 'LIFT-OFF BRAKING', on: 'ENABLED', off: 'DISABLED' },
  { key: 'onePedal', feature: 'onePedal', label: 'One-Pedal Driving', short: 'REGENERATIVE LIFT-OFF BRAKING', on: 'ENABLED', off: 'DISABLED' },
  { key: 'wattsToFreedom', feature: 'wattsToFreedom', label: 'Watts to Freedom', short: 'PREPARE LAUNCH', on: 'MODE ACTIVE', off: 'OFF' },
];
const zoneSubtitles = { snow: 'Powder, drifts & packed forest lane', trail: 'Hardpack & rolling hills', asphalt: 'Acceleration & braking', rock: 'Boulders & rock clusters', mud: 'Broken ruts, mud & stones', wetland: 'Shallow water & soft soil', sand: 'Loose sand & dunes', challenge: '40 m loop, jumps & obstacles' };
const zonePatterns = {
  snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M8 4l4 4 4-4M8 20l4-4 4 4"/>',
  challenge: '<path d="M2 21h5C-2 5 7 1 12 4s7 12 2 14H22M18 21l4-4"/>',
  trail: '<path d="M3 20c15-5-7-11 8-16m0 18c17-8-5-11 10-20"/>',
  asphalt: '<path d="m7 2-4 20M17 2l4 20M12 2v4m0 4v4m0 4v4"/>',
  rock: '<path d="m2 19 3-7 5-1 3-7 5 3 4 12H2Zm3-7 5 8m0-9 7 9m-4-16 4 9 5 6"/>',
  mud: '<path d="M2 7c4-4 4 4 8 0s4 4 8 0 4 2 4 2M2 15c4-4 4 4 8 0s4 4 8 0 4 2 4 2M5 2l-1 20M16 2l-1 20"/>',
  wetland: '<path d="M2 18c3-3 4 3 7 0s4 3 7 0 4 2 6 0M7 17V4m0 6-4-3m4 7 4-4M17 16V7m0 4 4-3"/>',
  sand: '<path d="M2 18c5-11 8-11 14 0M2 22h20M12 18c5-6 8-7 10-4M16 5h.01"/><circle cx="17" cy="5" r="2.5"/>',
};

function saveSettings() {
  try { localStorage.setItem(storeKey, JSON.stringify({ ...options, vehiclePaints, vehicleWinches, vehicleBuilds, gamepad: options.gamepad ? 'on' : 'off', vehicle: spec.id, welcomeDismissed: $('welcome-card').hidden })); } catch { /* Private browsing may prevent storage. */ }
}

function configuredVehicle(id) { return deriveVehicle(VEHICLE_BY_ID[id], vehicleBuilds[id]); }
function configuredVehicles() { return VEHICLES.map(vehicle => configuredVehicle(vehicle.id)); }

function notify(message, warning = false) {
  if (!message) return;
  const item = document.createElement('div'); item.className = `notice${warning ? ' warning' : ''}`; item.textContent = message;
  const stack = $('notice-stack'); stack.appendChild(item);
  while (stack.children.length > 3) stack.firstElementChild.remove();
  setTimeout(() => { item.classList.add('out'); setTimeout(() => item.remove(), 300); }, warning ? 5600 : 3300);
}

function setControl(key, value, quiet = false) {
  const result = physics.setControl(key, value);
  if (!quiet || !result.ok) notify(result.message, !result.ok);
  lastNotice = physics.state.notice;
  renderUI();
  return result;
}

function dismissWelcome() { $('welcome-card').hidden = true; saveSettings(); }
function isModalOpen() { return !!document.querySelector('dialog[open]'); }

function openDialog(name) {
  const dialog = $(`${name}-dialog`);
  if (!dialog || dialog.open) return;
  all('dialog[open]').forEach(d => d.close());
  if (name === 'garage') renderGarage();
  if (name === 'guide') renderGuide();
  if (name === 'map') drawMap($('full-map'), true);
  if (name === 'workshop') renderWorkshop();
  input?.clear();
  dialog.showModal();
  if (name === 'garage') mountGarage();
  if (name === 'workshop') mountWorkshop();
  renderUI();
}

function canInstallBuild(id = workshopVehicleId) {
  return id !== spec.id || (physics.body.velocity.length() < .35 && physics.body.angularVelocity.length() < .35);
}

function openWorkshop(id = spec.id) {
  if (!VEHICLE_BY_ID[id]) return;
  workshopVehicleId = id; workshopDraft = { ...vehicleBuilds[id] };
  if ($('workshop-dialog').open) { renderWorkshop(); mountWorkshop(); }
  else openDialog('workshop');
}

function renderWorkshop() {
  const base = VEHICLE_BY_ID[workshopVehicleId];
  $('workshop-vehicle').innerHTML = VEHICLES.map(vehicle => `<option value="${vehicle.id}"${vehicle.id === base.id ? ' selected' : ''}>${esc(vehicle.name)}</option>`).join('');
  $('workshop-content').innerHTML = workshopHTML(base, workshopDraft, { canInstall: canInstallBuild(base.id), installed: vehicleBuilds[base.id], winchEquipped: vehicleWinches[base.id] });
}

function mountWorkshop() {
  try {
    if (garagePreview?.contextLost) { garagePreview.dispose(); garagePreview = null; }
    garagePreview ||= new GaragePreview();
    garagePreview.mount($('workshop-content'), [deriveVehicle(VEHICLE_BY_ID[workshopVehicleId], workshopDraft)], vehiclePaints, vehicleWinches);
  } catch (error) {
    const message = $('workshop-content').querySelector('.garage-model-status');
    if (message) { message.hidden = false; message.textContent = 'Build preview unavailable. The component comparison remains available.'; }
    console.warn('Workshop preview could not start', error);
  }
}

function installBuild() {
  const base = VEHICLE_BY_ID[workshopVehicleId], validation = validateBuild(base, workshopDraft);
  if (!validation.ok) { notify(validation.issues.join(' '), true); return; }
  if (!canInstallBuild(base.id)) { notify('Stop the active vehicle before installing parts.', true); return; }
  const next = deriveVehicle(base, validation.build);
  if (base.id === spec.id) {
    releaseWinch(); input.clear();
    const result = physics.reconfigureVehicle(next);
    if (!result.ok) { notify(result.message, true); return; }
    spec = next; world.setVehicle(spec);
    world.vehicle?.setPaint?.(vehiclePaints[spec.id]);
    winch.setEquipped(vehicleWinches[spec.id]); world.vehicle?.setWinchEnabled(vehicleWinches[spec.id]);
    lastNotice = ''; renderVehicle();
  }
  vehicleBuilds[base.id] = validation.build; workshopDraft = { ...validation.build };
  saveSettings(); renderGarage(); renderWorkshop(); mountWorkshop();
  notify(`${base.name} · ${next.upgrade.label}.`);
}

function selectZone(id, close = true) {
  const zone = terrain.zones.find(z => z.id === id);
  if (!zone) return;
  currentZone = zone.id;
  releaseWinch();
  physics.reset(zone.spawn);
  physics.setControl('selector', 'D');
  input.clear(); history.length = 0; path.length = 0;
  if (world?.resetCamera) world.resetCamera();
  if (close) all('dialog[open]').forEach(d => d.close());
  dismissWelcome();
  notify(`${zone.name} · ${zoneSubtitles[id]}`);
  updateZones(); renderUI(); drawMap($('minimap'));
}

function recover() {
  const pos = physics.state.position;
  const inside = Math.abs(pos.x) < terrain.halfSize - 15 && Math.abs(pos.z) < terrain.halfSize - 15;
  const location = inside ? { x: pos.x, z: pos.z, heading: physics.state.heading } : terrain.zones.find(z => z.id === currentZone)?.spawn;
  releaseWinch(); physics.reset(location);
  input?.clear();
  notify('Vehicle recovered. Existing damage, drivetrain and tire setup are preserved.');
  renderUI();
}

function repairVehicle() {
  input?.clear();
  const result = physics.repair();
  notify(result.message, !result.ok);
  if (result.ok) { lastNotice = physics.state.notice; renderGarage(); if ($('garage-dialog').open) mountGarage(); }
  renderUI();
}

function restartRun() {
  input?.clear();
  releaseWinch();
  terrain.resetDeformation(); world.resetDamage?.();
  const zone = terrain.zones.find(candidate => candidate.id === currentZone) || terrain.zones[0];
  physics.restart(zone.spawn);
  world.resetCamera?.(); history.length = 0; path.length = 0; lastNotice = '';
  all('dialog[open]').forEach(dialog => dialog.close());
  paused = false; $('paused-overlay').hidden = true; $('pause-toggle').innerHTML = icon('pause'); $('pause-toggle').setAttribute('aria-label', 'Pause simulation');
  notify('Run restarted. This vehicle is repaired and the proving ground is restored.');
  dismissWelcome(); renderVehicle(); renderGarage(); renderUI();
}

function showConsoleTab(tab) {
  if (!['drivetrain', 'tires', 'telemetry', 'damage', 'recovery'].includes(tab)) return;
  all('[data-tab]').forEach(button => { button.classList.toggle('active', button.dataset.tab === tab); button.setAttribute('aria-selected', button.dataset.tab === tab); });
  for (const name of ['drivetrain', 'tires', 'telemetry', 'damage', 'recovery']) $(`panel-${name}`).hidden = name !== tab;
  if (tab === 'telemetry') drawChart();
  if (tab === 'recovery') renderWinchUI(true);
}

function releaseWinch() {
  winch?.detach(); world?.setWinchLoad?.(null);
  selectedWinchAnchor = ''; winchCandidates = []; lastAnchorRefresh = -Infinity; lastWinchMessage = '';
}

function openWinch() {
  showConsoleTab('recovery');
  $('vehicle-panel').classList.add('mobile-open');
  $('mobile-console-toggle').setAttribute('aria-expanded', 'true');
}

function toggleWinch() {
  const result = winch.setEquipped(!winch.equipped);
  if (result.ok) {
    vehicleWinches[spec.id] = winch.equipped;
    world.vehicle?.setWinchEnabled(winch.equipped);
    garagePreview?.setWinchEnabled(spec.id, winch.equipped);
    if (!winch.equipped) { world.setWinchLoad?.(null); selectedWinchAnchor = ''; }
    saveSettings();
  }
  input.clear(); notify(result.message, !result.ok); renderWinchUI(true);
}

function renderWinchUI(refresh = false) {
  if (!winch) return;
  const s = winch.state, panel = $('panel-recovery');
  if ((!panel.hidden || refresh) && !s.attached && (refresh || performance.now() - lastAnchorRefresh > 750)) {
    winchCandidates = s.equipped ? winch.candidates() : [];
    if (!winchCandidates.some(tree => tree.id === selectedWinchAnchor)) selectedWinchAnchor = winchCandidates.find(tree => tree.available)?.id || winchCandidates[0]?.id || '';
    const selection = $('winch-anchor');
    const html = winchCandidates.length ? winchCandidates.map((tree, index) => {
      const degrees = Math.round(Math.abs(tree.bearing) * RAD_TO_DEG);
      const bearing = degrees < 5 ? 'ahead' : `${degrees}° ${tree.bearing > 0 ? 'left' : 'right'}`;
      return `<option value="${esc(tree.id)}"${tree.available ? '' : ' disabled'}>Tree ${index + 1} · ${tree.distance.toFixed(1)} m · ${bearing}${tree.available ? '' : ' · blocked'}</option>`;
    }).join('') : `<option value="">${s.equipped ? 'No reachable tree ahead' : 'Fit a winch to select a tree'}</option>`;
    if (selection.innerHTML !== html) selection.innerHTML = html;
    selection.value = selectedWinchAnchor;
    lastAnchorRefresh = performance.now();
  }
  const stopped = physics.body.velocity.length() <= .35;
  $('winch-equip').classList.toggle('active', s.equipped);
  $('winch-equip').setAttribute('aria-pressed', s.equipped);
  $('winch-equip').disabled = !stopped;
  $('winch-equip').title = stopped ? 'Optional aftermarket recovery kit' : 'Stop before fitting or removing a winch';
  setText('winch-equip-label', s.equipped ? 'Recovery winch fitted' : 'Fit recovery winch');
  setText('winch-state', s.status);
  setText('winch-capacity', `${(s.availablePull / 1000).toFixed(1)} kN`);
  setText('winch-length', `${s.ropeLength.toFixed(1)} m`);
  setText('winch-tension', `${(s.tension / 1000).toFixed(1)} kN`);
  setText('winch-line-speed', `${Math.abs(s.lineSpeed * 60).toFixed(1)} m/min`);
  $('winch-load').value = Math.min(1, s.tension / Math.max(1, s.availablePull));
  $('winch-load').title = `${Math.round(s.tension / Math.max(1, s.availablePull) * 100)}% of estimated current-layer pull`;
  $('winch-anchor').disabled = !s.equipped || s.attached;
  $('winch-attach').disabled = !s.equipped || s.attached || !stopped || !winchCandidates.some(tree => tree.id === selectedWinchAnchor && tree.available);
  $('winch-detach').disabled = !s.attached;
  for (const [name, direction] of [['winch-in', 1], ['winch-out', -1]]) {
    const button = document.querySelector(`[data-touch="${name}"]`);
    button.disabled = !s.attached || paused || isModalOpen();
    button.setAttribute('aria-pressed', s.command * direction > 0);
  }
  setText('winch-help', s.attached ? 'Hold E to pull or Q to pay out. Releasing the remote stops the motor; the drum brake holds the line. Ease off the vehicle brakes to move.' :
    !s.equipped ? 'An optional front-mounted kit, saved for this vehicle. Fit it while stopped, then choose a tree ahead.' :
    !stopped ? 'Stop to attach the cable.' :
    !winchCandidates.some(tree => tree.available) ? 'Point the front bumper toward a standing tree within 24 m. Find a clear line around rocks and other trees. There are recovery trees near Rutted Hollow.' :
    'The selected tree is marked on the ground. Attach the cable to its trunk strap, then hold E to reel in.');
  $('winch-shortcut').classList.toggle('active', s.attached);
}

function setVehiclePaint(id, color) {
  if (!VEHICLE_BY_ID[id] || !/^#[0-9a-f]{6}$/i.test(color || '')) return;
  vehiclePaints[id] = color.toLowerCase();
  if (id === spec.id) world.vehicle?.setPaint?.(color);
  garagePreview?.setPaint(id, color);
  const card = document.querySelector(`[data-garage-card="${id}"]`);
  card?.querySelectorAll('[data-paint]').forEach(button => { const active = button.dataset.paint.toLowerCase() === color.toLowerCase(); button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  const picker = card?.querySelector('[data-paint-picker]'); if (picker) picker.value = color;
  saveSettings();
}

function setCamera(mode, inform = true) {
  options.camera = mode;
  all('[data-camera]').forEach(b => { b.classList.toggle('active', b.dataset.camera === mode); b.setAttribute('aria-pressed', b.dataset.camera === mode); });
  input?.clear();
  if (inform) notify(mode === 'free' ? 'Free camera · drag to look · I/J/K/L move · U/O altitude · C to return.' : `${mode[0].toUpperCase() + mode.slice(1)} camera · drag to look · scroll to zoom.`);
  saveSettings();
}

function cycleCamera() { const cameras = ['chase', 'hood', 'orbit', 'free']; setCamera(cameras[(cameras.indexOf(options.camera) + 1) % cameras.length]); }

function pause(value = !paused) {
  paused = value; input?.clear(); $('paused-overlay').hidden = !paused;
  $('pause-toggle').innerHTML = icon(paused ? 'play' : 'pause');
  $('pause-toggle').setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
  lastTime = performance.now(); renderUI();
}

function keyboardCommand(key) {
  switch (key) {
    case 'escape': pause(); break;
    case 'r': setControl('selector', 'R'); break;
    case 'f': setControl('selector', 'D'); break;
    case 'n': setControl('selector', 'N'); break;
    case 'p': setControl('selector', 'P'); break;
    case 'c': cycleCamera(); break;
    case 'x': recover(); break;
    case 'h': toggleLights(); break;
    case 'i': if (options.camera !== 'free') setControl('engineOn', !physics.state.engineOn); break;
    case '?': case '/': openDialog('guide'); break;
    case 'm': openDialog('map'); break;
    case 'g': openWinch(); break;
  }
}

function toggleLights() {
  options.headlights = !options.headlights;
  $('headlights-toggle').classList.toggle('active', options.headlights);
  $('headlights-toggle').setAttribute('aria-pressed', options.headlights);
  notify(`Headlights ${options.headlights ? 'on' : 'off'}.`);
}

function renderZones() {
  const html = terrain.zones.map((zone, i) => `<button class="zone-button${zone.id === currentZone ? ' active' : ''}" data-zone="${zone.id}" title="Travel to ${esc(zone.name)}"><span class="zone-icon"><svg viewBox="0 0 24 24">${zonePatterns[zone.id] || zonePatterns.trail}</svg></span><span><strong>${esc(zone.name)}</strong><small>${esc(zoneSubtitles[zone.id])}</small></span><span class="zone-index">0${i + 1}</span></button>`).join('');
  $('zone-list').innerHTML = html;
  $('map-zones').innerHTML = terrain.zones.map((zone, i) => `<div><button class="zone-button" data-zone="${zone.id}"><span class="zone-icon"><svg viewBox="0 0 24 24">${zonePatterns[zone.id] || zonePatterns.trail}</svg></span><span><strong>${esc(zone.name)}</strong><small>${esc(zoneSubtitles[zone.id])}</small></span></button><p class="map-zone-info">${esc(zone.description)}</p></div>`).join('');
}

function updateZones() {
  all('[data-zone]').forEach(button => { button.classList.toggle('active', button.dataset.zone === currentZone); button.setAttribute('aria-current', button.dataset.zone === currentZone ? 'location' : 'false'); });
  const zone = terrain.zones.find(z => z.id === currentZone);
  setText('location-name', zone?.name || 'The proving ground');
}

function renderVehicle() {
  const electric = spec.transmissionType === 'electric';
  setText('vehicle-year', `${spec.year} · ${spec.brand.toUpperCase()}`);
  setText('vehicle-title', spec.name.replace(/^Jeep |^Ford |^Honda |^Mercedes-Benz /, ''));
  setText('spec-power', spec.powerHP); setText('spec-torque', electric ? spec.wheelTorqueLbFt.toLocaleString() : spec.torqueLbFt);
  setText('spec-torque-unit', electric ? 'WHEEL LB-FT' : 'LB-FT');
  setText('live-torque-label', electric ? 'Motor torque · estimated' : 'Engine torque');
  setText('live-power-label', electric ? 'Motor power' : 'Engine power');
  setText('drive-unit-health-label', electric ? 'Electric drive units' : 'Engine');
  $('live-traction-reduction').parentElement.title = `Reduction from requested ${electric ? 'motor' : 'engine'} torque while traction control limits wheelspin.`;
  $('driveline-mechanical').style.display = electric ? 'none' : '';
  $('driveline-electric').style.display = electric ? '' : 'none';
  $('rear-axle').setAttribute('d', electric ? 'M57 96h25m56 0h25' : 'M57 96h106');
  for (const id of ['rear-diff', 'rear-lock-cross']) $(id).style.display = electric ? 'none' : '';
  $('driveline-svg').setAttribute('aria-label', electric ? 'One front motor with a mechanical locking differential; two independent rear motors with a virtual lock. No center transfer case or propshaft.' : 'Front and rear axle power and lock state');
  $('electric-controls').innerHTML = electricControlsHTML(spec); $('electric-controls').hidden = !electric;
  setText('spec-drive', spec.driveModes.includes('4L') ? '4×4' : spec.driveModes.includes('4A') ? 'AWD' : spec.defaultMode);
  setText('drive-mode-label', electric ? 'ELECTRIC DRIVE UNITS' : spec.driveModes.includes('4L') ? 'TRANSFER CASE' : spec.driveModes.length > 1 ? 'DRIVE SYSTEM' : 'DRIVEN AXLE');
  const programs = spec.factoryPrograms || [];
  $('drive-program-wrap').hidden = programs.length < 2;
  $('drive-program-wrap').innerHTML = programs.length < 2 ? '' : `<label class="program-label" for="drive-program">${spec.brand === 'Ford' ? 'G.O.A.T. MODE' : 'DRIVE PROGRAM'}</label><select id="drive-program">${programs.map(program => `<option value="${esc(program)}">${esc(program)}</option>`).join('')}</select><p class="program-note">${electric ? 'Torque, ride height &amp; traction response' : 'Estimated throttle, shift &amp; traction maps'}</p>`;
  $('drive-modes').innerHTML = spec.driveModes.map(mode => `<button data-drive-mode="${mode}" aria-pressed="${physics.state.driveMode === mode}" class="${physics.state.driveMode === mode ? 'active' : ''}" title="${{ '2H': 'Rear-wheel drive, high range', '4A': 'Automatic four-wheel drive, high range', '4H': 'Four-wheel drive, high range', '4L': 'Four-wheel drive, low range', FWD: 'Front-wheel drive', RWD: 'Rear-wheel drive', e4WD: 'Three motors, four-wheel drive, fixed reductions' }[mode]}">${mode}</button>`).join('');
  setText('range-help', electric ? 'One front motor and two rear motors. Fixed reductions; no low-range transfer case.' : spec.driveModes.includes('4L') ? 'Select N and stop before shifting into or out of 4L.' : spec.driveModes.includes('4A') ? '4A engages the rear driveline as front-tire demand increases. This conversion has no low range.' : 'This configuration has no transfer case or low-range gearbox.');
  setText('installed-build-label', spec.upgrade?.label || 'Factory build');
  $('feature-controls').innerHTML = featureDefinitions.filter(f => spec.features[f.feature]).map(f => `<button class="feature-row" data-control="${f.key}" aria-pressed="false" title="${esc(f.label)}"><span class="feature-name">${esc(f.label)}<span class="feature-sub" id="label-${f.key}">${f.off}</span></span><span class="toggle" aria-hidden="true"></span></button>`).join('') + `<div class="feature-row unavailable"><span class="feature-name">Anti-lock brakes</span><span class="stock-label" id="abs-system-status">FACTORY · ACTIVE</span></div>`;
  if (spec.features.trailControl) $('feature-controls').insertAdjacentHTML('beforeend', '<label class="trail-speed-row" for="trail-speed">Trail target <select id="trail-speed"><option value="3">3 km/h</option><option value="5">5 km/h</option><option value="7" selected>7 km/h</option><option value="10">10 km/h</option><option value="15">15 km/h</option></select></label>');
  setText('tire-size', `${spec.tireSize} · ${spec.tireType.replaceAll('-', ' ')}`);
  $('front-pressure').value = physics.state.frontPSI; $('rear-pressure').value = physics.state.rearPSI;
  $('link-pressure').checked = physics.state.frontPSI === physics.state.rearPSI;
  setText('redline-label', `${(spec.engine.redlineRPM / 1000).toFixed(1)}K`);
  $('wheel-telemetry').innerHTML = ['FL', 'FR', 'RL', 'RR'].map((label, i) => `<div class="wheel-stat"><span>${label}</span><div class="wheel-travel"><i id="wheel-bar-${i}"></i></div><strong id="wheel-load-${i}">0.0 kN</strong><span id="wheel-slip-${i}" class="slip-value">0% SLIP</span><span id="wheel-surface-${i}" class="wheel-material">HARDPACK</span></div>`).join('');
  $('damage-wheel-health').innerHTML = ['FL', 'FR', 'RL', 'RR'].map((label, i) => `<div class="damage-wheel-row"><span>${label}</span><strong id="damage-suspension-${i}">100%</strong><strong id="damage-tire-${i}">100%</strong></div>`).join('');
  renderUI();
}

function applyVehicle(id) {
  if (!VEHICLE_BY_ID[id]) return;
  releaseWinch();
  spec = configuredVehicle(id);
  const zone = terrain.zones.find(z => z.id === currentZone) || terrain.zones[0];
  physics.setVehicle(spec, zone.spawn); world.setVehicle(spec);
  world.vehicle?.setPaint?.(vehiclePaints[spec.id]);
  winch.setEquipped(vehicleWinches[spec.id]);
  world.vehicle?.setWinchEnabled(vehicleWinches[spec.id]);
  input.clear(); history.length = 0; path.length = 0; lastNotice = '';
  all('dialog[open]').forEach(d => d.close());
  dismissWelcome(); renderVehicle(); saveSettings();
  notify(physics.state.damage?.disabled ? `${spec.name} needs repair before it can drive.` : `${spec.name} ready · ${spec.powerHP} HP · ${spec.transmissionType === 'electric' ? `${spec.wheelTorqueLbFt.toLocaleString()} lb-ft at the wheels` : `${spec.torqueLbFt} lb-ft`}.`, !!physics.state.damage?.disabled);
}

function renderGarage() {
  $('garage-grid').innerHTML = configuredVehicles().map((vehicle, i) => {
    const isSelected = spec.id === vehicle.id, paint = vehiclePaints[vehicle.id];
    const damage = physics.getDamage?.(vehicle.id), condition = Math.round((damage?.condition ?? 1) * 100);
    const palette = [{ name: 'Original paint', color: vehicle.color }, ...PAINTS.filter(choice => choice.color !== vehicle.color)];
    const capabilities = [vehicle.transmissionType === 'electric' ? 'Three-motor e4WD · fixed reductions' : vehicle.driveModes.includes('4L') ? `${vehicle.lowRatio.toFixed(2)}:1 low range` : `${vehicle.driveModes.includes('4A') ? 'Automatic AWD' : vehicle.defaultMode} · open differentials`, vehicle.features.frontLocker ? 'Front & rear axle locks' : vehicle.features.rearLocker ? 'Rear axle lock' : '', vehicle.features.swayDisconnect ? 'Stabilizer disconnect' : '', vehicle.features.crabWalk ? 'CrabWalk · air suspension' : vehicle.transmissionType === 'cvt' ? 'Continuous CVT ratio' : ''].filter(Boolean);
    return `<article class="garage-card${isSelected ? ' selected' : ''}" data-garage-card="${vehicle.id}">
      <div class="garage-art garage-model-art"><span class="garage-id">VEHICLE 0${i + 1}</span>${isSelected ? '<span class="selected-label">ON THE TRAIL</span>' : ''}
        <canvas class="garage-model" data-garage-model="${vehicle.id}" width="640" height="400" role="img" tabindex="0" aria-label="${esc(vehicle.name)} model. Drag or use the arrow keys to rotate."></canvas>
        <span class="garage-model-status">Preparing model…</span>
        <div class="garage-view-tools"><span>DRAG TO ROTATE</span><button data-garage-rotate="${vehicle.id}" title="Rotate the vehicle view by 90 degrees" aria-label="Rotate ${esc(vehicle.name)} preview">${icon('reset')}</button></div>
      </div>
      <div class="garage-paint"><div class="paint-heading"><span class="eyebrow">MAKE IT YOURS</span><label class="custom-paint">Custom <input type="color" value="${paint}" data-paint-picker="${vehicle.id}" aria-label="Custom paint for ${esc(vehicle.name)}"></label></div>
        <div class="paint-swatches" aria-label="Paint colors for ${esc(vehicle.name)}">${palette.map(choice => `<button class="paint-swatch${choice.color.toLowerCase() === paint.toLowerCase() ? ' active' : ''}" style="--paint:${choice.color}" data-paint="${choice.color}" data-paint-vehicle="${vehicle.id}" title="${esc(choice.name)}" aria-label="${esc(choice.name)} paint for ${esc(vehicle.name)}" aria-pressed="${choice.color.toLowerCase() === paint.toLowerCase()}"></button>`).join('')}</div>
      </div>
      <div class="garage-card-content"><span class="eyebrow">${vehicle.year} · ${esc(vehicle.brand)}</span><h3>${esc(vehicle.name.replace(/^Jeep |^Ford |^Honda |^Mercedes-Benz /, ''))}</h3><p class="garage-trim">${esc(vehicle.trim)}</p>
        <div class="garage-numbers"><div><span>${vehicle.powerHP}</span><small>HORSEPOWER</small></div><div><span>${vehicle.transmissionType === 'electric' ? vehicle.wheelTorqueLbFt.toLocaleString() : vehicle.torqueLbFt}</span><small>${vehicle.transmissionType === 'electric' ? 'WHEEL TORQUE' : 'TORQUE'} · LB-FT</small></div><div><span>${Math.round(vehicle.mass).toLocaleString()}</span><small>CURB MASS · KG${vehicle.massStatus.includes('estimate') ? ' ≈' : ''}</small></div></div>
        <p class="garage-features">${capabilities.map(esc).join(' &nbsp; · &nbsp; ')}</p>
        <p class="garage-condition${damage?.disabled ? ' damaged' : ''}"><span>${damage?.disabled ? 'REPAIR REQUIRED' : `CONDITION ${condition}%`}</span><small>Pristine model preview · paint carries into your drive</small></p>
        <button class="garage-upgrade-button" data-workshop="${vehicle.id}"><span>${icon('settings')} Upgrades</span><small>${esc(vehicle.upgrade.label)} →</small></button>
        <div class="garage-card-bottom"><button class="primary-button" data-vehicle="${vehicle.id}">${damage?.disabled ? 'Select vehicle' : isSelected ? 'Drive this vehicle' : 'Take it for a drive'} ${icon('arrow')}</button><button class="spec-notes" data-spec-notes="${vehicle.id}">Specs &amp; notes</button></div>
      </div></article>`;
  }).join('');
}

function mountGarage() {
  try {
    if (garagePreview?.contextLost) { garagePreview.dispose(); garagePreview = null; }
    garagePreview ||= new GaragePreview();
    garagePreview.mount($('garage-grid'), configuredVehicles(), vehiclePaints, vehicleWinches);
  } catch (error) {
    all('.garage-model-status').forEach(element => { element.hidden = false; element.textContent = 'Model preview unavailable. Paint and vehicle selection remain available.'; });
    console.warn('Garage preview could not start', error);
  }
}

function renderGuide(vehicle = spec) {
  all('.guide-tabs [data-guide]').forEach(b => { b.classList.toggle('active', b.dataset.guide === guideTopic); b.setAttribute('aria-selected', b.dataset.guide === guideTopic); });
  $('guide-content').innerHTML = getGuideHTML(guideTopic, vehicle);
}

// The runtime is initialized after the document has had one opportunity to paint.
await new Promise(resolve => requestAnimationFrame(resolve));
try {
  world = new OffroadWorld($('world'), terrain);
  world.setVehicle(spec);
} catch (error) {
  $('loading').hidden = true; $('fatal-error').hidden = false;
  $('fatal-detail').textContent = String(error.stack || error);
  $('reload-button').onclick = () => location.reload();
  throw error;
}
input = new DrivingInput(keyboardCommand);
input.gamepadEnabled = options.gamepad;
winch = new WinchRecovery(physics, terrain, () => world.treeRecords);
winchView = new WinchView(world.scene, terrain);
winch.setEquipped(vehicleWinches[spec.id]);
world.vehicle?.setWinchEnabled(vehicleWinches[spec.id]);
physics.setExternalForceProvider(dt => winch.step(dt));
// Remaining functions and wiring are declared below; function declarations are hoisted.

function renderUI() {
  const s = physics.state, controls = (paused || isModalOpen() ? null : s.driverInput) || input?.last || { throttle: 0, brake: 0, steer: 0 };
  const unitMultiplier = options.units === 'mph' ? 2.236936 : 3.6;
  setText('speed-value', Math.round(Math.abs(s.speed) * unitMultiplier));
  setText('unit-toggle', options.units === 'mph' ? 'MPH' : 'KM/H');
  setText('rpm-value', Math.round(s.rpm / 10) * 10);
  $('rpm-fill').style.width = `${clamp(s.rpm / spec.engine.redlineRPM * 100, 0, 100)}%`;
  $('rpm-fill').style.backgroundColor = s.rpm > spec.engine.redlineRPM * .91 ? 'var(--orange)' : 'var(--accent)';
  setText('gear-range', s.driveMode);
  setText('gear-display', s.selector === 'D' ? (s.electricDrive ? 'D' : s.gear === 'CVT' ? 'CVT' : `D${s.gear}`) : s.selector);
  setText('range-ratio', s.driveMode === '4L' ? `LOW · ${spec.lowRatio.toFixed(2)}:1` : spec.driveModes.length > 1 ? 'HIGH · 1.00:1' : s.electricDrive ? 'SINGLE-SPEED · e4WD' : spec.transmissionType === 'cvt' ? `CVT · ${n(s.gearRatio).toFixed(2)}:1` : `${spec.gears.length}-SPEED AUTO`);
  if ($('drive-program')) $('drive-program').value = s.terrainProgram || 'Normal';
  if (s.electricDrive) {
    $('rear-steer').value = s.rearSteer; $('ride-height').value = s.rideHeight;
    setText('rear-steer-state', `${s.rearSteer.toUpperCase()} · REAR ${Math.abs(s.rearSteerAngle * RAD_TO_DEG).toFixed(1)}°`);
    setText('air-height-state', `${s.airSuspensionLift >= 0 ? '+' : ''}${Math.round(s.airSuspensionLift * 1000)} mm`);
    setText('regen-power', `${Math.round(s.regenerativePowerKW)} kW`);
    $('regen-paddle').classList.toggle('active', s.regenOnDemand); $('regen-paddle').setAttribute('aria-pressed', s.regenOnDemand);
    $('launch-status').hidden = !s.wattsToFreedom; setText('launch-status', launchStatusText(s.launchPhase));
  }
  setText('abs-system-status', s.abs ? 'FACTORY · ACTIVE' : s.frontLocked && spec.interlocks.frontLockerDisablesABS ? 'FRONT LOCK · ABS OFF' : 'INACTIVE');
  all('[data-drive-mode]').forEach(button => { const active = button.dataset.driveMode === s.driveMode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  all('[data-selector]').forEach(button => { const active = button.dataset.selector === s.selector; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  all('[data-control]').forEach(button => {
    const f = featureDefinitions.find(f => f.key === button.dataset.control), active = !!s[f.key];
    const requested = s.requestedControls?.[f.key] ?? active, pending = requested && !active;
    button.classList.toggle('active', requested); button.classList.toggle('pending', pending); button.setAttribute('aria-pressed', requested);
    setText(`label-${f.key}`, pending ? 'ARMED · RETURNS AT LOW SPEED' : active ? f.on : f.off);
  });
  const frontPowered = s.driveMode === 'FWD' || ['4H', '4L', '4A', 'e4WD'].includes(s.driveMode);
  const rearPowered = s.driveMode !== 'FWD';
  ['front-axle', 'front-shaft'].forEach(id => $(id).classList.toggle('powered', frontPowered));
  ['rear-axle', 'rear-shaft'].forEach(id => $(id).classList.toggle('powered', rearPowered));
  for (const axle of ['front', 'rear']) {
    $(`${axle}-diff`).classList.toggle('locked', !!s[`${axle}Locked`]);
    $(`${axle}-lock-cross`).classList.toggle('active', !!s[`${axle}Locked`]);
    setText(`${axle}-diff-label`, axle === 'rear' && s.electricDrive ? s.rearLocked ? 'VLOCK' : 'INDEP' : s[`${axle}Locked`] ? 'LOCK' : 'OPEN');
  }
  for (const id of ['rear-motor-left', 'rear-motor-right']) $(id).classList.toggle('locked', s.electricDrive && !!s.rearLocked);
  $('engine-toggle').classList.toggle('off', !s.engineOn);
  $('engine-toggle').children[1].textContent = s.electricDrive ? s.engineOn ? 'ELECTRIC DRIVE READY' : 'ELECTRIC DRIVE OFF' : s.engineOn ? 'ENGINE RUNNING' : 'ENGINE STOPPED';
  $('engine-toggle').setAttribute('aria-pressed', s.engineOn);
  $('engine-toggle').disabled = !!s.damage?.disabled;
  $('engine-toggle').title = s.damage?.disabled ? `Repair the disabled vehicle before restarting the ${s.electricDrive ? 'electric drive' : 'engine'}.` : `${s.electricDrive ? 'Electric drive' : 'Engine'} on / off · I`;
  const groundFeel = surfaceFeedback(s);
  setText('surface-name', groundFeel.label);
  $('surface-name').title = groundFeel.title;
  $('surface-dot').style.background = groundFeel.color;
  const torqueReduction = s.tractionIntervention?.active && n(s.requestedEngineTorque) > .1
    ? 1 - clamp(n(s.tractionIntervention.torqueScale, 1), 0, 1) : 0;
  const torqueLimited = torqueReduction > .03;
  setText('traction-state', s.parkingBrake?.active ? s.parkingBrake.mode === 'all-wheel-abs' ? 'EMERGENCY ABS' : 'REAR BRAKE HELD' : s.absActive ? 'ABS ACTIVE' : torqueLimited ? 'TORQUE LIMITED' : s.tractionActive ? 'TRACTION ASSIST' : s.groundedWheels < 4 ? `${s.groundedWheels}/4 IN CONTACT` : s.highCentered ? 'UNDERBODY CONTACT' : '4/4 IN CONTACT');
  $('traction-state').title = torqueLimited ? `Traction control reduces requested ${s.electricDrive ? 'motor' : 'engine'} torque by ${Math.round(torqueReduction * 100)}% to limit wheelspin.` : s.tractionActive ? 'Traction control is adjusting drive torque or braking a spinning driven wheel.' : 'Current tire contact and driving assistance';
  setText('parking-brake-state', s.parkingBrake?.active ? s.parkingBrake.mode === 'all-wheel-abs' ? 'E-BRAKE · ABS' : 'REAR BRAKE' : 'SPACE · E-BRAKE');
  $('parking-brake-state').classList.toggle('engaged', !!s.parkingBrake?.active);
  $('parking-brake-state').title = s.parkingBrake?.label || 'Hold Space for the parking / emergency brake';
  document.querySelector('[data-touch="handbrake"]').setAttribute('aria-pressed', !!s.parkingBrake?.active);
  $('front-pressure-value').innerHTML = `${Math.round(s.frontPSI)} <small>PSI</small>`;
  $('rear-pressure-value').innerHTML = `${Math.round(s.rearPSI)} <small>PSI</small>`;
  for (const axle of ['front', 'rear']) {
    const slider = $(`${axle}-pressure`), value = s[`${axle}PSI`];
    slider.disabled = !!spec.tracks;
    slider.title = spec.tracks ? 'Track ground pressure follows supported load and belt area.' : '';
    if (document.activeElement !== slider) slider.value = value;
    const pct = (value - 8) / 72 * 100;
    slider.style.background = `linear-gradient(to right,var(--accent) ${pct}%,#5f6f534d ${pct}%)`;
  }
  const area = n(s.wheels[0]?.contactArea) * 10000;
  $('patch-area').innerHTML = `${s.wheels[0]?.contact ? Math.round(area) : 0} <small>cm²</small>`;
  const patchWheel = s.wheels[0];
  $('contact-patch').style.height = `${patchWheel?.contact ? clamp(n(patchWheel.contactLength) * 110, 9, 59) : 0}px`;
  $('contact-patch').style.width = `${clamp(n(patchWheel?.contactWidth) / spec.tireWidth * 29, 15, 35)}px`;
  $('contact-patch').style.opacity = patchWheel?.contact ? '1' : '0';
  setText('pressure-effect', spec.tracks ? `Tracks: ${((s.wheels[0]?.load || 0) / Math.max(.01, s.wheels[0]?.contactArea || 0) / 1000).toFixed(1)} kPa on the supported belt area` : s.frontPSI < (spec.stockPSIFront || spec.stockPSI) * .75 ? 'Larger footprint · softer response' : s.frontPSI > (spec.stockPSIFront || spec.stockPSI) * 1.10 ? 'Smaller footprint · firmer response' : 'Estimated from loaded tire geometry');
  const lowPressure = Math.min(s.frontPSI, s.rearPSI) < 15;
  const highwayLow = Math.abs(s.speed) > 13.4 && Math.min(s.frontPSI / spec.stockPSIFront, s.rearPSI / spec.stockPSIRear) < .65;
  const tireDamaged = s.damage?.tires?.some(value => value > .18);
  $('tire-warning').hidden = !(lowPressure || highwayLow || tireDamaged);
  setText('tire-warning', tireDamaged ? 'A damaged tire holds less pressure than the selected setup. Check Condition for each tire’s effective pressure and repair the vehicle.' : highwayLow ? 'Low pressure at road speed: increased tire flex, reduced cornering stiffness and more rolling loss.' : 'Very low pressure increases footprint and sidewall flex. Severe impacts can damage the tire.');
  const groundContacts = currentGroundContacts();
  const maxSink = Math.max(0, ...groundContacts.map(contact => contact.sink));
  const maxTireFlex = Math.max(0, ...groundContacts.map(contact => contact.tireFlex));
  setText('ground-rut', (maxSink * 1000).toFixed(1));
  setText('tire-flex', (maxTireFlex * 1000).toFixed(1));
  setText('ground-response', groundFeel.description);
  s.wheels.forEach((wheel, i) => {
    $(`wheel-bar-${i}`).style.height = `${clamp(n(wheel.compressionRatio), 0, 1) * 100}%`;
    $(`wheel-bar-${i}`).style.background = wheel.contact ? '' : '#ad865a28';
    setText(`wheel-load-${i}`, `${(Math.max(0, wheel.load) / 1000).toFixed(1)} kN`);
    setText(`wheel-slip-${i}`, wheel.contact ? `${Math.round(Math.abs(wheel.slip) * 100)}% SLIP` : 'AIR');
    $(`wheel-slip-${i}`).classList.toggle('airborne', !wheel.contact);
    setText(`wheel-surface-${i}`, wheelSurfaceLabel(wheel));
    $(`wheel-surface-${i}`).title = wheel.contact ? `Tire grip used: ${Math.round(clamp(n(wheel.frictionUtilization), 0, 1) * 100)}%` : 'No ground support';
  });
  const liveValue = (id, value, unit) => { $(id).innerHTML = `${value} <small>${unit}</small>`; };
  liveValue('live-torque', Math.round(n(s.engineTorque)), 'Nm');
  liveValue('live-power', Math.round(Math.max(0, n(s.powerKW)) * 1.341022), 'HP');
  liveValue('live-sink', (maxSink * 1000).toFixed(1), 'mm');
  liveValue('live-water', n(s.waterDepth).toFixed(2), 'm');
  liveValue('live-distance', Math.round(n(s.odometer)).toLocaleString(), 'm');
  liveValue('live-contact', n(s.groundedWheels), '/ 4');
  liveValue('live-grip-used', Math.round(groundFeel.gripUse * 100), '%');
  liveValue('live-traction-reduction', Math.round(torqueReduction * 100), '%');
  const pitch = n(s.pitch) * RAD_TO_DEG, roll = n(s.roll) * RAD_TO_DEG;
  setText('pitch-value', `${Math.round(pitch)}°`); setText('roll-value', `${Math.round(roll)}°`);
  $('attitude-horizon').style.transform = `translateY(${clamp(pitch * .7, -20, 20)}px) rotate(${-roll}deg)`;
  $('throttle-meter').style.width = `${n(controls.throttle) * 100}%`;
  $('brake-meter').style.width = `${Math.max(n(controls.brake), controls.handbrake ? 1 : 0) * 100}%`;
  const heading = ((-s.heading * RAD_TO_DEG % 360) + 360) % 360;
  const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(heading / 45) % 8];
  setText('heading-value', `${Math.round(heading).toString().padStart(3, '0')}° ${cardinal}`);
  setText('position-value', `${Math.round(-s.position.x)} E · ${Math.round(s.position.z)} N`);
  setText('fps-value', `${Math.round(fps)} FPS`);
  setText('sim-status', paused || isModalOpen() ? 'PAUSED' : options.camera === 'free' ? 'FREE CAM' : 'LIVE');
  let alert = '';
  const driveOffHint = `${s.electricDrive ? 'Electric drive' : 'Engine'} off · press I to start`;
  const directionHint = s.damage?.disabled ? 'Vehicle disabled · repair or restart to continue' : ['N', 'P'].includes(s.selector) ? `${s.selector === 'P' ? 'Park' : 'Neutral'} selected · press F for Drive` : !s.engineOn ? driveOffHint : s.directionChangePending ? `Stopping · hold ${s.directionChangePending === 'R' ? 'brake' : 'accelerator'} for ${s.directionChangePending === 'R' ? 'Reverse' : 'Drive'}` : s.selector === 'R' && !s.manualReverse ? 'Reverse · hold brake to back up; accelerator returns to Drive' : s.manualReverse ? 'Manual Reverse · accelerator backs up; F selects Drive' : 'Hold brake after stopping to reverse';
  $('selector-buttons').title = directionHint;
  $('gear-display').title = directionHint;
  all('[data-selector]').forEach(button => { button.title = button.dataset.selector === s.selector ? directionHint : ({ P: 'Park · P', R: 'Manual Reverse · R', N: 'Neutral · N', D: 'Drive · F' }[button.dataset.selector]); });
  const touchBrake = document.querySelector('[data-touch="brake"]');
  const automaticPedals = ['D', 'R'].includes(s.selector) && !s.manualReverse && s.engineOn && !s.damage?.disabled;
  touchBrake.textContent = !automaticPedals ? 'BRAKE' : s.selector === 'R' ? 'REVERSE' : 'BRAKE / REV';
  touchBrake.setAttribute('aria-label', !automaticPedals ? 'Service brake' : s.selector === 'R' ? 'Hold to reverse; release to coast' : 'Brake; keep holding after stopping to reverse');
  if (s.damage?.disabled) alert = 'Critical damage · repair or restart to drive again';
  else if (Math.abs(roll) > 65 || Math.abs(pitch) > 65) alert = 'Vehicle overturned · press X to recover';
  else if (s.directionChangePending) alert = directionHint;
  else if (s.highCentered) alert = 'Underbody contact · G opens winch recovery · X puts vehicle upright';
  else if (s.stuck) alert = winch.equipped ? 'Losing traction · G opens winch recovery' : spec.driveModes.includes('4L') ? `Losing traction · try low range${spec.features.rearLocker ? ', axle locks' : ''} or a winch with G` : spec.features.rearLocker ? 'Losing traction · try axle locks or a winch with G' : 'Losing traction · ease the throttle or open winch recovery with G';
  else if (s.terrain === 'asphalt' && ['4H', '4L'].includes(s.driveMode) && Math.abs(controls.steer) > .2) alert = 'Part-time 4WD on firm pavement · driveline bind increases tire scrub';
  else if (!s.engineOn && controls.throttle > 0) alert = driveOffHint;
  else if (['N', 'P'].includes(s.selector) && controls.throttle > 0) alert = `${s.selector === 'N' ? 'Neutral' : 'Park'} selected · press F for Drive`;
  $('driving-alert').hidden = !alert || isModalOpen() || !$('welcome-card').hidden;
  setText('driving-alert', alert);
  renderGroundStatus();
  renderDamageUI(s);
  renderWinchUI();
}

function currentGroundContacts() {
  return physics.state.wheels.filter(wheel => wheel.contact && wheel.ground).map(wheel => {
    const sample = terrain.sample(wheel.ground.x, wheel.ground.z);
    return { wheel: wheel.index, surface: wheel.surface || sample.surface, surfaceDetail: wheel.surfaceDetail || sample.surfaceDetail, sink: n(sample.sink), compaction: n(sample.compaction), tread: n(sample.tread), detail: !!sample.detail, tireFlex: n(wheel.deflection) };
  });
}

function renderGroundStatus() {
  const issues = world.renderingIssues || [];
  const textureFailure = !!world.textureFailures?.length;
  const notice = $('rendering-notice');
  notice.hidden = !issues.length && !textureFailure;
  if (notice.hidden) return;
  setText('rendering-notice-text', world.terrainFallbackActive ? 'Some surface effects could not load. Simplified terrain is active; reload to retry.' : issues.some(issue => issue.kind === 'shader') ? 'Some 3D effects could not load. Reload to retry.' : 'Some textures could not load. Reload to retry.');
}

function renderDamageUI(state) {
  const damage = state.damage || {}, condition = clamp(n(damage.condition, 1), 0, 1), disabled = !!damage.disabled;
  const color = disabled || condition < .4 ? 'var(--red)' : condition < .75 ? 'var(--orange)' : 'var(--accent)';
  const percent = Math.round(condition * 100), health = loss => Math.round((1 - clamp(n(loss), 0, 1)) * 100);
  setText('condition-chip-value', disabled ? 'DISABLED' : `${percent}%`);
  $('condition-chip-value').style.color = color; $('condition-chip-light').style.background = color;
  $('damage-condition').innerHTML = `${percent}<small>%</small>`; $('damage-condition').style.color = color;
  $('damage-condition-bar').value = percent; $('damage-condition-bar').style.setProperty('--condition-color', color);
  setText('damage-status', disabled ? 'REPAIR REQUIRED' : condition < .99 ? 'DAMAGE RECORDED' : 'READY TO DRIVE');
  setText('damage-body', `${health(damage.body)}%`); setText('damage-engine', `${health(damage.engine)}%`);
  for (let i = 0; i < 4; i++) for (const [name, losses] of [['suspension', damage.suspension], ['tire', damage.tires]]) {
    const loss = n(losses?.[i]), element = $(`damage-${name}-${i}`);
    if (name === 'tire') element.innerHTML = `${health(loss)}%<small>${Math.round(n(state.wheels[i]?.pressure))} PSI</small>`;
    else setText(`damage-${name}-${i}`, `${health(loss)}%`);
    element.style.color = loss > .6 ? 'var(--red)' : loss > .15 ? 'var(--orange)' : 'var(--accent)';
  }
  setText('damage-summary', disabled ? 'Critical mechanical damage. Repair this vehicle before it can drive again.' : condition < .99 ? 'Damage is retained through recovery and vehicle changes. Inspect the component condition below.' : 'Vehicle ready. Impacts can damage bodywork, engine, suspension and tires.');
  const velocity = state.velocity || {}, angular = state.angularVelocity || {};
  const moving = Math.hypot(n(velocity.x), n(velocity.y), n(velocity.z)) >= .5 || Math.hypot(n(angular.x), n(angular.y), n(angular.z)) > .35;
  all('[data-repair]').forEach(button => { button.disabled = moving; button.title = moving ? 'Stop the vehicle before repairing.' : 'Repair the current vehicle and restore its components.'; });
  setText('repair-help', moving ? 'Bring the vehicle to a stop before repairing.' : 'Repair restores bodywork, engine, suspension and tires. Your selected setup and paint are preserved.');
  $('damage-overlay').hidden = !disabled || paused || isModalOpen();
  setText('disabled-help', moving ? 'Brake to a stop, then repair. You can also restart the run.' : 'Repair to get moving again, or restart the run with restored terrain and scenery.');
}

const mapTexture = document.createElement('canvas');
mapTexture.width = mapTexture.height = 256;
const mapCtx = mapTexture.getContext('2d');
const mapData = mapCtx.createImageData(256, 256);
for (let iy = 0; iy < 256; iy++) for (let ix = 0; ix < 256; ix++) {
  const x = terrain.halfSize - ix / 255 * terrain.size, z = terrain.halfSize - iy / 255 * terrain.size;
  const c = terrain.colorAt(x, z), h = terrain.heightAt(x, z), shade = 1 + Math.min(32, h) / 100;
  const offset = (iy * 256 + ix) * 4;
  mapData.data[offset] = clamp(c.r * 260 * shade, 0, 255);
  mapData.data[offset + 1] = clamp(c.g * 260 * shade, 0, 255);
  mapData.data[offset + 2] = clamp(c.b * 260 * shade, 0, 255);
  mapData.data[offset + 3] = 255;
}
mapCtx.putImageData(mapData, 0, 0);
const path = [];

function drawMap(canvas, full = false) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const margin = full ? 40 : 14, size = Math.min(w - margin * 2, h - margin * 2), ox = (w - size) / 2, oy = (h - size) / 2;
  const coord = (x, z) => [ox + (terrain.halfSize - x) / terrain.size * size, oy + (terrain.halfSize - z) / terrain.size * size];
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1c2920'; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = .72; ctx.drawImage(mapTexture, ox, oy, size, size); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#d1e2a91a'; ctx.lineWidth = full ? 1 : .6;
  for (let i = 0; i <= 8; i++) {
    const g = size * i / 8; ctx.beginPath(); ctx.moveTo(ox + g, oy); ctx.lineTo(ox + g, oy + size); ctx.moveTo(ox, oy + g); ctx.lineTo(ox + size, oy + g); ctx.stroke();
  }
  ctx.strokeStyle = '#b6c996'; ctx.lineWidth = full ? 2 : 1; ctx.globalAlpha = .45;
  ctx.beginPath();
  for (let z = -240; z <= 252; z += 4) { const [px, py] = coord(terrain.trailX(z), z); if (z === -240) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke();
  ctx.globalAlpha = .9;
  ctx.strokeStyle = '#e0ad60';
  for (const feature of terrain.course.features) {
    ctx.lineWidth = Math.max(full ? 1.2 : .8, feature.width / terrain.size * size);
    ctx.beginPath();
    feature.profiles.forEach((frame, i) => { const [x, y] = coord(frame.point.x, frame.point.z); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  }
  if (path.length > 1) {
    ctx.strokeStyle = '#e6d89a'; ctx.lineWidth = full ? 2 : 1.2; ctx.beginPath();
    path.forEach((p, i) => { const [x, y] = coord(p.x, p.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  terrain.zones.forEach((zone, i) => {
    const [x, y] = coord(zone.spawn.x, zone.spawn.z);
    ctx.fillStyle = zone.id === currentZone ? '#d1e598' : '#9bad87';
    ctx.beginPath(); ctx.arc(x, y, full ? 5 : 2.5, 0, Math.PI * 2); ctx.fill();
    if (full) {
      ctx.font = '15px Arial'; ctx.textAlign = 'left';
      const alignment = zone.id === 'wetland' || zone.id === 'asphalt' ? -1 : 1;
      ctx.textAlign = alignment < 0 ? 'right' : 'left';
      ctx.fillStyle = '#e2ebd3'; ctx.fillText(zone.name, x + alignment * 11, y - 9);
    }
  });
  const state = physics.state;
  const [px, py] = coord(state.position.x, state.position.z);
  ctx.save(); ctx.translate(clamp(px, ox, ox + size), clamp(py, oy, oy + size)); ctx.rotate(-state.heading);
  const arrowSize = full ? 12 : 7;
  ctx.shadowColor = '#0a1a05'; ctx.shadowBlur = full ? 9 : 4;
  ctx.fillStyle = '#edf4c6'; ctx.strokeStyle = '#314126'; ctx.lineWidth = full ? 2 : 1;
  ctx.beginPath(); ctx.moveTo(0, -arrowSize); ctx.lineTo(arrowSize * .64, arrowSize * .67); ctx.lineTo(0, arrowSize * .30); ctx.lineTo(-arrowSize * .64, arrowSize * .67); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.font = `${full ? 13 : 10}px ui-monospace,monospace`; ctx.fillStyle = '#bbd394'; ctx.textAlign = 'center'; ctx.fillText('N', ox + size / 2, oy - (full ? 13 : 3));
  ctx.textAlign = 'left'; ctx.fillStyle = '#98ad83'; ctx.font = `${full ? 11 : 8}px ui-monospace,monospace`;
  const barLength = size / 4;
  ctx.fillRect(ox, oy + size + (full ? 12 : 5), barLength, 1);
  ctx.fillText('200 m', ox + barLength + 7, oy + size + (full ? 16 : 8));
}

function drawChart() {
  const canvas = $('telemetry-chart'), ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, unit = options.units === 'mph' ? 2.236936 : 3.6;
  ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#b4c89421'; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(0, i * h / 4); ctx.lineTo(w, i * h / 4); ctx.stroke(); }
  const max = Math.max(options.units === 'mph' ? 30 : 50, ...history.map(d => Math.ceil(d.speed * unit / 10) * 10));
  setText('chart-scale', `0–${max} ${options.units === 'mph' ? 'MPH' : 'KM/H'}`);
  if (!history.length) return;
  const last = history.at(-1).time, start = last - 30;
  const points = history.map(p => [clamp((p.time - start) / 30, 0, 1) * w, h - 7 - p.speed * unit / max * (h - 14)]);
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
  ctx.strokeStyle = '#cce398'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.lineTo(points.at(-1)[0], h); ctx.lineTo(points[0][0], h); ctx.closePath();
  const fill = ctx.createLinearGradient(0, 0, 0, h); fill.addColorStop(0, '#c1db8a35'); fill.addColorStop(1, '#c1db8a03'); ctx.fillStyle = fill; ctx.fill();
}

function setPressures(front, rear, announce = false) {
  const result = physics.setPressure(Number(front), Number(rear));
  if (!result.ok || announce) notify(result.message, !result.ok);
  $('front-pressure').value = physics.state.frontPSI; $('rear-pressure').value = physics.state.rearPSI;
  renderUI();
}

function wireUI() {
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.dialog) return openDialog(b.dataset.dialog);
    if (b.hasAttribute('data-workshop')) return openWorkshop(b.dataset.workshop || spec.id);
    if (b.hasAttribute('data-close')) return b.closest('dialog')?.close();
    if (b.dataset.zone) return selectZone(b.dataset.zone);
    if (b.dataset.vehicle) return applyVehicle(b.dataset.vehicle);
    if (b.dataset.paint) return setVehiclePaint(b.dataset.paintVehicle, b.dataset.paint);
    if (b.dataset.garageRotate) return garagePreview?.rotate(b.dataset.garageRotate);
    if (b.hasAttribute('data-repair')) return repairVehicle();
    if (b.hasAttribute('data-restart')) return restartRun();
    if (b.hasAttribute('data-open-condition')) { showConsoleTab('damage'); $('vehicle-panel').classList.add('mobile-open'); $('mobile-console-toggle').setAttribute('aria-expanded', 'true'); return; }
    if (b.dataset.specNotes) { guideTopic = 'sources'; openDialog('guide'); renderGuide(configuredVehicle(b.dataset.specNotes)); return; }
    if (b.id === 'workshop-install') return installBuild();
    if (b.id === 'workshop-stock') { workshopDraft = { ...DEFAULT_BUILD }; renderWorkshop(); mountWorkshop(); return; }
    if (b.dataset.driveMode) return setControl('driveMode', b.dataset.driveMode);
    if (b.dataset.control) return setControl(b.dataset.control, !(physics.state.requestedControls?.[b.dataset.control] ?? physics.state[b.dataset.control]));
    if (b.dataset.selector) return setControl('selector', b.dataset.selector);
    if (b.dataset.camera) return setCamera(b.dataset.camera);
    if (b.dataset.guide) { guideTopic = b.dataset.guide; if ($('guide-dialog').open) renderGuide(); else openDialog('guide'); return; }
    if (b.dataset.tab) showConsoleTab(b.dataset.tab);
    if (b.dataset.pressure) {
      const rate = b.dataset.pressure === 'road' ? 1 : b.dataset.pressure === 'trail' ? .70 : .49;
      const floor = spec.bodyStyle === 'sedan' ? 20 : spec.bodyStyle === 'van' ? 24 : 12;
      const front = Math.max(floor, Math.round(spec.stockPSIFront * rate)), rear = Math.max(floor, Math.round(spec.stockPSIRear * rate));
      $('link-pressure').checked = front === rear;
      setPressures(front, rear, true);
    }
  });
  all('dialog').forEach(dialog => {
    dialog.addEventListener('close', () => { input.clear(); lastTime = performance.now(); renderUI(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) { const rect = dialog.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close(); } });
  });
  $('drive-nav').addEventListener('click', () => { all('dialog[open]').forEach(d => d.close()); if (paused) pause(false); $('world').focus(); });
  $('terrain-collapse').addEventListener('click', () => {
    const hidden = !$('terrain-panel-body').hidden; $('terrain-panel-body').hidden = hidden;
    $('terrain-panel').classList.toggle('collapsed', hidden); $('terrain-collapse').setAttribute('aria-expanded', !hidden);
  });
  $('mobile-console-toggle').addEventListener('click', () => { const active = $('vehicle-panel').classList.toggle('mobile-open'); $('mobile-console-toggle').setAttribute('aria-expanded', active); });
  $('begin-drive').addEventListener('click', () => { dismissWelcome(); $('world').focus(); });
  $('welcome-dismiss').addEventListener('click', dismissWelcome);
  $('recover-vehicle').addEventListener('click', recover);
  $('pause-toggle').addEventListener('click', () => pause());
  $('resume-button').addEventListener('click', () => { pause(false); $('world').focus(); });
  $('engine-toggle').addEventListener('click', () => setControl('engineOn', !physics.state.engineOn));
  document.addEventListener('pointerdown', event => {
    const paddle = event.target.closest('#regen-paddle');
    if (!paddle || input.blocked() || !spec.features.regenOnDemand) return;
    event.preventDefault(); paddle.setPointerCapture(event.pointerId); regenHold.setPointer(event.pointerId, true);
  });
  const releaseRegenPointer = event => regenHold.setPointer(event.pointerId, false);
  document.addEventListener('pointerup', releaseRegenPointer);
  document.addEventListener('pointercancel', releaseRegenPointer);
  document.addEventListener('lostpointercapture', releaseRegenPointer);
  window.addEventListener('blur', () => regenHold.clear());
  window.addEventListener('keydown', event => {
    if (event.code === 'KeyB' && !event.repeat && !event.ctrlKey && !event.metaKey && !input.blocked() && spec.features.regenOnDemand) { event.preventDefault(); regenHold.setKeyboard(true); }
  });
  window.addEventListener('keyup', event => { if (event.code === 'KeyB') regenHold.setKeyboard(false); });

  $('headlights-toggle').addEventListener('click', toggleLights);
  $('winch-shortcut').addEventListener('click', openWinch);
  $('winch-equip').addEventListener('click', toggleWinch);
  $('winch-anchor').addEventListener('change', e => { selectedWinchAnchor = e.target.value; e.target.blur(); renderWinchUI(); });
  $('winch-attach').addEventListener('click', () => {
    input.clear(); const result = winch.attach(selectedWinchAnchor);
    lastWinchMessage = ''; notify(result.message, !result.ok); renderWinchUI();
  });
  $('winch-detach').addEventListener('click', () => { input.clear(); releaseWinch(); notify('Winch cable detached.'); renderWinchUI(true); });
  for (const axle of ['front', 'rear']) {
    $(`${axle}-pressure`).addEventListener('input', e => {
      const pressure = Number(e.target.value), linked = $('link-pressure').checked;
      setPressures(axle === 'front' || linked ? pressure : physics.state.frontPSI, axle === 'rear' || linked ? pressure : physics.state.rearPSI);
    });
  }
  $('link-pressure').addEventListener('change', e => { if (e.target.checked) setPressures(physics.state.frontPSI, physics.state.frontPSI); e.target.blur(); });
  document.addEventListener('input', e => { if (e.target.dataset.paintPicker) setVehiclePaint(e.target.dataset.paintPicker, e.target.value); });
  document.addEventListener('change', e => {
    if (e.target.id === 'workshop-vehicle') { openWorkshop(e.target.value); return; }
    if (e.target.dataset.upgrade) {
      const key = e.target.dataset.upgrade, base = VEHICLE_BY_ID[workshopVehicleId];
      workshopDraft = normalizeBuild(base, { ...workshopDraft, [key]: e.target.value });
      renderWorkshop(); mountWorkshop(); $(`upgrade-${key}`)?.focus({ preventScroll: true }); return;
    }
    if (e.target.id === 'trail-speed') { setControl('trailSpeedKmh', Number(e.target.value)); e.target.blur(); }
    if (e.target.id === 'rear-steer') { setControl('rearSteer', e.target.value); e.target.blur(); }
    if (e.target.id === 'ride-height') { setControl('rideHeight', e.target.value); e.target.blur(); }
    if (e.target.id === 'drive-program') { setControl('terrainProgram', e.target.value); e.target.blur(); }
  });
  $('weather-select').value = options.weather;
  $('weather-select').addEventListener('change', e => { options.weather = e.target.value; terrain.setWeather(options.weather); $('weather-icon').innerHTML = `<use href="#i-${options.weather === 'rain' ? 'rain' : 'sun'}"/>`; notify(options.weather === 'rain' ? 'Rain enabled. Surface grip, water depth and soil response have changed.' : 'Dry weather restored. Existing tire ruts remain.'); saveSettings(); e.target.blur(); });
  $('weather-icon').innerHTML = `<use href="#i-${options.weather === 'rain' ? 'rain' : 'sun'}"/>`;
  $('quality-select').value = options.quality;
  $('quality-select').addEventListener('change', e => { options.quality = e.target.value; saveSettings(); });
  $('time-select').value = options.timeOfDay;
  $('time-select').addEventListener('change', e => { options.timeOfDay = e.target.value; saveSettings(); });
  $('units-select').value = options.units;
  $('units-select').addEventListener('change', e => { options.units = e.target.value; renderUI(); drawChart(); saveSettings(); });
  $('unit-toggle').addEventListener('click', () => { options.units = options.units === 'mph' ? 'kmh' : 'mph'; $('units-select').value = options.units; renderUI(); drawChart(); saveSettings(); });
  $('gamepad-select').value = options.gamepad ? 'on' : 'off';
  $('gamepad-select').addEventListener('change', e => { options.gamepad = e.target.value === 'on'; input.gamepadEnabled = options.gamepad; input.clear(); saveSettings(); });
  $('reset-terrain').addEventListener('click', () => {
    const { position, heading } = physics.state;
    releaseWinch();
    terrain.resetDeformation(); path.length = 0; input.clear();
    physics.reset({ x: position.x, z: position.z, heading });
    notify('Terrain restored. Tire ruts are cleared; vehicle position, damage and setup are preserved.');
  });
  $('sound-toggle').addEventListener('click', async () => {
    try {
      if (audio.enabled) audio.disable();
      else if (!await audio.enable()) return notify('Web Audio is unavailable in this browser.', true);
      $('sound-toggle').innerHTML = icon(audio.enabled ? 'volume' : 'mute');
      $('sound-toggle').setAttribute('aria-label', audio.enabled ? 'Mute vehicle sound' : 'Enable vehicle sound');
      $('sound-toggle').setAttribute('aria-pressed', audio.enabled);
    } catch (e) { notify('Sound could not start. Try the sound button again.', true); console.warn(e); }
  });
  $('fullscreen-toggle').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else notify('Fullscreen is unavailable in this browser. Use landscape orientation for more room.', true);
    } catch { notify('Your browser blocked fullscreen. Its own fullscreen command will also work.', true); }
  });
  $('reload-button').addEventListener('click', () => location.reload());
  $('reload-terrain-button').addEventListener('click', () => location.reload());
  $('minimap').addEventListener('click', () => openDialog('map'));
  $('minimap').style.cursor = 'pointer';
  window.addEventListener('resize', () => world.resize());
  window.addEventListener('gamepadconnected', () => notify('Gamepad connected · left stick steering · triggers for throttle and brake.'));
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); if (document.hidden) { input.clear(); regenHold.clear(); audio.update(physics.state, input.last, spec, true); } });
  // Keep a focused pressure slider from capturing driving keys after pointer release.
  all('input[type=range]').forEach(slider => slider.addEventListener('change', () => slider.blur()));
}

function frame(now) {
  if (frameFailed) return;
  const dt = clamp((now - lastTime) / 1000, 0, .10); lastTime = now;
  const modal = isModalOpen(), suspended = paused || modal || document.hidden;
  if (suspended || options.camera === 'free' || !spec.features.regenOnDemand || regenVehicleId !== spec.id) regenHold.clear();
  regenVehicleId = spec.id;
  const controls = input.read(!suspended && options.camera !== 'free');
  try {
    winch.setCommand(suspended ? 0 : controls.winch);
    if (!suspended) {
      physics.step(dt, controls);
      tick += dt;
      if (Math.max(controls.throttle, controls.brake) > .03 && !$('welcome-card').hidden) dismissWelcome();
    }
    const state = physics.state;
    const effectiveControls = state.driverInput || controls;
    if (!suspended && tick - lastHistory > .20) {
      history.push({ time: tick, speed: Math.abs(state.speed) });
      while (history.length && history[0].time < tick - 30) history.shift();
      lastHistory = tick;
      const previous = path.at(-1);
      if (!previous || Math.hypot(previous.x - state.position.x, previous.z - state.position.z) > 1.4) { path.push({ x: state.position.x, z: state.position.z }); if (path.length > 2400) path.shift(); }
    }
    if (state.notice && state.notice !== lastNotice) { notify(state.notice); lastNotice = state.notice; }
    if (terrain.detailBudgetFull && !trackLimitNotified) {
      notify('Track storage is full. Existing ruts are retained; use Settings → Restore undisturbed terrain to record tracks in new areas.', true);
      trackLimitNotified = true;
    } else if (!terrain.detailBudgetFull) trackLimitNotified = false;
    const detectedZone = challengeReservedAt(state.position.x, state.position.z) ? 'challenge' : state.terrain === 'dirt' ? 'trail' : state.terrain;
    if (detectedZone !== currentZone && terrain.zones.some(zone => zone.id === detectedZone)) { currentZone = detectedZone; updateZones(); }
    const winchState = winch.state;
    if (winchState.message && winchState.message !== lastWinchMessage) { notify(winchState.message, true); lastWinchMessage = winchState.message; }
    world.setWinchLoad?.(winchState.anchorId, winchState.anchorForce);
    winchView.update(winchState, !$('panel-recovery').hidden ? winchCandidates.find(tree => tree.id === selectedWinchAnchor) : null);
    const lampBrake = Math.max(effectiveControls.brake || 0, state.parkingBrake?.mode === 'all-wheel-abs' ? 1 : 0);
    world.update(suspended ? 0 : dt, state, { ...options, paint: vehiclePaints[spec.id], winchEnabled: winch.equipped, brake: lampBrake, handbrake: effectiveControls.handbrake, throttle: effectiveControls.throttle });
    audio.update(state, effectiveControls, spec, suspended);
    fpsCounter++; fpsElapsed += dt;
    if (fpsElapsed >= 1) { fps = fpsCounter / fpsElapsed; fpsCounter = 0; fpsElapsed = 0; }
    if (now - lastUI > 75) { renderUI(); lastUI = now; }
    if (now - lastMapTime > 220) { drawMap($('minimap')); if ($('map-dialog').open) drawMap($('full-map'), true); lastMapTime = now; }
    if (now - lastChart > 300 && !$('panel-telemetry').hidden) { drawChart(); lastChart = now; }
    frameNumber++;
    requestAnimationFrame(frame);
  } catch (error) {
    frameFailed = true; audio.disable(); console.error('Simulation halted', error);
    $('fatal-error').hidden = false; setText('fatal-title', 'The simulation stopped');
    setText('fatal-message', 'A runtime error interrupted the drive. Reload to restart the proving ground.');
    setText('fatal-detail', String(error.stack || error));
  }
}

renderZones(); updateZones(); renderVehicle(); renderGarage(); wireUI();
setCamera(options.camera, false);
if (saved.welcomeDismissed) $('welcome-card').hidden = true;
world.update(0, physics.state, { ...options, paint: vehiclePaints[spec.id] });
drawMap($('minimap')); renderUI();
$('loading').hidden = true;
lastTime = performance.now();
requestAnimationFrame(frame);

// Read-only access for reproducible diagnostics and future browser verification.
Object.defineProperty(window, '__TERRA__', { value: {
  version: '1.15.0', get state() { return structuredClone(physics.state); },
  get vehicle() { return spec.id; }, get frames() { return frameNumber; },
  get winch() { return structuredClone(winch.state); },
  get build() { return structuredClone(vehicleBuilds[spec.id]); },
  get configuredSpecification() { return structuredClone(spec); },
  get terrainRevision() { return terrain.revision; }, get halted() { return frameFailed; },
  get terrainTracks() { return { regions: terrain.detailTiles.size, capacity: terrain.maxDetailTiles, full: !!terrain.detailBudgetFull, contacts: currentGroundContacts() }; },
  get renderingIssues() { return structuredClone({ shaders: world.renderingIssues || [], textures: world.textureFailures || [], terrainFallbackActive: !!world.terrainFallbackActive }); },
  get drawCalls() { return world.renderer.info.render.calls; }, get triangles() { return world.renderer.info.render.triangles; },
}, writable: false });
