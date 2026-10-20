import * as THREE from '../vendor/three.module.js';
import { terrainNoise as noise } from './terrain.js?v=1.15.0';

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const smooth = (minimum, maximum, value) => {
  const t = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
};

function createMassifs(layer) {
  // Unequal spacing and depth leave broad passes between mountain groups.
  // Their envelopes are evaluated in world X/Z, never extruded along a ring.
  const angles = [-.14, .83, 1.63, 2.55, 3.32, 4.35, 5.36];
  return angles.map((bearing, index) => {
    const angle = bearing + layer * .37, sx = Math.sin(angle), sz = Math.cos(angle);
    const edge = 400 / Math.max(Math.abs(sx), Math.abs(sz));
    const random = offset => noise(index * 3.17 + offset, layer * 13.19 + offset * .71);
    const depth = (layer ? 185 : 150) + random(17) * (layer ? 230 : 175);
    const radius = edge + (layer ? 325 : 0) + depth;
    const orientation = angle + (random(43) - .5) * .68;
    const group = {
      x: sx * radius, z: sz * radius,
      sin: Math.sin(orientation), cos: Math.cos(orientation),
      width: (layer ? 250 : 185) + random(61) * (layer ? 155 : 110),
      depth: (layer ? 155 : 108) + random(83) * (layer ? 110 : 80),
      height: (layer ? 220 : 150) + random(107) * (layer ? 140 : 125),
    };
    const point = (across, along, height, width) => ({
      x: group.x + across * group.width * group.cos + along * group.depth * group.sin,
      z: group.z - across * group.width * group.sin + along * group.depth * group.cos,
      height: group.height * height, width: group.depth * width,
    });
    const crest = [
      point(-.86, -.18 + random(127) * .24, .34, .59),
      point(-.28, .08 + random(149) * .20, .83 + random(163) * .12, .85),
      point(.20, -.23 + random(181) * .27, .91 + random(193) * .09, .75),
      point(.83, .11 + random(211) * .24, .43, .58),
    ];
    const frontSpur = [point(-.28, .14, .71, .71), point(-.46, -.71, .39, .57), point(-.64, -1.47, .065, .43)];
    const rearSpur = [point(.20, -.08, .77, .67), point(.51, .75, .41, .54), point(.62, 1.46, .075, .42)];
    group.ridges = [crest, frontSpur, rearSpur].flatMap(chain => chain.slice(1).map((end, pointIndex) => {
      const start = chain[pointIndex], dx = end.x - start.x, dz = end.z - start.z;
      return { start, end, dx, dz, inverseLengthSquared: 1 / (dx * dx + dz * dz) };
    }));
    return group;
  });
}

function ridgedRelief(x, z, layer) {
  let qx = x * (layer ? .0028 : .0038) + 13.7;
  let qz = z * (layer ? .0028 : .0038) - 29.4;
  let sum = 0, normalization = 0, amplitude = 1, parent = 1;
  for (let octave = 0; octave < 3; octave++) {
    const ridge = 1 - Math.abs(noise(qx, qz) * 2 - 1);
    const signal = ridge * ridge;
    sum += signal * parent * amplitude;
    normalization += amplitude;
    // Fine ridges grow from their larger parent rather than cutting unrelated
    // parallel grooves into every slope. Rotate each octave's world domain.
    parent = clamp(signal * 1.7, 0, 1);
    const nextX = (qx * .8 - qz * .6) * 2.05 + 19.3;
    qz = (qx * .6 + qz * .8) * 2.05 - 7.9;
    qx = nextX;
    amplitude *= .48;
  }
  return sum / normalization;
}

function mountainRelief(x, z, layer, massifs) {
  const warpedX = x + (noise(x * .0024 + 91, z * .0024 - 37) - .5) * 104
    + (noise(x * .0067 - 11, z * .0067 + 83) - .5) * 32;
  const warpedZ = z + (noise(x * .0024 - 53, z * .0024 + 17) - .5) * 104
    + (noise(x * .0067 + 61, z * .0067 - 29) - .5) * 32;
  let massif = 0, foothill = 0;
  for (const group of massifs) {
    const dx = warpedX - group.x, dz = warpedZ - group.z;
    const across = (dx * group.cos - dz * group.sin) / group.width;
    const along = (dx * group.sin + dz * group.cos) / group.depth;
    const distanceSquared = across * across + along * along;
    foothill = Math.max(foothill, group.height * .24 * Math.exp(-distanceSquared * .67));
    // A broken crest chain gives each group several unequal summits. Lower
    // side chains connect to it and spread into branching shoulders, avoiding
    // a ring of separate bell-shaped peaks even in an untextured silhouette.
    for (const ridge of group.ridges) {
      const fromX = warpedX - ridge.start.x, fromZ = warpedZ - ridge.start.z;
      const alongRidge = clamp((fromX * ridge.dx + fromZ * ridge.dz) * ridge.inverseLengthSquared, 0, 1);
      const offX = fromX - ridge.dx * alongRidge, offZ = fromZ - ridge.dz * alongRidge;
      const width = ridge.start.width + (ridge.end.width - ridge.start.width) * alongRidge;
      const peak = ridge.start.height + (ridge.end.height - ridge.start.height) * alongRidge;
      massif = Math.max(massif, peak * Math.exp(-(offX * offX + offZ * offZ) / (width * width) * 1.35));
    }
  }
  const ridges = ridgedRelief(warpedX, warpedZ, layer);
  const folds = noise(warpedX * .0021 - 17, warpedZ * .0021 + 41);
  // Broad groups set peak placement; connected ridged octaves create branching
  // spurs within them and down their lower flanks. The valleys stay low.
  const detail = (noise(warpedX * (layer ? .015 : .022), warpedZ * (layer ? .015 : .022)) - .5) * 3;
  return Math.max(0, massif * (.36 + ridges * .61 + folds * .13)
    + foothill * (.30 + ridges * .70) + detail * clamp(massif / 65, 0, 1));
}

// The backdrop keeps the original X/Z topology and terrain-boundary foot.
// Mountain relief is a world-space field of separate massifs and branching
// spurs. Only the mesh's inner/outer margins fade it into its existing base.
export function createMountainGeometry(terrain, layer=0) {
  const positions=[],uv=[],indices=[],segments=384,rings=36,massifs=createMassifs(layer);
  const perimeter=Array.from({length:segments},(_,column)=>{
    const angle=column/segments*Math.PI*2,sx=Math.sin(angle),sz=Math.cos(angle);
    const edge=400/Math.max(Math.abs(sx),Math.abs(sz));
    return {sx,sz,edge,atEdge:terrain._baseHeight(sx*edge,sz*edge)};
  });
  for(let row=0;row<=rings;row++) for(let column=0;column<=segments;column++) {
    const {sx,sz,edge,atEdge}=perimeter[column%segments],t=row/rings;
    const innerRadius=layer?edge+325:edge,radius=innerRadius+t*(layer?560:440);
    const x=sx*radius,z=sz*radius;
    const farBase=43+noise(sx*5,sz*5)*25;
    // The far band begins 325 m into the 440 m near band. Its former raised
    // open foot exposed the underside through low passes. Bury that foot below
    // the near band's base, then join the unchanged far base within 90 m of the
    // existing 115 m overlap. No visible crest or driveable boundary is moved.
    const buriedFoot=Math.min(farBase,atEdge*(1-325/440)+42*(325/440)-2);
    const overlapBlend=smooth(0,90/560,t);
    const base=layer?buriedFoot*(1-overlapBlend)+farBase*overlapBlend:atEdge*(1-t)+42*t;
    const margin=smooth(0,.13,t)*(1-smooth(.80,1,t));
    const h=base+margin*mountainRelief(x,z,layer,massifs);
    positions.push(x,h,z);uv.push(x/3,z/3);
    if(row<rings&&column<segments) {
      const a=row*(segments+1)+column,b=a+1,c=a+segments+1,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  // Welding the lighting seam is necessary even though the end positions are
  // identical: the indexed strip has two copies of that boundary column.
  const normals=geometry.attributes.normal;
  for(let row=0;row<=rings;row++) {
    const a=row*(segments+1),b=a+segments;
    const n=new THREE.Vector3().fromBufferAttribute(normals,a).add(new THREE.Vector3().fromBufferAttribute(normals,b)).normalize();
    normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.name='separated-mountain-massifs';
  geometry.userData={modelVersion:'1.9.0',layer,segments,rings,triangles:indices.length/3,driveable:false,placement:'outside the 800 m proving ground',angularSeam:'identical positions and welded normals',massifCount:massifs.length,relief:'world-XZ domain-warped ridges with parent-weighted branching octaves',farFoot:'buried within the existing 115 m overlap'};
  return geometry;
}
