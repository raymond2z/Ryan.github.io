import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {FluidSimulation} from './simulation.mjs';

function nextReply(worker,expected){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{cleanup();reject(new Error('Worker response timed out: '+expected));},20000);
    const onMessage=data=>{
      if(data.type==='error'){cleanup();reject(new Error(data.message));return;}
      if(data.type===expected){cleanup();resolve(data);}
    };
    const onError=err=>{cleanup();reject(err);};
    const cleanup=()=>{clearTimeout(timeout);worker.off('message',onMessage);worker.off('error',onError);};
    worker.on('message',onMessage);worker.on('error',onError);
  });
}

test('real persistent Rust Student Worker supports reset, velocity fields, controls, and stale-message rejection',async()=>{
  const worker=new Worker(new URL('./student-wasm-test-harness.mjs',import.meta.url),{type:'module'});
  try{
    const w=168,h=72,sim=new FluidSimulation(w,h);
    sim.speed=.085;sim.viscosity=.025;sim.setShape('block',0);
    let response=nextReply(worker,'ready');
    worker.postMessage({type:'init',width:w,height:h,speed:sim.speed,viscosity:sim.viscosity});
    await response;

    response=nextReply(worker,'resetDone');
    worker.postMessage({type:'reset',revision:1,solid:sim.solid.slice(),speed:sim.speed,viscosity:sim.viscosity});
    assert.equal((await response).revision,1);

    response=nextReply(worker,'frame');
    worker.postMessage({type:'step',revision:1,requestId:7,count:8,budgetMs:Infinity});
    const frame=await response;
    assert.equal(frame.requestId,7);
    assert.equal(frame.steps,8);
    assert.equal(frame.time,8);
    for(let i=0;i<8;i++)sim.step();
    for(const name of ['rho','ux','uy']){
      const a=frame.fields[name],b=sim[name];
      assert.equal(a.length,w*h);
      for(let i=0;i<a.length;i+=31)
        assert.ok(Math.abs(a[i]-b[i])<2e-5,name+' mismatch at '+i);
    }

    response=nextReply(worker,'skipped');
    worker.postMessage({type:'step',revision:99,requestId:8,count:3,budgetMs:Infinity});
    assert.equal((await response).requestId,8);

    // Match a live speed/viscosity change plus the classroom Stir tool.
    sim.speed=.15;sim.viscosity=.035;
    worker.postMessage({type:'params',speed:.15,viscosity:.035});
    sim.push(92.25,36.25,4.5,-2.5);
    worker.postMessage({type:'push',x:92.25,y:36.25,dx:4.5,dy:-2.5});
    response=nextReply(worker,'frame');
    worker.postMessage({type:'step',revision:1,requestId:9,count:5,budgetMs:Infinity});
    const after=await response;
    for(let i=0;i<5;i++)sim.step();
    assert.equal(after.time,13);
    for(let i=0;i<sim.n;i+=37)
      assert.ok(Math.abs(after.fields.ux[i]-sim.ux[i])<3e-5,'velocity mismatch after push at '+i);

    response=nextReply(worker,'resetDone');
    sim.setShape('car',0);
    worker.postMessage({type:'reset',revision:2,solid:sim.solid.slice(),speed:sim.speed,viscosity:sim.viscosity});
    assert.equal((await response).revision,2);
    response=nextReply(worker,'frame');
    worker.postMessage({type:'step',revision:2,requestId:10,count:2,budgetMs:Infinity});
    const last=await response;
    assert.equal(last.time,2);
    assert.equal(last.revision,2);
  }finally{
    await worker.terminate();
  }
});

test('Student Lab exposes engine controls and accounts for partial worker batches',()=>{
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
  for(const name of ['engine','engineStatus','livePerformance'])assert.ok(html.includes('id="'+name+'"'));
  assert.ok(js.includes('pendingSteps=Math.max(0,pendingSteps-data.steps)'));
  assert.ok(js.includes("type:'reset'"));
  assert.ok(js.includes('endRustEngine'));
});
