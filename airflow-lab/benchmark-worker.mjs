// Dedicated worker isolates the existing JavaScript solver from main-thread UI.
import {runCpuTrial} from './benchmark-core.mjs';
self.addEventListener('message',async(event)=>{
  const {type,runId,config}=event.data||{};
  if(type!=='run')return;
  try{
    const result=await runCpuTrial(config,{onProgress(progress){self.postMessage({type:'progress',runId,progress});}});
    self.postMessage({type:'done',runId,result});
  }catch(error){self.postMessage({type:'error',runId,error:String(error.message||error)});}
});
