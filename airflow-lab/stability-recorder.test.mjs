import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStabilityRecorder,summarize} from './stability-recorder.mjs';
const config={engine:'webgpu',speed:.15,forceEnabled:false,grid:{width:240,height:104}};
const activity={running:true,hidden:false,interacting:false};
function start(minutes=5,options={}){
  const r=createStabilityRecorder(options);
  r.start({durationMinutes:minutes,config,now:1000,wallTime:'2026-10-10T05:00:00Z'});
  r.observeState(config,activity,1000);return r;
}
test('P95 uses exact nearest rank and separates frame cadence from work time',()=>{
  assert.equal(summarize(Array.from({length:100},(_,i)=>i+1)).p95,95);
  assert.equal(summarize([4,2]).median,3);
  assert.equal(summarize([null,NaN,Infinity]).p95,null);
  const r=start();r.paint(1,1033);r.paint(1,1066);r.paint(2,1099);
  r.worker({workerMs:9,roundTripMs:22,queueReadbackMs:8},1100);
  const s=r.report(1100).summary;
  assert.equal(s.paintIntervalMs.p95,33);assert.equal(s.paintMs.p95,2);
  assert.equal(s.workerRoundTripMs.p95,22);
});

test('research records visual work separately and retain adaptation events and policy per rate window',()=>{
  const r=start();
  for(let i=1;i<=20;i++)r.paint(1,1000+i*17,{visualWorkMs:7,reusedRaster:i%2===0});
  r.event('load_adjustment',{control:'updateHz',from:30,to:40},1400);
  r.rates({durationMs:1000,steps:700,paints:60,snapshots:30,...activity,experimentPolicy:{paintHz:60,updateHz:40,batch:8},tracerDroppedSteps:12},2000);
  const report=r.report(2100);
  assert.equal(report.summary.paintMs.p95,1);assert.equal(report.summary.visualWorkMs.p95,7);
  assert.equal(report.paintSamples.filter(s=>s.reusedRaster).length,10);
  assert.equal(report.rateWindows[0].experimentPolicy.updateHz,40);
  assert.equal(report.rateWindows[0].tracerDroppedSteps,12);
  assert.equal(report.summary.eventCounts.load_adjustment,1);
  assert.equal(report.summary.eventCounts.settings_changed,undefined,'normal auto adaptation is not a user setting change');
});
test('all duration choices finish automatically without changing simulation settings',()=>{
  for(const minutes of [2,5,10]){
    const r=start(minutes);assert.equal(r.tick(1000+minutes*60000-1,'before'),true);
    assert.equal(r.tick(1000+minutes*60000,'finished'),false);
    const report=r.report(99999999);
    assert.equal(report.status,'completed');assert.equal(report.elapsedMs,minutes*60000);
    assert.equal(report.finishedAt,'finished');assert.deepEqual(report.startConfig,config);
    assert.equal(report.assessment.needsReview,true,'an empty recording is not healthy evidence');
  }
  assert.throws(()=>start(3));
});
test('complete recording retains more than 160 samples and excludes samples after deadline',()=>{
  const r=start();
  for(let i=1;i<=5000;i++){
    r.paint(.8,1000+i*40);
    r.worker({workerMs:10,roundTripMs:12,queueReadbackMs:9},1000+i*40);
  }
  r.paint(99,301000);r.worker({workerMs:99,roundTripMs:99},301001);
  const report=r.report(301001);
  assert.equal(report.paintSamples.length,5000);assert.equal(report.workerSamples.length,5000);
  assert.equal(report.summary.paintMs.p95,.8);assert.equal(report.status,'completed');
  assert.equal(report.assessment.samplesComplete,true);
});
test('raw retention safety limit explicitly marks truncation',()=>{
  const r=start(5,{maxSamples:2,maxEvents:2});
  r.paint(1,1033);r.paint(1,1066);r.paint(1,1099);
  r.event('fallback',{from:'webgpu'},1100);
  const report=r.report(1101);
  assert.equal(report.paintSamples.length,2);assert.equal(report.dropped.paintSamples,1);
  assert.equal(report.dropped.events,1);assert.equal(report.assessment.samplesComplete,false);
});
test('visibility, settings, pauses and fallbacks invalidate an uninterrupted claim',()=>{
  const r=start();r.event('visibility',{hidden:true},2000);
  r.observeState(config,{...activity,hidden:true},2000);
  r.observeState({...config,speed:.1},{...activity,running:false},2100);
  r.observeState({...config,speed:.1},{...activity,running:false},2200);
  r.event('fallback',{from:'webgpu',reason:'device lost'},2300);
  r.stop(2400,'stopped');const report=r.report(2400);
  assert.equal(report.status,'stopped');assert.equal(report.assessment.uninterrupted,false);
  assert.equal(report.summary.eventCounts.settings_changed,1);
  assert.equal(report.summary.eventCounts.fallback,1);
  assert.equal(report.assessment.durationCompleted,false);
});
test('sample gaps and malformed timing values are recorded instead of hidden',()=>{
  const r=start();r.paint(1,1033);r.paint(1,15033);
  r.worker({workerMs:9,roundTripMs:12},1033);
  r.worker({workerMs:9,roundTripMs:12},15033);
  r.worker({workerMs:NaN,roundTripMs:12},15040);
  const report=r.report(15050);
  assert.equal(report.summary.eventCounts.paint_gap,1);
  assert.equal(report.summary.eventCounts.worker_sample_gap,1);
  assert.equal(report.summary.eventCounts.invalid_timing_sample,1);
  assert.equal(report.assessment.needsReview,true);
});
test('weighted early/late throughput excludes hidden and pre-recording windows',()=>{
  const r=start(2);
  const window={durationMs:1000,steps:700,paints:30,snapshots:30,...activity};
  r.rates(window,1500); // half the window is before recording
  r.rates(window,2000);r.rates({...window,durationMs:2000,steps:1000},4000);
  r.rates({...window,steps:600},82000);
  r.rates({...window,steps:0,hidden:true},83000);
  const report=r.report(84000);
  assert.equal(report.rateWindows.length,4);
  assert.equal(report.summary.firstThirdFlowStepsPerSecond,1700/3);
  assert.equal(report.summary.lastThirdFlowStepsPerSecond,600);
  assert.equal(report.summary.measuredWindowMs,5000);
});
test('reports are detached, manual stop freezes duration and a new run resets samples',()=>{
  const r=start();r.paint(1,1033);const old=r.report(1050);
  old.startConfig.speed=999;old.paintSamples.length=0;
  r.stop(2000,'stopped');assert.equal(r.report(9999).elapsedMs,1000);
  assert.equal(r.report(9999).paintSamples.length,1);
  assert.equal(r.report(9999).startConfig.speed,.15);
  r.start({durationMinutes:2,config,now:3000,wallTime:'next'});
  assert.equal(r.report(3001).paintSamples.length,0);
  assert.throws(()=>r.start({durationMinutes:2,config,now:3002,wallTime:'bad'}));
});
test('student/research wiring preserves batching and hides diagnostics in Beginner',()=>{
  const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
  const app=read('app.mjs'),html=read('index.html'),research=read('stability.html');
  assert.match(html,/class="student-engine-row advanced-only"/);
  assert.match(html,/class="perf-diagnostics advanced-only"/);
  assert.match(research,/id="performancePanel" open/);
  assert.match(app,/tuningPreference==='adaptive'\?'adaptive':'fixed'/);
  assert.match(app,/setLevel\(researchPage\?'advanced':'beginner'\)/);
  for(const id of ['startStability','stopStability','exportStability','stabilityDuration','stabilityStatus','stabilityDevice']){
    assert.ok(html.includes('id="'+id+'"'));assert.ok(research.includes('id="'+id+'"'));
  }
  assert.match(app,/stability\.worker\(sample,performance\.now\(\)\)/);
  assert.match(app,/visibilitychange/);assert.match(app,/stabilityEvent\('engine_error'/);
});

test('delivery summaries weight window duration, omit interrupted windows and tolerate older reports',()=>{
  const r=start();
  r.rates({...activity,durationMs:1000,paints:60,snapshots:40,steps:800,requests:40,animationFrames:60},2000);
  r.rates({...activity,durationMs:2000,paints:60,snapshots:40,steps:800,requests:40,animationFrames:60},4000);
  r.rates({...activity,durationMs:1000,paints:1,snapshots:1,steps:1,requests:1,animationFrames:1,interrupted:true},5000);
  assert.deepEqual(r.report(5000).summary.deliveryRates,{paintsPerSecond:40,freshFieldsPerSecond:80/3,
    flowStepsPerSecond:1600/3,requestsPerSecond:80/3,animationCallbacksPerSecond:40});
  const legacy=start();legacy.rates({...activity,durationMs:1000,paints:30,snapshots:30,steps:720},2000);
  assert.equal(legacy.report(2000).summary.deliveryRates.requestsPerSecond,null);
  assert.equal(legacy.report(2000).summary.deliveryRates.animationCallbacksPerSecond,null);
  assert.equal(legacy.report(2000).summary.deliveryRates.flowStepsPerSecond,720);
});
