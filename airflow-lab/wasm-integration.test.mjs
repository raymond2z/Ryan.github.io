import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FluidSimulation} from './simulation.mjs';
import {summarize,compareFields} from './benchmark-core.mjs';

const artifact=new URL('./rust/airflow_solver.wasm',import.meta.url);
const bytes=readFileSync(artifact);
const wasm=await WebAssembly.instantiate(bytes,{});
const {memory,solver_create,solver_free,solver_solid_ptr,solver_reset,
  solver_step_many,solver_rho_ptr,solver_ux_ptr,solver_uy_ptr}=wasm.instance.exports;

function compareOne(width,height,shape,speed,steps){
  const original=new FluidSimulation(width,height);
  original.speed=speed;original.viscosity=.025;original.setShape(shape,0);
  const handle=solver_create(width,height,speed,.025);
  assert.ok(handle,'Rust solver handle must be non-null');
  try{
    const n=width*height;
    new Uint8Array(memory.buffer,solver_solid_ptr(handle),n).set(original.solid);
    assert.equal(solver_reset(handle),1);
    for(let i=0;i<8;i++)original.step();
    assert.equal(solver_step_many(handle,8),8);
    for(let i=0;i<steps;i++)original.step();
    assert.equal(solver_step_many(handle,steps),steps);
    const fields={
      n,width,height,
      solid:new Uint8Array(memory.buffer,solver_solid_ptr(handle),n),
      rho:new Float64Array(memory.buffer,solver_rho_ptr(handle),n),
      ux:new Float64Array(memory.buffer,solver_ux_ptr(handle),n),
      uy:new Float64Array(memory.buffer,solver_uy_ptr(handle),n),
    };
    const reference=summarize(original),rust=summarize(fields);
    assert.equal(reference.solidCells,rust.solidCells,'same obstacle mask');
    const summary=compareFields(reference.metrics,rust.metrics);
    assert.ok(summary.maxDifference<=1e-7,'solver mismatch, maximum mean-field delta = '+summary.maxDifference);
    for(let i=0;i<reference.preview.speeds.length;i++){
      assert.ok(Math.abs(reference.preview.speeds[i]-rust.preview.speeds[i])<=1,
        'speed preview mismatch at pixel '+i);
      assert.equal(reference.preview.solids[i],rust.preview.solids[i]);
    }
    return summary.maxDifference;
  }finally{solver_free(handle);}
}

test('Rust WASM exports a callable C ABI and linear memory',()=>{
  assert.ok(bytes.length>1000,'real compiled wasm binary must be present');
  assert.equal(bytes.subarray(0,4).toString('hex'),'0061736d');
  assert.ok(memory instanceof WebAssembly.Memory);
});

test('fast grid 50-step block result matches JavaScript',()=>{
  const diff=compareOne(168,72,'block',.085,50);
  assert.ok(diff<=1e-7);
});

test('detailed grid circle matches JavaScript',()=>{
  const diff=compareOne(240,104,'circle',.15,20);
  assert.ok(diff<=1e-7);
});
