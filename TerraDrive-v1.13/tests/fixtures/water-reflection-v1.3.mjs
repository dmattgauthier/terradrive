// Negative temporal fixture copied from world.js at 96739979238bc966cf4c6871e33d5c1614e854c8.
// Keep the old shared-normal alias isolated here, never in the runtime module.
// Both the unit regression and native scene replay must reproduce its failure.
export function createLegacyWaterReflectionCamera(THREE) {
  const UP = new THREE.Vector3(0, 1, 0);
  return function legacyWaterReflectionCamera(body, camera) {
    camera.updateMatrixWorld(true); const mirror = body.reflectionCamera, direction = new THREE.Vector3(); camera.getWorldDirection(direction);
    mirror.position.copy(camera.position); mirror.position.y = 2 * body.level - camera.position.y;
    const target = camera.position.clone().add(direction); target.y = 2 * body.level - target.y;
    mirror.up.copy(camera.up).applyQuaternion(camera.quaternion); mirror.up.y *= -1; mirror.lookAt(target); mirror.far = camera.far; mirror.near = camera.near; mirror.updateMatrixWorld(true); mirror.projectionMatrix.copy(camera.projectionMatrix);
    body.reflectionMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    const plane = new THREE.Plane(UP, -body.level).applyMatrix4(mirror.matrixWorldInverse), clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant), p = mirror.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    const denominator = clip.dot(q); if (Math.abs(denominator) > 1e-7) { clip.multiplyScalar(2 / denominator); p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1 - .002; p[14] = clip.w; }
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert(); return mirror;
  };
}
