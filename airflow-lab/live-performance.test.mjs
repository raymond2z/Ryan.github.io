import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeAdaptiveStepper,STEP_FIXED,STEP_MIN,STEP_MAX,MAX_TRACER_DEBT,
  RENDER_INTERVAL_MS,shouldDrawGpuFrame,createGpuPaintPacer,FRAME_ALIGNMENT_MARGIN_MS,forceFrameTiming} from './live-performance.mjs';
const get=name=>readFileSync(new URL('./'+name,import.meta.url),'utf8');

test('batch cap is bounded and begins with legacy 8-step workload',()=>{
  const c=makeAdaptiveStepper();
  assert.equal(STEP_FIXED,8);assert.equal(STEP_MIN,4);assert.equal(STEP_MAX,24);
  assert.equal(c.batch,8);
  for(let i=0;i<100;i++)c.observe({steps:c.batch,workerMs:5});
  assert.equal(c.batch,24);
  for(let i=0;i<100;i++)c.observe({steps:c.batch,workerMs:180});
  assert.equal(c.batch,4);
  c.reset();assert.equal(c.batch,8);assert.equal(c.smoothedMs,null);
});
test('adaptive controller ignores zero, nonfinite and invalid timing',()=>{
  const c=makeAdaptiveStepper();
  for(const input of [{steps:0,workerMs:5},{steps:3,workerMs:NaN},
    {steps:3,workerMs:-1},{steps:-2,workerMs:100}])c.observe(input);
  assert.equal(c.batch,8);assert.equal(c.smoothedMs,null);
  assert.ok(MAX_TRACER_DEBT>=STEP_MAX);
});
test('Canvas paint is capped and independent of GPU sample delivery',()=>{
  assert.ok(RENDER_INTERVAL_MS>=33);
  const base={now:1000,lastPaint:985,fluidDirty:true,
    tracerDebt:24,running:true,particlesEnabled:true};
  assert.equal(shouldDrawGpuFrame(base),false);
  assert.equal(shouldDrawGpuFrame({...base,lastPaint:950}),true);
  assert.equal(shouldDrawGpuFrame({...base,lastPaint:950,fluidDirty:false,tracerDebt:0}),false);
  assert.equal(shouldDrawGpuFrame({...base,lastPaint:950,fluidDirty:false,tracerDebt:7}),true);
  assert.equal(shouldDrawGpuFrame({...base,lastPaint:950,fluidDirty:false,particlesEnabled:false}),false);
  assert.equal(shouldDrawGpuFrame({...base,lastPaint:950,fluidDirty:true,running:false}),true);
});
test('absolute-time paint scheduler achieves ~30 fps on 60/90/120 Hz requestAnimationFrame',()=>{
  assert.ok(FRAME_ALIGNMENT_MARGIN_MS>=1&&FRAME_ALIGNMENT_MARGIN_MS<3);
  for(const hz of [60,90,120]){
    const pace=createGpuPaintPacer(),n=10*hz;
    let paints=0;
    for(let i=0;i<n;i++)if(pace.shouldDraw({
      now:i*1000/hz,fluidDirty:true,tracerDebt:0,running:true,particlesEnabled:false
    }))paints++;
    assert.ok(paints>=295&&paints<=305,
      hz+' Hz led to '+paints+' paints in 10 seconds; expected approximately 300');
  }
});
test('GPU paint pacer skips unchanged fields and recovers after delayed/paused callbacks',()=>{
  const pace=createGpuPaintPacer();
  const o={now:1000,fluidDirty:false,tracerDebt:0,running:true,particlesEnabled:true};
  assert.equal(pace.shouldDraw(o),false);
  assert.equal(pace.nextDue,null);
  assert.equal(pace.shouldDraw({...o,fluidDirty:true}),true);
  assert.equal(pace.shouldDraw({...o,now:1017,fluidDirty:true}),false);
  assert.equal(pace.shouldDraw({...o,now:1033.2,fluidDirty:true}),true);
  assert.equal(pace.shouldDraw({...o,now:1034,fluidDirty:true}),false);
  assert.equal(pace.shouldDraw({...o,now:1600,fluidDirty:true}),true);
  assert.equal(pace.shouldDraw({...o,now:1617,fluidDirty:false,tracerDebt:0}),false);
  pace.reset();assert.equal(pace.nextDue,null);
  assert.equal(pace.shouldDraw({...o,now:2000,fluidDirty:false,tracerDebt:2}),true);
});
test('diagnostic display rounds actual elapsed wall-clock values',()=>{
  assert.equal(forceFrameTiming(12.36),12.4);
  assert.equal(forceFrameTiming(NaN),null);
  assert.equal(forceFrameTiming(-1),null);
});
test('Student worker timing separates CPU encoding from combined GPU queue/readback',()=>{
  const worker=get('student-gpu-worker-v3.mjs');
  for(const part of ['const STEP_LIMIT=24','const encodeStart=performance.now()',
    'const waitStart=performance.now()','const queueReadbackMs',
    'const unpackMs','const workerMs','perf:{encodeMs,queueReadbackMs,unpackMs,workerMs,forceEnabled}',
    "if(msg.revision!==revision)", "forceEnabled&&forceController"])
    assert.ok(worker.includes(part),'Missing live worker instrumentation: '+part);
  assert.ok(worker.includes('student-gpu-v3'));
});
test('student controls default to classroom Auto and retain explicit Fixed/export controls',()=>{
  const html=get('index.html'),app=get('app.mjs');
  for(const id of ['batchMode','resetPerformance','exportPerformance','perfPaint',
    'perfEncode','perfWait','perfUnpack','perfRoundTrip','perfSnapshots','perfBatch','perfStatus'])
    assert.ok(html.includes('id="'+id+'"'), 'Missing diagnostic control '+id);
  assert.match(app,/student-gpu-worker-v3\.mjs/);
  assert.match(app,/classroomGpuPage&&tuningPreference!=='fixed'/);
  assert.match(app,/sendCount=engineKind==='webgpu'/);
  assert.match(app,/Math\.min\(count,adaptiveGpu\?adaptiveGpuBatch\(\):STEP_FIXED\)/);
  assert.match(app,/gpuPaintPacer\.shouldDraw/);
  assert.match(app,/gpuPaintPacer\.reset\(\)/);
  assert.match(app,/gpuFluidDirty=true/);
  assert.match(app,/gpuParticleDebt=0/);
  assert.match(app,/performanceSamples:gpuSamples,paintSamples/);
  assert.match(html,/GPU queue \+ readback wait/);
  assert.match(html,/Canvas FPS is NOT GPU solver Steps\/s/);
});

