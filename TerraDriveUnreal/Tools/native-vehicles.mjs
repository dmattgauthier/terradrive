import {VEHICLES as BrowserVehicles} from '../../TerraDrive-v1.13/dist/src/vehicles.js';
// Original ICE Performante, not the later SE hybrid. Dimensions and rated
// peaks: Lamborghini brochure linked in docs/lighting-tracks-urus.md.
export const URUS={
 ...BrowserVehicles[2],id:'urus-performante',name:'Lamborghini Urus Performante',brand:'Lamborghini',year:2024,
 trim:'4.0 twin-turbo V8 / 8-speed / steel coils',bodyStyle:'urus',color:'#d5df27',
 powerHP:490000/745.699872,torqueNm:850,torqueLbFt:626.93,
 mass:2250,curbMass:2250,massStatus:'Simulation operating mass estimate; brochure dry mass is 2157 kg',
 length:5.137,width:2.026,height:1.618,wheelbase:3.006,track:1.695,
 frontWeightFraction:.58,cgHeight:.62,clearance:.158,
 tireSize:'285/40R22',tireWidth:.285,rearTireWidth:.325,tireRadius:.3934,tireType:'road',stockPSI:36,
 transmissionName:'8-speed automatic',gears:[4.714,3.143,2.106,1.667,1.285,1,.839,.667],reverseRatio:3.317,finalDrive:3.204,
 lowRatio:1,defaultMode:'AWD',driveModes:['AWD'],frontTorqueFraction:.40,dragCoefficient:.36,
 engine:{idleRPM:750,redlineRPM:6800,peakTorqueRPM:2300,peakPowerRPM:6000,
 curve:[[750,220],[1500,610],[2300,850],[4500,850],[6000,779.86],[6800,620]],curveStatus:'Estimated interpolation through published rated peaks'},
 suspension:{travel:.19,restLength:.35,springRate:47000,damping:5100,antiRoll:26000,frontType:'independent multi-link steel coils',rearType:'independent multi-link steel coils',parameterStatus:'Simulation tuning, not measured wheel rates'},
 features:{frontLocker:false,rearLocker:false,swayDisconnect:false,tractionControl:true,abs:true,hillDescent:true},
 notes:['Original V8 Performante with steel springs, carbon bonnet, roof spoiler and staggered 22-inch tires.','Mass, chassis coefficients and automatic gearing are simulation estimates. Factory active chassis and vectoring are not fully reproduced.'],
 sources:['https://www.lamborghini.com/en-en/history/urus-performante']
};
export const VEHICLES=[...BrowserVehicles,URUS];
