import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const get=name=>readFileSync(new URL('./'+name,import.meta.url),'utf8');

test('Student Lab offers WebGPU, Rust, JavaScript and Auto choices',()=>{
  const html=get('index.html'),app=get('app.mjs');
  for(const name of ['auto','webgpu','wasm','javascript'])
    assert.ok(html.includes('value="'+name+'"'),'Missing engine '+name);
  assert.match(app,/engineChoice=\['javascript','wasm','webgpu'\]/);
  assert.match(app,/engineKind==='webgpu'\?'\.\/student-gpu-worker-v3\.mjs'/);
  assert.match(app,/const wasGpu=engineKind==='webgpu'/);
  assert.match(app,/beginRustEngine\('wasm'\)/,'Rust must be fallback if GPU cannot initialize or compute');
  assert.match(app,/data\.forceOptIn/,'GPU force must be explicitly supported by the worker');
  assert.match(app,/syncGpuForce\(\)/,'GPU force is opt-in and follows the toggle');
  assert.match(app,/data\.type==='forceStatus'/,'GPU force failures must not stop the simulation');
});

test('GPU worker uses persistent D2Q9 ping-pong fields and serialized messages',()=>{
  const s=get('student-gpu-worker-v3.mjs');
  for(const snippet of [
    'd2q9-solver-r2-20261010.wgsl',
    'student-gpu-stir-v1.wgsl',
    'await device.queue.onSubmittedWorkDone()',
    'mapAsync(GPUMapMode.READ)',
    'type:\'resetDone\'',
    'type:\'frame\'',
    "msg.type===\'recycle\'",
    'type:\'skipped\'',
    'Math.min(STEP_LIMIT',
    'queueReadbackMs', 'encodeMs', 'workerMs', 'perf:{encodeMs,queueReadbackMs,unpackMs,workerMs,forceEnabled}',
    "if(forceEnabled&&forceController)forceController.encodeHalfStep(encoder)",
    "if(forceEnabled&&forceController)forceController.encodeReadback(encoder)",
    "const forcePending=forceEnabled&&forceController",
    "await setForceEnabled(Boolean(msg.enabled))",
    'let pending=Promise.resolve()',
    'if(msg.revision!==revision)',
    'new Float32Array(model.f)',
    'uniforms();clock=0',
  ])assert.ok(s.includes(snippet),'Missing GPU worker feature '+snippet);
  assert.match(s,/for\(let half=0;half<2;half\+\+\)/,'two half-steps for each public step');
  assert.match(s,/worker/);
});

test('WebGPU compute shader Stir affects momentum without clobbering an obstacle',()=>{
  const s=get('student-gpu-stir-v1.wgsl');
  for(const phrase of ['@compute @workgroup_size(64)','fn stir(','solid[i]!=0u',
    'clamp(push.dx*0.008','clamp(push.dy*0.008','distribution[q*push.count+i]'])
    assert.ok(s.includes(phrase),'Missing Stir feature '+phrase);
  assert.equal((s.match(/1\.0\/9\.0/g)||[]).length,4);
  assert.equal((s.match(/1\.0\/36\.0/g)||[]).length,4);
  assert.ok(s.includes('4.0/9.0'));
});

test('Student Lab controls preserve drawing, reset, probe and performance reporting',()=>{
  const s=get('app.mjs');
  for(const phrase of ['resetRustField()','updateRustParameters()','sim.translateMask(',
    "type:'push'","type:'step'","type:'params'",
    "'WebGPU'","manualSteps","workerInFlight","sim.rho=data.fields.rho"])
    assert.ok(s.includes(phrase),'Missing UI integration '+phrase);
});

test('HTML references required controls and marks GPU as experimental',()=>{
  const html=get('index.html'),app=get('app.mjs');
  assert.match(html,/WebGPU \(experimental\)/);
  assert.match(html,/id="forceReadout"/);
  assert.match(html,/id="forceNote"/);
  assert.match(app,/gpuForceValid/);
  assert.match(app,/force:\$\('force'\)\.checked/,'A\/B captures may include force snapshots');
  for(const id of new Set([...app.matchAll(/\$\('([a-zA-Z][a-zA-Z0-9]*)'\)/g)].map(m=>m[1])))
    assert.ok(html.includes('id="'+id+'"'),'Missing #'+id);
});
