/** Deterministic, deformable terrain. All distances are metres; Y is up. */
import { SURFACES, surfaceResponse, dirtCoverAt } from './surface-response.js?v=1.15.0';
import { TerrainGeology } from './terrain-geology.js?v=1.15.0';
import { regionDistance, naturalTerrainOffset, landscapeNoise, SNOW_REGION, snowDepthAt, snowPackingAt, trailCenterAt } from './terrain-diversity.js?v=1.15.0';
import { challengeGroundHeight, challengeGroundCoverAt, CHALLENGE_ZONE } from './challenge-course.js?v=1.15.0';
import { soilFlow, depositSoil } from './soil-flow.js?v=1.15.0';
export { SURFACES, DIRT_COVER, DIRT_COVER_GLSL, dirtCoverAt, surfaceResponse } from './surface-response.js?v=1.15.0';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ellipse = regionDistance;
export const ROAD = Object.freeze({ minX: -116, maxX: -100, minZ: -232, maxZ: 240 });
export const SURFACE_REGIONS = Object.freeze([
  { surface: 'mud', cx: 48, cz: -115, rx: 40, rz: 62 },
  { surface: 'wetland', cx: -24, cz: 148, rx: 53, rz: 71 },
  { surface: 'rock', cx: 121, cz: 121, rx: 65, rz: 84, warp: 0 },
  { surface: 'sand', cx: 204, cz: -83, rx: 76, rz: 118 },
  SNOW_REGION,
].map(region => Object.freeze(region)));
function hash(x, z) { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123; return n - Math.floor(n); }
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}

export class Terrain {
  constructor() {
    this.size = 800;
    this.halfSize = 400;
    this.waterLevel = 3.18;
    this.weather = 'dry';
    this.moisture = 0;
    this.revision = 0;
    this.obstacleRevision = 0;
    // Allocate fine soil only where tires travel. A 10 cm grid resolves tire
    // width without paying that cost over the full 800 m proving ground.
    this.detailStep = 0.1; this.detailSize = 4; this.detailDivisions = 40;
    this.maxDetailTiles = 512; this.detailTiles = new Map(); this.detailRevision = 0; this.detailEpoch = 0;
    this.wheelTrails = new Map(); this.soilVolumes = { depressed: 0, displaced: 0, compacted: 0 };
    this.zones = [
      { id: 'trail', name: 'Pine Ridge Trail', short: 'Trail', description: 'Rolling hardpack, mixed pine and birch woods, and fern-lined shoulders.', spawn: { x: -3, z: -44, heading: 0 }, color: '#a9ba9b' },
      { id: 'asphalt', name: 'Tarmac Straight', short: 'Tarmac', description: 'A firm surface for acceleration, braking and tire pressure comparisons.', spawn: { x: -108, z: -186, heading: 0 }, color: '#cbd0c5' },
      { id: 'rock', name: 'Granite Steps', short: 'Rock', description: 'Separate granite boulders, broken rock clusters and uneven articulation lines.', spawn: { x: 112, z: 42, heading: 0 }, color: '#b0b4aa' },
      { id: 'mud', name: 'Rutted Hollow', short: 'Mud', description: 'Branching muddy ruts, standing pools, crumbled shoulders and embedded stones.', spawn: { x: 48, z: -163, heading: 0 }, color: '#b89b76' },
      { id: 'wetland', name: 'Willow Marsh', short: 'Wetland', description: 'Shallow water over soft ground. Traction varies with wheel load and slip.', spawn: { x: -24, z: 77, heading: 0 }, color: '#91b1a0' },
      { id: 'sand', name: 'Copper Dunes', short: 'Sand', description: 'Loose sand, rolling dunes and pressure-sensitive sinkage.', spawn: { x: 195, z: -178, heading: 0 }, color: '#d8bc84' },
      CHALLENGE_ZONE,
      { id: 'snow', name: 'Boreal Snow Basin', short: 'Snow', description: 'Wind-loaded powder, a winding packed lane and deep drifts. Fit flotation tracks in Workshop for the soft shoulders.', spawn: { x: -218, z: 230, heading: 0 }, color: '#dce8ee' },
    ];
    this.geology = new TerrainGeology();
    this.rocks = this.geology.rocks; this.rockOutcrops = this.geology.rockOutcrops;
    this.mudStones = this.geology.mudStones; this.rockSpatial = this.geology.rockSpatial;

    // Two-metre base cells retain road drainage and broad trail erosion;
    // tire-scale plastic deformation still uses the bounded 10 cm tiles.
    this.baseGrid = this._grid('base', -400, 400, -400, 400, 2, false);
    this.patches = [
      this._grid('mud', 8, 88, -184, -48, 0.4, true),
      this._grid('sand', 120, 284, -208, 36, 0.8, true),
      this._grid('wetland', -84, 36, 60, 224, 0.5, true),
      this._grid('rock', 52, 192, 36, 208, 0.5, false),
      this._grid('snow', -344, -136, 192, 384, 1, true),
    ];
  }

  trailX(z) { return trailCenterAt(z); }

  _baseHeight(x, z) {
    const r = Math.hypot(x * 0.95, z);
    let h = 3.8 + 0.50 * Math.sin(x * 0.016) * Math.cos(z * 0.015) + 0.43 * Math.sin(z * 0.029 + x * 0.007);
    h += (noise(x * 0.043, z * 0.043) - 0.5) * 0.35;
    // Nonperiodic hills, broken ridges and branching drainage replace the
    // evenly spaced rolling field. The departure clearing remains gentle.
    h += naturalTerrainOffset(x, z) * smooth(9, 26, Math.hypot(x + 3, z + 44))
      * smooth(8, 18, Math.hypot(x + 51, z - 282));
    h += smooth(235, 392, r) * (8 + 25 * noise(x * 0.012, z * 0.012) + 9 * noise(x * 0.032, z * 0.032));

    // A long, gentle asphalt grade and a narrow hardpack ribbon.
    if (z > -246 && z < 250) h = mix(h, 3.60 + (z + 180) * 0.0025, (1 - smooth(8, 16, Math.abs(x + 108))) * (1 - smooth(237, 250, Math.abs(z))));
    if (Math.abs(z) < 260) {
      const offset = x - this.trailX(z), trail = 1 - smooth(5, 10, Math.abs(offset));
      h = mix(h, 3.62 + 0.55 * Math.sin(z / 49), trail);
      const approach = smooth(8, 18, Math.abs(z + 44));
      // Worn wheel ribbons, intermittent washboard and meandering drainage
      // shoulders are in the same mesh sampled by the tires, not decals.
      const ribbon = Math.exp(-Math.pow((Math.abs(offset) - .95) / .85, 2));
      const drain = Math.exp(-Math.pow((Math.abs(offset) - 6.1 - .65 * Math.sin(z * .12)) / 1.2, 2));
      h += approach * (-.065 * ribbon * (.4 + .6 * noise(z * .17, 21)) - .19 * drain + .035 * Math.sin(z * 1.5) * (1 - smooth(2.6, 4.2, Math.abs(offset))));
    }

    const mud = 1 - smooth(0.73, 1.08, ellipse(x, z, 48, -115, 40, 62));
    if (mud > 0) {
      const field = this.geology.mudAt(x, z), clearing = smooth(6, 13, Math.hypot(x - 48, z + 163));
      const clay = (noise(x * .23 + 17, z * .29) - .5) * .085;
      const drainage = (noise(x * .032 + 13, z * .027 - 9) - .5) * .22;
      h = mix(h, 3.415 + (drainage + clay) * clearing + field.offset, mud);
    }
    const wet = 1 - smooth(0.71, 1.08, ellipse(x, z, -24, 148, 53, 71));
    if (wet > 0) {
      const hummock = Math.pow(noise(x * .15, z * .15), 5) * .67;
      const channel = -.10 * Math.exp(-Math.pow((x + 24 - 5 * Math.sin(z * .057)) / 3.1, 2));
      h = mix(h, 2.89 + 0.19 * Math.sin(x * .12) * Math.sin(z * .067) + .10 * noise(x * .21, z * .21) + (hummock + channel) * smooth(6, 16, Math.hypot(x + 24, z - 77)), wet);
    }
    const sand = 1 - smooth(0.71, 1.09, ellipse(x, z, 204, -83, 76, 118));
    if (sand > 0) {
      const drift = landscapeNoise(x * .026 + noise(x * .015, z * .018) * 2.3, z * .024 - 7);
      const crest = Math.pow(1 - Math.abs(2 * drift - 1), 2);
      h += sand * (1.4 + crest * 5.1 + naturalTerrainOffset(x + 83, z - 71) * .55
        + (noise(x * .19, z * .16) - .5) * .16 * smooth(7, 16, Math.hypot(x - 195, z + 178)));
    }
    const rock = 1 - smooth(0.69, 1.07, ellipse(x, z, 121, 121, 65, 84, 0));
    if (rock > 0) {
      h += rock * (2.0 + .88 * Math.sin(z * .032) + .28 * noise(x * .045, z * .061)
        + .055 * (noise(x * .91, z * .87) - .5) + this.geology.stoneAt(x, z).stoneHeight);
    }
    const snow = 1 - smooth(.74, 1.08, ellipse(x, z, SNOW_REGION.cx, SNOW_REGION.cz, SNOW_REGION.rx, SNOW_REGION.rz));
    if (snow > 0) {
      const basin = 8.3 + naturalTerrainOffset(x + 17, z - 42) * .78;
      const drift = snowDepthAt(x, z) + .32 * Math.pow(noise(x * .13 + noise(x * .04, z * .05) * 3, z * .09), 2);
      h = mix(h, basin + drift, snow);
    }
    return challengeGroundHeight(x, z, h);
  }

  _grid(id, minX, maxX, minZ, maxZ, step, deformable) {
    const nx = Math.round((maxX - minX) / step), nz = Math.round((maxZ - minZ) / step);
    const base = new Float32Array((nx + 1) * (nz + 1));
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
      const wx = minX + x * step, wz = minZ + z * step;
      // Winter's 1 m perimeter contains every vertex of the 2 m base edge.
      // Matching that piecewise-linear edge prevents a visible/contact crack.
      base[z * (nx + 1) + x] = id === 'snow' && (x === 0 || z === 0 || x === nx || z === nz)
        ? this._sampleGrid(this.baseGrid, wx, wz).height : this._baseHeight(wx, wz);
    }
    return { id, minX, maxX, minZ, maxZ, step, nx, nz, base, delta: new Float32Array(base.length), deformable, revision: 0, dirty: null };
  }

  getPatch(x, z) {
    for (const p of this.patches) if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) return p;
    return null;
  }

  getDetailTile(x, z) { return this.detailTiles.get(Math.floor(x / this.detailSize) + ',' + Math.floor(z / this.detailSize)) || null; }

  _detailParent(tx, tz) {
    const x = (tx + .5) * this.detailSize, z = (tz + .5) * this.detailSize;
    if (x < this.baseGrid.minX || x > this.baseGrid.maxX || z < this.baseGrid.minZ || z > this.baseGrid.maxZ) return null;
    // Patch rectangles and detail tiles share 4 m boundaries. Select each
    // tile independently so a swept footprint never covers a biome with base.
    return this.getPatch(x, z) || this.baseGrid;
  }

  _ensureDetailTile(tx, tz, parent = this._detailParent(tx, tz)) {
    const key = tx + ',' + tz;
    if (this.detailTiles.has(key)) return this.detailTiles.get(key);
    if (!parent) return null;
    if (this.detailTiles.size >= this.maxDetailTiles) { this.detailBudgetFull = true; return null; }
    const minX = tx * this.detailSize, minZ = tz * this.detailSize;
    if (minX < parent.minX || minZ < parent.minZ || minX + this.detailSize > parent.maxX + .001 || minZ + this.detailSize > parent.maxZ + .001) return null;
    const nx = this.detailDivisions, nz = nx, count = (nx + 1) ** 2;
    const p = { id: 'detail-' + key, key, tx, tz, parentId: parent.id, minX, minZ, maxX: minX + this.detailSize, maxZ: minZ + this.detailSize, step: this.detailStep, nx, nz, base: new Float32Array(count), delta: new Float32Array(count), compaction: new Float32Array(count), tread: new Float32Array(count), churn: new Float32Array(count), deformable: true, revision: 1, dirty: { x0: 0, x1: nx, z0: 0, z1: nz } };
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
      const i = z * (nx + 1) + x, wx = minX + x * p.step, wz = minZ + z * p.step;
      const border = x === 0 || z === 0 || x === nx || z === nz;
      // A coarse base edge and a dense biome edge do not have the same
      // interpolation between their corners. Give adjoining fine tiles one
      // canonical edge height, whichever side was allocated first.
      const pointParent = border ? this.getPatch(wx, wz) || this.baseGrid : parent;
      p.base[i] = this._sampleGrid(pointParent, wx, wz).height;
      // Neighboring tiles share identical border state, including when the
      // neighbor was driven over before this tile existed.
      if (border) {
        const old = this._detailNode(Math.round(wx / p.step), Math.round(wz / p.step));
        if (old) { p.base[i] = old.p.base[old.i]; p.delta[i] = old.p.delta[old.i]; p.compaction[i] = old.p.compaction[old.i]; p.tread[i] = old.p.tread[old.i]; p.churn[i] = old.p.churn?.[old.i] || 0; }
      }
    }
    this.detailTiles.set(key, p); this.detailRevision++;
    // A shared-edge normal samples one row inside its neighbor. Refining
    // that neighbor can change the sample even when the shared height stays
    // fixed. Refresh existing border normals without allocating more tiles.
    this._dirtyDetailBorder(tx - 1, tz, nx, nx, 0, nz);
    this._dirtyDetailBorder(tx + 1, tz, 0, 0, 0, nz);
    this._dirtyDetailBorder(tx, tz - 1, 0, nx, nz, nz);
    this._dirtyDetailBorder(tx, tz + 1, 0, nx, 0, 0);
    return p;
  }

  _dirtyDetailBorder(tx, tz, x0, x1, z0, z1) {
    const p = this.detailTiles.get(tx + ',' + tz); if (!p) return;
    p.revision++;
    if (!p.dirty) p.dirty = { x0, x1, z0, z1 };
    else { p.dirty.x0 = Math.min(p.dirty.x0, x0); p.dirty.x1 = Math.max(p.dirty.x1, x1); p.dirty.z0 = Math.min(p.dirty.z0, z0); p.dirty.z1 = Math.max(p.dirty.z1, z1); }
  }

  _detailNode(gx, gz) {
    const n = this.detailDivisions, tx = Math.floor(gx / n), tz = Math.floor(gz / n), lx = gx - tx * n, lz = gz - tz * n;
    let p = this.detailTiles.get(tx + ',' + tz);
    if (p) return { p, i: lz * (n + 1) + lx, x: lx, z: lz, gx, gz };
    if (lx === 0 && (p = this.detailTiles.get((tx - 1) + ',' + tz))) return { p, i: lz * (n + 1) + n, x: n, z: lz, gx, gz };
    if (lz === 0 && (p = this.detailTiles.get(tx + ',' + (tz - 1)))) return { p, i: n * (n + 1) + lx, x: lx, z: n, gx, gz };
    if (lx === 0 && lz === 0 && (p = this.detailTiles.get((tx - 1) + ',' + (tz - 1)))) return { p, i: (n + 1) ** 2 - 1, x: n, z: n, gx, gz };
    return null;
  }

  _writeDetailNode(node, delta, compaction, tread, churn = node.p.churn?.[node.i] || 0) {
    const n = this.detailDivisions, tx = Math.floor(node.gx / n), tz = Math.floor(node.gz / n), lx = node.gx - tx * n, lz = node.gz - tz * n;
    const heightChanged = Math.fround(delta) !== node.p.delta[node.i];
    const xs = lx === 0 ? [tx, tx - 1] : [tx], zs = lz === 0 ? [tz, tz - 1] : [tz];
    for (const xTile of xs) for (const zTile of zs) {
      const p = this.detailTiles.get(xTile + ',' + zTile); if (!p) continue;
      const x = node.gx - xTile * n, z = node.gz - zTile * n, i = z * (n + 1) + x;
      p.delta[i] = delta; p.compaction[i] = compaction; p.tread[i] = tread; p.churn[i] = churn; p.revision++;
      if (!p.dirty) p.dirty = { x0: x, x1: x, z0: z, z1: z };
      else { p.dirty.x0 = Math.min(p.dirty.x0, x); p.dirty.x1 = Math.max(p.dirty.x1, x); p.dirty.z0 = Math.min(p.dirty.z0, z); p.dirty.z1 = Math.max(p.dirty.z1, z); }
    }
    // A changed interior row also affects the normal on the other copy of
    // the shared edge. Height/tread values there must remain untouched.
    if (heightChanged && (lx === 1 || lx === n - 1)) {
      const neighborX = lx === 1 ? tx - 1 : tx + 1, edgeX = lx === 1 ? n : 0;
      for (const zTile of zs) { const edgeZ = node.gz - zTile * n; this._dirtyDetailBorder(neighborX, zTile, edgeX, edgeX, edgeZ, edgeZ); }
    }
    if (heightChanged && (lz === 1 || lz === n - 1)) {
      const neighborZ = lz === 1 ? tz - 1 : tz + 1, edgeZ = lz === 1 ? n : 0;
      for (const xTile of xs) { const edgeX = node.gx - xTile * n; this._dirtyDetailBorder(xTile, neighborZ, edgeX, edgeX, edgeZ, edgeZ); }
    }
  }

  _sampleGrid(p, x, z) {
    const px = clamp((x - p.minX) / p.step, 0, p.nx - 0.000001), pz = clamp((z - p.minZ) / p.step, 0, p.nz - 0.000001);
    const ix = Math.floor(px), iz = Math.floor(pz), tx = px - ix, tz = pz - iz, stride = p.nx + 1;
    const a = iz * stride + ix, b = a + 1, c = a + stride, d = c + 1;
    const ha = p.base[a] + p.delta[a], hb = p.base[b] + p.delta[b], hc = p.base[c] + p.delta[c], hd = p.base[d] + p.delta[d];
    let height, hx, hz;
    if (tx + tz <= 1) { height = ha + tx * (hb - ha) + tz * (hc - ha); hx = (hb - ha) / p.step; hz = (hc - ha) / p.step; }
    else { height = hd + (1 - tx) * (hc - hd) + (1 - tz) * (hb - hd); hx = (hd - hc) / p.step; hz = (hd - hb) / p.step; }
    const inv = 1 / Math.hypot(hx, 1, hz);
    const interpolate = data => !data ? 0 : tx + tz <= 1 ? data[a] + tx * (data[b] - data[a]) + tz * (data[c] - data[a]) : data[d] + (1 - tx) * (data[c] - data[d]) + (1 - tz) * (data[b] - data[d]);
    const displacement = interpolate(p.delta);
    return { height, normal: { x: -hx * inv, y: inv, z: -hz * inv }, sink: Math.max(0, -displacement), berm: Math.max(0, displacement), compaction: interpolate(p.compaction), tread: interpolate(p.tread), churn: interpolate(p.churn), detail: !!p.parentId };
  }

  biomeAt(x, z) {
    if (x >= ROAD.minX && x <= ROAD.maxX && z >= ROAD.minZ && z <= ROAD.maxZ) return 'asphalt';
    for (const r of SURFACE_REGIONS) if (Math.abs(x - r.cx) < r.rx * 1.13 && Math.abs(z - r.cz) < r.rz * 1.13 && ellipse(x, z, r.cx, r.cz, r.rx, r.rz, r.warp ?? 1) < 1) return r.surface;
    return 'dirt';
  }

  surfaceAt(x, z) {
    const biome = this.biomeAt(x, z);
    // Exposed stones retain rigid contact even when surrounded by soft mud.
    return biome === 'mud' && this.geology.stoneAt(x, z, true).stone > .48 ? 'rock' : biome;
  }

  /** Static visual geology; independent of live tire sinkage/compaction. */
  geologyAt(x, z) {
    const mud = 1 - smooth(.73, 1.08, ellipse(x, z, 48, -115, 40, 62));
    if (mud > 0) {
      const field = this.geology.mudAt(x, z);
      return { stone: field.stone * mud, rut: field.rut * mud, shoulder: field.shoulder * mud,
        stoneHeight: field.stoneHeight * mud, rutDepth: field.rutDepth * mud };
    }
    const rock = 1 - smooth(.69, 1.07, ellipse(x, z, 121, 121, 65, 84, 0));
    if (rock > 0) {
      const field = this.geology.stoneAt(x, z);
      return { stone: field.stone * rock, rut: 0, shoulder: 0, stoneHeight: field.stoneHeight * rock, rutDepth: 0 };
    }
    return { stone: 0, rut: 0, shoulder: 0, stoneHeight: 0, rutDepth: 0 };
  }

  /** Shared visual/contact hardpack, gravel and grass cover. */
  _dirtCover(x, z) { return challengeGroundCoverAt(x, z) || dirtCoverAt(x, z, this.trailX(z)); }
  _dirtGrassFraction(x, z) { return this._dirtCover(x, z).grass; }

  _soilSupport(x, z) {
    const surface = this.surfaceAt(x, z), mat = SURFACES[surface];
    if (!mat.maxSink) return null;
    // A vertex affects all adjoining triangles, including points on the other
    // side of a material boundary. Check its complete one-cell support box,
    // not only the vertex itself, to keep pavement and rock rigid everywhere.
    const s = this.detailStep + 1e-8;
    if (x + s >= ROAD.minX && x - s <= ROAD.maxX && z + s >= ROAD.minZ && z - s <= ROAD.maxZ) return null;
    const rock = SURFACE_REGIONS[2];
    if (Math.abs(x - rock.cx) < rock.rx * 1.12 && Math.abs(z - rock.cz) < rock.rz * 1.12) {
      for (const dx of [-s, 0, s]) for (const dz of [-s, 0, s]) if (ellipse(x + dx, z + dz, rock.cx, rock.cz, rock.rx, rock.rz, rock.warp ?? 1) <= 1) return null;
    }
    if (this.biomeAt(x, z) === 'mud') {
      // A fine vertex influences a complete surrounding cell. Protect the
      // embedded rock's footprint plus that support cell against excavation.
      for (const dz of [-s, 0, s]) for (const dx of [-s, 0, s]) if (this.geology.stoneAt(x + dx, z + dz, true).stone > .48) return null;
    }
    const region = SURFACE_REGIONS.find(r => r.surface === surface);
    const nearEdge = region && ellipse(x, z, region.cx, region.cz, region.rx, region.rz, region.warp ?? 1) > .98;
    const touchesFirm = surface === 'dirt' || (nearEdge && [-s, s].some(dx => [-s, s].some(dz => ellipse(x + dx, z + dz, region.cx, region.cz, region.rx, region.rz, region.warp ?? 1) >= 1)));
    // Moist, unsaturated sand develops a small apparent cohesion. It does not
    // share the extra rain-softening assigned to saturated mud and marsh.
    const sinkWetScale = surface === 'sand' ? 1 - this.moisture * .14 : 1 + this.moisture * .12;
    return { surface, mat, maxSink: touchesFirm ? SURFACES.dirt.maxSink : surface === 'snow' ? snowDepthAt(x, z) : mat.maxSink * sinkWetScale, maxBerm: touchesFirm ? .003 : surface === 'sand' || surface === 'snow' ? .16 : .13 };
  }

  sample(x, z) {
    const p = this.getDetailTile(x, z) || this.getPatch(x, z) || this.baseGrid;
    const result = this._sampleGrid(p, x, z), surface = this.surfaceAt(x, z), mat = SURFACES[surface], biome = this.biomeAt(x, z);
    const wet = this.moisture, cover = surface === 'dirt' ? this._dirtCover(x, z) : { hardpack: 0, gravel: 0, grass: 0 };
    const packing = surface === 'snow' ? Math.max(result.compaction, snowPackingAt(x, z)) : result.compaction;
    const response = surfaceResponse(surface, { moisture: wet, compaction: packing, churn: result.churn,
      hardpackFraction: cover.hardpack, gravelFraction: cover.gravel, grassFraction: cover.grass });
    const detail = surface === 'dirt' ? cover.grass >= .999 ? 'grass' : cover.gravel >= .999 ? 'gravel' : cover.hardpack >= .999 ? 'hardpack' : 'mixed' : surface;
    return {
      height: result.height, normal: result.normal, sink: result.sink, berm: result.berm,
      compaction: result.compaction, tread: result.tread, churn: result.churn, detail: result.detail,
      mu: response.mu, rollingResistance: response.rollingResistance,
      softness: response.softness, bodyFriction: response.bodyFriction,
      moisture: response.moisture, sinkWetScale: response.sinkWetScale,
      tireResponse: response.tireResponse, soil: response.soil,
      surface, surfaceDetail: detail,
      hardpackFraction: cover.hardpack, gravelFraction: cover.gravel, grassFraction: cover.grass,
      maxSink: surface === 'snow' ? snowDepthAt(x, z) : mat.maxSink * response.sinkWetScale,
      snowDepth: surface === 'snow' ? Math.max(0, snowDepthAt(x, z) - result.sink) : 0,
      waterDepth: biome === 'wetland' ? Math.max(0, this.waterLevel + wet * 0.06 - result.height) : biome === 'mud' ? Math.max(0, 3.265 + wet * 0.05 - result.height) : 0,
    };
  }

  heightAt(x, z) { return this._sampleGrid(this.getDetailTile(x, z) || this.getPatch(x, z) || this.baseGrid, x, z).height; }

  /** End a swept contact, preserving all earth already displaced by the tire. */
  releaseWheelContact(wheelId) { if (wheelId) this.wheelTrails.delete(wheelId); }

  /** Plastic soil displacement: persistent height changes, pressure/load/slip dependent. */
  deform(x, z, { load = 4000, slip = 0, lateralSlip = 0, pressure = 32, width = 0.28, contactWidth, contactLength, contactShape = 'ellipse', supportPlane = null, speed = 0, longitudinalSpeed = 0, wheelId, dt = 1 / 120, heading = 0 } = {}) {
    if (!Number.isFinite(load) || !Number.isFinite(dt) || load <= 40 || dt <= 0 || !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > this.halfSize || Math.abs(z) > this.halfSize) return 0;
    if (supportPlane) {
      const { origin, normal, deflection, meanBearing } = supportPlane;
      if (!origin || !normal || ![origin.x, origin.y, origin.z, normal.x, normal.y, normal.z, deflection, meanBearing].every(Number.isFinite)
        || deflection <= 0 || meanBearing <= 0 || meanBearing > 1.000001) { this.releaseWheelContact(wheelId); return 0; }
      const length = Math.hypot(normal.x, normal.y, normal.z);
      if (length < .000001) { this.releaseWheelContact(wheelId); return 0; }
      // Save a value snapshot: physics/tool callers may reuse their input
      // objects next frame, but an earlier sweep endpoint must stay fixed.
      supportPlane = { origin: { x: origin.x, y: origin.y, z: origin.z }, deflection, meanBearing,
        normal: { x: normal.x / length, y: normal.y / length, z: normal.z / length } };
    }
    pressure = clamp(Number(pressure) || 32, contactShape === 'rectangle' ? .4 : 8, 85);
    // A sideways skid shears soil even when the wheel rolls without drive
    // slip. This bounded severity affects excavation/tread/churn only; it
    // never changes the actual contact footprint or its orientation.
    const lateralRatio = Math.tan(clamp(Number(lateralSlip) || 0, -1.3, 1.3));
    const soilSlip = Math.min(3, Math.hypot(Number(slip) || 0, lateralRatio));
    // Physics defines positive lateral slip along forward cross normal,
    // opposite the stencil's positive-across axis. A sliding tire pushes a
    // larger shoulder on its advancing side. This redistributes the existing
    // displaced volume; the angular response is an uncalibrated estimate.
    const sideBias = -Math.sign(lateralRatio) * smooth(.08, .75, Math.abs(lateralRatio)) * .80;
    const cw = clamp(Number(contactWidth) || width * (1 + clamp((35 - pressure) / 100, -.10, .22)), .15, .70);
    const cl = clamp(Number(contactLength) || .19 * Math.sqrt(35 / pressure) * Math.sqrt(load / 4300), .12, contactShape === 'rectangle' ? 1.7 : 1.1);
    const previous = wheelId ? this.wheelTrails.get(wheelId) : null;
    let distance = previous ? Math.hypot(x - previous.x, z - previous.z) : 0;
    // Recovery/travel teleports must never excavate a line across the map.
    if (distance > Math.max(2, Math.abs(speed) * dt * 5 + .5)) distance = 0;
    const count = Math.max(1, Math.min(16, Math.ceil(distance / Math.max(.055, cl * .35))));
    let deepest = 0;
    for (let n = 1; n <= count; n++) {
      const t = n / count, sx = distance ? mix(previous.x, x, t) : x, sz = distance ? mix(previous.z, z, t) : z;
      let plane = supportPlane;
      if (plane && distance && previous?.supportPlane && n < count) {
        const old = previous.supportPlane, normal = {}, origin = {};
        for (const axis of ['x', 'y', 'z']) { origin[axis] = mix(old.origin[axis], plane.origin[axis], t); normal[axis] = mix(old.normal[axis], plane.normal[axis], t); }
        const length = Math.hypot(normal.x, normal.y, normal.z);
        if (length > .01) for (const axis of ['x', 'y', 'z']) normal[axis] /= length;
        plane = { origin, normal, deflection: mix(old.deflection, plane.deflection, t), meanBearing: mix(old.meanBearing, plane.meanBearing, t) };
      }
      deepest = Math.max(deepest, this._stampSoil(sx, sz, { load, slip: soilSlip, driveSlip: Number(slip) || 0, longitudinalSpeed, sideBias, pressure, cw, cl, contactShape, supportPlane: plane, speed, dt: dt / count, heading, travel: (previous?.travel || 0) + distance * t }));
    }
    if (wheelId) this.wheelTrails.set(wheelId, { x, z, supportPlane, travel: (previous?.travel || 0) + distance });
    this.revision++; return deepest;
  }

  _stampSoil(x, z, { load, slip, driveSlip = 0, longitudinalSpeed = 0, sideBias = 0, pressure, cw, cl, contactShape, supportPlane, speed, dt, heading, travel }) {
    const step = this.detailStep, rx = cw * .5, rz = Math.max(cl * .5, step * .8), edge = Math.max(.14, cw * .54);
    const cs = Math.cos(heading), sn = Math.sin(heading);
    // Bound the same oriented tread and berm stencil, rather than a square
    // around its circumscribed circle. Unworked corner tiles consume no budget.
    const moving = smooth(.15, 1.6, Math.abs(longitudinalSpeed)), travelDirection = Math.sign(longitudinalSpeed);
    const digging = smooth(.20, 1.2, Math.abs(driveSlip));
    const acrossReach = rx + Math.max(step * .45, edge * 2.05), alongReach = rz + step;
    // End piles occupy the receiving strip just outside the actual loaded
    // footprint. Do not enlarge its fine-tile reservation for a visual effect.
    const contactEnd = rz + step * (.65 - moving * .60);
    const reachX = Math.abs(cs) * acrossReach + Math.abs(sn) * alongReach;
    const reachZ = Math.abs(sn) * acrossReach + Math.abs(cs) * alongReach;
    // A rigid center ray does not make the whole footprint rigid. An edge
    // can still load the soft shoulder; retain the cheap all-rigid rejection.
    if (!SURFACES[this.surfaceAt(x, z)].maxSink) {
      let softEdge = false;
      for (const across of [-rx, 0, rx]) for (const along of [-rz, 0, rz]) {
        if (this._soilSupport(x + across * cs + along * sn, z - across * sn + along * cs)) softEdge = true;
      }
      if (!softEdge) return 0;
    }
    const pileAt = (wx, wz, across, along, surface, maxBerm) => {
      const ax = Math.abs(across), az = Math.abs(along);
      const longitudinal = 1 - smooth(rz * .45, rz + step * .65, az);
      const clumps = surface === 'dirt' ? 1 : .38 + noise(wx * 3.17 + 31, wz * 2.83 - 19) * .92;
      const looseSand = surface === 'sand' ? 1 - this.moisture : 0;
      const shoulder = Math.exp(-Math.pow((ax - rx - edge * (.65 + looseSand * .17)) / (edge * (.55 + looseSand * .22)), 2));
      const sideWeight = ax >= rx + step * .45 ? shoulder * longitudinal * (1 + Math.sign(across) * sideBias) : 0;
      const endDistance = Math.max(0, az - rz), ahead = Math.sign(along) === travelDirection;
      const endWeight = moving * (ahead ? .72 : digging * .52)
        * (1 - smooth(rx * .55, rx + edge, ax))
        * Math.exp(-Math.pow((endDistance - .055) / .12, 2)) * (az > contactEnd ? 1 : 0);
      const clearance = Math.hypot(Math.max(0, ax - rx), Math.max(0, az - rz));
      return { weight: (sideWeight + endWeight) * clumps,
        maxBerm: Math.min(maxBerm, (clearance + step * .5) * soilFlow(surface, this.moisture).repose) };
    };
    const needed = [];
    for (let tz = Math.floor((z - reachZ) / this.detailSize); tz <= Math.floor((z + reachZ) / this.detailSize); tz++) for (let tx = Math.floor((x - reachX) / this.detailSize); tx <= Math.floor((x + reachX) / this.detailSize); tx++) {
      const parent = this._detailParent(tx, tz); if (!parent) continue;
      if (this.detailTiles.has(tx + ',' + tz)) { needed.push([tx, tz, parent]); continue; }
      // A rotated or directionally extended bounding box includes untouched
      // corners. Reserve a tile only if its actual stencil contains a yielding
      // contact node or a real pile receiver, including shared border nodes.
      let touched = false;
      const gx0 = Math.max(Math.floor((x - reachX) / step), tx * this.detailDivisions);
      const gx1 = Math.min(Math.ceil((x + reachX) / step), (tx + 1) * this.detailDivisions);
      const gz0 = Math.max(Math.floor((z - reachZ) / step), tz * this.detailDivisions);
      const gz1 = Math.min(Math.ceil((z + reachZ) / step), (tz + 1) * this.detailDivisions);
      for (let gz = gz0; gz <= gz1 && !touched; gz++) for (let gx = gx0; gx <= gx1; gx++) {
        const wx = gx * step, wz = gz * step, dx = wx - x, dz = wz - z;
        const across = dx * cs - dz * sn, along = dx * sn + dz * cs, ax = Math.abs(across), az = Math.abs(along);
        if (az > alongReach || ax >= acrossReach) continue;
        const support = this._soilSupport(wx, wz); if (!support) continue;
        if (ax < rx + step * .45 && az < contactEnd) {
          if (supportPlane) {
            const { origin, normal, deflection } = supportPlane;
            const old = this._detailNode(gx, gz);
            const height = old ? old.p.base[old.i] + old.p.delta[old.i] : this._sampleGrid(parent, wx, wz).height;
            const gap = (origin.x - wx) * normal.x + (origin.y - height) * normal.y + (origin.z - wz) * normal.z;
            if (gap >= deflection) continue;
          }
          touched = true; break;
        }
        if (pileAt(wx, wz, across, along, support.surface, support.maxBerm).weight > .015) { touched = true; break; }
      }
      if (touched) needed.push([tx, tz, parent]);
    }
    if (needed.filter(([tx, tz]) => !this.detailTiles.has(tx + ',' + tz)).length + this.detailTiles.size > this.maxDetailTiles) { this.detailBudgetFull = true; return 0; }
    for (const [tx, tz, parent] of needed) this._ensureDetailTile(tx, tz, parent);
    const spin = Math.min(3, Math.abs(slip)), area = Math.max(.015, cw * cl * (contactShape === 'rectangle' ? 1 : Math.PI / 4));
    // Semi-empirical pressure/sinkage response. Parameters are deliberately
    // explicit estimates, not a calibrated Bekker material data set.
    const stress = load / area, stressFactor = Math.pow(clamp(stress / 105000, .12, 4.5), .52), loadFactor = Math.pow(clamp(load / 4300, .06, 4), .24);
    const response = (.20 + spin * .18) * stressFactor * loadFactor * Math.pow(pressure / 35, .16);
    const blend = 1 - Math.exp(-dt * (15 + spin * 16)), center = [], berm = []; let down = 0, displaced = 0, deepest = 0;
    const x0 = Math.floor((x - reachX) / step), x1 = Math.ceil((x + reachX) / step), z0 = Math.floor((z - reachZ) / step), z1 = Math.ceil((z + reachZ) / step);
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const wx = gx * step, wz = gz * step;
      const dx = wx - x, dz = wz - z, across = dx * cs - dz * sn, along = dx * sn + dz * cs, ax = Math.abs(across), az = Math.abs(along), node = this._detailNode(gx, gz);
      if (!node || az > alongReach) continue;
      const support = this._soilSupport(wx, wz); if (!support) continue;
      const { surface, maxSink, maxBerm } = support;
      const longitudinal = 1 - smooth(rz * .45, rz + step * .65, az);
      if (ax < rx + step * .45 && az < contactEnd) {
        const old = node.p.delta[node.i], compaction = node.p.compaction[node.i];
        let bearing = 1, localResponse = response;
        if (supportPlane) {
          const { origin, normal, deflection, meanBearing } = supportPlane;
          const gap = (origin.x - wx) * normal.x + (origin.y - node.p.base[node.i] - old) * normal.y + (origin.z - wz) * normal.z;
          bearing = clamp(1 - Math.max(0, gap) / Math.max(.001, deflection), 0, 1);
          if (bearing <= 0) continue;
          // Use the same unilateral contact as the tire solve. Soil below a
          // bridging tire cannot be churned or marked by an invisible force.
          // Normalize local stress by the bearing footprint's estimated area;
          // contact pressure can concentrate at an edge without changing load.
          const localStressFactor = Math.pow(clamp(stress * bearing / Math.max(.04, meanBearing) / 105000, .12, 4.5), .52);
          localResponse = response * localStressFactor / stressFactor;
        }
        const contact = (1 - smooth(rx * .68, rx + step * .45, ax)) * longitudinal * bearing;
        // Chevron tread survives rolling but smears under substantial slip.
        const treadWave = .5 + .5 * Math.cos(((travel + along) / .23 + Math.abs(across) * 2.6) * Math.PI * 2);
        const print = (1 - smooth(.22, 1.15, spin)) * Math.pow(treadWave, 4) * contact;
        const structure = surface === 'dirt' ? 1 : .79 + noise(wx * 1.37 + 11, wz * 1.21 - 7) * .42;
        const target = Math.min(maxSink * .97, maxSink * localResponse * structure);
        // Firm ground records compaction and a shallow tread incision; the
        // total depression, including tread, remains inside its 12 mm limit.
        const flow = soilFlow(surface, this.moisture, compaction, node.p.churn[node.i]);
        const desired = -target * contact / (1 + compaction * flow.hardening) - print * (surface === 'dirt' ? .0015 : .007);
        const delta = Math.max(-maxSink, Math.min(old, old + (desired - old) * blend));
        const density = clamp(compaction + (1 - compaction) * contact * dt * ((surface === 'dirt' ? 18 : 9) + spin * 5), 0, 1);
        // Compression and shearing leave different soil states. A freely
        // rolling pass compacts without remoulding; wheelspin/locked sliding
        // progressively destroys wet soil structure and loosens aggregate.
        const oldChurn = node.p.churn[node.i], shear = smooth(.18, 1.0, spin);
        const churn = clamp(oldChurn + (1 - oldChurn) * contact * (1 - Math.exp(-dt * shear * 8)), 0, 1);
        const removed = Math.max(0, old - delta); down += removed; deepest = Math.max(deepest, -delta);
        displaced += removed * flow.displaced;
        center.push({ node, delta, density, churn, print: Math.max(node.p.tread[node.i] * (1 - Math.min(.12, spin * dt)), print * density) });
      } else if (ax < rx + edge * 2.05) {
        const pile = pileAt(wx, wz, across, along, surface, maxBerm);
        if (pile.weight > .015) berm.push({ node, ...pile });
      }
    }
    for (const item of center) this._writeDetailNode(item.node, item.delta, item.density, item.print, item.churn);
    const raised = down > 0 ? depositSoil(berm, displaced,
      item => item.node.p.delta[item.node.i],
      (item, next) => this._writeDetailNode(item.node, next,
        Math.max(item.node.p.compaction[item.node.i], .22), item.node.p.tread[item.node.i] * .96)) : 0;
    this.soilVolumes.depressed += down * step * step; this.soilVolumes.displaced += raised * step * step; this.soilVolumes.compacted += Math.max(0, down - raised) * step * step;
    return deepest;
  }

  resetDeformation() {
    this.detailTiles.clear(); this.wheelTrails.clear(); this.detailRevision++; this.detailEpoch++; this.detailBudgetFull = false;
    this.soilVolumes = { depressed: 0, displaced: 0, compacted: 0 };
    for (const p of this.patches) {
      p.delta.fill(0); p.revision++; p.dirty = { x0: 0, x1: p.nx, z0: 0, z1: p.nz };
    }
    this.revision++;
  }

  setWeather(weather) {
    this.weather = weather;
    this.moisture = weather === 'rain' || weather === 'wet' ? 1 : weather === 'overcast' ? 0.25 : 0;
  }

  setMoisture(value) { this.moisture = clamp(value, 0, 1); }

  /** Shared map/mesh palette; defaults are grassy hardpack away from trails. */
  colorAt(x, z) {
    const surface = this.surfaceAt(x, z), n = noise(x * 0.11, z * 0.11), detail = noise(x * 0.62, z * 0.62);
    let color;
    if (surface === 'asphalt') color = [0.19, 0.22, 0.24];
    else if (surface === 'mud') color = [0.25, 0.155, 0.10];
    else if (surface === 'wetland') color = [0.20, 0.30, 0.205];
    else if (surface === 'sand') color = [0.85, 0.70, 0.45];
    else if (surface === 'rock') color = [0.51, 0.56, 0.59];
    else if (surface === 'snow') color = [.78, .87, .93];
    else {
      const cover = this._dirtCover(x, z);
      color = [.66 * cover.hardpack + .55 * cover.gravel + .25 * cover.grass,
        .47 * cover.hardpack + .52 * cover.gravel + .39 * cover.grass,
        .285 * cover.hardpack + .44 * cover.gravel + .17 * cover.grass];
    }
    const shade = 0.85 + n * 0.22 + detail * 0.11;
    return { r: color[0] * shade, g: color[1] * shade, b: color[2] * shade, surface };
  }

  mapColor(x, z) { const c = this.colorAt(x, z); return `rgb(${Math.round(c.r * 300)},${Math.round(c.g * 300)},${Math.round(c.b * 300)})`; }
}

export { noise as terrainNoise, hash as terrainHash };
