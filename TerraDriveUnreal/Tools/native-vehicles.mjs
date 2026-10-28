import {VEHICLES as BrowserVehicles} from '../../TerraDrive-v1.13/dist/src/vehicles.js';
// Original ICE Performante, not the later SE hybrid. Dimensions and rated
// peaks: Lamborghini brochure linked in docs/lighting-tracks-urus.md.
export const URUS={
 ...BrowserVehicles[2],id:'urus-performante',name:'Lamborghini Urus Performante',brand:'Lamborghini',year:2024,
 trim:'4.0 twin-turbo V8 / 8-speed / steel coils',bodyStyle:'urus',color:'#e7c51b',
 powerHP:490000/745.699872,torqueNm:850,torqueLbFt:626.93,
 mass:2250,curbMass:2250,massStatus:'Simulation operating mass estimate; brochure dry mass is 2157 kg',
 length:5.137,width:2.026,height:1.618,wheelbase:3.006,track:1.695,
 frontWeightFraction:.58,cgHeight:.62,clearance:.158,
 tireSize:'285/40R22',tireWidth:.285,rearTireWidth:.325,tireRadius:.3934,tireType:'road-performance',stockPSI:36,
 transmissionName:'8-speed automatic',gears:[4.714,3.143,2.106,1.667,1.285,1,.839,.667],reverseRatio:3.317,finalDrive:3.204,
 lowRatio:1,defaultMode:'AWD',driveModes:['AWD'],frontTorqueFraction:.40,dragCoefficient:.36,
 engine:{idleRPM:750,redlineRPM:6800,peakTorqueRPM:2300,peakPowerRPM:6000,
 curve:[[750,220],[1500,610],[2300,850],[4500,850],[6000,779.86],[6800,620]],curveStatus:'Estimated interpolation through published rated peaks'},
 suspension:{travel:.19,restLength:.35,springRate:47000,damping:5100,antiRoll:26000,frontType:'independent multi-link steel coils',rearType:'independent multi-link steel coils',parameterStatus:'Simulation tuning, not measured wheel rates'},
 features:{frontLocker:false,rearLocker:false,swayDisconnect:false,tractionControl:true,abs:true,hillDescent:true},
 notes:['Original V8 Performante with steel springs, carbon bonnet, roof spoiler and staggered 22-inch tires.','Mass, chassis coefficients and automatic gearing are simulation estimates. Factory active chassis and vectoring are not fully reproduced.'],
 sources:['https://www.lamborghini.com/en-en/history/urus-performante']
};
// SUV 20-module pack: 170 kWh rated C/3 simulation basis; primary sources and
// model-year/usable-capacity limits are in docs/electric-pressure-research.md.
const HUMMER={...BrowserVehicles[4],electricMotors:3,batteryKWh:170,electricReduction:9,motorMaxRPM:16000,frontTorqueFraction:1/3,topSpeedMPH:106};
import {EARTHCRUISER_EXP_SPEC} from './earthcruiser-exp.mjs';
import {GCLASS_REFERENCE_SPECS as G} from './mercedes-gclass.mjs';
const makeG=(electric)=>{
 const r=electric?G.g580:G.g63;
 return {...BrowserVehicles[0],id:electric?'mercedes-g580-ev':'mercedes-amg-g63',name:r.name,brand:'Mercedes-Benz',year:2025,
 trim:electric?'EQ Technology / four motors / DesignBox':'AMG 4.0 V8 / 9-speed / covered spare',bodyStyle:electric?'g580':'g63',color:electric?'#b9c2ba':'#536067',
 powerHP:r.powerKW*1000/745.699872,torqueNm:r.torqueNm,torqueLbFt:r.torqueNm/1.3558179483,mass:r.curbMassUSKG,curbMass:r.curbMassUSKG,
 length:electric?4.728:4.873,width:electric?1.931:1.984,height:electric?1.986:1.979,wheelbase:r.wheelbase,track:r.trackFront,trackFront:r.trackFront,trackRear:r.trackRear,
 bodyFrontEndM:2.249+(.5-r.simulated.frontWeightFraction)*r.wheelbase,bodyRearEndM:2.375-(.5-r.simulated.frontWeightFraction)*r.wheelbase,
 tireSize:r.tireSize,tireRadius:r.tireRadius,tireWidth:r.tireWidth,tireType:'all-terrain',rimDiameterInches:20,stockPSI:38,stockPSIFront:38,stockPSIRear:38,
 pressureStatus:'38 PSI simulator calibration; verify the real vehicle placard for actual tires/load.',cgHeight:r.simulated.cgHeight,frontWeightFraction:r.simulated.frontWeightFraction,clearance:.25,
 electricMotors:electric?4:0,batteryKWh:electric?116:0,electricReduction:12.4,motorMaxRPM:16000,wheelTorqueNm:electric?1164*12.4*.95:0,topSpeedMPH:r.topSpeedMPH,
 powertrain:electric?'electric':'combustion',transmissionName:electric?'Four individual two-speed drive units':'AMG SPEEDSHIFT TCT 9G',gears:electric?[1]:r.forwardRatios,reverseRatio:electric?1:r.reverseRatio,finalDrive:electric?1:3.45,lowRatio:r.lowRangeRatio,
 defaultMode:'AWD',driveModes:['AWD'],frontTorqueFraction:electric?.5:.4,dragCoefficient:.5,
 features:{frontLocker:!electric,rearLocker:!electric,swayDisconnect:false,tractionControl:true,abs:true,hillDescent:true},
 engine:electric?{idleRPM:0,redlineRPM:16000,peakTorqueRPM:0,peakPowerRPM:8000,curve:[[0,1164],[8000,516],[16000,0]]}:{idleRPM:700,redlineRPM:6500,peakTorqueRPM:2500,peakPowerRPM:6000,curve:[[700,250],[1500,600],[2500,850],[3500,850],[6000,684.37],[6500,590]]},
 suspension:{travel:r.simulated.suspensionTravel,restLength:r.simulated.suspensionRestLength,springRate:electric?65000:62000,damping:electric?7200:6500,antiRoll:28000,frontType:r.frontSuspension,rearType:electric?'De-Dion rear beam with coils':'solid live rear axle with coils',parameterStatus:'Simulation wheel-rate/rest/travel/damping calibration; not measured Mercedes suspension.'},
 notes:[r.differentialControl,'Published dimensions and rated outputs; panel stations, pressure, CG, spring/damper rates, final reduction and operating responses are estimates.'],
 sources:['https://www.mbusa.com/en/future-vehicles/2025-mercedes-benz-electric-g-class','https://www.mbusa.com/en/vehicles/model/g-class/suv/g63w4']};
};
export const G580=makeG(true),G63=makeG(false);
export const EARTHCRUISER={...EARTHCRUISER_EXP_SPEC,rimDiameterInches:17,bodyFrontEndM:2.70+(.5-EARTHCRUISER_EXP_SPEC.frontWeightFraction)*EARTHCRUISER_EXP_SPEC.wheelbase,bodyRearEndM:3.30-(.5-EARTHCRUISER_EXP_SPEC.frontWeightFraction)*EARTHCRUISER_EXP_SPEC.wheelbase};
export const VEHICLES=[...BrowserVehicles.slice(0,4),HUMMER,URUS,EARTHCRUISER,G580,G63];
