/** Original model-specific bodywork, shared by the garage and driving rig. */
export function buildCivic(view, geometry) {
  const { THREE, UP, X_AXIS, clamp, v3, finish, box, roundedBox, roofCap, cylinder, panel, polygon, surface, interpolate, lowerShell, perforatedFace, recessedOpening, sweptBumper, subdivideBendRegions, roundBodyEnds, roundRoofShoulders, frontSkinProjector, curvedLine, roundedOutline, windowPanel, ellipseRing, profile, line, archPoints, sideText, frontText } = geometry;

    const m = view.materials, g = view.body, wb = view.spec.wheelbase, f = wb / 2, r = -f;
    m.civicIndicatorBulb=m.amber.clone();m.civicIndicatorBulb.emissiveIntensity=0;m.civicIndicatorBulb.userData.vehicleLightEmitter=true;
    const front = 2.29, tail = -2.35;
    const stations = [[tail,.868,.914],[-2.22,.876,.939],[-1.61,.887,.977],[-.80,.883,.968],[.20,.883,.953],[1.08,.884,.937],[1.48,.882,.891],[1.84,.876,.842],[2.15,.872,.809],[front,.868,.790]];
    const frontSkin = lowerShell(g, m.paint, stations, wb, .365, .277, .334, .031, .022, .047, { cabin: { rear:-1.53, front:1.075, half:.749 } });
    const hoodWidth = z => .735 + .050 * clamp((z - 1.075) / 1.215, 0, 1);
    const hoodRelief = (x,z) => {
      const fade = THREE.MathUtils.smoothstep(z,1.075,1.22) * (1-THREE.MathUtils.smoothstep(z,2.17,front));
      const edge = hoodWidth(z), crease = Math.exp(-(((Math.abs(x)-edge+.040)/.051)**2));
      return .013 * fade * crease;
    };
    const topPoint = (x,z,offset=0) => {
      const half=interpolate(stations,z,1)-.047;
      return [x,interpolate(stations,z,2)+.031*(1-(x/half)**2)+hoodRelief(x,z)+offset,z];
    };
    // Extra rows are confined to the hood's crease and rolled leading edge.
    // A coarse diagonal across that small radius made a triangular highlight.
    const hoodRows=Array.from({length:64},(_,i)=>THREE.MathUtils.lerp(1.075,front,i/63));
    for(let i=0;i<=26;i++)hoodRows.push(front-.13+i*.005);
    hoodRows.sort((a,b)=>a-b);const hoodZ=hoodRows.filter((z,i,a)=>!i||z-a[i-1]>.00001);
    const hoodColumns=Array.from({length:29},(_,i)=>i/28);
    for(let i=0;i<=24;i++){hoodColumns.push(i*.15/24,1-i*.15/24);}
    hoodColumns.sort((a,b)=>a-b);const hoodU=hoodColumns.filter((x,i,a)=>!i||x-a[i-1]>.00001);
    const hoodPos=[],hoodUV=[],hoodIds=[],hoodNormal=[],hoodStride=hoodU.length;
    for(const z of hoodZ)for(const u of hoodU){const half=interpolate(stations,z,1)-.047,x=(u*2-1)*half;hoodPos.push(x,interpolate(stations,z,2)+.031*(1-(x/half)**2),z);hoodNormal.push(0,1,0);hoodUV.push(u,(z-1.075)/(front-1.075));}
    for(let z=0;z<hoodZ.length-1;z++)for(let x=0;x<hoodStride-1;x++){const a=z*hoodStride+x,b=a+1,c=a+hoodStride,d=c+1;hoodIds.push(a,c,b,b,c,d);}
    const hoodGrid=new THREE.BufferGeometry();hoodGrid.setAttribute('position',new THREE.Float32BufferAttribute(hoodPos,3));hoodGrid.setAttribute('normal',new THREE.Float32BufferAttribute(hoodNormal,3));hoodGrid.setAttribute('uv',new THREE.Float32BufferAttribute(hoodUV,2));hoodGrid.setIndex(hoodIds);
    frontSkin[3].geometry.dispose();frontSkin[3].geometry=hoodGrid;
    const beltStations=[[-1.583,.801,.994],[-1.51,.799,1.001],[-1.177,.803,.988],[-.33,.807,.975],[1.02,.807,.976]];
    const beltPoint=(side,z,u)=>{
      const half=interpolate(stations,z,1)-.047,low=topPoint(side*half,z),high=[side*interpolate(beltStations,z,1),interpolate(beltStations,z,2),z];
      return [THREE.MathUtils.lerp(low[0],high[0],u),THREE.MathUtils.lerp(low[1],high[1],u)+.0025*Math.sin(u*Math.PI),z];
    };
    const handleCenters=[-.105,-1.105];
    // A sharp, gently arcing shoulder and the rising lower-door stamping are
    // made in the sheet itself. The four pull handles have depressed cups,
    // rather than black rectangular plaques pasted onto an unbroken door.
    const sculpt=(y,z)=>{
      const band=THREE.MathUtils.smoothstep(z,-1.16,-.91)*(1-THREE.MathUtils.smoothstep(z,.87,1.12)),crease=.44-z*.047;
      const shoulder=.910+.018*Math.exp(-(((z+.40)/1.32)**2));
      const shoulderBand=THREE.MathUtils.smoothstep(z,-2.23,-1.84)*(1-THREE.MathUtils.smoothstep(z,1.63,2.09));
      let depth=.019*band*Math.exp(-(((y-crease-.052)/.065)**2))+.011*shoulderBand*Math.exp(-(((y-shoulder+.040)/.031)**2));
      for(const center of handleCenters){const radius=Math.hypot((z-center)/.116,(y-.883)/.044);depth+=.014*(1-THREE.MathUtils.smoothstep(radius,.12,1));}
      return depth;
    };
    // A physical-height grid keeps the thin shoulder stamping and handle cups
    // aligned between adjacent columns. Unequal edge-split triangle fans had
    // interpolated the narrow curved highlight into a repeating scallop.
    const gridSamples=(low,high,step,extra=[])=>{
      const n=Math.ceil((high-low)/step),values=Array.from({length:n+1},(_,i)=>THREE.MathUtils.lerp(low,high,i/n));
      return [...values,...extra].filter(v=>v>=low&&v<=high).sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>.00001);
    };
    const closeHandleZ=handleCenters.flatMap(z=>gridSamples(z-.14,z+.14,.006));
    const sideZ=gridSamples(tail,front,.024,closeHandleZ),sideY=gridSamples(.277,.940,.016,gridSamples(.832,.940,.0035));
    for(const [sideIndex,mesh] of frontSkin.slice(6,8).entries()){
      const side=sideIndex?1:-1,pos=[],uv=[],ids=[],normal=[],row=sideZ.length;
      for(const yLevel of sideY)for(const z of sideZ){
        const top=interpolate(stations,z,2)-.047;let low=.277;
        for(const axle of [r,f]){const dz=z-axle;if(Math.abs(dz)<.365)low=Math.max(low,.334+Math.sqrt(Math.max(0,.365*.365-dz*dz)));}
        low=Math.min(top-.012,low);const y=clamp(yLevel,low,top);
        pos.push(side*interpolate(stations,z,1),y,z);normal.push(side,0,0);uv.push((z-tail)/(front-tail),(y-.277)/.663);
      }
      const triangle=(a,b,c)=>{
        const ay=pos[a*3+1],az=pos[a*3+2],by=pos[b*3+1],bz=pos[b*3+2],cy=pos[c*3+1],cz=pos[c*3+2];
        if(Math.abs((bz-cz)*(ay-cy)+(cy-by)*(az-cz))>1e-12)ids.push(...(side>0?[a,c,b]:[a,b,c]));
      };
      for(let y=0;y<sideY.length-1;y++)for(let z=0;z<row-1;z++){const a=y*row+z,b=a+1,c=a+row,d=c+1;triangle(a,b,c);triangle(b,d,c);}
      const grid=new THREE.BufferGeometry();grid.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));grid.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));grid.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));grid.setIndex(ids);
      mesh.geometry.dispose();mesh.geometry=grid;
    }
    const sectionX=(y,z)=>{
      const w=interpolate(stations,z,1),top=interpolate(stations,z,2)-.047,h=clamp((y-.277)/(top-.277),0,1),dy=clamp(y-top,0,.047);
      return (y>top?w-.047+Math.sqrt(Math.max(0,.047*.047-dy*dy)):w-.018*(1-h)+.022*Math.sin(h*Math.PI))-sculpt(y,z);
    };
    for(const [meshIndex,mesh] of frontSkin.entries()){
      const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i),side=Math.sign(x),epsilon=.000025;
        if(meshIndex>=4&&meshIndex<8){
          // Evaluate both the section and its normal after refinement. Face-
          // weighted normals on the unequal split triangles made a repeating
          // highlight ripple despite the intended smooth longitudinal shape.
          p.setX(i,side*sectionX(y,z));
          const dy=(sectionX(y+epsilon,z)-sectionX(y-epsilon,z))/(epsilon*2),dz=(sectionX(y,z+epsilon)-sectionX(y,z-epsilon))/(epsilon*2);
          const normal=v3(side,-dy,-dz).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);
        }
        if(meshIndex===3){
          const dx=(topPoint(x+epsilon,z)[1]-topPoint(x-epsilon,z)[1])/(epsilon*2),dz=(topPoint(x,z+epsilon)[1]-topPoint(x,z-epsilon)[1])/(epsilon*2);
          const normal=v3(-dx,1,-dz).normalize();p.setY(i,topPoint(x,z)[1]);n.setXYZ(i,normal.x,normal.y,normal.z);
        }else if(z>1.075&&Math.abs(x)<interpolate(stations,z,1)-.047&&y>interpolate(stations,z,2)-.003){
          const relief=hoodRelief(x,z),dx=(hoodRelief(x+epsilon,z)-hoodRelief(x-epsilon,z))/(epsilon*2),dz=(hoodRelief(x,z+epsilon)-hoodRelief(x,z-epsilon))/(epsilon*2);
          p.setY(i,y+relief);const normal=v3(n.getX(i)-dx*n.getY(i),n.getY(i),n.getZ(i)-dz*n.getY(i)).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);
        }
      }
      p.needsUpdate=true;n.needsUpdate=true;mesh.geometry.computeBoundingSphere();
    }
    // Project trim onto the triangles that are actually rendered. An analytic
    // body formula alone can dip beneath the interpolated facets in the door's
    // concave lower stamping and leave a dotted seam in the garage closeup.
    const sideCells=new Map(),sideCellSize=.085;
    for(const mesh of frontSkin.slice(4,8)){
      const p=mesh.geometry.attributes.position,ids=mesh.geometry.index.array;
      for(let i=0;i<ids.length;i+=3){
        const a=new THREE.Vector3().fromBufferAttribute(p,ids[i]),b=new THREE.Vector3().fromBufferAttribute(p,ids[i+1]),c=new THREE.Vector3().fromBufferAttribute(p,ids[i+2]);
        const det=(b.z-c.z)*(a.y-c.y)+(c.y-b.y)*(a.z-c.z);if(Math.abs(det)<1e-10)continue;
        const side=Math.sign(a.x+b.x+c.x),triangle={a,b,c,det,side};
        for(let yy=Math.floor(Math.min(a.y,b.y,c.y)/sideCellSize);yy<=Math.floor(Math.max(a.y,b.y,c.y)/sideCellSize);yy++)for(let zz=Math.floor(Math.min(a.z,b.z,c.z)/sideCellSize);zz<=Math.floor(Math.max(a.z,b.z,c.z)/sideCellSize);zz++){
          const key=side+':'+yy+':'+zz;if(!sideCells.has(key))sideCells.set(key,[]);sideCells.get(key).push(triangle);
        }
      }
    }
    const sidePoint=(side,y,z,offset=.002)=>{
      if(z>=-1.583&&z<=1.02&&y>interpolate(stations,z,2)&&y<=interpolate(beltStations,z,2)+.001){
        let lo=0,hi=1;for(let iteration=0;iteration<12;iteration++){const u=(lo+hi)*.5;if(beltPoint(side,z,u)[1]<y)lo=u;else hi=u;}
        const p=beltPoint(side,z,(lo+hi)*.5);return [p[0]+side*offset,y,z];
      }
      const triangles=sideCells.get(side+':'+Math.floor(y/sideCellSize)+':'+Math.floor(z/sideCellSize))||[];let edge=-Infinity;
      for(const {a,b,c,det} of triangles){
        const wa=((b.z-c.z)*(y-c.y)+(c.y-b.y)*(z-c.z))/det,wb=((c.z-a.z)*(y-c.y)+(a.y-c.y)*(z-c.z))/det,wc=1-wa-wb;
        if(Math.min(wa,wb,wc)<-.00003)continue;edge=Math.max(edge,side*(wa*a.x+wb*b.x+wc*c.x));
      }
      if(Number.isFinite(edge))return [side*(edge+offset),y,z];
      const w=interpolate(stations,z,1),top=interpolate(stations,z,2)-.047,h=clamp((y-.277)/(top-.277),0,1),dy=clamp(y-top,0,.047);
      const x=y>top?w-.047+Math.sqrt(Math.max(0,.047*.047-dy*dy)):w-.018*(1-h)+.022*Math.sin(h*Math.PI);
      return [side*(x-sculpt(y,z)+offset),y,z];
    };
    const sideSeam=(side,points,width=.0019,closed=false)=>{
      const curve=new THREE.CatmullRomCurve3(points.map(([y,z])=>v3(0,y,z)),closed),count=Math.ceil(curve.getLength()/.012);
      return surface(g,m.black,2,count,(u,v)=>{
        const p=curve.getPoint(v),t=curve.getTangent(v),d=(u*2-1)*width;
        return sidePoint(side,p.y-t.z*d,p.z+t.y*d,.0018);
      },side>0);
    };
    const topCells=new Map(),topCellSize=.080;
    for(const mesh of frontSkin.slice(0,4)){
      const p=mesh.geometry.attributes.position,ids=mesh.geometry.index.array;
      for(let i=0;i<ids.length;i+=3){
        const a=new THREE.Vector3().fromBufferAttribute(p,ids[i]),b=new THREE.Vector3().fromBufferAttribute(p,ids[i+1]),c=new THREE.Vector3().fromBufferAttribute(p,ids[i+2]);
        const det=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(det)<1e-10)continue;
        const triangle={a,b,c,det};
        for(let xx=Math.floor(Math.min(a.x,b.x,c.x)/topCellSize);xx<=Math.floor(Math.max(a.x,b.x,c.x)/topCellSize);xx++)for(let zz=Math.floor(Math.min(a.z,b.z,c.z)/topCellSize);zz<=Math.floor(Math.max(a.z,b.z,c.z)/topCellSize);zz++){
          const key=xx+':'+zz;if(!topCells.has(key))topCells.set(key,[]);topCells.get(key).push(triangle);
        }
      }
    }
    const topSkinPoint=(x,z,offset=.0018)=>{
      const triangles=topCells.get(Math.floor(x/topCellSize)+':'+Math.floor(z/topCellSize))||[];let edge=-Infinity;
      for(const {a,b,c,det} of triangles){
        const wa=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/det,wb=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/det,wc=1-wa-wb;
        if(Math.min(wa,wb,wc)<-.00003)continue;edge=Math.max(edge,wa*a.y+wb*b.y+wc*c.y);
      }
      return Number.isFinite(edge)?[x,edge+offset,z]:topPoint(x,z,offset);
    };
    const topSeam=(points,width=.0016)=>{
      const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>v3(x,0,z))),count=Math.ceil(curve.getLength()/.010);
      return surface(g,m.dark,2,count,(u,v)=>{const p=curve.getPoint(v),t=curve.getTangent(v),d=(u*2-1)*width;return topSkinPoint(p.x-t.z*d,p.z+t.x*d);});
    };
    const frontLamp=frontSkinProjector(g,frontSkin,1,front),rearLamp=frontSkinProjector(g,frontSkin,-1,tail),apertures=[],rearApertures=[];
    const flatGuide=(projector,material,points,width=.006,offset=.028)=>{
      for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),nx=-dy/length*width,ny=dx/length*width;projector.patch(material,[[a[0]+nx,a[1]+ny,a[2]],[b[0]+nx,b[1]+ny,b[2]],[b[0]-nx,b[1]-ny,b[2]],[a[0]-nx,a[1]-ny,a[2]]],offset);}
    };
    const xy = points => points.map(([x,y])=>[x,y]);
    const rearPatch=(material,outline,holes=[],offset=.008)=>{
      const mesh=perforatedFace(g,material,xy(outline),holes.map(xy),(x,y)=>[x,y,tail-offset],.025),ids=mesh.geometry.index.array;
      for(let i=0;i<ids.length;i+=3)[ids[i+1],ids[i+2]]=[ids[i+2],ids[i+1]];
      mesh.geometry.computeVertexNormals();return mesh;
    };
    const rearReveal=outline=>{
      const center=outline.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>v/outline.length);
      const inner=outline.map(([x,y])=>[THREE.MathUtils.lerp(x,center[0],.035),THREE.MathUtils.lerp(y,center[1],.035),tail+.030]);
      surface(g,m.black,outline.length*2,6,(u,v)=>{
        const s=u*outline.length,i=Math.floor(s)%outline.length,j=(i+1)%outline.length,t=s-Math.floor(s);
        const a=v3(...outline[i]).lerp(v3(...outline[j]),t),b=v3(...inner[i]).lerp(v3(...inner[j]),t);return a.lerp(b,v).toArray();
      },true);
      rearPatch(m.black,inner,[],-.030);
    };
    const faceSample=(x,y)=>frontLamp.point([x,y,front],0);
    // Honda's pre-facelift 11th-generation sedan: pulled-back A pillars,
    // a lightly crowned roof and a separate upswept boot, not a hatchback.
    const roofStations=[[-.805,.639,1.343],[-.57,.668,1.365],[-.19,.678,1.376],[.14,.671,1.364],[.405,.642,1.337]];
    surface(g,m.paint,32,30,(u,v)=>{const z=THREE.MathUtils.lerp(-.805,.405,v),x=u*2-1;return [x*interpolate(roofStations,z,1),interpolate(roofStations,z,2)+.030*(1-x*x),z];},true);
    const ribbon=(material,outer,inner,bulge=.006)=>{
      const a=new THREE.CatmullRomCurve3(outer.map(p=>v3(...p))),b=new THREE.CatmullRomCurve3(inner.map(p=>v3(...p)));
      return surface(g,material,5,32,(u,v)=>{const p=a.getPoint(v).lerp(b.getPoint(v),u);p.y+=Math.sin(u*Math.PI)*bulge;return p.toArray();});
    };
    windowPanel(g,{...m,glass:m.windscreen||m.glass},[[-.754,.961,1.080],[0,.975,1.107],[.754,.961,1.080],[.647,1.337,.405],[0,1.366,.409],[-.647,1.337,.405]],.017,.058);
    const backlight=windowPanel(g,m,[[.742,.992,-1.573],[0,1.007,-1.603],[-.742,.992,-1.573],[-.640,1.342,-.806],[0,1.373,-.812],[.640,1.342,-.806]],.023,.073,{bow:.007});
    backlight.position.set(0,-.004,.002);
    for (const side of [-1, 1]) {
      const xb=side*.807,xt=side*.691,mirror=p=>[p[0]*side,p[1],p[2]];
      windowPanel(g,m,[[xb,.976,1.010],[xb,.975,-.269],[xt,1.354,-.255],[side*.681,1.334,.327]],.033,.050);
      windowPanel(g,m,[[xb,.976,-.330],[side*.806,.987,-1.148],[side*.697,1.321,-.859],[xt,1.355,-.332]],.031,.057);
      windowPanel(g,m,[[side*.803,.988,-1.177],[side*.799,1.001,-1.495],[side*.697,1.309,-.899]],.034,.050);
      surface(g,m.paint,6,94,(u,v)=>beltPoint(side,THREE.MathUtils.lerp(-1.583,1.02,v),u),side<0);
      ribbon(m.paint,[[.805,.963,1.068],[.749,1.194,.735],[.680,1.345,.357]].map(mirror),[[.754,.961,1.081],[.704,1.190,.771],[.641,1.339,.408]].map(mirror),.008);
      ribbon(m.paint,[[.800,.993,-1.570],[.742,1.185,-1.180],[.670,1.349,-.783]].map(mirror),[[.741,.991,-1.573],[.685,1.178,-1.183],[.638,1.342,-.807]].map(mirror),.013);
      // The sedan has a broad stamped C-pillar around the fixed quarter glass.
      // It joins the backlight flange to the side window, rather than leaving
      // the side profile as a thin painted rail around a transparent wedge.
      ribbon(m.paint,[[.800,.993,-1.570],[.742,1.185,-1.180],[.670,1.349,-.783]].map(mirror),[[.799,1.001,-1.495],[.750,1.177,-1.134],[.697,1.309,-.899]].map(mirror),.010);
      ribbon(m.paint,[[.680,1.345,.357],[.704,1.382,-.165],[.696,1.371,-.543],[.670,1.349,-.783]].map(mirror),[[.641,1.339,.405],[.678,1.377,-.165],[.670,1.365,-.543],[.638,1.342,-.807]].map(mirror),.008);
      ribbon(m.glossBlack||m.black,[[.807,.975,-.271],[.748,1.18,-.271],[.692,1.356,-.261]].map(mirror),[[.807,.975,-.330],[.748,1.18,-.336],[.692,1.356,-.336]].map(mirror),.001);
      curvedLine(g,m.black,[[side*.805,.990,-1.166],[side*.752,1.174,-1.014],[side*.696,1.316,-.880]],.007,true);
      curvedLine(g,m.black,[[xb,.976,1.016],[xb,.975,-.25],[side*.803,.988,-1.178],[side*.799,1.001,-1.495]],.004,true);
      // The sedan uses a brazed roof-to-body joint without an applied roof
      // molding. Its painted shoulder supplies the highlight on this edge.
      const hoodSeam=Array.from({length:58},(_,i)=>{const z=THREE.MathUtils.lerp(1.083,2.273,i/57);return [side*hoodWidth(z),z];});
      topSeam(hoodSeam);
      sideSeam(side,[[.974,1.019],[.75,.986],[.42,.920],[.322,.827],[.308,-.24],[.51,-.292],[.805,-.295],[.975,-.295]]);
      sideSeam(side,[[.975,-.327],[.969,-1.44],[.844,-1.385],[.729,-1.139],[.552,-1.012],[.325,-.979],[.308,-.273]]);
      for (const z of handleCenters) {
        surface(g,m.paint,16,40,(u,v)=>{
          const a=u*Math.PI*2,t=v*2-1,zz=z+t*.092,end=clamp((Math.abs(t)-.82)/.18,0,1),cap=Math.sqrt(Math.max(0,1-end*end));
          const y=.891+Math.sin(a)*.014*cap,p=sidePoint(side,y,zz,0);
          p[0]+=side*(.003+.024*Math.sin(v*Math.PI)+Math.cos(a)*.013*cap);return p;
        },side<0);
        // The access system uses a flush touchpad and a concealed key slot.
        // A narrow rear cap division replaces the old visible block edge.
        surface(g,m.dark,2,12,(u,v)=>sidePoint(side,.881+v*.020,z-.071+(u-.5)*.0018,.014+.002*Math.sin(v*Math.PI)),side>0);
        if(z>-.5)surface(g,m.glossBlack||m.black,2,8,(u,v)=>sidePoint(side,.898+(u-.5)*.004,z+.045+(v-.5)*.022,.026),side>0);
      }
      // Sport's rocker garnish has a shaped lower edge and rising end
      // returns. A straight black rectangular rail made the sedan appear
      // slab-sided. The upper painted shoulder meets the existing door skin.
      const rockerPoint=(z,a)=>{
        const end=1-THREE.MathUtils.smoothstep(Math.min(z+1.071,.969-z),0,.18),c=Math.cos(a),s=Math.sin(a);
        const y=.298+.020*end+Math.sign(s)*Math.abs(s)**.52*(.031+.006*end);
        const x=.873+Math.sign(c)*Math.abs(c)**.48*(.029-.008*end);
        return [side*x,y,z];
      };
      const rocker=surface(g,m.glossBlack||m.black,52,16,(u,v)=>rockerPoint(THREE.MathUtils.lerp(-1.071,.969,u),v*Math.PI*2),side<0);rocker.name='civic-sport-sculpted-rocker-'+(side>0?'left':'right');
      for(const [z,reverse] of [[-1.071,side<0],[.969,side>0]])polygon(g,m.black,Array.from({length:17},(_,i)=>rockerPoint(z,(reverse?-1:1)*i*Math.PI/8)));
      // Gloss-black, door-mounted Sport mirrors; no Touring-only indicator.
      ribbon(m.black,[[.797,.984,.854],[.858,1.016,.824],[.916,1.026,.815]].map(mirror),[[.810,.969,.820],[.866,.990,.790],[.916,1.008,.786]].map(mirror),.004);
      const mirrorGroup=new THREE.Group();mirrorGroup.position.set(side*.9180613,1.050,.801);mirrorGroup.rotation.y=-side*.15;g.add(mirrorGroup);
      const mirrorGeo=new THREE.SphereGeometry(1,24,14);const mirrorPos=mirrorGeo.attributes.position;
      for(let i=0;i<mirrorPos.count;i++){const x=mirrorPos.getX(i),y=mirrorPos.getY(i),z=mirrorPos.getZ(i);mirrorPos.setXYZ(i,x*.121,(y*.056)*(1-.12*z),z<-.25?-.046:z*.098);}
      mirrorGeo.computeVertexNormals();finish(new THREE.Mesh(mirrorGeo,m.glossBlack||m.black),mirrorGroup);
      const mirrorFace=roundedBox(mirrorGroup,m.chrome,0,0,-.048,.189,.073,.006,.020);mirrorFace.rotation.z=side*.045;
      for (const az of [f, r]) {
        surface(g,m.paint,48,5,(u,v)=>{
          const a=Math.PI*u,radius=.365+.029*v,y=.334+Math.sin(a)*radius,z=az+Math.cos(a)*radius,p=sidePoint(side,y,z,.0005);
          p[0]=THREE.MathUtils.lerp(side*.900,p[0],v);return p;
        },side<0);
        // The molded wheel tub has a roof and an inboard wall. A narrow
        // semicircular lip alone left daylight and the bright damper visible
        // through the arch, even when viewed from the side at normal height.
        const tub=surface(g,m.black,52,10,(u,v)=>{
          const a=THREE.MathUtils.lerp(-.175,Math.PI+.175,u),radius=.391-.026*v;
          return [side*THREE.MathUtils.lerp(.572,.899,v),.334+Math.sin(a)*radius,az+Math.cos(a)*radius];
        },side>0);
        tub.name='civic-'+(az>0?'front':'rear')+'-'+(side>0?'left':'right')+'-wheel-tub';
        const wall=Array.from({length:53},(_,i)=>{const a=THREE.MathUtils.lerp(-.175,Math.PI+.175,i/52);return [side*.573,.334+Math.sin(a)*.391,az+Math.cos(a)*.391];});
        polygon(g,m.black,wall);
      }
      // Angular lamp housings wrap into the fender instead of forming a rectangular light bar.
      const sxp = x => side * x;
      const lamp=[[.413,.706],[.734,.687],[.850,.711],[.867,.758],[.807,.782],[.444,.777]].map(([x,y])=>[sxp(x),y,front]);
      const lampOutline=roundedOutline(lamp,.014);apertures.push(xy(lampOutline));
      recessedOpening(g,m.black,m.black,xy(lampOutline),faceSample,.034,.065);
      frontLamp.patch(m.black,lampOutline,-.032);
      for(const [cx,cy,w] of [[.490,.728,.086],[.601,.726,.110],[.716,.728,.097]]){
        // Wide rectangular reflector troughs sit behind the running-light
        // guide. Rounded rectangular sections avoid the three circular
        // projector rings that were unlike this Civic's factory lamps.
        surface(g,cx===.601?m.chrome:m.headlampReflector,32,8,(u,v)=>{
          const a=u*Math.PI*2,c=Math.cos(a),s=Math.sin(a),rx=Math.sign(c)*Math.abs(c)**.48*w*.5,ry=Math.sign(s)*Math.abs(s)**.64*.018;
          return [sxp(cx+rx*v),cy+ry*v,front-.029+.025*v*v];
        },side>0);
        frontLamp.patch(m.dark,roundedOutline([[sxp(cx-w*.29),cy-.008,front],[sxp(cx+w*.29),cy-.008,front],[sxp(cx+w*.29),cy+.008,front],[sxp(cx-w*.29),cy+.008,front]],.004),-.019);
        // The center unit is the high beam: its darker pupil remains visible
        // when the two flanking low-beam reflector units are switched on.
        frontLamp.patch(cx===.601?m.dark:m.headlampCore,roundedOutline([[sxp(cx-w*.17),cy-.002,front],[sxp(cx+w*.17),cy-.002,front],[sxp(cx+w*.17),cy+.003,front],[sxp(cx-w*.17),cy+.003,front]],.002),-.016);
        for(const direction of [-1,1])flatGuide(frontLamp,m.dark,[[sxp(cx+direction*w*.39),cy-.020,front],[sxp(cx+direction*w*.36),cy+.020,front]],.0010,-.003);
      }
      flatGuide(frontLamp,m.white,[[sxp(.451),.769,front],[sxp(.789),.772,front],[sxp(.835),.753,front],[sxp(.820),.721,front]],.0034,.011);
      frontLamp.patch(m.amber,[[sxp(.820),.711,front],[sxp(.849),.720,front],[sxp(.857),.750,front],[sxp(.839),.750,front]],.010);
      frontLamp.patch(m.lens,roundedOutline(lamp,.016),.019);
      const vent=roundedOutline([[sxp(.673),.370,0],[sxp(.830),.386,0],[sxp(.839),.561,0],[sxp(.601),.578,0]],.025);
      apertures.push(xy(vent));recessedOpening(g,m.black,m.black,xy(vent),faceSample,.043,.13);
      frontLamp.patch(m.dark,roundedOutline([[sxp(.685),.391,front],[sxp(.811),.401,front],[sxp(.816),.546,front],[sxp(.630),.555,front]],.019),-.028);
      for(const [y,inner] of [[.427,.675],[.481,.651]])flatGuide(frontLamp,m.black,[[sxp(inner),y,front],[sxp(.802),y+.004,front]],.0032,-.019);
      // Two actual lamp apertures follow the trunk division. Their red upper
      // guides and outer descending leg are distinct from the clear optical
      // chambers; a row of black-and-silver bars is not this sedan's lamp.
      const lampPoint=([x,y])=>[sxp(x),y,tail];
      const outerLamp=roundedOutline([[.504,.901],[.730,.916],[.831,.898],[.863,.854],[.823,.761],[.519,.779]].map(lampPoint),.010);
      const innerLamp=roundedOutline([[.338,.884],[.484,.900],[.502,.788],[.444,.814]].map(lampPoint),.008);
      for(const outline of [outerLamp,innerLamp]){rearApertures.push(xy(outline));rearReveal(outline);}
      const clearChamber=roundedOutline([[.533,.877],[.806,.886],[.829,.841],[.803,.786],[.533,.797]].map(lampPoint),.010);
      rearPatch(m.redPaint,outerLamp,[clearChamber],.003);
      rearPatch(m.dark,clearChamber,[],-.013);
      // Fine folded reflector faces retain the broad transparent chamber.
      // Its facets are shallow and unoutlined, so it no longer reads as a grille.
      surface(g,m.satinMetal||m.chrome,48,12,(u,v)=>{
        const x=THREE.MathUtils.lerp(.540,.808,u),bottom=.798-.009*u,top=.875+.009*u;
        return [sxp(x),THREE.MathUtils.lerp(bottom,top,v),tail+.009-.0015*Math.sin(u*Math.PI*12)**2-.00035*Math.sin(v*Math.PI*3)**2];
      },side<0);
      const indicatorX=.730;
      surface(g,m.chrome,40,8,(u,v)=>{const a=u*Math.PI*2;return [sxp(indicatorX+.036*Math.cos(a)*v),.828+.029*Math.sin(a)*v,tail+.021-.027*v*v];},side<0);
      // One amber incandescent indicator bulb sits behind the clear outer
      // chamber. It is passive until turn-indicator controls are implemented.
      const indicator=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),m.civicIndicatorBulb);indicator.scale.set(.011,.014,.009);finish(indicator,g,sxp(indicatorX),.828,tail-.002);
      cylinder(g,m.satinMetal||m.chrome,sxp(indicatorX),.810,tail+.004,.006,.014,'y',12);
      flatGuide(rearLamp,m.red,[[sxp(.517),.893,tail],[sxp(.724),.906,tail],[sxp(.819),.891,tail],[sxp(.848),.851,tail],[sxp(.815),.774,tail]],.0085,.012);
      flatGuide(rearLamp,m.red,[[sxp(.521),.884,tail],[sxp(.723),.898,tail],[sxp(.810),.881,tail]],.0035,.014);
      rearPatch(m.redLens||m.lens,outerLamp,[clearChamber],.018);
      // Reverse bulbs live in the clear trunk-mounted compartments. Their
      // shared illumination material stays independent of headlamps and brakes.
      const reverseChamber=roundedOutline([[.374,.860],[.473,.876],[.488,.811],[.446,.825]].map(lampPoint),.006);
      rearPatch(m.redPaint,innerLamp,[reverseChamber],.003);
      rearPatch(m.dark,reverseChamber,[],-.015);
      rearPatch(m.reverse,reverseChamber.map(([x,y,z])=>[sxp(.443)+(x-sxp(.443))*.92,.846+(y-.846)*.91,z]),[],-.004);
      for(let line=0;line<4;line++)flatGuide(rearLamp,m.chrome,[[sxp(.420+line*.015),.837,tail],[sxp(.419+line*.015),.865,tail]],.00055,.002);
      flatGuide(rearLamp,m.red,[[sxp(.350),.882,tail],[sxp(.480),.893,tail]],.0055,.011);
      rearPatch(m.redLens||m.lens,innerLamp,[reverseChamber],.018);
      rearPatch(m.lens,outerLamp,[],.022);rearPatch(m.lens,innerLamp,[],.022);
      // The outer lens continues onto the quarter, tapering forward into the
      // shoulder. It is a shallow molded cover with ruby guides, not another
      // rectangular lamp pasted to the side of the car.
      const wrapOutline=roundedOutline([[tail+.001,.895,0],[-2.205,.918,0],[-2.052,.925,0],[-2.083,.892,0],[-2.205,.817,0],[tail+.001,.764,0]],.006,6);
      const sideLensPatch=(material,outline,outset)=>{
        const mesh=perforatedFace(g,material,outline.map(([z,y])=>[z,y]),[],(z,y)=>sidePoint(side,y,z,outset),.016);
        if(side>0){const ids=mesh.geometry.index.array;for(let i=0;i<ids.length;i+=3)[ids[i+1],ids[i+2]]=[ids[i+2],ids[i+1]];mesh.geometry.computeVertexNormals();}
        return mesh;
      };
      sideLensPatch(m.black,wrapOutline,.003);
      const rubyOutline=wrapOutline.map(([z,y])=>[-2.225+(z+2.225)*.975,.850+(y-.850)*.975]);
      sideLensPatch(m.dark,rubyOutline,.005);
      const wrapGuide=(points,width)=>{
        const curve=new THREE.CatmullRomCurve3(points.map(([z,y])=>v3(z,y,0)));
        surface(g,m.red,2,52,(u,v)=>{const p=curve.getPoint(v),t=curve.getTangent(v),d=(u*2-1)*width;return sidePoint(side,p.y+t.x*d,p.x-t.y*d,.010);},side<0);
      };
      wrapGuide([[tail+.003,.886],[-2.207,.909],[-2.081,.918]],.0035);
      wrapGuide([[tail+.006,.777],[-2.205,.829],[-2.087,.902]],.0032);
      sideLensPatch(m.redLens||m.lens,rubyOutline,.014);
      const rearCorner=new THREE.CatmullRomCurve3([[side*.835,.895,0],[side*.861,.854,0],[side*.825,.768,0]].map(p=>v3(...p)));
      for(const [material,outset] of [[m.redPaint,.008],[m.redLens||m.lens,.021]])surface(g,material,8,32,(u,v)=>{
        const a=rearCorner.getPoint(v),b=sidePoint(side,a.y,tail+.001,outset*.67);a.z=tail-outset;return a.lerp(v3(...b),u).toArray();
      },side<0);
      surface(g,m.red,12,3,(u,v)=>{const y=.888+(v-.5)*.007,b=sidePoint(side,y,tail+.001,.011);return [THREE.MathUtils.lerp(side*.825,b[0],u),y,THREE.MathUtils.lerp(tail-.012,b[2],u)];},side>0);
    }
    const hoodFrontHalf=hoodWidth(2.273);
    topSeam(Array.from({length:65},(_,i)=>{const x=THREE.MathUtils.lerp(-hoodFrontHalf,hoodFrontHalf,i/64);return [x,2.273+.006*(1-(x/hoodFrontHalf)**2)];}),.0015);
    // Lamp and grille apertures must remain disjoint for a valid fascia
    // triangulation; the inner lamp corners taper toward this narrow grille.
    const upper=roundedOutline([[-.271,.646,0],[.271,.646,0],[.358,.668,0],[.402,.707,0],[.422,.755,0],[-.422,.755,0],[-.402,.707,0],[-.358,.668,0]],.016);
    apertures.push(xy(upper));recessedOpening(g,m.dark,m.black,xy(upper),faceSample,.025,.05);
    // The upper grille widens into thin black wings beneath the headlamps,
    // instead of floating as a small isolated trapezoid in a painted wall.
    for(let row=0;row<3;row++){
      const y=.660+row*.032,span=.292+row*.042;
      frontLamp.strip(m.dark,[[-span,y,front],[0,y-.003,front],[span,y,front]],.0032);
    }
    for(let col=-7;col<=7;col++){
      const x=col*.049,bottom=.651+.035*THREE.MathUtils.smoothstep(Math.abs(x),.255,.357);
      frontLamp.strip(m.black,[[x,bottom,front],[x,.744,front]],.0017);
    }
    for(const side of [-1,1])frontLamp.patch(m.glossBlack||m.black,[[side*.355,.708,front],[side*.410,.710,front],[side*.440,.776,front],[side*.422,.755,front]],.005);
    const lower=roundedOutline([[-.558,.348,0],[.558,.348,0],[.482,.559,0],[-.482,.559,0]],.027);
    apertures.push(xy(lower));recessedOpening(g,m.dark,m.black,xy(lower),faceSample,.040,.045);
    for(let row=0;row<6;row++){const y=.365+row*.034,span=.539-row*.0108;frontLamp.strip(m.dark,[[-span,y,front],[0,y+.002,front],[span,y,front]],.0044);}
    for(let i=-10;i<=10;i++){const x=i*.048;frontLamp.strip(m.black,[[x,.354,front],[x,.548,front]],.0020);}
    // Close against the actual convex side/rolled-shoulder edge, including
    // its mid-height bulge. A straight vertical edge leaves a visible slit.
    const sideEdge=v=>[.868-.018*(1-v)+.022*Math.sin(v*Math.PI),THREE.MathUtils.lerp(.277,.743,v)];
    const outer=[[-.850,.277],[.850,.277]];
    for(let i=1;i<=10;i++)outer.push(sideEdge(i/10));
    for(let i=1;i<=8;i++){const a=(1-i/8)*Math.PI/2;outer.push([.821+.047*Math.sin(a),.743+.047*Math.cos(a)]);}
    for(let i=1;i<=22;i++){const x=.821*(1-i/11);outer.push([x,.790+.031*(1-(x/.821)**2)]);}
    for(let i=1;i<=8;i++){const a=i/8*Math.PI/2;outer.push([-(.821+.047*Math.sin(a)),.743+.047*Math.cos(a)]);}
    for(let i=9;i>=1;i--){const [x,y]=sideEdge(i/10);outer.push([-x,y]);}
    perforatedFace(g,m.paint,outer,apertures,faceSample);
    // One continuous molded front lip curls upward at its outer ends. The
    // curved cross-section supplies a real highlighted edge and dark return,
    // with the same final nose map applied to its fascia and lamp surrounds.
    const lipPoint=(x,a)=>{
      const edge=THREE.MathUtils.smoothstep(Math.abs(x),.62,.855),c=Math.cos(a),s=Math.sin(a);
      return [x,.303+.025*edge+Math.sign(s)*Math.abs(s)**.56*.014,front+.004+Math.sign(c)*Math.abs(c)**.48*(.031-.009*edge)];
    };
    const lip=surface(g,m.glossBlack||m.black,84,16,(u,v)=>lipPoint((u*2-1)*.859,v*Math.PI*2));lip.name='civic-sport-continuous-front-lip';
    for(const side of [-1,1])polygon(g,m.black,Array.from({length:17},(_,i)=>lipPoint(side*.859,side*i*Math.PI/8)));
    // Replace the closed face so the grille/lamp reveals have real depth.
    const oldCap=frontSkin.at(-1);oldCap.removeFromParent();oldCap.geometry.dispose();
    // Sample the rear closure onto the same convex edge as the quarter panel;
    // the original constant-width end cap left narrow daylight slits beside it.
    const rearTop=stations[0][2],rearShoulder=rearTop-.047,rearOuter=[[-.850,.277],[.850,.277]];
    for(let i=1;i<=12;i++){const h=i/12;rearOuter.push([.868-.018*(1-h)+.022*Math.sin(h*Math.PI),THREE.MathUtils.lerp(.277,rearShoulder,h)]);}
    for(let i=1;i<=8;i++){const a=(1-i/8)*Math.PI/2;rearOuter.push([.821+.047*Math.sin(a),rearShoulder+.047*Math.cos(a)]);}
    for(let i=1;i<=26;i++){const x=.821*(1-i/13);rearOuter.push([x,rearTop+.031*(1-(x/.821)**2)]);}
    for(let i=1;i<=8;i++){const a=i/8*Math.PI/2;rearOuter.push([-(.821+.047*Math.sin(a)),rearShoulder+.047*Math.cos(a)]);}
    for(let i=11;i>=1;i--){const h=i/12;rearOuter.push([-(.868-.018*(1-h)+.022*Math.sin(h*Math.PI)),THREE.MathUtils.lerp(.277,rearShoulder,h)]);}
    const plateWell=roundedOutline([[-.410,.747,tail],[-.325,.575,tail],[.325,.575,tail],[.410,.747,tail]],.022);
    const rearBumperDepth=(x,y)=>.029*Math.exp(-(((y-.431)/.139)**2))*(1-THREE.MathUtils.smoothstep(Math.abs(x),.755,.868));
    const rearFacePoint=(x,y)=>[x,y,tail-rearBumperDepth(x,y)];
    for(const side of [-1,1]){
      const outline=roundedOutline([[side*.6435,.4445,0],[side*.8325,.4445,0],[side*.8325,.4675,0],[side*.6435,.4675,0]],.006);
      for(const [material,scale,offset] of [[m.black,1,.003],[m.redPaint,.94,.005]]){
        const shape=xy(outline.map(([x,y,z])=>[side*.738+(x-side*.738)*scale,.456+(y-.456)*scale,z]));
        const patch=perforatedFace(g,material,shape,[],(x,y)=>{const p=rearFacePoint(x,y);p[2]-=offset;return p;},.04),ids=patch.geometry.index.array;
        for(let i=0;i<ids.length;i+=3)[ids[i+1],ids[i+2]]=[ids[i+2],ids[i+1]];patch.geometry.computeVertexNormals();
      }
    }
    const rearClosure=perforatedFace(g,m.paint,rearOuter,[xy(plateWell),...rearApertures],rearFacePoint);
    const rearIds=rearClosure.geometry.index.array;for(let i=0;i<rearIds.length;i+=3)[rearIds[i+1],rearIds[i+2]]=[rearIds[i+2],rearIds[i+1]];rearClosure.geometry.computeVertexNormals();
    const oldRearCap=frontSkin.at(-2);oldRearCap.removeFromParent();oldRearCap.geometry.dispose();
    const rearSkin=frontSkinProjector(g,[rearClosure],-1);
    const rearSeam=(points,width=.0016)=>{
      const curve=new THREE.CatmullRomCurve3(points.map(([x,y])=>v3(x,y,tail))),count=Math.ceil(curve.getLength()/.010);
      return surface(g,m.dark,2,count,(u,v)=>{const p=curve.getPoint(v),t=curve.getTangent(v),d=(u*2-1)*width;return rearSkin.point([p.x-t.y*d,p.y+t.x*d,tail],.0017);},true);
    };
    // The trunk lid's tapered cut returns beneath the number-plate recess.
    // Keeping that cut and the bumper joint separate gives the rear body its
    // stamped panels, instead of one uninterrupted painted vertical slab.
    rearSeam([[-.495,.894],[-.509,.790],[-.469,.671],[-.397,.568],[-.285,.552],[0,.550],[.285,.552],[.397,.568],[.469,.671],[.509,.790],[.495,.894]],.0015);
    for(const side of [-1,1])rearSeam([[side*.858,.631],[side*.774,.604],[side*.592,.591],[side*.425,.581]],.0014);
    roundedBox(g,m.black,0,.294,tail-.007,1.48,.082,.059,.017);
    const deckPoint=topPoint;
    for(const side of [-1,1])curvedLine(g,m.dark,[[-1.570,.706],[-1.860,.700],[-2.140,.665],[-2.294,.608]].map(([z,x])=>deckPoint(side*x,z,.0024)),.0024,true);
    // The integrated upswept trailing edge is applied to the continuous skin
    // below. A second painted patch here left near-coplanar triangles on the
    // deck and a visibly floating edge at its outer tips.
    const plateInner=plateWell.map(([x,y])=>[x*.94,.661+(y-.661)*.96,tail+.052]);
    const wellSteps=plateWell.length*2,wellRings=10;
    const well=surface(g,m.paint,wellSteps,wellRings,(u,v)=>{
      const f=u*plateWell.length,i=Math.floor(f)%plateWell.length,j=(i+1)%plateWell.length,t=f-Math.floor(f);
      const a=v3(...plateWell[i]).lerp(v3(...plateWell[j]),t),b=v3(...plateInner[i]).lerp(v3(...plateInner[j]),t),outer=rearFacePoint(a.x,a.y);
      const depth=v*v*(3-2*v);return [THREE.MathUtils.lerp(a.x,b.x,v),THREE.MathUtils.lerp(a.y,b.y,v),THREE.MathUtils.lerp(outer[2],b.z,depth)];
    },true);
    const wellNormals=well.geometry.attributes.normal;
    for(let ring=0;ring<=wellRings;ring++){
      const first=ring*(wellSteps+1),last=first+wellSteps,n=v3().fromBufferAttribute(wellNormals,first).add(v3().fromBufferAttribute(wellNormals,last)).normalize();
      wellNormals.setXYZ(first,n.x,n.y,n.z);wellNormals.setXYZ(last,n.x,n.y,n.z);
    }
    rearLamp.patch(m.paint,plateInner,-.052);
    rearLamp.patch(m.black,roundedOutline([[-.1645,.7422],[.1645,.7422],[.1645,.5778],[-.1645,.5778]].map(([x,y])=>[x,y,tail]),.006),-.043);
    rearLamp.patch(m.badge,[[-.1525,.7362,tail],[.1525,.7362,tail],[.1525,.5838,tail],[-.1525,.5838,tail]],-.039);
    rearLamp.patch(m.black,[[-.084,.746,tail],[.084,.746,tail],[.069,.728,tail],[-.069,.728,tail]],.009);
    cylinder(g, m.chrome, -0.612, 0.274, tail - 0.042, 0.049, 0.09, 'z', 24);
    cylinder(g, m.dark, -0.612, 0.274, tail - 0.091, 0.037, 0.008, 'z', 24);
    view._hondaBadge(g, 0, .718, front+.031, .077, false);
    view._hondaBadge(g,0,.881,tail-.028,.078,true);
    const label = new THREE.Group(); label.rotation.y = Math.PI; label.position.z = tail - 0.029; g.add(label);
    frontText(label,'CIVIC',-.530,.927,.002,.182,.031,'#c0c8c9');
    frontText(label,'SPORT',.530,.927,.002,.164,.028,'#babfc0');
    for(const side of [-1,1]){
      line(g,m.black,[side*.164,.983,1.070],[side*.356,1.006,1.025],.0035);
      const blade=roundedBox(g,m.black,side*.367,1.009,1.021,side>0?.555:.505,.008,.012,.003);blade.rotation.y=-side*.085;blade.rotation.z=side*.025;
    }
    // A molded fin has curved flanks and a narrow trailing edge, rather than
    // the conspicuous extruded triangular prism in the previous model.
    surface(g,m.paint,24,32,(u,v)=>{
      const z=THREE.MathUtils.lerp(-.744,-.548,v),a=u*Math.PI*2,base=interpolate(roofStations,z,2)+.028;
      const h=.071*Math.pow(Math.sin(Math.PI*v),1.65),half=.025*Math.pow(Math.sin(Math.PI*v),.72);
      return [half*Math.sin(a),base+h*(1+Math.cos(a))*.5,z];
    },true);
    const fuelDoor=roundedOutline([[0,.819,-1.642],[0,.946,-1.642],[0,.955,-1.825],[0,.826,-1.841]],.026,7);
    sideSeam(1,fuelDoor.map(([,y,z])=>[y,z]),.0015,true);
    // Roll the outer roof flange down into the window surround. Its earlier
    // crown was higher than the sheet roof and made two small projecting ears.
    for(const mesh of g.children){if(mesh.material!==m.paint||!mesh.geometry)continue;const p=mesh.geometry.attributes.position;let edited=false;for(let i=0;i<p.count;i++){const x=Math.abs(p.getX(i)),y=p.getY(i);if(x>.675&&x<.74&&y>1.338){const top=1.376-(x-.675)*.475;if(y>top){p.setY(i,top);edited=true;}}}if(edited)mesh.geometry.computeVertexNormals();}
    // Roll the hood's leading edge continuously into the nose. The same
    // deformation is applied to the fascia and its lamp covers, preserving
    // real reveals and preventing the old hard horizontal shelf highlight.
    g.updateMatrixWorld(true);
    const bodyInverse=g.matrixWorld.clone().invert();
    const civicEndPoint=point=>{
      const q=point.clone();
      if(q.z>1.910&&q.y<.790){
        // Concave bumper cheeks connect the lamp shelf to the lower corner
        // inserts, as on the 2022–24 Sport. The map also moves the actual
        // apertures and glazing, so there is no layered panel intersection.
        const end=THREE.MathUtils.smoothstep(q.z,1.910,2.220),cheek=Math.exp(-(((Math.abs(q.x)-.670)/.185)**2+((q.y-.612)/.079)**2));
        q.z-=.038*end*cheek;
      }
      if(q.z<-1.91&&q.y<.493){
        const rear=1-THREE.MathUtils.smoothstep(q.z,-2.34,-1.91),low=1-THREE.MathUtils.smoothstep(q.y,.283,.493);
        q.z+=.085*rear*low;q.x*=1-.022*rear*low;
      }
      if(q.z<-2.185&&q.y>.80){
        const t=clamp((-q.z-2.185)/.163,0,1),sideFade=1-THREE.MathUtils.smoothstep(Math.abs(q.x),.680,.868);
        const top=topPoint(q.x,Math.max(tail,q.z))[1],heightFade=THREE.MathUtils.smoothstep(q.y,top-.080,top-.008);
        q.y+=.021*t*t*sideFade*heightFade;return q;
      }
      if(q.z<front-.068||q.y<.70||q.y>1.05)return q;
      const radius=.062,half=.821,ax=Math.abs(q.x),a=Math.max(0,ax-half);
      const edgeTop=a>0?.790-.047+Math.sqrt(Math.max(0,.047*.047-a*a)):.790+.031*(1-(q.x/half)**2);
      const zOffset=Math.max(0,q.z-front),yOffset=q.z<=front?Math.max(0,q.y-topPoint(q.x,q.z)[1]):0;
      const outset=Math.max(zOffset,yOffset),dx=Math.min(q.z,front)-(front-radius),dy=q.y-yOffset-(edgeTop-radius),distance=Math.hypot(dx,dy);
      if(dx>0&&dy>0&&distance>radius){q.z=front-radius+dx/distance*(radius+outset);q.y=edgeTop-radius+dy/distance*(radius+outset);}
      return q;
    };
    g.traverse(mesh=>{
      if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.geometry)return;
      const matrix=new THREE.Matrix4().multiplyMatrices(bodyInverse,mesh.matrixWorld),inverse=matrix.clone().invert(),p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
      const normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),inverseNormalMatrix=new THREE.Matrix3().getNormalMatrix(inverse);
      let edited=false;
      for(let i=0;i<p.count;i++){
        const q=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix),warped=civicEndPoint(q);
        if(warped.distanceToSquared(q)<1e-18)continue;
        // Carry the surface normal through the same map using two local
        // tangents. Reaveraging an entire refined flank to roll its distant
        // bonnet corner destroyed the smooth shoulder/cup normals above.
        if(n){
          const normal=new THREE.Vector3().fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize(),axis=Math.abs(normal.y)<.8?UP:X_AXIS;
          const tangentA=v3().crossVectors(axis,normal).normalize(),tangentB=v3().crossVectors(normal,tangentA).normalize(),epsilon=.000020;
          const a=civicEndPoint(q.clone().addScaledVector(tangentA,epsilon)).sub(civicEndPoint(q.clone().addScaledVector(tangentA,-epsilon)));
          const b=civicEndPoint(q.clone().addScaledVector(tangentB,epsilon)).sub(civicEndPoint(q.clone().addScaledVector(tangentB,-epsilon)));
          const next=v3().crossVectors(a,b);
          if(next.lengthSq()>1e-22){next.normalize().applyMatrix3(inverseNormalMatrix).normalize();n.setXYZ(i,next.x,next.y,next.z);}
        }
        warped.applyMatrix4(inverse);p.setXYZ(i,warped.x,warped.y,warped.z);edited=true;
      }
      if(edited){p.needsUpdate=true;if(n)n.needsUpdate=true;mesh.geometry.computeBoundingSphere();}
    });
    // Closed parcel shelf between the rear seat and backlight. It naturally
    // hides the lower seatbacks in exterior views of a closed sedan cabin.
    const shelfPoint=(x,z)=>[x,1.001+(z+1.095)*.027+.004*(1-(x/.74)**2),z];
    surface(g,m.interior,32,18,(u,v)=>{
      const z=THREE.MathUtils.lerp(-1.095,-1.569,v),half=.710+.029*v;return shelfPoint((u*2-1)*half,z);
    });
    polygon(g,m.black,[[-.710,1.001,-1.095],[.710,1.001,-1.095],[.710,.931,-1.095],[-.710,.931,-1.095]]);
    for(const side of [-1,1]){
      const center=shelfPoint(side*.466,-1.320),speaker=new THREE.Mesh(new THREE.CircleGeometry(1,32),m.black);speaker.rotation.x=-Math.PI/2;speaker.scale.set(.113,.080,1);finish(speaker,g,center[0],center[1]+.0015,center[2]);
      for(let slot=-5;slot<=5;slot++){
        const offset=slot*.013,span=.090*Math.sqrt(Math.max(0,1-(offset/.081)**2));
        line(g,m.interior,shelfPoint(side*.466-span,-1.320+offset).map((q,i)=>q+(i===1?.0025:0)),shelfPoint(side*.466+span,-1.320+offset).map((q,i)=>q+(i===1?.0025:0)),.0011);
      }
    }
    profile(g,m.black,[[-1.542,.991],[-1.491,1.045],[-1.319,1.063],[-1.260,1.000]],.219,.006);
    polygon(g,m.red,[[-.091,1.013,-1.532],[-.091,1.044,-1.487],[.091,1.044,-1.487],[.091,1.013,-1.532]]);
    view._interior({ frontZ: 0.30, rearZ: -0.69, floor: 0.31, dashY: 0.917, dashZ: 0.853, width: 1.44, seatY: 0.64,
      rearSeatY:.61,rearBackHeight:.445,rearHeadrest:{width:.215,height:.145,centerWidth:.178,centerHeight:.104,lift:.082},doorCards:false,centerConsole:false });
    // Model-specific door trim closes the wide gap between the old generic
    // cabin slab and the low glass sill. Its rail, fabric panel, pull and
    // armrest follow the Sport cabin instead of exposing exterior paint inside.
    for(const side of [-1,1])for(const rearDoor of [false,true]){
      const start=rearDoor?-1.428:-.274,end=rearDoor?-.338:.997,span=end-start;
      const lowAt=z=>rearDoor?.324+.454*(1-THREE.MathUtils.smoothstep(z,-1.428,-.994)):.316+.087*THREE.MathUtils.smoothstep(z,.818,.997);
      const highAt=z=>interpolate(beltStations,z,2)-.009;
      const cardPoint=(y,z,offset=0)=>{
        const u=clamp((z-start)/span,0,1),armY=.676+.058*u;
        const arm=.033*Math.exp(-(((y-armY)/.040)**2))*Math.sin(u*Math.PI);
        return [side*(.761+.025*THREE.MathUtils.smoothstep(y,.810,.963)-arm-offset),y,z];
      };
      surface(g,m.interior,44,24,(u,v)=>{const z=THREE.MathUtils.lerp(start,end,u),low=lowAt(z);return cardPoint(THREE.MathUtils.lerp(low,highAt(z),v),z);},side<0);
      surface(g,m.black,44,8,(u,v)=>{const z=THREE.MathUtils.lerp(start,end,u);return cardPoint(THREE.MathUtils.lerp(.851,highAt(z),v),z,.0015);},side<0);
      surface(g,m.black,44,4,(u,v)=>{
        const z=THREE.MathUtils.lerp(start,end,u),y=highAt(z);return [side*THREE.MathUtils.lerp(.785,.805,v),y+.003*Math.sin(v*Math.PI),z];
      },side>0);
      const insetStart=rearDoor?-.986:-.190,insetEnd=rearDoor?-.401:.674;
      surface(g,m.upholstery,28,8,(u,v)=>{
        const z=THREE.MathUtils.lerp(insetStart,insetEnd,u),low=.719+.020*u,high=.843+.003*u;
        return cardPoint(THREE.MathUtils.lerp(low,high,v),z,.0024);
      },side<0);
      curvedLine(g,m.glossBlack||m.black,Array.from({length:20},(_,i)=>{const z=THREE.MathUtils.lerp(start+.042,end-.040,i/19);return cardPoint(.851,z,.0040);}),.0040);
      // Platinum-look interior release within a small recessed surround.
      const releaseZ=rearDoor?-.508:.747,releaseY=.852;
      const release=roundedOutline([[0,releaseY-.025,releaseZ-.070],[0,releaseY-.025,releaseZ+.070],[0,releaseY+.025,releaseZ+.070],[0,releaseY+.025,releaseZ-.070]],.013,8);
      polygon(g,m.black,release.map(([,y,z])=>cardPoint(y,z,.004)));
      surface(g,m.satinMetal||m.chrome,release.length*2,3,(u,v)=>{
        const q=u*release.length,i=Math.floor(q)%release.length,j=(i+1)%release.length,t=q-Math.floor(q),a=v3(...release[i]).lerp(v3(...release[j]),t);
        return cardPoint(THREE.MathUtils.lerp(a.y,releaseY+(a.y-releaseY)*.70,v),THREE.MathUtils.lerp(a.z,releaseZ+(a.z-releaseZ)*.87,v),.006+.002*Math.sin(v*Math.PI));
      },side>0);
      const gripZ=releaseZ+.006;
      curvedLine(g,m.chrome,[[releaseY+.009,gripZ-.053],[releaseY+.014,gripZ+.020],[releaseY+.006,gripZ+.048]].map(([y,z])=>cardPoint(y,z,.012)),.0043);
      // The upholstered armrest slopes forward into the switch panel and grab.
      const armStart=rearDoor?-.962:-.184,armEnd=rearDoor?-.457:.681;
      surface(g,m.upholstery,32,10,(u,v)=>{
        const z=THREE.MathUtils.lerp(armStart,armEnd,u),y=.684+.035*u+.007*Math.sin(v*Math.PI),x=THREE.MathUtils.lerp(.698,.749,v);
        return [side*x,y,z];
      },side>0);
      curvedLine(g,m.interior,Array.from({length:24},(_,i)=>{const u=i/23;return [side*.700,.686+.035*u,THREE.MathUtils.lerp(armStart,armEnd,u)];}),.0016);
      const controlsZ=rearDoor?-.550:.516,controlsY=rearDoor?.707:.726;
      const pad=roundedBox(g,m.glossBlack||m.black,side*.715,controlsY,controlsZ,.067,.010,rearDoor?.100:.169,.007);pad.rotation.x=-.048;
      const switchCount=!rearDoor&&side>0?4:1;
      for(let k=0;k<switchCount;k++){
        const x=side*.715+(switchCount>1?(k%2-.5)*.023:0),z=controlsZ+(switchCount>1?(Math.floor(k/2)-.5)*.049:0);
        roundedBox(g,m.black,x,controlsY+.007,z,.019,.007,.034,.0025);
        line(g,m.badge,[x-.004,controlsY+.011,z+.008],[x+.004,controlsY+.011,z+.008],.00055);
      }
      if(!rearDoor&&side>0){cylinder(g,m.black,side*.715,controlsY+.007,controlsZ+.063,.012,.007,'y',16);}
      const pocketStart=rearDoor?-.935:-.145,pocketEnd=rearDoor?-.386:.835;
      surface(g,m.black,28,8,(u,v)=>{const z=THREE.MathUtils.lerp(pocketStart,pocketEnd,u),y=.393+v*.126;return cardPoint(y,z,.004+.017*Math.sin(v*Math.PI));},side<0);
      curvedLine(g,m.black,Array.from({length:24},(_,i)=>{const z=THREE.MathUtils.lerp(pocketStart,pocketEnd,i/23);return cardPoint(.519,z,.006);}),.0042);
      if(!rearDoor){
        const speakerZ=.718,speakerY=.545,disc=Array.from({length:49},(_,i)=>{const a=i*Math.PI/24;return cardPoint(speakerY+Math.sin(a)*.065,speakerZ+Math.cos(a)*.072,.004);});
        polygon(g,m.black,disc);
        for(let row=-5;row<=5;row++){
          const yy=row*.010,half=.064*Math.sqrt(Math.max(0,1-(yy/.064)**2));
          line(g,m.interior,cardPoint(speakerY+yy,speakerZ-half,.005),cardPoint(speakerY+yy,speakerZ+half,.005),.00085);
        }
      }
    }
    // CVT center console: shaped shift boot and lever beside two genuinely
    // recessed cup wells, with the Sport's mode and parking-brake switches.
    const consoleOutline=roundedOutline([[-.133,-.111,0],[.133,-.111,0],[.139,.570,0],[-.139,.570,0]],.028);
    const cupCenters=[[-.061,.201],[-.061,.006]],cupRadius=.039;
    const cupOutlines=cupCenters.map(([x,z])=>Array.from({length:48},(_,i)=>[x+Math.cos(i*Math.PI/24)*cupRadius,z+Math.sin(i*Math.PI/24)*cupRadius]));
    const consoleTop=(x,z)=>[x,.652+.020*THREE.MathUtils.smoothstep(z,.36,.57),z];
    const consoleFace=perforatedFace(g,m.glossBlack||m.black,xy(consoleOutline),cupOutlines,consoleTop,.035),consoleIds=consoleFace.geometry.index.array;
    for(let i=0;i<consoleIds.length;i+=3)[consoleIds[i+1],consoleIds[i+2]]=[consoleIds[i+2],consoleIds[i+1]];consoleFace.geometry.computeVertexNormals();
    surface(g,m.black,consoleOutline.length*2,8,(u,v)=>{
      const q=u*consoleOutline.length,i=Math.floor(q)%consoleOutline.length,j=(i+1)%consoleOutline.length,t=q-Math.floor(q),a=v3(...consoleOutline[i]).lerp(v3(...consoleOutline[j]),t);
      return [a.x*THREE.MathUtils.lerp(.89,1,v),THREE.MathUtils.lerp(.473,consoleTop(a.x,a.y)[1],v),a.y];
    });
    for(const [x,z] of cupCenters){
      surface(g,m.black,48,6,(u,v)=>{const a=u*Math.PI*2,r=.033+.006*v;return [x+Math.cos(a)*r,.586+.066*v,z+Math.sin(a)*r];});
      cylinder(g,m.black,x,.584,z,.033,.004,'y',32);
      surface(g,m.satinMetal||m.chrome,48,3,(u,v)=>{const a=u*Math.PI*2,r=cupRadius+.002*v;return [x+Math.cos(a)*r,.653,z+Math.sin(a)*r];});
      for(const angle of [0,Math.PI*2/3,Math.PI*4/3])roundedBox(g,m.black,x+Math.cos(angle)*.029,.623,z+Math.sin(angle)*.029,.012,.034,.012,.003);
    }
    const shiftX=.065,shiftZ=.361;
    surface(g,m.black,32,12,(u,v)=>{
      const a=u*Math.PI*2,ca=Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.45,sa=Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.45;
      return [shiftX+ca*THREE.MathUtils.lerp(.037,.014,v),.661+v*.059,shiftZ+sa*THREE.MathUtils.lerp(.065,.025,v)];
    },true);
    line(g,m.dark,[shiftX,.716,shiftZ],[shiftX+.006,.779,shiftZ-.006],.009);
    const shiftKnob=new THREE.Mesh(new THREE.SphereGeometry(1,28,18),m.upholstery);shiftKnob.scale.set(.028,.038,.033);finish(shiftKnob,g,shiftX+.006,.789,shiftZ-.006);
    curvedLine(g,m.satinMetal||m.chrome,[[shiftX-.019,.789,shiftZ+.007],[shiftX+.004,.814,shiftZ+.015],[shiftX+.027,.789,shiftZ+.007]],.0022);
    for(const [z,size] of [[.215,.048],[.133,.049],[.065,.036]]){
      roundedBox(g,m.black,.065,.661,z,.058,.009,size,.005);
      roundedBox(g,m.badge,.065,.667,z+.010,.019,.0015,.002,.0005);
    }
    const selectorLabel=new THREE.Group();selectorLabel.position.set(.116,.675,.419);selectorLabel.rotation.x=-Math.PI/2;g.add(selectorLabel);
    for(const [i,letter] of ['P','R','N','D'].entries())frontText(selectorLabel,letter,0,i*.021,.001,.010,.014,'#cad0d1');
    roundedBox(g,m.upholstery,0,.653,-.241,.263,.059,.278,.028);
    roundedBox(g,m.black,0,.658,.667,.259,.012,.145,.011);
    for(const side of [-1,1])roundedBox(g,m.interior,side*.127,.678,.668,.010,.043,.145,.004);
    // A sedan ceiling follows the crowned roof. The shared flat roof option
    // would cross the sloped screen; this lower surface remains wholly inside
    // the existing roof footprint and gives the visible cabin a closed liner.
    surface(g,m.headliner,28,30,(u,v)=>{
      const z=THREE.MathUtils.lerp(-.785,.394,v),t=(u*2-1)*.985;
      return [t*interpolate(roofStations,z,1),interpolate(roofStations,z,2)+.030*(1-t*t)-.034,z];
    });
    for(const side of [-1,1]){
      const visor=roundedBox(g,m.headliner,side*.331,1.316,.309,.313,.015,.126,.006);visor.rotation.x=.055;visor.rotation.z=side*.045;
      line(g,m.interior,[side*.200,1.324,.349],[side*.479,1.324,.349],.0045);
    }
    roundedBox(g,m.interior,0,1.349,.170,.133,.017,.155,.008);
    for(const side of [-1,1])roundedBox(g,m.headliner,side*.034,1.338,.183,.040,.006,.064,.002);
    roundedBox(g,m.black,0,1.226,.533,.222,.061,.031,.011);
    roundedBox(g,m.chrome,0,1.226,.515,.198,.043,.006,.005);
    line(g,m.black,[0,1.252,.546],[0,1.312,.494],.009);
  }
