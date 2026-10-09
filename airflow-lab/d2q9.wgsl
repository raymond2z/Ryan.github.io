// Stage 1: D2Q9 equilibrium kernel ONLY, not a complete LBM solver.
// Source: the equilibrium equation already used in simulation.mjs and Rust.
// This shader does not perform collision, streaming, or boundary handling.
struct Cell {
  rho: f32,
  ux: f32,
  uy: f32,
  solid: f32,
}
@group(0) @binding(0) var<storage, read> cells: array<Cell>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

const CX: array<f32, 9> = array<f32, 9>(0.0,1.0,0.0,-1.0,0.0,1.0,-1.0,-1.0,1.0);
const CY: array<f32, 9> = array<f32, 9>(0.0,0.0,1.0,0.0,-1.0,1.0,1.0,-1.0,-1.0);
const WT: array<f32, 9> = array<f32, 9>(
  4.0/9.0,1.0/9.0,1.0/9.0,1.0/9.0,1.0/9.0,
  1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0
);

@compute @workgroup_size(64)
fn equilibrium(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let index: u32 = invocation.x;
  let count: u32 = arrayLength(&cells);
  if (index >= count) { return; }
  let state: Cell = cells[index];
  let u: f32 = select(state.ux * 0.5, 0.0, state.solid > 0.5);
  let v: f32 = select(state.uy * 0.5, 0.0, state.solid > 0.5);
  let speedSquared: f32 = u*u + v*v;
  for (var q: u32 = 0u; q < 9u; q = q + 1u) {
    let cu: f32 = CX[q]*u + CY[q]*v;
    output[index*9u + q] =
      WT[q]*state.rho*(1.0 + 3.0*cu + 4.5*cu*cu - 1.5*speedSquared);
  }
}
