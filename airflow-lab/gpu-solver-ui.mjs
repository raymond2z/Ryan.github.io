// Stage 2 interface stays separate from the validated equilibrium probe and Student Lab.
import {runWebGpuSolver} from './gpu-solver.mjs?build=stage2-r2-20261010';
const $=id=>document.getElementById(id);
const fmt=(n,p=1)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:p}):'—';
let busy=false,cancelled=false,activeWorker=null,activeReject=null,lastResult=null;
let previousControls={};
function status(message){$('gpuSolverStatus').textContent=message;}
function locked(value){
  busy=value;$('gpuSolverRun').disabled=value;
  $('gpuSolverStop').disabled=!value;$('gpuSolverExport').disabled=value||!lastResult;
  for(const id of ['runSelected','compareCpu','compareRust','gpuRun','gpuDiagnose']){
    if(value){previousControls[id]=$(id).disabled;$(id).disabled=true;}
    else if(Object.hasOwn(previousControls,id))$(id).disabled=previousControls[id];
  }
  if(!value)previousControls={};
}
function trialWorker(settings){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./gpu-solver-worker.mjs?build=stage2-r2-20261010',import.meta.url),{type:'module'});
    activeWorker=worker;
    const cleanup=()=>{worker.terminate();if(activeWorker===worker){activeWorker=null;activeReject=null;}};
    activeReject=()=>{cleanup();reject(new Error('Cancelled'));};
    worker.onmessage=({data})=>{
      if(data.id!==1)return;
      if(data.type==='progress'){
        status(data.progress.phase==='reference'
          ?'Independent JavaScript validation · '+data.progress.done+'/'+data.progress.total+' steps (not included in GPU timing)…'
          :'GPU solver running · '+data.progress.done+'/'+data.progress.total+' full steps…');
      }else if(data.type==='done'){cleanup();resolve(data.result);}
      else if(data.type==='error'){cleanup();reject(new Error(data.error));}
    };
    worker.onerror=e=>{e.preventDefault();cleanup();reject(new Error(e.message||'GPU Worker failed'));};
    worker.onmessageerror=()=>{cleanup();reject(new Error('GPU Worker data could not be read'));};
    worker.postMessage({action:'solve',id:1,settings});
  });
}
function showPreview(result){
  const data=result.preview,canvas=$('gpuSolverPreview'),ctx=canvas.getContext('2d');
  const off=document.createElement('canvas');off.width=data.width;off.height=data.height;
  const c=off.getContext('2d'),image=c.createImageData(data.width,data.height);
  for(let i=0;i<data.speeds.length;i++){
    const index=4*i,value=data.speeds[i]/255;
    if(data.solids[i]){image.data[index]=238;image.data[index+1]=239;image.data[index+2]=224;}
    else{image.data[index]=9+value*230;image.data[index+1]=25+value*169;image.data[index+2]=45+value*55;}
    image.data[index+3]=255;
  }
  c.putImageData(image,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;ctx.drawImage(off,0,0,canvas.width,canvas.height);
  $('gpuSolverPreviewLabel').textContent=result.grid+' / '+result.shape+' · '+result.steps+' full steps';
}
function showResult(result){
  $('gpuSolverRate').textContent=fmt(result.stepsPerSecond,1);
  $('gpuSolverTime').textContent=fmt(result.computeMs,1)+' ms';
  $('gpuSolverReadback').textContent=fmt(result.readbackMs,1)+' ms';
  $('gpuSolverReference').textContent=fmt(result.referenceMs,1)+' ms';
  const v=result.fullField,s=result.stability,pass=s.finite&&s.densityInRange&&s.sameObstacle;
  const validation=$('gpuSolverValidation');
  validation.dataset.pass=String(pass&&v.withinReviewTolerance);
  validation.textContent=
    'GPU stability: '+(pass?'PASS':'NEEDS REVIEW')+
    ' · GPU-vs-JavaScript f64 field RMS — density: '+fmt(v.rms.rho,6)+
    ', ux: '+fmt(v.rms.ux,6)+', uy: '+fmt(v.rms.uy,6)+
    ' · maximum |ux| error: '+fmt(v.maxAbs.ux,6)+
    ' · '+v.samples+' fluid cells verified'+
    ' · '+s.invalidCells+' nonfinite GPU cells'+
    ' · '+s.densityOutOfRangeCells+' out-of-range density cells'+
    '. f32/f64 divergence thresholds are provisional; numerical stability and field agreement are separate checks.';
  showPreview(result);
}
async function run(){
  if(busy)return;
  if(!$('stopRun').disabled||!$('gpuCancel').disabled){
    status('Finish any other running CPU / GPU experiment first.');return;
  }
  const settings={grid:$('grid').value,shape:$('shape').value,
    speed:Number($('speed').value),steps:Number($('steps').value)};
  cancelled=false;locked(true);
  status('Loading the full D2Q9 GPU shader and setting up field buffers…');
  try{
    let result;
    if(typeof Worker!=='undefined'){
      try{result=await trialWorker(settings);}
      catch(error){
        if(cancelled)throw error;
        status('WebGPU Worker unavailable. Retrying on main-thread GPU (may cause temporary UI lag)…');
        result=await runWebGpuSolver(settings,{env:navigator,
          checkCancelled:()=>cancelled,
          onProgress:p=>status((p.phase==='reference'?'CPU validation: ':'Full GPU steps: ')+p.done+'/'+p.total)});
      }
    }else result=await runWebGpuSolver(settings,{env:navigator,
      checkCancelled:()=>cancelled,
      onProgress:p=>status((p.phase==='reference'?'CPU validation: ':'Full GPU steps: ')+p.done+'/'+p.total)});
    if(cancelled)throw new Error('Cancelled');
    lastResult=result;showResult(result);
    status('Full fluid solver finished · '+result.steps+' evolving steps, '+fmt(result.stepsPerSecond,1)+
      ' GPU steps/s. Check stability and RMS errors before drawing speedup conclusions.');
  }catch(e){status(cancelled?'GPU solver cancelled.':'GPU solver failed: '+String(e.message||e));}
  finally{
    if(activeWorker){activeWorker.terminate();activeWorker=null;}
    activeReject=null;
    locked(false);

  }
}
$('gpuSolverRun').addEventListener('click',run);
$('gpuSolverStop').addEventListener('click',()=>{
  if(!busy)return;
  cancelled=true;
  if(activeReject){const abort=activeReject;activeReject=null;abort();}
  status('Cancelling GPU solver…');
});
$('gpuSolverExport').addEventListener('click',()=>{
  if(!lastResult)return;
  const json=JSON.stringify({...lastResult,
    note:'Full evolving GPU regularized BGK solver, not equilibrium probe; GPU f32 vs CPU f64 reference'},null,2);
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;
  a.download='airflow-webgpu-full-solver.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
});
const canvas=$('gpuSolverPreview'),c=canvas.getContext('2d');
c.fillStyle='#091929';c.fillRect(0,0,canvas.width,canvas.height);
