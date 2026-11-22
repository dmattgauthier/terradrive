// Use the same row-X, column-Y elevations as the native tire contact field.
// Green in TerrainTrail encodes sheltered hollows (>128) and convex ridges
// (<128). Blue encodes the upwind horizon along the existing snow/dune axis.
export function bakeLandform(heights, size, spacing) {
  if (!Number.isInteger(size) || size < 2 || heights.length !== size * size || !(spacing > 0))
    throw new RangeError('Invalid terrain size or spacing');

  const stride = size + 1;
  const sums = new Float64Array(stride * stride);
  for (let x = 0; x < size; x++) {
    let rowSum = 0;
    for (let y = 0; y < size; y++) {
      rowSum += heights[x * size + y];
      sums[(x + 1) * stride + y + 1] = sums[x * stride + y + 1] + rowSum;
    }
  }

  // Keep the windows symmetric even on the edge. A uniformly tilted plane
  // then has exactly neutral relative elevation at every sample.
  function mean(x, y, radius) {
    const rx = Math.min(radius, x, size - 1 - x);
    const ry = Math.min(radius, y, size - 1 - y);
    const top = (x - rx) * stride, bottom = (x + rx + 1) * stride;
    const left = y - ry, right = y + ry + 1;
    return (sums[bottom + right] - sums[top + right] - sums[bottom + left] + sums[top + left])
      / ((rx * 2 + 1) * (ry * 2 + 1));
  }

  const smallRadius = Math.max(1, Math.round(3 / spacing));
  const broadRadius = Math.max(1, Math.round(12 / spacing));
  const horizon = [4, 10, 19].map(metres => {
    const dx = Math.round(.94 * metres / spacing);
    const dy = Math.round(.342 * metres / spacing);
    return {dx, dy, distance: Math.hypot(dx, dy) * spacing};
  }).filter(sample => sample.distance > 0);

  const position = new Uint8Array(heights.length);
  const shelter = new Uint8Array(heights.length);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const i = x * size + y, h = heights[i];
      const floor = (mean(x, y, smallRadius) - h) / .25;
      const basin = (mean(x, y, broadRadius) - h) / 1.15;
      const hollow = Math.max(-1, Math.min(1, .46 * floor + .54 * basin));
      position[i] = 128 + Math.round(127 * hollow);
      let steepest = 0;
      for (const {dx, dy, distance} of horizon) {
        if (x + dx >= size || y + dy >= size) continue;
        steepest = Math.max(steepest, (heights[(x + dx) * size + y + dy] - h) / distance);
      }
      const lee = Math.min(1, Math.max(0, (steepest - .025) / .33));
      shelter[i] = Math.round(255 * lee * lee * (3 - 2 * lee));
    }
  }
  return {position, shelter};
}
