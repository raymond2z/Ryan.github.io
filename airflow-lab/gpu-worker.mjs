// WebGPU compute experiment worker.
// WorkerNavigator.gpu is not available on every WebGPU-capable browser.
// The Benchmark UI retries the same probe on the main thread if needed.
import {gpuCapabilities,gpuEquilibriumProbe} from './gpu-engine.mjs';

self.addEventListener('message',async({data})=>{
  const {requestId,action,settings}=data||{};
  if(!['diagnose','run'].includes(action))return;
  try{
    const result=action==='diagnose'?await gpuCapabilities(navigator):
      await gpuEquilibriumProbe(settings,{env:navigator});
    self.postMessage({requestId,type:'result',result});
  }catch(error){
    self.postMessage({requestId,type:'error',error:String(error?.message||error)});
  }
});
