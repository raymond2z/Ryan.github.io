import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FluidSimulation} from './simulation.mjs';
import {referenceBoundaryImpulse,nextRelativeForce,relativeForceResult,
  FORCE_SCALE,FORCE_SMOOTHING} from './gpu-relative-force.mjs';

test('relative force is simulation-unit based and vertical Lift sign is corrected',()=>{
  const a=relativeForceResult(3,-4);
  assert.equal(a.drag,3);
  assert.equal(a.lift,4);
  assert.equal(a.resultant,5);
  assert.match(a.units,/simulation units/);
  assert.throws(()=>relativeForceResult(NaN,0));
});
test('bounce-back impulse counts fluid→solid links once with correct orientations',()=>{
  const width=9,height=9,n=width*height,solid=new Uint8Array(n);
  solid[4+4*width]=1;
  const post=new Float32Array(n*9);
  // One fluid cell immediately left of the obstacle, east-moving q=1.
  const i=3+4*width;post[n+i]=2;
  const impulse=referenceBoundaryImpulse(post,solid,width,height);
  assert.equal(impulse.fx,4);assert.equal(impulse.fy,0);assert.equal(impulse.links,8);
  // Vertical northward hit on obstacle: q=4 goes up from the cell below.
  const below=4+5*width;post[4*n+below]=1.5;
  const b=referenceBoundaryImpulse(post,solid,width,height);
  assert.equal(b.fx,4);assert.equal(b.fy,-3);
  const none=referenceBoundaryImpulse(post,new Uint8Array(n),width,height);
  assert.equal(none.fx,0);assert.equal(none.fy,0);assert.equal(none.links,0);
});
test('GPU reduction smoothing formula follows Rust dt=0.5 forceScale and damping',()=>{
  assert.equal(FORCE_SCALE,4);
  assert.ok(Math.abs(FORCE_SMOOTHING-(1-Math.sqrt(.98)))<1e-15);
  let value={x:0,y:0};
  const impulse={fx:3,fy:-2};
  for(let i=0;i<4;i++)value=nextRelativeForce(value,impulse);
  const b=1-Math.pow(1-FORCE_SMOOTHING,4);
  assert.ok(Math.abs(value.x-4*3*b)<1e-12);
  assert.ok(Math.abs(value.y+4*2*b)<1e-12);
});
test('Rust compiled WASM force agrees with existing JavaScript reference at same settings',async()=>{
  const bytes=readFileSync(new URL('./rust/airflow_solver.wasm',import.meta.url));
  const {instance}=await WebAssembly.instantiate(bytes,{});
  const e=instance.exports;
  for(const method of ['solver_force_x','solver_force_y','solver_step_many','solver_create'])
    assert.equal(typeof e[method],'function','Rust WASM missing '+method);
  for(const [shape,speed] of [['block',.085],['streamlined',.15]]){
    const sim=new FluidSimulation(168,72);
    sim.speed=speed;sim.viscosity=.025;sim.setShape(shape,0);
    const handle=e.solver_create(sim.width,sim.height,speed,.025);
    assert.ok(handle);
    try{
      new Uint8Array(e.memory.buffer,e.solver_solid_ptr(handle),sim.n).set(sim.solid);
      assert.equal(e.solver_reset(handle),1);
      for(let k=0;k<50;k++)sim.step();
      assert.equal(e.solver_step_many(handle,50),50);
      const diffX=Math.abs(e.solver_force_x(handle)-sim.forceX);
      const diffY=Math.abs(e.solver_force_y(handle)-sim.forceY);
      assert.ok(diffX<1e-6,shape+' drag differs '+diffX);
      assert.ok(diffY<1e-6,shape+' lift differs '+diffY);
    }finally{e.solver_free(handle);}
  }
});
test('WGSL computes from collision-output populations and reduces once per half-step',()=>{
  const shader=readFileSync(new URL('./gpu-relative-force-v1.wgsl',import.meta.url),'utf8');
  for(const code of ['fn boundaryImpulse(', 'fn smoothImpulse(', 'post[q*settings.count+i]',
    'obstacle[neighbor]!=0u','2.0*population',
    'smoothedForce[0]','sqrt(0.98)','4.0*reduction[0]'])
    assert.ok(shader.includes(code),'Missing GPU force physics: '+code);
  assert.doesNotMatch(shader,/atomicAdd/);
});
test('benchmark routes GPU force through Rust parity independently of Student UI',()=>{
  const core=readFileSync(new URL('./gpu-solver.mjs',import.meta.url),'utf8');
  const html=readFileSync(new URL('./benchmark.html',import.meta.url),'utf8');
  const ui=readFileSync(new URL('./gpu-solver-ui.mjs',import.meta.url),'utf8');
  assert.match(core,/force\.encodeHalfStep\(encoder\)/);
  assert.match(core,/force\.encodeReadback\(encoder\)/);
  assert.match(core,/loadRustWasm\(\)/);
  assert.match(core,/solver_force_x\(handle\)/);
  assert.match(core,/solver_force_y\(handle\)/);
  assert.match(core,/rustReferenceMs/);
  assert.match(core,/javascriptForce/);
  for(const id of new Set([...ui.matchAll(/\$\('([A-Za-z][A-Za-z0-9]*)'\)/g)].map(m=>m[1])))
    assert.ok(html.includes('id="'+id+'"'),'Missing benchmark HTML #'+id);
  const student=readFileSync(new URL('./student-gpu-worker-v2.mjs',import.meta.url),'utf8');
  assert.match(student,/createGpuForceController/,'Stage 3.2 may opt in to verified GPU force math');
  assert.match(student,/if\(forceEnabled&&forceController\)forceController.encodeHalfStep\(encoder\)/,
    'Student Lab must not incur force passes when toggle is off');
  assert.match(student,/if\(forceEnabled&&forceController\)forceController.encodeReadback\(encoder\)/,
    'GPU force readback only while explicitly enabled');
  assert.match(student,/type:'forceStatus',enabled:false,available:false/,
    'Force setup errors must be isolated from the flow solver');
  assert.doesNotMatch(student,/new Float32Array\(.*post.*\)/,
    'Force must remain GPU-resident rather than downloading nine distributions per step');
});
