(function(global){
'use strict';
const P=global.DerbyPhysics||(typeof require==='function'?require('./physics.js'):null);
const F=global.DerbyFit||(typeof require==='function'?require('./fit.js'):null);
const minor=f=>f.maxHeight<.001&&f.duration<.020;
const peakImpact=r=>Math.max(0,...r.flights.filter(f=>f.landed).map(f=>f.impact));
const defaults={objective:'fastest',maxMass:142,maxImpact:1};
function settings(raw={}){return {objective:['fastest','contact','impact'].includes(raw.objective)?raw.objective:defaults.objective,maxMass:Number.isFinite(raw.maxMass)?Math.max(50,Math.min(220,raw.maxMass)):142,maxImpact:Number.isFinite(raw.maxImpact)?Math.max(0,Math.min(10,raw.maxImpact)):1};}
function reason(r,opts){
 if(r.p.mass>opts.maxMass+1e-8)return 'Above mass limit';
 if(!r.finished)return 'Did not finish';
 if(opts.objective==='contact'&&r.flights.length)return 'Contact was lost';
 if(opts.objective==='impact'){
   if(r.status!=='finished')return 'Airborne at finish';
   if(peakImpact(r)>opts.maxImpact+1e-8)return 'Impact limit exceeded';
 }
 return '';
}
function candidates(data,params,rawOptions){
 const options=settings(rawOptions),items=[],seen=new Set();
 for(const a of [.8,.9,1,1.1,1.2])for(const b of [.8,.9,1,1.1,1.2]){
   const p=P.sanitize({...params,mass:params.mass*a,wheels:params.wheels*b});
   const key=p.mass.toFixed(4)+':'+p.wheels.toFixed(4);if(seen.has(key))continue;seen.add(key);
   const r=P.simulate(data,p),excluded=reason(r,options);items.push({p,r,excluded});
 }
 const eligible=items.filter(x=>!x.excluded).sort((a,b)=>a.r.time-b.r.time||peakImpact(a.r)-peakImpact(b.r));
 return {options,items,eligible};
}
function validParams(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Missing setup parameters.');
 for(const d of P.specs){const n=raw[d.key],lo=d.percent?d.min/100:d.min,hi=d.percent?d.max/100:d.max;if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi)throw Error('Invalid or out-of-range parameter: '+d.key);}
 return Object.fromEntries(P.specs.map(d=>[d.key,raw[d.key]]));
}
function cleanName(s){return typeof s==='string'?s.trim().slice(0,40)||'Untitled setup':'Untitled setup';}
function parseDocument(text){
 if(typeof text!=='string'||text.length>262144)throw Error('Setup file is too large (maximum 256 KB).');
 let raw;try{raw=JSON.parse(text);}catch{throw Error('This is not valid JSON.');}
 if(!raw||raw.format!=='derby-lab'||![2,3].includes(raw.version))throw Error('Unsupported setup format. Expected Derby Lab v2 or v3.');
 const params=validParams(raw.params),name=cleanName(raw.name);
 if(raw.records!==undefined&&(!Array.isArray(raw.records)||raw.records.length>12))throw Error('A setup file can contain at most 12 saved setups.');
 if(raw.version===3&&(raw.geometry===undefined||(raw.records||[]).some(r=>r?.geometry===undefined)))throw Error('Missing v3 fit dimensions.');
 const records=(raw.records||[]).map(r=>({name:cleanName(r?.name),p:validParams(r?.p),geometry:raw.version===2?{...F.defaults}:F.validate(r.geometry)}));
 return {params,name,records,options:settings(raw.options),geometry:raw.version===2?{...F.defaults}:F.validate(raw.geometry)};
}
function documentFor(params,name,options,records=[],geometry=F.defaults){return {format:'derby-lab',version:3,params:validParams(params),name:cleanName(name),options:settings(options),geometry:F.validate(geometry),records:records.map(r=>({name:cleanName(r.name),p:validParams(r.p),geometry:F.validate(r.geometry)}))};}
const api={minor,peakImpact,defaults,settings,reason,candidates,validParams,cleanName,parseDocument,documentFor};global.DerbyLabTools=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
