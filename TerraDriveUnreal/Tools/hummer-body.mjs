// Native refinement fork; preserved browser source is unchanged.
/**
 * Original MY24 GMC HUMMER EV SUV exterior, constructed from GMC's dimensioned
 * side elevation and published photographs. This is not imported OEM CAD.
 * Coordinates: ground datum Y=0, axle midpoint Z=0, nose +Z, driver side +X.
 */
export const HUMMER_MODEL_VERSION = '1.15.0';

export function buildNativeHummer(view, geometry) {
  const { THREE, clamp, v3, finish, box, roundedBox, cylinder, panel, polygon, surface,
    interpolate, perforatedFace, curvedLine, roundedOutline, windowPanel, profile, line } = geometry;
  const g = view.body, m = view.materials, spec = view.spec;
  const wb = spec.wheelbase, frontAxle = wb / 2, rearAxle = -wb / 2;
  const bumperFront = frontAxle + .88138, nose = bumperFront - .168, tail = bumperFront - 4.99872;
  const half = 1.018, outer = 2.1971 / 2, roofHalf = .963, roofTop = 1.948;
  const belt = 1.421, bottom = .497, roofFront = .568, roofRear = -2.335;
  m.rim.color.set('#252b2e'); m.rim.metalness = .72; m.rim.roughness = .34;
  m.hardtop.dispose();
  m.hardtop = new THREE.MeshPhysicalMaterial({color:'#151b21',roughness:.66,metalness:0,
    specularIntensity:.24,clearcoat:.12,clearcoatRoughness:.30,side:THREE.DoubleSide});
  m.hummerAccent = m.satinMetal.clone(); m.hummerAccent.color.set('#b4b7b5'); m.hummerAccent.roughness = .35;
  m.hummerInteriorAccent = m.interior.clone(); m.hummerInteriorAccent.color.set('#a39b8a'); m.hummerInteriorAccent.userData.vehicleInterior = true;
  const accent = m.hummerAccent;

  // Crowned continuous skin and pronounced chamfered wheel apertures. Hummer
  // openings have a flat upper ledge, unlike the circular Jeep/Bronco arches.
  const stations = [[tail, .956, 1.371], [tail + .13, 1.011, 1.421], [-1.68, 1.018, 1.421],
    [-.20, 1.017, 1.421], [.93, 1.018, 1.438], [1.22, 1.010, 1.449], [2.11, 1.008, 1.371], [nose, .966, 1.302]];
  const archHeight = dz => {
    const a = Math.abs(dz);
    if (a >= .647) return bottom;
    if (a <= .347) return 1.001;
    if (a <= .451) return THREE.MathUtils.lerp(1.001, .921, (a - .347) / .104);
    return THREE.MathUtils.lerp(.921, .499, (a - .451) / .196);
  };
  const lowAt = z => Math.max(bottom, archHeight(z - frontAxle), archHeight(z - rearAxle),
    bottom + .520 * THREE.MathUtils.smoothstep(z, frontAxle + .43, nose - .10));
  const sideX = (y, z) => {
    const t = clamp((y - bottom) / (interpolate(stations, z, 2) - bottom), 0, 1);
    const bodyWidth = interpolate(stations, z, 1);
    const door = THREE.MathUtils.smoothstep(z, -1.14, -.92) * (1 - THREE.MathUtils.smoothstep(z, .84, 1.06));
    const panel = THREE.MathUtils.smoothstep(y, .527, .622) * (1 - THREE.MathUtils.smoothstep(y, 1.30, 1.402));
    // The doors sit within pronounced front and rear stamped haunches. A
    // broad, shallow dishing and the swept rear shoulder break up a flat slab;
    // these are contours in the skin, not trim lines laid over it.
    const rearEdge = -.980 - .154 * THREE.MathUtils.smoothstep(y, .64, 1.25);
    const rearHaunch = .021 * Math.exp(-(((z - rearEdge + .070) / .165) ** 2)) * panel;
    const frontHaunch = .016 * Math.exp(-(((z - 1.078) / .165) ** 2)) * panel;
    const waist = -.005 * Math.exp(-(((y - .752) / .078) ** 2)) * door;
    return bodyWidth - .034 * (1 - t) + .020 * Math.sin(t * Math.PI) - .019 * Math.exp(-(((t - .22) / .085) ** 2))
      - .012 * door * panel + rearHaunch + frontHaunch + waist;
  };
  const sideColumns=220, sideRows=64;
  let sideSkin;
  for (const side of [-1, 1]) {
    const skin = surface(g, m.paint, sideColumns, sideRows, (u, v) => {
      const z = THREE.MathUtils.lerp(tail, nose, u), y = THREE.MathUtils.lerp(lowAt(z), interpolate(stations, z, 2), v);
      return [side * sideX(y, z), y, z];
    }, side > 0);
    if (side > 0) sideSkin = skin.geometry.attributes.position;
    // Narrow top shoulders leave a real cabin aperture between the body sides.
    surface(g, m.paint, 140, 10, (u, v) => {
      const z = THREE.MathUtils.lerp(tail, nose, u), y = interpolate(stations, z, 2), w = interpolate(stations, z, 1);
      return [side * THREE.MathUtils.lerp(.933, w, v), y + .018 * Math.sin(v * Math.PI), z];
    }, side < 0);
  }
  // Project fine shut lines onto the actual triangulated side, rather than
  // its analytic ideal. At a shallow pressing those surfaces differ enough
  // for a nominal 2 mm line offset to disappear into the sheet intermittently.
  const sheetX = (y, z) => {
    const column = clamp(Math.floor((z - tail) / (nose - tail) * sideColumns), 0, sideColumns-1);
    for (let row = 0; row < sideRows; row++) {
      const a = row * (sideColumns+1) + column, b = a + 1, c = a + sideColumns+1, d = c + 1;
      for (const ids of [[a, b, c], [b, d, c]]) {
        const [ia, ib, ic] = ids, az = sideSkin.getZ(ia), ay = sideSkin.getY(ia);
        const bz = sideSkin.getZ(ib), by = sideSkin.getY(ib), cz = sideSkin.getZ(ic), cy = sideSkin.getY(ic);
        const den = (by - cy) * (az - cz) + (cz - bz) * (ay - cy);
        const wa = ((by - cy) * (z - cz) + (cz - bz) * (y - cy)) / den;
        const wb = ((cy - ay) * (z - cz) + (az - cz) * (y - cy)) / den, wc = 1 - wa - wb;
        if (Math.min(wa, wb, wc) >= -1e-5) return wa * sideSkin.getX(ia) + wb * sideSkin.getX(ib) + wc * sideSkin.getX(ic);
      }
    }
    return sideX(y, z);
  };
  for (const [z, flip] of [[tail, true]]) {
    surface(g, m.paint, 44, 12, (u, v) => {
      const xx = u * 2 - 1, y = THREE.MathUtils.lerp(z > 0 ? 1.048 : bottom, interpolate(stations, z, 2), v);
      return [xx * sideX(y, z), y, z - Math.sign(z) * .039 * Math.abs(xx) ** 5];
    }, flip);
  }

  const hoodPoint = (u, v) => {
    const x = (u * 2 - 1) * THREE.MathUtils.lerp(.941, .960, v), z = THREE.MathUtils.lerp(.928, nose - .012, v);
    const fade = THREE.MathUtils.smoothstep(v, 0, .16) * (1 - THREE.MathUtils.smoothstep(v, .84, 1));
    const shoulder = .038 * Math.exp(-(((Math.abs(x) - .704) / .110) ** 2)) * fade;
    const centerDish = -.012 * Math.exp(-((x / .55) ** 6)) * Math.sin(v * Math.PI) ** 2;
    const y = THREE.MathUtils.lerp(1.462, 1.318, v) + .023 * (1 - (x / .97) ** 2) + shoulder + centerDish;
    return [x, y, z];
  };
  surface(g, m.paint, 54, 48, hoodPoint, true);
  for (const side of [-1, 1]) {
    curvedLine(g, m.dark, Array.from({ length: 49 }, (_, i) => {
      const p = hoodPoint(side > 0 ? 1 : 0, i / 48); return [p[0], p[1] + .0014, p[2]];
    }), .0021);
    // The raised outer cowl meets a dark, inset vent at the windshield base.
    const vent = roundedBox(g, m.black, side * .754, 1.459, 1.035, .220, .012, .126, .023);
    vent.rotation.x = -.10;
    for (let i = 0; i < 6; i++) line(g, m.grille, [side * .754 - .092 + i * .035, 1.469, .994], [side * .754 - .092 + i * .035, 1.469, 1.078], .003);
  }
  curvedLine(g, m.dark, Array.from({ length: 55 }, (_, i) => {
    const p = hoodPoint(i / 54, 1); return [p[0], p[1] + .001, p[2] + .001];
  }), .0020);

  // One curved front sheet surrounds the actual recessed signature aperture.
  // The lamp cells follow that sheet instead of standing on square stacked
  // housings above an uninterrupted painted cap.
  const roundedXY = (points, radius = .028) => roundedOutline(points.map(([x, y]) => [x, y, 0]), radius, 7).map(([x, y]) => [x, y]);
  const denseXY = points => {
    const result = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .035));
      for (let j = 0; j < steps; j++) result.push([THREE.MathUtils.lerp(a[0], b[0], j / steps), THREE.MathUtils.lerp(a[1], b[1], j / steps)]);
    }
    return result;
  };
  const insetOpening = (outline, sample, depth, inset = .06, edgeMaterial = m.black, backing = m.glossBlack) => {
    const contour = denseXY(outline), center = contour.reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0]).map(value => value / contour.length);
    const inner = contour.map(([x, y]) => [THREE.MathUtils.lerp(x, center[0], inset), THREE.MathUtils.lerp(y, center[1], inset)]);
    surface(g, edgeMaterial, contour.length, 7, (u, v) => {
      const i = Math.round(u * contour.length) % contour.length, a = contour[i], b = inner[i];
      const p = sample(THREE.MathUtils.lerp(a[0], b[0], v), THREE.MathUtils.lerp(a[1], b[1], v));
      p[2] -= depth * (.5 - .5 * Math.cos(v * Math.PI)); return p;
    });
    perforatedFace(g, backing, inner, [], (x, y) => { const p = sample(x, y); p[2] -= depth; return p; }, .045);
    return inner;
  };
  const face = (x, y) => [x, y, nose + .014 - .068 * (Math.abs(x) / 1.010) ** 4];
  const faceOuter = roundedXY([[-.959, 1.033], [.959, 1.033], [.994, 1.247], [.960, 1.320], [.5, 1.335], [0, 1.341], [-.5, 1.335], [-.960, 1.320], [-.994, 1.247]], .015);
  const signature = roundedXY([[-.907, 1.134], [.907, 1.134], [.967, 1.185], [.971, 1.292], [.950, 1.311], [-.950, 1.311], [-.971, 1.292], [-.967, 1.185]], .024);
  perforatedFace(g, m.paint, faceOuter, [signature], face, .040).name = 'hummer-formed-front-fascia';
  insetOpening(signature, face, .016, .018, m.glossBlack, m.glossBlack);
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * .252, z = face(x, 1.266)[2];
    roundedBox(g, m.chrome, x, 1.266, z - .006, .237, .049, .012, .004);
    roundedBox(g, m.white, x, 1.266, z + .001, .220, .033, .007, .002);
    // Dark narrow dividers separate the illuminated cell from the black
    // segmented lower grille; the letters remain legible with lamps off.
    curvedLine(g, m.grille, [[x - .117, 1.233, z - .003], [x - .113, 1.157, z - .009]], .0016);
  }
  lettering('HUMMER', 0, 1.266, face(0, 1.266)[2] + .007, 1.34, .028, m.dark);
  for (const y of [1.220, 1.185]) surface(g, m.grille, 64, 1, (u, v) => {
    const x = (u * 2 - 1) * .866, p = face(x, y + (v - .5) * .003); p[2] -= .006; return p;
  });
  for (const side of [-1, 1]) {
    const xx = side * .885, z = face(xx, 1.266)[2];
    roundedBox(g, m.chrome, xx, 1.265, z - .004, .153, .049, .012, .004);
    roundedBox(g, m.white, xx - side * .005, 1.267, z + .003, .122, .023, .007, .002);
    roundedBox(g, m.amber, side * .962, 1.259, face(side * .962, 1.259)[2] + .002, .029, .092, .018, .006);
  }

  // The molded bumper has inset lamp and air openings and a continuous swept
  // outer corner. A formed center skid rolls down and back below the hooks.
  const bumperOutline = roundedXY([[-1.081, .667], [-.891, .549], [-.584, .500], [0, .487], [.584, .500], [.891, .549], [1.081, .667], [1.076, .994], [.998, 1.059], [.685, 1.065], [0, 1.047], [-.685, 1.065], [-.998, 1.059], [-1.076, .994]], .034);
  const bumperFace = (x, y) => [x, y, nose + .112 - .244 * (Math.abs(x) / 1.095) ** 4 - .034 * (1 - clamp((y - .49) / .57, 0, 1)) ** 2];
  const lowerAir = roundedXY([[-.646, .824], [.646, .824], [.675, .982], [-.675, .982]], .027);
  const lowerLamps = [-1, 1].map(side => roundedXY([[side * .720, .885], [side * .966, .889], [side * .985, .995], [side * .734, .992]], .022));
  perforatedFace(g, m.black, bumperOutline, [lowerAir, ...lowerLamps], bumperFace, .042).name = 'hummer-sculpted-bumper-openings';
  const bumperContour = denseXY(bumperOutline);
  surface(g, m.black, bumperContour.length, 10, (u, v) => {
    const [x, y] = bumperContour[Math.round(u * bumperContour.length) % bumperContour.length], p = bumperFace(x, y);
    return [x * (1 - .024 * Math.sin(v * Math.PI / 2)), y + .010 * Math.sin(v * Math.PI), THREE.MathUtils.lerp(p[2], nose - .263, v)];
  });
  insetOpening(lowerAir, bumperFace, .072, .065, m.grille, m.black);
  for (const y of [.851, .886, .921, .953]) surface(g, m.grille, 64, 3, (u, v) => {
    const x = (u * 2 - 1) * .622, p = bumperFace(x, y + (v - .5) * .010); p[2] -= .030 + .004 * Math.sin(v * Math.PI); return p;
  });
  for (const [index, side] of [-1, 1].entries()) {
    const inner = insetOpening(lowerLamps[index], bumperFace, .052, .068, m.black, m.dark);
    const center = [side * .847, .940], contour = denseXY(inner);
    surface(g, m.headlampReflector, contour.length, 10, (u, v) => {
      const edge = contour[Math.round(u * contour.length) % contour.length], x = THREE.MathUtils.lerp(center[0], edge[0], .11 + .89 * v), y = THREE.MathUtils.lerp(center[1], edge[1], .11 + .89 * v);
      const p = bumperFace(x, y); p[2] -= .021 + .028 * (1 - v * v); return p;
    });
    const z = bumperFace(center[0], center[1])[2];
    roundedBox(g, m.headlampCore, center[0], center[1], z - .034, .111, .041, .008, .002);
    perforatedFace(g, m.lens, inner, [], (x, y) => { const p = bumperFace(x, y); p[2] -= .007; return p; }, .025);
  }
  const skidSection = [[.00, .818, nose + .103], [.16, .783, nose + .126], [.48, .635, nose + .085], [.72, .525, nose - .055], [1.00, .431, nose - .312]];
  surface(g, accent, 42, 30, (u, v) => {
    const x = (u * 2 - 1) * (.579 - .069 * v), y = interpolate(skidSection, v, 1), z = interpolate(skidSection, v, 2);
    return [x, y - .011 * (Math.abs(x) / .579) ** 4, z - .019 * (x / .579) ** 2];
  }).name = 'hummer-formed-front-skid';
  for (const side of [-1, 1]) {
    const hookOutline = roundedXY([[side * .391, .620], [side * .596, .620], [side * .583, .787], [side * .413, .787]], .021);
    const hookFace = (x, y) => [x, y, nose + .151 - .033 * (Math.abs(x) / .60) ** 4];
    // A recessed, open recovery eye sits inside its molded bezel. The old
    // projecting cubes obscured the skid instead of reading as hook pockets.
    const eye = roundedXY([[side * .443, .661], [side * .545, .661], [side * .541, .751], [side * .447, .751]], .020);
    perforatedFace(g, m.dark, hookOutline, [eye], hookFace, .030);
    insetOpening(eye, hookFace, .039, .14, m.black, m.black);
    curvedLine(g, m.black, denseXY(eye).map(([x, y]) => [x, y, hookFace(x, y)[2] + .007]), .009, true);
  }

  // Cabin belt, chamfered A/C pillars and dark floating roof. Side glass is
  // recessed in separate metal reveals; no opaque box fills the cabin.
  const roofY = x => roofTop - .035 * (Math.abs(x) / roofHalf) ** 8 + .009 * (1 - (x / roofHalf) ** 2);
  surface(g, m.hardtop, 48, 50, (u, v) => {
    const z = THREE.MathUtils.lerp(roofRear, roofFront, v), x = (u * 2 - 1) * roofHalf;
    return [x, roofY(x) - .014 * (Math.abs((z+.86)/1.45)) ** 8, z];
  }, true);
  // Closed roof headers bridge the roof edge to the inset glazing. The
  // windshield and rear glass sit below the roof skin, not in open sky gaps.
  for(const rear of [false,true])surface(g,m.glossBlack,48,8,(u,v)=>{
    const x=(u*2-1)*.955,y=THREE.MathUtils.lerp(roofTop-.009,roofTop-.068,v);
    const z=rear?THREE.MathUtils.lerp(roofRear+.016,roofRear-.047,v):THREE.MathUtils.lerp(roofFront-.020,.607,v);
    return [x,y-.016*(Math.abs(x)/.955)**6,z];
  },!rear);
  for (const side of [-1, 1]) {
    surface(g, m.hardtop, 64, 10, (u, v) => {
      const z = THREE.MathUtils.lerp(roofRear, roofFront, u), a = v * Math.PI / 2;
      return [side*(roofHalf-.023+.039*Math.sin(a)), roofY(roofHalf)-.042+.042*Math.cos(a), z];
    }, side < 0);
    const upperSideX = y => {
      const t = clamp((y-belt)/(roofTop-belt),0,1);
      return side * (THREE.MathUtils.lerp(half, roofHalf+.005, t) + .006 * Math.sin(t * Math.PI));
    };
    const frontWindow = [[.953,belt+.009],[-.174,belt+.009],[-.188,roofTop-.071],[.530,roofTop-.071]];
    const rearWindow = [[-.227,belt+.014],[-.945,belt+.017],[-1.058,belt+.043],[-1.134,belt+.088],[-1.174,belt+.152],[-1.158,roofTop-.071],[-.235,roofTop-.071]];
    const quarterWindow = [[-1.526,belt+.170],[-2.257,belt+.150],[-2.219,roofTop-.087],[-1.355,roofTop-.083],[-1.415,belt+.251]];
    windowPanel(g, { ...m, glass: m.windscreen }, frontWindow.map(([z,y])=>[upperSideX(y)+side*.003,y,z]), .044, .026, {bow:.004});
    windowPanel(g, { ...m, glass: m.privacyGlass }, rearWindow.map(([z,y])=>[upperSideX(y)+side*.003,y,z]), .045, .046, {bow:.004});
    const quarterOuter=[[-.991,belt+.004],[tail+.076,belt+.004],[-2.328,roofTop-.046],[-1.201,roofTop-.046],[-1.214,belt+.285],[-1.200,belt+.176],[-1.113,belt+.086]];
    const quarterPanel=perforatedFace(g,m.paint,quarterOuter,[roundedOutline(quarterWindow.map(([z,y])=>[z,y,0]),.071).map(([z,y])=>[z,y])],(z,y)=>[upperSideX(y),y,z],.07);
    // Analytic section normals avoid narrow triangulation bands across this
    // gently curved painted sail panel beside the small quarter window.
    const qp=quarterPanel.geometry.attributes.position,qn=quarterPanel.geometry.attributes.normal;
    for(let i=0;i<qp.count;i++){
      const y=qp.getY(i),h=.0003,slope=(upperSideX(y+h)-upperSideX(y-h))/(2*h),normal=v3(side,-side*slope,0).normalize();
      qn.setXYZ(i,normal.x,normal.y,normal.z);
    }
    const quarterLiner=quarterPanel.geometry.clone(),ql=quarterLiner.attributes.position;
    for(let i=0;i<ql.count;i++)ql.setX(i,ql.getX(i)-side*.014);
    finish(new THREE.Mesh(quarterLiner,m.interior),g);
    windowPanel(g,{...m,glass:m.privacyGlass},quarterWindow.map(([z,y])=>[upperSideX(y)+side*.004,y,z]),.035,.071,{bow:.004});
    const pillar=(a,b,width,material)=>surface(g,material,8,20,(u,v)=>{
      const z=THREE.MathUtils.lerp(a[0],b[0],v)+(u-.5)*width,y=THREE.MathUtils.lerp(a[1],b[1],v);
      return [upperSideX(y)+side*.010*Math.sin(u*Math.PI),y,z];
    },side>0);
    pillar([1.011,belt-.003],[.578,roofTop-.035],.075,m.glossBlack);
    pillar([-.204,belt+.005],[-.212,roofTop-.038],.057,m.glossBlack);
    // A smooth rear-door window sweep meets the broad painted sail pillar.
    // Its upper/lower radii are visibly different from a rectangular C-pillar.
    const rearGlassEdge=[[-.942,belt+.014],[-1.055,belt+.040],[-1.137,belt+.086],[-1.181,belt+.151],[-1.178,roofTop-.037]];
    const rearSealCurve=new THREE.CatmullRomCurve3(rearGlassEdge.map(([z,y])=>v3(z,y,0)),false,'centripetal');
    surface(g,m.glossBlack,3,40,(u,v)=>{
      const p=rearSealCurve.getPoint(v),t=rearSealCurve.getTangent(v),d=(u-.5)*.049*THREE.MathUtils.smoothstep(v,0,.075),z=p.x-t.y*d,y=p.y+t.x*d;
      return [upperSideX(y)+side*.003,y,z];
    },side<0);
    curvedLine(g,m.glossBlack,[[upperSideX(belt+.005),belt+.006,1.018],[upperSideX(belt+.005),belt+.006,-.22],[upperSideX(belt+.016),belt+.016,-.945]],.011);
    for(const z of [-.877]) curvedLine(g,m.dark,Array.from({length:49},(_,i)=>{
      const x=(i/24-1)*roofHalf;return [x,roofY(x)+.002,z];
    }),.0032);
    curvedLine(g,m.dark,[[0,roofY(0)+.001,roofFront-.064],[0,roofY(0)+.001,roofRear+.064]],.0030);
    // Two shallow door shells share the body's crease and its inset handle cups.
    const seam=(points,r=.0023)=>{
      const outline=roundedOutline(points.map(([z,y])=>[z,y,0]),.026,5),curve=new THREE.CatmullRomCurve3(outline.map(p=>v3(...p)),false,'centripetal');
      surface(g,m.dark,110,1,(u,v)=>{
        const p=curve.getPointAt(u),t=curve.getTangentAt(u),d=(v-.5)*r*1.5,z=p.x-t.y*d,y=p.y+t.x*d;
        return [side*(sheetX(y,z)+.0018),y,z];
      },side>0);
    };
    seam([[.990,belt-.010],[.998,.86],[.932,.575],[.808,.524],[-.084,.523],[-.189,.587],[-.197,belt-.007]]);
    seam([[-.224,belt-.007],[-.219,.576],[-.303,.524],[-.839,.523],[-.964,.687],[-1.101,.918],[-1.135,1.225],[-1.069,belt+.018]]);
    for(const z of [.008,-.909]){
      const y=1.280,x=side*(sideX(y,z)+.003);
      const cup=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),m.dark);cup.scale.set(.007,.029,.110);finish(cup,g,x,y-.007,z);
      roundedBox(g,m.paint,x+side*.022,y,z,.051,.031,.169,.012);
      roundedBox(g,m.chrome,x+side*.049,y+.006,z+.008,.008,.009,.128,.003);
    }
    // Angular arch trim has a matching inner reveal, flared outer shoulder and
    // actual open dark wheelhouse. Its outer face defines the published width.
    for(const axle of [frontAxle,rearAxle]){
      const inner=[[-.647,.490],[-.451,.912],[-.347,.992],[.347,.992],[.451,.912],[.647,.490]];
      const outerYZ=[[-.732,.466],[-.528,.980],[-.393,1.065],[.393,1.065],[.528,.980],[.732,.466]];
      if (axle === frontAxle) {
        // The leading trim terminates in the bumper at its lower corner;
        // continuing the rearward rocker profile here creates a hanging fin.
        inner[5] = [.530, .660]; outerYZ[5] = [.580, .660];
      }
      const roundedArch = points => {
        const pts = points.map(([z, y]) => v3(z, y, 0)), curve = new THREE.CurvePath();
        let start = pts[0];
        for (let i = 1; i < pts.length - 1; i++) {
          const p = pts[i], distance = Math.min(.060, p.distanceTo(pts[i - 1]) * .32, p.distanceTo(pts[i + 1]) * .32);
          const entry = p.clone().add(pts[i - 1].clone().sub(p).normalize().multiplyScalar(distance));
          const exit = p.clone().add(pts[i + 1].clone().sub(p).normalize().multiplyScalar(distance));
          curve.add(new THREE.LineCurve3(start, entry));
          curve.add(new THREE.QuadraticBezierCurve3(entry, p, exit)); start = exit;
        }
        curve.add(new THREE.LineCurve3(start, pts.at(-1))); return curve;
      };
      const innerCurve=roundedArch(inner), outerCurve=roundedArch(outerYZ);
      surface(g,m.black,80,12,(u,v)=>{
        const a=innerCurve.getPoint(u),b=outerCurve.getPoint(u);
        return [side*(outer-.043+.042*Math.sin(v*Math.PI*.72)),THREE.MathUtils.lerp(a.y,b.y,v),axle+THREE.MathUtils.lerp(a.x,b.x,v)];
      },side>0);
      // Each outside lower end flows into its black bumper corner. It is not
      // an isolated painted tab hanging below that bumper.
      const bodyRange = axle === frontAxle ? [0, .79] : [.21, 1];
      for (const [from, to, material] of [[bodyRange[0], bodyRange[1], m.paint],
        axle === frontAxle ? [.79, 1, m.black] : [0, .21, m.black]]) {
        surface(g,material,Math.ceil((to-from)*80),10,(u,v)=>{
          const b=outerCurve.getPoint(THREE.MathUtils.lerp(from,to,u)),z=axle+b.x;
          return [side*THREE.MathUtils.lerp(outer-.010,sideX(b.y,z),v),b.y+.025*Math.sin(v*Math.PI),z];
        },side<0);
      }
      surface(g,m.dark,72,8,(u,v)=>{
        const a=innerCurve.getPoint(u);
        return [side*THREE.MathUtils.lerp(.685,outer-.043,v),a.y-.006,axle+a.x];
      },side>0);
      // A continuous inner liner closes the arch toward the battery/frame.
      // The tire and steering sweep remain outside this shell, so the wheel
      // opening stays dimensional without exposing daylight through the car.
      const liner=profile(g,m.black,[[-.402,.48],[-.627,.50],[-.438,.914],[-.310,.978],
        [.310,.978],[.438,.914],[.627,.50],[.402,.48]],.016,.007);
      liner.position.set(side*.646,0,axle);
      surface(g,m.dark,80,1,(u,v)=>{
        const p=outerCurve.getPoint(u),t=outerCurve.getTangent(u),d=(v-.5)*.0048;
        return [side*(outer-.008),p.y+t.x*d+.0015,axle+p.x-t.y*d];
      },side<0);
    }
    // Black rock rails: connected risers, broad grippy steps and recessed slots.
    roundedBox(g,m.black,side*1.010,.431,-.036,.167,.080,2.193,.018);
    for(const z of [-.939,-.18,.619]){
      line(g,m.dark,[side*.816,.412,z],[side*1.077,.402,z],.026);
      roundedBox(g,m.dark,side*1.010,.383,z,.155,.020,.222,.006);
    }
    surface(g,m.dark,8,44,(u,v)=>[side*THREE.MathUtils.lerp(.967,1.089,u),.408,-1.113+v*2.146],side>0);
    for(let i=0;i<48;i++){const z=-1.062+i*.043;line(g,m.grille,[side*.976,.413,z],[side*1.079,.413,z+.018],.0020);}
    hummerBadge(side*(sideX(.772,.744)+.005),.772,.744,.130,side);
    // Driver-side charging door only, behind the rear wheel.
    if(side>0){const pts=roundedOutline([[-2.286,1.012,0],[-2.423,1.031,0],[-2.412,1.273,0],[-2.261,1.258,0]],.054).map(([z,y])=>[sideX(y,z)+.003,y,z]);curvedLine(g,m.dark,[...pts,pts[0]],.0023);}
    // Wide low mirror body, painted cap and an actual rear-facing glass inset.
    const mx=side*(2.37998/2-.100),my=1.511,mz=.737;
    profile(g,m.black,[[.821,1.387],[.951,1.390],[.944,1.446],[.842,1.488]],.077,.012).position.x=side*1.012;
    const capOutline=roundedOutline([[-.100,-.069,0],[.100,-.058,0],[.093,.071,0],[-.094,.079,0]],.027,10);
    const capPoint=(u,v)=>{
      const q=u*capOutline.length,i=Math.min(capOutline.length-1,Math.floor(q)),t=q-i,a=capOutline[i],b=capOutline[(i+1)%capOutline.length],r=Math.cos(v*Math.PI/2);
      return [mx+THREE.MathUtils.lerp(a[0],b[0],t)*r,my+THREE.MathUtils.lerp(a[1],b[1],t)*r,mz-.074+.160*Math.sin(v*Math.PI/2)];
    };
    surface(g,m.black,capOutline.length/2,28,(u,v)=>capPoint(u*.5,v));
    surface(g,m.paint,capOutline.length/2,28,(u,v)=>capPoint(u*.5+.5,v));
    windowPanel(g,{black:m.black,glass:m.chrome},capOutline.map(([x,y])=>[mx+x,my+y,mz-.075]),.060,.014,{bow:.003});
    roundedBox(g,m.white,mx,my+.006,mz+.090,.175,.014,.010,.004);
  }
  // Steep windshield, three independently modeled wipers and central marker trio.
  windowPanel(g,{...m,glass:m.windscreen},[[-.956,1.444,.949],[.956,1.444,.949],[roofHalf-.014,roofTop-.060,.583],[-roofHalf+.014,roofTop-.060,.583]],.034,.046,{bow:.012});
  for(const x of [-.58,0,.58]){
    line(g,m.black,[x-.110,1.462,.968],[x+.085,1.482,.962],.0055);
    line(g,m.black,[x+.085,1.482,.962],[x+.226,1.560,.905],.0040);
    line(g,m.black,[x-.030,1.509,.938],[x+.302,1.596,.879],.0080);
  }
  for(const x of [-.222,0,.222]){
    roundedBox(g,m.black,x,roofTop+.009,.383,.051,.027,.059,.010);
    roundedBox(g,m.amber,x,roofTop+.017,.405,.033,.018,.025,.007);
  }
  // Slanted rear glazing, side-hinged gate, signature red lenses and the full
  // road-matching spare. The spare axis is horizontal along the vehicle, not a
  // wheel facing sideways as on the driving hubs.
  windowPanel(g,{...m,glass:m.privacyGlass},[[.902,1.413,tail-.021],[-.902,1.413,tail-.021],[-.935,roofTop-.065,roofRear-.021],[.935,roofTop-.065,roofRear-.021]],.052,.039,{bow:.009});
  roundedBox(g,m.paint,0,1.081,tail-.010,1.748,.613,.058,.035);
  for(const side of [-1,1]){
    roundedBox(g,m.glossBlack,side*.971,1.103,tail-.024,.158,.547,.079,.027);
    const loop=roundedOutline([[side*.971-.049,.874,tail-.068],[side*.971+.049,.874,tail-.068],[side*.971+.049,1.334,tail-.068],[side*.971-.049,1.334,tail-.068]],.013);
    curvedLine(g,m.red,[...loop,loop[0]],.009);
    curvedLine(g,m.red,[[side*.971-.016,.948,tail-.071],[side*.971-.016,1.008,tail-.071],[side*.971-.035,1.044,tail-.071],[side*.971-.035,1.183,tail-.071],[side*.971-.016,1.221,tail-.071],[side*.971-.016,1.279,tail-.071]],.0045);
    roundedBox(g,m.reverse,side*.971,.901,tail-.069,.058,.023,.010,.005);
    roundedBox(g,m.redLens,side*.971,1.105,tail-.079,.108,.461,.010,.019);
    roundedBox(g,m.red,side*.924,.650,tail-.051,.057,.109,.013,.010);
    roundedBox(g,m.black,side*.362,.603,tail-.011,.598,.137,.157,.021);
    for(const y of [.555,.577,.599])roundedBox(g,m.grille,side*.362,y,tail-.095,.519,.008,.012,.002);
    for(const y of [.769,1.319])roundedBox(g,m.dark,-.871,y,tail-.027,.042,.065,.050,.008);
  }
  roundedBox(g,m.black,0,.680,tail-.016,2.039,.158,.140,.027);
  roundedBox(g,m.dark,0,.555,tail-.077,.366,.156,.101,.025);
  roundedBox(g,m.chrome,0,.561,tail-.135,.097,.087,.025,.009);
  roundedBox(g,m.dark,0,.561,tail-.151,.061,.053,.012,.004);
  roundedBox(g,m.dark,.497,.620,tail-.103,.198,.093,.023,.008);
  const spare=view._wheel(true);spare.root.rotation.y=Math.PI/2;spare.root.position.set(0,1.112,tail-.094);g.add(spare.root);
  // Spare center camera and asymmetrical lower rear badges sit on the gate.
  cylinder(g,m.black,0,1.112,tail-.212,.071,.060,'z',24);
  cylinder(g,m.lens,0,1.112,tail-.250,.024,.009,'z',20);
  hummerBadge(-.699,.894,tail-.053,.132,0,true);
  lettering('GMC',.694,.887,tail-.055,.210,.047,m.chrome,true);
  for(const x of [-.222,0,.222])roundedBox(g,m.red,x,roofTop+.008,roofRear+.155,.026,.012,.032,.004);
  const shark=profile(g,m.black,[[-1.95,roofTop-.008],[-1.949,roofTop+.021],[-1.83,roofTop+.016],[-1.76,roofTop-.006]],.034,.005);
  shark.position.x=.04;

  // Factory-style two-row cabin visible through the actual windows. Reuse
  // shaped seat upholstery, then supply Hummer's broad rectangular displays.
  view._interior({frontZ:.127,rearZ:-1.033,floor:.557,dashY:1.285,dashZ:.945,width:1.86,seatY:.969,roofY:1.899,
    dashboard:false,centerConsole:false,doorCards:false,rearSeatY:1.006,rearBackHeight:.50});
  // Door trim stays inside the newly formed outer skins. The former generic
  // full-length slab could emerge through a realistic shallow door pressing.
  for(const side of [-1,1])for(const [rear,front,armZ]of [[-.176,.899,.127],[-1.072,-.241,-.691]]){
    surface(g,m.interior,48,12,(u,v)=>[side*.976,THREE.MathUtils.lerp(1.225,belt-.009,v),THREE.MathUtils.lerp(rear,front,u)],side>0);
    surface(g,m.interior,48,6,(u,v)=>[side*THREE.MathUtils.lerp(.923,.994,v),belt-.010,THREE.MathUtils.lerp(rear,front,u)],side>0);
    roundedBox(g,m.black,side*.923,.933,(rear+front)/2,.029,.659,front-rear,.015);
    roundedBox(g,m.hummerInteriorAccent,side*.903,1.143,(rear+front)/2,.024,.049,(front-rear)*.87,.010);
    roundedBox(g,m.interior,side*.883,1.023,armZ,.093,.061,.388,.015);
    line(g,m.chrome,[side*.901,1.159,armZ+.073],[side*.901,1.159,armZ+.190],.005);
  }
  // Close the footwell below the dashboard so the battery/drive-unit geometry
  // cannot show through the passenger compartment when looking through glass.
  profile(g,m.interior,[[.909,.550],[.914,1.196],[.866,1.235],[.857,.551]],1.835,.012);
  roundedBox(g,m.interior,0,.555,.563,1.832,.024,.684,.010);
  roundedBox(g,m.black,0,1.267,.912,1.851,.199,.318,.035);
  roundedBox(g,m.hummerInteriorAccent,0,1.235,.739,1.734,.068,.052,.014);
  roundedBox(g,m.black,-.196,1.369,.738,.337,.192,.037,.012);
  roundedBox(g,m.screen,-.196,1.371,.713,.301,.160,.009,.007);
  roundedBox(g,m.black,.488,1.372,.736,.334,.141,.047,.012);
  roundedBox(g,m.screen,.488,1.372,.708,.302,.112,.009,.006);
  for(const x of [-.789,-.477,.194,.808]){
    roundedBox(g,m.grille,x,1.290,.737,.077,.110,.024,.011);
    for(let i=0;i<4;i++)roundedBox(g,m.black,x-.024+i*.016,1.290,.721,.006,.086,.010,.002);
  }
  roundedBox(g,m.black,0,.888,-.024,.333,.234,.791,.031);
  roundedBox(g,m.hummerInteriorAccent,0,1.011,.220,.301,.018,.328,.010);
  roundedBox(g,m.dark,-.063,1.043,.278,.081,.059,.126,.010);
  cylinder(g,m.grille,.071,1.034,.083,.044,.024,'y',24);
  for(const z of [-.132,-.284])cylinder(g,m.dark,0,1.009,z,.060,.012,'y',24);
  const steering=new THREE.Group();steering.position.set(.488,1.294,.498);steering.rotation.x=-.22;g.add(steering);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.154,.017,10,48),m.black);steering.add(ring);
  roundedBox(steering,m.black,0,0,.006,.148,.096,.043,.020);
  for(const side of [-1,1])line(steering,m.hummerInteriorAccent,[side*.053,-.023,.012],[side*.132,-.016,.012],.018);
  line(steering,m.black,[0,-.038,0],[0,-.138,0],.025);
  view.root.userData.visualModel.hummer = {version:HUMMER_MODEL_VERSION,source:'Original mesh from GMC MY24 brochure and reference photographs',
    wheelbase:wb,bodyWidth:2.1971,bodyLength:4.99872,frontAxleZ:frontAxle,rearAxleZ:rearAxle,
    roofPanels:4,wipers:3,roadMatchingSpare:true,batteryUnderfloor:true,independentAxles:2,
    nose:bumperFront,hoodFront:nose,tail,opaqueRoof:true,trim:'3X Extreme Off-Road Package',airSuspensionUsesPhysicalChassisPose:true};

  function hummerBadge(x,y,z,width,side=0,rear=false){
    const mark=new THREE.Group();mark.position.set(x,y,z);if(side)mark.rotation.y=side*Math.PI/2;else if(rear)mark.rotation.y=Math.PI;g.add(mark);
    for(const s of [-1,1]){roundedBox(mark,m.chrome,s*width*.22,0,0,width*.19,width*.24,.004,.001);roundedBox(mark,m.chrome,s*width*.22,width*.098,.001,width*.19,width*.082,.006,.001);roundedBox(mark,m.chrome,s*width*.22,-width*.098,.001,width*.19,width*.082,.006,.001);}
    roundedBox(mark,m.chrome,0,0,.002,width*.50,width*.064,.006,.001);
    roundedBox(mark,m.chrome,width*.51,-width*.055,.001,width*.18,width*.045,.004,.001);
  }
  function lettering(text,x,y,z,width,height,material,rear=false){
    const glyphs={H:[[0,0],[.22,0],[.22,.4],[.68,.4],[.68,0],[.90,0],[.90,1],[.68,1],[.68,.61],[.22,.61],[.22,1],[0,1]],
      U:[[0,1],[.22,1],[.22,.24],[.31,.18],[.61,.18],[.69,.24],[.69,1],[.91,1],[.91,.17],[.73,0],[.18,0],[0,.17]],
      M:[[0,0],[.21,0],[.21,.68],[.45,.35],[.70,.68],[.70,0],[.91,0],[.91,1],[.70,1],[.45,.65],[.21,1],[0,1]],
      E:[[0,0],[.89,0],[.89,.20],[.23,.20],[.23,.40],[.77,.40],[.77,.61],[.23,.61],[.23,.80],[.89,.80],[.89,1],[0,1]],
      R:[[0,0],[.22,0],[.22,.39],[.43,.39],[.66,0],[.92,0],[.66,.45],[.84,.59],[.84,.85],[.68,1],[0,1]],
      G:[[.17,0],[0,.18],[0,.82],[.17,1],[.75,1],[.91,.82],[.91,.68],[.69,.68],[.69,.78],[.61,.81],[.30,.81],[.22,.75],[.22,.25],[.30,.19],[.64,.19],[.70,.25],[.70,.40],[.48,.40],[.48,.60],[.92,.60],[.92,.18],[.75,0]],
      C:[[.17,0],[0,.18],[0,.82],[.17,1],[.75,1],[.91,.82],[.91,.66],[.69,.66],[.69,.77],[.61,.81],[.30,.81],[.22,.74],[.22,.26],[.30,.19],[.61,.19],[.69,.25],[.69,.35],[.91,.35],[.91,.18],[.75,0]]};
    const parent=new THREE.Group();parent.position.set(x,y,z);if(rear)parent.rotation.y=Math.PI;g.add(parent);
    const spacing=.21,unit=width/(text.length*(.92+spacing)-spacing);
    for(const [i,char]of [...text].entries()){
      const shape=new THREE.Shape();glyphs[char].forEach(([a,b],j)=>shape[j?'lineTo':'moveTo'](a*unit,b*height));shape.closePath();
      if(char==='R'){const hole=new THREE.Path();[[.22,.60],[.22,.80],[.57,.80],[.63,.74],[.63,.66],[.56,.60]].forEach(([a,b],j)=>hole[j?'lineTo':'moveTo'](a*unit,b*height));hole.closePath();shape.holes.push(hole);}
      const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.002,bevelEnabled:false,steps:1}),material);finish(mesh,parent,-width/2+i*unit*(.92+spacing),-height/2,0);
    }
  }
}

/** Underfloor battery and three motor housings, with no fictitious exhaust. */
export function buildHummerUnderbody(view, geometry) {
  const { roundedBox, line, cylinder } = geometry, g=view.body,m=view.materials,spec=view.spec;
  const axle=spec.wheelbase/2,base=spec.visualBase?.clearance??spec.clearance;
  roundedBox(g,m.dark,0,base+.137,-.039,1.650,.264,2.690,.033);
  roundedBox(g,m.satinMetal,0,base+.010,-.039,1.619,.025,2.663,.012);
  for(const side of [-1,1]){
    roundedBox(g,m.dark,side*.861,base+.130,-.060,.090,.203,3.011,.014);
    for(const z of [-1.23,-.63,0,.64,1.21])cylinder(g,m.dark,side*.748,base-.007,z,.012,.016,'y',8);
  }
  for(const [front,z]of [[true,axle],[false,-axle]]){
    const y=(spec.visualBase?.tireRadius??spec.tireRadius)+.030;
    roundedBox(g,m.dark,0,y+.048,z,front?.559:.748,.214,.390,.037);
    roundedBox(g,m.satinMetal,0,y-.077,z,front?.681:.838,.024,.422,.018);
    if(front)cylinder(g,m.grille,.122,y+.026,z,.132,.414,'x',28);
    else for(const side of [-1,1])cylinder(g,m.grille,side*.222,y+.033,z,.127,.291,'x',28);
    for(const side of [-1,1]){
      const index=(front?0:2)+(side>0?0:1);
      view._driveLink([side*.245,y,z],{wheel:index},.032);
      for(const dz of [-.187,.192])line(g,m.dark,[side*.409,y-.020,z+dz],[side*.701,y-.052,z],.027);
      roundedBox(g,m.dark,side*.664,y+.179,z,.155,.047,.327,.018);
    }
  }
  view.root.userData.visualModel.drivenAxles={front:true,rear:true};
  view.root.userData.visualModel.underbody='structural underfloor battery, single front motor and twin rear motors, independent suspension';
}

/** Normalized telescopic air strut; endpoints use the actual body/hub rig. */
export function createHummerAirStrutGeometry(THREE) {
  const profile=[[.029,-.5],[.029,-.45],[.032,-.42],[.033,-.38],[.065,-.35]];
  for(let i=0;i<6;i++){const y=-.34+i*.097;profile.push([.073,y],[.066,y+.032],[.061,y+.060],[.069,y+.083]);}
  profile.push([.062,.273],[.043,.290],[.019,.305],[.019,.444],[.037,.460],[.037,.5]);
  const geometry=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),24);
  const p=geometry.attributes.position,colors=new Float32Array(p.count*3),rubber=new THREE.Color('#242a2d'),steel=new THREE.Color('#9aa6aa');
  for(let i=0;i<p.count;i++){const y=p.getY(i);(y>.302&&y<.446?steel:rubber).toArray(colors,i*3);}
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
}
