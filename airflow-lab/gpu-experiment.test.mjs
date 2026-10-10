import test from 'node:test';
import assert from 'node:assert/strict';
import {experimentSettings,createGpuRequestPacer,createGpuLoadGovernor,createGpuFlowLoop,createGpuTracerBudget} from './gpu-experiment.mjs';
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
function window(governor,second,{workerMs=3,roundTripMs=workerMs+1,visualMs=1,steps=governor.state.batch,totalSteps=null,allowBatch=true,paints=governor.state.paintHz,snapshots=governor.state.updateHz,animationFrames=60,demandStepsPerSecond=1440,particlesEnabled=true,tracerDroppedStepsDelta=0,rates=true}={}){
  for(let i=0;i<30;i++){governor.observeWorker({steps,workerMs,roundTripMs});governor.observeVisual(visualMs);}
  if(rates)governor.observeRates({durationMs:1000,paints,snapshots,steps:totalSteps??steps*snapshots,animationFrames,demandStepsPerSecond,particlesEnabled,
    tracerDroppedStepsDelta,running:true,hidden:false,interacting:false,experimentPolicy:governor.state},second*1000);
  return governor.evaluate(second*1000,{allowBatch});
}
test('healthy hardware measures each candidate before retaining throughput gains and fulfills demand',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);let decisions=0,fulfilledAt=null;
  for(let i=1;i<=160;i++){
    const changes=window(gov,i);
    for(const change of changes.filter(c=>c.control==='throughputTrial')){
      decisions++;assert.equal(change.trial.validWindows,3);assert.ok(change.trial.changePercent>=5);
    }
    if(fulfilledAt===null&&gov.optimization.acceptedPolicy.updateHz===60&&gov.optimization.acceptedPolicy.batch===24)fulfilledAt=i;
    assert.ok(gov.state.updateHz>=15&&gov.state.updateHz<=60);
    assert.ok(gov.state.batch>=4&&gov.state.batch<=24);
  }
  assert.deepEqual(gov.state,{paintHz:60,updateHz:60,batch:24});
  assert.equal(gov.optimization.phase,'holding');assert.ok(decisions>0);
  assert.ok(fulfilledAt<=40,`healthy demand fulfilled after ${fulfilledAt} seconds`);
  gov.reset();assert.deepEqual(gov.state,{paintHz:60,updateHz:30,batch:8});
});
test('visual overload reduces drawing separately and fixed batches remain fixed',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);const changes=window(gov,1,{visualMs:25});
  assert.deepEqual(gov.state,{paintHz:30,updateHz:30,batch:8});
  assert.ok(changes.some(c=>c.control==='paintHz'));assert.ok(!changes.some(c=>c.control==='batch'));
  const fixed=createGpuLoadGovernor();fixed.evaluate(0);
  for(let i=1;i<=8;i++)window(fixed,i,{workerMs:100,visualMs:30,snapshots:5,allowBatch:false});
  assert.equal(fixed.state.batch,8);
  for(let i=9;i<=45;i++)window(fixed,i,{allowBatch:false});assert.equal(fixed.state.paintHz,60);assert.equal(fixed.state.batch,8);
});
test('invalid or sparse timing and partial demand packets do not manufacture adaptation evidence',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);
  for(const sample of [{steps:0,workerMs:1,roundTripMs:2},{steps:25,workerMs:1,roundTripMs:2},{steps:8,workerMs:NaN,roundTripMs:2},{steps:8,workerMs:4,roundTripMs:2}])gov.observeWorker(sample);
  for(const ms of [NaN,Infinity,0,-1])gov.observeVisual(ms);
  assert.deepEqual(gov.evaluate(1000),[]);assert.equal(gov.state.batch,8);
  window(gov,2,{steps:2});assert.equal(gov.state.batch,8,'partial packets must not raise the batch');
  assert.deepEqual(gov.evaluate(1999),[]);assert.deepEqual(gov.evaluate(NaN),[]);
});

test('a long pause restores the accepted policy and fresh evidence is required before another trial',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);window(gov,1);window(gov,2);window(gov,3);
  assert.equal(gov.optimization.phase,'measuring trial');assert.equal(gov.state.batch,10);
  const changes=gov.evaluate(100000);
  assert.equal(gov.state.batch,8);assert.equal(gov.optimization.phase,'holding');
  assert.ok(changes.some(c=>c.reason.includes('timing interrupted')));
  window(gov,101);window(gov,102);assert.equal(gov.optimization.phase,'holding');
  for(let i=103;i<=109;i++)window(gov,i);assert.equal(gov.optimization.phase,'holding');
  window(gov,110);assert.equal(gov.optimization.phase,'measuring trial');
});

test('sustained delivery shortfalls lower ceilings without collapsing the accepted batch',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);
  const changes=[];
  for(let i=1;i<=3;i++)changes.push(...window(gov,i,{paints:24,snapshots:18,animationFrames:24,workerMs:11,visualMs:6.6}));
  assert.equal(gov.state.paintHz,30);assert.equal(gov.state.updateHz,20);assert.equal(gov.state.batch,8);
  assert.ok(changes.some(c=>c.reason.includes('measured paint')));
  assert.ok(changes.some(c=>c.reason.includes('preserve batch')));
  for(let i=4;i<=40;i++)window(gov,i,{paints:24,snapshots:gov.state.updateHz,animationFrames:24,workerMs:11,visualMs:4});
  assert.equal(gov.state.paintHz,30,'a 24 Hz callback stream cannot justify 60 Hz recovery');
});
test('one slow delivery window is tolerated; paint recovery needs cooldown and real delivery',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);
  window(gov,1,{paints:24,snapshots:20,animationFrames:24});
  window(gov,2);window(gov,3);assert.equal(gov.state.paintHz,60);
  for(let i=4;i<=6;i++)window(gov,i,{paints:24,animationFrames:24});
  assert.equal(gov.state.paintHz,30);
  for(let i=7;i<=20;i++)window(gov,i);assert.equal(gov.state.paintHz,30);
  for(let i=21;i<=23;i++)window(gov,i);assert.equal(gov.state.paintHz,60);
});
test('demand-limited fields and disabled particles do not count as delivery overload',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);
  for(let i=1;i<=8;i++)window(gov,i,{steps:1,paints:2,snapshots:2,demandStepsPerSecond:2,particlesEnabled:false});
  assert.equal(gov.state.paintHz,60);assert.equal(gov.state.updateHz,30);
  assert.equal(gov.state.batch,8);
});
test('missing, interrupted, mixed-policy and stale rates cannot justify load increases',()=>{
  for(const mode of ['missing','hidden','interacting','interrupted','policyChanged','stale','mismatched','invalid']){
    const gov=createGpuLoadGovernor();gov.evaluate(0);
    for(let second=1;second<=8;second++){
      const now=second*1000;
      if(mode!=='missing'){
        const r={durationMs:1000,paints:60,snapshots:30,steps:240,animationFrames:60,demandStepsPerSecond:1440,
          tracerDroppedStepsDelta:0,particlesEnabled:true,running:true,hidden:false,interacting:false,experimentPolicy:gov.state};
        if(['hidden','interacting','interrupted','policyChanged'].includes(mode))r[mode]=true;
        if(mode==='mismatched')r.experimentPolicy={paintHz:30,updateHz:60};
        if(mode==='invalid')r.snapshots=NaN;
        gov.observeRates(r,mode==='stale'?now-3000:now);
      }
      window(gov,second,{rates:false});
    }
    assert.equal(gov.state.updateHz,30,mode);assert.equal(gov.state.batch,8,mode);
  }
});
test('tracer backlog is presentation evidence and cannot directly cut numerical batches',()=>{
  for(const allowBatch of [true,false]){
    const gov=createGpuLoadGovernor();gov.evaluate(0);
    window(gov,1,{tracerDroppedStepsDelta:20,allowBatch});
    const changes=window(gov,2,{tracerDroppedStepsDelta:20,allowBatch});
    assert.equal(gov.state.batch,8);assert.ok(!changes.some(c=>c.control==='batch'));
  }
});
test('independent flow loop owns one timer, waits for completion and cancels stale wakes',()=>{
  const timers=new Map();let id=0,now=0,ticks=0,busy=false;
  const loop=createGpuFlowLoop({clock:()=>now,schedule:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},cancel:id=>timers.delete(id),
    tick:()=>{ticks++;return busy?null:25;}});
  loop.start();loop.start();assert.equal(timers.size,1);
  const fire=()=>{const [key,timer]=timers.entries().next().value;timers.delete(key);now+=timer.ms;timer.fn();};
  fire();assert.equal(ticks,1);assert.equal(timers.size,1);
  const stale=timers.values().next().value.fn;
  loop.wake();assert.equal(timers.size,1);stale();assert.equal(ticks,1);
  busy=true;fire();assert.equal(timers.size,0);
  busy=false;loop.wake();fire();assert.equal(timers.size,1);
  loop.stop();assert.equal(loop.active,false);assert.equal(timers.size,0);stale();assert.equal(ticks,3);
});

test('a slower larger-batch trial restores the accepted batch after two regressing windows',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);for(let i=1;i<=3;i++)window(gov,i);
  assert.equal(gov.state.batch,10);
  window(gov,4,{snapshots:16,workerMs:50});
  const changes=window(gov,5,{snapshots:16,workerMs:50});
  assert.deepEqual(gov.optimization.acceptedPolicy,{updateHz:30,batch:8});
  assert.equal(gov.state.batch,8);assert.equal(gov.optimization.phase,'holding');
  assert.equal(gov.optimization.lastTrial.validWindows,2);
  assert.ok(gov.optimization.lastTrial.changePercent<-30);
  assert.ok(changes.some(c=>c.control==='throughputTrial'&&c.trial.decision==='restored'));
});
test('a fixed 14.8 ms delivery floor cannot drive progressively smaller batches at 60 Hz',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);
  for(let i=1;i<=160;i++)window(gov,i,{workerMs:6+gov.state.batch*.1,roundTripMs:14.8,
    paints:24,animationFrames:24,tracerDroppedStepsDelta:20});
  assert.deepEqual(gov.optimization.acceptedPolicy,{updateHz:60,batch:24});
  assert.equal(gov.state.batch,24);assert.equal(gov.state.paintHz,30);
  assert.equal(gov.optimization.referenceStepsPerSecond,1440);
});
test('high cadence that loses solver throughput is rejected without shrinking the accepted batch',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);const decisions=[];
  for(let i=1;i<=160;i++){
    const snapshots=gov.state.updateHz===60?35:gov.state.updateHz;
    decisions.push(...window(gov,i,{snapshots,workerMs:7,roundTripMs:14.8,paints:24,animationFrames:24}));
  }
  assert.deepEqual(gov.optimization.acceptedPolicy,{updateHz:40,batch:24});
  assert.ok(decisions.some(c=>c.control==='throughputTrial'&&c.trial.candidate.updateHz===60&&c.trial.decision==='restored'));
  assert.ok(gov.state.batch>=22,'only a reversible two-step trial may differ from accepted batch');
});
test('fixed overhead favors a larger batch and a lower request rate rather than chasing 60 fields',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);
  for(let i=1;i<=180;i++)window(gov,i,{snapshots:Math.min(gov.state.updateHz,28),workerMs:7,roundTripMs:35,
    paints:24,animationFrames:24});
  assert.deepEqual(gov.optimization.acceptedPolicy,{updateHz:30,batch:24});
  assert.ok(gov.optimization.referenceStepsPerSecond>=600);
});
test('three clean same-batch windows are required and a failed trial cannot accept mixed-policy evidence',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);for(let i=1;i<=3;i++)window(gov,i);
  for(let i=4;i<=7;i++){
    const rate={durationMs:1000,paints:60,snapshots:30,steps:1000,animationFrames:60,demandStepsPerSecond:1440,
      tracerDroppedStepsDelta:0,particlesEnabled:true,running:true,hidden:false,interacting:false,
      experimentPolicy:{...gov.state,batch:8}};
    gov.observeRates(rate,i*1000);window(gov,i,{rates:false});
  }
  assert.equal(gov.optimization.validTrialWindows,0);
  for(let i=8;i<=10;i++)window(gov,i);
  assert.equal(gov.optimization.lastTrial.decision,'retained');
  assert.equal(gov.optimization.lastTrial.validWindows,3);
  assert.equal(gov.optimization.lastTrial.trialStepsPerSecond,300);
});
test('a stalled trial times out and restores the checkpoint without fabricated throughput',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);for(let i=1;i<=3;i++)window(gov,i);
  for(let i=4;i<=19;i++)window(gov,i,{rates:false});
  assert.equal(gov.state.batch,8);assert.equal(gov.optimization.lastTrial.decision,'restored');
  assert.equal(gov.optimization.lastTrial.trialStepsPerSecond,null);
});
test('tracer budgeting advances larger debt with bounded work and gradual marker recovery',()=>{
  for(const baseCount of [64,190,460]){
    const tracer=createGpuTracerBudget({baseCount});
    let result=tracer.next({debt:24,now:0});assert.equal(result.count,baseCount);assert.equal(result.portion,24);
    result=tracer.next({debt:96,now:1000});assert.equal(result.portion,64);
    assert.ok(result.count*Math.ceil(result.portion/2)<=baseCount*12);
    const reduced=result.count;
    for(let now=1050;now<=7000;now+=50){
      result=tracer.next({debt:12,now});assert.equal(result.count,reduced,'six continuous seconds of headroom required');
    }
    result=tracer.next({debt:12,now:7050});assert.equal(result.count,Math.min(baseCount,reduced+Math.ceil(baseCount*.05)));
    for(let now=7100;now<=50000;now+=50)result=tracer.next({debt:12,now});
    assert.equal(result.count,baseCount,'sustained light work eventually restores full density');
    tracer.reset();assert.equal(tracer.count,baseCount);
    result=tracer.next({debt:24,split:true,now:6000});assert.equal(result.portion,12);assert.equal(result.count,baseCount);
  }
});

test('recurring expensive tracer paints do not repeatedly restore and remove markers',()=>{
  const tracer=createGpuTracerBudget({baseCount:460});
  let result=tracer.next({debt:48,now:0});const stableCount=result.count;let changes=0;
  for(let frame=1;frame<=7200;frame++){
    const debt=frame%2?24:48;result=tracer.next({debt,now:frame*1000/60});
    if(result.changed)changes++;
    assert.equal(result.count,stableCount);
    assert.ok(result.count*Math.ceil(result.portion/2)<=460*12);
  }
  assert.equal(changes,0,'steady burst patterns should keep a steady marker density');
});

test('a pause, missing paints or a renewed load spike invalidate tracer recovery evidence',()=>{
  const tracer=createGpuTracerBudget({baseCount:190});
  const reduced=tracer.next({debt:64,now:0}).count;
  for(let now=50;now<=5000;now+=50)tracer.next({debt:12,now});
  assert.equal(tracer.next({debt:12,now:15000}).count,reduced,'a pause cannot count as continuous headroom');
  for(let now=15050;now<=20000;now+=50)tracer.next({debt:12,now});
  assert.equal(tracer.next({debt:64,now:20050}).count,reduced);
  for(let now=20100;now<=26050;now+=50)assert.equal(tracer.next({debt:12,now}).count,reduced);
  assert.ok(tracer.next({debt:12,now:26100}).count>reduced);
});

test('a wider batch trial still rolls back on regression and retries a smaller increment',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);
  for(let i=1;i<=6;i++)window(gov,i);
  assert.equal(gov.optimization.acceptedPolicy.batch,10);
  window(gov,7);assert.equal(gov.state.batch,14);
  assert.equal(gov.optimization.acceptedPolicy.batch,10,'a wider candidate is not accepted before measuring');
  window(gov,8,{snapshots:14});window(gov,9,{snapshots:14});
  assert.equal(gov.state.batch,10);assert.equal(gov.optimization.lastTrial.decision,'restored');
  for(let i=10;i<=19;i++)window(gov,i);
  assert.equal(gov.state.batch,12,'retry uses a smaller increment');
  assert.equal(gov.optimization.acceptedPolicy.batch,10);
  window(gov,20);window(gov,21);assert.equal(gov.optimization.acceptedPolicy.batch,10);
  window(gov,22);assert.equal(gov.optimization.acceptedPolicy.batch,12);
});

test('weak throughput gains or slow compute do not justify wider batch trials',()=>{
  for(const mode of ['weak','slow']){
    const gov=createGpuLoadGovernor();gov.evaluate(0);
    for(let i=1;i<=6;i++)window(gov,i,{workerMs:mode==='slow'?20:3,
      totalSteps:mode==='weak'&&i>=4?254:null});
    assert.equal(gov.optimization.acceptedPolicy.batch,10);
    for(let i=7;i<=9;i++)window(gov,i,{workerMs:mode==='slow'?20:3,totalSteps:mode==='weak'?254:null});
    assert.equal(gov.state.batch,12,mode);
  }
});

test('user activity cancels a throughput trial so new conditions cannot validate its old baseline',()=>{
  const gov=createGpuLoadGovernor();gov.evaluate(0);for(let i=1;i<=3;i++)window(gov,i);
  gov.observeRates({running:true,hidden:false,interacting:false,interrupted:true},4000);
  window(gov,4,{rates:false});
  assert.equal(gov.state.batch,8);assert.equal(gov.optimization.phase,'holding');
  assert.match(gov.optimization.lastTrial.reason,/user activity/);
});
