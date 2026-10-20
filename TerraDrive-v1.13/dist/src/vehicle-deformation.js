import * as THREE from '../vendor/three.module.js';

const clamp = THREE.MathUtils.clamp;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

/** Bake a small instanced tire tread into one CPU-deformable mesh. Rims stay separate. */
export function bakeTreadInstances(instances) {
  const source = instances.geometry, pos = source.attributes.position, normal = source.attributes.normal, index = source.index;
  const positions = [], normals = [], indices = [], matrix = new THREE.Matrix4(), nmatrix = new THREE.Matrix3(), point = new THREE.Vector3();
  for (let instance = 0; instance < instances.count; instance++) {
    instances.getMatrixAt(instance, matrix); nmatrix.getNormalMatrix(matrix);
    const offset = positions.length / 3;
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i).applyMatrix4(matrix); positions.push(point.x, point.y, point.z);
      point.fromBufferAttribute(normal, i).applyMatrix3(nmatrix).normalize(); normals.push(point.x, point.y, point.z);
    }
    if (index) for (const i of index.array) indices.push(i + offset);
    else for (let i = 0; i < pos.count; i++) indices.push(i + offset);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, instances.material); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'deformable-tread';
  instances.geometry.dispose(); return mesh;
}

/**
 * A contact-envelope tire visual, driven by the physics tire state.
 * Rubber vertices are transformed into the non-spinning, steered wheel frame,
 * constrained by the actual support patch, then transformed back before upload.
 * Thus tread rotates through the footprint while the flattened region stays on
 * the ground. Neither the wheel group nor its rigid rim is scaled.
 */
export class TireDeformer {
  constructor(tireSpin, { radius, width, rimRadius }) {
    this.spin = tireSpin; this.radius = radius; this.width = width; this.rimRadius = rimRadius;
    this.meshes = []; this.inverse = new THREE.Quaternion(); this.normal = new THREE.Vector3();
    this.across = new THREE.Vector3(); this.along = new THREE.Vector3(); this.point = new THREE.Vector3(); this.profile = [];
    this.active = false; this.lastKey = ''; this.updates = 0;
    tireSpin.updateWorldMatrix(true, true);
    const inverse = tireSpin.matrixWorld.clone().invert();
    tireSpin.traverse(mesh => {
      if (!mesh.isMesh || mesh.isInstancedMesh) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      mesh.geometry.applyMatrix4(matrix); mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
      if (mesh.parent !== tireSpin) { mesh.parent.remove(mesh); tireSpin.add(mesh); }
      mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage); mesh.geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.18 + width * 0.62);
      this.meshes.push({ mesh, position: mesh.geometry.attributes.position.array.slice(), normal: mesh.geometry.attributes.normal.array.slice() });
    });
  }

  update(data, wheelQuaternion, pressure, damage = 0) {
    pressure = Math.max(0, finite(pressure, 35));
    const radius = Math.max(this.rimRadius * 1.12, finite(data.unloadedRadius, this.radius));
    const load = Math.max(0, finite(data.load));
    const suppliedDeflection = Number.isFinite(data.deflection) ? data.deflection : Number.isFinite(data.radius) ? radius - data.radius : load / (190000 * Math.max(0.15, pressure / 35));
    const deflection = data.contact ? clamp(suppliedDeflection, 0, radius - this.rimRadius * 1.035) : 0;
    const rotation = finite(data.rotation), spin = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (deflection < 0.00015 || !data.contact) {
      if (this.active) for (const entry of this.meshes) {
        const geometry = entry.mesh.geometry; geometry.attributes.position.array.set(entry.position); geometry.attributes.normal.array.set(entry.normal);
        geometry.attributes.position.needsUpdate = true; geometry.attributes.normal.needsUpdate = true;
      }
      this.active = false; this.lastKey = ''; return;
    }
    this.inverse.copy(wheelQuaternion).invert();
    this.normal.set(finite(data.normal?.x), finite(data.normal?.y, 1), finite(data.normal?.z));
    if (this.normal.lengthSq() < 0.1) this.normal.set(0, 1, 0);
    this.normal.normalize().applyQuaternion(this.inverse).normalize();
    this.across.set(1, 0, 0).addScaledVector(this.normal, -this.normal.x).normalize();
    if (this.across.lengthSq() < 0.2) this.across.set(0, 0, 1).cross(this.normal).normalize();
    this.along.crossVectors(this.across, this.normal).normalize();
    const n = this.normal, a = this.across, t = this.along, plane = -radius + deflection;
    const contactLength = Math.max(0.04, finite(data.contactLength, 2 * Math.sqrt(Math.max(0, radius * radius - (radius - deflection) ** 2))));
    const contactWidth = Math.max(this.width * 0.65, finite(data.contactWidth, this.width));
    this.profile.length = 0;
    for (const sample of data.contactProfile || []) {
      if (![sample.x, sample.y, sample.z].every(Number.isFinite)) continue;
      this.point.set(sample.x - data.position.x, sample.y - data.position.y, sample.z - data.position.z).applyQuaternion(this.inverse);
      this.profile.push([this.point.dot(a), this.point.dot(t), clamp(this.point.dot(n), plane - radius * 0.3, plane + radius * 0.24)]);
    }
    const key = [Math.round(deflection * 1600), Math.round(pressure * 8), Math.round(load / 20), Math.round(spin * 900), Math.round(n.x * 1200), Math.round(n.y * 1200), Math.round(n.z * 1200), Math.round(contactLength * 1500), Math.round(contactWidth * 1500), Math.round(damage * 100), ...this.profile.flat().map(value => Math.round(value * 1500))].join(',');
    if (key === this.lastKey) return;
    this.lastKey = key; this.active = true; this.updates++;
    const cos = Math.cos(spin), sin = Math.sin(spin), sidewall = radius - this.rimRadius;
    const bulge = Math.min(this.width * 0.25, Math.max((contactWidth - this.width) * 0.46, deflection * (0.36 + clamp((34 - pressure) / 70, 0, 0.32))));
    const band = Math.max(0.04, sidewall * 0.79 + deflection * 0.35), halfLength = contactLength / 2, halfWidth = contactWidth / 2;
    const profile = this.profile, softness = Math.max(0.00006, (Math.min(contactLength, contactWidth) * 0.045) ** 2);
    const result = [0, 0, 0];
    const deformPoint = (x, y, z) => {
      result[0] = x; result[1] = y; result[2] = z;
      const h = x * n.x + y * n.y + z * n.z;
      if (h > plane + band) return result;
      const across = x * a.x + y * a.y + z * a.z, along = x * t.x + y * t.y + z * t.z;
      let support = plane;
      if (profile.length && Math.abs(along) <= halfLength + 0.045 && Math.abs(across) <= halfWidth + this.width * 0.24) {
        let weight = 0, height = 0;
        for (let i = 0; i < profile.length; i++) {
          const point = profile[i], ds = (point[0] - across) ** 2 + (point[1] - along) ** 2, w = 1 / (ds * ds + softness * softness);
          weight += w; height += point[2] * w;
        }
        support = weight ? height / weight : plane;
      }
      // The contact surface is flat on a flat road, tilted on a slope and follows
      // the sampled support heights at small ridges. Only its neighborhood bulges.
      const penetration = support - h, transition = 0.005;
      const lift = penetration >= transition ? penetration : penetration > -transition ? (penetration + transition) ** 2 / (4 * transition) : 0;
      const radial = Math.hypot(y, z), beadFade = smooth((radial - this.rimRadius * 1.025) / Math.max(0.025, sidewall * 0.42));
      const shoulder = smooth((Math.abs(x) - this.width * 0.24) / (this.width * 0.255));
      const near = smooth((support + band - h) / band);
      const sideways = Math.sign(x) * bulge * shoulder * beadFade * near;
      const wrinkle = damage > 0.4 ? Math.sin(Math.atan2(z, y) * 17 + x * 48) * (damage - 0.4) * 0.009 * shoulder * near * beadFade : 0;
      result[0] = x + n.x * lift * beadFade + a.x * (sideways + wrinkle);
      result[1] = y + n.y * lift * beadFade + a.y * (sideways + wrinkle);
      result[2] = z + n.z * lift * beadFade + a.z * (sideways + wrinkle);
      return result;
    };
    for (const entry of this.meshes) {
      const geometry = entry.mesh.geometry, p = geometry.attributes.position.array, base = entry.position;
      for (let i = 0; i < base.length; i += 3) {
        const y = base[i + 1] * cos - base[i + 2] * sin, z = base[i + 1] * sin + base[i + 2] * cos;
        const point = deformPoint(base[i], y, z);
        p[i] = point[0]; p[i + 1] = point[1] * cos + point[2] * sin; p[i + 2] = -point[1] * sin + point[2] * cos;
      }
      geometry.attributes.position.needsUpdate = true; geometry.computeVertexNormals();
    }
    this.metrics = { deflection, pressure, load, bulge, contactLength, contactWidth, supportSamples: profile.length };
  }
}

/** Per-vertex wear also extinguishes only the locally broken portion of a lamp. */
function installDamageMaterial(material, breakable = false) {
  if (material.userData.vehicleDamage) return;
  material.userData.vehicleDamage = { breakable };
  material.vertexColors = true;
  material.defaultAttributeValues = { color: [1, 1, 1], tdDamage: [0], uv: [0, 0], uv1: [0, 0] };
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float tdDamage;\nvarying float vTdDamage;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTdDamage = tdDamage;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTdDamage;').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.98, clamp(vTdDamage * 0.9, 0.0, 1.0));').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - smoothstep(0.12, 0.67, vTdDamage);');
    if (breakable && material.transparent) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(0.68, 0.98, vTdDamage) * 0.62;');
    // Clear glazing has negligible diffuse scattering. Opacity remains the
    // lightweight tint approximation; the dielectric specular lobe supplies
    // reflections without the opaque plastic-like veil over the cabin.
    if (material.userData.vehicleGlass || material.userData.vehicleLampLens) {
      const scattering = material.userData.vehicleTintedLens ? '0.42' : '0.04';
      shader.fragmentShader = shader.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', `vec3 outgoingLight = totalDiffuse * ${scattering} + totalSpecular + totalEmissiveRadiance;`);
      // Three takes the environment intensity from scene.environment when no
      // explicit material envMap is bound. Scale the actual IBL evaluation so
      // this glazing response survives that override and still follows weather.
      const intensity = material.userData.vehicleLampLens ? '0.50' : '0.25';
      const glassEnvironment=THREE.ShaderChunk.envmap_physical_pars_fragment.replace(/\* envMapIntensity/g,`* envMapIntensity * ${intensity}`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',glassEnvironment);
    }
  };
  material.customProgramCacheKey = () => `terra-local-damage-v5-${breakable ? 1 : 0}-${material.userData.vehicleGlass ? 'glass' : material.userData.vehicleTintedLens ? 'tinted-lens' : material.userData.vehicleLampLens ? 'lens' : 'solid'}`;
  material.needsUpdate = true;
}

const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function randomGenerator(seed) { let n = seed; return () => { n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; }; }

/** Permanent local mesh deformation, rebuilt from pristine data on each damage revision. */
export class BodyDamage {
  constructor(body, materials) {
    this.body = body; this.entries = []; this.revision = null; this.lastProfile = null;
    this.maxDamageRadius = Math.max(1.35, new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).length());
    this.raycaster = new THREE.Raycaster(); this.group = new THREE.Group(); this.group.name = 'permanent-impact-scuffs'; body.add(this.group);
    this.scuffMaterial = new THREE.MeshStandardMaterial({ color: '#343332', roughness: 0.99, metalness: 0.08, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    this.scratchMaterial = new THREE.MeshStandardMaterial({ color: '#a3a6a3', roughness: 0.74, metalness: 0.65, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
    this.crackMaterial = new THREE.MeshStandardMaterial({ color: '#bbc5c8', roughness: 0.66, metalness: 0.06, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
    const breakable = new Set([materials.glass, materials.lens, materials.white, materials.red, materials.reverse, materials.amber, ...Object.values(materials).filter(material => material.userData.vehicleGlass || material.userData.vehicleLampLens || material.userData.vehicleLightEmitter)]);
    const excluded = new Set([materials.rubber, materials.tread, materials.interior, materials.brakeDisc, ...Object.values(materials).filter(material => material.userData.vehicleInterior)]);
    body.traverse(mesh => {
      if (!mesh.isMesh || mesh.isInstancedMesh || excluded.has(mesh.material)) return;
      const geometry = mesh.geometry, positions = geometry.attributes.position;
      if (!positions) return;
      const colors = new Float32Array(positions.count * 3); colors.fill(1);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('tdDamage', new THREE.BufferAttribute(new Float32Array(positions.count), 1).setUsage(THREE.DynamicDrawUsage));
      positions.setUsage(THREE.DynamicDrawUsage); geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
      installDamageMaterial(mesh.material, breakable.has(mesh.material));
      this.entries.push({ mesh, position: positions.array.slice(), normal: geometry.attributes.normal.array.slice(), breakable: breakable.has(mesh.material) });
    });
  }

  _clearMarks() {
    while (this.group.children.length) { const mesh = this.group.children[0]; this.group.remove(mesh); mesh.geometry.dispose(); }
  }

  _project(point, normal, radius = 0.45, onlyBreakable = false) {
    const origin = point.clone().addScaledVector(normal, radius + 0.16).applyMatrix4(this.body.matrixWorld);
    const direction = normal.clone().transformDirection(this.body.matrixWorld).negate();
    this.raycaster.set(origin, direction); this.raycaster.near = 0; this.raycaster.far = radius * 2.5 + 0.36;
    const candidates = this.localRayMeshes || this.entries.map(entry => entry.mesh);
    const hits = this.raycaster.intersectObjects(onlyBreakable ? candidates.filter(mesh => mesh.material.userData.vehicleDamage?.breakable) : candidates, false);
    if (!hits.length) return null;
    const hit = hits[0], local = this.body.worldToLocal(hit.point.clone());
    return { point: local, mesh: hit.object.userData.sourceMesh || hit.object, breakable: !!hit.object.material.userData.vehicleDamage?.breakable };
  }

  update(profile) {
    if (!profile || profile.revision === this.revision && profile === this.lastProfile) return;
    // Revision is authoritative; repeated simulation frames never re-dent geometry.
    if (profile.revision === this.revision && profile.revision !== undefined) { this.lastProfile = profile; return; }
    this.revision = profile.revision; this.lastProfile = profile; this._clearMarks();
    for (const entry of this.entries) {
      const geometry = entry.mesh.geometry; geometry.attributes.position.array.set(entry.position); geometry.attributes.normal.array.set(entry.normal);
      geometry.attributes.color.array.fill(1); geometry.attributes.tdDamage.array.fill(0);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    }
    this.body.updateWorldMatrix(true, true);
    const dents = (profile.dents || []).slice(-32).map((dent, index) => {
      const rawPoint = dent.point || dent.localPoint, rawNormal = dent.normal || dent.localNormal;
      if (!rawPoint || !rawNormal || ![rawPoint.x, rawPoint.y, rawPoint.z, rawNormal.x, rawNormal.y, rawNormal.z].every(Number.isFinite)) return null;
      const point = new THREE.Vector3(rawPoint.x, rawPoint.y, rawPoint.z).sub(this.body.position), normal = new THREE.Vector3(rawNormal.x, rawNormal.y, rawNormal.z).normalize();
      if (normal.lengthSq() < 0.5) return null;
      const radius = clamp(finite(dent.radius, 0.35), 0.08, this.maxDamageRadius), depth = clamp(finite(dent.depth), 0, 0.52), severity = clamp(finite(dent.severity, depth / 0.18), 0, 1);
      const surface = this._project(point, normal, radius);
      if (surface && surface.point.distanceTo(point) < radius * 1.9) point.copy(surface.point);
      const tangent = new THREE.Vector3(0, 1, 0).cross(normal); if (tangent.lengthSq() < 0.1) tangent.set(1, 0, 0); tangent.normalize();
      const vertical = normal.clone().cross(tangent).normalize();
      return { point, normal, radius, depth, severity, tangent, vertical, seed: hash(dent.id ?? index), breakable: surface?.breakable };
    }).filter(Boolean);
    let changedVertices = 0;
    for (const entry of this.entries) {
      const geometry = entry.mesh.geometry, p = geometry.attributes.position.array, color = geometry.attributes.color.array, mask = geometry.attributes.tdDamage.array;
      let changed = false;
      for (let i = 0; i < p.length; i += 3) {
        let dx = 0, dy = 0, dz = 0, wear = 0;
        for (const dent of dents) {
          const x = entry.position[i] - dent.point.x, y = entry.position[i + 1] - dent.point.y, z = entry.position[i + 2] - dent.point.z;
          const normalDistance = x * dent.normal.x + y * dent.normal.y + z * dent.normal.z;
          const distance2 = x * x + y * y + z * z + normalDistance * normalDistance * 1.2;
          const r2 = distance2 / (dent.radius * dent.radius); if (r2 >= 1) continue;
          const falloff = (1 - r2) ** 2, u = x * dent.tangent.x + y * dent.tangent.y + z * dent.tangent.z, v = x * dent.vertical.x + y * dent.vertical.y + z * dent.vertical.z;
          const crease = 1 + dent.severity * 0.24 * Math.sin(u / dent.radius * 14 + dent.seed % 11) * Math.sin(v / dent.radius * 11);
          const displacement = dent.depth * falloff * crease * (entry.breakable ? 0.47 : 1);
          dx -= dent.normal.x * displacement; dy -= dent.normal.y * displacement; dz -= dent.normal.z * displacement;
          wear = Math.max(wear, dent.severity * falloff * 1.5);
        }
        if (wear <= 0 && dx === 0 && dy === 0 && dz === 0) continue;
        p[i] += dx; p[i + 1] += dy; p[i + 2] += dz; changed = true; changedVertices++;
        const w = clamp(wear, 0, 1), shade = entry.breakable ? 1 - w * 0.74 : 1 - w * 0.40;
        color[i] = shade; color[i + 1] = shade; color[i + 2] = shade; mask[i / 3] = w;
      }
      geometry.attributes.position.needsUpdate = true; geometry.attributes.normal.needsUpdate = true; geometry.attributes.color.needsUpdate = true; geometry.attributes.tdDamage.needsUpdate = true;
      if (changed) geometry.computeVertexNormals();
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    }
    this.body.updateWorldMatrix(true, true);
    this._makeMarks(dents); this.metrics = { dents: dents.length, changedVertices, markMeshes: this.group.children.length };
  }

  _localProjectionMeshes(dent) {
    const meshes = [], r = dent.radius * 1.6 + 0.18, c = dent.point;
    for (const entry of this.entries) {
      const source = entry.mesh.geometry, p = source.attributes.position.array, indices = source.index?.array, selected = [];
      for (let i = 0; i < (indices?.length || p.length / 3); i += 3) {
        const a = (indices ? indices[i] : i) * 3, b = (indices ? indices[i + 1] : i + 1) * 3, d = (indices ? indices[i + 2] : i + 2) * 3;
        if (Math.max(p[a], p[b], p[d]) < c.x - r || Math.min(p[a], p[b], p[d]) > c.x + r || Math.max(p[a + 1], p[b + 1], p[d + 1]) < c.y - r || Math.min(p[a + 1], p[b + 1], p[d + 1]) > c.y + r || Math.max(p[a + 2], p[b + 2], p[d + 2]) < c.z - r || Math.min(p[a + 2], p[b + 2], p[d + 2]) > c.z + r) continue;
        selected.push(a / 3, b / 3, d / 3);
      }
      if (!selected.length) continue;
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', source.attributes.position); geometry.setIndex(selected);
      geometry.boundingSphere = new THREE.Sphere(c, r * 2.0);
      const proxy = new THREE.Mesh(geometry, entry.mesh.material); proxy.matrixWorld.copy(entry.mesh.matrixWorld); proxy.userData.sourceMesh = entry.mesh; meshes.push(proxy);
    }
    return meshes;
  }

  _makeMarks(dents) {
    const buffers = { scuff: [], scratch: [], crack: [] };
    const ribbon = (a, b, normal, width, target) => {
      const across = b.clone().sub(a).cross(normal).normalize().multiplyScalar(width / 2);
      const offset = normal.clone().multiplyScalar(0.0026);
      const points = [a.clone().add(across).add(offset), a.clone().sub(across).add(offset), b.clone().add(across).add(offset), b.clone().sub(across).add(offset)];
      for (const i of [0, 1, 2, 2, 1, 3]) target.push(points[i].x, points[i].y, points[i].z);
    };
    for (const dent of dents) {
      if (dent.severity < 0.06) continue;
      this.localRayMeshes?.forEach(mesh => mesh.geometry.dispose());
      this.localRayMeshes = this._localProjectionMeshes(dent);
      const random = randomGenerator(dent.seed), point = (u, v) => dent.point.clone().addScaledVector(dent.tangent, u).addScaledVector(dent.vertical, v);
      for (let i = 0; i < 4 + Math.floor(dent.severity * 7); i++) {
        const u = (random() - 0.5) * dent.radius, v = (random() - 0.5) * dent.radius * 1.08, length = dent.radius * (0.15 + random() * 0.61), slope = (random() - 0.5) * 0.15;
        const a = this._project(point(u - length / 2, v), dent.normal, dent.radius), b = this._project(point(u + length / 2, v + slope), dent.normal, dent.radius);
        if (!a || !b || a.point.distanceTo(b.point) > length * 2) continue;
        ribbon(a.point, b.point, dent.normal, 0.008 + random() * 0.024 * dent.severity, buffers.scuff);
        if (!a.breakable && !b.breakable) ribbon(a.point, b.point, dent.normal, 0.0018 + random() * 0.0035, buffers.scratch);
      }
      // Fractures are projected onto actual glazing/lenses near the impact, rather
      // than splashing a generic crack across unrelated paint or all headlights.
      const brokenCenter = this._project(dent.point, dent.normal, dent.radius, true);
      if (!brokenCenter || brokenCenter.point.distanceTo(dent.point) > dent.radius * 0.8) { this.localRayMeshes.forEach(mesh => mesh.geometry.dispose()); this.localRayMeshes = null; continue; }
      for (let ray = 0; ray < 7 + Math.floor(dent.severity * 5); ray++) {
        const angle = ray * Math.PI * 2 / 9 + random() * 0.35, extent = dent.radius * (0.25 + random() * 0.53);
        let previous = brokenCenter.point;
        for (let step = 1; step <= 3; step++) {
          const radial = extent * step / 3, jitter = (random() - 0.5) * 0.05;
          const sample = this._project(point(Math.cos(angle + jitter) * radial, Math.sin(angle + jitter) * radial), dent.normal, dent.radius, true);
          if (!sample) break;
          ribbon(previous, sample.point, dent.normal, 0.0015 + dent.severity * 0.0016, buffers.crack); previous = sample.point;
        }
      }
    }
    this.localRayMeshes?.forEach(mesh => mesh.geometry.dispose()); this.localRayMeshes = null;
    for (const [key, material] of [['scuff', this.scuffMaterial], ['scratch', this.scratchMaterial], ['crack', this.crackMaterial]]) {
      if (!buffers[key].length) continue;
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers[key], 3)); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `collision-${key}`; mesh.renderOrder = 2; this.group.add(mesh);
    }
  }

  dispose() { this._clearMarks(); this.body.remove(this.group); this.scuffMaterial.dispose(); this.scratchMaterial.dispose(); this.crackMaterial.dispose(); this.entries.length = 0; }
}
