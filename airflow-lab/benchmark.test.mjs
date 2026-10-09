import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FluidSimulation} from './simulation.mjs';
import {validateConfig,runCpuTrial,compareFields,configKey} from './benchmark-core.mjs';

test('validated benchmark settings reject unsupported configurations',()=>{
  const valid=validateConfig({grid:'fast',shape:'block',speed:0.085,steps:50});
  assert.equal(valid.width,168);
  assert.equal(valid.height,72);
  assert.equal(valid.warmup,8);
  assert.throws(()=>validateConfig({grid:'wrong',shape:'block',speed:0.085,steps:50}));
  assert.throws(()=>validateConfig({grid:'fast',shape:'block',speed:999,steps:50}));
  assert.throws(()=>validateConfig({grid:'fast',shape:'block',speed:0.085,steps:-3}));
});

test('all existing obstacle silhouettes remain present on fast and detailed grids',()=>{
  for(const [width,height] of [[168,72],[240,104]]){
    const sim=new FluidSimulation(width,height);
    for(const shape of ['circle','block','streamlined','plate','car','bird','pikachu']){
      sim.setShape(shape);
      const solids=sim.solid.reduce((n,cell)=>n+cell,0);
      assert.ok(solids>0,shape+' should have solid cells');
      assert.ok(solids<sim.n*.2,shape+' should not fill the entire tunnel');
    }
  }
});

test('same solver run is deterministic and records measured throughput',async()=>{
  const cfg={grid:'fast',shape:'block',speed:0.085,steps:50};
  const first=await runCpuTrial(cfg);
  const second=await runCpuTrial(cfg);
  assert.equal(configKey(first),configKey(second));
  assert.equal(first.steps,50);
  assert.ok(first.computeMs>0);
  assert.ok(first.wallMs>=first.computeMs);
  assert.ok(first.stepsPerSecond>0);
  assert.ok(first.preview.speeds.length===64*28);
  assert.ok(first.preview.solids.length===64*28);
  assert.deepEqual(first.metrics,second.metrics);
  assert.equal(compareFields(first.metrics,second.metrics).matches,true);
});

test('benchmark page has every runtime-referenced control ID',()=>{
  const html=readFileSync(new URL('./benchmark.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('./benchmark.mjs',import.meta.url),'utf8');
  const required=new Set([...js.matchAll(/\$\('([A-Za-z][A-Za-z0-9]*)'\)/g)].map(match=>match[1]));
  for(const id of required)assert.ok(html.includes('id="'+id+'"'),'Missing DOM element: '+id);
});
