// Stage 2: actual regularized BGK D2Q9 solver evolving persistent GPU populations.
// Collide + pull-stream every half-step; two half-steps constitute one public step.
// f32 GPU field stays resident: only the final macroscopic state is read back.
// CPU f64 reference runs AFTER timings and is reported separately.
import {FluidSimulation} from './simulation.mjs';
import {validateConfig,summarize} from './benchmark-core.mjs';
const MAX_CHUNK=8;

export function validateSolverSettings(raw){
  const config=validateConfig(raw);
  return {...config,viscosity:.025,dt:.5};
}
export function initialSolverFields(raw){
  const config=validateSolverSettings(raw);
  const simulation=new FluidSimulation(config.width,config.height);
  simulation.speed=config.speed;
  simulation.viscosity=config.viscosity;
  simulation.setShape(config.shape,0);
  return {config,initial:new Float32Array(simulation.f),
    solid:new Uint32Array(simulation.solid),reference:simulation};
}
export function unpackMacroscopic(packed,solid,width,height){
  const n=width*height;
  if(packed.length!==n*4||solid.length!==n)throw new Error('GPU output size does not match grid');
  const rho=new Float32Array(n),ux=new Float32Array(n),uy=new Float32Array(n);
  let invalid=0,densityOutOfRange=0,solidsMismatch=0;
  for(let i=0;i<n;i++){
    rho[i]=packed[i*4];ux[i]=packed[i*4+1];uy[i]=packed[i*4+2];
    const outputSolid=packed[i*4+3]>.5;
    if(outputSolid!==Boolean(solid[i]))solidsMismatch++;
    if(!Number.isFinite(rho[i])||!Number.isFinite(ux[i])||!Number.isFinite(uy[i]))invalid++;
    else if(!solid[i]&&(rho[i]<.2||rho[i]>3))densityOutOfRange++;
  }
  return {n,width,height,solid,rho,ux,uy,invalid,densityOutOfRange,solidsMismatch};
}
export function compareFullFields(actual,reference){
  if(actual.n!==reference.n)throw new Error('Mismatched field sizes');
  const count=actual.n,keys=['rho','ux','uy'],rms={},maxAbs={};
  let nonSolid=0,invalid=0;
  for(const key of keys){rms[key]=0;maxAbs[key]=0;}
  for(let i=0;i<count;i++){
    if(actual.solid[i])continue;
    nonSolid++;
    for(const key of keys){
      const diff=actual[key][i]-reference[key][i];
      if(!Number.isFinite(diff)){invalid++;continue;}
      rms[key]+=diff*diff;maxAbs[key]=Math.max(maxAbs[key],Math.abs(diff));
    }
  }
  for(const key of keys)rms[key]=Math.sqrt(rms[key]/Math.max(1,nonSolid));
  return {samples:nonSolid,rms,maxAbs,invalid,
    // These heuristic review thresholds are NOT physical calibration or bit equality.
    withinReviewTolerance:invalid===0&&rms.rho<.01&&rms.ux<.03&&rms.uy<.03};
}
export async function runWebGpuSolver(raw,{env=navigator,onProgress=()=>{},checkCancelled=()=>false}={}){
  const {config,initial,solid,reference}=initialSolverFields(raw);
  const gpu=env?.gpu;
  if(!gpu)throw new Error('This browser does not offer WebGPU in the current context.');
  const adapter=await gpu.requestAdapter();
  if(!adapter)throw new Error('No compatible WebGPU adapter available.');
  const device=await adapter.requestDevice();
  const buffers=[];
  try{
    const n=config.width*config.height;
    const distributionBytes=initial.byteLength,macroBytes=n*4*4;
    if(Math.max(distributionBytes,macroBytes)>device.limits.maxStorageBufferBindingSize)
      throw new Error('GPU buffer exceeds the device storage limit');
    const response=await fetch(new URL('./d2q9-solver-r2-20261010.wgsl',import.meta.url),{cache:'no-store'});
    if(!response.ok)throw new Error('Could not load D2Q9 shader (HTTP '+response.status+').');
    const module=device.createShaderModule({code:await response.text(),label:'Stage 2 D2Q9 complete flow solver'});
    if(module.getCompilationInfo){
      const info=await module.getCompilationInfo();
      const errors=info.messages.filter(m=>m.type==='error');
      if(errors.length)throw new Error('WGSL compilation: '+errors.map(x=>x.message).join('; '));
    }
    const [collision,streaming,macroscopic]=await Promise.all(['collision','streaming','macroscopic']
      .map(entryPoint=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}})));
    const makeBuffer=(size,usage)=>{
      const b=device.createBuffer({size,usage});buffers.push(b);return b;
    };
    const storage=GPUBufferUsage.STORAGE;
    const copyDst=GPUBufferUsage.COPY_DST,copySrc=GPUBufferUsage.COPY_SRC;
    const [fieldA,fieldB,post]=Array.from({length:3},()=>makeBuffer(distributionBytes,storage|copyDst));
    const obstacle=makeBuffer(solid.byteLength,storage|copyDst);
    const macro=makeBuffer(macroBytes,storage|copySrc);
    const readback=makeBuffer(macroBytes,copyDst|GPUBufferUsage.MAP_READ);
    const uniform=makeBuffer(32,GPUBufferUsage.UNIFORM|copyDst);
    device.queue.writeBuffer(fieldA,0,initial);
    device.queue.writeBuffer(obstacle,0,solid);
    const configBytes=new ArrayBuffer(32),header=new DataView(configBytes);
    header.setUint32(0,config.width,true);
    header.setUint32(4,config.height,true);
    header.setUint32(8,n,true);
    header.setFloat32(16,1/(3*config.viscosity*config.dt+.5),true);
    header.setFloat32(20,config.speed*config.dt,true);
    device.queue.writeBuffer(uniform,0,configBytes);
    const pair=(pipeline,src,dst)=>device.createBindGroup({
      layout:pipeline.getBindGroupLayout(0),
      entries:[
        {binding:0,resource:{buffer:src}},
        {binding:1,resource:{buffer:dst}},
        {binding:2,resource:{buffer:obstacle}},
        {binding:3,resource:{buffer:uniform}}
      ]
    });
    const coll=[pair(collision,fieldA,post),pair(collision,fieldB,post)];
    const stream=[pair(streaming,post,fieldB),pair(streaming,post,fieldA)];
    const macroBind=pair(macroscopic,fieldA,macro);
    const groups=Math.ceil(n/64);
    if(groups>device.limits.maxComputeWorkgroupsPerDimension)
      throw new Error('Grid exceeds available workgroup dimension');
    const dispatch=(pass,pipeline,bind)=>{
      pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups);
    };
    const submitSteps=async count=>{
      const encoder=device.createCommandEncoder();
      for(let k=0;k<count;k++){
        // The same fieldA is current after every two half-steps.
        for(let half=0;half<2;half++){
          let pass=encoder.beginComputePass();
          dispatch(pass,collision,coll[half]);
          pass.end();
          pass=encoder.beginComputePass();
          dispatch(pass,streaming,stream[half]);
          pass.end();
        }
      }
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
    };
    // Warmup is real flow evolution, excluded from measured steps and timings.
    for(let i=0;i<config.warmup;i+=MAX_CHUNK){
      if(checkCancelled())throw new Error('Cancelled');
      await submitSteps(Math.min(MAX_CHUNK,config.warmup-i));
    }
    let computeMs=0,completed=0;
    const wallStart=performance.now();
    while(completed<config.steps){
      if(checkCancelled())throw new Error('Cancelled');
      const chunk=Math.min(MAX_CHUNK,config.steps-completed);
      const start=performance.now();
      await submitSteps(chunk);
      computeMs+=performance.now()-start;
      completed+=chunk;
      onProgress({phase:'gpu',done:completed,total:config.steps});
    }
    const wallMs=performance.now()-wallStart;
    const readStart=performance.now();
    let encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
    dispatch(pass,macroscopic,macroBind);pass.end();
    encoder.copyBufferToBuffer(macro,0,readback,0,macroBytes);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const packed=new Float32Array(readback.getMappedRange().slice(0));
    readback.unmap();
    const readbackMs=performance.now()-readStart;
    const actual=unpackMacroscopic(packed,solid,config.width,config.height);
    const summary=summarize(actual);
    // Reference is not included in GPU solve measurements.
    onProgress({phase:'reference',done:0,total:config.warmup+config.steps});
    const referenceStart=performance.now();
    for(let k=0;k<config.warmup+config.steps;k++){
      if(checkCancelled())throw new Error('Cancelled');
      reference.step();
      if((k+1)%25===0||k+1===config.warmup+config.steps)
        onProgress({phase:'reference',done:k+1,total:config.warmup+config.steps});
    }
    const referenceMs=performance.now()-referenceStart;
    const fullField=compareFullFields(actual,reference);
    const referenceSummary=summarize(reference);
    const stability={finite:actual.invalid===0,densityInRange:actual.densityOutOfRange===0,
      sameObstacle:actual.solidsMismatch===0,
      invalidCells:actual.invalid,densityOutOfRangeCells:actual.densityOutOfRange};
    return {...config,engine:'webgpu',mode:'Complete evolving D2Q9 f32 regularized BGK solver',
      computeMs,wallMs,readbackMs,referenceMs,
      stepsPerSecond:1000*config.steps/Math.max(.001,computeMs),
      ...summary,referenceMetrics:referenceSummary.metrics,fullField,stability,
      finishedAt:new Date().toISOString(),
      workerContext:typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope};
  }finally{
    for(const buffer of buffers)try{buffer.destroy();}catch{}
    device.destroy();
  }
}
