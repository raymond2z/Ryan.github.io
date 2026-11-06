(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const id=()=>globalThis.crypto.randomUUID();
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const signature=r=>stable([r.mode,r.setup.params,r.setup.geometry,r.mode==='balance'?r.setup.dynamics:null]);
const text=(x,n=500)=>typeof x==='string'&&x.length<=n;
function validate(d){
 if(!d||d.format!=='classroom-experiments'||d.version!==1||!text(d.id,80)||!text(d.project,80)||!text(d.classCode,40)||!d.classCode.trim()||!text(d.student,40)||!d.student.trim()||!Array.isArray(d.runs)||d.runs.length>2000)throw Error('Invalid experiment record.');
 const ids=new Set();for(const r of d.runs){if(!r||!text(r.id,80)||ids.has(r.id)||!['race','balance'].includes(r.mode)||!text(r.prediction)||!text(r.observation)||!text(r.changed)||!r.setup||!r.result||!Number.isFinite(r.result.time)||r.result.time<0||!text(r.result.status,80)||!Number.isFinite(Date.parse(r.createdAt))||(r.measured!==null&&(!Number.isFinite(r.measured)||r.measured<=0||r.measured>3600)))throw Error('Invalid experiment entry.');ids.add(r.id);}
 if(d.final&&(!ids.has(d.final.runId)||!text(d.final.reason)||!d.final.reason.trim()||!Number.isFinite(Date.parse(d.final.createdAt))))throw Error('Invalid final selection.');
 return copy(d);
}
function parse(s){if(typeof s!=='string'||s.length>5e6)throw Error('Maximum file size is 5 MB.');return validate(JSON.parse(s));}
function create(classCode,student){return {format:'classroom-experiments',version:1,id:id(),project:'derby-lab',classCode:classCode.trim(),student:student.trim(),createdAt:new Date().toISOString(),runs:[],final:null};}
function add(doc,run){if(doc.runs.length>=2000)throw Error('Record full. Export and start a new session.');const d=copy(doc);d.runs.push({...copy(run),id:id(),createdAt:new Date().toISOString()});return validate(d);}
function finalize(doc,runId,reason){const d=copy(doc);d.final={runId,reason:reason.trim(),createdAt:new Date().toISOString()};return validate(d);}
function summary(d){const best=mode=>{const r=d.runs.filter(r=>r.mode===mode&&r.result.status==='finished');return r.length?Math.min(...r.map(r=>r.result.time)):null;};return {count:d.runs.length,designs:new Set(d.runs.map(r=>signature(r))).size,raceBest:best('race'),balanceBest:best('balance')};}
function csvCell(x){let s=String(x??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
const api={copy,parse,validate,create,add,finalize,summary,csvCell};root.ExperimentRecords=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
