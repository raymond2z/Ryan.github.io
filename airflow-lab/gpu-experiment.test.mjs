import test from 'node:test';
import assert from 'node:assert/strict';
import {experimentSettings,createGpuRequestPacer,createGpuLoadGovernor} from './gpu-experiment.mjs';
import {createGpuPaintPacer} from './live-performance.mjs';

test('profiles and increased demand require the dedicated experiment page',()=>{
  assert.deepEqual(experimentSettings({search:'?profile=flow60&pace=2'}),{enabled:false,profile:'baseline',paceMultiplier:1});
  assert.deepEqual(experimentSettings({enabled:true,search:'?profile=display60&pace=2'}),{enabled:true,profile:'display60',paceMultiplier:2});
  assert.equal(experimentSettings({enabled:true,search:'?profile=__proto__&pace=99'}).profile,'baseline');
});
test('request deadlines deliver 30, 40 and 60 updates/s on 60/90/120 Hz callbacks without catch-up bursts',()=>{
  for(const displayHz of [60,90,120])for(const hz of [30,40,60]){
    const pacer=createGpuRequestPacer({hz});let requests=0;
    for(let i=0;i<displayHz*10;i++)if(pacer.shouldRequest({now:i*1000/displayHz,hasWork:true}))requests++;
    assert.ok(Math.abs(requests-hz*10)<=2,`${hz} requests on ${displayHz} Hz: ${requests}`);
    assert.equal(pacer.shouldRequest({now:20000,hasWork:true}),true);
    assert.equal(pacer.shouldRequest({now:20000,hasWork:true}),false);
  }
});
test('request backpressure, missing demand, rate changes and invalid clocks cannot create queues',()=>{
  const pace=createGpuRequestPacer({hz:60});
  for(const now of [0,17,33,2000])assert.equal(pace.shouldRequest({now,hasWork:true,busy:true}),false);
  assert.equal(pace.shouldRequest({now:2000,hasWork:false}),false);
  assert.equal(pace.shouldRequest({now:NaN,hasWork:true}),false);
  assert.equal(pace.shouldRequest({now:2000,hasWork:true}),true);
  pace.setRate(30);assert.equal(pace.shouldRequest({now:2001,hasWork:true}),true);
  assert.equal(pace.shouldRequest({now:2018,hasWork:true}),false);pace.reset();assert.equal(pace.shouldRequest({now:2018,hasWork:true}),true);
  assert.throws(()=>pace.setRate(100));assert.throws(()=>createGpuRequestPacer({alignmentMs:NaN}));
});
test('60 Hz paint deadlines work independently from 30 Hz flow delivery',()=>{
  for(const displayHz of [60,90,120]){
    const paint=createGpuPaintPacer({intervalMs:1000/60});let paints=0;
    for(let i=0;i<displayHz*10;i++)if(paint.shouldDraw({now:i*1000/displayHz,fluidDirty:i%2===0,tracerDebt:8,running:true,particlesEnabled:true}))paints++;
    assert.ok(Math.abs(paints-600)<=2,`${displayHz} Hz paints: ${paints}`);
  }
});
function window(governor,second,{workerMs=3,visualMs=1,steps=24,allowBatch=true}={}){
  for(let i=0;i<30;i++){governor.observeWorker({steps,workerMs,roundTripMs:workerMs+1});governor.observeVisual(visualMs);}
  return governor.evaluate(second*1000,{allowBatch});
}
test('auto requires three good windows, uses headroom and stays within 15–60 Hz and 4–24 steps',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);
  window(gov,1);window(gov,2);assert.equal(gov.state.updateHz,30);
  const changes=window(gov,3);assert.equal(gov.state.updateHz,40);assert.ok(changes.some(c=>c.control==='updateHz'));
  for(let i=4;i<=40;i++)window(gov,i);
  assert.deepEqual(gov.state,{paintHz:60,updateHz:60,batch:24});
  for(let i=41;i<=80;i++)window(gov,i,{workerMs:120,visualMs:40});
  assert.deepEqual(gov.state,{paintHz:30,updateHz:15,batch:4});
  gov.reset();assert.deepEqual(gov.state,{paintHz:60,updateHz:30,batch:8});
});
test('visual overload lowers painting, request cadence and adaptive advection demand; fixed batches stay fixed',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);const changes=window(gov,1,{visualMs:25});
  assert.deepEqual(gov.state,{paintHz:30,updateHz:20,batch:6});assert.ok(changes.every(c=>c.workerP95===4&&c.visualP95===25));
  const fixed=createGpuLoadGovernor();fixed.evaluate(0);for(let i=1;i<=8;i++)window(fixed,i,{workerMs:100,visualMs:30,allowBatch:false});
  assert.equal(fixed.state.batch,8);
  for(let i=9;i<=11;i++)window(fixed,i,{allowBatch:false});assert.equal(fixed.state.paintHz,60);
});
test('invalid or sparse timing and partial demand packets do not manufacture adaptation evidence',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);
  for(const sample of [{steps:0,workerMs:1,roundTripMs:2},{steps:25,workerMs:1,roundTripMs:2},{steps:8,workerMs:NaN,roundTripMs:2},{steps:8,workerMs:4,roundTripMs:2}])gov.observeWorker(sample);
  for(const ms of [NaN,Infinity,0,-1])gov.observeVisual(ms);
  assert.deepEqual(gov.evaluate(1000),[]);assert.equal(gov.state.batch,8);
  window(gov,2,{steps:2});assert.equal(gov.state.batch,8,'partial packets must not raise the batch');
  assert.deepEqual(gov.evaluate(1999),[]);assert.deepEqual(gov.evaluate(NaN),[]);
});

test('long pauses discard old timing and restart the headroom observation window',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);window(gov,1);window(gov,2);
  for(let i=0;i<30;i++){gov.observeWorker({steps:24,workerMs:3,roundTripMs:4});gov.observeVisual(1);}
  assert.deepEqual(gov.evaluate(100000),[]);assert.equal(gov.state.updateHz,30);
  window(gov,101);window(gov,102);assert.equal(gov.state.updateHz,30);
  window(gov,103);assert.equal(gov.state.updateHz,40);
});
