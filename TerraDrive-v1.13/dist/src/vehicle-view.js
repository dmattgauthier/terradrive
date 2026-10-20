import { createTrackModule } from './track-view.js?v=1.15.0';
import { buildSprinter } from './vehicle-sprinter.js?v=1.15.0';
import { buildCivic } from './vehicle-civic.js?v=1.15.0';
import { buildSUV } from './vehicle-suv.js?v=1.15.0';
import { buildHummer, buildHummerUnderbody, createHummerAirStrutGeometry } from './vehicle-hummer.js?v=1.15.0';
import { subdivideBendRegions } from './vehicle-tessellation.js?v=1.15.0';
import * as THREE from '../vendor/three.module.js';
import { TireDeformer, BodyDamage, bakeTreadInstances } from './vehicle-deformation.js?v=1.15.0';
import { winchMountLocal, vehicleBodyDatum, vehicleBodyRise } from './recovery-mount.js?v=1.15.0';

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const OWNED_TEXTURE_SLOTS = ['map', 'normalMap'];
const clamp = THREE.MathUtils.clamp;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function finish(mesh, parent, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function box(parent, material, x, y, z, w, h, d) { return finish(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), parent, x, y, z); }
function roundedBox(parent, material, x, y, z, w, h, d, radius = 0.025) {
  const r = Math.min(radius, w * 0.24, h * 0.24, d * 0.24), hw = w / 2 - r, hh = h / 2 - r;
  const s = new THREE.Shape(); s.moveTo(-hw, -hh); s.lineTo(hw, -hh); s.lineTo(hw, hh); s.lineTo(-hw, hh); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, curveSegments: 4, steps: 1 });
  geo.translate(0, 0, -(d - 2 * r) / 2);
  return finish(new THREE.Mesh(geo, material), parent, x, y, z);
}
function roofCap(parent, material, half, front, rear, top, corner = .10) {
  const hw = half, hd = (front - rear) / 2, r = Math.min(corner, hw * .25, hd * .25), shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd); shape.lineTo(hw - r, -hd); shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r); shape.quadraticCurveTo(hw, hd, hw - r, hd); shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r); shape.lineTo(-hw, -hd + r); shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: .042, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 3, curveSegments: 8, steps: 1 });
  geo.rotateX(-Math.PI / 2);
  finish(new THREE.Mesh(geo, material), parent, 0, top - .054, (front + rear) / 2);
}

function cylinder(parent, material, x, y, z, r, h, axis = 'y', segments = 24) {
  const mesh = finish(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material), parent, x, y, z);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  return mesh;
}
function panel(parent, material, points) {
  const p = new Float32Array(points.flat()), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setIndex(points.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]); g.computeVertexNormals();
  return finish(new THREE.Mesh(g, material), parent);
}
function polygon(parent, material, points) {
  const g = new THREE.BufferGeometry(), indices = [];
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
  g.setIndex(indices); g.computeVertexNormals();
  return finish(new THREE.Mesh(g, material), parent);
}
function surface(parent, material, nu, nv, sample, flip = false) {
  const pos = [], uv = [], ids = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos.push(...sample(i / nu, j / nv)); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    ids.push(...(flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(ids); geo.computeVertexNormals();
  return finish(new THREE.Mesh(geo, material), parent);
}
function interpolate(stations, z, index) {
  // Monotone cubic stations keep panel reflections continuous without overshoot
  // at a bonnet, shoulder or bumper transition.
  const slope = (a, b) => (b[index] - a[index]) / (b[0] - a[0]);
  const tangent = i => {
    if (i === 0) return slope(stations[0], stations[1]);
    if (i === stations.length - 1) return slope(stations[i - 1], stations[i]);
    const left = slope(stations[i - 1], stations[i]), right = slope(stations[i], stations[i + 1]);
    if (left * right <= 0) return 0;
    const a = stations[i][0] - stations[i - 1][0], b = stations[i + 1][0] - stations[i][0];
    return 3 * (a + b) / ((2 * b + a) / left + (b + 2 * a) / right);
  };
  for (let i = 1; i < stations.length; i++) if (z <= stations[i][0]) {
    const a = stations[i - 1], b = stations[i], h = b[0] - a[0], t = clamp((z - a[0]) / h, 0, 1), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a[index] + (t3 - 2 * t2 + t) * h * tangent(i - 1) + (-2 * t3 + 3 * t2) * b[index] + (t3 - t2) * h * tangent(i);
  }
  return stations[stations.length - 1][index];
}
/** Crowned bonnet/deck and gently convex side panels, with real open wheel wells. */
function lowerShell(parent, material, stations, wheelbase, wheelRadius, bottom, wheelY, crown = 0.028, bulge = 0.025, shoulder = 0.055, options = {}) {
  const firstChild = parent.children.length;
  const minZ = stations[0][0], maxZ = stations[stations.length - 1][0], segments = Math.ceil((maxZ - minZ) / 0.04);
  const topSection = (rear, front, side = 0) => {
    if (front - rear < .001) return;
    surface(parent, material, side ? 5 : 22, Math.max(2, Math.ceil((front - rear) / .04)), (u, v) => {
      const z = THREE.MathUtils.lerp(rear, front, v), width = interpolate(stations, z, 1) - shoulder;
      const xx = side ? side * THREE.MathUtils.lerp(Math.min(options.cabin.half, width), width, u) : (u * 2 - 1) * width;
      return [xx, interpolate(stations, z, 2) + crown * (1 - (xx / width) ** 2), z];
    }, side < 0 ? false : true);
  };
  if (options.cabin) {
    const rear = clamp(options.cabin.rear, minZ, maxZ), front = clamp(options.cabin.front, rear, maxZ);
    topSection(minZ, rear); topSection(rear, front, -1); topSection(rear, front, 1); topSection(front, maxZ);
  } else topSection(minZ, maxZ);
  for (const side of [-1, 1]) surface(parent, material, segments, 8, (u, v) => {
    const z = THREE.MathUtils.lerp(minZ, maxZ, u), a = v * Math.PI / 2, width = interpolate(stations, z, 1), y = interpolate(stations, z, 2);
    return [side * (width - shoulder + Math.sin(a) * shoulder), y - shoulder + Math.cos(a) * shoulder, z];
  }, side < 0);
  for (const side of [-1, 1]) surface(parent, material, segments, 10, (u, v) => {
    const z = THREE.MathUtils.lerp(minZ, maxZ, u), top = interpolate(stations, z, 2) - shoulder, width = interpolate(stations, z, 1);
    let low = bottom;
    for (const axle of [-wheelbase / 2, wheelbase / 2]) {
      const dz = z - axle;
      if (Math.abs(dz) < wheelRadius) low = Math.max(low, wheelY + Math.sqrt(Math.max(0, wheelRadius * wheelRadius - dz * dz)));
    }
    low = Math.min(top - 0.012, low);
    const y = THREE.MathUtils.lerp(low, top, v), physicalHeight = clamp((y - bottom) / (top - bottom), 0, 1);
    return [side * (width - 0.018 * (1 - physicalHeight) + bulge * Math.sin(physicalHeight * Math.PI)), y, z];
  }, side > 0);
  for (const [z, reverse] of [[minZ, true], [maxZ, false]]) {
    const width=interpolate(stations,z,1),inner=width-shoulder;
    // Match the cap's outer columns to the eight quarter-round shoulder
    // stations. A uniform 22-column cap cut a chord across that narrow curve
    // and left the side shell physically open at the upper front corners.
    const xs=options.matchShoulderCaps?[...Array.from({length:8},(_,i)=>-inner-Math.sin((8-i)*Math.PI/16)*shoulder),
      ...Array.from({length:23},(_,i)=>(i/11-1)*inner),
      ...Array.from({length:8},(_,i)=>inner+Math.sin((i+1)*Math.PI/16)*shoulder)]:Array.from({length:23},(_,i)=>(i/11-1)*width);
    surface(parent, material, xs.length-1, 8, (u, v) => {
      const xx=xs[Math.round(u*(xs.length-1))],a=Math.max(0,Math.abs(xx)-inner);
      const top=interpolate(stations,z,2)+(a>0?-shoulder+Math.sqrt(Math.max(0,shoulder*shoulder-a*a)):crown*(1-(xx/inner)**2));
      return [xx,THREE.MathUtils.lerp(bottom,top,v),z];
    },reverse);
  }
  return parent.children.slice(firstChild);
}

/** A shaped fascia with actual apertures, sampled onto its curved exterior. */
function perforatedFace(parent, material, outline, apertures, sample, maxEdge = .06) {
  const shape = new THREE.Shape();
  outline.forEach(([x,y],i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y)); shape.closePath();
  for (const aperture of apertures) {
    const path = new THREE.Path(); aperture.forEach(([x,y],i) => i ? path.lineTo(x,y) : path.moveTo(x,y)); path.closePath();shape.holes.push(path);
  }
  let geometry = new THREE.ShapeGeometry(shape,8);
  geometry = subdivideBendRegions(geometry,-Infinity,maxEdge);
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){const point=sample(p.getX(i),p.getY(i));p.setXYZ(i,...point);}
  geometry.computeVertexNormals(); return finish(new THREE.Mesh(geometry,material),parent);
}

/** Bevelled reveal plus a set-back inner surface for lamps and air openings. */
function recessedOpening(parent, edgeMaterial, backMaterial, outline, sample, depth=.026, inset=.08) {
  const center=outline.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>v/outline.length);
  const inner=outline.map(([x,y])=>[THREE.MathUtils.lerp(x,center[0],inset),THREE.MathUtils.lerp(y,center[1],inset)]);
  const positions=[],indices=[];
  for(const [i,points] of [outline,inner].entries()) for(const [x,y] of points){const p=sample(x,y);positions.push(p[0],p[1],p[2]-(i?depth:0));}
  const n=outline.length;for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,i+n,j,j+n,i+n);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();finish(new THREE.Mesh(geo,edgeMaterial),parent);
  const back=inner.map(([x,y])=>{const p=sample(x,y);return [p[0],p[1],p[2]-depth];});polygon(parent,backMaterial,back);
  return inner;
}

/** Continuous molded bumper sections instead of a row of rectangular blocks. */
function sweptBumper(parent,material,stations,power=.54) {
  const first=stations[0][0],last=stations.at(-1)[0],sample=(x,a)=>{
    const low=interpolate(stations,x,1),high=interpolate(stations,x,2),front=interpolate(stations,x,3),back=interpolate(stations,x,4);
    const s=Math.sin(a),c=Math.cos(a);
    return [x,(low+high)/2+Math.sign(s)*Math.abs(s)**power*(high-low)/2,(front+back)/2+Math.sign(c)*Math.abs(c)**power*(front-back)/2];
  };
  surface(parent,material,52,20,(u,v)=>sample(THREE.MathUtils.lerp(first,last,u),v*Math.PI*2));
  for(const [x,reverse] of [[first,false],[last,true]]){const points=Array.from({length:20},(_,i)=>sample(x,(reverse?-1:1)*i*Math.PI*2/20));polygon(parent,material,points);}
}


function roundBodyEnds(body, style) {
  if (style === 'hummer') return; // Its full-size body supplies its own curved ends.
  const depth = style === 'sedan' ? 0.255 : style === 'van' ? 0.175 : style === 'bronco' ? 0.13 : 0.062;
  const exponent = style === 'sedan' ? 2.8 : style === 'van' ? 3.0 : style === 'bronco' ? 3.3 : 4;
  const start = style === 'van' ? 2.20 : style === 'sedan' ? 1.73 : 1.71;
  const end = style === 'van' ? 2.88 : style === 'sedan' ? 2.37 : 2.29;
  const width = style === 'van' ? 1.02 : style === 'sedan' ? 0.94 : 1.0;
  body.updateMatrixWorld(true);
  const inverse = body.matrixWorld.clone().invert(), meshes = [];
  body.traverse(mesh => { if (mesh.isMesh && !mesh.isInstancedMesh) meshes.push(mesh); });
  for (const mesh of meshes) {
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld), geo = subdivideBendRegions(mesh.geometry.clone().applyMatrix4(matrix), start), p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), sign = Math.sign(z), t = clamp((Math.abs(z) - start) / (end - start), 0, 1);
      const w = t * t * (3 - 2 * t), ratio = x / width, shape = Math.abs(ratio) ** exponent;
      // The van's rear doors are nearly flat; retain that recognizable silhouette.
      const k = style === 'van' && z < 0 ? depth * 0.28 : depth;
      const verticalRatio = style === 'sedan' && z > 0 ? clamp((y - 0.52) / 0.30, -1, 1) : 0;
      const faceContour = 0.060 * verticalRatio * verticalRatio;
      p.setZ(i, z - sign * w * (k * shape + faceContour));
      if (n) {
        const fx = -sign * k * w * exponent * Math.sign(ratio) * Math.abs(ratio) ** (exponent - 1) / width;
        const fy = style === 'sedan' && z > 0 && Math.abs((y - 0.52) / 0.30) < 1 ? -w * 0.12 * verticalRatio / 0.30 : 0;
        const fz = 1 - (t > 0 && t < 1 ? 6 * t * (1 - t) / (end - start) : 0) * (k * shape + faceContour);
        const nz = n.getZ(i) / Math.max(0.25, fz), normal = new THREE.Vector3(n.getX(i) - fx * nz, n.getY(i) - fy * nz, nz).normalize();
        n.setXYZ(i, normal.x, normal.y, normal.z);
      }
    }
    mesh.geometry.dispose(); mesh.geometry = geo;
    mesh.parent.remove(mesh); body.add(mesh); mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
    geo.computeBoundingSphere();
  }
}

/** Molded roof shoulders share one rounded section with pillars and gutters. */
function roundRoofShoulders(body,style) {
  // Sedan and W906 roofs supply their own continuous curvature and analytic normals.
  if(style==='sedan'||style==='van'||style==='hummer')return;
  const van=style==='van',bronco=style==='bronco',radius=van?.135:bronco?.072:.055;
  const half=van?.916:bronco?.874:.810,top=van?2.446:bronco?1.873:1.86,cx=half-radius,cy=top-radius;
  body.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh)return;
    const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;let changed=false;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),dx=Math.abs(x)-cx,dy=y-cy;
      if(dx<=0||dy<=0||Math.abs(x)>half+.10||y>top+.04)continue;
      const distance=Math.hypot(dx,dy);if(distance<=radius)continue;
      p.setXY(i,Math.sign(x)*(cx+dx*radius/distance),cy+dy*radius/distance);
      if(n){const planar=Math.hypot(n.getX(i),n.getY(i));const next=new THREE.Vector3(Math.sign(x)*dx/distance*planar,dy/distance*planar,n.getZ(i)).normalize();n.setXYZ(i,next.x,next.y,next.z);}
      changed=true;
    }
    if(changed){p.needsUpdate=true;if(n)n.needsUpdate=true;mesh.geometry.computeBoundingSphere();}
  });
}
/** A flush lamp patch follows the closed body skin instead of hiding inside it. */
function frontSkinProjector(parent, skins, facing = 1, flatCapZ) {
  parent.updateWorldMatrix(true, true);
  // Every query is parallel to the body Z axis. An XY triangle grid gives the
  // exact same surface intersection without thousands of full mesh raycasts
  // during each garage rebuild.
  const cells=new Map(),cellSize=.08,inverse=parent.matrixWorld.clone().invert();
  if(!Number.isFinite(flatCapZ)) for(const mesh of skins){
    const matrix=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld),geometry=mesh.geometry,p=geometry.attributes.position,index=geometry.index?.array;
    const vertices=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix).toArray());
    for(let i=0;i<(index?.length||p.count);i+=3){
      const a=vertices[index?index[i]:i],b=vertices[index?index[i+1]:i+1],c=vertices[index?index[i+2]:i+2];
      const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<1e-10)continue;
      const triangle={a,b,c,det},minX=Math.floor(Math.min(a[0],b[0],c[0])/cellSize),maxX=Math.floor(Math.max(a[0],b[0],c[0])/cellSize),minY=Math.floor(Math.min(a[1],b[1],c[1])/cellSize),maxY=Math.floor(Math.max(a[1],b[1],c[1])/cellSize);
      for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){const key=x+':'+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(triangle);}
    }
  }
  const point = (p, offset = 0.010) => {
    if(Number.isFinite(flatCapZ))return [p[0],p[1],flatCapZ+offset*facing];
    const x=p[0],y=p[1],candidates=cells.get(Math.floor(x/cellSize)+':'+Math.floor(y/cellSize))||[];
    let nearest=facing>0?-Infinity:Infinity;
    for(const {a,b,c,det} of candidates){
      const wa=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det,wb=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det,wc=1-wa-wb;
      if(wa<-.00002||wb<-.00002||wc<-.00002)continue;
      const z=wa*a[2]+wb*b[2]+wc*c[2];if(z*facing>nearest*facing)nearest=z;
    }
    return Number.isFinite(nearest)?[x,y,nearest+offset*facing]:[...p];
  };
  const patch = (material, points, offset = 0.010) => {
    const mesh = polygon(parent, material, points);
    mesh.geometry = subdivideBendRegions(mesh.geometry, -Infinity, 0.032);
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) { const p = point([position.getX(i), position.getY(i), position.getZ(i)], offset); position.setXYZ(i, ...p); }
    mesh.geometry.computeVertexNormals();
    if(mesh.geometry.attributes.normal.getZ(0)*facing<0){const ids=mesh.geometry.index.array;for(let i=0;i<ids.length;i+=3){const t=ids[i+1];ids[i+1]=ids[i+2];ids[i+2]=t;}mesh.geometry.computeVertexNormals();}
    return mesh;
  };
  const strip = (material, points, radius = 0.007) => {
    const sampled = [];
    for (let i = 1; i < points.length; i++) {
      const a = v3(...points[i - 1]), b = v3(...points[i]), segments = Math.max(1, Math.ceil(a.distanceTo(b) / 0.025));
      for (let j = i === 1 ? 0 : 1; j <= segments; j++) sampled.push(point(a.clone().lerp(b, j / segments).toArray(), 0.015));
    }
    curvedLine(parent, material, sampled, radius);
  };
  return { point, patch, strip };
}

function curvedLine(parent, material, points, radius = 0.004, smooth = false) {
  if (!smooth) { for (let i = 1; i < points.length; i++) line(parent, material, points[i - 1], points[i], radius); return; }
  const curve = new THREE.CatmullRomCurve3(points.map(p => v3(...p)));
  return finish(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 5), radius, 5, false), material), parent);
}
function roundedOutline(points, radius = 0.065, steps = 5) {
  const output = [];
  for (let i = 0; i < points.length; i++) {
    const corner = v3(...points[i]), previous = v3(...points[(i + points.length - 1) % points.length]), next = v3(...points[(i + 1) % points.length]);
    const extent = Math.min(radius, corner.distanceTo(previous) * .23, corner.distanceTo(next) * .23);
    const a = corner.clone().lerp(previous, extent / corner.distanceTo(previous));
    const b = corner.clone().lerp(next, extent / corner.distanceTo(next));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      output.push(a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(corner, 2 * t * (1 - t)).addScaledVector(b, t * t).toArray());
    }
  }
  return output;
}
function windowPanel(parent, materials, points, inset = 0.035, radius = 0.065, options = {}) {
  const outline = roundedOutline(points, radius), center = outline.reduce((a, p) => a.add(v3(...p)), new THREE.Vector3()).multiplyScalar(1 / outline.length);
  const inner = outline.map(p => v3(...p).lerp(center, inset).toArray()), vertices = [...outline, ...inner], ids = [];
  for (let i = 0; i < outline.length; i++) { const j = (i + 1) % outline.length; ids.push(i, j, i + outline.length, j, j + outline.length, i + outline.length); }
  const seal = new THREE.BufferGeometry(); seal.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3)); seal.setIndex(ids); seal.computeVertexNormals();
  finish(new THREE.Mesh(seal, materials.black), parent);
  const normal = new THREE.Vector3();
  for (let i = 0; i < inner.length; i++) normal.add(v3(...inner[i]).sub(center).cross(v3(...inner[(i + 1) % inner.length]).sub(center)));
  normal.normalize();
  if (normal.dot(new THREE.Vector3(center.x, 0, center.z)) < 0) normal.negate();
  const bulge = options.bow ?? (Math.abs(normal.x) < .45 ? (materials.glass.userData.endGlassBow ?? .020) : .006), rings = 12, count = inner.length;
  const positions = center.clone().addScaledVector(normal, bulge).toArray(), normals = normal.toArray(), indices = [], uvs = [.5, .5];
  for (let ring = 1; ring <= rings; ring++) for (let i = 0; i < count; i++) {
    const r = ring / rings, edge = v3(...inner[i]), radial = edge.clone().sub(center);
    const tangent = v3(...inner[(i + 1) % count]).sub(v3(...inner[(i + count - 1) % count]));
    const nr = tangent.cross(radial.clone().addScaledVector(normal, -2 * bulge * r)).normalize();
    if (nr.dot(normal) < 0) nr.negate();
    positions.push(...center.clone().addScaledVector(radial, r).addScaledVector(normal, bulge * (1 - r * r)).toArray());
    normals.push(...nr.toArray()); uvs.push(i / count, r);
    const index = 1 + (ring - 1) * count + i, next = 1 + (ring - 1) * count + (i + 1) % count;
    if (ring === 1) indices.push(0, index, next);
    else { const previous = index - count, previousNext = next - count; indices.push(previous, index, previousNext, index, next, previousNext); }
  }
  const a = v3(...positions.slice(indices[0] * 3, indices[0] * 3 + 3)), b = v3(...positions.slice(indices[1] * 3, indices[1] * 3 + 3)), c = v3(...positions.slice(indices[2] * 3, indices[2] * 3 + 3));
  if (b.sub(a).cross(c.sub(a)).dot(normal) < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  const glass = new THREE.BufferGeometry(); glass.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  glass.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); glass.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); glass.setIndex(indices);
  return finish(new THREE.Mesh(glass, materials.glass), parent);
}
function ellipseRing(parent, material, x, y, z, rx, ry, radius = 0.009) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, radius / Math.max(rx, ry), 6, 40), material);
  ring.scale.set(rx, ry, Math.max(rx, ry)); return finish(ring, parent, x, y, z);
}
function profile(parent, material, points, width, bevel = 0.018) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelSegments: 1, steps: 1, bevelSize: bevel, bevelThickness: bevel });
  geo.translate(0, 0, -width / 2); geo.rotateY(Math.PI / 2);
  return finish(new THREE.Mesh(geo, material), parent);
}
function line(parent, material, a, b, radius = 0.012) {
  const av = v3(...a), bv = v3(...b), mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, av.distanceTo(bv), 7), material);
  mesh.position.copy(av).add(bv).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(UP, bv.sub(av).normalize());
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function archPoints(axle, r, bottom, center) {
  const angle = Math.asin(clamp((bottom - center) / r, -1, 1)), points = [];
  for (let i = 0; i <= 10; i++) { const t = Math.PI - angle - i * (Math.PI - 2 * angle) / 10; points.push([axle + r * Math.cos(t), center + r * Math.sin(t)]); }
  return points;
}
function sideText(parent, text, x, y, z, width, height, color = '#d9ded5', face = 1) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.font = '700 66px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 51);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); mesh.rotation.y = Math.PI / 2 * face; parent.add(mesh);
}
function frontText(parent, text, x, y, z, width, height, color = '#dddcd1') {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.font = 'bold 72px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, 256, 65);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.5 }));
  mesh.position.set(x, y, z); parent.add(mesh);
}

/** Batch fixed meshes by material while retaining animated subassemblies. */
export function mergeStaticMeshes(group, predicate = () => true) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), buckets = new Map();
  group.traverse(object => {
    if (!object.isMesh || object.isInstancedMesh || !predicate(object) || Array.isArray(object.material)) return;
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(object);
  });
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const positions = [], normals = [], uvs = [], indices = [];
    for (const mesh of bucket) {
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld), geometry = mesh.geometry.clone().applyMatrix4(matrix), p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv, offset = positions.length / 3;
      for (let i = 0; i < p.count; i++) { positions.push(p.getX(i), p.getY(i), p.getZ(i)); normals.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0); uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); }
      if (geometry.index) for (const index of geometry.index.array) indices.push(offset + index); else for (let i = 0; i < p.count; i++) indices.push(offset + i);
      geometry.dispose(); mesh.parent.remove(mesh); mesh.geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    const merged = new THREE.Mesh(geometry, bucket[0].material); merged.castShadow = bucket[0].castShadow; merged.receiveShadow = bucket[0].receiveShadow; group.add(merged);
  }
}

const VEHICLE_GEOMETRY = { THREE, UP, X_AXIS, clamp, v3, finish, box, roundedBox, roofCap, cylinder, panel, polygon, surface, interpolate, lowerShell, perforatedFace, recessedOpening, sweptBumper, subdivideBendRegions, roundBodyEnds, roundRoofShoulders, frontSkinProjector, curvedLine, roundedOutline, windowPanel, ellipseRing, profile, line, archPoints, sideText, frontText };

/** Original reference-built exterior meshes; see docs/model-assets.md for source research. */
export class VehicleView {
  constructor(scene, spec) {
    this.scene = scene;
    this.root = new THREE.Group(); this.root.name = 'vehicle-chassis'; scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);
    this.wheels = []; this.links = []; this.driveLinks = []; this.lamps = [];
    this.setSpec(spec);
  }

  setSpec(spec) {
    if (!spec) return;
    this._disposeWinchKit();
    this.spec = spec;
    this.damageView?.dispose();
    // Equipment rebuilds are frequent in the garage; release the old rig's
    // buffers/materials before replacing them, including detached road wheels.
    const oldGeometries = new Set(), oldMaterials = new Set();
    const collectOld = object => object?.traverse(child => {
      if (child.geometry) oldGeometries.add(child.geometry);
      if (child.material) for (const material of Array.isArray(child.material) ? child.material : [child.material]) oldMaterials.add(material);
    });
    collectOld(this.body); this.wheels.forEach(w => collectOld(w.root)); this.links.forEach(l => collectOld(l.mesh));
    this.driveLinks.forEach(link => collectOld(link.group));
    this.axles?.forEach(a => { collectOld(a.mesh); collectOld(a.diff); });
    oldGeometries.forEach(geometry => geometry.dispose());
    const oldTextures=new Set();
    oldMaterials.forEach(material => { for(const slot of OWNED_TEXTURE_SLOTS)if(material[slot])oldTextures.add(material[slot]);material.dispose(); });
    oldTextures.forEach(texture=>texture.dispose());
    while (this.body.children.length) this.body.remove(this.body.children[0]);
    this.wheels.forEach(w => this.scene.remove(w.root)); this.links.forEach(l => this.scene.remove(l.mesh));
    this.driveLinks.forEach(link => this.scene.remove(link.group));
    this.axles?.forEach(a => { this.scene.remove(a.mesh); this.scene.remove(a.diff); });
    this.wheels = []; this.links = []; this.driveLinks = []; this.lamps = [];
    this.materials = {
      paint: new THREE.MeshPhysicalMaterial({ color: spec.color || '#ba9555', metalness: 0.32, roughness: 0.255, clearcoat: 1, clearcoatRoughness: 0.095, envMapIntensity: 0.9, side: THREE.DoubleSide }),
      black: new THREE.MeshStandardMaterial({ color: '#171b1e', metalness: 0.06, roughness: 0.76, side: THREE.DoubleSide }),
      glossBlack: new THREE.MeshPhysicalMaterial({ color: '#0f1417', metalness: .16, roughness: .22, clearcoat: .65, clearcoatRoughness: .12, side: THREE.DoubleSide }),
      dark: new THREE.MeshStandardMaterial({ color: '#13191a', metalness: 0.35, roughness: 0.64, side: THREE.DoubleSide }),
      badge: new THREE.MeshStandardMaterial({ color: '#d5d7cf', metalness: .24, roughness: .34, side: THREE.DoubleSide }),
      grille: new THREE.MeshStandardMaterial({ color: '#444b4c', metalness: 0.20, roughness: 0.57, side: THREE.DoubleSide }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#6a8289', metalness: 0, roughness: 0.055, transparent: true, opacity: 0.52, depthWrite: false, clearcoat: 0, reflectivity: 0.5, envMapIntensity: .20, side: THREE.DoubleSide }),
      chrome: new THREE.MeshStandardMaterial({ color: '#bcc3bd', metalness: 0.92, roughness: 0.26, side: THREE.DoubleSide }),
      satinMetal: new THREE.MeshStandardMaterial({ color: '#8b9192', metalness: .78, roughness: .39, side: THREE.DoubleSide }),
      rim: new THREE.MeshStandardMaterial({ color: spec.bodyStyle === 'sedan' ? '#171b1e' : spec.bodyStyle === 'van' ? '#8c9295' : spec.bodyStyle === 'jeep' ? '#34393a' : '#60676a', metalness: 0.85, roughness: 0.29 }),
      brakeDisc: new THREE.MeshStandardMaterial({ color: '#646b70', metalness: 0.72, roughness: 0.52 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#151819', roughness: 0.92, metalness: 0.01 }),
      tread: new THREE.MeshStandardMaterial({ color: '#1a1d1e', roughness: 0.98, metalness: 0 }),
      interior: new THREE.MeshStandardMaterial({ color: '#353b3d', roughness: 0.96, side: THREE.DoubleSide }),
      upholstery: new THREE.MeshStandardMaterial({ color: '#252b30', roughness: 0.94, side: THREE.DoubleSide }),
      screen: new THREE.MeshStandardMaterial({ color: '#0d2029', roughness: .27, emissive: '#214450', emissiveIntensity: .16 }),
      headliner: new THREE.MeshStandardMaterial({ color: '#777978', roughness: 1, side: THREE.DoubleSide }),
      hardtop: new THREE.MeshStandardMaterial({ color: spec.bodyStyle === 'bronco' ? '#4c5051' : '#24282b', roughness: .83, side: THREE.DoubleSide }),
      lens: new THREE.MeshPhysicalMaterial({ color: '#899597', roughness: 0.075, metalness: 0, transparent: true, opacity: 0.16, clearcoat: .55, clearcoatRoughness: .06, depthWrite: false, side: THREE.DoubleSide }),
      redLens: new THREE.MeshPhysicalMaterial({ color: '#951421', roughness: .15, metalness: 0, transparent: true, opacity: .46, clearcoat: .65, clearcoatRoughness: .09, depthWrite: false, side: THREE.DoubleSide }),
      red: new THREE.MeshStandardMaterial({ color: '#a12d23', roughness: 0.25, metalness: 0.30, emissive: '#5b0905', emissiveIntensity: 0.3 }),
      redPaint: new THREE.MeshPhysicalMaterial({ color: '#a32119', metalness: 0.28, roughness: 0.36, clearcoat: 0.7 }),
      reverse: new THREE.MeshStandardMaterial({ color: '#adb9bf', metalness: 0.26, roughness: 0.23, emissive: '#e0eced', emissiveIntensity: 0 }),
      headlampCore: new THREE.MeshStandardMaterial({ color:'#252d31',metalness:.38,roughness:.22,emissive:'#e6ece5',emissiveIntensity:0 }),
      white: new THREE.MeshStandardMaterial({ color: '#e5e4cc', roughness: 0.24, metalness: 0.3, emissive: '#e6e0be', emissiveIntensity: 0.65 }),
      amber: new THREE.MeshStandardMaterial({ color: '#cc7b22', roughness: 0.26, emissive: '#b64d09', emissiveIntensity: 0.5 }),
    };
    this.materials.glass.forceSinglePass = true;
    this.materials.lens.forceSinglePass = true;
    this.materials.lens.userData.vehicleLampLens = true;
    this.materials.redLens.forceSinglePass = true;
    this.materials.redLens.userData.vehicleLampLens = true;
    this.materials.redLens.userData.vehicleTintedLens = true;
    this.materials.headlampCore.userData.vehicleLightEmitter = true;
    this.materials.headlampReflector=this.materials.chrome.clone();
    this.materials.headlampReflector.emissive.set('#daceb6');
    this.materials.headlampReflector.emissiveIntensity=0;
    this.materials.headlampReflector.userData.vehicleLightEmitter=true;
    this.materials.windscreen = this.materials.glass.clone(); this.materials.windscreen.opacity = .37;
    this.materials.privacyGlass = this.materials.glass.clone(); this.materials.privacyGlass.opacity = .72; this.materials.privacyGlass.color.set('#354d58');
    for (const material of [this.materials.glass, this.materials.windscreen, this.materials.privacyGlass]) {
      material.userData.vehicleGlass = true;
      material.userData.endGlassBow = spec.bodyStyle==='sedan'?.035:spec.bodyStyle==='van'?.023:.009;
    }
    for (const material of [this.materials.interior, this.materials.upholstery, this.materials.headliner, this.materials.screen]) material.userData.vehicleInterior = true;
    const zOffset = (0.5 - (spec.frontWeightFraction ?? 0.5)) * spec.wheelbase;
    this.body.position.set(0, -vehicleBodyDatum(spec), zOffset);
    this.root.userData.visualModel = { type: 'Original reference-built exterior', version: 7, importedManufacturerCAD: false, bodyRise: vehicleBodyRise(spec), tireType: spec.tireType };
    if (spec.bodyStyle === 'sedan') this._sedan();
    else if (spec.bodyStyle === 'van') this._van();
    else if (spec.bodyStyle === 'hummer') buildHummer(this, VEHICLE_GEOMETRY);
    else this._suv(spec.bodyStyle === 'bronco');
    this._underbody();
    mergeStaticMeshes(this.body);
    roundBodyEnds(this.body, spec.bodyStyle);
    roundRoofShoulders(this.body,spec.bodyStyle);
    // Continuous skins and glazing need vertices inside each possible impact area.
    // This is done once, before pristine geometry is captured for reversible repair.
    const damageSurfaces = new Set([this.materials.paint, this.materials.glass, this.materials.windscreen, this.materials.privacyGlass, this.materials.lens, this.materials.redLens, this.materials.black, this.materials.glossBlack, this.materials.dark, this.materials.hardtop]);
    this.body.traverse(mesh => {
      if (mesh.isMesh && !mesh.isInstancedMesh && damageSurfaces.has(mesh.material)) mesh.geometry = subdivideBendRegions(mesh.geometry, -Infinity, 0.18);
    });
    this.damageView = new BodyDamage(this.body, this.materials);
    this.paint = this.materials.paint.color.getHexString();
    if(spec.bodyStyle==='sedan'||spec.bodyStyle==='hummer')this.materials.damper=new THREE.MeshStandardMaterial({color:'#ffffff',metalness:.62,roughness:.38,vertexColors:true});
    for (let i = 0; i < 4; i++) {
      const wheel = this._wheel(); this.scene.add(wheel.root); this.wheels.push(wheel);
      for (let j = 0; j < 2; j++) {
        let geometry,material;
        if(j&&spec.bodyStyle==='hummer') {
          geometry=createHummerAirStrutGeometry(THREE);material=this.materials.damper;
        }else if(j&&spec.bodyStyle==='sedan') {
          // Telescopic road-car damper: molded dust boot and black body hide
          // most of the unit, leaving only a narrow polished piston exposed.
          // Normalized endpoints and deformation coordinates stay unchanged.
          const profile=[[.029,-.50],[.029,-.47]];
          for(let y=-.455;y<-.235;y+=.036)profile.push([.033,y],[.028,y+.014]);
          profile.push([.028,-.222],[.010,-.216],[.010,.128],[.025,.136],[.025,.50]);
          geometry=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),16);
          const positions=geometry.attributes.position,colors=new Float32Array(positions.count*3),shell=new THREE.Color('#1d2327'),piston=new THREE.Color('#b8c1c5');
          for(let k=0;k<positions.count;k++){const y=positions.getY(k),c=y>=-.2161&&y<=.1281?piston:shell;c.toArray(colors,k*3);}
          geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));material=this.materials.damper;
        }else{geometry=new THREE.CylinderGeometry(j ? .024 : .032,j ? .024 : .032,1,8,6);material=j?this.materials.chrome:this.materials.dark;}
        const mesh = new THREE.Mesh(geometry,material);
        mesh.castShadow = true; this.scene.add(mesh); this.links.push({ mesh, wheel: i, type: j, pristine: mesh.geometry.attributes.position.array.slice(), damage: 0 });
      }
    }
    this.axles = [];
    for (let axle = 0; axle < 2; axle++) {
      const type = axle ? spec.suspension?.rearType : spec.suspension?.frontType;
      if (type?.includes('solid')) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 12), this.materials.dark); mesh.castShadow = true; this.scene.add(mesh);
        const diff = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8), this.materials.dark); this.scene.add(diff);
        this.axles.push({ axle, mesh, diff });
      }
    }
    this._q = new THREE.Quaternion(); this._roll = new THREE.Quaternion(); this._steer = new THREE.Quaternion(); this._tmp = new THREE.Vector3(); this._tmp2 = new THREE.Vector3(); this._damageTilt = new THREE.Quaternion();
    this.winchEnabled = false; this.winchKit = null;
  }

  /** Set body paint only; dents, exposed metal, glazing and trim retain their state. */
  setPaint(hex) {
    if (typeof hex !== 'string' || !/^#?(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex)) return false;
    let value = hex.replace('#', '').toLowerCase();
    if (value.length === 3) value = value.split('').map(letter => letter + letter).join('');
    if (value !== this.paint) { this.materials.paint.color.set('#' + value); this.paint = value; }
    return '#' + value;
  }

  /** Optional aftermarket recovery hardware, shared by garage and driving views. */
  setWinchEnabled(enabled) {
    enabled = !!enabled;
    if (enabled && !this.winchKit) this._createWinchKit();
    if (enabled) this.root.add(this.winchKit);
    else this.winchKit?.removeFromParent();
    this.winchEnabled = enabled;
    return enabled;
  }

  getWinchMountLocal() { return winchMountLocal(this.spec); }

  getWinchAnchor(target = new THREE.Vector3()) {
    const point = this.getWinchMountLocal();
    this.root.updateWorldMatrix(true, false);
    return target.set(point.x, point.y, point.z).applyMatrix4(this.root.matrixWorld);
  }

  _createWinchKit() {
    const g = new THREE.Group(), mount = this.getWinchMountLocal();
    g.name = 'aftermarket-front-winch'; g.position.set(mount.x, mount.y, mount.z);
    g.userData = { aftermarket: true, fairleadExit: { x: 0, y: 0, z: 0 } };
    // Dedicated materials keep body damage masks off rigid accessory hardware.
    const steel = new THREE.MeshStandardMaterial({ color: '#242b2e', metalness: .72, roughness: .50 });
    const alloy = new THREE.MeshStandardMaterial({ color: '#c0c6ca', metalness: .88, roughness: .26 });
    const rope = new THREE.MeshStandardMaterial({ color: '#516c76', roughness: .90, metalness: .02 });
    const shell = new THREE.MeshStandardMaterial({ color: '#101617', roughness: .74, metalness: .18 });
    const small = this.spec.bodyStyle === 'sedan', span = small ? .56 : .68;
    roundedBox(g, steel, 0, -.062, -.15, span + .07, .039, .34, .008);
    for (const side of [-1, 1]) {
      roundedBox(g, steel, side * (small ? .20 : .26), -.095, -.24, .065, .075, .34, .009);
      roundedBox(g, steel, side * .139, .076, -.078, .028, .169, .148, .012);
      cylinder(g, alloy, side * .194, 0, .005, .015, .019, 'z', 6);
      cylinder(g, alloy, side * .272, -.034, -.016, .013, .018, 'y', 6);
    }
    cylinder(g, steel, 0, .079, -.080, .061, .252, 'x', 32);
    for (let i = 0; i < 17; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.066, .005, 6, 28), rope);
      ring.rotation.y = Math.PI / 2; finish(ring, g, -.108 + i * .0135, .079, -.080);
    }
    cylinder(g, shell, -.228, .087, -.080, .076, .153, 'x', 28);
    cylinder(g, steel, .217, .087, -.080, .080, .130, 'x', 28);
    for (const x of [-.269, -.245, -.221, -.197]) cylinder(g, steel, x, .087, -.080, .079, .006, 'x', 28);
    roundedBox(g, shell, 0, .191, -.107, .236, .089, .139, .019);
    roundedBox(g, alloy, 0, .238, -.106, .154, .010, .078, .005);
    line(g, shell, [.116, .213, -.14], [.219, .146, -.10], .008);
    // Open hawse slot; the solver's exact shared anchor is its centre at z=0.
    for (const y of [-.040, .040]) roundedBox(g, alloy, 0, y, -.018, .375, .031, .041, .009);
    for (const side of [-1, 1]) roundedBox(g, alloy, side * .176, 0, -.018, .044, .080, .041, .010);
    roundedBox(g, steel, 0, -.115, -.066, .37, .028, .095, .007);
    mergeStaticMeshes(g); this.winchKit = g;
  }

  _disposeWinchKit() {
    if (!this.winchKit) return;
    const materials = new Set();
    this.winchKit.traverse(mesh => { mesh.geometry?.dispose(); if (mesh.material) materials.add(mesh.material); });
    materials.forEach(material => material.dispose()); this.winchKit.removeFromParent(); this.winchKit = null;
  }

  _suv(bronco) { return buildSUV(this, VEHICLE_GEOMETRY, bronco); }

  _fender(side, axle, half, bronco) {
    const m = this.materials, g = this.body, front = axle > 0;
    const outline = bronco
      ? [[-.577,.48],[-.551,.704],[-.423,.949],[-.271,1.034],[.265,1.034],[.426,.950],[.555,.709],[.578,.48]]
      : front
        ? [[-.591,.47],[-.548,.687],[-.403,.942],[-.244,1.042],[.285,1.047],[.464,1.025],[.615,.965]]
        : [[-.577,.47],[-.545,.70],[-.409,.948],[-.270,1.031],[.264,1.032],[.418,.941],[.554,.682],[.582,.47]];
    const curve = new THREE.CatmullRomCurve3(outline.map(([z,y]) => v3(0,y,axle+z)), false, 'centripetal');
    const reach = bronco ? .091 : .130, inner = half - (bronco ? .046 : .073);
    const molding=(u,v,face=false)=>{
      const p=curve.getPoint(u),t=curve.getTangent(u),width=bronco?.063:.052;
      const ny=t.z,nz=-t.y,outer=half+reach-.008*Math.sin(u*Math.PI);
      if(face)return [side*(outer+.005*Math.sin(v*Math.PI)),p.y-ny*v*width,p.z-nz*v*width];
      return [side*THREE.MathUtils.lerp(inner,outer,v),p.y+.032*(1-v*v),p.z];
    };
    surface(g, m.black, 76, 10, (u,v) => {
      return molding(u,v);
    }, side < 0);
    // The lip follows the normal of the arch all the way down its legs; a
    // simple vertical drop used to turn the ends into thin hanging strips.
    surface(g, m.black, 76, 7, (u,v) => {
      return molding(u,v,true);
    }, side < 0);
    surface(g,m.dark,76,4,(u,v)=>{
      const p=molding(u,1,true);return [THREE.MathUtils.lerp(p[0],side*inner,v),p[1]+.007*v,p[2]];
    },side>0);
    for(const u of [0,1])polygon(g,m.black,[molding(u,0),molding(u,1),molding(u,1,true),[side*inner,molding(u,1,true)[1]+.007,molding(u,1,true)[2]]]);
    const edge = Array.from({length:77},(_,i) => {const p=molding(i/76,.84,true);p[0]+=side*.0008;return p;});
    curvedLine(g,m.dark,edge,.0024);
    if (!bronco && front) {
      const lampX=half+.011,lampY=.956,lampZ=axle+.625;
      const outline=roundedOutline([[-.115,.030,0],[.110,.007,0],[.112,-.023,0],[.084,-.036,0],[-.115,-.026,0]],.009).map(([x,y])=>[side*(lampX+x),lampY+y]);
      const lampFace=(x,y)=>[x,y,lampZ-.019*((Math.abs(x)-lampX)/.115)**2];
      recessedOpening(g,m.black,m.dark,outline,lampFace,.018,.13);
      for(const y of [-.011,.008]){
        const pts=Array.from({length:25},(_,i)=>{const x=side*(lampX-.099+i/24*.178),p=lampFace(x,lampY+y-.020*i/24);p[2]-=.005;return p;});
        curvedLine(g,m.white,pts,.0042);
      }
      windowPanel(g,{black:m.black,glass:m.lens},outline.map(([x,y])=>lampFace(x,y)),.005,.002,{bow:.003});
      const sideMarker=roundedOutline([[.535,.937,0],[.608,.936,0],[.608,.965,0],[.541,.975,0]],.008).map(([z,y])=>[side*(half+.130),y,axle+z]);
      windowPanel(g,{black:m.black,glass:m.amber},sideMarker,.11,.003,{bow:.002});
      // Shaped dark extractor recess behind the front arch, following the
      // actual angled wing panel rather than a free-standing row of rods.
      const ventX=side*(half-.006),vent=roundedOutline([[axle-.452,1.069,0],[axle-.395,1.048,0],[axle-.476,.888,0],[axle-.544,.913,0]],.016);
      polygon(g,m.black,vent.map(([z,y])=>[ventX,y,z]));
      curvedLine(g,m.dark,[...vent,vent[0]].map(([z,y])=>[ventX+side*.003,y,z]),.0033);
      for(let i=0;i<6;i++)line(g,m.grille,[ventX+side*.002,1.046-i*.023,axle-.447-i*.012],[ventX+side*.002,1.035-i*.023,axle-.413-i*.012],.0025);
    }
    surface(g, m.black, 40, 4, (u,v) => {
      const a = Math.PI*u;
      return [side*(half-.24+v*.255),.437+Math.sin(a)*.488,axle+Math.cos(a)*.488];
    });
    const innerWall=[[side*(half-.243),.435,axle-.489]];
    for(let i=0;i<=40;i++){const a=Math.PI-i*Math.PI/40;innerWall.push([side*(half-.243),.437+Math.sin(a)*.488,axle+Math.cos(a)*.488]);}
    innerWall.push([side*(half-.243),.435,axle+.489]);polygon(g,m.dark,innerWall);
  }

  _roundHeadlamp(x, y, z, radius, bronco = false) {
    const g = this.body, m = this.materials;
    cylinder(g,m.black,x,y,z+.005,radius+.008,.064,'z',64);
    // Rolled annular bezel and a recessed optical bowl, not stacked bright discs.
    surface(g,m.dark,64,8,(u,v)=>{
      const a=u*Math.PI*2,r=radius*THREE.MathUtils.lerp(.91,1.045,v);
      return [x+Math.cos(a)*r,y+Math.sin(a)*r,z+.039+.010*Math.sin(v*Math.PI)];
    });
    surface(g,m.grille,64,14,(u,v)=>{
      const a=u*Math.PI*2,r=radius*.905*v;
      return [x+Math.cos(a)*r,y+Math.sin(a)*r,z+.009+.027*v*v];
    });
    const halo=new THREE.Mesh(new THREE.TorusGeometry(radius*.87,.0062,10,64),m.white);finish(halo,g,x,y,z+.050);
    for(const [dx,dy,scale] of bronco?[[0,.029,.31],[0,-.040,.26]]:[]){
      const rr=radius*scale;
      surface(g,m.chrome,32,8,(u,v)=>{const a=u*Math.PI*2,r=rr*v;return [x+dx+Math.cos(a)*r,y+dy+Math.sin(a)*r,z+.026+.014*v*v];});
      cylinder(g,m.headlampCore,x+dx,y+dy,z+.034,rr*.73,.009,'z',32);
      const optic=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),m.lens);optic.scale.set(rr*.68,rr*.68,.010);finish(optic,g,x+dx,y+dy,z+.041);
    }
    if(!bronco){
      // JL production LED optics: one large central projector in a horizontal
      // bridge, with upper/lower faceted reflector sections inside the halo.
      for(const side of [-1,1])surface(g,m.chrome,36,12,(u,v)=>{
        const a=(.16+u*.68)*Math.PI+(side<0?Math.PI:0),r=radius*THREE.MathUtils.lerp(.37,.79,v);
        const facet=.0018*Math.sin(u*Math.PI*12)*Math.sin(v*Math.PI);
        return [x+Math.cos(a)*r,y+Math.sin(a)*r,z+.018+.022*v*v+facet];
      });
      const projectorRadius=radius*.365;
      const bridge=roundedOutline([[-.795,-.425],[.795,-.425],[.795,.425],[-.795,.425]].map(([a,b])=>[x+a*radius,y+b*radius,0]),.012).map(([a,b])=>[a,b]);
      const aperture=Array.from({length:48},(_,i)=>[x+Math.cos(i*Math.PI/24)*projectorRadius*.94,y+Math.sin(i*Math.PI/24)*projectorRadius*.94]);
      perforatedFace(g,m.black,bridge,[aperture],(xx,yy)=>[xx,yy,z+.043+.004*(1-((xx-x)/(radius*.8))**2)],.024);
      for(const side of [-1,1]) {
        const pts=Array.from({length:25},(_,i)=>{
          const xx=(i/12-1)*radius*.745;
          return [x+xx,y+side*radius*.401,z+.053+.002*(1-(xx/(radius*.75))**2)];
        });
        curvedLine(g,m.satinMetal||m.chrome,pts,.0026);
      }
      surface(g,m.chrome,40,10,(u,v)=>{const a=u*Math.PI*2,r=projectorRadius*THREE.MathUtils.lerp(.75,1.08,v);return [x+Math.cos(a)*r,y+Math.sin(a)*r,z+.042+.008*Math.sin(v*Math.PI)];});
      cylinder(g,m.headlampCore,x,y,z+.045,projectorRadius*.94,.008,'z',40);
      const projector=new THREE.Mesh(new THREE.SphereGeometry(1,36,20),m.lens);projector.scale.set(projectorRadius,projectorRadius,.019);finish(projector,g,x,y,z+.049);
      // Tiny optical highlights remain recessed behind the cover.
      cylinder(g,m.satinMetal,x-projectorRadius*.18,y+projectorRadius*.13,z+.050,projectorRadius*.15,.002,'z',16);
    }
    surface(g,m.lens,72,14,(u,v)=>{
      const a=u*Math.PI*2,r=radius*.965*v;
      return [x+Math.cos(a)*r,y+Math.sin(a)*r,z+.059+.008*(1-v*v)];
    });
  }

  _interior({ frontZ, rearZ, floor, dashY, dashZ, width, seatY, roofY, rearSeatY=seatY, rearBackHeight=.48, rearHeadrest={}, doorCards=true, dashboard=true, centerConsole=true }) {
    const g=this.body,m=this.materials,style=this.spec.bodyStyle,van=style==='van',sedan=style==='sedan';
    const cloth=m.upholstery||m.interior;
    const signedPower=(v,p)=>Math.sign(v)*Math.abs(v)**p;
    const seatShell=(x,z,seatWidth,low,height,bench=false)=>{
      const shapeY=.46,shapeX=.45,shapeZ=.50;
      const point=(qx,qy,qz)=>{
        const v=(signedPower(qy,shapeY)+1)/2,hx=seatWidth*.5*(1-(bench?.035:.14)*v+.020*Math.sin(v*Math.PI));
        const xx=signedPower(qx,shapeX)*hx,bolster=qz>0&&!bench?.026*Math.exp(-Math.pow((Math.abs(xx/hx)-.74)/.20,2))*Math.sin(v*Math.PI):0;
        return [x+xx,low+v*height,z-.280-.110*v+signedPower(qz,shapeZ)*.064+bolster];
      };
      // A continuous upholstered form wraps the shoulder, side bolsters and
      // rear shell. This removes the previous vertical slab ends and flat cap.
      const geometry=new THREE.SphereGeometry(1,40,28),p=geometry.attributes.position;
      for(let i=0;i<p.count;i++)p.setXYZ(i,...point(p.getX(i),p.getY(i),p.getZ(i)));
      geometry.computeVertexNormals();finish(new THREE.Mesh(geometry,cloth),g);
      // The separate inset grid needs a small fabric thickness above the
      // shell's own facets; one millimetre let their interpolated faces cross.
      const front=(u,v,offset=.003)=>{
        const qy=signedPower(v*2-1,1/shapeY),span=Math.sqrt(Math.max(0,1-qy*qy));
        const p=point(u*span,qy,Math.sqrt(Math.max(0,1-u*u))*span);p[2]+=offset;return p;
      };
      if(!bench){
        surface(g,m.interior,22,22,(u,v)=>front((u*2-1)*.50,THREE.MathUtils.lerp(.105,.87,v)));
        for(const side of [-1,1])curvedLine(g,m.interior,Array.from({length:25},(_,i)=>front(side*.58,.105+i/24*.770,.004)),.0015);
        for(const y of [.36,.64])curvedLine(g,cloth,Array.from({length:19},(_,i)=>front((i/9-1)*.49,y,.004)),.0011);
      }else{
        for(const side of [-1,1])curvedLine(g,m.interior,Array.from({length:25},(_,i)=>front(side*.38,.09+i/24*.81,.002)),.0017);
        curvedLine(g,m.interior,Array.from({length:41},(_,i)=>front((i/20-1)*.89,.42,.002)),.0013);
      }
    };
    const seatBack=(x,z,seatWidth,rear=false,center=false)=>{
      const height=rear?rearBackHeight:.53,low=(rear?rearSeatY:seatY)-.035;
      if(!(rear&&sedan))seatShell(x,z,seatWidth,low,height);
      const headY=low+height+(rear?(rearHeadrest.lift??.100):.100),headZ=z-.362;
      const headWidth=rear?(center?(rearHeadrest.centerWidth??rearHeadrest.width??.235):(rearHeadrest.width??.235)):van?.244:style==='bronco'?.251:sedan?.246:.232;
      const headHeight=rear?(center?(rearHeadrest.centerHeight??rearHeadrest.height??.169):(rearHeadrest.height??.169)):van?.209:style==='bronco'?.213:sedan?.193:.207;
      const headDepth=rear?.129:van?.151:style==='bronco'?.162:sedan?.140:.154;
      // A formed cushion has rounded shoulders, a narrower crown and a
      // convex front face. The posts emerge from its underside, not its face.
      const headPoint=(qx,qy,qz)=>{
        const t=signedPower(qy,.48);
        return [signedPower(qx,.43)*headWidth*.5*(1-.08*(t+1)/2),t*headHeight*.5,signedPower(qz,.55)*headDepth*.5-.015*t];
      };
      const headGeo=new THREE.SphereGeometry(1,36,24),hp=headGeo.attributes.position;
      for(let i=0;i<hp.count;i++){
        hp.setXYZ(i,...headPoint(hp.getX(i),hp.getY(i),hp.getZ(i)));
      }
      headGeo.computeVertexNormals();finish(new THREE.Mesh(headGeo,cloth),g,x,headY,headZ);
      for(const dx of [-headWidth*.265,headWidth*.265]){
        cylinder(g,m.chrome,x+dx,headY-headHeight*.46-.038,headZ+.003,.005,.100,'y',10);
        cylinder(g,m.black,x+dx,low+height+.005,headZ+.003,.013,.009,'y',12);
      }
      const headSeam=Array.from({length:65},(_,i)=>{
        const a=i*Math.PI/32,r=.77,p=headPoint(Math.cos(a)*r,Math.sin(a)*r,Math.sqrt(1-r*r));
        return [x+p[0],headY+p[1],headZ+p[2]+.001];
      });
      curvedLine(g,m.interior,headSeam,.0013);
    };
    const cushion=(x,z,seatWidth)=>{
      roundedBox(g,m.interior,x,seatY-.158,z+.014,seatWidth,.114,.477,.04);
      surface(g,cloth,22,24,(u,v)=>{
        const t=u*2-1,zz=(v-.5)*.48;
        const bolster=.035*Math.exp(-Math.pow((Math.abs(t)-.83)/.20,2));
        return [x+t*(seatWidth*.5-.01),seatY-.100+bolster+.016*Math.sin(v*Math.PI)-.013*Math.cos(v*Math.PI),z+zz];
      },true);
      for(const side of [-1,1])line(g,m.interior,[x+side*seatWidth*.29,seatY-.078,z-.18],[x+side*seatWidth*.29,seatY-.085,z+.18],.0016);
    };
    for(const side of [-1,1]){
      const x=side*width*.27;
      cushion(x,frontZ,.458);seatBack(x,frontZ,.465);
      roundedBox(g,m.black,x,floor+.13,frontZ-.04,.36,.22,.37,.016);
      for(const dx of [-.15,.15])roundedBox(g,m.dark,x+dx,floor+.032,frontZ-.025,.032,.026,.62,.003);
      const buckle=roundedBox(g,m.black,x-side*.238,seatY-.047,frontZ-.03,.030,.080,.049,.006);buckle.rotation.z=side*.15;
      roundedBox(g,m.redPaint,x-side*.238,seatY-.003,frontZ-.03,.022,.008,.031,.002);
    }
    // The Sport sedan has a continuous rear backrest and three head restraints.
    roundedBox(g,cloth,0,rearSeatY-.13,rearZ,width*.92,.17,.47,.045);
    if(sedan)seatShell(0,rearZ,width*.94,rearSeatY-.035,rearBackHeight,true);
    for(const side of [-1,0,1])seatBack(side*width*.295,rearZ,width*.30,true,side===0);
    if(!van&&centerConsole) roundedBox(g,m.black,0,floor+.22,frontZ-.14,.235,.24,.66,.028);
    box(g,m.interior,0,floor,(frontZ+rearZ)/2,width*.98,.035,Math.abs(frontZ-rearZ)+.73);
    const cabinLength=dashZ-rearZ+.40;
    for(const side of [-1,1]){
      if(doorCards){
        roundedBox(g,m.black,side*width*.513,(dashY+floor)/2,(dashZ+rearZ-.4)/2,.028,dashY-floor-.025,cabinLength,.010);
        roundedBox(g,m.interior,side*width*.493,seatY+.038,frontZ,.095,.050,.47,.015);
        line(g,m.chrome,[side*width*.485,seatY+.108,frontZ+.06],[side*width*.485,seatY+.108,frontZ+.205],.006);
      }
      line(g,m.black,[side*width*.495,seatY+.39,frontZ-.28],[side*width*.481,seatY-.07,frontZ-.04],.016);
    }
    if(dashboard){
    roundedBox(g,m.black,0,dashY,dashZ,width,.169,.29,.039);
    roundedBox(g,m.interior,0,dashY-.070,dashZ-.124,width*.96,.125,.076,.022);
    const screenMaterial=m.screen||m.dark;
    if(sedan){
      roundedBox(g,m.black,0,dashY+.120,dashZ-.095,.205,.131,.030,.009);
      roundedBox(g,screenMaterial,0,dashY+.130,dashZ-.114,.153,.092,.006,.003);
      for(const x of [-.081,.081])cylinder(g,m.grille,x,dashY+.072,dashZ-.121,.010,.010,'z',16);
      roundedBox(g,m.grille,0,dashY-.015,dashZ-.174,width*.86,.053,.012,.006);
      for(let i=-26;i<=26;i++)line(g,m.black,[i*width*.016,-.012+dashY,dashZ-.183],[i*width*.016+.014,.010+dashY,dashZ-.183],.0016);
    } else {
      const screenWidth=van?.238:style==='bronco'?.430:.405,screenHeight=van?.146:style==='bronco'?.255:.183;
      roundedBox(g,m.black,0,dashY+.038,dashZ-.164,screenWidth+.032,screenHeight+.029,.035,.008);
      roundedBox(g,screenMaterial,0,dashY+.041,dashZ-.184,screenWidth,screenHeight,.007,.004);
      for(const x of [-width*.41,-width*.23,width*.23,width*.41]){
        cylinder(g,m.grille,x,dashY+.024,dashZ-.166,.042,.016,'z',20);
        cylinder(g,m.black,x,dashY+.024,dashZ-.178,.031,.008,'z',20);
        for(const y of [-.018,0,.018])line(g,m.interior,[x-.025,dashY+.024+y,dashZ-.187],[x+.025,dashY+.024+y,dashZ-.187],.0024);
      }
    }
    for(const x of [-.105,0,.105]){
      cylinder(g,m.grille,x,dashY-.151,dashZ-.178,.026,.019,'z',16);
      cylinder(g,m.black,x,dashY-.151,dashZ-.191,.020,.012,'z',16);
    }
    const steering=new THREE.Group();steering.position.set(width*.27,dashY+.012,dashZ-.35);steering.rotation.x=-.22;g.add(steering);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.147,.016,10,48),m.black);steering.add(ring);
    roundedBox(steering,m.interior,0,0,.004,.111,.093,.036,.019);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3+Math.PI/2;line(steering,m.black,[0,0,0],[Math.sin(a)*.135,Math.cos(a)*.135,0],.020);}
    for(const side of [-1,1]) roundedBox(steering,m.dark,side*.085,.004,.012,.041,.030,.012,.004);
    const binnacle=roundedBox(g,m.black,width*.27,dashY+.073,dashZ-.142,.275,.119,.107,.026);
    for(const dx of [-.068,.068]){
      cylinder(g,m.dark,width*.27+dx,dashY+.064,dashZ-.205,.047,.008,'z',26);
      for(let i=0;i<9;i++){const a=(i/8*1.4-.70)*Math.PI;line(g,m.headliner,[width*.27+dx+Math.sin(a)*.037,dashY+.064+Math.cos(a)*.037,dashZ-.211],[width*.27+dx+Math.sin(a)*.032,dashY+.064+Math.cos(a)*.032,dashZ-.211],.0011);}
      line(g,m.redPaint,[width*.27+dx,dashY+.064,dashZ-.213],[width*.27+dx-.020,dashY+.086,dashZ-.213],.0018);
    }
    }
    if(Number.isFinite(roofY)){
      roundedBox(g,m.headliner,0,roofY,(frontZ+rearZ)/2,width*.76,.022,Math.abs(frontZ-rearZ)+.38,.017);
      roundedBox(g,m.black,0,roofY-.08,dashZ-.16,.21,.074,.026,.013);
    }
  }

  _sedan() { return buildCivic(this, VEHICLE_GEOMETRY); }

  _hondaBadge(parent, x, y, z, size, rear) {
    const g = new THREE.Group(); g.position.set(x, y, z); if (rear) g.rotation.y = Math.PI; parent.add(g);
    const m = this.materials;
    const outline=roundedOutline([[-.405,-.410,0],[.405,-.410,0],[.515,.402,0],[-.515,.402,0]].map(p=>p.map(v=>v*size)),size*.18,8);
    curvedLine(g,m.chrome,[...outline,outline[0]],size*.026);
    // Tapered uprights and the connected bridge preserve the squared Honda
    // emblem silhouette in the fascia, trunk badge and small wheel centers.
    const h=[[-.335,.305],[-.226,-.302],[-.105,-.302],[-.128,-.026],[.128,-.026],[.105,-.302],[.226,-.302],[.335,.305],[.191,.305],[.148,.054],[-.148,.054],[-.191,.305]];
    const shape=new THREE.Shape();h.forEach(([a,b],i)=>shape[i?'lineTo':'moveTo'](a*size,b*size));shape.closePath();
    finish(new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:size*.025,bevelEnabled:true,bevelSize:size*.008,bevelThickness:size*.008,bevelSegments:2,steps:1}),m.chrome),g,0,0,size*.009);
  }

  _van() { return buildSprinter(this, VEHICLE_GEOMETRY); }

  _underbody() {
    if (this.spec.powertrain === 'electric' && this.spec.bodyStyle === 'hummer') return buildHummerUnderbody(this, VEHICLE_GEOMETRY);
    const g = this.body, m = this.materials, spec = this.spec, wb = spec.wheelbase;
    const floor = (spec.visualBase?.clearance ?? spec.clearance) + .14, front = wb / 2, rear = -front;
    const wheelDatum = spec.visualBase?.tireRadius ?? spec.tireRadius;
    const modes = spec.driveModes || [], frontDriven = modes.some(mode => mode === 'FWD' || mode.startsWith('4'));
    const rearDriven = modes.some(mode => mode === 'RWD' || mode === '2H' || mode.startsWith('4'));
    this.root.userData.visualModel.drivenAxles = { front: frontDriven, rear: rearDriven };
    const exhaust = new THREE.MeshStandardMaterial({ color: '#68655b', metalness: .67, roughness: .67 });
    const propeller = (a, axle) => {
      const type=axle?spec.suspension?.rearType:spec.suspension?.frontType;
      this._driveLink(a,type?.includes('solid')?{axle}:{body:[0,wheelDatum+.018,axle?rear:front]},.037);
    };
    // Fixed independent differentials and moving half-shafts remain attached
    // to the actual upgraded wheel rig; they do not stretch with the body lift.
    for (let axle = 0; axle < 2; axle++) {
      const driven = axle ? rearDriven : frontDriven, type = axle ? spec.suspension?.rearType : spec.suspension?.frontType;
      if (!driven || type?.includes('solid')) continue;
      const z = axle ? rear : front, y = wheelDatum + .018;
      roundedBox(g,m.dark,0,y,z,.264,.184,.226,.038);
      for (let side = 0; side < 2; side++) this._driveLink([(side ? -1 : 1)*.11,y,z], { wheel: axle*2+side }, .025);
    }
    if (spec.bodyStyle === 'sedan') {
      // A front-drive Civic has a stamped unibody and transverse transaxle;
      // there is no rear differential, transfer case or longitudinal propshaft.
      box(g,m.black,0,floor+.031,-.10,spec.width*.83,.052,wb+1.07);
      for(const side of [-1,1]) {
        roundedBox(g,m.dark,side*.699,floor-.004,-.17,.087,.084,wb+.12,.013);
        for(const z of [-.75,-.11,.61]) roundedBox(g,m.dark,side*.322,floor-.014,z,.583,.044,.061,.007);
      }
      roundedBox(g,m.dark,-.16,floor+.045,front+.025,.98,.218,.49,.035);
      roundedBox(g,m.black,0,floor-.018,front-.062,1.20,.045,.80,.020);
      for(const side of [-1,1]) {
        line(g,m.dark,[side*.45,floor-.015,rear-.10],[side*.62,floor-.025,rear+.25],.031);
        line(g,m.dark,[side*.46,floor-.009,front-.28],[side*.64,floor-.015,front+.17],.036);
      }
      roundedBox(g,m.dark,0,floor-.007,rear+.04,.98,.071,.12,.014);
      roundedBox(g,m.black,-.21,floor+.002,rear+.56,.80,.12,.62,.031);
      curvedLine(g,exhaust,[[.24,floor-.035,front-.1],[.19,floor-.033,.27],[.30,floor-.036,-.44],[.54,floor-.018,rear-.40]],.022,true);
      roundedBox(g,exhaust,.49,floor-.016,rear-.47,.34,.10,.36,.020);
      if (rearDriven) {
        roundedBox(g,m.dark,.04,floor+.035,front-.33,.232,.181,.256,.028);
        propeller([.04,floor+.023,front-.44],1);
        roundedBox(g,m.dark,0,wheelDatum+.028,rear,.309,.214,.280,.036);
      }
      this.root.userData.visualModel.underbody = rearDriven ? 'transverse unibody with simulated rear-drive conversion' : 'transverse front-drive unibody';
      return;
    }
    const van = spec.bodyStyle === 'van', railX = van ? .568 : .452;
    box(g,m.black,0,floor+.115,van?-.18:-.045,spec.width*.75,.054,wb+(van?1.55:.59));
    for(const side of [-1,1]) {
      // Longitudinal rails rise over the rear axle; boxed crossmembers and
      // attached protective plates are kept distinct from the live axle rig.
      profile(g,m.dark,[[rear-.58,floor+.055],[rear-.28,floor+.116],[rear+.20,floor+.124],[rear+.49,floor+.04],[front-.26,floor+.035],[front+.36,floor+.056],[front+.36,floor+.19],[rear+.45,floor+.19],[rear+.17,floor+.264],[rear-.34,floor+.246],[rear-.58,floor+.186]],van?.099:.113,.007).position.x=side*railX;
    }
    for(const z of [rear+.34,-.45,.40,front-.27]) roundedBox(g,m.dark,0,floor+.030,z,railX*2+.10,.091,.096,.011);
    roundedBox(g,m.dark,0,floor+.015,front-.03,.52,.19,.59,.038);
    roundedBox(g,m.dark,0,floor+.045,front-.58,.25,.17,.53,.025);
    if(van) {
      propeller([0,floor-.043,front-.84],1);
      if (frontDriven) {
        roundedBox(g,m.dark,-.05,floor+.018,.53,.327,.222,.375,.033);
        propeller([-.07,floor+.016,.64],0);
      }
      roundedBox(g,m.black,.435,floor+.047,-.14,.42,.198,1.19,.035);
      for(const side of [-1,1]) for(const z of [rear-.54,rear+.53]) roundedBox(g,m.dark,side*.663,floor+.052,z,.105,.17,.121,.011);
      curvedLine(g,exhaust,[[.255,floor-.012,front+.05],[.35,floor-.006,.45],[.61,floor+.043,-.98],[.86,floor+.10,rear-.41]],.028,true);
      roundedBox(g,exhaust,.35,floor+.018,.33,.271,.171,.49,.027);
      this.root.userData.visualModel.underbody = frontDriven ? 'van integrated rails with simulated transfer-case/front-drive conversion' : 'rear-drive van integrated rails';
    } else {
      roundedBox(g,m.dark,-.09,floor+.014,.17,.40,.21,.33,.040);
      propeller([-.06,floor-.025,.19],1);
      propeller([-.11,floor+.010,.30],0);
      roundedBox(g,m.dark,.47,floor+.073,-.40,.32,.153,1.04,.024);
      roundedBox(g,m.dark,0,floor-.075,.05,.76,.029,.70,.011);
      const pan=roundedBox(g,m.dark,0,floor-.011,front+.13,.93,.030,.42,.010);pan.rotation.x=-.18;
      curvedLine(g,exhaust,[[.29,floor+.079,front+.12],[.34,floor+.02,.29],[.66,floor+.07,rear-.09],[.63,floor+.04,rear-.56]],.027,true);
      roundedBox(g,exhaust,.44,floor+.091,rear-.49,.70,.155,.235,.030);
      this.root.userData.visualModel.underbody = 'four-wheel-drive ladder frame';
    }
  }

  _driveLink(bodyPoint, target, radius) {
    const group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,1,10),this.materials.dark);
    group.name = target.wheel === undefined ? 'articulating-propshaft' : 'articulating-halfshaft';
    const a = new THREE.Mesh(new THREE.SphereGeometry(radius*1.5,10,6),this.materials.dark), b=a.clone();
    mesh.castShadow=true; group.add(mesh,a,b); this.scene.add(group);
    this.driveLinks.push({group,mesh,a,b,bodyPoint,target});
  }

  _wheel(spare = false) {
    if (this.spec.tracks && !spare) {
      const module = createTrackModule(this.spec, this.materials);
      mergeStaticMeshes(module.root); return module;
    }
    const spec = this.spec, m = this.materials, radius = spec.tireRadius, width = spare && spec.tracks ? spec.visualBase.tireWidth : spec.tireWidth;
    const root = new THREE.Group(), tireShape = new THREE.Group(), tireSpin = new THREE.Group(), rimSpin = new THREE.Group();
    root.add(tireShape, rimSpin); tireShape.add(tireSpin);
    const rimInches = Number(spec.tireSize?.match(/R(\d+)/)?.[1]) || (spec.bodyStyle === 'sedan' ? 18 : spec.bodyStyle === 'van' ? 16 : 17);
    const rimRadius = (spec.rimDiameter || rimInches * 0.0254) / 2;
    const tireProfile = (spare && spec.tracks ? spec.visualBase.tireType : spec.tireType) || (spec.bodyStyle === 'jeep' || spec.bodyStyle === 'bronco' ? 'all-terrain' : 'all-season');
    const mud = tireProfile === 'mud-terrain', sand = tireProfile === 'sand', allTerrain = tireProfile === 'all-terrain';
    const offroad = mud || sand || allTerrain, performance = tireProfile === 'road-performance';
    const depth = mud ? .018 : sand ? .014 : allTerrain ? .011 : performance ? .006 : .007;
    const sidewallMid = THREE.MathUtils.lerp(rimRadius * 1.045, radius, .45);
    const pts = [[rimRadius*.97,-width*.425],[rimRadius*1.045,-width*.447],[sidewallMid,-width*.495],[radius*.880,-width*.516],[radius*.947,-width*.484],[radius*.982,-width*.413],[radius,-width*.31],[radius,-width*.15],[radius,0],[radius,width*.15],[radius,width*.31],[radius*.982,width*.413],[radius*.947,width*.484],[radius*.880,width*.516],[sidewallMid,width*.495],[rimRadius*1.045,width*.447],[rimRadius*.97,width*.425]];
    const rubber = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r,x])=>new THREE.Vector2(r - depth * THREE.MathUtils.smoothstep(r / radius, 0.82, 1), x)),72),m.rubber);rubber.rotation.z=Math.PI/2;tireSpin.add(rubber);rubber.castShadow=true;rubber.receiveShadow=true;
    const count = mud ? 32 : sand ? 25 : allTerrain ? 48 : performance ? 82 : 72, rows = sand ? 4 : mud ? 3 : 5;
    const blockWidth = width * (sand ? .213 : mud ? .268 : allTerrain ? .162 : .143);
    const blockLength = radius * (sand ? .056 : mud ? .104 : allTerrain ? .071 : .038);
    // Distinct three-dimensional carcass/tread patterns. Mud lugs have open
    // channels, sand bars span a broad crown, and road patterns use close ribs.
    const treadShape = new THREE.Shape(), bw = blockWidth / 2, bl = blockLength / 2, cut = Math.min(bw, bl) * .25;
    treadShape.moveTo(-bw + cut,-bl); treadShape.lineTo(bw-cut,-bl); treadShape.lineTo(bw,-bl+cut);
    treadShape.lineTo(bw,bl-cut); treadShape.lineTo(bw-cut,bl); treadShape.lineTo(-bw+cut,bl);
    treadShape.lineTo(-bw,bl-cut); treadShape.lineTo(-bw,-bl+cut); treadShape.closePath();
    const blockGeometry = new THREE.ExtrudeGeometry(treadShape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
    blockGeometry.translate(0,0,-depth/2); blockGeometry.rotateX(Math.PI/2);
    const blocks=new THREE.InstancedMesh(blockGeometry,m.tread,count*rows);
    const dummy=new THREE.Object3D();
    for(let row=0;row<rows;row++) for(let i=0;i<count;i++) {
      const sideOfCentre = row < (rows-1)/2 ? 1 : -1;
      const phase = sand ? Math.abs(row-(rows-1)/2)*.26 : (row%2)*.48;
      const a=(i+phase)*Math.PI*2/count, shoulder=Math.abs(row-(rows-1)/2)/((rows-1)/2);
      const rad=radius*(1-shoulder*shoulder*.017)-depth/2, x=(row-(rows-1)/2)*width*(sand?.219:mud?.306:.173);
      dummy.position.set(x,Math.cos(a)*rad,Math.sin(a)*rad);
      dummy.rotation.set(a,sideOfCentre*(sand?.42:mud?.40:allTerrain?.24:.18),0);dummy.updateMatrix();blocks.setMatrixAt(row*count+i,dummy.matrix);
    }
    blocks.castShadow=true;blocks.receiveShadow=true;tireSpin.add(spare ? blocks : bakeTreadInstances(blocks));
    const barrelProfile=[[.922,-.425],[.974,-.436],[.990,-.39],[.948,-.32],[.948,.32],[.990,.39],[.974,.436],[.922,.425]].map(([r,x])=>new THREE.Vector2(r*rimRadius,x*width));
    const barrel=new THREE.Mesh(new THREE.LatheGeometry(barrelProfile,64),m.dark);barrel.rotation.z=Math.PI/2;rimSpin.add(barrel);barrel.castShadow=true;
    for(const side of [-1,1]) {
      const face=side*width*.443;
      const lip=new THREE.Mesh(new THREE.TorusGeometry(rimRadius*.969,.009,8,48),spec.bodyStyle==='jeep'?m.satinMetal:m.rim);lip.rotation.y=Math.PI/2;finish(lip,rimSpin,face,0,0);
      const bead=new THREE.Mesh(new THREE.TorusGeometry(rimRadius*1.055,.005,6,48),m.rubber);bead.rotation.y=Math.PI/2;finish(bead,tireSpin,side*width*.454,0,0);
      for(const rr of [radius*.77,radius*.86]) {const ring=new THREE.Mesh(new THREE.TorusGeometry(rr,.0023,4,48),m.tread);ring.rotation.y=Math.PI/2;finish(ring,tireSpin,side*width*.513,0,0);}
      // Vented brake disc is behind the wheel spokes; its scale remains independent of air pressure.
      cylinder(rimSpin,m.brakeDisc,face*.78,0,0,rimRadius*.740,.018,'x',40);
      cylinder(rimSpin,m.dark,face*.91,0,0,rimRadius*.320,.030,'x',32);
      if(spec.bodyStyle==='van') {
        const outline=Array.from({length:72},(_,i)=>[Math.cos(i*Math.PI/36)*rimRadius*.92,Math.sin(i*Math.PI/36)*rimRadius*.92]);
        const holes=Array.from({length:12},(_,i)=>{
          const a=i*Math.PI/6,cy=Math.cos(a)*rimRadius*.755,cz=Math.sin(a)*rimRadius*.755;
          return Array.from({length:20},(_,j)=>[cy+Math.cos(j*Math.PI/10)*rimRadius*.088,cz+Math.sin(j*Math.PI/10)*rimRadius*.088]);
        });
        const dishStations=[[0,.72],[.33,.74],[.52,.88],[.70,1.0],[.80,.99],[.92,.93]];
        const sample=(y,z)=>[face*interpolate(dishStations,Math.hypot(y,z)/rimRadius,1),y,z];
        const dish=perforatedFace(rimSpin,m.rim,outline,holes,sample);
        if(side<0){
          const indices=dish.geometry.index.array;for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
          dish.geometry.computeVertexNormals();
        }
        for(const hole of holes) for(let i=0;i<hole.length;i++){
          const a=sample(...hole[i]),b=sample(...hole[(i+1)%hole.length]);
          const wall=[a,b,[b[0]-side*.004,b[1],b[2]],[a[0]-side*.004,a[1],a[2]]];
          panel(rimSpin,m.rim,side<0?wall.reverse():wall);
        }
      } else if(spec.bodyStyle==='hummer') {
        // Eight-lug 18-inch Extreme Off-Road wheel: broad black spokes with
        // machined outer faces. No beadlock hardware from the Omega package.
        for(let i=0;i<8;i++){
          const angle=i*Math.PI/4;
          const pr=[[-rimRadius*.157,rimRadius*.33],[rimRadius*.157,rimRadius*.33],[rimRadius*.181,rimRadius*.69],[rimRadius*.248,rimRadius*.86],[rimRadius*.207,rimRadius*.955],[-rimRadius*.207,rimRadius*.955],[-rimRadius*.248,rimRadius*.86],[-rimRadius*.181,rimRadius*.69]];
          const spoke=profile(rimSpin,m.rim,pr,.044,.005);spoke.position.x=face;spoke.rotation.x=angle;
          const strip=[[-rimRadius*.211,rimRadius*.815],[-rimRadius*.151,rimRadius*.676],[-rimRadius*.139,rimRadius*.483],[-rimRadius*.082,rimRadius*.483],[-rimRadius*.084,rimRadius*.692],[-rimRadius*.141,rimRadius*.850],[-rimRadius*.125,rimRadius*.914],[-rimRadius*.181,rimRadius*.914]];
          for(const branch of [-1,1]){const shine=profile(rimSpin,m.satinMetal,strip.map(([z,y])=>[z*branch,y]),.003,.001);shine.position.x=face+side*.027;shine.rotation.x=angle;}
        }
      } else {
        const spokes=spec.bodyStyle==='bronco'?6:5,split=spec.bodyStyle==='sedan'||spec.bodyStyle==='bronco'||spec.bodyStyle==='jeep',jeep=spec.bodyStyle==='jeep';
        for(let i=0;i<spokes;i++) {
          const a=i*Math.PI*2/spokes;
          if(split) {
            const stem=profile(rimSpin,m.rim,[[-rimRadius*(jeep?.12:.068),rimRadius*.22],[rimRadius*(jeep?.12:.068),rimRadius*.22],[rimRadius*(jeep?.105:.083),rimRadius*.51],[-rimRadius*(jeep?.105:.078),rimRadius*.51]],.038,.0035);stem.position.x=face;stem.rotation.x=a;
            for(const branch of [-1,1]) {
              const spread=jeep?.235:.195,thickness=jeep?.073:.040;
              const pr=[[rimRadius*(branch*.040-thickness),rimRadius*.43],[rimRadius*(branch*.040+thickness),rimRadius*.43],[rimRadius*(branch*spread+thickness),rimRadius*.94],[rimRadius*(branch*spread-thickness),rimRadius*.94]];
              const spoke=profile(rimSpin,m.rim,pr,.035,.0035);spoke.position.x=face;spoke.rotation.x=a;
              if(jeep){
                const lip=.025,polished=[[rimRadius*(branch*.040-thickness+lip),rimRadius*.45],[rimRadius*(branch*.040+thickness-lip),rimRadius*.45],[rimRadius*(branch*spread+thickness-lip),rimRadius*.92],[rimRadius*(branch*spread-thickness+lip),rimRadius*.92]];
                const inset=profile(rimSpin,m.satinMetal,polished,.002,.0005);inset.position.x=face+side*.023;inset.rotation.x=a;
              }
            }
          } else {
            const pr=[[-rimRadius*.14,rimRadius*.24],[rimRadius*.14,rimRadius*.24],[rimRadius*.089,rimRadius*.90],[-rimRadius*.125,rimRadius*.90]];
            const spoke=profile(rimSpin,m.rim,pr,.040,.005);spoke.position.x=face;spoke.rotation.x=a;
            const accent=profile(rimSpin,m.chrome,[[-rimRadius*.106,rimRadius*.50],[-rimRadius*.069,rimRadius*.48],[-rimRadius*.069,rimRadius*.85],[-rimRadius*.10,rimRadius*.85]],.003,.001);accent.position.x=face+side*.025;accent.rotation.x=a;
          }
        }
      }
      cylinder(rimSpin,m.rim,face+side*.009,0,0,rimRadius*(spec.bodyStyle==='hummer'?.475:.294),.040,'x',32);
      cylinder(rimSpin,spec.bodyStyle==='van'?m.dark:m.black,face+side*.032,0,0,rimRadius*(spec.bodyStyle==='hummer'?.200:.171),.012,'x',28);
      const lugs=spec.bodyStyle==='hummer'?8:spec.bodyStyle==='van'||spec.bodyStyle==='bronco'?6:5;
      for(let i=0;i<lugs;i++){
        const a=i*Math.PI*2/lugs,boltCircle=spec.bodyStyle==='hummer'?.36:.230,y=Math.cos(a)*rimRadius*boltCircle,z=Math.sin(a)*rimRadius*boltCircle;
        cylinder(rimSpin,m.dark,face+side*.028,y,z,.014,.015,'x',20);
        cylinder(rimSpin,m.chrome,face+side*.039,y,z,.010,.016,'x',6);
      }
      if(spec.bodyStyle==='sedan'){
        const badge=new THREE.Group();badge.position.set(face+side*.043,0,0);badge.rotation.y=side*Math.PI/2;rimSpin.add(badge);
        this._hondaBadge(badge,0,0,0,.048,false);
      }
      const valveAngle=.29;
      const valve=cylinder(rimSpin,m.black,face+side*.006,Math.cos(valveAngle)*rimRadius*.872,Math.sin(valveAngle)*rimRadius*.872,.006,.027,'x',10);
      if(offroad) for(let i=0;i<28;i++) {
        const a=i*Math.PI*2/28;
        const mark=box(tireSpin,m.tread,side*width*.507,Math.cos(a)*radius*.915,Math.sin(a)*radius*.915,.008,.023,.026);mark.rotation.x=a;
      }
    }
    mergeStaticMeshes(tireSpin);mergeStaticMeshes(rimSpin);
    const deformation = spare ? null : new TireDeformer(tireSpin, { radius, width, rimRadius });
    root.userData.tire = { profile: tireProfile, radius, width, rimRadius, treadDepth: depth, circumferentialBlocks: count, rows };
    return {root,tireShape,tireSpin,rimSpin,spare,deformation,rimRadius};
  }

  update(state, opts = {}) {
    if (opts.paint) this.setPaint(opts.paint);
    if (typeof opts.winchEnabled === 'boolean') this.setWinchEnabled(opts.winchEnabled);
    if (!state?.position) return;
    const p = state.position, q = state.quaternion || state.orientation || { x: 0, y: 0, z: 0, w: 1 };
    this.root.position.set(p.x, p.y, p.z); this.root.quaternion.set(q.x, q.y, q.z, q.w);
    const pressures = state.pressures || opts.pressures || [opts.pressure || this.spec.stockPSI, opts.pressure || this.spec.stockPSI, opts.pressure || this.spec.stockPSI, opts.pressure || this.spec.stockPSI];
    this.damageView.update(state.damage);
    const wheels = state.wheels || [];
    wheels.forEach((data, i) => {
      const view = this.wheels[i]; if (!view || !data.position) return;
      view.root.position.set(data.position.x, data.position.y, data.position.z);
      this._steer.setFromAxisAngle(UP, data.steer || 0);
      view.root.quaternion.copy(this.root.quaternion).multiply(this._steer);
      const suspensionDamage = clamp(data.damageSuspension ?? state.damage?.suspension?.[i] ?? 0, 0, 1);
      if (suspensionDamage > 0.08) {
        this._damageTilt.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (i % 2 ? -1 : 1) * suspensionDamage * 0.115);
        view.root.quaternion.multiply(this._damageTilt);
      }
      if (view.track) view.track.update(data);
      else { view.tireSpin.rotation.x = data.rotation || 0; view.rimSpin.rotation.x = data.rotation || 0; }
      const psi = data.pressure ?? ((i < 2 ? state.frontPSI : state.rearPSI) || (Array.isArray(pressures) ? pressures[i] : (pressures.front && i < 2 ? pressures.front : pressures.rear)) || this.spec.stockPSI);
      const tireDamage = clamp(data.damageTire ?? state.damage?.tires?.[i] ?? 0, 0, 1);
      view.deformation.update(data, view.root.quaternion, psi, tireDamage);
    });
    for (const link of this.links) {
      const wheel = wheels[link.wheel]; if (!wheel?.position) continue;
      const isFront = link.wheel < 2, side = link.wheel % 2 ? -1 : 1;
      const suspensionDamage = clamp(wheel.damageSuspension ?? state.damage?.suspension?.[link.wheel] ?? 0, 0, 1);
      if (Math.abs(suspensionDamage - link.damage) > 0.002) {
        const p = link.mesh.geometry.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) {
          p[i] = link.pristine[i] + side * Math.sin((link.pristine[i + 1] + 0.5) * Math.PI) * suspensionDamage * (link.type ? 0.050 : 0.075);
          p[i + 1] = link.pristine[i + 1]; p[i + 2] = link.pristine[i + 2];
        }
        link.mesh.geometry.attributes.position.needsUpdate = true; link.mesh.geometry.computeVertexNormals(); link.damage = suspensionDamage;
      }
      const localZ = isFront ? this.spec.wheelbase * (1 - this.spec.frontWeightFraction) : -this.spec.wheelbase * this.spec.frontWeightFraction;
      const hummer=this.spec.bodyStyle==='hummer';
      this._tmp.set(side * (hummer?(link.type?.742:.451):(link.type ? 0.61 : 0.33)), link.type ? (hummer?.13:.10) : -.17, localZ + (link.type ? -.13 : .29)).applyQuaternion(this.root.quaternion).add(this.root.position);
      this._tmp2.set(wheel.position.x, wheel.position.y, wheel.position.z);
      const distance = this._tmp.distanceTo(this._tmp2);
      link.mesh.position.copy(this._tmp).add(this._tmp2).multiplyScalar(0.5); link.mesh.scale.y = distance;
      link.mesh.quaternion.setFromUnitVectors(UP, this._tmp2.sub(this._tmp).normalize());
    }
    for (const axle of this.axles) {
      const a = wheels[axle.axle * 2]?.position, b = wheels[axle.axle * 2 + 1]?.position; if (!a || !b) continue;
      this._tmp.set(a.x, a.y, a.z); this._tmp2.set(b.x, b.y, b.z);
      axle.mesh.position.copy(this._tmp).add(this._tmp2).multiplyScalar(0.5); axle.diff.position.copy(axle.mesh.position);
      axle.mesh.scale.y = this._tmp.distanceTo(this._tmp2); axle.mesh.quaternion.setFromUnitVectors(UP, this._tmp2.sub(this._tmp).normalize());
    }
    this.body.updateWorldMatrix(true,false);
    for (const link of this.driveLinks) {
      this._tmp.fromArray(link.bodyPoint).applyMatrix4(this.body.matrixWorld);
      if (link.target.body) {
        this._tmp2.fromArray(link.target.body).applyMatrix4(this.body.matrixWorld);
      } else if (link.target.wheel !== undefined) {
        const p = wheels[link.target.wheel]?.position; if (!p) continue;
        this._tmp2.set(p.x,p.y,p.z);
      } else {
        const a=wheels[link.target.axle*2]?.position,b=wheels[link.target.axle*2+1]?.position;if(!a||!b)continue;
        this._tmp2.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
      }
      link.a.position.copy(this._tmp);link.b.position.copy(this._tmp2);
      link.mesh.position.copy(this._tmp).add(this._tmp2).multiplyScalar(.5);link.mesh.scale.y=this._tmp.distanceTo(this._tmp2);
      link.mesh.quaternion.setFromUnitVectors(UP,this._tmp2.sub(this._tmp).normalize());
    }
    this.materials.white.emissiveIntensity = opts.headlights ? 2.6 : 0.45;
    this.materials.headlampCore.emissiveIntensity = opts.headlights ? 3.8 : 0;
    // Bounded visual bounce from the bulb into an open reflector; the raster
    // pipeline cannot transport an emissive mesh's light to neighboring metal.
    this.materials.headlampReflector.emissiveIntensity = opts.headlights ? .65 : 0;
    this.materials.red.emissiveIntensity = state.brake > 0.05 || opts.brake > 0.05 || opts.braking ? 2.0 : 0.35;
    this.materials.reverse.emissiveIntensity = state.selector === 'R' ? 1.8 : 0;
  }

  dispose() {
    this._disposeWinchKit();
    this.damageView?.dispose();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    const collect = object => object.traverse(child => {
      if (child.geometry) geometries.add(child.geometry);
      const childMaterials = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
      childMaterials.forEach(material => { materials.add(material); for(const slot of OWNED_TEXTURE_SLOTS)if(material[slot])textures.add(material[slot]); });
    });
    collect(this.root); this.wheels.forEach(w => collect(w.root)); this.links.forEach(l => collect(l.mesh)); this.axles?.forEach(a => { collect(a.mesh); collect(a.diff); });
    this.driveLinks.forEach(link => collect(link.group));
    this.scene.remove(this.root); this.wheels.forEach(w => this.scene.remove(w.root)); this.links.forEach(l => this.scene.remove(l.mesh));
    this.axles?.forEach(a => { this.scene.remove(a.mesh); this.scene.remove(a.diff); });
    this.driveLinks.forEach(link => this.scene.remove(link.group));
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
  }
}
