import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProbeSettings,makeProbeFields,cpuEquilibrium,verifyEquilibrium,PROBE_TOLERANCE} from './gpu-engine.mjs';

const baseline={grid:'fast',shape:'block',speed:.085,dispatches:8};

test('rejects invalid GPU probe settings and unreasonable workloads',()=>{
  assert.equal(validateProbeSettings(baseline).width,168);
  assert.throws(()=>validateProbeSettings({...baseline,grid:'wrong'}));
  assert.throws(()=>validateProbeSettings({...baseline,shape:'unknown'}));
  assert.throws(()=>validateProbeSettings({...baseline,speed:50}));
  assert.throws(()=>validateProbeSettings({...baseline,dispatches:99999}));
});

test('all shapes and supported grids create deterministic f32 input fields',()=>{
  for(const grid of ['fast','detail','large']){
    for(const shape of ['circle','block','streamlined','plate','car','bird','pikachu','none']){
      const settings={...baseline,grid,shape};
      const a=makeProbeFields(settings),b=makeProbeFields(settings);
      assert.equal(a.count,a.cfg.width*a.cfg.height);
      assert.equal(a.cells.length,a.count*4);
      assert.deepEqual(a.cells,b.cells,'input must not use randomness');
      assert.ok(a.solidCells<.2*a.count);
      assert.equal(a.solidCells===0,shape==='none');
    }
  }
});

test('CPU D2Q9 equilibrium preserves mass to floating point tolerance',()=>{
  const {cells,count}=makeProbeFields(baseline);
  const out=cpuEquilibrium(cells);
  assert.equal(out.length,count*9);
  for(let i=0;i<count;i+=37){
    let rho=0;
    for(let q=0;q<9;q++)rho+=out[i*9+q];
    assert.ok(Math.abs(rho-cells[4*i])<1e-6,'equilibrium populations sum to density');
  }
  const verified=verifyEquilibrium(out,out);
  assert.equal(verified.pass,true);
  assert.equal(verified.maxDifference,0);
  assert.equal(verified.comparisons,out.length);
});

test('numerical validation flags mismatches, invalid output and truncated arrays',()=>{
  const a=cpuEquilibrium(makeProbeFields(baseline).cells);
  const b=a.slice();
  b[10]+=PROBE_TOLERANCE*4;
  assert.equal(verifyEquilibrium(b,a).pass,false);
  b[10]=NaN;
  assert.equal(verifyEquilibrium(b,a).nonFinite,1);
  assert.throws(()=>verifyEquilibrium(b.subarray(2),a));
});

test('WGSL source is a compute-only D2Q9 equilibrium kernel',()=>{
  const shader=readFileSync(new URL('./d2q9.wgsl',import.meta.url),'utf8');
  assert.match(shader,/@compute\s+@workgroup_size\(64\)/);
  assert.match(shader,/fn equilibrium\(/);
  assert.match(shader,/array<f32, 9>/);
  assert.match(shader,/arrayLength\(&cells\)/);
  assert.match(shader,/output\[index\*9u \+ q\]/);
  assert.doesNotMatch(shader,/fn streaming\(/,'streaming is intentionally not implemented');
});

test('Benchmark page includes every WebGPU probe control',()=>{
  const html=readFileSync(new URL('./benchmark.html',import.meta.url),'utf8');
  const ui=readFileSync(new URL('./gpu-probe-ui.mjs',import.meta.url),'utf8');
  for(const id of new Set([...ui.matchAll(/\$\('([A-Za-z][A-Za-z0-9]*)'\)/g)].map(m=>m[1]))){
    assert.ok(html.includes('id="'+id+'"'),'Missing #'+id);
  }
  assert.match(html,/equilibrium-only/i);
  assert.match(html,/not.*fluid/i);
});
