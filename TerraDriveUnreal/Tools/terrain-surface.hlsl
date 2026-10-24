// World-space material for the deformable native ground, not a Landscape actor.
struct TerraSurface {
  float hash(float2 p) { return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453); }
  float noise(float2 p) {
    float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);
    return lerp(lerp(hash(i),hash(i+float2(1,0)),f.x),lerp(hash(i+float2(0,1)),hash(i+1),f.x),f.y);
  }
  float2 rotate(float2 p,float quarter) {
    if(quarter<.5)return p;if(quarter<1.5)return float2(-p.y,p.x);
    if(quarter<2.5)return -p;return float2(p.y,-p.x);
  }
  // Three overlapping lattice samples remove the repeating square pattern.
  // Color, normal and roughness share every offset, rotation and blend weight.
  void plane(Texture2D albedo,SamplerState asamp,Texture2D normals,SamplerState nsamp,
             Texture2D rough,SamplerState rsamp,float2 uv,float seed,float normalY,float roughG,
             out float3 color,out float3 detail,out float r) {
    float2 cell=floor(uv),f=frac(uv);
    float2 corners[3];float3 weight;
    if(f.x+f.y<1){corners[0]=cell;corners[1]=cell+float2(1,0);corners[2]=cell+float2(0,1);weight=float3(1-f.x-f.y,f.x,f.y);}
    else{corners[0]=cell+1;corners[1]=cell+float2(0,1);corners[2]=cell+float2(1,0);weight=float3(f.x+f.y-1,1-f.x,1-f.y);}
    weight=pow(max(weight,0),4);weight/=max(dot(weight,1),.0001);
    uint texWidth,texHeight;albedo.GetDimensions(texWidth,texHeight);
    float2 aspect=float2(1,float(texWidth)/max(float(texHeight),1));
    float2 dx=ddx(uv),dy=ddy(uv);color=0;detail=0;r=0;
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
             float3 p,float3 normal,float seed,float normalY,float roughG,
             out float3 color,out float3 worldDetail,out float roughness){
    float3 w=pow(abs(normal),6);w/=max(dot(w,1),.0001);
    color=0;worldDetail=0;roughness=0;
    // Flat ground samples one projection. Cliff transitions blend projections.
    [unroll]for(int axis=0;axis<3;++axis)if(w[axis]>.005){
      float2 uv=axis==0?p.yz:axis==1?p.xz:p.xy;float3 c,d;float rr;
      plane(a,sa,n,sn,r,sr,uv,seed+axis*19,normalY,roughG,c,d,rr);
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
float patches=.52*macro+.30*f.noise(p.xy*.073+37)+.18*f.noise(p.xy*.29);
float b=smoothstep(.34,.68,patches);
float grit=.48*f.noise(p.xy*.041-46)+.32*f.noise(p.xy*.19+17)+.20*f.noise(p.xy*.81);
float c=smoothstep(.46,.69,grit)*(1-b*.7);
if(Biome==0)b=smoothstep(.24,.65,patches)*smoothstep(.38,.85,n.z);
if(Biome==3)b=saturate((b+.12)*smoothstep(.38,.85,n.z));
if(Biome==4){b*=smoothstep(.25,.88,n.z);c=max(c,(1-n.z)*.65);}
if(Biome==1){b*=.15;c*=.10;}
if(Biome==5){b*=.54;c*=.28;}
if(Biome==6){b=.12+smoothstep(.34,.73,patches)*.62;c=(1-smoothstep(.38,.75,n.z))*.74;}
if(Biome==0){ /*QUARRY_TRAIL*/ }
float3 ac,bc,cc,an,bn,cn;float ar,br,cr;
f.layer(Primary,PrimarySampler,NormalMap,NormalMapSampler,RoughMap,RoughMapSampler,p/Scales.x,n,0,NormalSigns.x,RoughChannels.x,ac,an,ar);
f.layer(Secondary,SecondarySampler,SecondaryNormal,SecondaryNormalSampler,SecondaryRough,SecondaryRoughSampler,p/Scales.y,n,7,NormalSigns.y,RoughChannels.y,bc,bn,br);
f.layer(Accent,AccentSampler,AccentNormal,AccentNormalSampler,AccentRough,AccentRoughSampler,p/Scales.z,n,29,NormalSigns.z,RoughChannels.z,cc,cn,cr);
if(Biome==0)cc*=float3(.84,.83,.78);
if(Biome==5)cc*=float3(.62,.57,.47);
float3 color=lerp(lerp(ac,bc,b),cc,c);
float3 relief=lerp(lerp(an,bn,b),cn,c);
float rough=lerp(lerp(ar,br,b),cr,c);
float broad=lerp(.78,1.13,smoothstep(.16,.84,macro));
float mineral=f.noise(p.xy*.012+p.z*.024);
color*=broad*lerp(float3(.94,.98,1.02),float3(1.05,1.01,.91),mineral);
float wet=smoothstep(.51,.77,patches)*Wetness;
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
  color*=float3(.79,.76,.70);
  float3 moistEarth=ac*float3(.34,.29,.25);
  color=lerp(color,moistEarth,floorWear*.94);
  // Wet-grass cover tears to damp earth below the sod, while the displaced
  // shoulder keeps irregular pieces of the original root/soil surface.
  color=lerp(color,ac*float3(.61,.55,.45),looseBank*.58);
}
if(Biome==5){color*=1-floorWear*.09;color*=1-looseBank*.035;}
Roughness=clamp(lerp(.66+rough*.31,.53,wet),.52,.99);
if(Biome==2||Biome==3)Roughness=lerp(Roughness,.32+rough*.10,floorWear*.94*(1-churn*.15));
if(Biome==0||Biome==2||Biome==3||Biome==5)Roughness=lerp(Roughness,.94,looseBank*.70);
SurfaceNormal=normalize(n+relief*(Biome==0?.78:.48)*(1-floorWear*.70));
if(Biome==6){
  // The Winter Scene's clean snow and crushed snow-road scans remain visible
  // at tire scale. Broken wet cover at the fringe becomes granular slush;
  // blue-grey hollows and sheltered wind ripples retain relief in bright sun.
  float granular=f.noise(p.xy*2.7+31);
  float slush=Wetness*smoothstep(.30,.67,grit)*(1-c);
  float hollow=.5+.5*sin(p.x*.39+p.y*.17+sin(p.y*.11)*1.4);
  // Scale exposure instead of clipping the bright scan into a white plateau.
  color*=float3(.66,.71,.76)*lerp(float3(.79,.87,.97),float3(1.02,1.01,.98),hollow);
  color*=lerp(.91,1.02,granular);
  color=lerp(color,color*float3(.45,.49,.51),slush*.82);
  color=lerp(color,color*float3(.34,.47,.63),floorWear*.94*(1-c*.35));
  color*=1+looseBank*.055;
  float scanGrain=(rough-.5)*.22;
  Roughness=lerp(lerp(lerp(.86,.62,b)+scanGrain,.40+scanGrain*.35,floorWear),.29+scanGrain*.3,slush);
  Roughness=lerp(Roughness,.87+scanGrain*.35,looseBank);
  Roughness=lerp(Roughness,.81,c);
  Roughness=clamp(Roughness,.24,.97);
  float phase=p.x*4.2+p.y*1.7+f.noise(p.xy*.31)*3;
  float2 wind=float2(.075,.030)*cos(phase)*(1-packed)*(1-slush);
  SurfaceNormal=normalize(n+relief*1.5*(1-floorWear*.90)+float3(wind,0));
}
if(Biome!=1&&Biome!=4&&looseBank>.01){
  // Small broken clods/grains belong to the raised loose shoulders, not
  // collision spikes. Footprint filtering suppresses distant shimmer.
  float sampling=max(length(ddx(p.xy)),length(ddy(p.xy)));
  float visible=1-smoothstep(.015,.070,sampling);
  float2 q=p.xy*(Biome==6?19:Biome==5?24:13);
  float gx=f.noise(q+float2(.21,0))-f.noise(q-float2(.21,0));
  float gy=f.noise(q+float2(0,.21))-f.noise(q-float2(0,.21));
  float clods=f.noise(q+17);
  float strength=(Biome==6?.25:Biome==5?.19:.38)*looseBank*visible;
  SurfaceNormal=normalize(SurfaceNormal+float3(float2(gx,gy)*strength,0));
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
  float sampling=max(length(ddx(p.xy)),length(ddy(p.xy)));
  float filtered=1-smoothstep(.020,.085,sampling);
  float tread=(Biome==2||Biome==3?.14:Biome==6?.10:.075)*packed*filtered*(1-churn*.83);
  float2 gradient=direction*cos(phase)+side*cos(phase)*sign(chevron)*cos(across*34)*.67;
  float breakup=(f.noise(p.xy*8.3+19)-.5)*churn*packed*filtered*.15;
  SurfaceNormal=normalize(SurfaceNormal+float3(gradient*tread+float2(breakup,-breakup),0));
  float lug=smoothstep(.66,.94,.5+.5*cos(phase));
  color*=1-lug*packed*filtered*(1-churn*.83)*(Biome==6?.14:Biome==2||Biome==3?.12:.065);
}
return max(color*.92,.006);
