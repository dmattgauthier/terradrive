// Custom material expression. World metres keep coarse/detail terrain continuous.
struct TerraSurface {
  float hash(float2 p) { return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453); }
  float noise(float2 p) {
    float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);
    return lerp(lerp(hash(i),hash(i+float2(1,0)),f.x),
                lerp(hash(i+float2(0,1)),hash(i+1),f.x),f.y);
  }
  float3 plane(Texture2D tex,SamplerState samp,float2 uv,float seed) {
    float blend=smoothstep(.18,.82,noise(uv*.11+seed));
    float2 rotated=float2(-uv.y,uv.x)*1.417+float2(7.31,19.63)+seed;
    return lerp(Texture2DSample(tex,samp,uv).rgb,
                Texture2DSample(tex,samp,rotated).rgb,blend*.72);
  }
  float3 tri(Texture2D tex,SamplerState samp,float3 p,float3 w,float seed) {
    return plane(tex,samp,p.yz,seed)*w.x+
           plane(tex,samp,p.xz,seed+13)*w.y+
           plane(tex,samp,p.xy,seed+27)*w.z;
  }
};
TerraSurface f;
float3 p=World*.01;
float3 n=normalize(GeoNormal);
float3 w=pow(abs(n),4);w/=max(.0001,w.x+w.y+w.z);
float macro=f.noise(p.xy*.045+Biome*19);
float patches=.60*macro+.28*f.noise(p.xy*.16+37)+.12*f.noise(p.xy*.67);
float small=f.noise(p.xy*.41+13);
float b=smoothstep(.34,.65,patches);
float grit=.40*f.noise(p.xy*.09-46)+.28*f.noise(p.xy*.31+17)
          +.20*f.noise(p.xy*.9)+.12*f.noise(p.xy*2.1);
float c=smoothstep(.46,.68,grit)*(1-b*.7);
// Moss/vegetation prefers upward faces; rock becomes exposed on steep ground.
if(Biome==0||Biome==3) b*=saturate((n.z-.35)*1.8);
if(Biome==4) { b*=saturate(n.z*.85+.15);c=max(c,saturate(1-n.z)*.5); }
if(Biome==1) { b*=.22;c*=.16; }
if(Biome==5) { b*=.48;c*=.26; }
float3 aColor=f.tri(Primary,PrimarySampler,p/2.1,w,0);
float3 bColor=f.tri(Secondary,SecondarySampler,p/2.7,w,4);
float3 cColor=f.tri(Accent,AccentSampler,p/1.55,w,11);
// These photographs have different albedo ranges. The pale gravel source
// needs soil staining or its large patches read as snow after tonemapping.
if(Biome==0) cColor*=float3(.30,.27,.22);
if(Biome==5) bColor*=float3(.38,.34,.27);
float3 color=lerp(lerp(aColor,bColor,b),cColor,c);
float broad=lerp(.73,1.15,smoothstep(.15,.85,macro));
float mineral=f.noise(p.xy*.023+p.z*.017);
color*=broad*lerp(float3(.91,.97,1.03),float3(1.07,1.02,.87),mineral);
float wet=smoothstep(.50,.76,patches)*Wetness;
color*=lerp(1,.56,wet);
float2 uv=p.xy/2.1;
if(w.x>w.z&&w.x>w.y)uv=p.yz/2.1;
else if(w.y>w.z)uv=p.xz/2.1;
float rough=Texture2DSample(RoughMap,RoughMapSampler,uv).r;
// Soil stays rough. Very low values turn photographic patches into broad
// white sky/sun reflections, visually resembling snow on ordinary ground.
Roughness=clamp(lerp(.78+rough*.20,.52,wet),.52,.99);
float3 detail=Texture2DSample(NormalMap,NormalMapSampler,uv).xyz*2-1;
detail.y=-detail.y; // The supplied photographic maps use OpenGL green.
detail.xy*=.38;
detail.z=sqrt(saturate(1-dot(detail.xy,detail.xy)));
float3 ref=abs(n.y)>.95?float3(1,0,0):float3(0,1,0);
float3 tangent=normalize(cross(ref,n)),bitangent=cross(n,tangent);
SurfaceNormal=normalize(tangent*detail.x+bitangent*detail.y+n*detail.z);
if(Biome==6){
  float frost=smoothstep(.18,.57,patches)*saturate(n.z+.4);
  float grain=dot(aColor,float3(.3,.59,.11));
  color=lerp(cColor*.55,float3(.72,.82,.91)*( .82+grain*.35),frost*.86+.12);
  Roughness=.89;SurfaceNormal=normalize(lerp(n,SurfaceNormal,.35));
}
return max(color*.92,.008);
