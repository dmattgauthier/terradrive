import { deriveVehicle, normalizeBuild, validateBuild, upgradeOptions, buildMetrics, UPGRADE_SOURCES } from './upgrades.js?v=1.15.0';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = (value, digits = 0) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`;

function torqueChart(base, configured) {
  const electric = base.powertrain === 'electric';
  const width = 420, height = 157, left = 43, right = 15, top = 18, bottom = 30;
  const maxRPM = Math.max(base.engine.redlineRPM, configured.engine.redlineRPM);
  const maxTorque = Math.ceil((electric ? base.electric.motorPeakTorqueNm : Math.max(base.torqueNm, configured.torqueNm)) / 100) * 100;
  const x = rpm => left + rpm / maxRPM * (width - left - right);
  const y = torque => height - bottom - torque / maxTorque * (height - top - bottom);
  const path = curve => curve.map(([rpm, torque], i) => `${i ? 'L' : 'M'}${x(rpm).toFixed(2)},${y(torque).toFixed(2)}`).join(' ');
  const ticks = Array.from({ length: 4 }, (_, i) => i * maxTorque / 3);
  const motorCurve = availability => Array.from({ length: 129 }, (_, i) => {
    const rpm = maxRPM * i / 128, omega = rpm * Math.PI / 30;
    return [rpm, Math.min(base.electric.motorPeakTorqueNm * availability, base.powerHP * 745.699872 / base.electric.motors / Math.max(1, omega)) * Math.max(0, Math.min(1, (maxRPM - rpm) / 500))];
  });
  const stockCurve = electric ? motorCurve(.82) : base.engine.curve, selectedCurve = electric ? motorCurve(1) : configured.engine.curve;
  return `<figure class="workshop-curve"><figcaption>${electric ? 'Electric motor torque' : 'Full-throttle torque'} <span>${electric ? 'Estimated per motor · Nm' : 'Estimated curves · Nm'}</span></figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${electric ? 'Estimated normal and launch torque envelopes for each electric motor' : 'Factory and selected build torque curves by engine speed'}">
    ${ticks.map(t => `<path class="curve-grid" d="M${left} ${y(t)}H${width - right}"/><text x="${left - 8}" y="${y(t) + 3}" text-anchor="end">${Math.round(t)}</text>`).join('')}
    ${[0, .25, .5, .75, 1].map(f => `<text x="${x(maxRPM * f)}" y="${height - 10}" text-anchor="middle">${(maxRPM * f / 1000).toFixed(1)}k</text>`).join('')}
    <path class="curve-stock" d="${path(stockCurve)}"/><path class="curve-build" d="${path(selectedCurve)}"/>
  </svg><div class="curve-legend"><span>┄ ${electric ? 'Normal' : 'Factory'}</span><span>━ ${electric ? 'Watts to Freedom' : 'Selected build'}</span><small>${electric ? 'Motor' : 'Engine'} RPM</small></div>${electric ? '<p class="small-note">Equal motor peak torque, power sharing and the normal-mode limit are estimates. The front and rear reductions produce different motor speeds; 11,500 lb-ft is the advertised combined torque at the wheels.</p>' : ''}</figure>`;
}

/** Pure markup makes every option, compatibility rule and comparison reviewable. */
export function workshopHTML(base, input, { canInstall = true, installed = {}, winchEquipped = false } = {}) {
  const electric = base.powertrain === 'electric';
  const draft = normalizeBuild(base, input), preview = deriveVehicle(base, draft);
  const validation = validateBuild(base, draft), groups = upgradeOptions(base);
  const installedBuild = normalizeBuild(base, installed);
  const changed = Object.keys(draft).some(key => draft[key] !== installedBuild[key]);
  const factory = buildMetrics(base), configured = buildMetrics(preview);
  const rows = [
    ['Estimated total contact area', 'groundAreaM2', 'm²', 2, 0],
    ['Power', 'powerHP', 'hp', 0, 1], ...(electric ? [
      ['Advertised wheel torque', 'wheelTorqueLbFt', 'lb-ft', 0, 0], ['Peak per motor · estimated', 'motorPeakTorqueNm', 'Nm', 0, 0],
    ] : [['Peak torque', 'torqueNm', 'Nm', 0, 1]]),
    ['Vehicle mass', 'massKG', 'kg', 0, -1], ['Tire diameter', 'tireDiameterMM', 'mm', 0, 0],
    ['Tire width', 'tireWidthMM', 'mm', 0, 0], ['Nominal body clearance', 'bodyClearanceMM', 'mm', 0, 1],
    ['Wheel travel', 'travelMM', 'mm', 0, 0], ['Center of gravity', 'cgHeightMM', 'mm', 0, -1],
    ...(electric ? [['Front reduction', 'frontReduction', ':1', 2, 0], ['Rear reduction', 'rearReduction', ':1', 2, 0]]
      : [['Final drive', 'finalDrive', ':1', 2, 0], ['Lowest overall ratio', 'crawlRatio', ':1', 1, 0]]),
  ];
  const rowHTML = rows.map(([label, key, unit, digits, preference]) => {
    const delta = configured[key] - factory[key], different = Math.abs(delta) > .5 * 10 ** -digits;
    const tone = !different || !preference ? '' : delta * preference > 0 ? ' beneficial' : ' tradeoff';
    return `<tr><th scope="row">${label}</th><td>${factory[key].toFixed(digits)}<small>${unit}</small></td><td class="${tone}">${configured[key].toFixed(digits)}<small>${unit}</small>${different ? `<em>${signed(delta, digits)}</em>` : ''}</td></tr>`;
  }).join('');
  const drive = electric ? '3 electric motors · permanent e4WD · single-speed reductions' : preview.driveModes.includes('4L') ? `4×4 · ${preview.lowRatio.toFixed(2)}:1 low range` : preview.driveModes.includes('4A') ? 'Selectable FWD / automatic AWD' : preview.defaultMode;
  const status = !canInstall ? 'Stop the active vehicle before installing parts. Close this panel to brake.' : !validation.ok ? validation.issues.join(' ') : !changed ? 'This build is already installed.' : 'Ready to install. The selected parts will change the driving vehicle and its saved setup.';
  return `<div class="workshop-layout">
    <section class="workshop-preview" aria-label="Build preview and comparison">
      <div class="workshop-model-wrap garage-model-art"><canvas class="garage-model" data-garage-model="${esc(base.id)}" width="840" height="520" role="img" tabindex="0" aria-label="${esc(base.name)} selected build. Drag or use arrow keys to rotate."></canvas><span class="garage-model-status" data-model-status="${esc(base.id)}">Preparing build preview…</span><div class="workshop-model-caption"><span>${esc(base.year)} · ${esc(base.brand)}</span><span>${esc(preview.upgrade.label)}</span></div></div>
      <div class="workshop-preview-copy"><h3>${esc(base.name)}</h3><p>${esc(drive)}${winchEquipped ? ' · Recovery winch fitted' : ''}</p><p class="small-note">${esc(preview.tireSize)} · ${esc(preview.tireType.replaceAll('-', ' '))}</p></div>
      <table class="workshop-comparison"><caption>Factory specification and selected build</caption><thead><tr><th scope="col">BUILD COMPARISON</th><th scope="col">FACTORY</th><th scope="col">SELECTED</th></tr></thead><tbody>${rowHTML}</tbody></table>
      ${torqueChart(base, preview)}
      <p class="small-note workshop-stance-note">${electric ? 'Factory clearance is shown at Normal height. Air height settings, spring sag and tire flex change the loaded stance. Suspension packages alter the air-spring targets; larger tires change the contact footprint and the pulling force at the ground.' : 'Clearance is the nominal body value. Spring sag and tire flex change the loaded stance. A suspension lift raises the body; solid-axle housings remain tied to wheel height.'}</p>
    </section>
    <section class="workshop-parts" aria-label="Choose installed components">
      ${groups.map((group, i) => {
        const selected = group.options.find(option => option.id === draft[group.id]);
        return `<div class="workshop-part"><div class="workshop-part-heading"><span>0${i + 1}</span><div><label for="upgrade-${group.id}">${esc(group.name)}</label><p>${esc(group.description)}</p></div></div><select id="upgrade-${group.id}" data-upgrade="${group.id}" aria-describedby="upgrade-help-${group.id}">${group.options.map(option => `<option value="${esc(option.id)}"${option.id === draft[group.id] ? ' selected' : ''}>${esc(option.name)}${option.output ? ` · ${esc(option.output)}` : ''}</option>`).join('')}</select><p class="workshop-part-help" id="upgrade-help-${group.id}">${esc(selected.description)}</p>${selected.evidence ? `<span class="workshop-evidence">${esc(selected.evidence)}</span>` : ''}</div>`;
      }).join('')}
      <div class="workshop-install"><p id="workshop-status" class="${!canInstall || !validation.ok ? 'workshop-issue' : ''}" role="status">${esc(status)}</p><div><button class="primary-button" id="workshop-install"${!canInstall || !validation.ok || !changed ? ' disabled' : ''}>Install build <svg><use href="#i-arrow"/></svg></button><button class="secondary-button" id="workshop-stock">Restore factory build</button></div><p class="small-note">Builds are saved separately for each vehicle. Paint, winch selection and existing damage are retained.</p></div>
      <details class="workshop-sources"><summary>Build assumptions &amp; sources</summary><p>${electric ? 'GMC publishes the 830 hp maximum and 11,500 lb-ft wheel-torque claim. The three motor envelopes, normal-mode limit, tire coefficients, vehicle mass, suspension calibration and upgrade fitment are simulation estimates. Tire and suspension changes feed the actual contact and chassis solver.' : 'These are simulated component packages. The Bronco Ford Performance peak ratings are published; generic package outputs, tire coefficients, masses and fitment are estimates. Suspension, tire geometry and drivetrain settings feed the actual physics model.'}</p><ul>${UPGRADE_SOURCES.filter(source => !electric || source.electric || source.title.startsWith('BFGoodrich')).map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a><p>${esc(source.use)}</p></li>`).join('')}</ul><p>${electric ? 'Battery temperature, charge state, thermal derating and manufacturer control software are not reproduced. Factory electric power and drive units are retained by every offered build.' : 'The model does not simulate fuel use, engine/transmission heat, battery load or the fabrication work needed for custom conversions.'}</p></details>
    </section>
  </div>`;
}
