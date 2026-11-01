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
 bodyFrontEndM:2.332+(.5-r.simulated.frontWeightFraction)*r.wheelbase,bodyRearEndM:2.292-(.5-r.simulated.frontWeightFraction)*r.wheelbase,
 tireSize:r.tireSize,tireRadius:r.tireRadius,tireWidth:r.tireWidth,tireType:electric?'all-terrain':'road-performance',rimDiameterInches:electric?20:22,stockPSI:38,stockPSIFront:38,stockPSIRear:38,
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
export const G580=makeG(true);
const StandardG63=makeG(false);
// Original native portal variants. Dimensions/output are reference quantities;
// CG, rates, pressures, portal drop and torque distribution are simulator tuning.
export const G63={...StandardG63,name:'Mercedes-AMG G 63 4x4 squared',year:2023,gClassVariant:'squared',
 trim:'4.0 V8 / factory portal axles / 22-inch wheels',width:2.10,height:2.250,mass:2965,curbMass:2965,
 massStatus:'Estimated operating mass for the portal-axle variant',track:1.78,trackFront:1.78,trackRear:1.78,
 tireSize:'325/55R22',tireRadius:.45815,tireWidth:.325,rearTireWidth:.325,tireType:'mud-terrain',rimDiameterInches:22,
 cgHeight:1.03,clearance:.351,factoryPortalLiftM:.21,
 suspension:{...StandardG63.suspension,travel:.26,restLength:.40,springRate:62000,damping:6800},
 notes:[...StandardG63.notes,'Factory 4x4 squared portal stance; upgraded portal stages reinforce/regear the original drop boxes rather than stack another conversion.'],
 sources:[...StandardG63.sources,'https://www.mercedes-amg.com/en/mercedes-amg-g63-4x4-walkaround']};
export const G63SIX={...StandardG63,id:'mercedes-amg-g63-6x6',name:'Mercedes-Benz G 63 AMG 6x6',year:2014,
 bodyStyle:'g63six',gClassVariant:'six',color:'#b5b7aa',trim:'5.5 biturbo V8 / three portal axles / five locks',
 powerHP:400000/745.699872,torqueNm:760,torqueLbFt:760/1.3558179483,mass:3850,curbMass:3850,
 length:5.875,bodyLength:5.875,width:2.110,height:2.210,wheelbase:4.220,track:1.790,trackFront:1.790,trackRear:1.790,
 wheelCount:6,axleCount:3,axleOffsetsM:[2.10,-1.02,-2.12],axleTorqueShares:[.30,.40,.30],
 bodyFrontEndM:2.94,bodyRearEndM:2.935,frontWeightFraction:1.57/3.67,cgHeight:1.06,clearance:.46,
 tireSize:'37x12.5R18',tireRadius:.4699,tireWidth:.3175,rearTireWidth:.3175,tireType:'mud-terrain',rimDiameterInches:18,
 stockPSI:32,stockPSIFront:32,stockPSIRear:32,factoryPortalLiftM:.16,factoryTireAirStage:3,
 transmissionName:'AMG SPEEDSHIFT PLUS 7G-TRONIC',gears:[4.377,2.859,1.921,1.368,1,.820,.728],reverseRatio:3.416,
 finalDrive:7.56,lowRatio:2.16,frontTorqueFraction:.30,topSpeedMPH:99.4,defaultMode:'6WD',driveModes:['6WD'],
 engine:{idleRPM:700,redlineRPM:6000,peakTorqueRPM:2000,peakPowerRPM:5500,curve:[[700,250],[1500,600],[2000,760],[5000,760],[5500,694.5],[6000,600]]},
 suspension:{travel:.28,restLength:.40,springRate:60000,damping:6800,antiRoll:24000,frontType:'solid live portal axle with coils',rearType:'solid live portal axles with coils',parameterStatus:'Three independent axle pairs; simulator rates, not OEM measured wheel rates.'},
 notes:['Three driven portal axles and six tire contacts. Rear switch selects both rear cross-axle locks; center switch selects both longitudinal locks, giving five physical lock states through three controls.',
 'Single/dual/quad motor conversion counts are retained. Rear motor output is divided through the tandem driveline; the third axle does not invent additional motors. Individual track pods are unavailable on the tandem chassis.',
 'CG, load shares, final reduction, tire pressures, portal drop and suspension rates are simulation calibration estimates.'],
 sources:['https://media.mercedes-benz.jp/G-63-AMG-6%C3%976%E3%82%92%E9%99%90%E5%AE%9A%E7%99%BA%E5%A3%B2/']};
export const EARTHCRUISER={...EARTHCRUISER_EXP_SPEC,rimDiameterInches:17,bodyFrontEndM:2.70+(.5-EARTHCRUISER_EXP_SPEC.frontWeightFraction)*EARTHCRUISER_EXP_SPEC.wheelbase,bodyRearEndM:3.30-(.5-EARTHCRUISER_EXP_SPEC.frontWeightFraction)*EARTHCRUISER_EXP_SPEC.wheelbase};
export const VEHICLES=[...BrowserVehicles.slice(0,4),HUMMER,URUS,EARTHCRUISER,G580,G63,G63SIX];
