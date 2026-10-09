// Rust WebAssembly runs off the UI thread; computing and drawing remain separate.
import {runRustTrial} from './wasm-engine.mjs';
self.addEventListener('message',async({data})=>{
  if(data?.type!=='run')return;
  try{
    const result=await runRustTrial(data.config,(progress)=>{
      self.postMessage({type:'progress',runId:data.runId,progress});
    });
    self.postMessage({type:'done',runId:data.runId,result});
  }catch(error){
    self.postMessage({type:'error',runId:data.runId,error:String(error?.message||error)});
  }
});
