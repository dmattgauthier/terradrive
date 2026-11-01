// Native-only coachwork fork; browser source remains immutable.
export function buildSprinter(view, geometry) {
  const { THREE, UP, X_AXIS, clamp, v3, finish, box, roundedBox, roofCap, cylinder, panel, polygon, surface, interpolate, lowerShell, perforatedFace, recessedOpening, sweptBumper, subdivideBendRegions, roundBodyEnds, roundRoofShoulders, frontSkinProjector, curvedLine, roundedOutline, windowPanel, ellipseRing, profile, line, archPoints, sideText, frontText } = geometry;

  // The original cargo-panel "detail" was a loose tube above a flat sheet.
  // A pressing is instead a shallow recess in the same sheet, bounded by a
  // shared aperture and a smooth, structured shoulder. No overlapping skin.
  const sheetGeometry = (shape, side, sideX, depth = 0, edge = .055) => {
    let geo = new THREE.ShapeGeometry(shape, 8);
    geo.rotateY(Math.PI / 2); geo = subdivideBendRegions(geo, -Infinity, edge);
    const p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i), h = .0008;
      const dy = (sideX(side, y + h, 0, z) - sideX(side, y - h, 0, z)) / (2 * h);
      const dz = (sideX(side, y, 0, z + h) - sideX(side, y, 0, z - h)) / (2 * h);
      p.setX(i, sideX(side, y, 0, z) - side * depth);
      const normal = v3(side, -side * dy, -side * dz).normalize(); n.setXYZ(i, normal.x, normal.y, normal.z);
    }
    if (side < 0) { const ids = geo.index.array; for (let i = 0; i < ids.length; i += 3) { const b = ids[i + 1]; ids[i + 1] = ids[i + 2]; ids[i + 2] = b; } }
    return geo;
  };
  const stampedRecess = (parent, material, side, outline, sideX, depth = .0085) => {
    const contour = [];
    for (let i = 0; i < outline.length; i++) {
      const a = v3(...outline[i]), b = v3(...outline[(i + 1) % outline.length]), steps = Math.max(1, Math.ceil(a.distanceTo(b) / .042));
      for (let j = 0; j < steps; j++) contour.push(a.clone().lerp(b, j / steps));
    }
    const center = contour.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / contour.length);
    const inner = contour.map(p => p.clone().lerp(center, .045)), positions = [], ids = [], rings = 8, count = contour.length;
    for (let ring = 0; ring <= rings; ring++) for (let i = 0; i < count; i++) {
      const t = ring / rings, p = contour[i].clone().lerp(inner[i], t), drop = depth * (.5 - .5 * Math.cos(t * Math.PI));
      positions.push(sideX(side, p.y, 0, p.z) - side * drop, p.y, p.z);
      if (ring < rings) { const a = ring * count + i, b = ring * count + (i + 1) % count, c = a + count, d = b + count; ids.push(a, b, c, b, d, c); }
    }
    if (side < 0) for (let i = 0; i < ids.length; i += 3) { const b = ids[i + 1]; ids[i + 1] = ids[i + 2]; ids[i + 2] = b; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(ids); geo.computeVertexNormals();
    for (const ring of [0, rings]) for (let i = 0; i < count; i++) {
      const p = ring ? inner[i] : contour[i], h = .0008, dy = (sideX(side, p.y + h, 0, p.z) - sideX(side, p.y - h, 0, p.z)) / (2 * h);
      const dz=(sideX(side,p.y,0,p.z+h)-sideX(side,p.y,0,p.z-h))/(2*h);
      const normal = v3(side, -side * dy, -side * dz).normalize(); geo.attributes.normal.setXYZ(ring * count + i, normal.x, normal.y, normal.z);
    }
    finish(new THREE.Mesh(geo, material), parent).name = 'sprinter-integrated-cargo-pressing';
    const inset = new THREE.Shape(); inner.forEach((p, i) => i ? inset.lineTo(-p.z, p.y) : inset.moveTo(-p.z, p.y)); inset.closePath();
    finish(new THREE.Mesh(sheetGeometry(inset, side, sideX, depth), material), parent);
  };

    const m = view.materials, g = view.body, wb = view.spec.wheelbase, f = wb / 2, r = -f;
    const nose = 2.819, tail = -3.016, half = 0.985;
    // Fine molded optics belong in surface normals, not thousands of tiny
    // geometric teeth. A small repeatable linear-data map supplies restrained
    // crossing flutes at a physical pitch; mipmaps calm the distant lamps.
    const opticalPitch=.0032,opticalSize=64,opticalData=new Uint8Array(opticalSize*opticalSize*4);
    for(let y=0;y<opticalSize;y++)for(let x=0;x<opticalSize;x++){
      const u=(x+.5)/opticalSize,v=(y+.5)/opticalSize,a=u*Math.PI*2,b=v*Math.PI*2;
      const dx=(.00012*Math.PI*2*Math.sin(a)+.000025*Math.PI*4*Math.sin(a*2))/opticalPitch,dy=.000060*Math.PI*2*Math.sin(b)/opticalPitch;
      const normal=v3(-dx,-dy,1).normalize(),i=(y*opticalSize+x)*4;
      opticalData[i]=Math.round((normal.x*.5+.5)*255);opticalData[i+1]=Math.round((normal.y*.5+.5)*255);opticalData[i+2]=Math.round((normal.z*.5+.5)*255);opticalData[i+3]=255;
    }
    const opticalMap=new THREE.DataTexture(opticalData,opticalSize,opticalSize,THREE.RGBAFormat,THREE.UnsignedByteType);
    opticalMap.name='sprinter-molded-optics-normal';opticalMap.colorSpace=THREE.NoColorSpace;
    opticalMap.wrapS=opticalMap.wrapT=THREE.RepeatWrapping;opticalMap.minFilter=THREE.LinearMipmapLinearFilter;opticalMap.magFilter=THREE.LinearFilter;opticalMap.generateMipmaps=true;opticalMap.anisotropy=2;opticalMap.needsUpdate=true;
    m.sprinterPrismaticLens=m.lens.clone();m.sprinterRedPrismaticLens=m.redLens.clone();
    for(const material of [m.sprinterPrismaticLens,m.sprinterRedPrismaticLens]){
      material.normalMap=opticalMap;material.normalScale.set(.66,.66);material.emissive.set(0);material.emissiveIntensity=0;material.forceSinglePass=true;material.userData.vehicleLampLens=true;
    }
    m.sprinterRedPrismaticLens.userData.vehicleTintedLens=true;
    const grilleOutline=roundedOutline([[-.475,.902,nose],[-.350,.882,nose],[0,.875,nose],[.350,.882,nose],[.475,.902,nose],[.558,1.164,nose],[.533,1.183,nose],[-.533,1.183,nose],[-.558,1.164,nose]],.039,7);
    const lampOutlines=[-1,1].map(side=>roundedOutline([[side*.565,.910,nose],[side*.816,.922,nose],[side*.908,.975,nose],[side*.953,1.218,nose],[side*.923,1.242,nose],[side*.626,1.183,nose]],.034,8));
    const bodyStations=[[tail,.951,1.35],[-2.88,half,1.35],[-1.8,half,1.35],[.45,half,1.35],[1.60,half-.025,1.35],[2.08,half-.025,1.43],[2.28,.977,1.349],[2.65,.952,1.190],[nose,.930,1.125]];
    const bonnetLift=(x,z)=>{
      const t=clamp((z-2.170)/(nose-2.170),0,1),w=interpolate(bodyStations,z,1)-.055;
      const edge=.821-.225*THREE.MathUtils.smoothstep(t,0,1),fade=Math.sin(t*Math.PI)**2;
      const center=1-THREE.MathUtils.smoothstep(Math.abs(x),edge-.040,edge+.062);
      const pressedEdge=.0055*Math.exp(-(((Math.abs(x)-edge+.038)/.030)**2));
      return (.024*center+.016*(1-(x/w)**2)**2+pressedEdge)*fade;
    };
    const vanSkin=lowerShell(g,m.paint,bodyStations,wb,.426,.442,.394,.024,.015,.055,{cabin:{rear:tail+.042,front:2.170,half:.875}});
    // The bonnet's stamped center and shoulder rolls belong to its continuous
    // sheet. Rebuild only that small top grid, before clipping the fascia, so
    // the grille, headlamps, seams and cowl share the same curved surface.
    for(let index=0;index<vanSkin.length;index++){
      const mesh=vanSkin[index],p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
      let minZ=Infinity,ny=0;for(let i=0;i<p.count;i++){minZ=Math.min(minZ,p.getZ(i));ny+=n.getY(i);}
      if(minZ<2.169||ny/p.count<.5)continue;
      const bonnet=surface(g,m.paint,72,32,(u,v)=>{
        const z=THREE.MathUtils.lerp(2.170,nose,v),w=interpolate(bodyStations,z,1)-.055,x=(u*2-1)*w;
        return [x,interpolate(bodyStations,z,2)+.024*(1-(x/w)**2)+bonnetLift(x,z),z];
      },true);
      bonnet.name='sprinter-sculpted-bonnet';mesh.parent.remove(mesh);mesh.geometry.dispose();vanSkin[index]=bonnet;
    }
    // The full-width lower rear cap would fill a rear-door pressing from
    // behind. Replace it with the actual surrounding frame and door skins.
    const rearCapIndex=vanSkin.findIndex(mesh=>{const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)-tail)>.00001)return false;return true;});
    if(rearCapIndex>=0){const cap=vanSkin.splice(rearCapIndex,1)[0];cap.parent.remove(cap);cap.geometry.dispose();}
    // The generic cap sampled its curved top in 22 uniform columns, while
    // the bonnet shoulder used an eight-step circular section. Their unequal
    // chords left tiny triangular holes that broke projected lamp surfaces.
    // Reuse both boundary samplings so the front is a closed sheet.
    const frontCapIndex=vanSkin.findIndex(mesh=>{const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)-nose)>.00001)return false;return true;});
    if(frontCapIndex>=0){const cap=vanSkin.splice(frontCapIndex,1)[0];cap.parent.remove(cap);cap.geometry.dispose();}
    const frontWidth=interpolate(bodyStations,nose,1),frontTop=interpolate(bodyStations,nose,2),frontShoulder=.055,frontXs=[];
    for(let i=0;i<=22;i++)frontXs.push((i/11-1)*(frontWidth-frontShoulder));
    for(const side of [-1,1])for(let i=1;i<=8;i++)frontXs.push(side*(frontWidth-frontShoulder+Math.sin(i*Math.PI/16)*frontShoulder));
    frontXs.sort((a,b)=>a-b);
    vanSkin.push(surface(g,m.paint,frontXs.length-1,12,(u,v)=>{
      const x=frontXs[Math.round(u*(frontXs.length-1))],a=Math.max(0,Math.abs(x)-(frontWidth-frontShoulder));
      const y=frontTop+(a>0?-frontShoulder+Math.sqrt(Math.max(0,frontShoulder*frontShoulder-a*a)):.024*(1-(x/(frontWidth-frontShoulder))**2));
      return [x,THREE.MathUtils.lerp(.442,y,v),nose];
    }));
    const pointProjector=frontSkinProjector(g,vanSkin);
    // Projected vertices alone do not make a flush patch: a triangle that
    // spans the bonnet/front-cap fold cuts through the underlying body even
    // when its corners are correct. Clip each outline to the body's triangles
    // so every resulting face shares the precise surface below it.
    const frontTriangles=[];
    for(const mesh of vanSkin){
      const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,index=mesh.geometry.index;
      for(let i=0;i<(index?.count||p.count);i+=3){
        const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),a=ids.map(j=>[p.getX(j),p.getY(j),p.getZ(j)]);
        if(Math.max(...a.map(p=>p[2]))<2.160)continue;
        const det=(a[1][1]-a[2][1])*(a[0][0]-a[2][0])+(a[2][0]-a[1][0])*(a[0][1]-a[2][1]);
        if(Math.abs(det)<1e-12)continue;
        frontTriangles.push({a,n:ids.map(j=>[n.getX(j),n.getY(j),n.getZ(j)]),det,minX:Math.min(...a.map(p=>p[0])),maxX:Math.max(...a.map(p=>p[0])),minY:Math.min(...a.map(p=>p[1])),maxY:Math.max(...a.map(p=>p[1]))});
      }
    }
    const projectedFrontPatches=(material,patches)=>{
      const positions=[],normals=[],uvs=[],indices=[];
      for(const {outline,offset=.010} of patches){
      const minX=Math.min(...outline.map(p=>p[0])),maxX=Math.max(...outline.map(p=>p[0])),minY=Math.min(...outline.map(p=>p[1])),maxY=Math.max(...outline.map(p=>p[1]));
      for(const triangle of frontTriangles){
        if(triangle.maxX<minX||triangle.minX>maxX||triangle.maxY<minY||triangle.minY>maxY)continue;
        const {a,n,det}=triangle,sign=Math.sign(det);let clipped=outline.map(p=>[p[0],p[1]]);
        for(let edge=0;edge<3&&clipped.length;edge++){
          const first=a[edge],last=a[(edge+1)%3],distance=p=>sign*((last[0]-first[0])*(p[1]-first[1])-(last[1]-first[1])*(p[0]-first[0]));
          const next=[];
          for(let i=0;i<clipped.length;i++){
            const previous=clipped[(i+clipped.length-1)%clipped.length],current=clipped[i],dp=distance(previous),dc=distance(current),pin=dp>=-1e-10,cin=dc>=-1e-10;
            if(pin!==cin){const t=dp/(dp-dc);next.push([THREE.MathUtils.lerp(previous[0],current[0],t),THREE.MathUtils.lerp(previous[1],current[1],t)]);}
            if(cin)next.push(current);
          }
          clipped=next;
        }
        clipped=clipped.filter((p,i)=>{const q=clipped[(i+clipped.length-1)%clipped.length];return Math.hypot(p[0]-q[0],p[1]-q[1])>1e-9;});
        if(clipped.length<3)continue;
        let area=0;for(let i=0;i<clipped.length;i++){const p=clipped[i],q=clipped[(i+1)%clipped.length];area+=p[0]*q[1]-q[0]*p[1];}
        if(Math.abs(area)<1e-12)continue;if(area<0)clipped.reverse();
        const base=positions.length/3;
        for(const [x,y] of clipped){
          const wa=((a[1][1]-a[2][1])*(x-a[2][0])+(a[2][0]-a[1][0])*(y-a[2][1]))/det;
          const wb=((a[2][1]-a[0][1])*(x-a[2][0])+(a[0][0]-a[2][0])*(y-a[2][1]))/det,wc=1-wa-wb;
          const variable=typeof offset==='function',depth=variable?offset(x,y):offset;
          positions.push(x,y,wa*a[0][2]+wb*a[1][2]+wc*a[2][2]+depth);
          const normal=v3(wa*n[0][0]+wb*n[1][0]+wc*n[2][0],wa*n[0][1]+wb*n[1][1]+wc*n[2][1],wa*n[0][2]+wb*n[1][2]+wc*n[2][2]).normalize();
          if(normal.z<0)normal.negate();
          if(variable){
            const h=.00005,dx=(offset(x+h,y)-offset(x-h,y))/(2*h),dy=(offset(x,y+h)-offset(x,y-h))/(2*h);
            normal.set(normal.x-normal.z*dx,normal.y-normal.z*dy,normal.z).normalize();
          }
          normals.push(normal.x,normal.y,normal.z);uvs.push(x,y);
        }
        for(let i=1;i<clipped.length-1;i++)indices.push(base,base+i,base+i+1);
      }
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);
      const patch=finish(new THREE.Mesh(geo,material),g);patch.name='sprinter-surface-matched-front-insert';return patch;
    };
    const vanLamp={...pointProjector,patch(material,outline,offset=.010){return projectedFrontPatches(material,[{outline,offset}]);}};
    // A rolled reveal also crosses the cap/bonnet fold. Merely projecting
    // its grid vertices creates chord triangles that cut through that fold.
    // Clip each strip to the original sheet, then apply the same continuous
    // depth field and its normal gradient to every shared boundary vertex.
    const frontBand=(material,outline,center,outerScale,innerScale,rows,depth)=>{
      const patches=[];
      for(let i=0;i<outline.length;i++){
        const a=v3(...outline[i]).sub(center),b=v3(...outline[(i+1)%outline.length]).sub(center),nx=b.y-a.y,ny=a.x-b.x,denominator=nx*a.x+ny*a.y;
        if(Math.abs(denominator)<1e-9)continue;
        const offset=(x,y)=>depth((outerScale-(nx*(x-center.x)+ny*(y-center.y))/denominator)/(outerScale-innerScale));
        for(let row=0;row<rows;row++){
          const s0=THREE.MathUtils.lerp(outerScale,innerScale,row/rows),s1=THREE.MathUtils.lerp(outerScale,innerScale,(row+1)/rows);
          patches.push({outline:[a.clone().multiplyScalar(s0).add(center).toArray(),b.clone().multiplyScalar(s0).add(center).toArray(),b.clone().multiplyScalar(s1).add(center).toArray(),a.clone().multiplyScalar(s1).add(center).toArray()],offset});
        }
      }
      return projectedFrontPatches(material,patches);
    };
    const frontPerforated=(material,outline,holes,offset)=>{
      const shape=new THREE.Shape();outline.forEach(([x,y],i)=>shape[i?'lineTo':'moveTo'](x,y));shape.closePath();
      for(const outline of holes){const hole=new THREE.Path();outline.forEach(([x,y],i)=>hole[i?'lineTo':'moveTo'](x,y));hole.closePath();shape.holes.push(hole);}
      const geo=new THREE.ShapeGeometry(shape,8),p=geo.attributes.position,index=geo.index,patches=[];
      for(let i=0;i<index.count;i+=3)patches.push({outline:[0,1,2].map(k=>{const j=index.getX(i+k);return [p.getX(j),p.getY(j),nose];}),offset});
      geo.dispose();return projectedFrontPatches(material,patches);
    };
    // Cut the grille and lamp openings from the actual source triangles. The
    // previous black/chrome patches sat in front of a complete painted cap,
    // so the optics and grille could never have a recessed inner volume.
    // Convex clipping retains the body's existing normals and UV boundaries.
    const clipHalfPlane=(vertices,a,b,sign,inside=true)=>{
      const distance=vertex=>sign*((b[0]-a[0])*(vertex.p[1]-a[1])-(b[1]-a[1])*(vertex.p[0]-a[0]))*(inside?1:-1),out=[];
      for(let i=0;i<vertices.length;i++){
        const first=vertices[(i+vertices.length-1)%vertices.length],last=vertices[i],da=distance(first),db=distance(last),ain=da>=-1e-10,bin=db>=-1e-10;
        if(ain!==bin){const t=da/(da-db);out.push({p:first.p.map((x,k)=>THREE.MathUtils.lerp(x,last.p[k],t)),n:first.n.map((x,k)=>THREE.MathUtils.lerp(x,last.n[k],t)),uv:first.uv.map((x,k)=>THREE.MathUtils.lerp(x,last.uv[k],t))});}
        if(bin)out.push(last);
      }
      return out;
    };
    const apertures=[grilleOutline,...lampOutlines].map(outline=>{
      let area=0;for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length];area+=a[0]*b[1]-b[0]*a[1];}
      return {outline,sign:Math.sign(area),minX:Math.min(...outline.map(p=>p[0])),maxX:Math.max(...outline.map(p=>p[0])),minY:Math.min(...outline.map(p=>p[1])),maxY:Math.max(...outline.map(p=>p[1]))};
    });
    for(const mesh of vanSkin){
      const old=mesh.geometry,p=old.attributes.position,n=old.attributes.normal,uv=old.attributes.uv,index=old.index,positions=[],normals=[],uvs=[],indices=[];let changed=false;
      for(let i=0;i<(index?.count||p.count);i+=3){
        const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),triangle=ids.map(k=>({p:[p.getX(k),p.getY(k),p.getZ(k)],n:[n.getX(k),n.getY(k),n.getZ(k)],uv:uv?[uv.getX(k),uv.getY(k)]:[0,0]}));
        let pieces=[triangle];
        if(Math.min(...triangle.map(v=>v.p[2]))>2.150){
          for(const aperture of apertures){
            const next=[];
            for(const piece of pieces){
              if(Math.max(...piece.map(v=>v.p[0]))<aperture.minX||Math.min(...piece.map(v=>v.p[0]))>aperture.maxX||Math.max(...piece.map(v=>v.p[1]))<aperture.minY||Math.min(...piece.map(v=>v.p[1]))>aperture.maxY){next.push(piece);continue;}
              let remainder=piece;
              for(let e=0;e<aperture.outline.length&&remainder.length;e++){
                const a=aperture.outline[e],b=aperture.outline[(e+1)%aperture.outline.length],outside=clipHalfPlane(remainder,a,b,aperture.sign,false);
                if(outside.length>=3)next.push(outside);
                remainder=clipHalfPlane(remainder,a,b,aperture.sign,true);
              }
              if(remainder.length>=3)changed=true;
            }
            pieces=next;
          }
        }
        for(const piece of pieces){
          const base=positions.length/3;
          for(const vertex of piece){positions.push(...vertex.p);const normal=v3(...vertex.n).normalize();normals.push(normal.x,normal.y,normal.z);uvs.push(...vertex.uv);}
          for(let k=1;k<piece.length-1;k++)indices.push(base,base+k,base+k+1);
        }
      }
      if(changed){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);old.dispose();mesh.geometry=geo;mesh.name='sprinter-fascia-shell-with-openings';}
    }
    const bonnetPoint=(x,z,offset=.002)=>{
      const width=interpolate(bodyStations,z,1)-.055;
      return [x,interpolate(bodyStations,z,2)+.024*(1-(x/width)**2)+bonnetLift(x,z)+offset,z];
    };
    const lowerSideSection=y=>half-Math.max(0,y-1.32)*.065+Math.sin(clamp((y-1.32)/1.087,0,1)*Math.PI)*.012;
    const shoulderJoin=2.20,joinSlope=-.065+Math.cos((shoulderJoin-1.32)/1.087*Math.PI)*.012*Math.PI/1.087;
    const circleRadius=(2.435-shoulderJoin)/(1+joinSlope/Math.sqrt(1+joinSlope*joinSlope));
    const roofShoulder={radius:circleRadius,y:shoulderJoin+joinSlope*circleRadius/Math.sqrt(1+joinSlope*joinSlope),x:lowerSideSection(shoulderJoin)-circleRadius/Math.sqrt(1+joinSlope*joinSlope)};
    const sideX = (side, y, extra = 0, z = 0) => {
      const c=roofShoulder;
      const x=y>=shoulderJoin?c.x+Math.sqrt(Math.max(.000001,c.radius*c.radius-(y-c.y)**2)):lowerSideSection(y);
      // The cab narrows toward its short bonnet; the cargo box has parallel
      // long walls. Width blending ends before the shared roof section.
      const cabWidth=(interpolate(bodyStations,z,1)-half)*(1-THREE.MathUtils.smoothstep(y,1.40,2.17));
      const cabPillar=.009*Math.exp(-(((z-.492)/.152)**2))*THREE.MathUtils.smoothstep(y,1.29,1.52)*(1-THREE.MathUtils.smoothstep(y,2.14,2.35));
      return side*(x+cabWidth+cabPillar+extra);
    };
    const roofHalf = sideX(1, 2.407), roofRear = -2.92, roofFront = 1.327;
    const roofSectionY = x => {
      const a = Math.abs(x), c = roofShoulder;
      return a > c.x ? c.y + Math.sqrt(Math.max(0,c.radius*c.radius-(a-c.x)**2)) : c.y+c.radius+.005*(1-(a/c.x)**2)**2;
    };
    const outer = [[tail,interpolate(bodyStations,tail,2)-.055],[tail,2.273]];
    for(let i=23;i>=0;i--){const t=i/24*Math.PI/2;outer.push([roofRear-(roofRear-tail)*Math.sin(t),2.407-.134*(1-Math.cos(t))]);}
    outer.push([roofFront,2.407]);
    for(let i=1;i<=24;i++){
      const t=i/24,a=1-t;
      outer.push([a*a*a*roofFront+3*a*a*t*1.43+3*a*t*t*1.596+t*t*t*1.626,a*a*a*2.407+3*a*a*t*2.407+3*a*t*t*2.344+t*t*t*2.298]);
    }
    outer.push([2.180,1.394]);
    for(let i=0;i<=72;i++){const z=THREE.MathUtils.lerp(2.180,tail,i/72);outer.push([z,interpolate(bodyStations,z,2)-.055]);}
    const windowOutlines = [
      [[2.052,1.425],[.603,1.449],[.578,2.229],[1.480,2.249]],
      [[0.352, 1.384], [-0.961, 1.384], [-0.961, 2.213], [0.352, 2.213]],
    ];
    const windowRadii=[.142,.092];
    const cargoOutline = roundedOutline([[0,1.432,-1.178],[0,1.432,-2.782],[0,2.257,-2.782],[0,2.257,-1.178]],.095,10);
    const paintSide=(side,y,z,extra=0)=>{
      const top=interpolate(bodyStations,z,2)-.055;
      if(y>=top)return sideX(side,y,extra,z);
      const q=clamp((y-.442)/(top-.442),0,1),width=interpolate(bodyStations,z,1);
      return side*(width-.018*(1-q)+.015*Math.sin(q*Math.PI)+extra);
    };
    const sideSeam=(side,zy,width=.0036)=>{
      const rounded=roundedOutline(zy.map(([z,y])=>[0,y,z]),.047,8),points=[];
      for(let i=0;i<rounded.length;i++){
        const a=v3(...rounded[i]),b=v3(...rounded[(i+1)%rounded.length]),count=Math.max(1,Math.ceil(a.distanceTo(b)/.027));
        for(let j=0;j<count;j++)points.push(a.clone().lerp(b,j/count));
      }
      points.push(points[0].clone());
      surface(g,m.dark,points.length-1,1,(u,v)=>{
        const i=Math.round(u*(points.length-1)),p=points[i],prev=points[(i+points.length-2)%(points.length-1)],next=points[(i+1)%(points.length-1)];
        const tangent=next.clone().sub(prev).normalize(),d=(v-.5)*width,y=p.y+tangent.z*d,z=p.z-tangent.y*d;
        return [paintSide(side,y,z,.0016),y,z];
      },side<0);
    };
    // Thin stamped side panels with actual window apertures and a taper toward the roof.
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape(); outer.forEach(([z,y],i) => i ? shape.lineTo(-z,y) : shape.moveTo(-z,y)); shape.closePath();
      for (const [index,outline] of windowOutlines.entries()) {
        const h = new THREE.Path();
        roundedOutline(outline.map(([z, y]) => [0, y, z]), windowRadii[index]).forEach(([, y, z], i) => i ? h.lineTo(-z, y) : h.moveTo(-z, y));
        h.closePath(); shape.holes.push(h);
      }
      const cargoHole = new THREE.Path(); cargoOutline.forEach(([,y,z],i) => i ? cargoHole.lineTo(-z,y) : cargoHole.moveTo(-z,y)); cargoHole.closePath(); shape.holes.push(cargoHole);
      const geo = sheetGeometry(shape, side, sideX);
      const shell = finish(new THREE.Mesh(geo, m.paint), g); shell.material.side = THREE.DoubleSide;
      // Cargo/cab sheet returns are upholstered inside, including around the
      // original window apertures. No blue exterior paint faces into the cab.
      const liner=geo.clone(),lp=liner.attributes.position;
      for(let i=0;i<lp.count;i++)lp.setX(i,lp.getX(i)-side*.014);
      finish(new THREE.Mesh(liner,m.interior),g).name='sprinter-inner-side-liner';
      stampedRecess(g, m.paint, side, cargoOutline, sideX);
      for (const [index,outline] of windowOutlines.entries()) windowPanel(g,index?{...m,glass:m.privacyGlass||m.glass}:m,outline.map(([z,y])=>[sideX(side,y,0.003,z),y,z]),0.033,windowRadii[index],{bow:index?.007:.011});
      // Narrow, surface-following shut lines. Only the configured passenger
      // side has a sliding-door cut; the driver-side crew glazing is fixed.
      sideSeam(side,[[.468,.537],[.468,2.298],[1.425,2.331],[1.591,2.199],[2.136,1.414],[2.105,1.259],[1.560,1.124],[1.422,.557]]);
      if(side<0)sideSeam(side,[[.431,.537],[-1.088,.537],[-1.088,2.305],[.431,2.305]]);
      // Separate protective moldings belong to the fender, front door, slider
      // and rear quarter. Their surface follows the stamped sheet, with
      // relieved lower edges over each wheel opening rather than one long box.
      for(const [start,end] of [[tail+.094,-1.108],[-1.081,.429],[.486,1.386],[1.415,2.626]]){
        const lower=z=>Math.max(.747,...[f,r].map(az=>Math.abs(z-az)<.439?.393+Math.sqrt(Math.max(0,.439**2-(z-az)**2)):.747));
        surface(g,m.black,Math.max(12,Math.ceil((end-start)/.039)),8,(u,v)=>{
          const z=THREE.MathUtils.lerp(start,end,u),lo=lower(z),y=THREE.MathUtils.lerp(lo,.905,v);
          const endFade=THREE.MathUtils.smoothstep(z,start,start+.021)*(1-THREE.MathUtils.smoothstep(z,end-.021,end));
          return [paintSide(side,y,z,.003+endFade*(.007+.012*Math.pow(Math.sin(v*Math.PI),.65))),y,z];
        },side>0).name='sprinter-segmented-side-molding';
      }
      if(side>0)sideSeam(side,[[.462,.910],[.267,.910],[.267,1.174],[.336,1.231],[.462,1.230]],.0032);
      const handleX=paintSide(side,1.179,.711,.023);
      const pocket=[];for(let i=0;i<32;i++){const a=i*Math.PI/16,y=1.178+Math.sin(a)*.039,z=.711+Math.cos(a)*.126;pocket.push([paintSide(side,y,z,.002),y,z]);}
      polygon(g,m.dark,pocket);
      roundedBox(g,m.black,handleX,1.179,.711,.033,.029,.202,.009);
      for(const z of [.633,.790])roundedBox(g,m.black,paintSide(side,1.176,z,.009),1.176,z,.027,.046,.030,.005);
      if (side < 0) { // Passenger-side slider on the configured US Crew van.
        roundedBox(g,m.black,-half-0.035,1.173,0.150,0.035,0.039,0.221,0.008);
        roundedBox(g,m.black,-half-0.037,1.303,-1.778,0.033,0.023,1.39,0.007);
        roundedBox(g,m.chrome,-half-0.054,1.305,-1.771,0.006,0.008,1.22,0.002);
        roundedBox(g,m.black,-0.927,0.447,-0.178,0.181,0.073,1.04,0.009);
      }
      for (const az of [f,r]) {
        // The W906 has a broad stamped arch shoulder, not a round pipe around
        // its tires. Roll its edge outward and feather it into the side skin.
        surface(g,m.paint,100,14,(u,v)=>{
          const a=Math.PI*u, rr=.429+v*.092, arc=Math.sin(a);
          const edge=.018*(1-v)+.017*Math.sin(v*Math.PI), endFade=.36+.64*Math.sqrt(Math.max(0,arc));
          return [side*(half+edge*endFade),.393+arc*rr,az+Math.cos(a)*rr];
        },side>0);
        const pts=[]; for(let i=0;i<=46;i++){const a=Math.PI-i*Math.PI/46;pts.push([side*(half+.018),.393+Math.sin(a)*.430,az+Math.cos(a)*.430]);}
        curvedLine(g,m.paint,pts,.005);
        surface(g,m.black,28,3,(u,v)=>{const a=Math.PI*u;return [side*(0.793+v*0.18),0.393+Math.sin(a)*0.419,az+Math.cos(a)*0.419];});
        const inner=[];for(let i=0;i<=30;i++){const a=Math.PI-i*Math.PI/30;inner.push([side*.775,.393+Math.sin(a)*.419,az+Math.cos(a)*.419]);}
        polygon(g,m.black,inner);
        roundedBox(g,m.black,side*0.903,0.408,az-0.414,0.246,0.248,0.029,0.006);
      }
      roundedBox(g,m.amber,side*(half+0.046),0.842,0.417,0.012,0.064,0.071,0.006);
      roundedBox(g,m.amber,side*(half+0.046),0.842,-2.752,0.012,0.046,0.073,0.005);
      // Short-arm standard mirrors, split main/convex glass, mounted to the cab.
      // Period W906 manufacturer dimensions: 2426mm including standard mirrors.
      const mirrorX=2.426/2-.207/2;
      line(g,m.black,[sideX(side,1.37,0,1.994),1.37,1.994],[side*(mirrorX-.024),1.469,1.884],0.032);
      // Rounded moulded mirror backs close into a broad convex cover. Their
      // standard short-arm outer envelope remains exactly 2.426 m.
      const mirrorOutline=roundedOutline([[-.1035,-.1985,0],[.1035,-.1985,0],[.1035,.1985,0],[-.1035,.1985,0]],.047,10);
      const mirrorLoop=[...mirrorOutline,mirrorOutline[0]];
      surface(g,m.black,mirrorLoop.length-1,18,(u,v)=>{
        const p=mirrorLoop[Math.round(u*(mirrorLoop.length-1))],a=v*Math.PI/2,scale=Math.cos(a);
        return [side*(mirrorX+p[0]*scale),1.529+p[1]*scale,1.706+.214*Math.sin(a)];
      },side<0);
      polygon(g,m.black,mirrorOutline.map(([x,y])=>[side*(mirrorX+x),1.529+y,1.705]).reverse());
      for(const [centerY,height,bow] of [[1.596,.236,.002],[1.398,.108,.005]]){
        const outline=roundedOutline([[-.082,-height/2,0],[.082,-height/2,0],[.082,height/2,0],[-.082,height/2,0]],.020,9),loop=[...outline,outline[0]];
        surface(g,m.chrome,loop.length-1,12,(u,v)=>{
          const q=loop[Math.round(u*(loop.length-1))];
          return [side*(mirrorX+.001+q[0]*v),centerY+q[1]*v,1.700-bow*(1-v*v)];
        },side<0);
      }
      const repeaterPoint=(u,v,offset=0)=>{
        const x=THREE.MathUtils.lerp(-.064,.067,u),y=.013+(v-.5)*.021,r=Math.max(Math.abs(x)/.1035,Math.abs(y)/.1985);
        return [side*(mirrorX+x),1.529+y,1.7072+.214*Math.sqrt(Math.max(0,1-r*r))+offset];
      };
      surface(g,m.grille,28,3,(u,v)=>repeaterPoint(u,v),side<0);
      surface(g,m.amber,8,4,(u,v)=>repeaterPoint(.68+(u-.5)*.080,.5+(v-.5)*.56,.001),side<0);
      surface(g,m.lens,28,5,(u,v)=>repeaterPoint(u,v,.0023+.0003*Math.cos(u*Math.PI*26)),side<0);
    }
    // Rib height belongs to the roof sheet, and fades out well before the
    // curved end caps. The side and roof share an actual circular section.
    const ribs=[-.58,-.30,0,.30,.58], roofXs=[-roofHalf,roofHalf];
    for(let i=0;i<=44;i++)roofXs.push(THREE.MathUtils.lerp(-roofHalf,roofHalf,i/44));
    for(const x of ribs)for(const dx of [-.039,-.025,-.014,0,.014,.025,.039])roofXs.push(x+dx);
    roofXs.sort((a,b)=>a-b);const roofSamples=[...new Set(roofXs)];
    const roofHeight=(x,z)=>{
      const fade=THREE.MathUtils.smoothstep(z,-2.79,-2.65)*(1-THREE.MathUtils.smoothstep(z,1.03,1.18));
      return roofSectionY(x)+ribs.reduce((sum,c)=>sum+.0045*Math.exp(-Math.pow((x-c)/.023,2)),0)*fade;
    };
    const roof=surface(g,m.paint,roofSamples.length-1,70,(u,v)=>{
      const x=roofSamples[Math.round(u*(roofSamples.length-1))],z=THREE.MathUtils.lerp(roofRear,roofFront,v);
      return [x,roofHeight(x,z),z];
    },true);
    const rp=roof.geometry.attributes.position,rn=roof.geometry.attributes.normal;
    for(let i=0;i<rp.count;i++){
      const x=rp.getX(i),z=rp.getZ(i),h=.0001;
      const normal=v3(-(roofHeight(x+h,z)-roofHeight(x-h,z))/(2*h),1,-(roofHeight(x,z+h)-roofHeight(x,z-h))/(2*h)).normalize();rn.setXYZ(i,normal.x,normal.y,normal.z);
    }
    // Turn the same roof section down into the nearly flat rear-door header.
    surface(g,m.paint,56,24,(u,v)=>{
      const t=v*Math.PI/2,q=1-Math.cos(t),sy=2.407-.134*q,hw=sideX(1,sy),x=(u*2-1)*hw;
      const endX=(u*2-1)*sideX(1,2.273),a=Math.abs(endX),rearCorner=sideX(1,2.273)-.121,rearY=a>rearCorner?2.273+Math.sqrt(Math.max(0,.121**2-(a-rearCorner)**2)):2.394;
      return [x,THREE.MathUtils.lerp(roofSectionY((u*2-1)*roofHalf),rearY,q),roofRear-(roofRear-tail)*Math.sin(t)];
    });
    // A curved forehead blends the roof tangentially into the steep glass.
    surface(g,m.paint,48,24,(u,t)=>{
      const v=u*2-1,a=1-t,startY=roofSectionY(v*roofHalf),endY=2.298+.024*(1-v*v);
      const edgeY=a*a*a*2.407+3*a*a*t*2.407+3*a*t*t*2.344+t*t*t*2.298;
      const z=a*a*a*roofFront+3*a*a*t*1.43+3*a*t*t*1.596+t*t*t*1.626;
      const y=a*a*a*startY+3*a*a*t*startY+3*a*t*t*(endY+.046)+t*t*t*endY;
      return [v*sideX(1,edgeY,0,z),y,z];
    },true);
    windowPanel(g,{...m,glass:m.windscreen||m.glass},[[-0.893,1.450,2.175],[0.893,1.450,2.175],[0.861,2.298,1.629],[-0.861,2.298,1.629]],0.028,.065,{bow:.032});
    for(const side of [-1,1]) {
      // The A-pillar bridges the windscreen and door aperture with a broad
      // rolled face; a painted round tube cannot form the factory sheet metal.
      surface(g,m.paint,30,8,(u,v)=>{
        const front=v3(side*.899,1.448,2.184).lerp(v3(side*.867,2.301,1.635),u);
        const flank=v3(sideX(side,1.410,0,2.052),1.410,2.052).lerp(v3(sideX(side,2.232,0,1.534),2.232,1.534),u);
        const p=front.lerp(flank,v);p.x+=side*.014*Math.sin(v*Math.PI)*Math.sin(u*Math.PI);return p.toArray();
      },side<0);
      // The bonnet shut line follows the actual crowned skin. A narrow flat
      // gap is much cleaner than a floating, partly buried Catmull-Rom tube.
      surface(g,m.dark,64,1,(u,v)=>{
        const t=THREE.MathUtils.smoothstep(u,0,1),z=THREE.MathUtils.lerp(2.187,2.787,u),x=side*(.821-.225*t)+(v-.5)*.0033;
        return bonnetPoint(x,z,.0014);
      },true);
      // Long, shallow intake grilles sit almost flush with the bonnet at the
      // cowl. Their stamped recess and fine blades follow its changing slope.
      const ventOutline=roundedOutline([[side*.275,0,2.221],[side*.739,0,2.221],[side*.718,0,2.303],[side*.294,0,2.303]],.025,8);
      let ventGeo=new THREE.ShapeGeometry(new THREE.Shape(ventOutline.map(([x,,z])=>new THREE.Vector2(x,z))),8);
      ventGeo=subdivideBendRegions(ventGeo,-Infinity,.021);
      const vp=ventGeo.attributes.position;
      for(let i=0;i<vp.count;i++){const q=bonnetPoint(vp.getX(i),vp.getY(i),.0016);vp.setXYZ(i,...q);}
      ventGeo.computeVertexNormals();finish(new THREE.Mesh(ventGeo,m.black),g);
      for(let i=0;i<4;i++)surface(g,m.grille,24,1,(u,v)=>{
        const x=side*THREE.MathUtils.lerp(.305,.709,u),z=2.234+i*.017+(v-.5)*.0034;
        return bonnetPoint(x,z,.0041);
      },true);
    }
    // Folded cowl rail and two parked arms with separate sprung blades.
    surface(g,m.black,48,5,(u,v)=>{
      const x=(u*2-1)*.886,z=THREE.MathUtils.lerp(2.170,2.211,v);
      return bonnetPoint(x,z,.004+.004*Math.sin(v*Math.PI));
    },true);
    const glassY=z=>1.450+(2.175-z)*(2.298-1.450)/(2.175-1.629);
    for(const [pivotX,endX] of [[-.710,-.220],[.095,.695]]){
      const pivotZ=2.155,pivotY=glassY(pivotZ)+.006;
      cylinder(g,m.black,pivotX,pivotY,pivotZ,.019,.017,'z',16);
      const bendX=THREE.MathUtils.lerp(pivotX,endX,.42),bendZ=2.132,endZ=2.121;
      line(g,m.black,[pivotX,pivotY,pivotZ],[bendX,glassY(bendZ)+.007,bendZ],.0065);
      line(g,m.black,[bendX,glassY(bendZ)+.007,bendZ],[endX,glassY(endZ)+.006,endZ],.0055);
      const bladeCenter=(pivotX+endX)/2+.035,bladeZ=2.116;
      surface(g,m.black,28,2,(u,v)=>{
        const x=bladeCenter+(u-.5)*.584,z=bladeZ+(v-.5)*.010;
        return [x,glassY(z)+.004+.003*Math.sin(u*Math.PI),z];
      });
    }
    line(g,m.black,[0.048,2.439,1.258],[0.051,2.671,1.118],0.009);
    // Standard W906 facelift fascia: a shallow U-shaped grille sits inside
    // a rolled painted surround. Actual perforations and set-back radiator
    // faces replace the old uninterrupted black plate and flat chrome strips.
    const grilleCenter=v3(0,1.037,nose);
    frontBand(m.paint,grilleOutline,grilleCenter,1.055,1,9,v=>.002+.006*Math.sin(v*Math.PI)-.024*v*v);
    const grilleInner=grilleOutline.map(p=>grilleCenter.clone().lerp(v3(...p),.935).toArray());
    frontBand(m.black,grilleOutline,grilleCenter,1,.935,4,v=>-.021-v*.036);
    vanLamp.patch(m.black,grilleInner,-.100);
    const meshHoles=[];
    for(let row=0;row<7;row++)for(let column=-15;column<=15;column++){
      const y=.911+row*.035,x=column*.032+(row%2)*.016,halfWidth=.462+(y-.92)*.28;
      if(Math.abs(x)+.014>halfWidth||Math.hypot(x,y-1.034)<.132)continue;
      meshHoles.push(Array.from({length:6},(_,i)=>{const a=i*Math.PI/3;return [x+Math.cos(a)*.014,y+Math.sin(a)*.013];}));
    }
    frontPerforated(m.black,grilleInner,meshHoles,-.054).name='sprinter-open-radiator-mesh';
    for(const [y,width] of [[.925,.894],[1.021,.967],[1.117,1.034]])for(const side of [-1,1]){
      const outer=side*width/2,inner=side*.114;
      const blade=[[inner,y-.011,nose],[outer,y-.016,nose],[outer,y+.010,nose],[inner,y+.014,nose]];
      vanLamp.patch(m.grille,blade,-.005);
      vanLamp.patch(m.black,[[inner,y-.018,nose],[outer,y-.024,nose],[outer,y-.016,nose],[inner,y-.011,nose]],-.008);
      vanLamp.patch(m.grille,[[inner,y+.014,nose],[outer,y+.010,nose],[outer,y+.014,nose],[inner,y+.018,nose]],.001);
    }
    const emblem=new THREE.Group();emblem.position.set(0,1.031,nose+.038);emblem.rotation.x=-.20;g.add(emblem);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.131,.0085,10,52),m.chrome);emblem.add(ring);
    cylinder(emblem,m.black,0,0,-.010,.121,.014,'z',40);
    const star=new THREE.Shape();
    for(let i=0;i<6;i++){const a=i*Math.PI/3,rr=i%2?.023:.124;star[i?'lineTo':'moveTo'](Math.sin(a)*rr,Math.cos(a)*rr);}star.closePath();
    finish(new THREE.Mesh(new THREE.ExtrudeGeometry(star,{depth:.010,bevelEnabled:true,bevelSize:.0018,bevelThickness:.0018,bevelSegments:2,steps:1}),m.chrome),emblem,0,0,-.002);

    for(const [index,side] of [-1,1].entries()) {
      const lamp=lampOutlines[index],center=v3(side*.765,1.080,nose);
      const lensOutline=lamp.map(p=>center.clone().lerp(v3(...p),.965).toArray());
      frontBand(m.black,lamp,center,1,.965,5,v=>.002-.022*v);
      vanLamp.patch(m.black,lensOutline,-.072);
      // The stock halogen face has one large, asymmetric free-form reflector
      // outboard and a small lower inboard daytime-running-light cavity. Two
      // similar round pods, or a xenon projector, do not match this lamp.
      const main=roundedOutline([[side*.699,.955,nose],[side*.829,.955,nose],[side*.872,.998,nose],[side*.873,1.077,nose],[side*.835,1.117,nose],[side*.756,1.113,nose],[side*.700,1.060,nose]],.020,8);
      const daytime=roundedOutline([[side*.599,.945,nose],[side*.676,.948,nose],[side*.692,.990,nose],[side*.661,1.014,nose],[side*.617,1.000,nose]],.012,7);
      frontPerforated(m.grille,lensOutline,[main,daytime],-.023);
      const splitReflector=(points,upper)=>{
        const result=[],cut=1.034;
        for(let i=0;i<points.length;i++){
          const a=points[(i+points.length-1)%points.length],b=points[i],ain=upper?a[1]>=cut:a[1]<=cut,bin=upper?b[1]>=cut:b[1]<=cut;
          if(ain!==bin){const t=(cut-a[1])/(b[1]-a[1]);result.push(a.map((x,k)=>THREE.MathUtils.lerp(x,b[k],t)));}
          if(bin)result.push(b);
        }
        return result;
      };
      // Two H7 functions share the larger reflector envelope, with a narrow
      // horizontal divider; the third lower inboard cavity is the W21W DRL.
      // This arrangement follows the 2016 operator manual's numbered photo.
      const reflectorCells=[[splitReflector(main,true),side*.794,1.078,.044,.008],[splitReflector(main,false),side*.794,.989,.039,.007],[daytime,side*.651,.974,.031,.005]];
      for(const [outline,cx,cy,depth,core] of reflectorCells){
        const reflectLoop=[...outline,outline[0]],c=v3(cx,cy,nose);
        surface(g,m.headlampReflector,reflectLoop.length-1,9,(u,v)=>{
          const p=c.clone().lerp(v3(...reflectLoop[Math.round(u*(reflectLoop.length-1))]),.085+v*.915);
          const facet=.0011*Math.sin(u*Math.PI*32)*Math.sin(v*Math.PI);
          return vanLamp.point(p.toArray(),-.021-depth*(1-v*v)+facet);
        });
        const shield=Array.from({length:24},(_,i)=>[cx+Math.cos(i*Math.PI/12)*core*1.65,cy+Math.sin(i*Math.PI/12)*core*1.30,nose]);
        const bulb=Array.from({length:24},(_,i)=>[cx+Math.cos(i*Math.PI/12)*core,cy+Math.sin(i*Math.PI/12)*core*.76,nose]);
        vanLamp.patch(m.dark,shield,-.031);vanLamp.patch(m.headlampCore,bulb,-.027);
      }
      vanLamp.patch(m.satinMetal||m.chrome,[[side*.709,1.030,nose],[side*.872,1.030,nose],[side*.872,1.036,nose],[side*.709,1.036,nose]],-.018);
      // A broad prismatic upper signal chamber and the outer amber reflector
      // are different pieces. The old narrow amber sticker was on the wrong
      // part of the lamp, while the clear chamber had almost no tooling.
      const signal=roundedOutline([[side*.622,1.120,nose],[side*.718,1.153,nose],[side*.891,1.185,nose],[side*.925,1.220,nose],[side*.637,1.166,nose]],.011,6);
      vanLamp.patch(m.chrome,signal,-.014);
      const signalBulb=Array.from({length:24},(_,i)=>[side*.857+Math.cos(i*Math.PI/12)*.0105,1.185+Math.sin(i*Math.PI/12)*.010,nose]);
      vanLamp.patch(m.amber,signalBulb,-.007);
      vanLamp.patch(m.amber,[[side*.888,1.021,nose],[side*.919,1.086,nose],[side*.935,1.187,nose],[side*.919,1.170,nose]],-.010);
      for(let i=0;i<24;i++){
        const x=THREE.MathUtils.lerp(.648,.905,i/23),y=1.136+(x-.648)*.187;
        vanLamp.patch(m.lens,[[side*x,y,nose],[side*(x+.002),y-.001,nose],[side*(x+.018),y+.030,nose],[side*(x+.016),y+.031,nose]],-.002);
      }
      vanLamp.patch(m.lens,lensOutline,.006);
    }

    // The molded bumper wraps the lower corners and has real lower apertures.
    // Its fog-lamp locations retain stock blanking covers in this base model;
    // optional fog lamps and xenon optics are not assumed to be installed.
    const bumperOutline=roundedOutline([[-.995,.452,0],[-.967,.420,0],[-.550,.408,0],[0,.421,0],[.550,.408,0],[.967,.420,0],[.995,.452,0],[.981,.834,0],[.926,.897,0],[.60,.900,0],[.36,.865,0],[0,.856,0],[-.36,.865,0],[-.60,.900,0],[-.926,.897,0],[-.981,.834,0]],.029,6).map(([x,y])=>[x,y]);
    const lowerAir=roundedOutline([[-.447,.649,0],[.447,.649,0],[.362,.773,0],[-.362,.773,0]],.032,8).map(([x,y])=>[x,y]);
    const fogBlanks=[-1,1].map(side=>roundedOutline([[side*.585,.581,0],[side*.867,.588,0],[side*.909,.741,0],[side*.684,.752,0]],.032,8).map(([x,y])=>[x,y]));
    const bumperPoint=(x,y)=>{
      const a=Math.min(1,Math.abs(x)/1.005),v=clamp((y-.413)/.486,0,1);
      return [x,y,nose+.156-.173*a*a*a+.023*Math.sin(v*Math.PI)-.044*(1-v)**3];
    };
    perforatedFace(g,m.black,bumperOutline,[lowerAir,...fogBlanks],bumperPoint,.075).name='sprinter-molded-bumper-apertures';
    const bumperLoop=[...bumperOutline,bumperOutline[0]];
    surface(g,m.black,bumperLoop.length-1,10,(u,v)=>{
      const [x,y]=bumperLoop[Math.round(u*(bumperLoop.length-1))],p=bumperPoint(x,y);
      const q=THREE.MathUtils.smoothstep(v,0,1);return [x*(1-.008*Math.sin(v*Math.PI)),y+(y-.655)*.025*Math.sin(v*Math.PI),THREE.MathUtils.lerp(p[2],nose-.235,q)];
    });
    recessedOpening(g,m.grille,m.black,lowerAir,bumperPoint,.075,.095);
    const lowerGrid=lowerAir.map(([x,y])=>[x*.89,.710+(y-.710)*.82]);
    const lowerSlots=[];for(let i=-8;i<=8;i++)lowerSlots.push(roundedOutline([[i*.038-.010,.667,0],[i*.038+.010,.667,0],[i*.038+.010,.753,0],[i*.038-.010,.753,0]],.004,3).map(([x,y])=>[x,y]));
    perforatedFace(g,m.grille,lowerGrid,lowerSlots,(x,y)=>{const p=bumperPoint(x,y);p[2]-=.054;return p;},.070);
    for(const outline of fogBlanks){
      const inner=recessedOpening(g,m.black,m.black,outline,bumperPoint,.028,.085),cx=inner.reduce((a,p)=>a+p[0],0)/inner.length;
      for(let row=0;row<3;row++)surface(g,m.black,12,1,(u,v)=>{
        const x=cx+(u-.5)*.145,y=.626+row*.032+(v-.5)*.006,p=bumperPoint(x,y);p[2]-=.023;return p;
      });
    }
    roundedBox(g,m.black,0,.548,nose+.182,.392,.170,.028,.010);
    roundedBox(g,m.dark,0,.548,nose+.197,.324,.138,.003,.004);
    for(const x of [-.119,.119])for(const y of [.499,.598])cylinder(g,m.satinMetal||m.chrome,x,y,nose+.200,.0033,.003,'z',8);
    const rearBumper=new THREE.Group();rearBumper.position.z=tail;rearBumper.rotation.y=Math.PI;g.add(rearBumper);
    sweptBumper(rearBumper,m.black,[[-1.00,.416,.563,.046,-.033],[-.92,.401,.567,.090,-.029],[-.67,.389,.568,.108,-.025],[0,.388,.568,.109,-.025],[.67,.389,.568,.108,-.025],[.92,.401,.567,.090,-.029],[1.00,.416,.563,.046,-.033]],.61);
    // Molded traction ribs share the black step material; bright metal-like
    // stripes made the stock bumper look like an aftermarket serrated bar.
    for(let i=-12;i<=12;i++)roundedBox(g,m.black,i*.061,.569,tail-.032,.026,.003,.073,.001);

    // Rear frame, two separate bowed door skins and actual pressed lower
    // panels. The door presses use the same negative-depth sheet construction
    // as the cargo wall, with no painted box behind either aperture.
    const rearDoorPlane=tail-.035,rearDoorGroup=new THREE.Group();rearDoorGroup.position.z=rearDoorPlane;rearDoorGroup.rotation.y=Math.PI/2;g.add(rearDoorGroup);
    const rearX=(side,y,extra=0,x=0)=>.006*(1-(x/.94)**2)+extra;
    const doorContours=[-1,1].map(side=>roundedOutline([[side*.005,.607,0],[side*.803,.607,0],[side*.887,.920,0],[side*.903,1.355,0],[side*.892,2.247,0],[side*.860,2.337,0],[side*.767,2.369,0],[side*.005,2.383,0]],.035,10));
    const frameShape=new THREE.Shape();frameShape.moveTo(-.951,.442);frameShape.lineTo(.951,.442);
    for(let i=0;i<=36;i++){const y=THREE.MathUtils.lerp(1.295,2.273,i/36);frameShape.lineTo(sideX(1,y,0,tail),y);}
    const rearHalf=sideX(1,2.273),rearCorner=rearHalf-.121;
    for(let i=0;i<=68;i++){const x=THREE.MathUtils.lerp(rearHalf,-rearHalf,i/68),a=Math.abs(x),y=a>rearCorner?2.273+Math.sqrt(Math.max(0,.121**2-(a-rearCorner)**2)):2.394;frameShape.lineTo(x,y);}
    for(let i=36;i>=0;i--){const y=THREE.MathUtils.lerp(1.295,2.273,i/36);frameShape.lineTo(sideX(-1,y,0,tail),y);}frameShape.closePath();
    for(const contour of doorContours){const hole=new THREE.Path();contour.forEach(([x,y],i)=>i?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();frameShape.holes.push(hole);}
    const frameGeo=new THREE.ShapeGeometry(frameShape,8);const fi=frameGeo.index.array;for(let i=0;i<fi.length;i+=3)[fi[i+1],fi[i+2]]=[fi[i+2],fi[i+1]];frameGeo.computeVertexNormals();finish(new THREE.Mesh(frameGeo,m.paint),g,0,0,tail);
    // The doors stand aft of the frame. Bridge the full aperture depth with
    // a real folded return; an unconnected hole and door show daylight at
    // the roof header and outer jambs from an oblique rear view.
    for(const contour of doorContours){
      const center=contour.reduce((q,p)=>q.add(v3(...p)),v3()).multiplyScalar(1/contour.length);
      const wall=surface(g,m.paint,contour.length,4,(u,v)=>{
        const t=Math.min(contour.length-1e-7,u*contour.length),i=Math.floor(t),a=v3(...contour[i]),b=v3(...contour[(i+1)%contour.length]),p=a.lerp(b,t-i);
        return[p.x,p.y,THREE.MathUtils.lerp(tail+.002,rearDoorPlane-rearX(1,p.y,0,p.x)-.001,v)];
      });
      const p=wall.geometry.attributes.position,n=wall.geometry.attributes.normal,ids=wall.geometry.index;let dot=0;
      for(let i=0;i<p.count;i++)dot+=n.getX(i)*(center.x-p.getX(i))+n.getY(i)*(center.y-p.getY(i));
      if(dot<0){for(let i=0;i<ids.count;i+=3){const a=ids.getX(i+1);ids.setX(i+1,ids.getX(i+2));ids.setX(i+2,a);}for(let i=0;i<n.count;i++)n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i));}
      wall.name='sprinter-rear-door-aperture-return';
    }
    // Keep the weatherseal close behind the bowed door edges and wide enough
    // to cover the slot at oblique views. A narrow strip 17 mm farther inside
    // exposed alternating pieces of the frame/cabin through the center gap.
    roundedBox(g,m.black,0,1.485,rearDoorPlane-.003,.032,1.80,.003,.001).name='sprinter-rear-door-weatherseal';
    for(const [index,side] of [-1,1].entries()){
      const contour=doorContours[index],shape=new THREE.Shape();contour.forEach(([x,y],i)=>i?shape.lineTo(-x,y):shape.moveTo(-x,y));shape.closePath();
      const windowXY=[[side*.067,1.398],[side*.789,1.398],[side*.780,2.217],[side*.069,2.225]];
      const windowOutline=roundedOutline(windowXY.map(([x,y])=>[0,y,x]),.082,9);
      const pressing=roundedOutline([[0,.704,side*.098],[0,.704,side*.755],[0,1.253,side*.771],[0,1.269,side*.101]],.059,10);
      for(const holePoints of [windowOutline,pressing]){const hole=new THREE.Path();holePoints.forEach(([,y,x],i)=>i?hole.lineTo(-x,y):hole.moveTo(-x,y));hole.closePath();shape.holes.push(hole);}
      finish(new THREE.Mesh(sheetGeometry(shape,1,rearX,0,.055),m.paint),rearDoorGroup);
      // Mirroring a door reverses its contour winding. The recess still faces
      // the same rearward direction on both doors, including its rim normals.
      stampedRecess(rearDoorGroup,m.paint,1,side>0?[...pressing].reverse():pressing,rearX,.009);
      const rearWindow=windowXY.map(([x,y])=>[x,y,rearDoorPlane-rearX(1,y,0,x)-.003]);
      windowPanel(g,{...m,glass:m.privacyGlass||m.glass},rearWindow,.045,.082);
      // Two articulated factory-style hinge assemblies, with visible pins and
      // mounting plates instead of three disconnected rectangular blocks.
      for(const y of [.734,2.127]){
        roundedBox(g,m.paint,side*.923,y,tail-.014,.052,.094,.022,.008);
        roundedBox(g,m.paint,side*.854,y,rearDoorPlane-.016,.095,.043,.025,.006);
        cylinder(g,m.paint,side*.904,y,tail-.047,.014,.118,'y',16);
        for(const dy of [-.027,.027])cylinder(g,m.dark,side*.922,y+dy,tail-.029,.0035,.005,'z',10);
      }
      // One curved molded lamp envelope wraps the rear corner. The prior
      // five separate opaque blocks left wide black gaps and exposed square
      // protruding ends; continuous thin covers now share a common surface.
      const rearLampPoint=(dx,y,offset=0)=>[side*(.923+dx),y,tail-.055+.031*(dx/.074)**2+.010*THREE.MathUtils.smoothstep(dx,-.011,.070)-offset];
      const faceRear=mesh=>{
        const geo=mesh.geometry,n=geo.attributes.normal;let z=0;for(let i=0;i<n.count;i++)z+=n.getZ(i);
        if(z>0){const ids=geo.index.array;for(let i=0;i<ids.length;i+=3)[ids[i+1],ids[i+2]]=[ids[i+2],ids[i+1]];geo.computeVertexNormals();}
        return mesh;
      };
      const rearLampPatch=(material,outline,offset=0)=>faceRear(perforatedFace(g,material,outline,[],(x,y)=>rearLampPoint(x,y,offset),.055));
      const housing=roundedOutline([[-.069,.857,0],[.067,.862,0],[.072,1.553,0],[.053,1.580,0],[-.048,1.585,0],[-.070,1.558,0]],.021,8).map(([x,y])=>[x,y]),housingLoop=[...housing,housing[0]];
      rearLampPatch(m.black,housing,-.023).name='sprinter-continuous-rear-lamp-housing';
      surface(g,m.black,housingLoop.length-1,6,(u,v)=>{
        const p=housingLoop[Math.round(u*(housingLoop.length-1))],q=rearLampPoint(p[0],p[1],-.023);q[2]+=v*.049;return q;
      });
      const lampCell=(cy,height,material,cover)=>{
        const outline=roundedOutline([[-.054,cy-height/2,0],[.054,cy-height/2,0],[.054,cy+height/2,0],[-.054,cy+height/2,0]],.009,7).map(([x,y])=>[x,y]);
        rearLampPatch(material,outline,-.005);
        const edgeRows=[];for(let i=0;i<=4;i++)edgeRows.push(-height/2+.009*(1-Math.cos(i*Math.PI/8)));
        const rows=[...edgeRows,0,...edgeRows.map(y=>-y).reverse()];
        const lens=faceRear(surface(g,cover,14,rows.length-1,(u,v)=>{
          const y=cy+rows[Math.round(v*(rows.length-1))],a=Math.max(0,Math.abs(y-cy)-(height/2-.009)),hw=.047+Math.sqrt(Math.max(0,.009**2-a*a)),x=(u*2-1)*hw;
          return rearLampPoint(x,y,.010);
        }));
        const lp=lens.geometry.attributes.position,luv=lens.geometry.attributes.uv;
        for(let i=0;i<lp.count;i++)luv.setXY(i,(side*lp.getX(i)-.923)/opticalPitch,lp.getY(i)/opticalPitch);
        lens.name='sprinter-curved-molded-tail-lens';
      };
      for(const [y,h,material] of [[1.485,.168,m.red],[1.243,.104,m.red],[1.137,.100,m.reverse],[.973,.218,m.red]])lampCell(y,h,material,material===m.reverse?m.sprinterPrismaticLens:m.sprinterRedPrismaticLens);
      // PY21W amber source behind the clear turn chamber; a white reversing
      // lens remains separately tied to reverse, as in the factory bulb map.
      lampCell(1.347,.098,m.chrome,m.sprinterPrismaticLens);
      rearLampPatch(m.amber,Array.from({length:24},(_,i)=>[Math.cos(i*Math.PI/12)*.0105,1.347+Math.sin(i*Math.PI/12)*.012]),.001);
      for(const y of [1.543,1.219,.907]){
        const p=rearLampPoint(-.060,y,.001);
        cylinder(g,m.black,p[0],p[1],p[2],.0034,.004,'z',8);
      }
    }
    // Pull handle, lock barrel, blank plate carrier, third stop lamp and badges.
    roundedBox(g,m.dark,-.129,1.203,rearDoorPlane-.009,.210,.067,.010,.005);
    roundedBox(g,m.black,-.125,1.202,rearDoorPlane-.027,.169,.030,.034,.008);
    cylinder(g,m.chrome,-.211,1.202,rearDoorPlane-.043,.008,.008,'z',16);
    roundedBox(g,m.black,0,2.379,tail-.007,.320,.049,.024,.007);
    roundedBox(g,m.red,0,2.379,tail-.024,.284,.024,.011,.004);
    roundedBox(g,m.redLens,0,2.379,tail-.033,.306,.039,.012,.005);
    roundedBox(g,m.black,.404,.869,rearDoorPlane-.004,.397,.142,.013,.004);
    for(const x of [.266,.542])cylinder(g,m.dark,x,.918,rearDoorPlane-.013,.004,.004,'z',8);
    const label=new THREE.Group();label.position.z=rearDoorPlane-.013;label.rotation.y=Math.PI;g.add(label);
    frontText(label,'SPRINTER',.476,1.317,0,.284,.041,'#c9cccd');frontText(label,'2500',-.594,1.319,0,.111,.038,'#c9cccd');
    const rearBadge=new THREE.Group();rearBadge.position.set(-.113,1.324,rearDoorPlane-.022);rearBadge.rotation.y=Math.PI;g.add(rearBadge);
    const rearRing=new THREE.Mesh(new THREE.TorusGeometry(.055,.004,8,40),m.chrome);rearBadge.add(rearRing);
    const rearStar=new THREE.Shape();for(let i=0;i<6;i++){const a=i*Math.PI/3,rr=i%2?.0098:.050;rearStar[i?'lineTo':'moveTo'](Math.sin(a)*rr,Math.cos(a)*rr);}rearStar.closePath();
    finish(new THREE.Mesh(new THREE.ExtrudeGeometry(rearStar,{depth:.0035,bevelEnabled:true,bevelSize:.0007,bevelThickness:.0007,bevelSegments:2,steps:1}),m.chrome),rearBadge,0,0,0);
    const interiorStart=g.children.length;
    view._interior({frontZ:1.224,rearZ:0.04,floor:0.54,dashY:1.361,dashZ:1.936,width:1.71,seatY:0.99,doorCards:false});
    // The W906 wheel has a broad padded center and two distinct lower spokes.
    // Keep the established driving position and column tilt while replacing
    // the generic three-spoke group. Optional steering-button clusters are
    // not assumed on the configured base commercial-van wheel.
    const steeringCenter=v3(1.71*.27,1.373,1.586),oldSteering=g.children.slice(interiorStart).find(child=>child.isGroup&&child.position.distanceTo(steeringCenter)<.00001);
    if(oldSteering){g.remove(oldSteering);oldSteering.traverse(child=>{if(child.isMesh)child.geometry.dispose();});}
    const steering=new THREE.Group();steering.position.copy(steeringCenter);steering.rotation.x=-.22;steering.name='sprinter-four-spoke-steering-wheel';g.add(steering);
    finish(new THREE.Mesh(new THREE.TorusGeometry(.157,.0165,12,60),m.black),steering);
    const wheelPlate=(points,material)=>{
      const outline=roundedOutline(points.map(([x,y])=>[x,y,0]),.008,6),shape=new THREE.Shape();outline.forEach(([x,y],i)=>shape[i?'lineTo':'moveTo'](x,y));shape.closePath();
      return finish(new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.027,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:2,steps:1}),material),steering,0,0,-.020);
    };
    for(const side of [-1,1]){
      wheelPlate([[side*.072,.040],[side*.146,.063],[side*.161,.018],[side*.079,-.019]],m.black);
      wheelPlate([[side*.026,-.061],[side*.061,-.054],[side*.111,-.127],[side*.072,-.147]],m.black);
      wheelPlate([[side*.042,-.074],[side*.059,-.073],[side*.093,-.125],[side*.078,-.133]],m.interior);
    }
    const padOutline=roundedOutline([[-.119,.022,0],[-.083,.057,0],[0,.068,0],[.083,.057,0],[.119,.022,0],[.103,-.036,0],[.052,-.077,0],[0,-.084,0],[-.052,-.077,0],[-.103,-.036,0]],.020,7),padLoop=[...padOutline,padOutline[0]];
    surface(steering,m.interior,padLoop.length-1,10,(u,v)=>{
      const q=padLoop[Math.round(u*(padLoop.length-1))];return [q[0]*v,-.006+(q[1]+.006)*v,-.031-.015*(1-v*v)];
    },true);
    surface(steering,m.interior,padLoop.length-1,4,(u,v)=>{
      const q=padLoop[Math.round(u*(padLoop.length-1))];return [q[0]*(1-.04*v),-.006+(q[1]+.006)*(1-.04*v),-.031+.043*v];
    });
    finish(new THREE.Mesh(new THREE.TorusGeometry(.024,.0015,8,36),m.chrome),steering,0,-.006,-.047);
    const wheelStar=new THREE.Shape();for(let i=0;i<6;i++){const a=i*Math.PI/3,rr=i%2?.0047:.022;wheelStar[i?'lineTo':'moveTo'](Math.sin(a)*rr,Math.cos(a)*rr);}wheelStar.closePath();
    finish(new THREE.Mesh(new THREE.ExtrudeGeometry(wheelStar,{depth:.0017,bevelEnabled:false,steps:1}),m.chrome),steering,0,-.006,-.048);
    // W906 cab cards stop at the front-door shut lines. The generic full-length
    // slab had extended behind the Crew bench and used a horizontal bright
    // handle unlike the shaped commercial-van armrest and pull pocket.
    for(const side of [-1,1]){
      const cardX=(ignored,y,extra=0,z=0)=>side*(.907-.036*THREE.MathUtils.smoothstep(z,1.64,2.06)-.012*Math.sin(clamp((y-.61)/.78,0,1)*Math.PI)+extra);
      const cardContour=roundedOutline([[0,.625,.576],[0,.625,1.371],[0,.929,1.710],[0,1.257,2.033],[0,1.359,2.033],[0,1.367,.639]],.046,8);
      const pull=roundedOutline([[0,1.095,1.015],[0,1.095,1.315],[0,1.268,1.445],[0,1.283,1.214]],.027,8);
      const bin=roundedOutline([[0,.726,.673],[0,.718,1.334],[0,.935,1.571],[0,.954,.682]],.035,8);
      const card=new THREE.Shape();cardContour.forEach(([,y,z],i)=>card[i?'lineTo':'moveTo'](-z,y));card.closePath();
      for(const outline of [pull,bin]){const h=new THREE.Path();outline.forEach(([,y,z],i)=>h[i?'lineTo':'moveTo'](-z,y));h.closePath();card.holes.push(h);}
      finish(new THREE.Mesh(sheetGeometry(card,-side,cardX,0,.085),m.interior),g).name='sprinter-contoured-cab-door-card';
      for(const [outline,depth] of [[pull,.030],[bin,.044]]){
        const first=g.children.length;stampedRecess(g,m.black,-side,[...outline].reverse(),cardX,depth);
        for(const child of g.children.slice(first))child.name='sprinter-recessed-door-pocket';
      }
      // The armrest rises into the forward switch housing. Its bridge leaves
      // an actual finger opening above the deeper lower door storage pocket.
      surface(g,m.black,34,10,(u,v)=>{
        const z=THREE.MathUtils.lerp(.882,1.641,u),top=1.004+.086*THREE.MathUtils.smoothstep(u,.45,1),angle=v*Math.PI;
        return [cardX(-side,top,0,z)-side*(.023+.067*Math.sin(angle)),top+.017*Math.cos(angle),z];
      },side<0);
      const grabStart=[cardX(-side,1.105,0,1.079)-side*.044,1.105,1.079],grabEnd=[cardX(-side,1.255,0,1.377)-side*.046,1.255,1.377];
      line(g,m.black,grabStart,grabEnd,.019);
      for(const [y,z] of [[1.106,1.078],[1.254,1.375]])roundedBox(g,m.black,cardX(-side,y,0,z)-side*.020,y,z,.047,.047,.058,.011);
      roundedBox(g,m.grille,cardX(-side,1.112,0,1.563)-side*.057,1.112,1.563,.060,.018,.146,.008);
      for(const z of [1.535,1.585])roundedBox(g,m.black,cardX(-side,1.124,0,z)-side*.057,1.124,z,.039,.013,.032,.003);
      if(side>0){
        cylinder(g,m.black,cardX(-side,1.128,0,1.645)-side*.050,1.128,1.645,.015,.018,'y',16);
        line(g,m.headliner,[.810,1.139,1.639],[.810,1.139,1.651],.0012);
      }
      // A short textured sill belongs to each cab door, while the existing
      // passenger sliding-door step remains in its original position.
      roundedBox(g,m.black,side*.895,.568,1.074,.145,.036,.861,.008);
      for(let i=0;i<13;i++)roundedBox(g,m.grille,side*.895,.588,.718+i*.059,.103,.004,.013,.001);
    }
    // W906 uses tall rectangular registers, not the round SUV outlets in the
    // generic cabin. Remove just those four register assemblies before adding
    // their model-specific housings and horizontal louvres.
    for(const mesh of g.children.slice(interiorStart)){
      if(!mesh.isMesh)continue;
      const p=mesh.position,ventX=[-1.71*.41,-1.71*.23,1.71*.23,1.71*.41].some(x=>Math.abs(p.x-x)<.00001);
      if(ventX&&p.y>1.36&&p.y<1.410&&p.z>1.735&&p.z<1.780){g.remove(mesh);mesh.geometry.dispose();}
    }
    // The vertical central vents belong to a raised, moulded dash console.
    // Blend that console back into the low passenger tray so its vent backs
    // cannot appear as freestanding posts through the windscreen.
    const consoleTop=x=>1.444+.083*(1-(Math.abs(x)/.365)**6);
    surface(g,m.black,36,22,(u,v)=>{
      const x=(u*2-1)*.365,z=THREE.MathUtils.lerp(1.775,2.035,v);
      return [x,1.444+(consoleTop(x)-1.444)*(.5+.5*Math.cos(v*Math.PI)),z];
    },true).name='sprinter-integrated-dash-console';
    surface(g,m.black,36,8,(u,v)=>{
      const x=(u*2-1)*.365;return [x,THREE.MathUtils.lerp(1.183,consoleTop(x),v),1.775];
    },true);
    for(const [x,y,w,h] of [[-.209,1.397,.071,.199],[.209,1.397,.071,.199],[-.712,1.365,.073,.133],[.712,1.365,.073,.133]]){
      roundedBox(g,m.interior,x,y,1.763,w+.024,h+.023,.020,.006);
      roundedBox(g,m.black,x,y,1.749,w,h,.023,.005);
      const rows=h>.15?10:7;
      for(let i=0;i<rows;i++)roundedBox(g,m.grille,x,y+(i/(rows-1)-.5)*(h-.022),1.734,w-.009,.0045,.008,.001);
      roundedBox(g,m.interior,x,y-.012,1.728,.027,.006,.010,.002);
    }
    // Dash-mounted automatic selector and the passenger-side open parcel tray.
    roundedBox(g,m.black,.286,1.182,1.744,.066,.105,.027,.012);
    line(g,m.black,[.286,1.180,1.721],[.286,1.255,1.646],.009);
    const knob=new THREE.Mesh(new THREE.SphereGeometry(1,18,12),m.interior);knob.scale.set(.028,.036,.031);finish(knob,g,.286,1.270,1.637);
    roundedBox(g,m.dark,-.514,1.447,1.945,.435,.004,.157,.001);
    for(const x of [-.739,-.289])roundedBox(g,m.black,x,1.454,1.945,.014,.019,.177,.004);
    // The lower dash is a continuous molded shell, including a glovebox and
    // a lower central storage opening. The short generic upper dash formerly
    // exposed a broad blue firewall through the windscreen and from the cab.
    const lowerDashPoint=(x,y)=>[x,y,1.773+.086*THREE.MathUtils.smoothstep(1.285-y,0,.41)+.038*(Math.abs(x)/.854)**3];
    const lowerDash=roundedOutline([[-.842,1.294,0],[.842,1.294,0],[.832,1.044,0],[.326,.976,0],[.267,.823,0],[-.258,.823,0],[-.317,.980,0],[-.832,1.021,0]],.026,8).map(([x,y])=>[x,y]);
    const storage=roundedOutline([[-.140,.929,0],[.140,.929,0],[.149,1.024,0],[-.149,1.024,0]],.013,7).map(([x,y])=>[x,y]);
    const lowerDashMesh=perforatedFace(g,m.interior,lowerDash,[storage],lowerDashPoint,.080),lowerDashIndices=lowerDashMesh.geometry.index.array;
    for(let i=0;i<lowerDashIndices.length;i+=3)[lowerDashIndices[i+1],lowerDashIndices[i+2]]=[lowerDashIndices[i+2],lowerDashIndices[i+1]];
    lowerDashMesh.geometry.computeVertexNormals();lowerDashMesh.name='sprinter-continuous-lower-dash';
    const storageLoop=[...storage,storage[0]];
    surface(g,m.black,storageLoop.length-1,4,(u,v)=>{
      const [x,y]=storageLoop[Math.round(u*(storageLoop.length-1))],p=lowerDashPoint(x*(1-.06*v),.976+(y-.976)*(1-.12*v));p[2]+=.059*v;return p;
    });
    const storageBack=perforatedFace(g,m.black,storage.map(([x,y])=>[x*.94,.976+(y-.976)*.88]),[],(x,y)=>{const p=lowerDashPoint(x,y);p[2]+=.060;return p;},.055);
    const storageIndices=storageBack.geometry.index.array;for(let i=0;i<storageIndices.length;i+=3)[storageIndices[i+1],storageIndices[i+2]]=[storageIndices[i+2],storageIndices[i+1]];storageBack.geometry.computeVertexNormals();
    const glovebox=roundedOutline([[-.755,1.073,0],[-.331,1.043,0],[-.322,1.263,0],[-.758,1.268,0]],.018,8);
    curvedLine(g,m.black,[...glovebox,glovebox[0]].map(([x,y])=>{const p=lowerDashPoint(x,y);p[2]-=.0018;return p;}),.0017);
    const gloveHandle=lowerDashPoint(-.548,1.209);roundedBox(g,m.black,gloveHandle[0],gloveHandle[1],gloveHandle[2]-.009,.092,.018,.020,.005);
    line(g,m.black,[.462,1.370,1.612],[.462,1.312,1.865],.033);
    // Fitted rubber toe-board and floor covering meet beneath the dash. The
    // material remains separate from exterior paint and ends at the cab sill.
    surface(g,m.black,34,15,(u,v)=>{
      const x=(u*2-1)*.835,y=THREE.MathUtils.lerp(.568,1.274,v);
      return [x,y,2.071-.045*Math.sin(v*Math.PI)-.029*(x/.835)**2];
    },true);
    surface(g,m.black,34,22,(u,v)=>{
      const x=(u*2-1)*.835,z=THREE.MathUtils.lerp(1.286,2.061,v);return [x,.561+.115*THREE.MathUtils.smoothstep(z,1.826,2.061),z];
    },true);
    for(const side of [-1,1])for(let i=0;i<7;i++)surface(g,m.interior,16,1,(u,v)=>{
      const z=THREE.MathUtils.lerp(1.465,1.985,u),x=side*(.260+i*.066)+(v-.5)*.004;
      return [x,.5628+.115*THREE.MathUtils.smoothstep(z,1.826,2.061),z];
    });
    // A fitted short cab headliner, stowed sun visors and a real mirror support
    // provide scale inside the tall windscreen without blocking the glass.
    surface(g,m.headliner,32,22,(u,v)=>{
      const x=(u*2-1)*.767,z=THREE.MathUtils.lerp(.490,1.322,v);
      return [x,roofSectionY(x)-.025,z];
    });
    surface(g,m.headliner,30,16,(u,v)=>{
      const x=(u*2-1)*.794,a=1-v,y0=roofSectionY(x)-.028,y1=2.273+.020*(1-(x/.794)**2);
      return [x,a*a*a*y0+3*a*a*v*y0+3*a*v*v*(y1+.040)+v*v*v*y1,THREE.MathUtils.lerp(1.318,1.603,v)];
    }).name='sprinter-front-headliner-return';
    for(const side of [-1,1]){
      surface(g,m.headliner,26,5,(u,v)=>{
        const front=v3(side*.863,1.448,2.146).lerp(v3(side*.833,2.280,1.603),u);
        const flank=v3(side*.927,1.425,2.037).lerp(v3(side*.887,2.211,1.517),u);
        const p=front.lerp(flank,v);p.x-=side*.003*Math.sin(v*Math.PI);return p.toArray();
      },side>0).name='sprinter-inner-a-pillar-trim';
      const visor=roundedBox(g,m.headliner,side*.435,2.329,1.492,.465,.022,.166,.007);visor.rotation.x=.11;
      line(g,m.interior,[side*.678,2.335,1.548],[side*.635,2.335,1.548],.005);
      // Commercial seat armrest and its pivot at the inside of each front seat.
      roundedBox(g,m.upholstery||m.interior,side*.219,1.139,1.144,.057,.051,.311,.016);
      cylinder(g,m.black,side*.219,1.114,.998,.024,.055,'x',16);
    }
    roundedBox(g,m.black,0,2.219,1.642,.043,.039,.018,.006);
    line(g,m.black,[0,2.212,1.636],[0,2.133,1.601],.007);
    roundedBox(g,m.black,0,2.121,1.596,.226,.079,.033,.015);
    roundedBox(g,m.chrome,0,2.121,1.577,.201,.055,.006,.002);
    roundedBox(g,m.interior,0,0.58,-1.32,1.79,0.035,3.15,0.010);
    // The old fascia construction added its bumper depth outside a nominal
    // body length. Calibrate the exterior overhangs to the 2016 drawing while
    // leaving both wheel apertures, cab, mirrors and the recovery datum fixed.
    const frontLimit=f+40.2*.0254,rearLimit=-(f+48.8*.0254),frontStart=f+.537,rearStart=f+.537;
    g.updateWorldMatrix(true,true);const inverse=g.matrixWorld.clone().invert(),meshes=[];
    g.traverse(mesh=>{if(mesh.isMesh&&!mesh.isInstancedMesh)meshes.push(mesh);});
    let frontExtent=frontStart,rearExtent=rearStart;
    const prepared=meshes.map(mesh=>{
      const matrix=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld),geo=mesh.geometry.clone().applyMatrix4(matrix),p=geo.attributes.position;
      for(let i=0;i<p.count;i++){frontExtent=Math.max(frontExtent,p.getZ(i));rearExtent=Math.max(rearExtent,-p.getZ(i));}
      return {mesh,geo};
    });
    const frontCorrection=frontExtent-frontLimit,rearCorrection=rearExtent+rearLimit;
    // W906's long lower wall is a drawn sheet with a waist swage and slightly
    // fuller wheel haunches. Move the surrounding trim/seams with the skin;
    // separate raised strips formerly left the broad sheet visually flat.
    // Rounded handle cups are a negative pressing in that same surface.
    const formedSheetOffset=(x,y,z)=>{
      const side=Math.sign(x),weight=THREE.MathUtils.smoothstep(Math.abs(x),.70,.95),gauss=(value,centre,width)=>Math.exp(-(((value-centre)/width)**2));
      const length=THREE.MathUtils.smoothstep(z,tail+.035,tail+.205)*(1-THREE.MathUtils.smoothstep(z,2.04,2.37));
      let draw=.011*gauss(y,1.053,.076)-.009*gauss(y,1.166,.076)+.0045*gauss(y,1.337,.045);
      for(const axle of [-f,f])draw+=.009*gauss(z,axle,.46)*gauss(y,.876,.16);
      for(const centre of [.711,...(side<0?[.150]:[])]){
        const q=Math.hypot((y-1.179)/.045,(z-centre)/.132);draw-=.012*(1-THREE.MathUtils.smoothstep(q,.18,1));
      }
      return side*weight*length*draw;
    };
    for(const {mesh,geo} of prepared){
      const p=geo.attributes.position,n=geo.attributes.normal;
      for(let i=0;i<p.count;i++){
        const z=p.getZ(i),front=z>0,start=front?frontStart:rearStart,extent=front?frontExtent:rearExtent,correction=front?frontCorrection:rearCorrection;
        const q=clamp((Math.abs(z)-start)/(extent-start),0,1),weight=q*q*(3-2*q),scale=1-correction*6*q*(1-q)/(extent-start);
        p.setZ(i,z+(front?-1:1)*correction*weight);
        if(n&&q>0){const normal=v3(n.getX(i),n.getY(i),n.getZ(i)/Math.max(.4,scale)).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);}
        const x=p.getX(i),y=p.getY(i),zz=p.getZ(i),offset=formedSheetOffset(x,y,zz);
        if(Math.abs(offset)>1e-12){
          if(n){
            const epsilon=.0001,dx=(formedSheetOffset(x+epsilon,y,zz)-formedSheetOffset(x-epsilon,y,zz))/(2*epsilon),dy=(formedSheetOffset(x,y+epsilon,zz)-formedSheetOffset(x,y-epsilon,zz))/(2*epsilon),dz=(formedSheetOffset(x,y,zz+epsilon)-formedSheetOffset(x,y,zz-epsilon))/(2*epsilon);
            const nx=n.getX(i)/(1+dx),normal=v3(nx,n.getY(i)-dy*nx,n.getZ(i)-dz*nx).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);
          }
          p.setX(i,x+offset);
        }
      }
      mesh.geometry.dispose();mesh.geometry=geo;mesh.parent.remove(mesh);g.add(mesh);mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);geo.computeBoundingSphere();
    }
    view.root.userData.coachworkDetail={revision:8,formedWaistSwage:true,pressedHandleCups:true,bowedCabGlass:true};
  }
