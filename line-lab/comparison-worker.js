import {testLockedPair} from './comparison-core.js?v=5';
self.onmessage=event=>{
 try{self.postMessage({type:'result',result:testLockedPair(event.data.snapshot,event.data.track)});}
 catch(error){self.postMessage({type:'error',message:error.message});}
};
