import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FluidSimulation} from './simulation.mjs';
import {validateSolverSettings,initialSolverFields,unpackMacroscopic,compareFullFields} from './gpu-solver.mjs';

test('full WebGPU solver uses exactly the same validated benchmark settings',()=>{
  const config=validateSolverSettings({grid:'fast',shape:'block',speed:.085,steps:50});
  assert.equal(config.dt,.5);
  assert.equal(config.viscosity,.025);
  assert.equal(config.warmup,8);
  assert.throws(()=>validateSolverSettings({grid:'large',shape:'block',speed:.085,steps:50}));
  assert.throws(()=>validateSolverSettings({grid:'fast',shape:'block',speed:9,steps:50}));
});
test('GPU input distributions start from the exact CPU obstacle mask and initial state',()=>{
  for(const shape of ['circle','block','streamlined','plate','car','bird','pikachu']){
    const {config,initial,solid,reference}=initialSolverFields({grid:'fast',shape,speed:.085,steps:50});
    assert.equal(initial.length,9*config.width*config.height);
    assert.equal(solid.length,config.width*config.height);
    assert.deepEqual(Array.from(initial.slice(0,50)),Array.from(new Float32Array(reference.f.slice(0,50))));
    assert.deepEqual(Array.from(solid),Array.from(reference.solid));
    assert.ok(solid.some(x=>x===1));
  }
});
test('full-field decoding, finiteness and RMS error checks are meaningful',()=>{
  const sim=new FluidSimulation(48,28);
  const packed=new Float32Array(sim.n*4);
  for(let i=0;i<sim.n;i++){
    packed[i*4]=sim.rho[i];packed[i*4+1]=sim.ux[i];
    packed[i*4+2]=sim.uy[i];packed[i*4+3]=sim.solid[i];
  }
  const fields=unpackMacroscopic(packed,sim.solid,sim.width,sim.height);
  assert.equal(fields.invalid,0);assert.equal(fields.densityOutOfRange,0);
  assert.equal(fields.solidsMismatch,0);
  let d=compareFullFields(fields,sim);
  assert.ok(d.rms.rho<1e-7);
  assert.ok(d.rms.ux<1e-7);
  assert.equal(d.withinReviewTolerance,true);
  packed[0]=NaN;
  assert.equal(unpackMacroscopic(packed,sim.solid,sim.width,sim.height).invalid,1);
  packed[0]=4;
  assert.equal(unpackMacroscopic(packed,sim.solid,sim.width,sim.height).densityOutOfRange,1);
});
test('pull streaming with bounce-back is algebraically identical to CPU source push',()=>{
  const w=18,h=12,n=w*h;
  const cx=[0,1,0,-1,0,1,-1,-1,1];
  const cy=[0,0,1,0,-1,1,1,-1,-1];
  const op=[0,3,4,1,2,7,8,5,6];
  const solid=new Uint8Array(n);
  for(let y=4;y<8;y++)for(let x=6;x<10;x++)solid[x+y*w]=1;
  const post=new Float32Array(n*9);
  for(let i=0;i<n;i++)for(let q=0;q<9;q++)post[q*n+i]=(q+1)*.01+(i%17)*.001;
  const push=new Float32Array(n*9),pull=new Float32Array(n*9);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=x+y*w;if(solid[i])continue;
    for(let q=0;q<9;q++){
      const xx=x+cx[q],yy=y+cy[q];
      if(xx<0||yy<0||xx>=w||yy>=h)continue;
      const j=xx+yy*w;
      if(solid[j])push[op[q]*n+i]+=post[q*n+i];
      else push[q*n+j]+=post[q*n+i];
    }
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=x+y*w;if(solid[i])continue;
    for(let q=0;q<9;q++){
      const xx=x-cx[q],yy=y-cy[q];
      if(xx<0||yy<0||xx>=w||yy>=h)continue;
      const j=xx+yy*w;
      pull[q*n+i]=solid[j]?post[op[q]*n+i]:post[q*n+j];
    }
  }
  assert.deepEqual(pull,push);
});
test('WGSL implements all core physics passes and boundary conditions',()=>{
  const shader=readFileSync(new URL('./d2q9-solver-r2-20261010.wgsl',import.meta.url),'utf8');
  for(const token of [
    'fn collision(', 'fn streaming(', 'fn macroscopic(', 'fn gather(',
    'OP[q]*cfg.count+cellIndex', 'cfg.omega','pxx','pxy','pyy',
    'x==cfg.width-1u','x==0u','y==0u','y==cfg.height-1u',
    '@compute @workgroup_size(64)'
  ])assert.ok(shader.includes(token),'Missing critical shader part '+token);
  assert.doesNotMatch(shader,/atomicAdd/,'pull streaming must use disjoint writes');
  assert.doesNotMatch(shader,/\btarget\b/,'WGSL reserved identifier must not be used');
  assert.match(shader,/4\.0\/9\.0,1\.0\/9\.0,1\.0\/9\.0,1\.0\/9\.0,1\.0\/9\.0/,'All five D2Q9 axial weight entries present');
  const loader=readFileSync(new URL('./gpu-solver.mjs',import.meta.url),'utf8');
  assert.match(loader,/d2q9-solver-r2-20261010\.wgsl/,'Solver loads the corrected, versioned shader');
  assert.match(loader,/cache:'no-store'/,'Disable stale browser cache for corrected shader');
});
test('Stage 2 DOM controls have matching selectors and a distinct scope',()=>{
  const html=readFileSync(new URL('./benchmark.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('./gpu-solver-ui.mjs',import.meta.url),'utf8');
  for(const id of new Set([...js.matchAll(/\$\('([a-zA-Z][a-zA-Z0-9]*)'\)/g)].map(m=>m[1]))){
    assert.ok(html.includes('id="'+id+'"'),'Missing #'+id);
  }
  assert.match(html,/complete D2Q9/i);
  assert.match(html,/readback/i);
  assert.match(html,/reference/i);
});
