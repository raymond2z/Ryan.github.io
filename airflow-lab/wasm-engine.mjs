// A real Rust-compiled WebAssembly D2Q9 solver, used inside a dedicated Worker.
// We deliberately use the same JS obstacle mask and 8-step warmup as the reference.
import {FluidSimulation} from './simulation.mjs';
import {validateConfig,summarize} from './benchmark-core.mjs';

const artifactUrl=new URL('./rust/airflow_solver.wasm',import.meta.url);
let wasmExportsPromise;
export async function loadRustWasm(){
  if(!wasmExportsPromise)wasmExportsPromise=(async()=>{
    const response=await fetch(artifactUrl,{cache:'no-cache'});
    if(!response.ok)throw new Error('Rust WASM binary is unavailable (HTTP '+response.status+').');
    // ArrayBuffer instantiation works even if a static server omits application/wasm MIME.
    const bytes=await response.arrayBuffer();
    const {instance}=await WebAssembly.instantiate(bytes,{});
    const e=instance.exports;
    for(const method of ['memory','solver_create','solver_free','solver_solid_ptr','solver_reset',
       'solver_step_many','solver_rho_ptr','solver_ux_ptr','solver_uy_ptr']){
       if(!e[method])throw new Error('Compiled WASM is missing '+method+'.');
    }
    return e;
  })().catch(error=>{wasmExportsPromise=null;throw error;});
  return wasmExportsPromise;
}
export async function runRustTrial(raw,onProgress=()=>{}){
  const cfg=validateConfig(raw);
  const e=await loadRustWasm();
  const referenceMask=new FluidSimulation(cfg.width,cfg.height);
  referenceMask.setShape(cfg.shape,0);
  const handle=e.solver_create(cfg.width,cfg.height,cfg.speed,.025);
  if(!handle)throw new Error('Rust solver could not allocate the simulation.');
  try{
    const n=cfg.width*cfg.height;
    new Uint8Array(e.memory.buffer,e.solver_solid_ptr(handle),n).set(referenceMask.solid);
    if(e.solver_reset(handle)!==1)throw new Error('Rust solver reset failed.');
    if(e.solver_step_many(handle,cfg.warmup)!==cfg.warmup)throw new Error('Rust solver warmup failed.');
    let computeMs=0,done=0;
    const wallStart=performance.now();
    while(done<cfg.steps){
      const count=Math.min(4,cfg.steps-done);
      const start=performance.now();
      const completed=e.solver_step_many(handle,count);
      computeMs+=performance.now()-start;
      if(completed!==count)throw new Error('Numerical instability in Rust WASM solver.');
      done+=completed;
      if(done===cfg.steps||done%12===0)onProgress({done,total:cfg.steps});
      if(done<cfg.steps)await new Promise(resolve=>setTimeout(resolve,0));
    }
    const wallMs=performance.now()-wallStart;
    // Re-read memory.buffer in case WASM memory has grown.
    const memory=e.memory.buffer;
    const view={
      n,width:cfg.width,height:cfg.height,
      solid:new Uint8Array(memory,e.solver_solid_ptr(handle),n),
      rho:new Float64Array(memory,e.solver_rho_ptr(handle),n),
      ux:new Float64Array(memory,e.solver_ux_ptr(handle),n),
      uy:new Float64Array(memory,e.solver_uy_ptr(handle),n),
    };
    const summary=summarize(view);
    return {...cfg,computeMs,wallMs,stepsPerSecond:1000*cfg.steps/Math.max(.001,computeMs),
      ...summary,finishedAt:new Date().toISOString()};
  }finally{e.solver_free(handle);}
}
