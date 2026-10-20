import * as THREE from '../vendor/three.module.js';

/** Shared studio setup used by the live garage and native model review. */
export const STUDIO_LIGHTING = Object.freeze({
  environmentWidth: 512, environmentHeight: 256, exposure: 1.04,
  environmentIntensity: .80,
  ambient: { sky: '#dbe7f0', ground: '#707880', intensity: 1.05 },
  key: { color: '#fff3e6', intensity: 3.3, position: [4.5, 7, 5.5] },
  fill: { color: '#d7e6fa', intensity: 1.15, position: [-5, 3, 3] },
  rim: { color: '#e8efff', intensity: 2.0, position: [-2.5, 5, -5] },
});

const smooth = (a, b, value) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Linear HDR light banks, stored as filterable half-float rather than 8-bit paint. */
export function createStudioEnvironmentTexture() {
  const width = STUDIO_LIGHTING.environmentWidth, height = STUDIO_LIGHTING.environmentHeight;
  const data = new Uint16Array(width * height * 4);
  const banks = [
    { phi: .72, elevation: .76, width: .61, height: .26, power: 10.0, color: [1, .93, .82] },
    { phi: 2.53, elevation: .55, width: .33, height: .57, power: 4.8, color: [.80, .89, 1] },
    { phi: -1.68, elevation: .84, width: .65, height: .20, power: 8.2, color: [.89, .94, 1] },
    { phi: -.37, elevation: 1.38, width: .72, height: .13, power: 3.4, color: [1, 1, .97] },
  ];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const phi = (x + .5) / width * Math.PI * 2 - Math.PI;
    // Three's equirectUv uses asin(direction.y) / PI + .5, and raw data is not flipped.
    const elevation = -Math.PI / 2 + (y + .5) / height * Math.PI;
    const upper = smooth(-.18, .70, elevation);
    const color = [.065 + .32 * upper, .079 + .36 * upper, .093 + .42 * upper];
    for (const bank of banks) {
      const longitude = Math.abs(Math.atan2(Math.sin(phi - bank.phi), Math.cos(phi - bank.phi)));
      const latitude = Math.abs(elevation - bank.elevation);
      const weight = (1 - smooth(bank.width * .88, bank.width, longitude)) * (1 - smooth(bank.height * .78, bank.height, latitude));
      for (let channel = 0; channel < 3; channel++) color[channel] += weight * bank.power * bank.color[channel];
    }
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) data[offset + channel] = THREE.DataUtils.toHalfFloat(color[channel]);
    data[offset + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = 'Terra studio softboxes';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function addStudioLights(scene) {
  const setup = STUDIO_LIGHTING;
  const ambient = new THREE.HemisphereLight(setup.ambient.sky, setup.ambient.ground, setup.ambient.intensity);
  scene.add(ambient);
  const lights = { ambient };
  for (const name of ['key', 'fill', 'rim']) {
    const record = setup[name], light = new THREE.DirectionalLight(record.color, record.intensity);
    light.position.set(...record.position); scene.add(light); lights[name] = light;
  }
  const shadow = lights.key.shadow;
  lights.key.castShadow = true;
  shadow.mapSize.set(1024, 1024);
  Object.assign(shadow.camera, { left: -4.8, right: 4.8, top: 4.8, bottom: -4.8, near: .1, far: 25 });
  shadow.camera.updateProjectionMatrix();
  shadow.bias = -.00012; shadow.normalBias = .035; shadow.radius = 3;
  return lights;
}

/** Measure vehicle meshes, including detached wheel rigs, without the shadow catcher. */
export function measureShowroomVehicle(scene) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  scene.traverse(object => {
    if (!object.isMesh || !object.visible) return;
    for (let node = object; node; node = node.parent) if (node.userData.excludeFromVehicleBounds || !node.visible) return;
    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (object.isInstancedMesh) {
      if (!object.boundingBox) object.computeBoundingBox();
      bounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
    } else bounds.union(geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, 0, -2), new THREE.Vector3(1, 2, 2));
  return { bounds, center: bounds.getCenter(new THREE.Vector3()), size: bounds.getSize(new THREE.Vector3()) };
}

export function createShowroomShadow(scene, bounds) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.ShadowMaterial({ color: '#19252d', opacity: .24, depthWrite: false }));
  ground.name = 'studio-contact-shadow';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = Math.min(0, bounds?.min.y ?? 0) - .004;
  ground.receiveShadow = true;
  ground.userData.excludeFromVehicleBounds = true;
  scene.add(ground); return ground;
}
