// Source OBJ tires use X/Z as the radial plane and Y as the hub axis.
// Grow the carcass between the immutable stock bead and the chosen tread radius.
export function tireDiameterInches(stockRadius,sizeStage){const stock=stockRadius*2/.0254;return stock>=50?stock:Math.ceil(stock+(50-stock)*sizeStage/3);}
export function resizeTireObj(obj,stockRadius,targetRadius,beadRadius){
 const rows=obj.split('\n'),positions=rows.filter(l=>l.startsWith('v ')).map(l=>l.slice(2).split(' ').map(Number));let vi=0,ni=0;
 const k=(targetRadius-beadRadius)/(stockRadius-beadRadius);
 if(!(stockRadius>beadRadius&&targetRadius>=stockRadius&&Number.isFinite(k)))throw Error('Invalid tire growth envelope');
 return rows.map(line=>{
  if(line.startsWith('v ')){const [x,y,z]=positions[vi++],r=Math.hypot(x,z),newR=r<=beadRadius?r:beadRadius+(r-beadRadius)*k,s=r>1e-12?newR/r:1;return `v ${x*s} ${y} ${z*s}`;}
  if(line.startsWith('vn ')){const [x,,z]=positions[ni++],r=Math.hypot(x,z),n=line.slice(3).split(' ').map(Number);if(r<=beadRadius||r<1e-12)return line;const erx=x/r,erz=z/r,newR=beadRadius+(r-beadRadius)*k,b=newR/r,dot=n[0]*erx+n[2]*erz,nx=(n[0]-dot*erx)/b+dot*erx/k,nz=(n[2]-dot*erz)/b+dot*erz/k,len=Math.hypot(nx,n[1],nz);return `vn ${nx/len} ${n[1]/len} ${nz/len}`;}
  return line;
 }).join('\n');
}
