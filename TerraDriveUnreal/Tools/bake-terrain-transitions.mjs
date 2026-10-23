// Native-only coverage masks. The browser and original collision/surface field stay immutable.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'SourceAssets'),data=path.join(root,'Content/NativeData');
const bytes=fs.readFileSync(path.join(data,'terrain.bin')),n=bytes.readUInt32LE(4),step=bytes.readFloatLE(8),origin=bytes.readFloatLE(12),count=n*n;
if(bytes.readUInt32LE(0)!==0x54445256||n!==1601)throw Error('Unexpected source field');
const names=['dirt','asphalt','mud','wetland','rock','sand','snow'];
// Half-width in metres: pavement keeps an identifiable edge; natural cover has broader fringes.
const widths=[[0,.65,3.5,5,4,6,7],[.65,0,.65,.65,.65,.65,.65],[3.5,.65,0,3,.8,3,4],[5,.65,3,0,2,4,4],[4,.65,.8,2,0,4,6],[6,.65,3,4,4,0,5],[7,.65,4,4,6,5,0]];
const hash=crypto.createHash('sha256').update(bytes).update(fs.readFileSync(import.meta.filename)).digest('hex');
const reportFile=path.join(root,'Saved/terrain-transitions.json');
if(fs.existsSync(reportFile)&&JSON.parse(fs.readFileSync(reportFile)).signature===hash&&['TerrainBlendA.tga','TerrainBlendB.tga'].every(f=>fs.existsSync(path.join(source,f)))&&['terrain-blend.bin','terrain-transitions.json'].every(f=>fs.existsSync(path.join(data,f)))){console.log('Terrain transition masks unchanged');process.exit(0);}
const surfaces=new Uint8Array(count);for(let i=0;i<count;i++)surfaces[i]=bytes[16+i*9+8];
const f=new Float64Array(n),d=new Float64Array(n),v=new Int32Array(n),z=new Float64Array(n+1);
function line(){let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
 for(let q=1;q<n;q++){let s;do{s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*(q-v[k]));if(s<=z[k])k--;else break;}while(k>=0);if(k<0){k=0;v[0]=q;z[0]=-Infinity;z[1]=Infinity;}else{v[++k]=q;z[k]=s;z[k+1]=Infinity;}}
 k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;d[q]=(q-v[k])**2+f[v[k]];}}
const distances=[];
for(let type=0;type<7;type++){
 const field=new Float32Array(count);
 for(let r=0;r<n;r++){for(let c=0;c<n;c++)f[c]=surfaces[r*n+c]===type?0:1e12;line();for(let c=0;c<n;c++)field[r*n+c]=d[c];}
 for(let c=0;c<n;c++){for(let r=0;r<n;r++)f[r]=field[r*n+c];line();for(let r=0;r<n;r++)field[r*n+c]=d[r];}
 distances.push(field);
}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function jitter(x,y,a,b){if(a===1||b===1)return 0;return (.55*Math.sin(x*.19+Math.sin(y*.11)*2.1)*Math.sin(y*.17+.8)+.3*Math.sin(x*.61-y*.43)+.15*Math.sin(y*1.7+x*1.3));}
const coverage=Buffer.alloc(count*7),raw=new Float64Array(7),totals=Array(7).fill(0);let boundaryPixels=0,interiorPixels=0;
for(let r=0;r<n;r++)for(let c=0;c<n;c++){
 const i=r*n+c,own=surfaces[i],x=origin+r*step,y=origin+c*step;let sum=1;raw.fill(0);raw[own]=1;
 for(let other=0;other<7;other++)if(other!==own){const width=widths[own][other],distance=Math.sqrt(distances[other][i])*step-step*.5;if(distance>width*1.4)continue;
  const a=Math.min(own,other),b=Math.max(own,other),signed=(own===a?-distance:distance)+jitter(x,y,a,b)*width*.38;
  const towardB=smooth(-width,width,signed),otherWeight=own===a?towardB:1-towardB;
  const score=Math.min(.98,otherWeight)/Math.max(.02,1-otherWeight);raw[other]=score;sum+=score;
 }
 let qsum=0,largest=own;for(let k=0;k<7;k++){if(raw[k]>raw[largest])largest=k;const q=Math.round(raw[k]/sum*255);coverage[i*7+k]=q;qsum+=q;}
 coverage[i*7+largest]+=255-qsum;
 let active=0;for(let k=0;k<7;k++){totals[k]+=coverage[i*7+k]/255;if(coverage[i*7+k])active++;}
 if(active>1)boundaryPixels++;else interiorPixels++;
}
fs.mkdirSync(source,{recursive:true});fs.mkdirSync(path.join(root,'Saved'),{recursive:true});
for(let group=0;group<2;group++){
 const tga=Buffer.alloc(18+count*4);tga[2]=2;tga.writeUInt16LE(n,12);tga.writeUInt16LE(n,14);tga[16]=32;tga[17]=0x28;
 for(let i=0;i<count;i++){const at=18+i*4,base=group*4;const w=k=>base+k<7?coverage[i*7+base+k]:0;tga[at]=w(2);tga[at+1]=w(1);tga[at+2]=w(0);tga[at+3]=w(3);}
 fs.writeFileSync(path.join(source,group?'TerrainBlendB.tga':'TerrainBlendA.tga'),tga);
}
const native=Buffer.alloc(16+coverage.length);native.writeUInt32LE(0x54425731);native.writeUInt32LE(n,4);native.writeFloatLE(step,8);native.writeFloatLE(origin,12);coverage.copy(native,16);fs.writeFileSync(path.join(data,'terrain-blend.bin'),native);
const targets={'0-1':[-186,126],'0-2':[-115,-8],'0-3':[77,24],'0-4':[42,-112],'0-5':[-178,-195],'0-6':[230,136],'2-4':[-115,-48]},fixtures=new Map();
for(let r=2;r<n-2;r++)for(let c=2;c<n-2;c++){
 const i=r*n+c,a=surfaces[i];for(const [dr,dc] of [[1,0],[0,1]]){const other=surfaces[(r+dr)*n+c+dc];if(a===other)continue;const lo=Math.min(a,other),hi=Math.max(a,other),key=lo+'-'+hi;if(!targets[key])continue;
  const x=origin+(r+dr*.5)*step,y=origin+(c+dc*.5)*step;const score=(x-targets[key][0])**2+(y-targets[key][1])**2;
  if(!fixtures.has(key)||fixtures.get(key).score>score){let nx=dr*(other===hi?1:-1),ny=dc*(other===hi?1:-1);fixtures.set(key,{pair:[lo,hi],name:names[lo]+'-'+names[hi],p:[x*100,y*100],normal:[nx,ny],halfWidthM:widths[lo][hi],score});}
 }}
const report={version:1,signature:hash,sourceTerrainSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),n,stepM:step,originM:origin,names,halfWidthsM:widths,boundaryPixels,interiorPixels,coverageAreaM2:totals.map(x=>x*step*step),fixtures:[...fixtures.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(({score,...v})=>v)};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));fs.writeFileSync(path.join(data,'terrain-transitions.json'),JSON.stringify({version:1,fixtures:report.fixtures}));
console.log(JSON.stringify({n,boundaryPixels,interiorPixels,fixtures:report.fixtures.map(f=>f.name)}));
