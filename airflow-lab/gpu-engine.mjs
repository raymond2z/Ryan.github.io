// Stage 1 WebGPU capability + real D2Q9 equilibrium compute probe.
// NOT a full fluid solver: repeated dispatches rewrite the same equilibrium populations.
// Never report these dispatches as fluid simulation steps.
import {FluidSimulation} from './simulation.mjs';

export const GPU_GRID_OPTIONS=Object.freeze({
  fast:{width:168,height:72},
  detail:{width:240,height:104},
  large:{width:480,height:208}
});
export const GPU_DISPATCH_OPTIONS=Object.freeze([8,32,96]);
export const PROBE_TOLERANCE=2e-5;

export function validateProbeSettings(raw){
  if(!raw||!Object.hasOwn(GPU_GRID_OPTIONS,raw.grid))throw new Error('Unknown GPU grid');
  if(!['circle','block','streamlined','plate','car','bird','pikachu','none'].includes(raw.shape))
    throw new Error('Unknown obstacle');
  const speed=Number(raw.speed),dispatches=Number(raw.dispatches);
  if(![.04,.085,.15].includes(speed))throw new Error('Unsupported flow speed');
  if(!GPU_DISPATCH_OPTIONS.includes(dispatches))throw new Error('Unsupported GPU workload');
  return {...GPU_GRID_OPTIONS[raw.grid],grid:raw.grid,shape:raw.shape,speed,dispatches};
}

export function makeProbeFields(raw){
  const cfg=validateProbeSettings(raw);
  const sim=new FluidSimulation(cfg.width,cfg.height);
  sim.speed=cfg.speed;sim.setShape(cfg.shape,0);
  const cells=new Float32Array(sim.n*4);
  for(let i=0;i<sim.n;i++){
    const solid=sim.solid[i]!==0;
    // Repeatable, mildly nonuniform input field exercises the D2Q9 equilibrium
    // expression. These perturbations are SYNTHETIC, not evolved flow states.
    cells[i*4]=Math.fround(1+.006*Math.sin(i*.031));
    cells[i*4+1]=Math.fround(solid?0:cfg.speed*(1+.11*Math.sin(i*.019)));
    cells[i*4+2]=Math.fround(solid?0:.013*Math.cos(i*.017));
    cells[i*4+3]=solid?1:0;
  }
  return {cfg,cells,count:sim.n,solidCells:sim.solid.reduce((a,b)=>a+b,0)};
}

const CX=[0,1,0,-1,0,1,-1,-1,1];
const CY=[0,0,1,0,-1,1,1,-1,-1];
const WT=[4/9,1/9,1/9,1/9,1/9,1/36,1/36,1/36,1/36];
export function cpuEquilibrium(cells){
  if(!(cells instanceof Float32Array)||cells.length%4!==0)
    throw new Error('Expected 4 Float32 values per cell');
  const count=cells.length/4,output=new Float32Array(count*9);
  for(let i=0;i<count;i++){
    const rho=cells[4*i],solid=cells[4*i+3]>.5;
    const u=solid?0:cells[4*i+1]*.5,v=solid?0:cells[4*i+2]*.5;
    const u2=u*u+v*v;
    for(let q=0;q<9;q++){
      const cu=CX[q]*u+CY[q]*v;
      output[i*9+q]=WT[q]*rho*(1+3*cu+4.5*cu*cu-1.5*u2);
    }
  }
  return output;
}

export function verifyEquilibrium(actual,expected,tolerance=PROBE_TOLERANCE){
  if(actual.length!==expected.length)throw new Error('GPU output length mismatch');
  let maxDifference=0,mismatched=0,nonFinite=0;
  for(let i=0;i<actual.length;i++){
    const delta=Math.abs(actual[i]-expected[i]);
    if(!Number.isFinite(delta)){nonFinite++;continue;}
    if(delta>maxDifference)maxDifference=delta;
    if(delta>tolerance)mismatched++;
  }
  return {pass:mismatched===0&&nonFinite===0,maxDifference,mismatched,nonFinite,
    comparisons:actual.length,tolerance};
}

function gpuObject(env){
  if(!env?.gpu)throw new Error('WebGPU is unavailable in this browser context (secure HTTPS required).');
  return env.gpu;
}
export async function gpuCapabilities(env=navigator){
  const gpu=gpuObject(env);
  const adapter=await gpu.requestAdapter();
  if(!adapter)throw new Error('WebGPU adapter was not provided by the browser.');
  const device=await adapter.requestDevice();
  try{
    return {available:true,limits:{
      maxStorageBufferBindingSize:device.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupsPerDimension:device.limits.maxComputeWorkgroupsPerDimension,
      maxComputeInvocationsPerWorkgroup:device.limits.maxComputeInvocationsPerWorkgroup
    },workerContext:typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope};
  }finally{device.destroy();}
}
export async function gpuEquilibriumProbe(raw,{env=navigator}={}){
  const {cfg,cells,count,solidCells}=makeProbeFields(raw);
  const gpu=gpuObject(env);
  const adapter=await gpu.requestAdapter();
  if(!adapter)throw new Error('No compatible GPU adapter available.');
  const device=await adapter.requestDevice();
  const buffers=[];
  try{
    const outputBytes=count*9*4,inputBytes=cells.byteLength;
    if(outputBytes>device.limits.maxStorageBufferBindingSize ||
      inputBytes>device.limits.maxStorageBufferBindingSize)
      throw new Error('Selected grid exceeds the device storage buffer limit.');
    const codeResponse=await fetch(new URL('./d2q9.wgsl',import.meta.url));
    if(!codeResponse.ok)throw new Error('Could not load d2q9.wgsl (HTTP '+codeResponse.status+').');
    const module=device.createShaderModule({label:'D2Q9 equilibrium · probe only',code:await codeResponse.text()});
    if(module.getCompilationInfo){
      const info=await module.getCompilationInfo();
      const errors=info.messages.filter(m=>m.type==='error');
      if(errors.length)throw new Error('WGSL compile error: '+errors.map(e=>e.message).join('; '));
    }
    const pipeline=await device.createComputePipelineAsync({
      layout:'auto',compute:{module,entryPoint:'equilibrium'}
    });
    const input=device.createBuffer({size:inputBytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    const output=device.createBuffer({size:outputBytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    const staging=device.createBuffer({size:outputBytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    buffers.push(input,output,staging);
    device.queue.writeBuffer(input,0,cells);
    const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
      {binding:0,resource:{buffer:input}},
      {binding:1,resource:{buffer:output}}
    ]});
    const groups=Math.ceil(count/64);
    if(groups>device.limits.maxComputeWorkgroupsPerDimension)
      throw new Error('Too many workgroups for the selected device.');
    // Warm up the pipeline and queue. This is not included in dispatch timing.
    let encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
    pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups);pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const dispatchStart=performance.now();
    encoder=device.createCommandEncoder();
    pass=encoder.beginComputePass();
    pass.setPipeline(pipeline);pass.setBindGroup(0,bind);
    for(let i=0;i<cfg.dispatches;i++)pass.dispatchWorkgroups(groups);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    // This is CPU-wall-clock dispatch + queue completion, NOT a GPU timestamp.
    const dispatchWallMs=performance.now()-dispatchStart;
    const readStart=performance.now();
    encoder=device.createCommandEncoder();
    encoder.copyBufferToBuffer(output,0,staging,0,outputBytes);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const actual=new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    const readbackMs=performance.now()-readStart;
    const verifyStart=performance.now();
    const verification=verifyEquilibrium(actual,cpuEquilibrium(cells));
    const validationMs=performance.now()-verifyStart;
    return {mode:'GPU equilibrium kernel only (not complete LBM)',
      grid:cfg.grid,width:cfg.width,height:cfg.height,shape:cfg.shape,speed:cfg.speed,
      dispatches:cfg.dispatches,cells:count,solidCells,outputValues:actual.length,
      dispatchWallMs,readbackMs,validationMs,verification,
      cellEvaluationsPerSecond:1000*count*cfg.dispatches/Math.max(dispatchWallMs,.001),
      workerContext:typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope,
      recordedAt:new Date().toISOString()};
  }finally{
    for(const buffer of buffers)try{buffer.destroy();}catch{}
    device.destroy();
  }
}
