/** Player-facing descriptions of the material actually supporting the tires. */
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const materialKey = key => key === 'dirt' ? 'hardpack' : key;

const MATERIALS = Object.freeze({
  snow: { label: 'SNOW / POWDER', short: 'SNOW', color: '#dce8ef', dry: 'Powder and packed snow — broad tracks reduce ground pressure and sinkage', wet: 'Wet snow — heavy soft support with reduced grip' },
  asphalt: { label: 'PAVED ROAD', short: 'PAVED', color: '#87918e', dry: 'Firm pavement · crisp steering and low rolling drag', wet: 'Wet pavement · reduced braking and cornering grip' },
  hardpack: { label: 'HARDPACK', short: 'HARDPACK', color: '#b39872', dry: 'Packed earth · firm support and shallow tire impressions', wet: 'Wet hardpack · softer top layer and less available grip' },
  gravel: { label: 'LOOSE GRAVEL', short: 'GRAVEL', color: '#aaa394', dry: 'Loose gravel · earlier sliding and stronger rolling drag', wet: 'Wet gravel · loose aggregate over a damp base' },
  grass: { label: 'DRY GRASS', short: 'GRASS', color: '#88a56c', dry: 'Grass over soil · less grip than the packed trail', wet: 'Wet grass · limited braking and cornering grip' },
  rock: { label: 'EXPOSED ROCK', short: 'ROCK', color: '#a5afaa', dry: 'Exposed rock · firm support and uneven wheel loading', wet: 'Wet rock · firm support with reduced surface grip' },
  wood: { label: 'BARK / TIMBER', short: 'WOOD', color: '#a38b65', dry: 'Rigid wood · tires bear on the log or stump', wet: 'Wet wood · firm support with reduced surface grip' },
  mud: { label: 'DEEP MUD', short: 'MUD', color: '#96714e', dry: 'Soft mud · wheelspin churns the soil and deepens ruts', wet: 'Soft, wet mud · low shear strength and deepening ruts' },
  wetland: { label: 'WETLAND', short: 'MARSH', color: '#809d88', dry: 'Saturated ground · soft support and water drag', wet: 'Saturated ground · soft support and water drag' },
  sand: { label: 'LOOSE SAND', short: 'SAND', color: '#d7b977', dry: 'Loose sand · pressure-sensitive sinkage and rolling drag', wet: 'Damp sand · firmer grains with pressure-sensitive sinkage' },
});

function addWeights(target, values, weight = 1) {
  for (const [name, fraction] of Object.entries(values || {})) {
    const key = materialKey(name);
    if (!MATERIALS[key] || !Number.isFinite(fraction) || !(fraction > 0)) continue;
    target[key] = (target[key] || 0) + fraction * weight;
  }
}

function normalizeWeights(values) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  return total > 0 ? Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value / total])) : {};
}

function labelFor(key, moisture) {
  const item = MATERIALS[key] || MATERIALS.hardpack;
  if (moisture < .55) return item.label;
  if (key === 'asphalt') return 'WET PAVEMENT';
  if (key === 'sand') return 'DAMP SAND';
  if (['asphalt', 'hardpack', 'gravel', 'grass', 'rock', 'wood'].includes(key)) return `WET ${item.short}`;
  return item.label;
}

export function wheelSurfaceLabel(wheel) {
  if (!wheel?.contact) return 'AIR';
  const mix = {};
  addWeights(mix, wheel.surfaceMix);
  const key = Object.entries(mix).sort((a, b) => b[1] - a[1])[0]?.[0]
    || materialKey(wheel.surfaceDetail || wheel.surface);
  const short = MATERIALS[key]?.short || 'MIXED';
  return finite(wheel.moisture) >= .55 && ['asphalt', 'hardpack', 'gravel', 'grass', 'rock', 'wood'].includes(key) ? `WET ${short}` : short;
}

export function surfaceFeedback(state = {}) {
  const wheels = (state.wheels || []).filter(wheel => wheel.contact && finite(wheel.load, 1) > 0);
  if (!wheels.length && state.groundedWheels === 0) {
    return { key: 'air', label: 'AIRBORNE', color: '#8e9e96', description: 'Tires are off the ground', title: 'No tire contact', mixture: {}, moisture: 0, mixed: false, gripUse: 0 };
  }
  const weights = {};
  addWeights(weights, state.surfaceMix);
  if (!Object.keys(weights).length) for (const wheel of wheels) {
    const weight = Math.max(1, finite(wheel.load, 1));
    const before = Object.values(weights).reduce((sum, value) => sum + value, 0);
    addWeights(weights, wheel.surfaceMix, weight);
    if (Object.values(weights).reduce((sum, value) => sum + value, 0) === before) {
      const key = materialKey(wheel.surfaceDetail || wheel.surface || state.terrain);
      if (MATERIALS[key]) weights[key] = (weights[key] || 0) + weight;
    }
  }
  if (!Object.keys(weights).length) weights[materialKey(state.terrainDetail || state.terrain) in MATERIALS ? materialKey(state.terrainDetail || state.terrain) : 'hardpack'] = 1;
  const mixture = normalizeWeights(weights), ranked = Object.entries(mixture).sort((a, b) => b[1] - a[1]);
  const key = ranked[0][0], item = MATERIALS[key];
  const totalLoad = wheels.reduce((sum, wheel) => sum + Math.max(1, finite(wheel.load, 1)), 0);
  const moisture = clamp(finite(state.terrainMoisture, totalLoad > 0 ? wheels.reduce((sum, wheel) => sum + finite(wheel.moisture) * Math.max(1, finite(wheel.load, 1)), 0) / totalLoad : 0), 0, 1);
  const mixed = ranked.length > 1 && ranked[1][1] >= .20;
  const title = ranked.map(([name, fraction]) => `${Math.round(fraction * 100)}% ${labelFor(name, moisture).toLowerCase()}`).join(' · ');
  return {
    key, mixture, moisture, mixed, color: item.color,
    label: mixed ? `${item.short} / ${MATERIALS[ranked[1][0]].short}` : labelFor(key, moisture),
    description: mixed ? `Mixed tire contact · ${title}` : moisture >= .55 ? item.wet : item.dry,
    title: `Load-weighted tire contact · ${title}`,
    gripUse: clamp(Math.max(0, ...wheels.map(wheel => finite(wheel.frictionUtilization))), 0, 1),
  };
}
