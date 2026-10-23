// Native asset construction helpers derived from the preserved vehicle-view source.
import * as THREE from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {subdivideBendRegions} from '../../TerraDrive-v1.13/dist/src/vehicle-tessellation.js';
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
  // All three axes have the same physical corner radius. The former extruded
  // rectangle left flat diagonal facets at mirror/seat/handle corners.
  const r=Math.min(radius,w*.24,h*.24,d*.24),half=[w/2,h/2,d/2],p=[],n=[],uv=[],ids=[];
  const grid=a=>[-a,-a+r*.25,-a+r*.5,-a+r*.75,-a+r,0,a-r,a-r*.75,a-r*.5,a-r*.25,a];
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
    const other=[0,1,2].filter(i=>i!==axis),us=grid(half[other[0]]),vs=grid(half[other[1]]),start=p.length/3;
    for(let j=0;j<vs.length;j++)for(let i=0;i<us.length;i++){
      const q=[0,0,0];q[axis]=sign*half[axis];q[other[0]]=us[i];q[other[1]]=vs[j];
      const inner=q.map((v,k)=>clamp(v,-half[k]+r,half[k]-r)),normal=v3(...q).sub(v3(...inner)).normalize();
      p.push(...v3(...inner).addScaledVector(normal,r).toArray());n.push(...normal.toArray());uv.push(i/(us.length-1),j/(vs.length-1));
    }
    for(let j=0;j<vs.length-1;j++)for(let i=0;i<us.length-1;i++){
      const a=start+j*us.length+i,b=a+1,c=a+us.length,e=c+1;
      const av=v3(...p.slice(a*3,a*3+3)),cross=v3(...p.slice(b*3,b*3+3)).sub(av).cross(v3(...p.slice(c*3,c*3+3)).sub(av));
      ids.push(...(cross.getComponent(axis)*sign>0?[a,b,c,b,e,c]:[a,c,b,b,c,e]));
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ids);
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
  // Match the analytic surface rather than the unequal triangle fan area.
  // One-sided derivatives at boundaries also keep adjoining sheets coherent.
  const normal=geo.attributes.normal,e=.00001;
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
    const u=i/nu,v=j/nv,du=v3(...sample(Math.min(1,u+e),v)).sub(v3(...sample(Math.max(0,u-e),v))),dv=v3(...sample(u,Math.min(1,v+e))).sub(v3(...sample(u,Math.max(0,v-e))));
    const nn=du.cross(dv).multiplyScalar(flip?-1:1);if(nn.lengthSq()>1e-15&&Number.isFinite(nn.lengthSq())){nn.normalize();normal.setXYZ(j*(nu+1)+i,nn.x,nn.y,nn.z);}
  }
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
  inset*=.72;
  const outline = roundedOutline(points, radius), center = outline.reduce((a, p) => a.add(v3(...p)), new THREE.Vector3()).multiplyScalar(1 / outline.length);
  const inner = outline.map(p => v3(...p).lerp(center, inset).toArray()), vertices = [...outline, ...inner], ids = [];
  for (let i = 0; i < outline.length; i++) { const j = (i + 1) % outline.length; ids.push(i, j, i + outline.length, j, j + outline.length, i + outline.length); }
  const seal = new THREE.BufferGeometry(); seal.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3)); seal.setIndex(ids); seal.computeVertexNormals();
  finish(new THREE.Mesh(seal, materials.black), parent);
  const normal = new THREE.Vector3();
  for (let i = 0; i < inner.length; i++) normal.add(v3(...inner[i]).sub(center).cross(v3(...inner[(i + 1) % inner.length]).sub(center)));
  normal.normalize();
  if (normal.dot(new THREE.Vector3(center.x, 0, center.z)) < 0) normal.negate();
  // A real glazing flange has depth and an inward-facing dark return. The
  // former single painted ring exposed body color through the opposite glass.
  if(materials.glass.userData.vehicleGlass){
    const trim=materials.interior||materials.black,depth=.016,returnPos=[],returnIds=[];
    for(const loop of [inner,inner.map(p=>v3(...p).addScaledVector(normal,-depth).toArray())])returnPos.push(...loop.flat());
    for(let i=0;i<inner.length;i++){const j=(i+1)%inner.length,k=inner.length;returnIds.push(i,i+k,j,j,i+k,j+k);}
    const reveal=new THREE.BufferGeometry();reveal.setAttribute('position',new THREE.Float32BufferAttribute(returnPos,3));reveal.setIndex(returnIds);reveal.computeVertexNormals();
    finish(new THREE.Mesh(reveal,trim),parent).name='glazing-inset-flange';
    const liner=seal.clone();liner.translate(-normal.x*depth,-normal.y*depth,-normal.z*depth);
    finish(new THREE.Mesh(liner,trim),parent).name='inner-window-trim';
  }
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
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelSegments: 4, steps: 1, bevelSize: bevel, bevelThickness: bevel });
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
export {VEHICLE_GEOMETRY as nativeGeometry};

