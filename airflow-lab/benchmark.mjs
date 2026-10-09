import {runCpuTrial,configKey,compareFields} from './benchmark-core.mjs';

const $=id=>document.getElementById(id);
const records=[];
let busy=false,cancelled=false,activeWorker=null,activeReject=null,nextId=0;
const controlIds=['grid','shape','speed','steps','repeats'];
const inputs=[...controlIds.map($),...document.querySelectorAll('input[name=engine]')];
let wasmReady=false;
const engineName=e=>e==='worker'?'JS Worker':e==='wasm'?'Rust / WASM':'JavaScript';
const fmt=(x,d=1)=>Number.isFinite(x)?x.toLocaleString(undefined,{maximumFractionDigits:d}):'—';
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const config=()=>({grid:$('grid').value,shape:$('shape').value,speed:Number($('speed').value),steps:Number($('steps').value)});
const chosenEngine=()=>document.querySelector('input[name=engine]:checked').value;
function busyMode(value){
  busy=value;inputs.forEach(e=>e.disabled=value||(e.value==='worker'&&!('Worker' in window))||(e.value==='wasm'&&!wasmReady));
  $('runSelected').disabled=value;$('compareCpu').disabled=value||!('Worker' in window);
  $('compareRust').disabled=value||!wasmReady;
  $('stopRun').disabled=!value;$('progressArea').hidden=!value;
}
function reportProgress(message,completed,total){
  $('progressText').textContent=message;$('announcements').textContent=message;
  const percent=Math.min(100,Math.max(0,100*completed/total));
  $('progress').value=percent;$('progressPercent').textContent=fmt(percent,0)+'%';
}
function frameMonitor(){
  let active=true,last=0,hidden=false;const gaps=[];
  function tick(now){
    if(!active)return;
    if(document.hidden){hidden=true;last=0;}
    else if(last)gaps.push(now-last);
    last=now;requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return ()=>{
    active=false;
    if(!gaps.length)return {fps:NaN,worstGap:NaN,hidden};
    return {fps:1000*gaps.length/gaps.reduce((a,b)=>a+b,0),worstGap:Math.max(...gaps),hidden};
  };
}
function workerTrial(settings,onProgress,engine='worker'){
  return new Promise((resolve,reject)=>{
    if(!('Worker' in window)){reject(new Error('Web Worker unavailable'));return;}
    const path=engine==='wasm'?'./wasm-worker.mjs':'./benchmark-worker.mjs';
    const worker=new Worker(new URL(path,import.meta.url),{type:'module'});
    activeWorker=worker;activeReject=reject;
    const cleanup=()=>{worker.terminate();if(activeWorker===worker)activeWorker=null;if(activeReject===reject)activeReject=null;};
    worker.onmessage=({data})=>{
      if(data.type==='progress')onProgress(data.progress);
      if(data.type==='done'){cleanup();resolve(data.result);}
      if(data.type==='error'){cleanup();reject(new Error(data.error));}
    };
    worker.onerror=e=>{e.preventDefault();cleanup();reject(new Error(e.message||'Worker failed to start'));};
    worker.onmessageerror=()=>{cleanup();reject(new Error('Worker message could not be read'));};
    worker.postMessage({type:'run',runId:1,config:settings});
  });
}
async function oneTrial(engine,settings,onProgress){
  const stop=frameMonitor();
  try{
    const result=engine==='javascript'
      ?await runCpuTrial(settings,{onProgress,checkCancelled:()=>cancelled})
      :await workerTrial(settings,onProgress,engine);
    return {...result,ui:stop()};
  }catch(error){stop();throw error;}
}
function aggregate(engine,samples){
  const last=samples.at(-1);
  return {id:++nextId,engine,key:configKey(last),config:last,metrics:last.metrics,
    solidCells:last.solidCells,preview:last.preview,samples,finishedAt:new Date().toISOString(),
    computeMs:median(samples.map(s=>s.computeMs)),
    wallMs:median(samples.map(s=>s.wallMs)),
    throughput:median(samples.map(s=>s.stepsPerSecond)),
    uiFps:median(samples.map(s=>s.ui.fps)),
    worstGap:Math.max(...samples.map(s=>s.ui.worstGap)),
    hidden:samples.some(s=>s.ui.hidden)};
}
function comparison(record){
  const other=records.find(r=>r.id!==record.id&&r.engine!==record.engine&&r.key===record.key);
  if(!other)return {text:'Not paired',css:''};
  const result=compareFields(record.metrics,other.metrics);
  const isRust=record.engine==='wasm'||other.engine==='wasm';
  const tolerance=isRust?1e-7:1e-9;
  const same=result.maxDifference<=tolerance&&record.solidCells===other.solidCells;
  return {text:same?(isRust?'Within tolerance':'Match'):'Different',css:same?'pass':'warn',difference:result.maxDifference};
}
function heatmap(record){
  const d=record.preview,off=document.createElement('canvas');
  off.width=d.width;off.height=d.height;
  const oc=off.getContext('2d'),img=oc.createImageData(d.width,d.height);
  for(let i=0;i<d.speeds.length;i++){
    const k=i*4,v=d.speeds[i]/255;
    if(d.solids[i]){img.data[k]=237;img.data[k+1]=246;img.data[k+2]=244;}
    else{img.data[k]=9+v*230;img.data[k+1]=25+v*169;img.data[k+2]=45+v*55;}
    img.data[k+3]=255;
  }
  oc.putImageData(img,0,0);
  const canvas=$('fieldPreview'),ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;ctx.drawImage(off,0,0,canvas.width,canvas.height);
  $('previewLabel').textContent=engineName(record.engine)+' · '+record.config.grid;
}
function showLatest(r){
  $('liveThroughput').textContent=fmt(r.throughput,0);
  $('liveFps').textContent=fmt(r.uiFps,1);
  $('worstFrame').textContent=fmt(r.worstGap,1);
  $('liveCompute').textContent=fmt(r.computeMs,1);
  heatmap(r);
  const pair=comparison(r);
  $('agreement').textContent=pair.text==='Not paired'
    ?'No matching test yet. Run both CPU engines to check the computed fields.'
    :(pair.text==='Match'?'Numerical summaries agree. ':'Numerical difference detected. ')+
      'Maximum difference across mean density, x/y velocity and kinetic energy: '+pair.difference.toExponential(3)+'.'+
      (r.hidden?' Tab was hidden: FPS is not reliable.':'');
}
function render(){
  const tbody=$('resultsBody');tbody.replaceChildren();
  if(!records.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=8;td.className='empty';td.textContent='No measurements yet. Try “Compare both CPU engines”.';
    tr.append(td);tbody.append(tr);
  }
  for(const r of [...records].reverse()){
    const tr=document.createElement('tr'),pair=comparison(r);
    const cells=[
      engineName(r.engine)+' · '+r.samples.length+' run(s)',
      r.config.grid+' / '+r.config.shape+' · '+r.config.speed.toFixed(3),
      String(r.config.steps),fmt(r.computeMs,1)+' ms',fmt(r.throughput,0),
      (r.hidden?'⚠ ':'')+fmt(r.uiFps,1),fmt(r.worstGap,1)+' ms',pair.text
    ];
    cells.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i===7)td.className=pair.css;tr.append(td);});
    tbody.append(tr);
  }
  $('exportCsv').disabled=records.length===0;$('clearResults').disabled=records.length===0;
  const last=records.at(-1);
  const other=last&&records.find(r=>r.id!==last.id&&r.engine!==last.engine&&r.key===last.key);
  $('bars').hidden=!(last&&other);
  const root=$('barRows');root.replaceChildren();
  if(last&&other){
    const max=Math.max(last.throughput,other.throughput);
    for(const r of [other,last]){
      const row=document.createElement('div');row.className='bar-line';
      const name=document.createElement('span');name.textContent=engineName(r.engine);
      const track=document.createElement('div');track.className='bar-track';
      const fill=document.createElement('div');fill.className='bar-fill';fill.style.width=(100*r.throughput/max).toFixed(1)+'%';
      const value=document.createElement('strong');value.textContent=fmt(r.throughput,0)+' /s';
      track.append(fill);row.append(name,track,value);root.append(row);
    }
  }
}
async function run(engines){
  if(busy)return;
  cancelled=false;busyMode(true);
  const settings=config(),repeats=Number($('repeats').value),total=engines.length*repeats;
  let finished=0;
  try{
    for(const engine of engines){
      const samples=[];
      for(let index=0;index<repeats;index++){
        if(cancelled)throw new Error('Cancelled');
        const title=engineName(engine)+' · run '+(index+1)+'/'+repeats;
        reportProgress(title,finished,total);
        const sample=await oneTrial(engine,settings,p=>{
          reportProgress(title+' · '+p.done+'/'+p.total+' steps',finished+p.done/settings.steps,total);
        });
        samples.push(sample);finished++;reportProgress(title+' complete',finished,total);
      }
      const result=aggregate(engine,samples);records.push(result);render();showLatest(result);
    }
    $('announcements').textContent='Benchmark finished. Results are listed below.';
  }catch(error){
    const message=cancelled?'Benchmark stopped. Completed runs remain available.':'Benchmark failed: '+String(error.message||error);
    $('agreement').textContent=message;$('announcements').textContent=message;
  }finally{
    if(activeWorker){activeWorker.terminate();activeWorker=null;}
    activeReject=null;busyMode(false);render();
  }
}
$('runSelected').addEventListener('click',()=>run([chosenEngine()]));
$('compareCpu').addEventListener('click',()=>run(['javascript','worker']));
$('compareRust').addEventListener('click',()=>run(['worker','wasm']));
$('stopRun').addEventListener('click',()=>{
  if(!busy)return;
  cancelled=true;
  if(activeWorker){activeWorker.terminate();activeWorker=null;}
  if(activeReject){const reject=activeReject;activeReject=null;reject(new Error('Cancelled'));}
});
$('clearResults').addEventListener('click',()=>{
  if(busy)return;records.length=0;render();
  $('agreement').textContent='Run both CPU modes with identical settings to compare numerical agreement.';
  $('previewLabel').textContent='No result yet';
  const ctx=$('fieldPreview').getContext('2d');ctx.fillStyle='#0b1a29';ctx.fillRect(0,0,640,280);
});
$('exportCsv').addEventListener('click',()=>{
  if(!records.length)return;
  const headings=['timestamp','engine','grid','shape','speed','steps','repeats','median_compute_ms',
    'median_wall_ms','median_steps_per_s','median_ui_fps','worst_ui_gap_ms','tab_hidden','agreement'];
  const rows=records.map(r=>[r.finishedAt,r.engine,r.config.grid,r.config.shape,r.config.speed,
    r.config.steps,r.samples.length,r.computeMs,r.wallMs,r.throughput,r.uiFps,r.worstGap,r.hidden,comparison(r).text]);
  const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
  const csv=[headings,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='airflow-benchmark-results.csv';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
});
const hasWorker=typeof Worker!=='undefined';
$('workerSupport').textContent=hasWorker?'Ready':'Unsupported';
if(!hasWorker){document.querySelector('input[value=worker]').disabled=true;$('compareCpu').disabled=true;}
(async()=>{
  const status=$('wasmSupport');
  if(!hasWorker||typeof WebAssembly==='undefined'){status.textContent='Unsupported';return;}
  try{
    const url=new URL('./rust/airflow_solver.wasm',import.meta.url);
    const response=await fetch(url,{method:'HEAD',cache:'no-store'});
    if(!response.ok)throw new Error('Binary unavailable');
    wasmReady=true;status.textContent='Ready';status.classList.add('working');
    document.querySelector('input[value=wasm]').disabled=false;
    $('compareRust').disabled=busy;
  }catch{status.textContent='Build pending';}
})();
const ctx=$('fieldPreview').getContext('2d');ctx.fillStyle='#0b1a29';ctx.fillRect(0,0,640,280);
(async()=>{
  let gpu='unavailable';
  if(navigator.gpu){
    try{gpu=await navigator.gpu.requestAdapter()?'supported':'no adapter';}catch{gpu='blocked';}
  }
  $('deviceInfo').textContent=(matchMedia('(pointer:coarse)').matches?'Touch device':'Pointer device')+
    ' · Worker: '+(hasWorker?'supported':'unavailable')+
    ' · WebAssembly: '+(typeof WebAssembly!=='undefined'?'supported':'unavailable')+
    ' · WebGPU: '+gpu+' (solver not implemented)';
})();
