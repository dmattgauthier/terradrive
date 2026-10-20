import * as THREE from '../vendor/three.module.js';
import { WINCH_SPEC } from './winch.js?v=1.15.0';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const SEGMENTS = 64, SIDES = 6;

/** Bounded reusable cable mesh. The steel core is world-sized; a fine contrasting
 * line keeps it legible in a chase camera without turning it into a thick hose.
 */
export class WinchView {
  constructor(scene, terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group(); this.group.name = 'Tree-anchored recovery cable';
    this.group.visible = false; scene.add(this.group);
    this.points = Array.from({ length: SEGMENTS + 1 }, () => new THREE.Vector3());
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * SIDES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * SIDES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const indices = [];
    for (let i = 0; i < SEGMENTS; i++) for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j, b = i * SIDES + (j + 1) % SIDES, c = a + SIDES, d = b + SIDES;
      indices.push(a, c, b, b, c, d);
    }
    this.geometry.setIndex(indices);
    this.cable = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial({ color: '#b6b3a9', metalness: .82, roughness: .32 }));
    this.cable.frustumCulled = false; this.cable.castShadow = true; this.group.add(this.cable);
    this.lineGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.line = new THREE.Line(this.lineGeometry, new THREE.LineBasicMaterial({ color: '#bcb7a7', transparent: true, opacity: .66 }));
    this.line.frustumCulled = false; this.group.add(this.line);
    const strapGeometry = new THREE.CylinderGeometry(1, 1, .10, 28, 1, true);
    this.strap = new THREE.Mesh(strapGeometry, new THREE.MeshStandardMaterial({ color: '#d17b30', roughness: .86, side: THREE.DoubleSide }));
    this.group.add(this.strap);
    this.shackle = new THREE.Mesh(new THREE.TorusGeometry(.065, .016, 7, 16), new THREE.MeshStandardMaterial({ color: '#c4c7c6', metalness: .7, roughness: .28 }));
    this.group.add(this.shackle);
    this.damper = new THREE.Mesh(new THREE.BoxGeometry(.28, .30, .035), new THREE.MeshStandardMaterial({ color: '#d4943d', roughness: .95, side: THREE.DoubleSide }));
    this.group.add(this.damper);
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(.7, .035, 6, 40), new THREE.MeshBasicMaterial({ color: '#d8ba65', depthTest: true, transparent: true, opacity: .9 }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.visible = false; scene.add(this.marker);
    this._tangent = new THREE.Vector3(); this._normal = new THREE.Vector3(); this._side = new THREE.Vector3();
  }

  update(state, candidate = null) {
    this.group.visible = !!state?.attached;
    this.marker.visible = !state?.attached && !!state?.equipped && !!candidate;
    if (this.marker.visible) {
      const center = candidate.center;
      this.marker.position.set(center.x, (this.terrain.heightAt?.(center.x, center.z) ?? center.y) + .045, center.z);
      this.marker.material.color.set(candidate.available ? '#d8ba65' : '#bd6651');
    }
    if (!state?.attached) return;
    const start = state.hook, end = state.anchor;
    const excess = Math.max(0, state.ropeLength - state.distance);
    const sag = clamp(Math.sqrt(Math.max(.002, excess) * Math.max(1, state.distance) * .35), .016, 2.8) * (1 - clamp(state.tension / 6500, 0, .985));
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const p = this.points[i].set(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t - Math.sin(Math.PI * t) * sag, start.z + (end.z - start.z) * t);
      if (i && i < SEGMENTS) p.y = Math.max(p.y, (this.terrain.heightAt?.(p.x, p.z) ?? this.terrain.sample(p.x, p.z).height) + WINCH_SPEC.ropeDiameter * .6);
    }
    const positions = this.geometry.attributes.position, normals = this.geometry.attributes.normal, line = this.lineGeometry.attributes.position;
    for (let i = 0; i <= SEGMENTS; i++) {
      const p = this.points[i]; line.setXYZ(i, p.x, p.y, p.z);
      this._tangent.subVectors(this.points[Math.min(SEGMENTS, i + 1)], this.points[Math.max(0, i - 1)]).normalize();
      this._side.crossVectors(this._tangent, UP);
      if (this._side.lengthSq() < .0001) this._side.set(1, 0, 0);
      this._side.normalize(); this._normal.crossVectors(this._side, this._tangent).normalize();
      for (let j = 0; j < SIDES; j++) {
        const angle = j / SIDES * Math.PI * 2, a = Math.cos(angle), b = Math.sin(angle);
        const nx = this._side.x * a + this._normal.x * b, ny = this._side.y * a + this._normal.y * b, nz = this._side.z * a + this._normal.z * b;
        const r = WINCH_SPEC.ropeDiameter * .5, index = i * SIDES + j;
        positions.setXYZ(index, p.x + nx * r, p.y + ny * r, p.z + nz * r); normals.setXYZ(index, nx, ny, nz);
      }
    }
    positions.needsUpdate = true; normals.needsUpdate = true; line.needsUpdate = true;
    this.strap.position.set(state.treeCenter.x, end.y, state.treeCenter.z);
    this.strap.scale.set(state.treeRadius + .027, 1, state.treeRadius + .027);
    this.shackle.position.set(end.x, end.y, end.z); this.shackle.lookAt(start.x, start.y, start.z);
    this.damper.position.copy(this.points[Math.round(SEGMENTS * .48)]);
    const damperGround = this.terrain.heightAt?.(this.damper.position.x, this.damper.position.z) ?? this.terrain.sample(this.damper.position.x, this.damper.position.z).height;
    const hanging = this.damper.position.y > damperGround + .32;
    this.damper.position.y = hanging ? this.damper.position.y - .14 : damperGround + .025;
    this.damper.rotation.x = hanging ? 0 : -Math.PI / 2;
    this.damper.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
  }

  dispose() {
    this.group.removeFromParent(); this.marker.removeFromParent();
    this.group.traverse(item => { item.geometry?.dispose(); item.material?.dispose(); });
    this.marker.geometry.dispose(); this.marker.material.dispose();
  }
}
