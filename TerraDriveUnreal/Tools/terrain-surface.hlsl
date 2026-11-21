// World-space material for the deformable native ground, not a Landscape actor.
struct TerraSurface {
  float hash(float2 p) { return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453); }
  float noise(float2 p) {
    float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);
    return lerp(lerp(hash(i),hash(i+float2(1,0)),f.x),lerp(hash(i+float2(0,1)),hash(i+1),f.x),f.y);
  }
  // Value noise and its continuous analytical gradient share four hashes.
  float grain(float2 p,out float2 gradient) {
    float2 cell=floor(p),f=frac(p);
    float2 weight=f*f*(3-2*f);
    float a=hash(cell),b=hash(cell+float2(1,0));
    float c=hash(cell+float2(0,1)),d=hash(cell+1);
    gradient=6*f*(1-f)*float2(lerp(b-a,d-c,weight.y),lerp(c-a,d-b,weight.x));
    return lerp(lerp(a,b,weight.x),lerp(c,d,weight.x),weight.y);
  }
  float2 rotate(float2 p,float quarter) {
    if(quarter<.5)return p;if(quarter<1.5)return float2(-p.y,p.x);
    if(quarter<2.5)return -p;return float2(p.y,-p.x);
  }
  // Three overlapping lattice samples remove the repeating square pattern.
  // Color, normal and roughness share every offset, rotation and blend weight.
  void plane(Texture2D albedo,SamplerState asamp,Texture2D normals,SamplerState nsamp,
             Texture2D rough,SamplerState rsamp,float2 uv,float2 dx,float2 dy,float seed,float normalY,float roughG,
             out float3 color,out float3 detail,out float r) {
    float2 cell=floor(uv),f=frac(uv);
    float2 corners[3];float3 weight;
    if(f.x+f.y<1){corners[0]=cell;corners[1]=cell+float2(1,0);corners[2]=cell+float2(0,1);weight=float3(1-f.x-f.y,f.x,f.y);}
    else{corners[0]=cell+1;corners[1]=cell+float2(0,1);corners[2]=cell+float2(1,0);weight=float3(f.x+f.y-1,1-f.x,1-f.y);}
    weight=pow(max(weight,0),4);weight/=max(dot(weight,1),.0001);
    uint texWidth,texHeight;albedo.GetDimensions(texWidth,texHeight);
    float2 aspect=float2(1,float(texWidth)/max(float(texHeight),1));
    color=0;detail=0;r=0;
    [unroll]for(int k=0;k<3;++k){
      float h=hash(corners[k]+seed),q=floor(h*4);
      float2 coord=rotate(uv-corners[k],q)+float2(hash(corners[k]+31+seed),hash(corners[k]-17-seed))*23;
      coord*=aspect;
      float2 gx=rotate(dx,q)*aspect,gy=rotate(dy,q)*aspect;
      color+=Texture2DSampleGrad(albedo,asamp,coord,gx,gy).rgb*weight[k];
      float2 xy=Texture2DSampleGrad(normals,nsamp,coord,gx,gy).rg*2-1;
      xy.y*=normalY;xy=rotate(xy,fmod(4-q,4));
      detail+=float3(xy,sqrt(saturate(1-dot(xy,xy))))*weight[k];
      float2 rg=Texture2DSampleGrad(rough,rsamp,coord,gx,gy).rg;
      r+=lerp(rg.x,rg.y,roughG)*weight[k];
    }
  }
  void layer(Texture2D a,SamplerState sa,Texture2D n,SamplerState sn,Texture2D r,SamplerState sr,
             float3 p,float3 dpdx,float3 dpdy,float3 normal,float seed,float normalY,float roughG,
             out float3 color,out float3 worldDetail,out float roughness){
    float3 w=pow(abs(normal),6);w/=max(dot(w,1),.0001);
    color=0;worldDetail=0;roughness=0;
    // Flat ground samples one projection. Cliff transitions blend projections.
    [unroll]for(int axis=0;axis<3;++axis)if(w[axis]>.005){
      float2 uv=axis==0?p.yz:axis==1?p.xz:p.xy;float3 c,d;float rr;
      float2 dx=axis==0?dpdx.yz:axis==1?dpdx.xz:dpdx.xy;
      float2 dy=axis==0?dpdy.yz:axis==1?dpdy.xz:dpdy.xy;
      plane(a,sa,n,sn,r,sr,uv,dx,dy,seed+axis*19,normalY,roughG,c,d,rr);
      float3 tangent=axis==0?float3(0,1,0):float3(1,0,0);
      tangent=normalize(tangent-normal*dot(tangent,normal));
      float3 bitangent=normalize(cross(normal,tangent));
      float3 v=axis==2?float3(0,1,0):float3(0,0,1);
      bitangent*=dot(bitangent,v)<0?-1:1;
      color+=c*w[axis];worldDetail+=(tangent*d.x+bitangent*d.y)*w[axis];roughness+=rr*w[axis];
    }
  }
};
TerraSurface f;
float3 p=World*.01,n=normalize(GeoNormal);
float macro=f.noise(p.xy*.019+Biome*19);
float mid=f.noise(p.xy*.073+37);
float patchDetail=f.noise(p.xy*.29);
float patches=.52*macro+.30*mid+.18*patchDetail;
float stoneField=f.noise(p.xy*.041-46);
float gritDetail=f.noise(p.xy*.19+17);
float grit=.48*stoneField+.32*gritDetail+.20*f.noise(p.xy*.81);
float b=smoothstep(.34,.68,patches);
float c=smoothstep(.46,.69,grit)*(1-b*.7);
float flat=smoothstep(.76,.97,n.z);
float windward=dot(n.xy,float2(.94,.342));
if(Biome==0){
  // The rooted meadow thins on slopes and groups around shallow drainage.
  // Small patches of exposed mineral soil remain between the turf stands.
  b=smoothstep(.25,.68,.70*patches+.30*gritDetail)*smoothstep(.42,.86,n.z);
  c*=1-.42*b;
}
if(Biome==1){
  // A paved surface weathers through the exposed aggregate. The same quiet
  // asphalt scan still anchors the track where the binder is less worn.
  b=smoothstep(.42,.65,patches)*.23;
  c=0;
}
if(Biome==2){
  b*=.44;
  c*=.75;
}
if(Biome==3){
  // Wetland plants fill firmer raised hummocks; leaf litter and braided
  // damp earth show through the low, flatter patches between them.
  b=smoothstep(.29,.70,patches+(1-flat)*.12)*smoothstep(.38,.76,n.z);
  c=smoothstep(.38,.65,grit)*(1-.62*b)*.66;
}
if(Biome==4){
  b*=smoothstep(.47,.89,n.z);
  c=max(c*.8,(1-smoothstep(.34,.86,n.z))*.75);
}
if(Biome==5){
  // Clean wind-transported sand dominates. Coarser lag sits in quieter
  // patches and around the toes of dunes instead of blanketing the crests.
  b=smoothstep(.38,.72,patches)*lerp(.21,.56,flat);
  c=smoothstep(.52,.75,grit)*lerp(.08,.29,flat);
}
if(Biome==6){
  // The clean snow scan dominates deeper drift faces. The road scan reads
  // as dense wind crust and melt along lower, exposed ground.
  b=.08+smoothstep(.29,.73,patches+windward*.15)*.66;
  c=max((1-smoothstep(.38,.76,n.z))*.74, Wetness*smoothstep(.55,.76,grit)*.23);
}
if(Biome==0){
  // Traffic wears the centre of the lane; grass and stones meet in a wider
  // shoulder that breaks up in patches rather than tracing a uniform edge.
  float shoulder=4*QuarryPath*(1-QuarryPath);
  float stoneScatter=smoothstep(.40,.68,grit);
  b*=1-smoothstep(.05,.93,QuarryPath);
  c=saturate(lerp(c,.07+.36*stoneScatter,QuarryPath)+.28*shoulder*stoneScatter);
}
// A continuous low-amplitude domain warp breaks the surviving photograph
// motifs without new texture reads. Derivatives still follow the warped UVs.
float3 texP=p;
float2 warp=float2(f.noise(p.xy*.27+41),f.noise(p.xy*.27-79))-.5;
texP.xy+=warp*.48;
// Evaluate gradients before zero-contribution branches. SampleGrad then
// remains defined at quad boundaries where only some pixels need a layer.
float3 tx=ddx(texP),ty=ddy(texP);
float3 worldDx=ddx(p),worldDy=ddy(p);
float pixelFootprint=max(length(worldDx.xy),length(worldDy.xy));
float nearDetail=1-smoothstep(.018,.085,pixelFootprint);
float3 ac,bc,cc,an,bn,cn;float ar,br,cr;
f.layer(Primary,PrimarySampler,NormalMap,NormalMapSampler,RoughMap,RoughMapSampler,texP/Scales.x,tx/Scales.x,ty/Scales.x,n,0,NormalSigns.x,RoughChannels.x,ac,an,ar);
// Smoothstep has genuinely zero coverage across whole patches, especially
// the worn quarry lane. Do not fetch a layer that contributes exactly zero.
// Keep the primary scan because later excavation shading also uses it.
bc=ac;bn=an;br=ar;cc=ac;cn=an;cr=ar;
[branch]if(b>0)f.layer(Secondary,SecondarySampler,SecondaryNormal,SecondaryNormalSampler,SecondaryRough,SecondaryRoughSampler,texP/Scales.y,tx/Scales.y,ty/Scales.y,n,7,NormalSigns.y,RoughChannels.y,bc,bn,br);
[branch]if(c>0)f.layer(Accent,AccentSampler,AccentNormal,AccentNormalSampler,AccentRough,AccentRoughSampler,texP/Scales.z,tx/Scales.z,ty/Scales.z,n,29,NormalSigns.z,RoughChannels.z,cc,cn,cr);
if(Biome==0){cc*=float3(.84,.83,.78);bc*=float3(.51,.63,.41);}
if(Biome==5)cc*=float3(.62,.57,.47);
float3 color=lerp(lerp(ac,bc,b),cc,c);
float3 relief=lerp(lerp(an,bn,b),cn,c);
float rough=lerp(lerp(ar,br,b),cr,c);
float grassCover=(Biome==0||Biome==3)?b*(1-c):0;
if(grassCover>.01){
  // Meadow reads as groups of living blades, dry growth and exposed root
  // patches instead of the same pale green photograph across every hill.
  float dry=smoothstep(.28,.74,.55*mid+.45*gritDetail)*(Biome==3?.42:1);
  float leafLitter=smoothstep(.57,.77,.65*grit+.35*patchDetail);
  float3 growth=lerp(float3(.65,.84,.62),float3(1.19,1.04,.70),dry);
  color=lerp(color,color*growth,grassCover*.50);
  color=lerp(color,ac*float3(.78,.65,.48),leafLitter*grassCover*.35);
  // Expose dry stems and root grit at ground level. Share the same noise
  // for colour and relief so that stems do not look painted onto the soil.
  if(nearDetail>0){
    float2 across=float2(.94,.342),along=float2(-.342,.94);
    float2 q=float2(dot(p.xy,across)*24,dot(p.xy,along)*9)+warp*3;
    float2 grainSlope;
    float groundGrain=f.grain(q,grainSlope);
    float visible=grassCover*nearDetail*smoothstep(.65,1,Wear);
    color*=1+(groundGrain-.5)*visible*.24;
    relief+=float3((across*grainSlope.x+along*grainSlope.y*.375)*visible*.17,0);
  }
  rough+=lerp(-.045,.07,dry)*grassCover;
  relief+=bn*grassCover*.30;
}
float basetone=smoothstep(.17,.83,macro);
float broad=Biome==1?lerp(.92,1.07,basetone):lerp(.80,1.12,basetone);
color*=broad;
float wet=smoothstep(.51,.77,patches)*Wetness;
// Dark, smooth water films collect where the low-lying fine substrate stays
// wet. Connected dry clods and grass remain visible around the film.
float film=0;
if(Biome==2||Biome==3){
  film=Wetness*flat*smoothstep(.40,.69,.58*patches+.42*(1-grit))*(1-grassCover*.9);
  wet=max(wet,film);
}
// The neighbouring wet cover also darkens sheltered fine soil between its
// larger patches. Preserve dry raised grains and the original scan detail.
if(Biome==0||Biome==5)wet=max(wet,saturate((Wetness-.34)*1.65)*(.45+.55*(1-grit)));
color*=lerp(1,.61,wet);
float packed=saturate(1-Wear);
// Detailed soil supplies signed physical height and tire tangent. Coarse
// untouched vertices use exact UNorm8 neutral B=128/255 / A=0, so these changes never paint
// a dark ribbon across every surface or alter road and rock materials.
float signedSoil=(SoilDisplacement*255-128)/127;
signedSoil=sign(signedSoil)*signedSoil*signedSoil*.8;
float excavation=max(0,-signedSoil);
float bank=max(0,signedSoil);
float floorWear=packed*smoothstep(.0015,.012,excavation);
float looseBank=smoothstep(.001,.024,bank);
float churn=saturate(Churn);
if(Biome==0){
  float loose=saturate(LooseSoil);color*=lerp(1,.85,loose);
  float3 dry=lerp(color,color*lerp(1.16,.90,loose)+float3(.022,.018,.009)*(1-loose),packed*.65);
  float3 crushed=lerp(bc,bc*float3(1.23,1.04,.68),packed*.78);
  color=lerp(dry,crushed,b*packed*.62);
  // Excavating grassy ground exposes soil below its green root mat. The
  // shallow hard-dirt trail stays pale; a deep groove cannot remain turf.
  float rootBreak=smoothstep(.012,.055,excavation)*packed;
  float3 exposedEarth=ac*float3(.52,.41,.29);
  color=lerp(color,exposedEarth,rootBreak*.85);
}
if(Biome==2||Biome==3){
  // Fresh wet clay is moderately darker and smoother in the loaded floor;
  // the loose banks retain clod roughness and the original soil colour.
  color*=lerp(float3(.77,.72,.64),float3(.92,1.03,.83),grassCover);
  color=lerp(color,color*float3(.62,.59,.51),film*.63);
  float3 moistEarth=ac*float3(.34,.29,.25);
  color=lerp(color,moistEarth,floorWear*.94);
  // Wet-grass cover tears to damp earth below the sod, while the displaced
  // shoulder keeps irregular pieces of the original root/soil surface.
  color=lerp(color,ac*float3(.61,.55,.45),looseBank*.58);
}
if(Biome==1){
  color*=lerp(float3(.88,.92,.95),float3(1.08,1.03,.94),smoothstep(.29,.76,grit));
}
if(Biome==5){
  float fineSand=(1-c)*(1-.6*b);
  float iron=smoothstep(.25,.73,.60*macro+.40*mid);
  color*=lerp(1,lerp(float3(.98,.94,.85),float3(1.15,.88,.65),iron),fineSand);
  color*=1-floorWear*.09-looseBank*.035;
}
Roughness=clamp(lerp(.66+rough*.31,.53,wet),.52,.99);
if(Biome==1)Roughness=clamp(.68+rough*.30+(b-.1)*.12,.70,.98);
if(Biome==2||Biome==3)Roughness=lerp(Roughness,.27+rough*.14,film*.84);
if(Biome==2||Biome==3)Roughness=lerp(Roughness,.32+rough*.10,floorWear*.94*(1-churn*.15));
if(Biome==0||Biome==2||Biome==3||Biome==5)Roughness=lerp(Roughness,.94,looseBank*.70);
SurfaceNormal=normalize(n+relief*(Biome==0?.78:.48)*(1-floorWear*.70));
if(Biome==2||Biome==3){
  // Rolling exposes a pressed floor; sustained slip smears the wet clay.
  // Banks keep their drier clod texture instead of sharing the glossy floor.
  float smear=floorWear*churn*Wetness;
  Roughness=lerp(Roughness,.23+rough*.08,smear*.75);
  SurfaceNormal=normalize(lerp(SurfaceNormal,n,smear*.40));
}
if(Biome==5){
  // Ripple trains curve with the dune and fade on the steep lee slipface.
  // Coarser grains at the crest color the same ridge that catches the light.
  float windPhase=p.x*16+p.y*5.8+warp.x*7+warp.y*5;
  float wave,slope;
  sincos(windPhase,wave,slope);
  float slipFace=smoothstep(.17,.48,-windward);
  float ripple=(1-smoothstep(.027,.115,pixelFootprint))*(1-packed)*(1-slipFace)*(1-c);
  float3 rippleAxis=float3(.94,.34,0);
  rippleAxis-=n*dot(n,rippleAxis);
  SurfaceNormal=normalize(SurfaceNormal+rippleAxis*slope*(1+.35*wave)*ripple*.19);
  float crest=smoothstep(.38,.94,wave);
  color*=1-crest*ripple*.12;
  Roughness=lerp(Roughness,.87+crest*.09,ripple*.47);
}
if(Biome==4){
  // Inclined bedding reads across laterally adjacent rock faces. Give its
  // narrow mineral streaks a matching roughness and a shallow normal, with
  // the procedural detail filtered by the projected world-space footprint.
  float3 seamAxis=float3(.14,-.22,.966);
  float seamHeight=dot(p,seamAxis);
  float seamFootprint=max(abs(dot(worldDx,seamAxis)),abs(dot(worldDy,seamAxis)));
  float2 seamSlope;
  float mineralBand=f.grain(float2(seamHeight*1.65+warp.y*.84,p.x*.09+p.y*.14),seamSlope);
  float seam=smoothstep(.44,.73,mineralBand);
  float exposedFace=1-smoothstep(.45,.88,n.z);
  float bedding=exposedFace*(1-smoothstep(.055,.28,seamFootprint));
  float lichen=smoothstep(.50,.73,grit)*smoothstep(.42,.88,n.z);
  float3 freshRock=color*float3(.79,.85,.92);
  float3 weatheredRock=color*float3(1.12,1.05,.96);
  color=lerp(freshRock,weatheredRock,smoothstep(.20,.76,patches+(1-exposedFace)*.18));
  color*=lerp(1,lerp(.75,1.18,seam),bedding*.78);
  color=lerp(color,color*float3(.73,.86,.65),lichen*.40);
  Roughness=clamp(Roughness+lichen*.065+(seam-.5)*bedding*.16,.62,.99);
  float3 seamTangent=seamAxis-n*dot(seamAxis,n);
  SurfaceNormal=normalize(n+relief*.85+seamTangent*seamSlope.x*bedding*.28);
}
if(Biome==6){
  // The Winter Scene's clean snow and crushed snow-road scans remain visible
  // at tire scale. Broken wet cover at the fringe becomes granular slush;
  // blue-grey hollows and sheltered wind ripples retain relief in bright sun.
  float granular=f.noise(p.xy*2.7+31);
  float slush=Wetness*smoothstep(.31,.66,grit)*(.45+.55*flat)*(1-c);
  float drift=.5+.5*sin(p.x*.36+p.y*.15+(mid-.5)*3.1);
  // A wind crust shades cool in the hollows. Exposed pebbles keep their own
  // earthy color and sit in a broad, dirty melt fringe around patchy snow.
  float3 snow=lerp(ac,bc,b)*lerp(float3(.28,.36,.48),float3(.55,.58,.60),drift);
  snow*=lerp(.83,1.06,granular);
  snow=lerp(snow,snow*float3(.37,.41,.46),slush*.84);
  snow=lerp(snow,snow*float3(.55,.70,.85),floorWear*.94);
  snow*=1+looseBank*.055;
  color=lerp(snow,cc*float3(.64,.67,.69),c)*broad;
  float scanGrain=(rough-.5)*.22;
  Roughness=lerp(lerp(lerp(.89,.61,b)+scanGrain,.40+scanGrain*.35,floorWear),.29+scanGrain*.3,slush);
  Roughness=lerp(Roughness,.87+scanGrain*.35,looseBank);
  Roughness=clamp(lerp(Roughness,.82,c),.24,.97);
  // Break the snow ridges into irregular wind-packed patches. At distance
  // only the broad drifts survive; at ground level the crust catches light.
  float phase=p.x*4.2+p.y*1.7+warp.x*4.9;
  float finePhase=p.x*18.4+p.y*6.8+warp.y*6.5;
  float crust=smoothstep(.26,.71,patches+windward*.15);
  float2 wind=(float2(.22,.085)*cos(phase)*lerp(.52,1,crust)+float2(.16,.06)*cos(finePhase)*nearDetail*crust)*(1-packed)*(1-slush)*(1-c);
  SurfaceNormal=normalize(n+relief*lerp(1.36,.78,c)*(1-floorWear*.90)+float3(wind,0));
}
if(Biome!=1&&Biome!=4&&looseBank>.01){
  // Small broken clods/grains belong to the raised loose shoulders, not
  // collision spikes. Footprint filtering suppresses distant shimmer.
  float visible=1-smoothstep(.015,.070,pixelFootprint);
  float2 q=p.xy*(Biome==6?19:Biome==5?24:13);
  float2 clodSlope;
  float clods=f.grain(q+17,clodSlope);
  float strength=(Biome==6?.105:Biome==5?.080:.155)*looseBank*visible;
  SurfaceNormal=normalize(SurfaceNormal+float3(clodSlope*strength,0));
  color*=1+(clods-.5)*looseBank*visible*(Biome==6?.12:.20);
}
if(Biome!=1&&Biome!=4&&packed>.01){
  // Subtle rolling tread impressions in the actual loaded strip, aligned to
  // its last tire tangent. These are filtered normal detail, never additional
  // collision spikes. High slip breaks up a clear tread into churned soil.
  float2 direction=TireDirection/max(length(TireDirection),.001);
  float2 side=float2(-direction.y,direction.x);
  float along=dot(p.xy,direction),across=dot(p.xy,side);
  float chevron=sin(across*34);
  float phase=along*48+abs(chevron)*.95;
  float filtered=1-smoothstep(.020,.085,pixelFootprint);
  float tread=(Biome==2||Biome==3?.14:Biome==6?.10:.075)*packed*filtered*(1-churn*.83);
  float2 gradient=direction*cos(phase)+side*cos(phase)*sign(chevron)*cos(across*34)*.67;
  float breakup=(f.noise(p.xy*8.3+19)-.5)*churn*packed*filtered*.15;
  SurfaceNormal=normalize(SurfaceNormal+float3(gradient*tread+float2(breakup,-breakup),0));
  float lug=smoothstep(.66,.94,.5+.5*cos(phase));
  color*=1-lug*packed*filtered*(1-churn*.83)*(Biome==6?.14:Biome==2||Biome==3?.12:.065);
}
return max(color*.92,.006);
