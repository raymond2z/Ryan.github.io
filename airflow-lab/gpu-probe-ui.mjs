// Isolated Stage 1 GPU UI: never changes the working CPU or Student Lab engines.
import {gpuCapabilities,gpuEquilibriumProbe} from './gpu-engine.mjs';
const $=id=>document.getElementById(id);
const format=(value,digits=1)=>Number.isFinite(value)
  ?value.toLocaleString(undefined,{maximumFractionDigits:digits}):'—';
let gpuBusy=false,canRun=false,workerGpu=false,activeWorker=null,workerReject=null;
let lastRecord=null,diagnostic=null,cancelled=false;

function status(message){$('gpuStatus').textContent=message;}
function diagnosticsLabel(caps){
  if(!caps)return 'Unavailable';
  const m=caps.limits;
  return 'Available · storage limit '+format(m.maxStorageBufferBindingSize/1048576,1)+
    ' MiB · max workgroups/dimension '+format(m.maxComputeWorkgroupsPerDimension,0)+
    ' · max invocations/workgroup '+format(m.maxComputeInvocationsPerWorkgroup,0);
}
function lockUi(locked){
  gpuBusy=locked;
  $('gpuRun').disabled=locked||!canRun;
  $('gpuDiagnose').disabled=locked;
  $('gpuCancel').disabled=!locked;
  $('gpuGrid').disabled=locked;
  $('gpuDispatches').disabled=locked;
  $('gpuExport').disabled=locked||!lastRecord;
  // Prevent a CPU benchmark from running concurrently and distorting wall-clock time.
  if(locked){
    for(const id of ['runSelected','compareCpu','compareRust'])$(id).disabled=true;
  }else{
    // Respect the CPU benchmark's current engine availability.
    $('runSelected').disabled=false;
    $('compareCpu').disabled=typeof Worker==='undefined';
    $('compareRust').disabled=$('wasmSupport').textContent!=='Ready';
  }
}
function workerCall(action,settings){
  return new Promise((resolve,reject)=>{
    if(typeof Worker==='undefined'){reject(new Error('Workers are unavailable'));return;}
    const worker=new Worker(new URL('./gpu-worker.mjs',import.meta.url),{type:'module'});
    const cleanup=()=>{
      worker.terminate();
      if(activeWorker===worker){activeWorker=null;workerReject=null;}
    };
    activeWorker=worker;
    workerReject=reason=>{cleanup();reject(new Error(reason));};
    worker.onmessage=({data})=>{
      if(data.requestId!==1)return;
      cleanup();
      if(data.type==='error')reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror=event=>{
      event.preventDefault();cleanup();
      reject(new Error(event.message||'GPU worker failed to initialize'));
    };
    worker.onmessageerror=()=>{cleanup();reject(new Error('GPU worker response unavailable'));};
    worker.postMessage({requestId:1,action,settings});
  });
}
function stopGpu(){
  if(!gpuBusy)return;
  cancelled=true;
  if(workerReject)workerReject('GPU probe stopped by user');
  status('Stop requested. If the GPU is using the main thread, the active dispatch must finish first.');
}
async function diagnose(){
  if(gpuBusy)return;
  lockUi(true);canRun=false;
  status('Requesting WebGPU adapters and devices…');
  let main=null,worker=null,mainError='',workerError='';
  try{main=await gpuCapabilities(navigator);}catch(error){mainError=String(error?.message||error);}
  if(typeof Worker!=='undefined'){
    try{worker=await workerCall('diagnose');}catch(error){workerError=String(error?.message||error);}
  }else workerError='No Worker API';
  workerGpu=Boolean(worker);
  canRun=Boolean(main||worker);
  diagnostic={main,worker,mainError,workerError,checkedAt:new Date().toISOString()};
  $('gpuCapabilities').textContent=
    'Main-thread WebGPU: '+diagnosticsLabel(main)+(mainError?'\n↳ '+mainError:'')+
    '\nWorker WebGPU: '+diagnosticsLabel(worker)+(workerError?'\n↳ '+workerError:'');
  if(canRun)status('WebGPU ready. Run the actual WGSL equilibrium kernel probe below.');
  else status('WebGPU compute unavailable in this browser. The JS and Rust/WASM tests above still work.');
  lockUi(false);
}
function renderResult(result){
  const v=result.verification;
  $('gpuDispatchTime').textContent=format(result.dispatchWallMs,1)+' ms';
  $('gpuReadbackTime').textContent=format(result.readbackMs,1)+' ms';
  $('gpuThroughput').textContent=format(result.cellEvaluationsPerSecond/1e6,2)+' M/s';
  $('gpuDifference').textContent=result.verification.maxDifference.toExponential(2);
  const validation=$('gpuValidation');
  validation.dataset.pass=String(v.pass);
  validation.textContent=(v.pass?'PASS':'CHECK FAILED')+
    ' · '+format(v.comparisons,0)+' D2Q9 population values checked'+
    ' · '+format(v.mismatched,0)+' above tolerance '+v.tolerance+
    ' · '+result.width+'×'+result.height+' / '+result.shape+
    ' · '+result.dispatches+' repeated independent dispatches'+
    ' · '+(result.workerContext?'Worker GPU':'main-thread GPU')+
    '. These are repeated equilibrium calculations, NOT complete fluid steps.';
}
async function runProbe(){
  if(gpuBusy||!canRun)return;
  if(!$('stopRun').disabled){status('Finish the CPU benchmark before measuring GPU work.');return;}
  cancelled=false;
  const settings={grid:$('gpuGrid').value,dispatches:Number($('gpuDispatches').value),
    shape:$('shape').value,speed:Number($('speed').value)};
  lockUi(true);status('Preparing D2Q9 WGSL compute workload…');
  const begin=performance.now();
  try{
    let result;
    if(workerGpu){
      try{
        result=await workerCall('run',settings);
      }catch(error){
        if(cancelled)throw error;
        if(!diagnostic?.main)throw error;
        status('GPU Worker failed; retrying the same test on the main-thread GPU…');
        result=await gpuEquilibriumProbe(settings,{env:navigator});
      }
    }else result=await gpuEquilibriumProbe(settings,{env:navigator});
    if(cancelled)throw new Error('GPU probe stopped');
    lastRecord={...result,totalWallMs:performance.now()-begin,
      diagnostics:diagnostic?.main?.limits||diagnostic?.worker?.limits||null};
    renderResult(lastRecord);
    status((result.verification.pass?'GPU kernel completed and verified. ':'GPU results need investigation. ')+
      'Dispatch completion and readback were measured separately. Export JSON to keep this result.');
  }catch(error){
    status('GPU probe '+(cancelled?'stopped.':'failed: '+String(error.message||error)));
    if(!cancelled){
      $('gpuValidation').textContent='No validated GPU result was produced. The CPU/Rust simulators are unaffected.';
      delete $('gpuValidation').dataset.pass;
    }
  }finally{lockUi(false);}
}
function exportResult(){
  if(!lastRecord)return;
  const clean={...lastRecord,note:'GPU D2Q9 equilibrium kernel ONLY; not a full fluid simulation benchmark'};
  const json=JSON.stringify(clean,null,2);
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='airflow-webgpu-probe.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('gpuDiagnose').addEventListener('click',diagnose);
$('gpuRun').addEventListener('click',runProbe);
$('gpuCancel').addEventListener('click',stopGpu);
$('gpuExport').addEventListener('click',exportResult);
// Diagnostics run once on load; retry is always available.
diagnose();
