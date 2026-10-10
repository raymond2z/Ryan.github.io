import {runWebGpuSolver} from './gpu-solver.mjs?build=stage3-force-v1-20261010';
self.addEventListener('message',async({data})=>{
  if(data?.action!=='solve')return;
  try{
    const result=await runWebGpuSolver(data.settings,{
      env:navigator,onProgress:progress=>self.postMessage({type:'progress',id:data.id,progress})
    });
    self.postMessage({type:'done',id:data.id,result});
  }catch(error){
    self.postMessage({type:'error',id:data.id,error:String(error?.message||error)});
  }
});
