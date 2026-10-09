// Persistent Rust WASM fluid solver. All expensive stepping stays off the UI thread.
// UI receives float32 snapshots (display precision only), not the 9 f64 distributions.
import {loadRustWasm} from './wasm-engine.mjs';

let exportsWasm=null,handle=0,width=0,height=0,revision=0;
const freeBuffers=[];
function fieldBuffer(n){
  const buffer=freeBuffers.pop();
  return new Float32Array(buffer&&buffer.byteLength===n*4?buffer:new ArrayBuffer(n*4));
}
const read=()=>({
  time:exportsWasm.solver_time(handle),
  inletSpeed:exportsWasm.solver_inlet_speed(handle),
  forceX:exportsWasm.solver_force_x(handle),
  forceY:exportsWasm.solver_force_y(handle)
});
function publishFrame(requestId=0,steps=0){
  if(!handle)return;
  const e=exportsWasm,n=width*height,mem=e.memory.buffer;
  const rho=fieldBuffer(n),ux=fieldBuffer(n),uy=fieldBuffer(n);
  rho.set(new Float64Array(mem,e.solver_rho_ptr(handle),n));
  ux.set(new Float64Array(mem,e.solver_ux_ptr(handle),n));
  uy.set(new Float64Array(mem,e.solver_uy_ptr(handle),n));
  self.postMessage({type:'frame',requestId,revision,steps,fields:{rho,ux,uy},...read()},
    [rho.buffer,ux.buffer,uy.buffer]);
}
self.onmessage=async({data})=>{
  try{
    if(data.type==='recycle'){
      for(const buffer of data.buffers||[])
        if(buffer instanceof ArrayBuffer&&buffer.byteLength===width*height*4&&freeBuffers.length<9)freeBuffers.push(buffer);
      return;
    }
    if(data.type==='init'){
      exportsWasm=await loadRustWasm();
      width=data.width;height=data.height;
      handle=exportsWasm.solver_create(width,height,data.speed,data.viscosity);
      if(!handle)throw new Error('Unable to allocate the Rust solver.');
      for(const name of ['solver_set_params','solver_push','solver_inlet_speed','solver_force_x','solver_force_y'])
        if(typeof exportsWasm[name]!=='function')throw new Error('The Rust WASM binary needs rebuilding: '+name);
      self.postMessage({type:'ready'});
      return;
    }
    if(!handle)return;
    if(data.type==='reset'){
      revision=data.revision;
      const e=exportsWasm,n=width*height,mask=data.solid;
      if(!mask||mask.length!==n)throw new Error('Invalid obstacle mask');
      if(e.solver_set_params(handle,data.speed,data.viscosity)!==1)throw new Error('Invalid parameters');
      new Uint8Array(e.memory.buffer,e.solver_solid_ptr(handle),n).set(mask);
      if(e.solver_reset(handle)!==1)throw new Error('Unable to reset Rust solver');
      self.postMessage({type:'resetDone',revision});
    }else if(data.type==='params'){
      if(exportsWasm.solver_set_params(handle,data.speed,data.viscosity)!==1)
        throw new Error('Unable to update flow settings');
    }else if(data.type==='push'){
      exportsWasm.solver_push(handle,data.x,data.y,data.dx,data.dy);
    }else if(data.type==='step'){
      if(data.revision!==revision){
        self.postMessage({type:'skipped',requestId:data.requestId});return;
      }
      const total=Math.max(0,Math.min(48,Math.floor(data.count)));
      const start=performance.now();let completed=0;
      while(completed<total){
        if(exportsWasm.solver_step_many(handle,1)!==1)throw new Error('Fluid became numerically unstable');
        completed++;
        if(completed>=1&&performance.now()-start>data.budgetMs)break;
      }
      publishFrame(data.requestId,completed);
    }
  }catch(error){
    self.postMessage({type:'error',message:String(error?.message||error)});
  }
};
