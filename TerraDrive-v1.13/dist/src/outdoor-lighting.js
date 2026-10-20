import * as THREE from '../vendor/three.module.js';

// Solar centroids measured from the original FloatType-decoded HDRs. The
// precision makes the alignment reproducible; the 1K source pixels themselves
// have approximately 0.18 degree half-pixel angular resolution.
export const OUTDOOR_LIGHTING = Object.freeze({
  day: Object.freeze({
    id: 'day', filename: 'kiara_5_noon_1k.hdr',
    sourceSun: Object.freeze([.4658928787051369, .7792539295876383, .4191743536931434]),
    worldXZ: Object.freeze([-80, -85]),
  }),
  sunset: Object.freeze({
    id: 'sunset', filename: 'syferfontein_18d_clear_1k.hdr',
    sourceSun: Object.freeze([.769130975556666, .31486604897418247, .5561446876871511]),
    worldXZ: Object.freeze([-120, -75]),
  }),
});

export function outdoorPreset(time = 'day') { return OUTDOOR_LIGHTING[time] || OUTDOOR_LIGHTING.day; }

export function outdoorSunOffset(time = 'day') {
  const { sourceSun, worldXZ } = outdoorPreset(time), horizontal = Math.hypot(...worldXZ);
  return new THREE.Vector3(worldXZ[0], horizontal * sourceSun[1] / Math.hypot(sourceSun[0], sourceSun[2]), worldXZ[1]);
}

export function outdoorEnvironmentYaw(preset, worldSun) {
  // The vendored Three renderer negates scene.environmentRotation to build
  // the PMREM lookup matrix. Yaw only keeps the photographed horizon level.
  const angle = Math.atan2(worldSun.x, worldSun.z) - Math.atan2(preset.sourceSun[0], preset.sourceSun[2]);
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function prepareOutdoorRadiance(texture, preset) {
  const { data, width, height } = texture.image;
  if (!(data instanceof Float32Array) || texture.type !== THREE.FloatType || data.length !== width * height * 4) throw new Error('Outdoor lighting needs an unclipped FloatType HDR decode.');
  const result = new Uint16Array(data.length), sun = preset.sourceSun, cone = Math.cos(3 * Math.PI / 180);
  let adjusted = 0, peakBefore = 0, peakAfter = 0;
  for (let y = 0; y < height; y++) {
    const elevation = (.5 - (y + .5) / height) * Math.PI, sy = Math.sin(elevation), horizontal = Math.cos(elevation);
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4, r = data[index], g = data[index + 1], b = data[index + 2];
      const luminance = .2126 * r + .7152 * g + .0722 * b;
      let gain = 1;
      if (luminance > 32) {
        const azimuth = ((x + .5) / width - .5) * Math.PI * 2;
        const dot = Math.cos(azimuth) * horizontal * sun[0] + sy * sun[1] + Math.sin(azimuth) * horizontal * sun[2];
        if (dot > cone) {
          // The directional light owns direct sun, its specular highlight and
          // shadows. Compress only the tiny solar core before PMREM so that
          // the HDR does not add a second, unshadowed sun. All ordinary sky,
          // clouds and landscape radiance is retained, along with RGB ratios.
          const bounded = 32 + 96 * (1 - Math.exp(-(luminance - 32) / 96));
          gain = bounded / luminance; adjusted++;
        }
      }
      peakBefore = Math.max(peakBefore, luminance); peakAfter = Math.max(peakAfter, luminance * gain);
      result[index] = THREE.DataUtils.toHalfFloat(r * gain);
      result[index + 1] = THREE.DataUtils.toHalfFloat(g * gain);
      result[index + 2] = THREE.DataUtils.toHalfFloat(b * gain);
      result[index + 3] = THREE.DataUtils.toHalfFloat(data[index + 3]);
    }
  }
  // Half-float filtering follows the established WebGL2 path. Only the CPU
  // decode needs full float precision, to avoid clipping the original sun's
  // channels separately before the radiance calculation.
  texture.image.data = result; texture.type = THREE.HalfFloatType; texture.needsUpdate = true;
  const statistics = { source: preset.filename, pixels: width * height, adjustedPixels: adjusted, peakLuminanceBefore: peakBefore, peakLuminanceAfter: peakAfter, solarConeDegrees: 3, solarCoreKnee: 32, solarCoreLimit: 128 };
  texture.userData.outdoorRadiance = statistics;
  return statistics;
}
