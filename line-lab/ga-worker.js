import {Evolution} from './genetics.js?v=6';
let evolution;
self.onmessage=event=>{
 try{
  if(event.data.type==='configure'){evolution=new Evolution(event.data.config);self.postMessage({type:'ready'});}
  else if(event.data.type==='prepare'&&evolution){self.postMessage({type:'prepared',candidates:evolution.prepare()});}
  else if(event.data.type==='step'&&evolution){const result=evolution.step((done,total)=>self.postMessage({type:'progress',done,total}));self.postMessage({type:'generation',result});}
 }catch(error){self.postMessage({type:'error',message:error.message});}
};

