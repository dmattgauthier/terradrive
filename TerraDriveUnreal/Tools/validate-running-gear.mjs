// Source-only mechanical geometry checks. Does not export or invoke Unreal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {brakeRotorModel,brakeCaliperModel,refineFactoryWheel} from './vehicle-fidelity.mjs';
import {VEHICLES} from './native-vehicles.mjs';
import {refineGClass} from './mercedes-gclass.mjs';
import {refineEarthCruiser} from './earthcruiser-exp.mjs';

function inspect(group){
  group.updateMatrixWorld(true);let triangles=0,vertices=0;
  group.traverse(o=>{
    if(!o.isMesh)return;
    const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;
    assert.ok(n&&n.count===p.count,'complete mechanical normal stream');
    for(let i=0;i<p.count;i++){
      assert.ok([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite),'finite mechanical mesh');
      const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));
      assert.ok(length>.99&&length<1.01,'normalized mechanical normal');
    }
    vertices+=p.count;triangles+=(o.geometry.index?.count??p.count)/3;
  });
  const box=new THREE.Box3().setFromObject(group);
  return {vertices,triangles,bounds:[box.min.toArray(),box.max.toArray()]};
}
const rows=[];
for(const [name,ceramic,solid]of [['vented',false,false],['ceramic',true,false],['solid',false,true]]){
  const rotor=brakeRotorModel(ceramic,solid),row=inspect(rotor),rings=[];
  rotor.traverse(o=>{if(o.name.includes('friction-ring'))rings.push(o);});
  assert.equal(rings.length,solid?1:2,'correct number of friction faces');
  assert.ok(row.triangles<30000,'bounded rotor geometry cost');
  assert.ok(Math.abs(row.bounds[0][1]+1)<.0001&&Math.abs(row.bounds[1][1]-1)<.0001,'unit brake envelope');
  const direction=new THREE.Vector3(-1,0,0);
  const cast=(y,z)=>new THREE.Raycaster(new THREE.Vector3(.2,y,z),direction,0,.4).intersectObjects(rings,false);
  assert.equal(cast(0,0).length,0,'bore stays physically open');
  assert.ok(cast(.81,.08).length>0,'friction surface exists between holes');
  if(ceramic)assert.equal(cast(.65,0).length,0,'drilled bore passes completely through friction faces');
  else assert.ok(cast(.65,0).length>0,'plain rotor is not cross-drilled');
  rows.push({name,...row});
}
const caliper=brakeCaliperModel();rows.push({name:'caliper',...inspect(caliper)});
assert.ok(new THREE.Box3().setFromObject(caliper).getSize(new THREE.Vector3()).x<.13,'caliper clears barrel depth');
for(const spec of VEHICLES){
  const wheel={root:new THREE.Group(),tireSpin:new THREE.Group(),rimSpin:new THREE.Group()};wheel.tireShape=wheel.tireSpin;wheel.root.add(wheel.tireSpin,wheel.rimSpin);
  const rubber=new THREE.MeshStandardMaterial(),tread=new THREE.MeshStandardMaterial();
  const root=new THREE.Group();root.userData.nativeFidelity={version:3};const view={root,wheels:[wheel],materials:{rubber,tread}};
  if(['g580','g63'].includes(spec.bodyStyle))refineGClass(view,spec);
  else if(spec.bodyStyle==='earthcruiser')refineEarthCruiser(view,spec);
  else refineFactoryWheel(wheel,spec,{rubber,tread});
  const r=Number(spec.tireSize.match(/R(\d+)/)[1])*.0254*.5,row=inspect(wheel.rimSpin),barrels=[];
  wheel.rimSpin.traverse(o=>{if(o.name.includes('closed-drop-centre')||o.name==='earthcruiser-rim-with-closed-inner-barrel')barrels.push(o);});
  assert.equal(barrels.length,1,'closed drop-centre barrel');
  assert.ok(row.bounds[1][1]<=r*1.02&&row.bounds[0][1]>=-r*1.02,spec.id+' fixed factory rim diameter');
  // Probe a radial line through the drop centre. It must hit both barrel
  // walls: a single-sided lathe strip would disappear when viewed inboard.
  const radialX=spec.bodyStyle==='earthcruiser'?.08:0;
  const hits=new THREE.Raycaster(new THREE.Vector3(radialX,0,0),new THREE.Vector3(0,1,0),0,r*1.2).intersectObject(barrels[0],false);
  assert.ok(hits.length>0,spec.id+' barrel has an interior-facing wall');
  assert.ok(hits.some(h=>h.distance>=r*.80&&h.distance<r),spec.id+' barrel has an interior-facing wall at the actual selected rim');
  rows.push({name:spec.id+' rim',rimStyle:wheel.rimSpin.children[0]?.name||spec.bodyStyle,innerBarrelHits:hits.map(h=>h.distance),...row});
}
assert.equal(VEHICLES.length,9,'all nine actual factory rim designs');
fs.mkdirSync('Saved',{recursive:true});
fs.writeFileSync('Saved/refinement15-runninggear-geometry.json',JSON.stringify({revision:'gclass-powertrain-damage-15',passed:true,vehicles:9,checks:['finite unit normals','true rotor holes and hub bore','bounded rotor cost','fixed factory rim radius','closed actual custom barrel inner wall'],rows},null,2));
console.log(JSON.stringify({passed:true,models:rows.map(({name,triangles})=>({name,triangles}))}));
