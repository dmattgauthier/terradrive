import * as THREE from '../vendor/three.module.js';

const clamp = THREE.MathUtils.clamp;

function queueAttributeRange(attribute, start, count) {
  // A hidden or culled mesh can receive several CPU edits before Three uploads
  // it. Preserve the pending union until that upload, and bound its bookkeeping
  // even if many separated plants change while the batch remains off-screen.
  const ranges = attribute.updateRanges;
  let end = start + count;
  for (let index = ranges.length - 1; index >= 0; index--) {
    const range = ranges[index];
    if (range.start <= end && range.start + range.count >= start) {
      start = Math.min(start, range.start);
      end = Math.max(end, range.start + range.count);
      ranges.splice(index, 1);
    }
  }
  if (ranges.length >= 63) {
    for (const range of ranges) {
      start = Math.min(start, range.start);
      end = Math.max(end, range.start + range.count);
    }
    attribute.clearUpdateRanges();
  }
  attribute.addUpdateRange(start, end - start);
}

/**
 * Keep the persistent, widely spaced ground-cover batches on the same soil as
 * the tires. Their placement and pristine transforms never get regenerated.
 * Only instances rooted in an edited 4 m soil tile need a new soil sample.
 * This is a visual compaction response, not a separate plant/stone simulation.
 */
export class GroundCoverContact {
  constructor(terrain, populations = []) {
    this.terrain = terrain;
    this.tiles = new Map();
    this.revisions = new Map();
    this.populations = [];
    this.epoch = terrain.detailEpoch;
    this.metrics = { sampled: 0, changed: 0, uploads: 0, totalChanged: 0 };
    for (const options of populations) this._register(options);
    this.update();
  }

  _register({ mesh, plant = true, rootOffset = 0, companion = null }) {
    if (!mesh?.isInstancedMesh || !mesh.count) return;
    const original = mesh.instanceMatrix.array.slice();
    const companionOriginal = companion?.instanceMatrix.array.slice() || null;
    const population = { mesh, original, plant, rootOffset, companion, companionOriginal, records: [] };
    this.populations.push(population);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (companion) companion.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < mesh.count; index++) {
      const offset = index * 16, x = original[offset + 12], z = original[offset + 14];
      const record = { population, index, x, z, height: null, compression: null };
      population.records.push(record);
      const key = Math.floor(x / this.terrain.detailSize) + ',' + Math.floor(z / this.terrain.detailSize);
      if (!this.tiles.has(key)) this.tiles.set(key, []);
      this.tiles.get(key).push(record);
    }
    // Soil lowers a root and may shorten its stem. Expand the original bounds
    // once so local updates do not rescan thousands of untouched instances.
    for (const item of [mesh, companion].filter(Boolean)) {
      item.geometry.computeBoundingBox();
      const bounds = item.geometry.boundingBox;
      let maximumScale = 0;
      const matrices = item.instanceMatrix.array;
      for (let i = 0; i < item.count; i++) maximumScale = Math.max(maximumScale, Math.hypot(matrices[i * 16 + 4], matrices[i * 16 + 5], matrices[i * 16 + 6]));
      let attachmentTravel = 0;
      if (item === companion) for (let i = 0; i < Math.min(mesh.count, companion.count); i++) {
        attachmentTravel = Math.max(attachmentTravel, Math.abs(companionOriginal[i * 16 + 13] - original[i * 16 + 13]));
      }
      const margin = 1 + attachmentTravel + maximumScale * Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y));
      item.computeBoundingBox(); item.computeBoundingSphere();
      item.boundingBox.expandByScalar(margin); item.boundingSphere.radius += margin;
    }
  }

  update() {
    const terrain = this.terrain, uploads = new Set();
    this.metrics.sampled = this.metrics.changed = this.metrics.uploads = 0;
    const changed = [];
    if (this.epoch !== terrain.detailEpoch) {
      // Reset changes roots too: a world may have been created while old ruts
      // already existed. Re-sample the restored ground instead of restoring an
      // accidentally deformed initial Y coordinate.
      this.epoch = terrain.detailEpoch; this.revisions.clear();
      for (const population of this.populations) changed.push(...population.records);
    } else {
      for (const [key, tile] of terrain.detailTiles) {
        if (this.revisions.get(key) === tile.revision) continue;
        this.revisions.set(key, tile.revision);
        const records = this.tiles.get(key);
        if (records) changed.push(...records);
      }
    }
    for (const record of changed) {
      const sample = terrain.sample(record.x, record.z);
      this.metrics.sampled++;
      const compression = record.population.plant ? 1 - clamp(sample.compaction || 0, 0, 1) * .91 : 1;
      const height = sample.height + record.population.rootOffset;
      if (record.height === height && record.compression === compression) continue;
      record.height = height; record.compression = compression;
      this._write(record, uploads);
    }
    for (const mesh of uploads) mesh.instanceMatrix.needsUpdate = true;
    this.metrics.uploads = uploads.size;
    this.metrics.totalChanged += this.metrics.changed;
    return this.metrics;
  }

  _write(record, uploads) {
    const { population, index, height, compression } = record;
    const { mesh, original, plant, companion, companionOriginal } = population;
    const offset = index * 16;
    const write = (target, source, rootY, scale) => {
      const data = target.instanceMatrix.array;
      let changed = false;
      for (let axis = 0; axis < 16; axis++) {
        const value = Math.fround(axis === 13 ? rootY : source[offset + axis] * (axis >= 4 && axis <= 6 ? scale : 1));
        if (data[offset + axis] !== value) { data[offset + axis] = value; changed = true; }
      }
      if (changed) {
        uploads.add(target);
        queueAttributeRange(target.instanceMatrix, offset, 16);
        this.metrics.changed++;
      }
    };
    write(mesh, original, height, plant ? compression : 1);
    if (companion && index < companion.count) {
      const attachment = companionOriginal[offset + 13] - original[offset + 13];
      write(companion, companionOriginal, height + attachment * compression, compression);
    }
  }
}
