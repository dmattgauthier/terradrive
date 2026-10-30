// Native-only coachwork fork; browser source remains immutable.
import {panelJoint,roundSUVLamp,cellularGrille} from './coachwork-craft.mjs';
export function buildSUV(view, geometry, bronco) {
  const { THREE, UP, X_AXIS, clamp, v3, finish, box, roundedBox, roofCap, cylinder, panel, polygon, surface, interpolate, lowerShell, perforatedFace, recessedOpening, sweptBumper, subdivideBendRegions, roundBodyEnds, roundRoofShoulders, frontSkinProjector, curvedLine, roundedOutline, windowPanel, ellipseRing, profile, line, archPoints, sideText, frontText } = geometry;

    // Original block-letter outlines keep the grille badge actual geometry at
    // every resolution, without a canvas font substituted for the raised marks.
    const lettering=(text,x,y,z,width,height,material,side=0)=>{
      const paths={
        B:{outer:[[0,0],[0,1],[.66,1],[.94,.82],[.94,.62],[.79,.51],[.96,.36],[.96,.18],[.73,0]],holes:[[[.24,.59],[.24,.80],[.62,.80],[.70,.73],[.70,.65],[.61,.59]],[[.24,.21],[.24,.40],[.62,.40],[.73,.33],[.73,.28],[.64,.21]]]},
        R:{outer:[[0,0],[0,1],[.66,1],[.94,.80],[.94,.60],[.70,.44],[1,0],[.71,0],[.44,.42],[.24,.42],[.24,0]],holes:[[[.24,.62],[.24,.80],[.59,.80],[.70,.72],[.60,.62]]]},
        O:{outer:[[.18,0],[0,.19],[0,.81],[.18,1],[.78,1],[.96,.81],[.96,.19],[.78,0]],holes:[[[.24,.24],[.24,.76],[.30,.80],[.65,.80],[.72,.74],[.72,.25],[.65,.20],[.30,.20]]]},
        N:{outer:[[0,0],[0,1],[.24,1],[.71,.37],[.71,1],[.95,1],[.95,0],[.71,0],[.24,.63],[.24,0]],holes:[]},
        C:{outer:[[.18,0],[0,.18],[0,.82],[.18,1],[.77,1],[.96,.81],[.96,.66],[.72,.66],[.72,.74],[.65,.80],[.31,.80],[.24,.73],[.24,.27],[.31,.20],[.65,.20],[.72,.27],[.72,.35],[.96,.35],[.96,.18],[.77,0]],holes:[]},
        U:{outer:[[0,1],[.24,1],[.24,.28],[.31,.20],[.65,.20],[.72,.28],[.72,1],[.96,1],[.96,.18],[.77,0],[.18,0],[0,.18]],holes:[]},
        I:{outer:[[.35,0],[.35,1],[.61,1],[.61,0]],holes:[]},
      };
      const group=new THREE.Group();group.position.set(x,y,z);if(side)group.rotation.y=side*Math.PI/2;g.add(group);
      const gap=.21,unit=width/(text.length*(.96+gap)-gap);
      for(const [i,letter] of [...text].entries()){
        const record=paths[letter];if(!record)continue;
        const shape=new THREE.Shape(),trace=(path,points)=>{for(const [j,[px,py]] of points.entries())path[j?'lineTo':'moveTo'](px*unit,py*height);path.closePath();};
        trace(shape,record.outer);for(const points of record.holes){const path=new THREE.Path();trace(path,points);shape.holes.push(path);}
        const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:side?.0015:.004,bevelEnabled:true,bevelSize:.0007,bevelThickness:.0007,bevelSegments:1,steps:1}),material);
        finish(mesh,group,-width/2+i*unit*(.96+gap),-height/2,0);
      }
    };

    const m = view.materials, g = view.body, spec = view.spec, wb = spec.wheelbase, f = wb / 2, r = -wb / 2;
    if(bronco){m.badlandsBadge=m.badge.clone();m.badlandsBadge.color.set('#e7aa35');m.badlandsBadge.metalness=.12;m.badlandsBadge.roughness=.40;}
    const top = bronco ? 1.873 : 1.86, half = bronco ? 0.874 : 0.833, nose = bronco ? 2.16 : 2.13, tail = bronco ? -2.075 : -2.07;
    const belt = bronco ? 1.225 : 1.19, hood = bronco ? 1.275 : 1.245, frontRoof = bronco ? 0.36 : 0.31;
    const frontHalf = bronco ? half - .030 : .775;
    // The Bronco's upper door skin meets its frameless glazing. Its previous
    // deep rolled shoulder stopped below and inboard of the glass, leaving
    // an open strip under the doors/quarter. Re-forming the continuous shell
    // closes that joint without attaching a separate horizontal trim bar.
    const doorTop=belt+(bronco?.052:0);
    const stations = [[tail, half - (bronco?.018:.054), bronco?doorTop:1.15], [tail + .23, half, doorTop], [-1.42, half, doorTop], [-.50, half - .008, doorTop], [.50, half, doorTop], [.78, frontHalf, hood - .016], [1.48, frontHalf - .016, hood - .042], [nose - .12, bronco ? frontHalf - .008 : half - .070, 1.185], [nose, half - .027, 1.16]];
    const sideBulge=bronco?.011:.008, shoulder=bronco?.020:.040;
    const bodySkin=lowerShell(g, m.paint, stations, wb, .494, .50, .435, .027, sideBulge, shoulder, {cabin:{rear:tail+.08,front:.575,half:half-.085},matchShoulderCaps:true});
    // Bronco's doors have a shallow upper shoulder and a swept-in lower
    // stamping. Keeping these in the sheet avoids the previous straight,
    // Jeep-like sides and raised decorative strips. Local depths are photo
    // reconstruction; the factory wheelbase and exterior envelope stay put.
    const doorSculpt=(y,z)=>{
      if(!bronco){
        // The JL door stamping is bounded by softly drawn vertical returns
        // and a flatter central sheet, rather than a uniformly inflated slab.
        const end=THREE.MathUtils.smoothstep(z,-1.16,-1.02)*(1-THREE.MathUtils.smoothstep(z,.415,.565));
        const height=THREE.MathUtils.smoothstep(y,.570,.640)*(1-THREE.MathUtils.smoothstep(y,1.055,1.145));
        let cup=0;for(const center of [-.282,-1.042])cup+=.010*Math.exp(-(((z-center)/.102)**4+((y-(belt-.096))/.034)**4));
        return .009*end*height+cup;
      }
      const ends=THREE.MathUtils.smoothstep(z,-1.405,-1.165)*(1-THREE.MathUtils.smoothstep(z,.532,.760));
      const upper=interpolate(stations,z,2)-shoulder;
      const height=THREE.MathUtils.smoothstep(y,.505,.565)*(1-THREE.MathUtils.smoothstep(y,upper-.030,upper));
      const lower=.682+.015*z;
      let depth=.012*Math.exp(-(((y-lower)/.130)**2))+.004*Math.exp(-(((y-1.090)/.048)**2));
      for(const center of [-.282,-1.042])depth+=.009*Math.exp(-(((z-center)/.103)**4+((y-(belt-.104))/.029)**4));
      return depth*ends*height;
    };
    const skinX=(y,z,side=0)=>{
      const width=interpolate(stations,z,1),upper=interpolate(stations,z,2)-shoulder;
      const height=clamp((y-.50)/(upper-.50),0,1);
      // The real outer wings rise out of a drawn wheel haunch. The former
      // sheet remained almost planar behind the separate plastic flares.
      // The broad stamped shoulder stays inside the flare's factory envelope.
      const wing=bronco?.014:.008;
      const haunch=wing*(Math.exp(-(((z-f)/.52)**4))+Math.exp(-(((z-r)/.51)**4)))
        *Math.exp(-(((y-(bronco?1.035:.996))/.235)**2))
        *(1-THREE.MathUtils.smoothstep(y,upper-.035,upper));
      const fuelRadius=Math.hypot((z+1.825)/.073,(y-1.077)/.073);
      const fuelCup=!bronco&&side>0?.014*(1-THREE.MathUtils.smoothstep(fuelRadius,.78,1.18)):0;
      return width-.018*(1-height)+sideBulge*Math.sin(height*Math.PI)-doorSculpt(y,z)+haunch-fuelCup;
    };
    for(const [sideIndex,mesh] of bodySkin.slice(6,8).entries()){
      // Shared physical-height rows keep the narrow stamping smooth across
      // columns; the lower rows collapse onto the actual open wheel arches.
      const side=sideIndex?1:-1,zSteps=156,rows=[.50,.52,...Array.from({length:43},(_,i)=>.54+i*.014),1.135,1.151,1.17,1.19,1.21,1.24,1.28],positions=[],normals=[],uvs=[],indices=[];
      for(const level of rows)for(let j=0;j<=zSteps;j++){
        const z=THREE.MathUtils.lerp(tail,nose,j/zSteps),upper=interpolate(stations,z,2)-shoulder;
        let low=.50;for(const axle of [r,f]){const dz=z-axle;if(Math.abs(dz)<.494)low=Math.max(low,.435+Math.sqrt(Math.max(0,.494**2-dz**2)));}
        const y=clamp(level,Math.min(low,upper-.012),upper),epsilon=.00005,x=skinX(y,z,side);
        const dy=(skinX(y+epsilon,z,side)-skinX(y-epsilon,z,side))/(2*epsilon),dz=(skinX(y,z+epsilon,side)-skinX(y,z-epsilon,side))/(2*epsilon),normal=v3(side,-dy,-dz).normalize();
        positions.push(side*x,y,z);normals.push(normal.x,normal.y,normal.z);uvs.push(j/zSteps,(y-.5)/.651);
      }
      const stride=zSteps+1;
      for(let i=0;i<rows.length-1;i++)for(let j=0;j<zSteps;j++){
        const a=i*stride+j,b=a+1,c=a+stride,d=c+1;
        for(const triangle of [[a,b,c],[b,d,c]]){
          const [aa,bb,cc]=triangle,area=(positions[bb*3+2]-positions[cc*3+2])*(positions[aa*3+1]-positions[cc*3+1])+(positions[cc*3+1]-positions[bb*3+1])*(positions[aa*3+2]-positions[cc*3+2]);
          if(Math.abs(area)>1e-12)indices.push(...(side>0?[aa,cc,bb]:triangle));
        }
      }
      const skin=new THREE.BufferGeometry();skin.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));skin.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));skin.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));skin.setIndex(indices);
      mesh.geometry.dispose();mesh.geometry=skin;mesh.name=(bronco?'bronco':'wrangler')+'-sculpted-door-sheet-'+(side>0?'left':'right');
    }
    const sideSeam=(side,points,radius=.0021)=>{
      const curve=panelJoint(points,.025);
      const sampled=Array.from({length:181},(_,i)=>{const point=curve.getPoint(i/180);return [side*(skinX(point.y,point.x)+.0016),point.y,point.x];});
      curvedLine(g,m.dark,sampled,radius);
    };
    // JL bonnet and matching side sheets stay broad through the cowl and
    // middle, then taper gently into the grille. The former reverse taper
    // narrowed the back by more than six inches and pinched the whole nose.
    const hoodWidth = bronco ? 1.63 : 1.55, hoodRear=bronco?.700:.748;
    const hoodHalf=v=>{
      return bronco?hoodWidth/2-v*.008:.775-v*.013+.004*Math.sin(v*Math.PI);
    };
    const hoodSample=(u,v)=>{
      const z = THREE.MathUtils.lerp(hoodRear, nose + .030, v), x = u * 2 - 1;
      const shoulder = Math.exp(-Math.pow((Math.abs(x) - (bronco ? .83 : .75)) / .14, 2));
      const fade=THREE.MathUtils.smoothstep(v,0,.14)*(1-THREE.MathUtils.smoothstep(v,.79,1));
      // Bronco's broad, low central plateau and the JL's narrower bonnet
      // shoulders are stamped into the skin, with continuous rolled returns.
      const plateau=bronco?.020*(1-THREE.MathUtils.smoothstep(Math.abs(x),.57,.73))*fade:
        -.010*Math.exp(-((x/.46)**6))*fade;
      const y = THREE.MathUtils.lerp(hood + .032, 1.218, v) + (bronco ? .013 : .037) * (1 - x * x)
        + (bronco ? .018 : .025) * shoulder * Math.sin(v * Math.PI)+plateau;
      return [x * hoodHalf(v), y, z];
    };
    const hoodPoint=(x,z)=>{
      const v=(z-hoodRear)/(nose+.030-hoodRear),u=(x/hoodHalf(v)+1)/2;
      return hoodSample(u,v);
    };
    const hoodVents=bronco?[]:[-1,1].map(side=>roundedOutline([
      [side*.435-.100,.795,0],[side*.435+.100,.795,0],
      [side*.435+.100,1.065,0],[side*.435-.100,1.065,0]
    ],.024).map(([x,z])=>[x,z]));
    if(bronco)surface(g,m.paint,64,64,hoodSample,true).name='bronco-stamped-bonnet-plateau';
    else {
      // The Rubicon bonnet vents are apertures in the curved sheet metal.
      // Their reveals and louvers sit down inside that opening, following the
      // same crown, instead of slabs partly hidden by an uncut bonnet.
      const outline=[...Array.from({length:47},(_,i)=>hoodSample(1,i/46)),...Array.from({length:47},(_,i)=>hoodSample(0,1-i/46))].map(p=>[p[0],p[2]]);
      const mesh=perforatedFace(g,m.paint,outline,hoodVents,hoodPoint,.044),geo=mesh.geometry;
      const p=geo.attributes.position,n=geo.attributes.normal,ids=geo.index.array;
      for(let i=0;i<ids.length;i+=3){const swap=ids[i+1];ids[i+1]=ids[i+2];ids[i+2]=swap;}
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),z=p.getZ(i),e=.0003;
        const dx=(hoodPoint(x+e,z)[1]-hoodPoint(x-e,z)[1])/(2*e),dz=(hoodPoint(x,z+e)[1]-hoodPoint(x,z-e)[1])/(2*e);
        const normal=v3(-dx,1,-dz).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);
      }
      for(const [side,outline] of [[-1,hoodVents[0]],[1,hoodVents[1]]]){
        const inner=outline.map(([x,z])=>[THREE.MathUtils.lerp(x,side*.435,.13),THREE.MathUtils.lerp(z,.93,.10)]);
        const positions=[],indices=[];
        for(const [j,loop] of [outline,inner].entries())for(const [x,z] of loop){const p=hoodPoint(x,z);positions.push(p[0],p[1]-(j?.010:.0003),p[2]);}
        for(let i=0;i<outline.length;i++){const next=(i+1)%outline.length,k=outline.length;indices.push(i,i+k,next,next,i+k,next+k);}
        const reveal=new THREE.BufferGeometry();reveal.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));reveal.setIndex(indices);reveal.computeVertexNormals();finish(new THREE.Mesh(reveal,m.black),g);
        polygon(g,m.black,inner.map(([x,z])=>{const p=hoodPoint(x,z);return [p[0],p[1]-.013,p[2]];}));
        for(let slat=0;slat<6;slat++)surface(g,m.dark,8,3,(u,v)=>{
          const x=side*.435+(u*2-1)*.078,z=.830+slat*.039+(v-.5)*.012,p=hoodPoint(x,z);
          return [p[0],p[1]-.007+.003*Math.sin(v*Math.PI),p[2]];
        },true);
      }
    }
    // The bonnet used to extend back underneath the windshield. A separate
    // formed cowl now occupies the correct short interval behind it, with a
    // real recessed ventilation opening rather than a dark patch on paint.
    const cowlRear=.604,cowlWidth=bronco?.827:.785;
    const cowlPoint=(x,z)=>{
      const t=clamp((z-cowlRear)/(hoodRear-cowlRear),0,1),half=THREE.MathUtils.lerp(cowlWidth,hoodWidth/2,t);
      const front=hoodPoint(x,hoodRear)[1]-.009;
      return [x,THREE.MathUtils.lerp(belt+.057,front,t)+.006*(1-(x/half)**2)*Math.sin(t*Math.PI),z];
    };
    const cowlOutline=[[-cowlWidth,cowlRear],[cowlWidth,cowlRear],[hoodWidth/2,hoodRear],[-hoodWidth/2,hoodRear]];
    const cowlVent=roundedOutline([[-.343,cowlRear+.022,0],[.343,cowlRear+.022,0],[.343,hoodRear-.018,0],[-.343,hoodRear-.018,0]],.013,6).map(([x,z])=>[x,z]);
    // The lower shell is an internal closure below the separate bonnet. Cut
    // back its hidden triangles beneath this vent too, so it cannot fill the
    // new cowl aperture with painted metal just above its recessed floor.
    const closure=bodySkin[3].geometry,closureP=closure.attributes.position,closureI=closure.index.array,keep=[];
    for(let i=0;i<closureI.length;i+=3){
      const ids=[closureI[i],closureI[i+1],closureI[i+2]],xs=ids.map(j=>closureP.getX(j)),zs=ids.map(j=>closureP.getZ(j));
      if(Math.max(...xs)>-.350&&Math.min(...xs)<.350&&Math.max(...zs)>cowlRear+.016&&Math.min(...zs)<hoodRear-.012)continue;
      keep.push(...ids);
    }
    closure.setIndex(keep);
    const cowl=perforatedFace(g,m.paint,cowlOutline,[cowlVent],cowlPoint,.025);
    const cowlGeo=cowl.geometry,cp=cowlGeo.attributes.position,cn=cowlGeo.attributes.normal,ci=cowlGeo.index.array;
    for(let i=0;i<ci.length;i+=3)[ci[i+1],ci[i+2]]=[ci[i+2],ci[i+1]];
    for(let i=0;i<cp.count;i++){
      const x=cp.getX(i),z=cp.getZ(i),e=.0001,dyx=(cowlPoint(x+e,z)[1]-cowlPoint(x-e,z)[1])/(e*2),dyz=(cowlPoint(x,z+e)[1]-cowlPoint(x,z-e)[1])/(e*2);
      const normal=v3(-dyx,1,-dyz).normalize();cn.setXYZ(i,normal.x,normal.y,normal.z);
    }
    cowl.name=(bronco?'bronco':'wrangler')+'-apertured-cowl';
    const inset=cowlVent.map(([x,z])=>[x*.985,THREE.MathUtils.lerp(z,(cowlRear+hoodRear)/2,.08)]);
    const walls=[],wallsIx=[],nn=cowlVent.length;
    for(const [depth,loop]of [[0,cowlVent],[.014,inset]])for(const [x,z]of loop){const p=cowlPoint(x,z);walls.push(p[0],p[1]-depth,p[2]);}
    for(let i=0;i<nn;i++){const j=(i+1)%nn;wallsIx.push(i,j,i+nn,j,j+nn,i+nn);}
    const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(walls,3));cg.setIndex(wallsIx);cg.computeVertexNormals();finish(new THREE.Mesh(cg,m.black),g);
    const floor=perforatedFace(g,m.black,inset,[],(x,z)=>{const p=cowlPoint(x,z);p[1]-=.015;return p;},.026),fi=floor.geometry.index.array;
    for(let i=0;i<fi.length;i+=3)[fi[i+1],fi[i+2]]=[fi[i+2],fi[i+1]];floor.geometry.computeVertexNormals();
    for(let i=0;i<19;i++)surface(g,m.grille,3,5,(u,v)=>{
      const x=(i-9)*.034+(u-.5)*.008,z=THREE.MathUtils.lerp(cowlRear+.030,hoodRear-.026,v),p=cowlPoint(x,z);
      return [p[0],p[1]-.007+.002*Math.sin(u*Math.PI),p[2]];
    },true);
    for(const side of [-1,1]){
      const edge=Array.from({length:41},(_,i)=>{const x=(i/20-1)*hoodWidth/2,p=hoodPoint(x,hoodRear);p[1]+=.001;return p;});
      if(side===1)curvedLine(g,m.dark,edge,.0018);
      const hingeX=side*(bronco?.692:.611),hingeZ=hoodRear+.012,p=hoodPoint(hingeX,hingeZ);
      const hinge=roundedBox(g,bronco?m.paint:m.dark,p[0],p[1]+.004,p[2],.057,.010,.112,.005);hinge.rotation.x=bronco?-.042:-.037;
      for(const dz of [-.030,.033]){const q=hoodPoint(hingeX,hingeZ+dz);cylinder(g,m.dark,q[0],q[1]+.011,q[2],.004,.003,'y',8);}
      const jet=hoodPoint(side*.252,hoodRear+.111);roundedBox(g,m.black,jet[0],jet[1]+.005,jet[2],.027,.010,.032,.004);
    }
    surface(g,m.paint,44,10,(u,v)=>{
      const p=hoodSample(u,1),a=v*Math.PI/2;
      return [p[0],p[1]-.024+.024*Math.cos(a),p[2]+.024*Math.sin(a)];
    },true);
    surface(g,m.paint,44,4,(u,v)=>{
      const p=hoodSample(u,1);return [p[0],THREE.MathUtils.lerp(p[1]-.048,p[1]-.024,v),p[2]+.024];
    });
    for (const side of [-1, 1]) {
      const hoodShut=Array.from({length:47},(_,i)=>{const p=hoodSample(side>0?1:0,i/46);return [p[0]+side*.001,p[1]+.001,p[2]];});
      curvedLine(g,m.dark,hoodShut,.0020);
      if(!bronco)surface(g,m.paint,46,10,(u,v)=>{
        const p=hoodSample(side>0?1:0,u),low=interpolate(stations,Math.min(p[2],nose),2)-.030;
        return [p[0]+side*.004*Math.sin(v*Math.PI),THREE.MathUtils.lerp(low,p[1],v),p[2]];
      },side>0);
      if (!bronco) {
        roundedBox(g,m.black,side*.787,1.178,.858,.032,.111,.088,.012);
        roundedBox(g,m.dark,side*.807,1.192,.858,.014,.073,.058,.010);
        for(const y of [1.142,1.218])cylinder(g,m.black,side*.814,y,.858,.008,.052,'z',14);
        for(const z of [.833,.883])cylinder(g,m.grille,side*.819,1.158,z,.004,.005,'x',10);
      } else {
        // Factory trail sights are molded, apertured handles integrated with
        // the bonnet shoulder, with a narrow slot and solid mounting ends.
        const shape=new THREE.Shape(),outer=[[1.842,1.259],[1.888,1.327],[2.029,1.327],[2.054,1.245],[2.010,1.251],[1.983,1.285],[1.899,1.283],[1.878,1.258]];
        outer.forEach(([z,y],i)=>shape[i?'lineTo':'moveTo'](z,y));shape.closePath();
        const opening=new THREE.Path();opening.moveTo(1.898,1.291);opening.lineTo(1.996,1.291);opening.lineTo(2.006,1.311);opening.lineTo(1.911,1.311);opening.closePath();shape.holes.push(opening);
        const sight=new THREE.ExtrudeGeometry(shape,{depth:.027,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:2,steps:1});sight.translate(0,0,-.0135);sight.rotateY(-Math.PI/2);finish(new THREE.Mesh(sight,m.black),g,side*.746,0,0);
        cylinder(g,m.dark,side*.764,1.303,2.022,.007,.004,'x',12);
      }
    }
    // Continuous hardtop skin: the shoulder and crown are one curved surface.
    const roofHalf = half - (bronco ? 0.012 : 0.035), roofFront = frontRoof + (bronco ? .018 : -.025);
    const roofMaterial = m.hardtop || m.black, roofRadius = bronco ? .085 : .063;
    const roofProfile = (x, width) => {
      const shoulderStart = width-roofRadius;
      if(Math.abs(x)>shoulderStart) return top-roofRadius+Math.sqrt(Math.max(0,roofRadius**2-(Math.abs(x)-shoulderStart)**2));
      return top+.006*(1-(x/shoulderStart)**2)**2;
    };
    const roofWidth = z => {
      const distance=Math.min(z-tail,roofFront-z), radius=bronco?.075:.058;
      return roofHalf+.009-(distance<radius?radius-Math.sqrt(Math.max(0,radius**2-(radius-distance)**2)):0);
    };
    surface(g,roofMaterial,68,52,(u,v)=>{
      const z=THREE.MathUtils.lerp(tail,roofFront,v),width=roofWidth(z),x=(u*2-1)*width;
      return [x,roofProfile(x,width),z];
    },true);
    for(const [z,reverse] of [[tail,true],[roofFront,false]]) surface(g,roofMaterial,68,4,(u,v)=>{
      const width=roofWidth(z),x=(u*2-1)*width;
      return [x,THREE.MathUtils.lerp(top-.084,roofProfile(x,width),v),z];
    },reverse);
    for(const side of [-1,1]) {
      const xb=side*(half+.002),xt=side*roofHalf;
      const sideX=y=>side*THREE.MathUtils.lerp(half+.002,roofHalf,clamp((y-belt)/(top-belt),0,1));
      const pillar=(bottomZ,topZ,halfWidth,material)=>surface(g,material,8,16,(u,v)=>{
        const y=THREE.MathUtils.lerp(belt+.004,top-.058,v),z=THREE.MathUtils.lerp(bottomZ,topZ,v)+(u*2-1)*halfWidth;
        return [sideX(y)+side*.010*Math.sin(u*Math.PI),y,z];
      },side>0);
      pillar(.607,frontRoof,.045,m.paint);
      pillar(-.441,-.45,bronco?.037:.028,bronco?m.black:m.paint);
      // The removable hardtop's rear quarter is a single molded panel with a real glass aperture.
      const quarterOuter=[[-1.205,belt+.012],[tail+.012,belt+.012],[tail+.012,top-.052],[-1.24,top-.052]];
      const quarterHole=roundedOutline([[-1.322,belt+.099,0],[tail+.135,belt+.099,0],[tail+.135,top-.154,0],[-1.335,top-.144,0]],.067).map(([z,y])=>[z,y]);
      perforatedFace(g,roofMaterial,quarterOuter,[quarterHole],(z,y)=>[sideX(y),y,z]);
      windowPanel(g,{...m,glass:m.privacyGlass||m.glass},quarterHole.map(([z,y])=>[sideX(y)+side*.003,y,z]),.024,.04);
      const doorMaterials=bronco?m:{...m,black:m.paint};
      windowPanel(g,doorMaterials,[[xb,belt+.032,.556],[xb,belt+.032,-.399],[xt,top-.075,-.414],[xt,top-.075,frontRoof-.034]],bronco?.035:.095,.078);
      const rearDoorGlass=[[xb,belt+.032,-.481],[xb,belt+.032,-1.182],[xt,top-.075,-1.208],[xt,top-.075,-.483]];
      windowPanel(g,{...doorMaterials,glass:m.privacyGlass||m.glass},rearDoorGlass,bronco?.040:.112,.073);
      if(bronco){
        // The rounded glass corner leaves a narrow weatherstrip return to the
        // quarter panel. Filling only this channel prevents a view directly
        // into the door padding above the continuous painted sill.
        const glassEdge=roundedOutline(rearDoorGlass,.073).slice(6,18).map(([x,y,z])=>[z,y]);
        const channel=[...glassEdge,[-1.245,top-.052],[-1.213,belt+.023]];
        const seal=perforatedFace(g,m.black,channel,[],(z,y)=>{
          const t=clamp((y-belt-.032)/(top-.075-belt-.032),0,1);
          return [THREE.MathUtils.lerp(xb,xt,t)-side*.0015,y,z];
        },.035);
        seal.name='bronco-rear-door-quarter-weatherstrip-'+(side>0?'left':'right');
      }
      // Slim separate belt seals and the molded gutter join the actual body contours.
      curvedLine(g,m.black,[[sideX(belt+.027),belt+.027,tail+.07],[sideX(belt+.027),belt+.027,.58]],.008);
      curvedLine(g,roofMaterial,[[xt,top-.068,tail+.066],[xt,top-.068,roofFront-.031]],.009);
      // Door shuts wrap around the pressed lower panels rather than floating as vertical stripes.
      for (const [front, rear] of [[0.57, -0.445], [-0.465, -1.205]]) {
        const shutTop=bronco?doorTop-shoulder-.002:belt-.018;
        const back=front>0?[[rear+.15,.578],[rear+.075,.608],[rear+.017,.734],[rear,shutTop]]:
          [[rear+.270,.578],[rear+.238,.634],[rear+.170,.765],[rear+.095,.871],[rear+.019,.990],[rear,shutTop]];
        // The rear door closes ahead of the wheel opening. Its previous
        // straight lower corner drew a visible seam through empty wheel air.
        sideSeam(side,[[front,shutTop],[front+.009,.92],[front-.015,.69],[front-.053,.601],[front-.098,.578],...back]);
        // Recessed finger cup, separate handle bridge and end caps follow the door skin.
        const handleZ=rear+.163,handleY=belt-.096,hx=side*skinX(handleY,handleZ);
        const cup=new THREE.Mesh(new THREE.SphereGeometry(1,20,10),m.dark);cup.scale.set(.006,.024,.101);finish(cup,g,hx+side*.004,handleY-.008,handleZ);
        roundedBox(g,m.black,hx+side*.023,handleY,handleZ,.044,.031,.157,.011);
        for(const end of [-1,1]) roundedBox(g,m.black,hx+side*.012,handleY,handleZ+end*.080,.026,.037,.026,.009);
        if(front>.5)cylinder(g,m.chrome,hx+side*.047,handleY,handleZ+.057,.005,.003,'x',12);
        if (!bronco) for (const y of [0.81, 1.08]) {
          roundedBox(g, m.paint, side * (half + 0.022), y, front - 0.008, 0.034, 0.058, 0.084, 0.006);
          cylinder(g, m.dark, side * (half + 0.045), y, front + 0.013, 0.010, 0.074, 'y', 10);
        }
      }
      for (const az of [f, r]) view._fender(side, az, half, bronco);
      roundedBox(g, m.black, side * (half + 0.054), 0.476, -0.07, 0.10, 0.075, 1.92, 0.018);
      // The two molded mirror shells have different silhouettes. A swept cap
      // rounds into the outer rim and leaves the convex glass inside its reveal.
      // Normalizing the outline retains Ford's 2.189 m standard-mirror width.
      const mirrorX=bronco?2.189/2-.105:half+.188,mirrorY=bronco?1.412:1.414;
      const mirrorOutline=roundedOutline((bronco?
        [[-1,-.62],[-.69,-1],[.69,-.96],[1,-.69],[1,.75],[.74,1],[-.72,1],[-1,.72]]:
        [[-1,-.61],[-.68,-1],[.68,-.91],[1,-.63],[.97,.71],[.64,1],[-.75,.94],[-1,.56]]
      ).map(([x,y])=>[x,y,0]),.19,6);
      const extent=Math.max(...mirrorOutline.map(p=>Math.abs(p[0]))),mirrorH=bronco?.090:.103;
      const mirrorPoint=(i,r,depth)=>{
        const [x,y]=mirrorOutline[i%mirrorOutline.length];
        return [side*(mirrorX+x/extent*.105*r),mirrorY+y*mirrorH*r,.421+depth+.010*x*r];
      };
      // Flat cast foot, rounded pivot and a short wide support replace the
      // previous single round rod, while keeping the factory door mounting.
      const mirrorFoot=new THREE.Group();mirrorFoot.position.x=side*(half+.020);g.add(mirrorFoot);
      profile(mirrorFoot,m.black,[[.485,1.318],[.615,1.319],[.603,1.357],[.515,1.373]],.064,.007);
      const arm=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),m.black);arm.scale.set(.100,.031,.055);finish(arm,g,side*(mirrorX-.064),1.351,.532);
      cylinder(g,m.dark,side*(mirrorX-.013),1.358,.530,.032,.044,'y',20);
      surface(g,m.black,mirrorOutline.length,14,(u,v)=>{
        const i=Math.min(mirrorOutline.length-1,Math.floor(u*mirrorOutline.length)),next=(i+1)%mirrorOutline.length,t=u*mirrorOutline.length-i;
        const r=THREE.MathUtils.lerp(1,.69,v),depth=.011+.159*Math.sin(v*Math.PI/2),a=mirrorPoint(i,r,depth),b=mirrorPoint(next,r,depth);
        return a.map((x,k)=>THREE.MathUtils.lerp(x,b[k],t));
      },side<0);
      surface(g,m.black,mirrorOutline.length,10,(u,v)=>{
        const i=Math.min(mirrorOutline.length-1,Math.floor(u*mirrorOutline.length)),next=(i+1)%mirrorOutline.length,t=u*mirrorOutline.length-i;
        const a=mirrorPoint(i,.69*(1-v),.170+.011*Math.sin(v*Math.PI/2)),b=mirrorPoint(next,.69*(1-v),.170+.011*Math.sin(v*Math.PI/2));
        return a.map((x,k)=>THREE.MathUtils.lerp(x,b[k],t));
      },side<0);
      const mirrorGlass=mirrorOutline.map((_,i)=>mirrorPoint(i,.84,.003));
      windowPanel(g,{black:m.black,glass:m.chrome},mirrorGlass,.005,.003,{bow:.004});
      curvedLine(g,m.dark,[...mirrorOutline.map((_,i)=>mirrorPoint(i,.970,.013)),mirrorPoint(0,.970,.013)],.0025);
      if(bronco){
        const badgeX=side*(skinX(1.132,.810)+.004),shield=[[.763,1.169],[.857,1.169],[.849,1.121],[.810,1.088],[.771,1.121]];
        polygon(g,m.black,shield.map(([z,y])=>[badgeX,y,z]));
        curvedLine(g,m.badlandsBadge,[...shield,shield[0]].map(([z,y])=>[badgeX+side*.001,y,z]),.0022);
        polygon(g,m.badlandsBadge,[[badgeX+side*.002,1.130,.786],[badgeX+side*.002,1.152,.802],[badgeX+side*.002,1.136,.812],[badgeX+side*.002,1.146,.822],[badgeX+side*.002,1.130,.840]]);
        if(side===1){
          // Ford's separate rounded fuel flap is behind the left rear door,
          // with its narrow reveal following the actual quarter-panel skin.
          const flap=roundedOutline([[-1.778,1.080,0],[-1.581,1.080,0],[-1.581,1.218,0],[-1.778,1.218,0]],.028,8);
          curvedLine(g,m.dark,[...flap,flap[0]].map(([z,y])=>[side*(skinX(y,z)+.0018),y,z]),.0017);
        }
      } else {
        sideText(g,'RUBICON',side*(hoodWidth/2-.004+.006),1.225,1.385,.63,.076,'#292523',side);
        if(side>0){
          // The JL's exposed circular filler is drawn into the left quarter;
          // it is a closed inset cap, not a proud black disc over flat paint.
          const cy=1.077,cz=-1.825;
          surface(g,m.black,80,12,(u,v)=>{
            const angle=u*Math.PI*2,rad=.065*v,y=cy+Math.sin(angle)*rad,z=cz+Math.cos(angle)*rad;
            return [skinX(y,z,side)+.0018+.002*(1-v*v),y,z];
          }).name='wrangler-recessed-fuel-cap';
          const edge=Array.from({length:81},(_,i)=>{const a=i*Math.PI/40,y=cy+Math.sin(a)*.067,z=cz+Math.cos(a)*.067;return [skinX(y,z,side)+.003,y,z];});
          curvedLine(g,m.dark,edge,.0023);
          const capX=skinX(cy,cz,side)+.006;
          roundedBox(g,m.grille,capX,cy,cz,.006,.012,.065,.003);
        }
        // Cast fold-down windshield hinges have two leaves and a pin, rather
        // than reading as a solid rectangular pillar end above the bonnet.
        const hx=side*(half-.052),hy=belt+.050,hz=.601;
        roundedBox(g,m.paint,hx,hy-.014,hz+.023,.091,.019,.070,.007);
        const leaf=roundedBox(g,m.paint,hx,hy+.026,hz-.006,.091,.076,.015,.006);leaf.rotation.x=.12;
        cylinder(g,m.paint,hx,hy+.005,hz+.006,.013,.098,'x',24);
        for(const xx of [hx-.031,hx+.031])cylinder(g,m.dark,xx,hy-.003,hz+.047,.004,.003,'y',8);
      }
    }
    const windshield = [[-half + 0.033, belt + 0.049, 0.605], [half - 0.033, belt + 0.049, 0.605], [roofHalf - 0.042, top - 0.075, frontRoof + 0.035], [-roofHalf + 0.042, top - 0.075, frontRoof + 0.035]];
    windowPanel(g, {...m,black:m.paint,glass:m.windscreen||m.glass}, windshield, bronco?.035:.068,.065);
    // Wide painted windshield header, separate from the removable hardtop.
    surface(g,m.paint,48,8,(u,v)=>{
      const x=(u*2-1)*(roofHalf-.009),y=THREE.MathUtils.lerp(top-.082,top-.006,v);
      return [x,y,frontRoof+.049-.027*v+.008*(1-(x/roofHalf)**2)+.003*Math.sin(v*Math.PI)];
    });
    surface(g,m.paint,48,5,(u,v)=>[(u*2-1)*(roofHalf-.009),top-.006+.004*Math.sin(v*Math.PI),THREE.MathUtils.lerp(frontRoof+.022,roofFront-.009,v)],true);
    surface(g,m.paint,44,6,(u,v)=>{
      const x=(u*2-1)*(half-.025),y=belt+.018+v*.038;
      return [x,y,.615+.012*Math.sin(v*Math.PI)];
    });
    windowPanel(g, {...m,glass:m.privacyGlass||m.glass}, [[half - 0.043, belt + 0.025, tail - 0.003], [-half + 0.043, belt + 0.025, tail - 0.003], [-roofHalf + 0.034, top - 0.065, tail + 0.012], [roofHalf - 0.034, top - 0.065, tail + 0.012]], 0.044);
    // Two articulated arms and bowed rubber blades follow the windscreen.
    // The old thick single rods read as horizontal bars across the glazing.
    const windshieldPoint=(x,y,offset=.008)=>{
      const t=clamp((y-belt-.049)/(top-.075-belt-.049),0,1);
      return [x,y,THREE.MathUtils.lerp(.605,frontRoof+.035,t)+.010*(1-(x/(half-.033))**2)+offset];
    };
    for(const [pivotX,centerX]of [[-.579,-.302],[.071,.350]]){
      const pivot=windshieldPoint(pivotX,belt+.065,.016),joint=windshieldPoint(centerX-.061,belt+.116,.017),center=windshieldPoint(centerX,belt+.140,.018);
      cylinder(g,m.black,pivot[0],pivot[1],pivot[2],.014,.013,'z',20);
      line(g,m.dark,pivot,joint,.0041);line(g,m.black,joint,center,.0032);
      const blade=Array.from({length:27},(_,i)=>{const t=i/26-.5;return windshieldPoint(centerX+t*.474,belt+.140+t*.035,.021+.003*(1-(t*2)**2));});
      curvedLine(g,m.black,blade,.0040);
      curvedLine(g,m.grille,blade.map(([x,y,z])=>[x,y+.003,z+.0015]),.0012);
    }
    line(g, m.black, [-0.23, 1.25, tail - 0.017], [0.29, 1.29, tail - 0.017], 0.010);
    for (const z of (bronco?[-.42,-1.13]:[-.46])) {
      const pts=Array.from({length:49},(_,i)=>{const x=(i/24-1)*(roofHalf-.007);return [x,roofProfile(x,roofWidth(z))+.001,z];});
      curvedLine(g,m.black,pts,.0022);
    }
    if(!bronco)curvedLine(g,m.black,[[0,top+.007,roofFront-.055],[0,top+.007,-.457]],.0022);
    view._interior({ frontZ: 0.16, rearZ: -0.91, floor: 0.55, dashY: belt - 0.005, dashZ: 0.51, width: half * 1.78, seatY: 0.90, doorCards:false, dashboard:false, centerConsole:false });
    buildSUVCabin(view,geometry,{bronco,half,belt,top,roofHalf,tail,roofFront});
    // Separate molded bumpers, recessed grille and detailed projector/LED lamp units.
    const bumperHalf=half+(bronco?.084:.106);
    const broncoBumperPoint=(x,y)=>[x,y,nose+.253-.095*(Math.abs(x)/bumperHalf)**3-.012*((y-.63)/.15)**2];
    if(bronco){
      const high=x=>.752-.058*THREE.MathUtils.smoothstep(Math.abs(x),.885,bumperHalf);
      const low=x=>.481+.060*THREE.MathUtils.smoothstep(Math.abs(x),.785,bumperHalf);
      const xs=Array.from({length:65},(_,i)=>(i/32-1)*bumperHalf);
      const outline=[...xs.map(x=>[x,low(x)]),...xs.slice().reverse().map(x=>[x,high(x)])];
      const holes=[roundedOutline([[-.346,.539,0],[.346,.539,0],[.346,.688,0],[-.346,.688,0]],.020).map(([x,y])=>[x,y])];
      for(const side of [-1,1])holes.push(roundedOutline([[side*.626,.552,0],[side*.840,.569,0],[side*.826,.675,0],[side*.625,.688,0]],.024).map(([x,y])=>[x,y]));
      // Folded steel faces and actual recessed apertures preserve the modular
      // bumper's angular sections instead of the previous rounded solid bar.
      perforatedFace(g,m.black,outline,holes,broncoBumperPoint,.034);
      for(const hole of holes)recessedOpening(g,m.dark,m.black,hole,broncoBumperPoint,.084,.05);
      for(const [edge,flip] of [[high,false],[low,true]])surface(g,m.black,64,8,(u,v)=>{
        const x=(u*2-1)*bumperHalf,y=edge(x),p=broncoBumperPoint(x,y);
        return [x,y+(flip?-.005:.005)*Math.sin(v*Math.PI),THREE.MathUtils.lerp(p[2],nose-.021,v)];
      },flip);
      for(const side of [-1,1])surface(g,m.black,8,10,(u,v)=>{
        const x=side*bumperHalf,y=THREE.MathUtils.lerp(low(x),high(x),v);
        return [x,y,THREE.MathUtils.lerp(nose-.021,broncoBumperPoint(x,y)[2],u)];
      },side<0);
      for(const x of [-.603,.603]){
        const points=Array.from({length:17},(_,i)=>{const p=broncoBumperPoint(x,.493+i/16*.252);p[2]+=.001;return p;});
        curvedLine(g,m.dark,points,.0026);
      }
      for(const side of [-1,1]){
        for(const x of [.417,.570,.645,.832]){
          const p=broncoBumperPoint(side*x,.720);
          cylinder(g,m.dark,p[0],p[1],p[2]+.004,.008,.010,'z',6);
          cylinder(g,m.grille,p[0],p[1],p[2]+.010,.0027,.002,'z',6);
        }
        const p=broncoBumperPoint(side*.884,.625);
        cylinder(g,m.dark,p[0],p[1],p[2]+.003,.012,.005,'z',22);
        cylinder(g,m.black,p[0],p[1],p[2]+.007,.009,.004,'z',22);
      }
      // Recessed horizontal reinforcement is visible inside the center mouth.
      roundedBox(g,m.dark,0,.582,nose+.155,.662,.034,.020,.004);
      for(const x of [-.212,.212])roundedBox(g,m.dark,x,.611,nose+.170,.029,.142,.037,.004);
    }else{
      // The molded stock bumper has a nearly flat middle, rolled top edge,
      // recessed fog pods and tucked outer ends. It is not a smooth capsule,
      // and does not gain the bolts/steel wings of the optional steel bumper.
      const low=x=>.482+.052*THREE.MathUtils.smoothstep(Math.abs(x),.64,bumperHalf);
      const high=x=>.748-.027*THREE.MathUtils.smoothstep(Math.abs(x),.76,bumperHalf);
      const point=(x,y)=>[x,y,nose+.267-.115*(Math.abs(x)/bumperHalf)**4-.006*((y-.610)/.14)**2];
      const xs=Array.from({length:65},(_,i)=>(i/32-1)*bumperHalf),outline=[...xs.map(x=>[x,low(x)]),...xs.slice().reverse().map(x=>[x,high(x)])];
      const holes=[-1,1].map(side=>roundedOutline([[side*.588,.546,0],[side*.862,.564,0],[side*.862,.689,0],[side*.588,.700,0]],.039).map(([x,y])=>[x,y]));
      const face=perforatedFace(g,m.black,outline,holes,point,.030);face.name='wrangler-stock-molded-bumper';
      for(const opening of holes)recessedOpening(g,m.grille,m.black,opening,point,.068,.105);
      for(const [edge,flip] of [[high,false],[low,true]])surface(g,m.black,64,10,(u,v)=>{
        const x=(u*2-1)*bumperHalf,p=point(x,edge(x)),a=v*Math.PI*.5;
        return [x,p[1]+(flip?-1:1)*.016*Math.sin(a),THREE.MathUtils.lerp(p[2],nose-.032,1-Math.cos(a))];
      },flip);
      for(const side of [-1,1])surface(g,m.black,10,8,(u,v)=>{
        const x=side*bumperHalf,y=THREE.MathUtils.lerp(low(x),high(x),v);
        return [x,y,THREE.MathUtils.lerp(nose-.032,point(x,y)[2],u)];
      },side<0);
      // Subtle mold divisions distinguish the center from removable end caps.
      for(const side of [-1,1]){
        const points=Array.from({length:21},(_,i)=>{const p=point(side*.551,.499+i*.0105);p[2]+=.0012;return p;});curvedLine(g,m.dark,points,.0016);
        // A dished reflector, small LED emitter and domed cover make the fog
        // pod read as an optical assembly instead of a flat white coin.
        const cx=side*.714,cy=.616;
        cylinder(g,m.dark,cx,cy,nose+.218,.063,.012,'z',40);
        surface(g,m.headlampReflector,48,12,(u,v)=>{
          const a=u*Math.PI*2,r=.15+.85*v;
          return [cx+Math.cos(a)*.056*r,cy+Math.sin(a)*.056*r,nose+.204+.026*r*r];
        },true);
        cylinder(g,m.white,cx,cy,nose+.221,.018,.005,'z',28);
        surface(g,m.lens,48,14,(u,v)=>{
          const a=u*Math.PI*2,r=v;
          return [cx+Math.cos(a)*.056*r,cy+Math.sin(a)*.056*r,nose+.239+.008*(1-r*r)];
        },true);
      }
    }
    // The rear bumper has a sloping step, tucked-in ends and a deeper center
    // face. Its cross-sections carry around the corners as one molded shape.
    const rearBumperHalf=half+.070;
    sweptBumper(g,m.black,[
      [-rearBumperHalf,.487,.663,tail+.037,tail-.100],[-.765,.458,.672,tail+.041,tail-.200],
      [-.49,.438,.649,tail+.052,tail-.239],[0,.436,.643,tail+.054,tail-.245],
      [.49,.438,.649,tail+.052,tail-.239],[.765,.458,.672,tail+.041,tail-.200],
      [rearBumperHalf,.487,.663,tail+.037,tail-.100]
    ],bronco?.49:.57);
    for(const side of [-1,1]) {
      // Fine molded step ribs follow the top, remaining below the tail gate.
      for(let i=0;i<15;i++) {
        const x=side*(.473+i*.021),z=tail-.132;
        line(g,m.dark,[x,.654+Math.max(0,Math.abs(x)-.53)*.040,z-.048],[x,.658+Math.max(0,Math.abs(x)-.53)*.040,z+.040],.0022);
      }
      roundedBox(g,m.dark,side*.779,.532,tail-.194,.156,.065,.017,.006);
      roundedBox(g,m.redPaint,side*.779,.534,tail-.204,.115,.032,.008,.004);
    }
    // A separately mounted plate pocket, rear recovery eye and visible fasteners.
    roundedBox(g,m.black,.600,.482,tail-.251,.338,.170,.035,.009);
    roundedBox(g,m.dark,.600,.489,tail-.272,.302,.132,.008,.004);
    for(const x of [.491,.709])cylinder(g,m.satinMetal||m.chrome,x,.537,tail-.278,.005,.008,'z',8);
    roundedBox(g,m.black,.600,.581,tail-.265,.137,.028,.039,.006);
    const rearHook=new THREE.Mesh(new THREE.TorusGeometry(.046,.013,8,24,Math.PI*1.55),bronco?m.dark:m.redPaint);
    rearHook.rotation.x=Math.PI/2;finish(rearHook,g,-.578,.416,tail-.113);
    // Angled lower protection panel with folded edges; no floating horizontal slab.
    surface(g,m.dark,30,10,(u,v)=>[(u*2-1)*THREE.MathUtils.lerp(.52,.66,v),THREE.MathUtils.lerp(.398,.519,v),THREE.MathUtils.lerp(nose-.243,nose+.156,v)],true);
    for(const x of [-.42,0,.42]) curvedLine(g,m.black,[[x,.401,nose-.226],[x,.451,nose-.069],[x,.510,nose+.129]],.005);
    for(const side of [-1,1]) line(g,m.dark,[side*.52,.398,nose-.243],[side*.66,.519,nose+.156],.012);
    if (bronco) {
      const outline=roundedOutline([[-.839,.835,0],[.839,.835,0],[.839,1.225,0],[-.839,1.225,0]],.072).map(([x,y])=>[x,y]);
      const holes=[];
      for(const [row,y] of [.869,.913,.957,1.141,1.185].entries()) for(let col=-4;col<=4;col++) {
        const x=col*.097+(row%2)*.021;
        holes.push(roundedOutline([[x-.040,y-.013,0],[x+.040,y-.013,0],[x+.040,y+.013,0],[x-.040,y+.013,0]],.010).map(([x,y])=>[x,y]));
      }
      for(const side of [-1,1]) holes.push(Array.from({length:64},(_,i)=>[side*.638+Math.cos(i*Math.PI/32)*.144,1.029+Math.sin(i*Math.PI/32)*.144]));
      roundedBox(g,m.black,0,1.027,nose+.010,1.653,.378,.021,.020);
      const grillePoint=(x,y)=>[x,y,nose+.042+.021*(1-(x/.84)**2)+.005*((y-1.028)/.20)**2];
      perforatedFace(g,m.grille,outline,holes,grillePoint);
      for(const side of [-1,1]){
        const ring=Array.from({length:65},(_,i)=>{const a=i*Math.PI/32;return grillePoint(side*.638+Math.cos(a)*.150,1.029+Math.sin(a)*.150);});
        curvedLine(g,m.dark,ring,.004);
        roundedBox(g,m.black,side*.844,1.034,nose-.019,.035,.187,.073,.013);
        roundedBox(g,m.amber,side*.855,1.034,nose+.021,.015,.155,.011,.003);
        for(let y=.975;y<1.105;y+=.017)box(g,m.badge,side*.856,y,nose+.028,.009,.003,.002);
      }
      curvedLine(g,m.grille,[[-.787,.840,nose+.044],[0,.834,nose+.064],[.787,.840,nose+.044]],.011,true);
      m.broncoGrilleLetters=m.badge.clone();m.broncoGrilleLetters.color.set('#c9cdcf');m.broncoGrilleLetters.metalness=.15;m.broncoGrilleLetters.roughness=.42;
      lettering('BRONCO',0,1.042,nose+.068,.865,.099,m.broncoGrilleLetters);
    } else {
      const outline=roundedOutline([[-.817,.857,0],[.817,.857,0],[.828,1.133,0],[.755,1.216,0],[-.755,1.216,0],[-.828,1.133,0]],.048).map(([x,y])=>[x,y]);
      // MY24's slimmer grille uses one textured black insert, gray metallic
      // slot bezels and a painted perimeter. The former paint between seven
      // long bright slots incorrectly represented the pre-refresh front.
      const insert=roundedOutline([[-.778,.876,0],[.778,.876,0],[.795,1.113,0],[.740,1.188,0],[-.740,1.188,0],[-.795,1.113,0]],.038).map(([x,y])=>[x,y]);
      const grillePoint=(x,y)=>[x,y,nose+.049+.014*(1-(x/.83)**2)];
      m.wranglerGrilleBezel=m.grille.clone();m.wranglerGrilleBezel.color.set('#555b5b');m.wranglerGrilleBezel.metalness=.46;m.wranglerGrilleBezel.roughness=.43;
      const holes=[];
      for (let i = 0; i < 7; i++) {
        const x=(i-3)*.134;
        const slot=roundedOutline([[x-.057,.907,0],[x+.057,.907,0],[x+.057,1.178,0],[x-.057,1.178,0]],.021).map(([x,y])=>[x,y]);holes.push(slot);
        const rim=roundedOutline([[x-.063,.901,0],[x+.063,.901,0],[x+.063,1.184,0],[x-.063,1.184,0]],.025).map(([x,y])=>[x,y]);
        perforatedFace(g,m.wranglerGrilleBezel,rim,[slot],(x,y)=>{const p=grillePoint(x,y);p[2]+=.0015;return p;},.024);
        recessedOpening(g,m.wranglerGrilleBezel,m.black,slot,grillePoint,.036,.13);
        cellularGrille(g,m.grille,slot,(a,b)=>{const p=grillePoint(a,b);p[2]-=.018;return p;},{pitch:.024,web:.0017,depth:.009,name:'wrangler-my24-recessed-radiator-mesh-'+i});
      }
      for(const side of [-1,1])holes.push(Array.from({length:64},(_,i)=>[side*.636+Math.cos(i*Math.PI/32)*.137,1.029+Math.sin(i*Math.PI/32)*.137]));
      const surround=perforatedFace(g,m.paint,outline,[insert],grillePoint);surround.name='wrangler-my24-painted-grille-surround';
      const insertMesh=perforatedFace(g,m.black,insert,holes,grillePoint);insertMesh.name='wrangler-my24-seven-slot-grille';
      for(const side of [-1,1])for(let row=0;row<4;row++){
        const y=.902+row*.014,center=side*.662,width=.058-row*.004;
        curvedLine(g,m.dark,[[center-width,y,grillePoint(center-width,y)[2]+.001],[center+width,y,grillePoint(center+width,y)[2]+.001]],.0015);
      }
      // The grille surround turns back into the narrower body cap. Its
      // upper corners used to end as an open front sheet, exposing a small
      // triangular view through the shoulder above the fender lamps.
      const bodyCapPoint=(x,y)=>{
        const width=interpolate(stations,nose,1),xx=clamp(x,-width,width),a=Math.max(0,Math.abs(xx)-(width-shoulder));
        const capTop=interpolate(stations,nose,2)+(a>0?-shoulder+Math.sqrt(Math.max(0,shoulder*shoulder-a*a)):.027*(1-(xx/(width-shoulder))**2));
        return [xx,Math.min(y,capTop),nose];
      };
      surface(g,m.paint,outline.length,8,(u,v)=>{
        const i=Math.min(outline.length-1,Math.floor(u*outline.length)),next=(i+1)%outline.length,t=u*outline.length-i;
        const x=THREE.MathUtils.lerp(outline[i][0],outline[next][0],t),y=THREE.MathUtils.lerp(outline[i][1],outline[next][1],t);
        const a=grillePoint(x,y),b=bodyCapPoint(x,y);
        return a.map((value,k)=>THREE.MathUtils.lerp(value,b[k],v));
      },true);
    }
    for (const side of [-1, 1]) {
      const lampX = side * (bronco ? 0.638 : 0.636);
      roundSUVLamp(g,m,lampX,1.029,nose+(bronco?.007:.015),bronco?.131:.124,bronco);
      if (bronco) roundedBox(g, m.white, lampX - side * 0.095, 1.029, nose + 0.065, 0.238, 0.014, 0.008, 0.003);
      {
        const lampFirstChild=g.children.length;
        const x=side*(half-.091),y=bronco?1.034:1.053,w=bronco?.180:.230,h=bronco?.371:.250;
        const raw=bronco?[[-w/2,-h/2],[w/2-.042,-h/2],[w/2,-h/2+.039],[w/2,h/2],[-w/2,h/2]]:[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
        const outline=roundedOutline(raw.map(([a,b])=>[x+side*a,y+b,0]),bronco?.022:.035);
        const shape=new THREE.Shape();outline.forEach(([a,b],i)=>shape[i?'lineTo':'moveTo'](a,b));shape.closePath();
        finish(new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.078,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:3,steps:1}),m.black),g,0,0,tail-.092);
        const rear=frontSkinProjector(g,[],-1,tail-.094),scaled=(sx,sy)=>outline.map(([a,b])=>[x+(a-x)*sx,y+(b-y)*sy,0]);
        rear.patch(m.red,scaled(bronco?.93:.88,bronco?.96:.93),.007);
        rear.patch(m.dark,scaled(bronco?.60:.61,bronco?.81:.64),.009);
        const ribbon=(material,points,width,offset)=>{
          const curve=new THREE.CatmullRomCurve3(points.map(([a,b])=>v3(x+side*a,y+b,0)),false,'centripetal');
          surface(g,material,Math.max(18,points.length*8),1,(u,v)=>{
            const p=curve.getPoint(u),t=curve.getTangent(u),normal=v3(-t.y,t.x,0).normalize();
            return rear.point([p.x+normal.x*(v-.5)*width,p.y+normal.y*(v-.5)*width,0],offset);
          });
        };
        if(bronco) {
          // Signature lamp's open outer loop and central stacked clear optics.
          ribbon(m.red,[[.051,.016],[.051,.137],[.036,.158],[-.052,.157],[-.066,.140],[-.066,-.143],[-.047,-.162],[.020,-.161],[.051,-.129],[.051,-.019]],.011,.012);
          rear.patch(m.satinMetal,[[x-side*.031,y+.104,0],[x+side*.017,y+.104,0],[x+side*.017,y-.111,0],[x-side*.032,y-.135,0]],.010);
          rear.patch(m.black,[[x-side*.026,y+.061,0],[x+side*.012,y+.061,0],[x+side*.012,y-.100,0],[x-side*.026,y-.100,0]],.012);
          for(let k=0;k<9;k++)rear.patch(m.reverse,[[x-side*.022,y+.042-k*.015,0],[x+side*.009,y+.042-k*.015,0],[x+side*.009,y+.049-k*.015,0],[x-side*.022,y+.049-k*.015,0]],.013);
          ribbon(m.dark,[[.080,0],[.026,0]],.017,.014);
        }else{
          // JL lamps retain the square outer red guide, with a separate low
          // reverse chamber and layered optics instead of a red/white block.
          const ring=scaled(.73,.77);curvedLine(g,m.red,[...ring,ring[0]].map(p=>rear.point(p,.013)),.0055);
          rear.patch(m.reverse,[[x-.059,y-.051,0],[x+.059,y-.051,0],[x+.059,y-.006,0],[x-.059,y-.006,0]],.012);
          for(let k=0;k<8;k++)rear.patch(m.chrome,[[x-.052+k*.014,y-.047,0],[x-.048+k*.014,y-.047,0],[x-.048+k*.014,y-.010,0],[x-.052+k*.014,y-.010,0]],.013);
          rear.patch(m.red,[[x-.061,y+.012,0],[x+.061,y+.012,0],[x+.061,y+.057,0],[x-.061,y+.057,0]],.011);
          for(const xx of [-.048,.048])cylinder(g,m.dark,x+xx,y+.045,tail-.109,.010,.009,'z',16);
        }
        // The slightly bowed outer cover catches a continuous edge highlight.
        const center=v3(x,y,tail-.116),verts=[center.toArray(),...scaled(.92,.95).map(p=>rear.point(p,.019))];
        const lensGeo=new THREE.BufferGeometry(),ids=[];
        lensGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts.flat(),3));
        for(let i=0;i<outline.length;i++)ids.push(0,1+(i+1)%outline.length,1+i);
        lensGeo.setIndex(ids);lensGeo.computeVertexNormals();finish(new THREE.Mesh(lensGeo,m.lens),g);
        if(bronco)for(const mesh of g.children.slice(lampFirstChild))mesh.position.z+=.022;
      }
      if(bronco) {
        const shape=new THREE.Shape(),outer=roundedOutline([[-.045,-.057,0],[.045,-.057,0],[.045,.057,0],[-.045,.057,0]],.025);
        outer.forEach(([x,y],i)=>shape[i?'lineTo':'moveTo'](x,y));shape.closePath();
        const hole=new THREE.Path(),inner=roundedOutline([[-.022,-.031,0],[.022,-.031,0],[.022,.031,0],[-.022,.031,0]],.014);
        inner.forEach(([x,y],i)=>hole[i?'lineTo':'moveTo'](x,y));hole.closePath();shape.holes.push(hole);
        const eye=new THREE.ExtrudeGeometry(shape,{depth:.026,bevelEnabled:true,bevelSize:.005,bevelThickness:.005,bevelSegments:3,steps:1});
        const p=broncoBumperPoint(side*.459,.611);finish(new THREE.Mesh(eye,m.dark),g,p[0],p[1],p[2]+.013);
        roundedBox(g,m.black,p[0],p[1],p[2]-.010,.106,.139,.032,.014);
      } else {
        const hook=new THREE.Mesh(new THREE.TorusGeometry(.054,.015,8,24,Math.PI*1.4),m.redPaint);hook.rotation.x=Math.PI/2;finish(hook,g,side*.51,.694,nose+.25);
      }
    }
    const spareRise=Math.max(0,spec.tireRadius-(spec.visualBase?.tireRadius??spec.tireRadius));
    const spare = view._wheel(true); spare.root.position.set(0, 1.092+spareRise, tail - 0.20); spare.root.rotation.y = Math.PI / 2; g.add(spare.root);
    const cameraZ=tail-.20-spec.tireWidth*.52-.011;
    cylinder(g,m.black,0,1.092+spareRise,cameraZ+.011,.031,.035,'z',28);
    cylinder(g,m.grille,0,1.092+spareRise,cameraZ-.009,.023,.007,'z',28);
    cylinder(g,m.lens,0,1.092+spareRise,cameraZ-.014,.015,.006,'z',24);
    roundedBox(g, m.black, 0, 1.40+spareRise*2, tail - 0.18, 0.11, 0.43, 0.045, 0.01);
    roundedBox(g, m.red, 0, 1.57+spareRise*2, tail - 0.242, 0.225, 0.046, 0.031, 0.006);
    roundedBox(g,m.dark,.559,1.138,tail-.030,.179,.060,.019,.013);
    roundedBox(g,m.black,.559,1.148,tail-.049,.152,.027,.030,.009);
    for (const y of [0.821, 1.151]) {
      roundedBox(g,m.paint,-.592,y,tail-.039,.250,.059,.050,.012);
      cylinder(g,m.paint,-.706,y,tail-.057,.017,.076,'y',18);
      for(const x of [-.668,-.528])cylinder(g,m.dark,x,y,tail-.068,.005,.009,'z',6);
    }
    const gateSeam=roundedOutline([[-.706,.687,tail-.003],[.706,.687,tail-.003],[.706,belt-.014,tail-.003],[-.706,belt-.014,tail-.003]],.030);
    curvedLine(g,m.dark,[...gateSeam,gateSeam[0]],.0020);
    for(const x of [-.515,.515])roundedBox(g,m.black,x,top-.064,tail-.026,.045,.124,.028,.007);
    view.root.userData.visualModel.suv={revision:8,style:bronco?'bronco':'jeep',hoodRearM:hoodRear,
      stampedBonnet:true,drawnWheelHaunches:true,physicalCowlAperture:true,hoodHingeAssemblies:true,recessedFuelCap:!bronco,spareCamera:true};
  }

/** Reference-shaped 2024 cabins; the shared seat and suspension rig is unchanged. */
function buildSUVCabin(view,geometry,{bronco,half,belt,top,roofHalf,tail,roofFront}) {
  const {THREE,finish,roundedBox,cylinder,polygon,surface,curvedLine,roundedOutline,line,frontText}=geometry;
  const g=view.body,m=view.materials,width=half*1.78,faceZ=.340;
  m.cabinAccent=m.interior.clone();m.cabinAccent.color.set(bronco?'#cb982d':'#923b35');m.cabinAccent.userData.vehicleInterior=true;
  const soft=m.upholstery,trim=m.interior,accent=m.cabinAccent;
  // A rolled upper pad, sloping fascia and lower knee bolster form the dash.
  surface(g,soft,40,14,(u,v)=>{
    const x=(u*2-1)*width*.50,y=belt+.032-.056*(1-v)**2+.009*Math.cos(x/width*Math.PI);
    return [x,y,THREE.MathUtils.lerp(faceZ,.621,v)+.015*(x/width)**2];
  },true);
  surface(g,trim,40,16,(u,v)=>{
    const x=(u*2-1)*width*.50,y=THREE.MathUtils.lerp(belt-.230,belt+.025,v);
    return [x,y,faceZ+.018*(x/width)**2-.018*Math.sin(v*Math.PI)];
  },true);
  roundedBox(g,soft,0,belt-.254,.426,width*.94,.087,.219,.029);
  const dashSeam=Array.from({length:49},(_,i)=>{const x=(i/24-1)*width*.485;return [x,belt-.162,faceZ-.003+.018*(x/width)**2];});
  curvedLine(g,bronco?trim:accent,dashSeam,.0018);
  // Defroster outlets run along the bottom of the windscreen.
  for(const side of [-1,1]){
    roundedBox(g,m.black,side*width*.27,belt+.037,.569,width*.31,.007,.019,.005);
    for(let i=0;i<13;i++)line(g,trim,[side*width*.27+(i-6)*width*.022,belt+.041,.562],[side*width*.27+(i-6)*width*.022,belt+.041,.576],.0017);
  }
  const screenWidth=bronco?.270:.290,screenHeight=bronco?.168:.122,screenY=belt-(bronco?.059:.005);
  roundedBox(g,m.black,0,screenY,faceZ-.020,screenWidth+.040,screenHeight+.037,.041,.013);
  roundedBox(g,m.screen,0,screenY+.002,faceZ-.043,screenWidth,screenHeight,.005,.006);
  // Subtle interface divisions add scale without a photographed dashboard map.
  for(let i=0;i<4;i++)roundedBox(g,trim,(i-1.5)*screenWidth*.205,screenY-screenHeight*.389,faceZ-.047,screenWidth*.157,.007,.002,.001);
  roundedBox(g,trim,-screenWidth*.279,screenY+.020,faceZ-.047,screenWidth*.305,.003,.002,.001);
  roundedBox(g,trim,-screenWidth*.315,screenY+.008,faceZ-.047,screenWidth*.233,.003,.002,.001);
  const verticalVent=x=>{
    roundedBox(g,m.black,x,belt-.053,faceZ-.022,.069,.178,.039,.014);
    roundedBox(g,m.grille,x,belt-.053,faceZ-.044,.054,.157,.006,.009);
    roundedBox(g,m.black,x,belt-.053,faceZ-.049,.044,.146,.006,.007);
    for(let i=0;i<7;i++)line(g,trim,[x-.021,belt-.113+i*.020,faceZ-.054],[x+.021,belt-.113+i*.020,faceZ-.054],.0025);
    roundedBox(g,accent,x,belt-.045,faceZ-.057,.027,.006,.005,.002);
  };
  if(bronco){
    for(const x of [-width*.442,-.193,.193,width*.442])verticalVent(x);
    roundedBox(g,m.black,0,belt+.048,.489,.303,.013,.065,.012);
    for(let i=0;i<6;i++){
      roundedBox(g,trim,(i-2.5)*.043,belt+.057,.480,.032,.009,.031,.005);
      roundedBox(g,i===5?accent:m.headliner,(i-2.5)*.043,belt+.063,.477,.009,.002,.006,.001);
    }
    const label=new THREE.Group();label.position.set(-width*.294,belt-.105,faceZ-.016);label.rotation.y=Math.PI;g.add(label);
    frontText(label,'BRONCO',0,0,0,.291,.033,'#45494a');
  }else{
    for(const x of [-width*.442,width*.442]){
      cylinder(g,m.grille,x,belt-.044,faceZ-.026,.046,.021,'z',36);
      cylinder(g,m.black,x,belt-.044,faceZ-.039,.039,.010,'z',36);
      for(let i=-2;i<=2;i++){const w=Math.sqrt(.035**2-(i*.011)**2);line(g,trim,[x-w,belt-.044+i*.011,faceZ-.047],[x+w,belt-.044+i*.011,faceZ-.047],.0026);}
    }
    // MY24's wider display moves the center vents into one slim lower strip.
    roundedBox(g,m.black,0,belt-.094,faceZ-.028,.277,.037,.030,.006);
    for(const y of [-.008,.008])line(g,trim,[-.130,belt-.094+y,faceZ-.046],[.130,belt-.094+y,faceZ-.046],.0022);
    for(let i=-5;i<=5;i++)line(g,trim,[i*.023,belt-.107,faceZ-.047],[i*.023,belt-.081,faceZ-.047],.0014);
    roundedBox(g,soft,-width*.292,belt-.189,faceZ-.037,.353,.055,.039,.012);
    for(const x of [-width*.403,-width*.181])cylinder(g,m.grille,x,belt-.189,faceZ-.061,.007,.005,'z',12);
  }
  // Climate stack and tactile buttons sit below the touchscreen assembly.
  const climateY=belt-(bronco?.228:.176);
  roundedBox(g,m.black,0,climateY,faceZ-.018,.298,.097,.071,.025);
  const knobs=bronco?[[-.109,.021],[.047,.021],[-.110,-.025],[.111,-.025]]:[[-.107,0],[0,0],[.107,0]];
  for(const [x,y] of knobs){
    cylinder(g,m.grille,x,climateY+y,faceZ-.059,.019,.019,'z',24);
    cylinder(g,m.black,x,climateY+y,faceZ-.071,.014,.009,'z',24);
    line(g,m.headliner,[x,climateY+y+.006,faceZ-.077],[x,climateY+y+.012,faceZ-.077],.0013);
  }
  for(let row=0;row<2;row++)for(let i=-2;i<=2;i++)roundedBox(g,trim,i*.028,climateY-.012+row*.025,faceZ-.061,.023,.012,.007,.002);
  // Recessed glovebox and pull are visible through the passenger door glass.
  const gloveOutline=roundedOutline([[-width*.440,belt-.232,0],[-.234,belt-.232,0],[-.234,belt-.373,0],[-width*.440,belt-.373,0]],.021);
  curvedLine(g,m.black,[...gloveOutline,gloveOutline[0]].map(([x,y])=>[x,y,.321]),.0024);
  roundedBox(g,m.black,-width*.294,belt-.266,.304,.104,.034,.012,.008);
  roundedBox(g,trim,-width*.294,belt-.260,.295,.071,.012,.012,.005);
  // The Bronco has an offset analog speedometer and adjacent display; the
  // Wrangler uses two round gauges around a central information screen.
  const driverX=width*.27,gaugeY=belt-.028;
  roundedBox(g,m.black,driverX,gaugeY,faceZ-.022,.297,.137,.082,.026);
  if(bronco){
    roundedBox(g,m.screen,driverX-.038,gaugeY,faceZ-.066,.151,.102,.008,.004);
  }else roundedBox(g,m.screen,driverX,gaugeY,faceZ-.066,.071,.086,.008,.005);
  for(const dx of bronco?[.090]:[-.094,.094]){
    cylinder(g,m.grille,driverX+dx,gaugeY,faceZ-.063,.049,.010,'z',32);
    cylinder(g,m.black,driverX+dx,gaugeY,faceZ-.070,.044,.008,'z',32);
    for(let i=0;i<11;i++){
      const a=(-.72+i*.144)*Math.PI;
      line(g,m.headliner,[driverX+dx+Math.sin(a)*.036,gaugeY+Math.cos(a)*.036,faceZ-.076],[driverX+dx+Math.sin(a)*.041,gaugeY+Math.cos(a)*.041,faceZ-.076],.0012);
    }
    line(g,accent,[driverX+dx,gaugeY,faceZ-.078],[driverX+dx+.025,gaugeY-.022,faceZ-.078],.0017);
  }
  const steering=new THREE.Group();steering.position.set(driverX,belt-.055,.111);steering.rotation.x=-.23;g.add(steering);
  const wheelRim=Array.from({length:81},(_,i)=>{const a=i*Math.PI/40;return [Math.cos(a)*.155,bronco?Math.max(-.135,Math.sin(a)*.155):Math.sin(a)*.155,0];});
  curvedLine(steering,m.black,wheelRim,.015,true);
  const spoke=(side)=>{
    const points=side===0?[[-.027,-.045],[-.030,-.131],[.030,-.131],[.027,-.045]]:
      [[side*.039,.031],[side*.138,.044],[side*.138,-.015],[side*.046,-.036]];
    polygon(steering,trim,points.map(([x,y])=>[x,y,-.012]));
    curvedLine(steering,m.grille,points.slice(0,3).map(([x,y])=>[x,y,-.015]),.003);
  };
  for(const side of [-1,0,1])spoke(side);
  if(bronco)roundedBox(steering,soft,0,-.003,-.022,.115,.118,.052,.029);
  else{
    cylinder(steering,m.grille,0,0,-.022,.058,.035,'z',40);
    cylinder(steering,soft,0,0,-.042,.052,.016,'z',40);
  }
  for(const side of [-1,1]){
    roundedBox(steering,m.black,side*.095,.010,-.022,.039,.035,.016,.007);
    for(const x of [-.009,.009])for(const y of [-.008,.008])roundedBox(steering,trim,side*.095+x,.010+y,-.032,.010,.009,.003,.001);
  }
  line(g,m.black,[driverX+.030,belt-.116,.265],[driverX+.204,belt-.107,.212],.009);
  line(g,m.black,[driverX-.025,belt-.123,.265],[driverX-.197,belt-.120,.213],.008);
  // Selector, range lever / terrain dial, open cup wells and console grab rail.
  roundedBox(g,soft,0,.827,-.033,.228,.092,.473,.024);
  roundedBox(g,m.grille,.035,.878,.090,.099,.013,.166,.015);
  roundedBox(g,m.black,.035,.886,.094,.061,.009,.127,.014);
  line(g,m.black,[.035,.885,.094],[.035,.979,.084],.010);
  const selector=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),soft);selector.scale.set(.027,.043,.038);finish(selector,g,.035,.982,.079);
  roundedBox(g,m.grille,.035,.998,.049,.033,.042,.008,.010);
  if(bronco){
    cylinder(g,m.grille,.035,.886,-.058,.037,.019,'y',32);
    cylinder(g,m.black,.035,.898,-.058,.030,.008,'y',32);
    curvedLine(g,accent,[[-.123,.893,.077],[-.135,.933,.030],[-.135,.930,-.112],[-.123,.890,-.151]],.007,true);
  }else{
    line(g,m.black,[-.080,.855,.052],[-.078,.933,.041],.010);
    const lever=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),soft);lever.scale.set(.026,.025,.031);finish(lever,g,-.078,.938,.041);
    roundedBox(g,m.black,0,.922,.284,.223,.088,.039,.012);
    for(const x of [-.072,-.024,.024,.072])roundedBox(g,trim,x,.930,.260,.029,.042,.009,.006);
  }
  for(const z of [-.158,-.252]){
    cylinder(g,m.black,.011,.835,z,.037,.028,'y',28);
    const cup=new THREE.Mesh(new THREE.TorusGeometry(.039,.0035,8,32),m.grille);cup.rotation.x=Math.PI/2;finish(cup,g,.011,.859,z);
  }
  roundedBox(g,soft,0,.864,-.460,.205,.076,.270,.032);
  // Separate front/rear molded cards follow each real door opening.
  for(const side of [-1,1])for(const [front,rear] of [[.542,-.422],[-.482,-1.182]]){
    const cardX=side*(half-.050),centerZ=(front+rear)/2,cardTop=belt+.009;
    const contour=roundedOutline([[front,.650,0],[front,cardTop-.026,0],[rear,cardTop,0],[rear,.652,0]],.041).map(([z,y])=>[z,y]);
    const positions=contour.map(([z,y])=>[cardX,y,z]);polygon(g,trim,positions);
    const upper=Array.from({length:25},(_,i)=>[side*(half-.053),cardTop-.044+.010*i/24,THREE.MathUtils.lerp(front-.027,rear+.027,i/24)]);
    curvedLine(g,soft,upper,.013);
    roundedBox(g,soft,side*(half-.087),.978,centerZ+.030,.091,.050,(front-rear)*.51,.019);
    const pullZ=front-.176;
    roundedBox(g,m.black,side*(half-.067),belt-.108,pullZ,.015,.067,.106,.016);
    curvedLine(g,m.grille,[[side*(half-.078),belt-.083,pullZ+.042],[side*(half-.078),belt-.083,pullZ-.034],[side*(half-.078),belt-.125,pullZ-.034]],.005);
    // Map pocket has a thin lip and inset mesh, not another solid block.
    roundedBox(g,m.black,side*(half-.064),.756,centerZ-.045,.014,.137,(front-rear)*.69,.020);
    for(let i=0;i<14;i++)line(g,trim,[side*(half-.074),.703,centerZ-.045+(i-6.5)*(front-rear)*.044],[side*(half-.074),.810,centerZ-.045+(i-6.5)*(front-rear)*.044],.0015);
    line(g,bronco?accent:soft,[side*(half-.081),.824,centerZ-.045-(front-rear)*.325],[side*(half-.081),.824,centerZ-.045+(front-rear)*.325],.003);
  }
  // Visible inner roof skin, padded rails, removable-panel latches and mirror.
  roundedBox(g,trim,0,top-.058,(tail+roofFront)/2,(roofHalf-.065)*2,.023,roofFront-tail-.100,.012);
  for(const side of [-1,1]){
    line(g,soft,[side*(half-.095),belt+.10,.545],[side*(roofHalf-.080),top-.117,roofFront-.004],.027);
    line(g,soft,[side*(roofHalf-.075),top-.085,roofFront-.035],[side*(roofHalf-.075),top-.085,tail+.102],.026);
    for(const z of [-.466,-1.207])line(g,soft,[side*(half-.089),belt+.053,z],[side*(roofHalf-.075),top-.081,z-.013],.026);
    roundedBox(g,trim,side*width*.260,top-.104,.185,.334,.022,.135,.015);
    for(const x of [side*.30,side*.64])roundedBox(g,m.black,x,top-.094,roofFront-.079,.041,.023,.062,.008);
  }
  line(g,soft,[-half+.094,top-.094,-.46],[half-.094,top-.094,-.46],.026);
  roundedBox(g,m.black,0,top-.206,.350,.244,.079,.027,.016);
  roundedBox(g,m.chrome,0,top-.205,.333,.218,.057,.006,.009);
  line(g,m.black,[0,top-.165,.359],[0,top-.077,.384],.011);
}
