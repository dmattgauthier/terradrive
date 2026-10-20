import * as THREE from '../vendor/three.module.js';

// Small deterministic mesh builders. Tree crowns use unit height / unit
// radius, matching existing trunk, hinge and collider transforms. Understory
// uses metres and has no rigid collision: these are yielding leaves/stems.
function random(seed) { let n = seed >>> 0; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296); }
class MeshBuilder {
  constructor() { this.positions = []; this.colors = []; this.bend = []; this.indices = []; }
  vertex(p, color, bend = 0) { const i = this.positions.length / 3; this.positions.push(p.x, p.y, p.z); this.colors.push(...color); this.bend.push(bend); return i; }
  triangle(a, b, c) { this.indices.push(a, b, c); }
  leaf(center, axis, width, length, color, bend = 1, aspect = 1) {
    const along = axis.clone().normalize().multiplyScalar(length * .5), side = new THREE.Vector3(-axis.z, 0, axis.x).normalize().multiplyScalar(width * .5);
    if (side.lengthSq() < 1e-9) side.set(width * .5, 0, 0);
    const tip = center.clone().add(along), base = center.clone().sub(along);
    const a = this.vertex(base, color, bend), b = this.vertex(center.clone().add(side), color, bend);
    const c = this.vertex(tip, color, bend), d = this.vertex(center.clone().sub(side), color, bend);
    const ridge = center.clone(); ridge.y += width * .16 / aspect;
    const m = this.vertex(ridge, color.map(v => v * 1.06), bend);
    this.triangle(a, b, m); this.triangle(b, c, m); this.triangle(c, d, m); this.triangle(d, a, m);
  }
  stem(a, b, radius, color, aspect = 1) {
    const base = this.positions.length / 3, direction = b.clone().sub(a).normalize();
    const u = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 0, 1)).normalize();
    if (u.lengthSq() < .01) u.set(1, 0, 0);
    const v = new THREE.Vector3().crossVectors(direction, u).normalize();
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2, p = (ring ? b : a).clone();
      const off = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle)).multiplyScalar(radius * (ring ? .24 : 1)); off.y /= aspect;
      this.vertex(p.add(off), color, Math.max(0, p.y));
    }
    for (let i = 0; i < 5; i++) { const j = (i + 1) % 5; this.triangle(base + i, base + j, base + 5 + i); this.triangle(base + j, base + 5 + j, base + 5 + i); }
  }
  finish(name, metadata = {}) {
    const g = new THREE.BufferGeometry(); g.name = name;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('aPlantBend', new THREE.Float32BufferAttribute(this.bend, 1));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(this.positions.length / 3 * 2), 2));
    g.setIndex(this.indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData = { ...metadata, triangles: this.indices.length / 3, modelVersion: '1.15.0' }; return g;
  }
}

export function createBroadleafTree(seed = 7151) {
  const rng = random(seed), wood = new MeshBuilder(), leaves = new MeshBuilder();
  for (let branch = 0; branch < 26; branch++) {
    const y = .34 + branch / 26 * .57, angle = branch * 2.399963 + rng() * .65;
    const reach = Math.sin((y - .20) * Math.PI) * (.64 + rng() * .33);
    const root = new THREE.Vector3(0, y, 0), end = new THREE.Vector3(Math.sin(angle) * reach, y + .045 + rng() * .05, Math.cos(angle) * reach);
    wood.stem(root, end, .021 * (1 - y) + .007, [.48, .44, .33], 5.2);
    for (let twig = 0; twig < 4; twig++) {
      const t = .38 + twig * .18, start = root.clone().lerp(end, t), twigAngle = angle + (twig % 2 ? 1 : -1) * .8;
      const tip = start.clone().add(new THREE.Vector3(Math.sin(twigAngle) * .22, .025 + rng() * .02, Math.cos(twigAngle) * .22));
      wood.stem(start, tip, .006, [.43, .39, .28], 5.2);
      for (let leaf = 0; leaf < 5; leaf++) {
        const center = start.clone().lerp(tip, .15 + leaf * .19);
        const leafAngle = twigAngle + (leaf % 2 ? .9 : -.9), axis = new THREE.Vector3(Math.sin(leafAngle), (.2 + rng() * .5) / 5.2, Math.cos(leafAngle));
        const length = .10 + rng() * .06;
        leaves.leaf(center, axis, length * .58, length, [.25 + rng() * .12, .36 + rng() * .16, .10 + rng() * .07], y, 5.2);
      }
    }
  }
  return { foliage: leaves.finish('birch-individual-ridged-leaves', { seed, leafCount: 520, coordinateSystem: 'unit crown height / radius' }),
    branches: wood.finish('birch-connected-forking-branches', { seed, coordinateSystem: 'unit crown height / radius' }) };
}

export function createFernGeometry(seed = 9917) {
  const rng = random(seed), mesh = new MeshBuilder();
  for (let frond = 0; frond < 7; frond++) {
    const angle = frond * 2.399963, reach = .38 + rng() * .22;
    const points = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8; return new THREE.Vector3(Math.sin(angle) * reach * t, Math.sin(t * Math.PI * .83) * (.45 + reach * .28), Math.cos(angle) * reach * t);
    });
    for (let i = 1; i < points.length; i++) {
      mesh.stem(points[i - 1], points[i], .005, [.16, .23, .07]);
      for (const side of [-1, 1]) {
        const t = i / 8, leafAngle = angle + side * .98, axis = new THREE.Vector3(Math.sin(leafAngle), .18, Math.cos(leafAngle));
        const length = .05 + Math.sin(t * Math.PI) * .16;
        mesh.leaf(points[i].clone().addScaledVector(axis, length * .40), axis, length * .28, length, [.15 + rng() * .05, .28 + rng() * .08, .075], t);
      }
    }
  }
  return mesh.finish('woodland-arching-fern-fronds', { seed, yielding: true });
}

export function createShrubGeometry(seed = 1291) {
  const rng = random(seed), mesh = new MeshBuilder();
  for (let stem = 0; stem < 13; stem++) {
    const angle = stem * 2.399963, end = new THREE.Vector3(Math.sin(angle) * (.25 + rng() * .25), .35 + rng() * .55, Math.cos(angle) * (.25 + rng() * .25));
    mesh.stem(new THREE.Vector3(), end, .014, [.27, .23, .14]);
    for (let i = 1; i < 8; i++) {
      const center = end.clone().multiplyScalar(i / 8), leafAngle = angle + (i % 2 ? 1 : -1);
      const axis = new THREE.Vector3(Math.sin(leafAngle), .25, Math.cos(leafAngle));
      mesh.leaf(center.clone().addScaledVector(axis, .06), axis, .07, .13, [.19 + rng() * .07, .29 + rng() * .09, .095], i / 8);
    }
  }
  return mesh.finish('riparian-willow-multistem-shrub', { seed, yielding: true });
}

export function createBirchBarkMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#e0dfcb', vertexColors: true, roughness: .93 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vBirchPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBirchPosition=position;');
    shader.fragmentShader = 'varying vec3 vBirchPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      float birchAngle=atan(vBirchPosition.x,vBirchPosition.z);
      float birchBand=abs(sin(vBirchPosition.y*213.+sin(birchAngle*7.)*.9));
      float birchMarks=(1.-smoothstep(.025,.105,birchBand))*smoothstep(-.1,.5,sin(birchAngle*11.+vBirchPosition.y*17.));
      diffuseColor.rgb*=1.-birchMarks*.76;`);
  };
  material.customProgramCacheKey = () => 'terra-birch-lenticels-v15'; return material;
}
