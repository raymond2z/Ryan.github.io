// Stage 3.1: reusable GPU momentum-exchange force controller for Student and Benchmark.
// Reports relative simulation units, NOT SI newtons. Positive fy is down on canvas.
const DT=0.5;
export const FORCE_SCALE=1/(DT*DT);
export const FORCE_SMOOTHING=1-Math.pow(.98,DT);
export const FORCE_WORKGROUP=64;
const DX=[0,1,0,-1,0,1,-1,-1,1];
const DY=[0,0,1,0,-1,1,1,-1,-1];

// CPU reference of the exact post-collision bounce-back impulse calculation.
// For model validation only; the GPU never downloads these populations to use it.
export function referenceBoundaryImpulse(post,solid,w,h){
  const count=w*h;
  if(post.length!==count*9||solid.length!==count)throw Error('Force input sizes do not match');
  let fx=0,fy=0,links=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=x+y*w;if(solid[i])continue;
    for(let q=1;q<9;q++){
      const nx=x+DX[q],ny=y+DY[q];
      if(nx<0||nx>=w||ny<0||ny>=h)continue;
      if(solid[nx+ny*w]){
        const value=2*post[q*count+i];
        fx+=value*DX[q];fy+=value*DY[q];links++;
      }
    }
  }
  return {fx,fy,links};
}
export function nextRelativeForce(current,impulse){
  return {
    x:(1-FORCE_SMOOTHING)*current.x+FORCE_SMOOTHING*FORCE_SCALE*impulse.fx,
    y:(1-FORCE_SMOOTHING)*current.y+FORCE_SMOOTHING*FORCE_SCALE*impulse.fy
  };
}
export function relativeForceResult(x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid relative force');
  return {forceX:x,forceY:y,drag:x,lift:-y,
    resultant:Math.hypot(x,y),units:'relative model force (simulation units)'};
}

export async function createGpuForceController({device,post,solid,width,height,trackBuffer=()=>{}}){
  const count=width*height,groups=Math.ceil(count/FORCE_WORKGROUP);
  if(groups<=0||groups>device.limits.maxComputeWorkgroupsPerDimension)
    throw Error('GPU force dispatch exceeds device limits');
  const response=await fetch(new URL('./gpu-relative-force-v1.wgsl',import.meta.url),{cache:'no-store'});
  if(!response.ok)throw Error('Cannot load relative-force WGSL shader (HTTP '+response.status+')');
  const module=device.createShaderModule({label:'Stage 3.1 boundary momentum exchange',code:await response.text()});
  if(module.getCompilationInfo){
    const info=await module.getCompilationInfo();
    const errors=info.messages.filter(m=>m.type==='error');
    if(errors.length)throw Error('Force WGSL: '+errors.map(m=>m.message).join('; '));
  }
  const [boundary,reduce]=await Promise.all(['boundaryImpulse','smoothImpulse'].map(entryPoint=>
    device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}})));
  const b=(size,usage)=>{const buffer=device.createBuffer({size,usage});trackBuffer(buffer);return buffer;};
  const usage=GPUBufferUsage;
  const partial=b(groups*8,usage.STORAGE);
  const state=b(8,usage.STORAGE|usage.COPY_DST|usage.COPY_SRC);
  const readback=b(8,usage.COPY_DST|usage.MAP_READ);
  const config=b(16,usage.UNIFORM|usage.COPY_DST);
  const header=new Uint32Array([width,height,count,groups]);
  device.queue.writeBuffer(config,0,header);
  const bindBoundary=device.createBindGroup({
    layout:boundary.getBindGroupLayout(0),
    entries:[
      {binding:0,resource:{buffer:post}},
      {binding:1,resource:{buffer:solid}},
      {binding:2,resource:{buffer:partial}},
      {binding:3,resource:{buffer:config}}
    ]
  });
  const bindReduce=device.createBindGroup({
    layout:reduce.getBindGroupLayout(0),
    entries:[
      {binding:2,resource:{buffer:partial}},
      {binding:3,resource:{buffer:config}},
      {binding:4,resource:{buffer:state}}
    ]
  });
  const reset=()=>device.queue.writeBuffer(state,0,new Float32Array([0,0]));
  reset();
  return {
    reset,
    // Call after collision and BEFORE streaming, once per dt=0.5 half-step.
    encodeHalfStep(encoder){
      let pass=encoder.beginComputePass();
      pass.setPipeline(boundary);
      pass.setBindGroup(0,bindBoundary);
      pass.dispatchWorkgroups(groups);
      pass.end();
      pass=encoder.beginComputePass();
      pass.setPipeline(reduce);
      pass.setBindGroup(0,bindReduce);
      pass.dispatchWorkgroups(1);
      pass.end();
    },
    encodeReadback(encoder){encoder.copyBufferToBuffer(state,0,readback,0,8);},
    async read(){
      await readback.mapAsync(GPUMapMode.READ);
      const values=new Float32Array(readback.getMappedRange());
      const result=relativeForceResult(values[0],values[1]);
      readback.unmap();
      return result;
    },
    groups
  };
}
