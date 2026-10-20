// Shared deterministic landscape fields. Geometry, contact classification and
// shader boundaries use the same metre-scale coordinates; no frame randomness.
const mix = (a, b, t) => a + (b - a) * t;
export const smoothField = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x, z) => {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export function landscapeNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
export function regionDistance(x, z, cx, cz, rx, rz, strength = 1) {
  const qx = (x - cx) / rx, qz = (z - cz) / rz;
  const d = Math.hypot(qx, qz);
  if (!strength || d > 1.23 || d < .5) return d;
  // Fade warp at the region's bounding rectangle, keeping every irregular
  // contact boundary inside its actual high-resolution rendered patch.
  const taper = Math.max(0, Math.min(1, Math.min(1 - Math.abs(qx), 1 - Math.abs(qz)) * 4));
  return d + ((landscapeNoise(x * .071 + cx, z * .063 + cz) - .5) * .105
    + (landscapeNoise(x * .021 - cz, z * .025 + cx) - .5) * .14) * taper * strength;
}
export function woodlandCover(x, z) {
  return smoothField(.26, .72, landscapeNoise(x * .022 + 37, z * .019 - 51) * .72 + landscapeNoise(x * .081, z * .073) * .28);
}
const rawTrail = z => (landscapeNoise(z * .011, 37) - .5) * 18 + (landscapeNoise(z * .037, -19) - .5) * 6;
const TRAIL_OFFSET = -3 - rawTrail(-44);
export const trailCenterAt = z => TRAIL_OFFSET + rawTrail(z);
export function naturalTerrainOffset(x, z) {
  const wx = x + (landscapeNoise(x * .011 + 23, z * .013) - .5) * 39;
  const wz = z + (landscapeNoise(x * .014, z * .012 - 17) - .5) * 34;
  const broad = landscapeNoise(wx * .019, wz * .017);
  const ridge = 1 - Math.abs(2 * landscapeNoise(wx * .043 + 41, wz * .038 - 16) - 1);
  const channel = Math.exp(-Math.pow((landscapeNoise(wx * .027 - 5, wz * .024 + 39) - .50) * 18, 2));
  return (broad - .5) * 4.7 + (ridge * ridge - .42) * 1.65 - channel * .48
    + (landscapeNoise(wx * .17, wz * .15) - .5) * .18;
}
export const SNOW_REGION = Object.freeze({ surface: 'snow', cx: -240, cz: 288, rx: 91, rz: 78 });
export function snowPackingAt(x, z) {
  const lane = -221 + 7 * Math.sin((z - 211) * .039) + 3 * Math.sin(z * .091);
  return (1 - smoothField(1.7, 4.8, Math.abs(x - lane))) * .70;
}
export function snowDepthAt(x, z) {
  const pack = snowPackingAt(x, z);
  return (.17 + landscapeNoise(x * .052 + 8, z * .047 - 13) * .40
    + Math.pow(landscapeNoise(x * .17, z * .13), 2) * .15) * (1 - pack * .76);
}
export const NATURAL_GLSL = /* glsl */`
float tdNaturalHash(ivec2 c) {
  uint h=uint(c.x)*374761393u+uint(c.y)*668265263u;
  h=(h^(h>>13u))*1274126177u; h=h^(h>>16u);
  return float(h)*(1./4294967296.);
}
float tdNaturalNoise(vec2 p) {
  vec2 c=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  ivec2 i=ivec2(c);
  vec4 h=vec4(tdNaturalHash(i),tdNaturalHash(i+ivec2(1,0)),tdNaturalHash(i+ivec2(0,1)),tdNaturalHash(i+ivec2(1)));
  return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
}
float tdTrailCenter(float z) {
  return ${TRAIL_OFFSET.toFixed(12)}+(tdNaturalNoise(vec2(z*.011,37.))-.5)*18.+(tdNaturalNoise(vec2(z*.037,-19.))-.5)*6.;
}
float tdRegionDistance(vec2 p,vec4 r) {
  vec2 q=(p-r.xy)/r.zw; float d=length(q);
  if(d>1.23 || d<.5) return d;
  float taper=clamp(min(1.-abs(q.x),1.-abs(q.y))*4.,0.,1.);
  return d+((tdNaturalNoise(p*vec2(.071,.063)+r.xy)-.5)*.105
    +(tdNaturalNoise(p*vec2(.021,.025)+vec2(-r.y,r.x))-.5)*.14)*taper;
}
float tdWoodland(vec2 p) {
  return smoothstep(.26,.72,tdNaturalNoise(p*vec2(.022,.019)+vec2(37.,-51.))*.72+tdNaturalNoise(p*vec2(.081,.073))*.28);
}
float tdSnowPacking(vec2 p) {
  float lane=-221.+7.*sin((p.y-211.)*.039)+3.*sin(p.y*.091);
  return (1.-smoothstep(1.7,4.8,abs(p.x-lane)))*.70;
}
`;
