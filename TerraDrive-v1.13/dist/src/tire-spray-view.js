import * as THREE from '../vendor/three.module.js';
import { TireSpray } from './tire-spray.js?v=1.15.0';
import { VehicleSprayCollider } from './particle-vehicle-collision.js?v=1.15.0';
import { TireImpactMarks } from './tire-impact-marks.js?v=1.15.0';

/** Actual solid clods and elongated glossy drops, separate from soft dust. */
export class TireSprayView {
  constructor(scene, terrain) {
    this.terrain = terrain; this.simulation = new TireSpray();
    this.impactMarks = new TireImpactMarks(scene);
    this.group = new THREE.Group(); this.group.name = 'tire-mud-and-water-ejecta'; scene.add(this.group);
    const capacity = this.simulation.capacity;
    const clod = new THREE.IcosahedronGeometry(1, 0), points = clod.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
      const distortion = .88 + .14 * Math.sin(x * 13.7 + y * 5.3 + z * 17.1);
      points.setXYZ(i, x * distortion, y * distortion, z * distortion);
    }
    clod.computeVertexNormals();
    this.mud = new THREE.InstancedMesh(clod, new THREE.MeshStandardMaterial({ color: '#5a402a', roughness: .64, flatShading: true }), capacity);
    // Smooth liquid parcels catch curved highlights; solid clods retain the
    // faceted silhouette. Each parcel represents a visible splash cluster,
    // not an individually resolved millimetre-scale physical droplet.
    this.water = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .17, metalness: .05, transparent: true, opacity: .68, depthWrite: false }), capacity);
    this.mud.name = 'ballistic-mud-clods'; this.water.name = 'ballistic-water-drops';
    this.water.renderOrder = 4;
    this.snow = new THREE.InstancedMesh(clod.clone(), new THREE.MeshStandardMaterial({ color: '#e2eef5', roughness: .96, transparent: true, opacity: .88, depthWrite: false }), capacity);
    this.snow.name = 'ballistic-snow-powder';
    this.sand = new THREE.InstancedMesh(clod.clone(), new THREE.MeshStandardMaterial({ color: '#c6ad7e', roughness: .93, flatShading: true }), capacity);
    this.sand.name = 'ballistic-sand-grains';
    const puff = new THREE.PlaneGeometry(1, 1), fineCapacity = capacity + this.simulation.fines.length;
    puff.setAttribute('aPuffAlpha', new THREE.InstancedBufferAttribute(new Float32Array(fineCapacity), 1).setUsage(THREE.DynamicDrawUsage));
    const haze = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    haze.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float aPuffAlpha; varying float vPuffAlpha; varying vec2 vPuffUV;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPuffUV=uv; vPuffAlpha=aPuffAlpha;');
      shader.fragmentShader = 'varying float vPuffAlpha; varying vec2 vPuffUV;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        vec2 puffPoint=vPuffUV*2.-1.; float puffRadius=length(puffPoint);
        float puffBreak=.90+.10*sin(puffPoint.x*17.+sin(puffPoint.y*13.)*2.);
        diffuseColor.a*=pow(max(0.,1.-puffRadius*puffRadius),2.)*puffBreak*vPuffAlpha;
        #include <alphatest_fragment>`);
    };
    haze.customProgramCacheKey = () => 'terra-tire-wake-v15';
    this.fine = new THREE.InstancedMesh(puff, haze, fineCapacity); this.fine.name = 'tire-mist-dust-and-powder';
    this.fine.renderOrder = 3;
    for (const mesh of [this.mud, this.water, this.snow, this.sand, this.fine]) {
      mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
      mesh.receiveShadow = true; this.group.add(mesh);
    }
    this.object = new THREE.Object3D(); this.color = new THREE.Color(); this.up = new THREE.Vector3(0, 1, 0); this.direction = new THREE.Vector3();
  }

  /** Bind only the selected model; its wheel-well openings and actual panel
   * geometry are retained. No renderer raycast or hierarchy rebuild per frame.
   */
  setVehicle(vehicle) {
    this.clear(); this.collider?.dispose();
    this.collider = vehicle ? new VehicleSprayCollider(vehicle) : null;
    this.impactMarks.setCollider(this.collider);
  }

  update(dt, state, quality, camera = null) {
    this.simulation.update(dt, state, this.terrain, quality, this.collider);
    this.impactMarks.update(dt, state, dt > 0 ? this.simulation.bodyImpacts.filter(event => event.kind === 'mud' || event.kind === 'water') : []);
    let mud = 0, water = 0, snow = 0, sand = 0, fine = 0;
    const o = this.object;
    for (const p of [...this.simulation.particles, ...this.simulation.fines]) {
      if (!p.active) continue;
      const isWater = p.kind === 'water', isSnow = p.kind === 'snow', isSand = p.kind === 'sand';
      const mesh = p.fine ? this.fine : isSand ? this.sand : isSnow ? this.snow : isWater ? this.water : this.mud;
      const index = p.fine ? fine++ : isSand ? sand++ : isSnow ? snow++ : isWater ? water++ : mud++;
      const fade = Math.min(1, (p.life - p.age) * 7);
      o.position.set(p.x, p.y, p.z);
      if (p.fine) {
        if (camera) o.quaternion.copy(camera.quaternion); else o.quaternion.identity();
        o.rotateZ(p.angle);
        const size = p.size * (2.8 + Math.min(1.8, p.age * 2.3));
        o.scale.set(size, size, size);
        this.fine.geometry.attributes.aPuffAlpha.setX(index, Math.min(1, p.age * 24) * Math.pow(1 - p.age / p.life, 1.3) * (isWater ? .34 : .52));
      } else if (isWater) {
        this.direction.set(p.vx, p.vy, p.vz);
        const stretch = 1 + (p.aspect - 1) * Math.min(1, this.direction.length() / 9);
        this.direction.normalize(); o.quaternion.setFromUnitVectors(this.up, this.direction);
        o.scale.set(p.size * fade, p.size * stretch * fade, p.size * fade);
      } else {
        o.rotation.set(p.angle * .7, p.angle, p.angle * .31); o.scale.set(p.size, p.size * p.aspect, p.size * .78).multiplyScalar(fade);
      }
      o.updateMatrix(); mesh.setMatrixAt(index, o.matrix);
      this.color.set(isSnow ? '#f0f6ff' : isWater ? p.dirty ? '#a99b83' : '#c4dce3' : isSand ? '#e5cea3' : p.fine ? p.kind === 'mud' ? '#74543a' : '#a99573' : '#ffffff').multiplyScalar(p.shade);
      mesh.setColorAt(index, this.color);
    }
    this.fine.geometry.attributes.aPuffAlpha.needsUpdate = true;
    for (const [mesh, count] of [[this.mud, mud], [this.water, water], [this.snow, snow], [this.sand, sand], [this.fine, fine]]) {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  clear() { this.simulation.clear(); this.collider?.reset(); this.impactMarks?.clear(); this.mud.count = this.water.count = this.snow.count = this.sand.count = this.fine.count = 0; }
  dispose() { this.collider?.dispose(); this.impactMarks.dispose(); for (const mesh of [this.mud, this.water, this.snow, this.sand, this.fine]) { mesh.geometry.dispose(); mesh.material.dispose(); } this.group.removeFromParent(); }
}
