import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { VehicleView } from '../dist/src/vehicle-view.js';
import { VEHICLES } from '../dist/src/vehicles.js';

function build(id) {
  const scene=new THREE.Scene(),view=new VehicleView(scene,VEHICLES.find(v=>v.id===id));
  scene.updateMatrixWorld(true);return {scene,view};
}
function cast(view,point,direction=[0,0,-1]) {
  const origin=view.body.localToWorld(new THREE.Vector3(...point));
  const hit=new THREE.Raycaster(origin,new THREE.Vector3(...direction),0,10).intersectObject(view.body,true)[0];
  return hit?{material:hit.object.material,point:view.body.worldToLocal(hit.point.clone())}:null;
}

test('MY24 Wrangler grille has seven separate recessed slots, neutral trim and independent body paint',()=>{
  const {view}=build('wrangler-rubicon');
  try {
    for(let i=-3;i<=3;i++) {
      const slot=cast(view,[i*.134,1.045,5]),web=cast(view,[i*.134+.067,1.045,5]),rim=cast(view,[i*.134+.060,1.045,5]);
      assert.equal(slot?.material,view.materials.black,'Each opening must reach its set-back black backing');
      assert.equal(web?.material,view.materials.black,'The inter-slot face must be the MY24 black insert');
      assert.equal(rim?.material,view.materials.wranglerGrilleBezel,'Every slot must have its own neutral metallic bezel');
      assert.ok(web.point.z-slot.point.z>.012,'Slots require real geometric depth, not dark painted rectangles');
    }
    const original=view.materials.wranglerGrilleBezel.color.getHexString();
    view.setPaint('#2d5d8b');
    assert.equal(view.materials.wranglerGrilleBezel.color.getHexString(),original,'Repainting must leave factory gray bezels intact');
    assert.equal(view.materials.paint.color.getHexString(),'2d5d8b');
    for(const side of [-1,1]) {
      const fog=cast(view,[side*.714,.616,5]);
      assert.equal(fog?.material,view.materials.lens,'Fog lenses must remain visible through real molded bumper openings');
      assert.ok(fog.point.z<cast(view,[0,.615,5]).point.z-.020,'Fog optics must sit behind the bumper middle');
    }
  } finally {view.dispose();}
});

test('new Wrangler grille trim deforms with a local impact and repairs to its exact original geometry',()=>{
  const {view}=build('wrangler-rubicon');
  try {
    const entries=view.damageView.entries.filter(e=>e.mesh.material===view.materials.wranglerGrilleBezel);
    assert.ok(entries.length>0);
    const point=new THREE.Vector3(.268,1.04,2.19).add(view.body.position);
    view.damageView.update({revision:1,dents:[{id:'grille-impact',point,normal:{x:0,y:0,z:1},radius:.29,depth:.12,severity:.72}]});
    assert.ok(entries.some(e=>e.mesh.geometry.attributes.position.array.some((v,i)=>Math.abs(v-e.position[i])>.001)), 'Trim must move with the surrounding damaged grille');
    view.damageView.update({revision:2,dents:[]});
    for(const e of entries)assert.deepEqual(e.mesh.geometry.attributes.position.array,e.position,'Repair must restore every new bezel vertex');
  } finally {view.dispose();}
});

test('Bronco body closes the observed bonnet-shoulder and belt-to-glass openings on both sides',()=>{
  const {view}=build('bronco-badlands');
  try {
    const samples=[[1.17,.70],[1.19,.73],[1.19,1.05],[1.231,-.96],[1.246,-.96],[1.231,-1.40],[1.246,-1.80]];
    for(const side of [-1,1])for(const [y,z] of samples) {
      const hit=cast(view,[side*3,y,z],[-side,0,0]);
      assert.ok(hit?.material===view.materials.paint || y>1.24&&hit?.material===view.materials.black,`The painted sill or its rubber window seal must close the inspected body join at ${side}, ${y}, ${z}`);
      assert.ok(hit.point.x*side>.78,'A side ray must hit its near-side skin before cabin or opposite door');
    }
    for(const side of [-1,1])for(const [y,z] of [[1.291,-1.183],[1.291,-1.201],[1.50,-1.21],[1.77,-1.21]]){
      const hit=cast(view,[side*3,y,z],[-side,0,0]);
      assert.equal(hit?.material,view.materials.black,'The rear glazing corner and quarter channel must hit weatherstrip before door padding');
      assert.ok(hit.point.x*side>.85,'The channel closes at the exterior glass plane');
    }
    const width=new THREE.Box3().setFromObject(view.root).getSize(new THREE.Vector3()).x;
    assert.ok(Math.abs(width-2.189)<.001,'Body refinements must retain the standard mirror envelope');
  } finally {view.dispose();}
});

test('Civic grille wings and molded lip retain real apertures, paint channels and stock mirror span',()=>{
  const {view}=build('civic-sport');
  try {
    for(const side of [-1,1]) {
      const wing=cast(view,[side*.390,.719,5]),grille=cast(view,[side*.25,.715,5]),cheek=cast(view,[side*.67,.612,5]),lip=cast(view,[side*.82,.319,5]);
      assert.equal(wing?.material,view.materials.glossBlack);
      assert.equal(grille?.material,view.materials.black);
      assert.equal(cheek?.material,view.materials.paint);
      assert.equal(lip?.material,view.materials.glossBlack);
      assert.ok(grille.point.z<2.26,'The widened grille still needs its original physical reveal');
    }
    const width=new THREE.Box3().setFromObject(view.root).getSize(new THREE.Vector3()).x;
    assert.ok(Math.abs(width-2.081)<.001,'The stock Sport mirror envelope remains unchanged');
  } finally {view.dispose();}
});
