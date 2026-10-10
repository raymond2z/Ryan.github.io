// Student Lab: persistent f32 D2Q9 solver using WebGPU in a dedicated module Worker.
// Same message contract as the existing Rust worker. Browser support is checked
// at runtime; the UI falls back to Rust/WASM if shader/device creation fails.
import {FluidSimulation} from './simulation.mjs';
import {createGpuForceController} from './gpu-relative-force.mjs';
const VERSION='student-gpu-v2-20261010';
const STEP_LIMIT=8;
let device=null,ready=false,W=0,H=0,n=0,revision=0,clock=0,speed=.085,viscosity=.025,inletSpeed=.085;
let fieldA,fieldB,post,solidBuffer,macro,readback,uniform,stirUniform,stirPipeline,stirBind;
let collision,streaming,macroscopic,collPairs,streamPairs,macroBind,groups=0,solid=null;
let forceController=null,forceEnabled=false;
const allocated=[],freeBuffers=[];
const allocate=(size,usage)=>{
  const buffer=device.createBuffer({size,usage});
  allocated.push(buffer);return buffer;
};
function uniforms(){
  const raw=new ArrayBuffer(32),d=new DataView(raw);
  d.setUint32(0,W,true);d.setUint32(4,H,true);d.setUint32(8,n,true);
  d.setFloat32(16,1/(3*viscosity*0.5+0.5),true);
  d.setFloat32(20,inletSpeed*0.5,true);
  device.queue.writeBuffer(uniform,0,raw);
}
function fieldBuffer(){
  const b=freeBuffers.pop();
  return new Float32Array(b&&b.byteLength===n*4?b:new ArrayBuffer(n*4));
}
function validateFinite(packed){
  for(let i=0;i<n;i++){
    if(solid[i])continue;
    let r=packed[i*4],u=packed[i*4+1],v=packed[i*4+2];
    if(!Number.isFinite(r)||!Number.isFinite(u)||!Number.isFinite(v)||r<.2||r>3)
      throw new Error('The GPU flow became unstable; switching to Rust/WASM.');
  }
}
async function compiledModule(url,label){
  const response=await fetch(new URL(url,import.meta.url),{cache:'no-store'});
  if(!response.ok)throw new Error('Could not load '+label+' shader (HTTP '+response.status+')');
  const module=device.createShaderModule({code:await response.text(),label});
  if(module.getCompilationInfo){
    const info=await module.getCompilationInfo();
    const errors=info.messages.filter(m=>m.type==='error');
    if(errors.length)throw new Error(label+': '+errors.map(e=>e.message).join('; '));
  }
  return module;
}
async function initialize(msg){
  if(!navigator.gpu)throw new Error('Worker WebGPU unavailable');
  W=msg.width;H=msg.height;n=W*H;
  if(!(W>0&&H>0&&n<=100000))throw new Error('Invalid GPU grid');
  speed=msg.speed;viscosity=msg.viscosity;inletSpeed=speed;
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter)throw new Error('No GPU adapter');
  device=await adapter.requestDevice();
  device.lost.then(info=>{
    if(ready){ready=false;self.postMessage({type:'error',message:'WebGPU device lost: '+(info.message||info.reason)});}
  });
  const distBytes=n*9*4,macroBytes=n*4*4;
  if(distBytes>device.limits.maxStorageBufferBindingSize)
    throw new Error('Flow grid exceeds device GPU buffer limit');
  const module=await compiledModule('./d2q9-solver-r2-20261010.wgsl','D2Q9 flow');
  const stirModule=await compiledModule('./student-gpu-stir-v1.wgsl','Student stir');
  [collision,streaming,macroscopic,stirPipeline]=await Promise.all([
    ...['collision','streaming','macroscopic'].map(entryPoint=>
      device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}})),
    device.createComputePipelineAsync({layout:'auto',compute:{module:stirModule,entryPoint:'stir'}})
  ]);
  const storage=GPUBufferUsage.STORAGE,src=GPUBufferUsage.COPY_SRC,dst=GPUBufferUsage.COPY_DST;
  fieldA=allocate(distBytes,storage|dst);
  fieldB=allocate(distBytes,storage|dst);
  post=allocate(distBytes,storage|dst);
  solidBuffer=allocate(n*4,storage|dst);
  macro=allocate(macroBytes,storage|src);
  readback=allocate(macroBytes,dst|GPUBufferUsage.MAP_READ);
  uniform=allocate(32,GPUBufferUsage.UNIFORM|dst);
  stirUniform=allocate(32,GPUBufferUsage.UNIFORM|dst);
  const bind=(pipeline,input,output)=>device.createBindGroup({
    layout:pipeline.getBindGroupLayout(0),
    entries:[
      {binding:0,resource:{buffer:input}},
      {binding:1,resource:{buffer:output}},
      {binding:2,resource:{buffer:solidBuffer}},
      {binding:3,resource:{buffer:uniform}}
    ]
  });
  collPairs=[bind(collision,fieldA,post),bind(collision,fieldB,post)];
  streamPairs=[bind(streaming,post,fieldB),bind(streaming,post,fieldA)];
  macroBind=bind(macroscopic,fieldA,macro);
  stirBind=device.createBindGroup({
    layout:stirPipeline.getBindGroupLayout(0),
    entries:[{binding:0,resource:{buffer:fieldA}},
      {binding:1,resource:{buffer:solidBuffer}},
      {binding:2,resource:{buffer:stirUniform}}]
  });
  groups=Math.ceil(n/64);
  if(groups>device.limits.maxComputeWorkgroupsPerDimension)
    throw new Error('GPU dispatch limit exceeded');
  solid=new Uint8Array(n);
  ready=true;
  self.postMessage({type:'ready',engine:'webgpu',version:VERSION,forceAvailable:true,forceOptIn:true});
}
function reset(msg){
  revision=msg.revision;
  speed=msg.speed;viscosity=msg.viscosity;inletSpeed=speed;
  if(!msg.solid||msg.solid.length!==n)throw new Error('Invalid obstacle mask');
  solid.set(msg.solid);
  const model=new FluidSimulation(W,H);
  model.speed=speed;model.viscosity=viscosity;model.solid.set(solid);
  model.reset();
  device.queue.writeBuffer(fieldA,0,new Float32Array(model.f));
  device.queue.writeBuffer(solidBuffer,0,new Uint32Array(solid));
  uniforms();clock=0;
  if(forceController)forceController.reset();
  self.postMessage({type:'resetDone',revision});
}
function parameters(msg){
  if(!Number.isFinite(msg.speed)||msg.speed<0||msg.speed>.2||
    !Number.isFinite(msg.viscosity)||msg.viscosity<.02||msg.viscosity>.15)
    throw new Error('Invalid GPU speed or viscosity');
  speed=msg.speed;viscosity=msg.viscosity;uniforms();
}
async function setForceEnabled(enabled){
  if(!enabled){
    forceEnabled=false;
    self.postMessage({type:'forceStatus',enabled:false,available:true});
    return;
  }
  // Lazy initialization keeps force passes, shader compilation and buffer allocations
  // completely out of the default high-FPS student flow.
  if(!forceController){
    try{
      forceController=await createGpuForceController({
        device,post,solid:solidBuffer,width:W,height:H,trackBuffer:b=>allocated.push(b)
      });
    }catch(error){
      forceEnabled=false;
      self.postMessage({type:'forceStatus',enabled:false,available:false,
        message:'GPU force overlay unavailable: '+String(error?.message||error)});
      return;
    }
  }
  forceController.reset(); // Begin a fresh force-smoothing window on user opt-in.
  forceEnabled=true;
  self.postMessage({type:'forceStatus',enabled:true,available:true});
}
function dispatch(pass,pipeline,bind){
  pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups);
}
async function push(msg){
  const {x,y,dx,dy}=msg;
  if(![x,y,dx,dy].every(Number.isFinite))return;
  const d=new DataView(new ArrayBuffer(32));
  d.setUint32(0,W,true);d.setUint32(4,H,true);d.setUint32(8,n,true);
  d.setFloat32(16,x,true);d.setFloat32(20,y,true);
  d.setFloat32(24,dx,true);d.setFloat32(28,dy,true);
  device.queue.writeBuffer(stirUniform,0,d.buffer);
  const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
  dispatch(pass,stirPipeline,stirBind);pass.end();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
}
async function step(msg){
  if(msg.revision!==revision){
    self.postMessage({type:'skipped',requestId:msg.requestId});return;
  }
  const count=Math.max(0,Math.min(STEP_LIMIT,Math.floor(msg.count)||0));
  if(count){
    // Inlet smoothing matches the public UI's direction/scale, with a batch update
    // rather than f32 uniform changes for every lattice half-step.
    const diff=speed-inletSpeed;
    inletSpeed+=Math.sign(diff)*Math.min(Math.abs(diff),count*.00025);
    uniforms();
  }
  const encoder=device.createCommandEncoder();
  for(let k=0;k<count;k++){
    for(let half=0;half<2;half++){
      let pass=encoder.beginComputePass();
      dispatch(pass,collision,collPairs[half]);pass.end();
      // The force controller samples post-collision populations before bounce-back.
      // This is deliberately opt-in: no extra force passes when the toggle is off.
      if(forceEnabled&&forceController)forceController.encodeHalfStep(encoder);
      pass=encoder.beginComputePass();
      dispatch(pass,streaming,streamPairs[half]);pass.end();
    }
  }
  let pass=encoder.beginComputePass();
  dispatch(pass,macroscopic,macroBind);pass.end();
  encoder.copyBufferToBuffer(macro,0,readback,0,n*16);
  if(forceEnabled&&forceController)forceController.encodeReadback(encoder);
  device.queue.submit([encoder.finish()]);
  const readPending=readback.mapAsync(GPUMapMode.READ);
  const forcePending=forceEnabled&&forceController
    ?forceController.read().catch(error=>{
      // The optional force buffer must not take down the main fluid animation.
      forceEnabled=false;forceController=null;
      self.postMessage({type:'forceStatus',enabled:false,available:false,
        message:'GPU force readback failed; fluid animation continues: '+String(error?.message||error)});
      return null;
    }):Promise.resolve(null);
  const [,forceReading]=await Promise.all([readPending,forcePending]);
  const packed=new Float32Array(readback.getMappedRange().slice(0));
  readback.unmap();
  validateFinite(packed);
  const rho=fieldBuffer(),ux=fieldBuffer(),uy=fieldBuffer();
  for(let i=0;i<n;i++){rho[i]=packed[i*4];ux[i]=packed[i*4+1];uy[i]=packed[i*4+2];}
  clock+=count;
  self.postMessage({type:'frame',requestId:msg.requestId,revision,steps:count,
    fields:{rho,ux,uy},time:clock,inletSpeed,
    forceX:forceReading?.forceX??0,forceY:forceReading?.forceY??0,
    forceAvailable:Boolean(forceReading),
    forceUnits:'relative model force (simulation units)'},
    [rho.buffer,ux.buffer,uy.buffer]);
}
async function handle(msg){
  if(msg.type==='recycle'){
    for(const b of msg.buffers||[])if(b instanceof ArrayBuffer&&b.byteLength===n*4&&freeBuffers.length<12)freeBuffers.push(b);
    return;
  }
  if(msg.type==='init'){await initialize(msg);return;}
  if(!ready)return;
  if(msg.type==='reset')reset(msg);
  else if(msg.type==='force')await setForceEnabled(Boolean(msg.enabled));
  else if(msg.type==='params')parameters(msg);
  else if(msg.type==='push')await push(msg);
  else if(msg.type==='step')await step(msg);
}
// Serial queue prevents a reset/parameter change/stir from racing an async GPU map.
let pending=Promise.resolve();
self.onmessage=({data})=>{
  pending=pending.then(()=>handle(data)).catch(err=>{
    ready=false;
    self.postMessage({type:'error',message:String(err?.message||err),engine:'webgpu'});
  });
};
