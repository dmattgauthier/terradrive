import * as THREE from '../vendor/three.module.js';

/** Small, bounded deposits made only by actual tire-ejecta/body collisions.
 * Each patch is clipped to existing panel triangles and follows their live
 * deformation; it cannot paint a floating disc across a wheel opening.
 */
const clamp = THREE.MathUtils.clamp;
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const MAX_TRIANGLES = 64;

function clipPolygon(polygon, triangle) {
  const orientation = Math.sign(cross(triangle[0], triangle[1], triangle[2]));
  if (!orientation) return [];
  for (let edge = 0; edge < 3 && polygon.length; edge++) {
    const a = triangle[edge], b = triangle[(edge + 1) % 3], result = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const dp = cross(a, b, p) * orientation, dq = cross(a, b, q) * orientation;
      if (dp >= -1e-10) result.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq); result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    polygon = result;
  }
  return polygon;
}

function barycentric(point, triangle) {
  const area = cross(triangle[0], triangle[1], triangle[2]);
  return [cross(triangle[1], triangle[2], point) / area, cross(triangle[2], triangle[0], point) / area, cross(triangle[0], triangle[1], point) / area];
}

export function clippedTireImpact(collider, impact, radius) {
  const center = new THREE.Vector3(impact.localPoint.x, impact.localPoint.y, impact.localPoint.z);
  const normal = new THREE.Vector3(impact.localNormal.x, impact.localNormal.y, impact.localNormal.z).normalize();
  const tangent = new THREE.Vector3(Math.abs(normal.y) < .9 ? 0 : 1, Math.abs(normal.y) < .9 ? 1 : 0, 0).cross(normal).normalize();
  const up = normal.clone().cross(tangent), count = impact.kind === 'water' ? 12 : 9;
  const outline = Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2;
    const jitter = impact.kind === 'water' ? .96 + .04 * Math.sin(i * 4.3 + impact.triangleId) : .76 + .22 * Math.sin(i * 3.7 + impact.triangleId * .17) ** 2;
    return [Math.cos(angle) * radius * jitter, Math.sin(angle) * radius * jitter];
  });
  const bindings = [], vertices = collider.vertices;
  const candidates = collider.hierarchy.near(center, radius * 1.12);
  // Keep the hit face first when small neighboring trim occupies many leaves.
  if (candidates.includes(impact.triangleId)) candidates.splice(candidates.indexOf(impact.triangleId), 1);
  candidates.unshift(impact.triangleId);
  for (const id of candidates) {
    if (!(id >= 0) || (id + 1) * 9 > vertices.length) continue;
    const p = Array.from({ length: 3 }, (_, i) => new THREE.Vector3().fromArray(vertices, id * 9 + i * 3));
    const faceNormal = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();
    if (Math.abs(faceNormal.dot(normal)) < .68 || Math.abs(p[0].clone().sub(center).dot(faceNormal)) > .008 + radius * .18) continue;
    const triangle = p.map(vertex => { const offset = vertex.clone().sub(center); return [offset.dot(tangent), offset.dot(up)]; });
    const polygon = clipPolygon(outline, triangle); if (polygon.length < 3) continue;
    const anchors = polygon.map(point => barycentric(point, triangle));
    const uv = polygon.map(point => [point[0] / radius, point[1] / radius]);
    for (let i = 1; i + 1 < anchors.length && bindings.length < MAX_TRIANGLES; i++) {
      bindings.push({ triangleId: id, anchors: [anchors[0], anchors[i], anchors[i + 1]],
        uv: [uv[0], uv[i], uv[i + 1]], side: Math.sign(faceNormal.dot(normal)) || 1 });
    }
    if (bindings.length >= MAX_TRIANGLES) break;
  }
  return bindings;
}

function markMesh(capacity, water) {
  const size = capacity * MAX_TRIANGLES * 3, geometry = new THREE.BufferGeometry();
  for (const [name, components] of [['position', 3], ['normal', 3], ['color', 3], ['impactAlpha', 1], ['impactDetail', 4]]) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(size * components), components).setUsage(THREE.DynamicDrawUsage));
  }
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, transparent: true,
    opacity: water ? .54 : .85, roughness: water ? .15 : .58, metalness: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -1, side: THREE.DoubleSide });
  material.forceSinglePass = true;
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float impactAlpha; attribute vec4 impactDetail; varying float vImpactAlpha; varying vec4 vImpactDetail;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvImpactAlpha = impactAlpha; vImpactDetail = impactDetail;');
    // Coordinates are stored with each clipped barycentric anchor, so fine
    // detail follows the same dented panel instead of swimming through it.
    // The signed outline distance only removes/softens coverage inside the
    // existing hit polygon; it never enlarges the physical hit footprint.
    shader.fragmentShader = `varying float vImpactAlpha; varying vec4 vImpactDetail;
      float tdStampHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float tdStampNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(tdStampHash(i),tdStampHash(i+vec2(1.,0.)),f.x),
          mix(tdStampHash(i+vec2(0.,1.)),tdStampHash(i+vec2(1.,1.)),f.x),f.y);
      }
      float tdStampRadius(float i,float key) {
        ${water ? 'return .96+.04*sin(i*4.3+key);' : 'float j=sin(i*3.7+key*.17); return .76+.22*j*j;'}
      }
      float tdStampEdge(vec2 p,float key) {
        float d=2.; vec2 a=vec2(tdStampRadius(0.,key),0.);
        for(int i=0;i<${water ? 12 : 9};i++) {
          float j=mod(float(i+1),${water ? '12.' : '9.'}), angle=j*${water ? '0.5235987755982988' : '0.6981317007977318'};
          vec2 b=vec2(cos(angle),sin(angle))*tdStampRadius(j,key), e=b-a;
          d=min(d,(e.x*(p.y-a.y)-e.y*(p.x-a.x))/max(.0001,length(e))); a=b;
        }
        return d;
      }
      vec3 tdStampNormal(vec3 n,vec3 position,float height,float face) {
        vec3 dx=dFdx(position),dy=dFdy(position),r1=cross(dy,n),r2=cross(n,dx);
        float determinant=dot(dx,r1)*face;
        vec3 slope=sign(determinant)*(dFdx(height)*r1+dFdy(height)*r2)/max(abs(determinant),1e-12);
        slope*=min(1.,.28/max(length(slope),.0001)); return normalize(n-slope);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 tdStampUV=vImpactDetail.xy;
      vec2 tdStampSalt=vec2(fract(vImpactDetail.z*.01371)*127.3,fract(vImpactDetail.z*.03137)*103.9);
      float tdStampFootprint=max(length(dFdx(tdStampUV)),length(dFdy(tdStampUV)));
      float tdStampDetailFade=1.-smoothstep(.02,.07,tdStampFootprint);
      float tdStampMottle=tdStampNoise(tdStampUV*5.1+tdStampSalt);
      float tdStampGrain=mix(.5,tdStampNoise(tdStampUV*24.7+tdStampSalt*1.731),tdStampDetailFade);
      float tdStampRagged=tdStampNoise(tdStampUV*13.9+tdStampSalt.yx);
      float tdStampDistance=tdStampEdge(tdStampUV,vImpactDetail.z);
      float tdStampAA=max(.006,fwidth(tdStampDistance)*.85);
      float tdStampErosion=${water ? '.007+.038*tdStampRagged' : '.018+.105*(tdStampRagged*.65+tdStampGrain*.35)'};
      float tdStampCoverage=smoothstep(tdStampErosion-tdStampAA,tdStampErosion+.04+tdStampAA,tdStampDistance);
      ${water ? '' : `float tdStampSpecks=smoothstep(.73,.87,tdStampGrain)*smoothstep(.008-tdStampAA,.055+tdStampAA,tdStampDistance);
      tdStampCoverage=max(tdStampCoverage,tdStampSpecks*.43);`}
      float tdStampRim=1.-smoothstep(.02,.20,tdStampDistance);
      float tdStampWet=clamp(vImpactDetail.w,0.,1.);
      float tdStampHeight=${water ? '0.' : '(tdStampGrain-.5)*.00020*tdStampDetailFade*tdStampCoverage'};
      diffuseColor.a*=vImpactAlpha*tdStampCoverage*${water ? '(.36+.38*tdStampMottle+.10*tdStampRim)' : '(.88+.12*tdStampGrain)'};
      diffuseColor.rgb*=${water ? '(.87+.20*tdStampMottle)' : '(.77+.39*tdStampMottle+.14*tdStampGrain)'};
      ${water ? '' : 'diffuseColor.rgb+=vec3(.014,.011,.008)*smoothstep(.72,.88,tdStampGrain)*tdStampDetailFade;'}
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor=${water ? 'clamp(.075+.11*tdStampMottle+.08*(1.-tdStampWet),.075,.29)' : 'clamp(mix(.80,.31,tdStampWet)+.12*tdStampGrain+.13*tdStampRim,.25,.94)'};
    `);
    if (!water) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\nnormal=tdStampNormal(normal,-vViewPosition,tdStampHeight,faceDirection);');
  };
  material.customProgramCacheKey = () => 'tire-impact-patch-detail-v2-' + (water ? 'water' : 'mud');
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.receiveShadow = true;
  mesh.renderOrder = water ? 3 : 2; mesh.name = water ? 'actual-wet-panel-impacts' : 'actual-mud-panel-impacts';
  return mesh;
}

export class TireImpactMarks {
  constructor(scene, capacity = 96) {
    this.capacity = capacity; this.records = Array(capacity).fill(null); this.cursor = 0;
    this.group = new THREE.Group(); this.group.name = 'tire-impact-panel-deposits'; this.group.userData.tireImpactOverlay = true;
    this.mud = markMesh(capacity, false); this.water = markMesh(capacity, true); this.group.add(this.mud, this.water); scene.add(this.group);
    this.color = new THREE.Color(); this.normal = new THREE.Vector3();
  }

  setCollider(collider) { this.clear(); this.collider = collider; }

  update(dt, state, impacts) {
    if (!this.collider || !state.position) return;
    this.group.position.set(state.position.x, state.position.y, state.position.z);
    const q = state.quaternion || { x: 0, y: 0, z: 0, w: 1 }; this.group.quaternion.set(q.x, q.y, q.z, q.w);
    for (const impact of impacts) {
      const radius = clamp(impact.size * (1 + impact.strength * .65), .014, .09);
      const bindings = clippedTireImpact(this.collider, impact, radius); if (!bindings.length) continue;
      this.records[this.cursor++ % this.capacity] = { kind: impact.kind, dirty: impact.dirty, age: 0,
        life: impact.kind === 'water' ? 7 : 100, shapeKey: impact.triangleId, bindings };
    }
    const counts = { mud: 0, water: 0 }, vertices = this.collider.vertices;
    for (let slot = 0; slot < this.records.length; slot++) {
      const record = this.records[slot]; if (!record) continue;
      record.age += Math.max(0, dt); if (record.age >= record.life) { this.records[slot] = null; continue; }
      const mesh = record.kind === 'water' ? this.water : this.mud, attributes = mesh.geometry.attributes;
      this.color.set(record.kind === 'water' ? record.dirty ? '#57442c' : '#52616a' : '#513821');
      const alpha = clamp((record.life - record.age) / (record.kind === 'water' ? 2 : 15), 0, 1);
      const wetness = Math.exp(-record.age * (record.kind === 'water' ? .18 : .09));
      for (const binding of record.bindings) {
        const offset = binding.triangleId * 9;
        const ax = vertices[offset], ay = vertices[offset + 1], az = vertices[offset + 2];
        const bx = vertices[offset + 3], by = vertices[offset + 4], bz = vertices[offset + 5];
        const cx = vertices[offset + 6], cy = vertices[offset + 7], cz = vertices[offset + 8];
        this.normal.set((by - ay) * (cz - az) - (bz - az) * (cy - ay), (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
          (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)).normalize().multiplyScalar(binding.side);
        for (let vertex = 0; vertex < binding.anchors.length; vertex++) {
          const [a, b, c] = binding.anchors[vertex];
          const index = counts[record.kind]++;
          attributes.position.setXYZ(index, ax * a + bx * b + cx * c + this.normal.x * .0009,
            ay * a + by * b + cy * c + this.normal.y * .0009, az * a + bz * b + cz * c + this.normal.z * .0009);
          attributes.normal.setXYZ(index, this.normal.x, this.normal.y, this.normal.z);
          attributes.color.setXYZ(index, this.color.r, this.color.g, this.color.b); attributes.impactAlpha.setX(index, alpha);
          attributes.impactDetail.setXYZW(index, binding.uv[vertex][0], binding.uv[vertex][1], record.shapeKey, wetness);
        }
      }
    }
    for (const [kind, mesh] of [['mud', this.mud], ['water', this.water]]) {
      mesh.geometry.setDrawRange(0, counts[kind]);
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        attribute.clearUpdateRanges(); if (counts[kind]) attribute.addUpdateRange(0, counts[kind] * attribute.itemSize); attribute.needsUpdate = true;
      }
    }
  }

  clear() { this.records.fill(null); this.cursor = 0; this.mud.geometry.setDrawRange(0, 0); this.water.geometry.setDrawRange(0, 0); }
  dispose() { for (const mesh of [this.mud, this.water]) { mesh.geometry.dispose(); mesh.material.dispose(); } this.group.removeFromParent(); this.records.length = 0; }
}
