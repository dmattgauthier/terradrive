import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { Terrain } from '../dist/src/terrain.js';
import { createMountainGeometry } from '../dist/src/landscape-models.js';

const terrain=new Terrain();
const mountains=[];
let totalTriangles=0;
for(const layer of [0,1]) {
  const geometry=createMountainGeometry(terrain,layer),p=geometry.attributes.position,n=geometry.attributes.normal;
  mountains.push(geometry);
  const {segments,rings}=geometry.userData;
  for(let row=0;row<=rings;row++) {
    const a=row*(segments+1),b=a+segments;
    for(const getter of ['getX','getY','getZ']) {
      assert.equal(p[getter](a),p[getter](b),'Mountain horizon must close with exactly matching positions');
      assert.equal(n[getter](a),n[getter](b),'The closing ridge must not reveal a lighting seam');
    }
  }
  for(let i=0;i<p.count;i++) {
    assert.ok([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<2e-6);
    assert.ok(Math.max(Math.abs(p.getX(i)),Math.abs(p.getZ(i)))>=399.9999,'Scenic ridges must stay outside driveable contact terrain');
    assert.ok(n.getY(i)>0,'Mountain faces must face upward rather than depend on double-sided inversion');
  }
  if(!layer) for(let i=0;i<=segments;i++) {
    assert.ok(Math.abs(p.getY(i)-terrain._baseHeight(p.getX(i),p.getZ(i)))<.002,'Mountain foot must meet the existing terrain boundary');
    assert.equal(p.getY(rings*(segments+1)+i),42,'The outer margin preserves the original near-layer base');
  }
  const indices=geometry.index.array;
  for(let triangle=0;triangle<indices.length;triangle+=3) {
    const a=indices[triangle],b=indices[triangle+1],c=indices[triangle+2];
    const ux=p.getX(b)-p.getX(a),uz=p.getZ(b)-p.getZ(a),vx=p.getX(c)-p.getX(a),vz=p.getZ(c)-p.getZ(a);
    assert.ok(uz*vx-ux*vz>1e-5,'Each actual triangle has nonzero area and upward winding');
  }
  const crests=[],depths=[];
  for(let column=0;column<segments;column++) {
    let peak=-Infinity,depth=0;
    const innerRadius=Math.hypot(p.getX(column),p.getZ(column));
    for(let row=0;row<=rings;row++) {
      const vertex=row*(segments+1)+column,height=p.getY(vertex);
      if(height>peak) {peak=height;depth=Math.hypot(p.getX(vertex),p.getZ(vertex))-innerRadius;}
    }
    crests.push(peak);depths.push(depth);
  }
  const sorted=crests.slice().sort((a,b)=>a-b),quantile=f=>sorted[Math.floor(f*(segments-1))];
  assert.ok(quantile(.9)>quantile(.1)*2.4,'Distinct tall groups and low passes replace a continuously raised curtain');
  const highDepths=depths.filter((depth,index)=>crests[index]>quantile(.5));
  const meanDepth=highDepths.reduce((sum,depth)=>sum+depth,0)/highDepths.length;
  const depthSpread=Math.sqrt(highDepths.reduce((sum,depth)=>sum+(depth-meanDepth)**2,0)/highDepths.length);
  assert.ok(depthSpread>45,'The substantial crests occupy varied world depths rather than one radial row');
  assert.equal(geometry.groups.length,0,'Geometry adds no material draws');
  assert.equal(geometry.userData.triangles,27648,'Each layer retains the original topology budget');
  totalTriangles+=geometry.userData.triangles;
}
assert.equal(totalTriangles,55296,'Both scenic layers retain the agreed combined triangle budget');

// The far foot crosses the near layer's rows 26/27. Comparing each complete
// far edge against all four supporting near corners is conservative for the
// piecewise-linear triangles: the whole open edge must remain buried.
const near=mountains[0].attributes.position,far=mountains[1].attributes.position;
const {segments,rings}=mountains[0].userData,stride=segments+1;
const overlapRow=Math.floor(325/440*rings);
for(let column=0;column<segments;column++) {
  const nearMinimum=Math.min(...[overlapRow*stride+column,overlapRow*stride+column+1,
    (overlapRow+1)*stride+column,(overlapRow+1)*stride+column+1].map(vertex=>near.getY(vertex)));
  const farMaximum=Math.max(far.getY(column),far.getY(column+1));
  assert.ok(nearMinimum-farMaximum>1,'The far open foot stays below the complete overlapping near surface');
}

// Exact ray reconstructed from the native sand-dune camera and the center of
// its visible horizon defect (970.5, 266.5 in the 1100 × 720 C4 frame). Before
// the overlap repair it hit only the far surface's back side at 1,280 m.
const ray=new THREE.Raycaster(new THREE.Vector3(183,10.862383317947387,-159),
  new THREE.Vector3(.05624492326705915,.043384646073130244,.9974739500818013),0,1900);
const material=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
const hits=ray.intersectObjects(mountains.map(geometry=>new THREE.Mesh(geometry,material)));
assert.ok(hits.length>0,'The observed low-pass horizon ray must hit a front-facing mountain surface');
assert.ok(hits[0].distance<1000,'The repaired overlap covers the ray before it reaches the exposed far underside');
for(const geometry of mountains) geometry.dispose();
material.dispose();
console.log('Mountain geometry: exact seams, planted perimeter, buried far overlap, native horizon-ray regression, upward triangles, varied massifs and 55,296-triangle topology pass.');
