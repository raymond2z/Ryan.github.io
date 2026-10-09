# WebGPU Stage 1 — Capability and D2Q9 equilibrium compute probe

## Status

This is a **real WGSL WebGPU compute experiment**, not a simulated demo. It runs on supported browsers at the [Benchmark Lab](https://raymond2z.github.io/Ryan.github.io/airflow-lab/benchmark.html), below the existing JavaScript / Rust CPU benchmarks.

**Crucial distinction:** this first shader calculates only the D2Q9 **equilibrium populations** for a synthetic but repeatable set of local density and velocity inputs. Each dispatch overwrites the same results. It does **not** yet implement the LBM collision, streaming, bounce-back boundary conditions or evolve a fluid field. Therefore **kernel cell evaluations/s must not be compared to CPU or Rust solver Steps/s**. Student Lab remains on the proven Rust/JS implementation.

## Files

- `d2q9.wgsl`: f32 GPU equilibrium kernel, one invocation per grid cell, nine populations per cell
- `gpu-engine.mjs`: real GPU adapter/device checks, pipeline, buffers, command dispatches, copy+map readback, reference comparison
- `gpu-worker.mjs`: WebGPU off-main-thread execution where WorkerNavigator.gpu is available
- `gpu-probe-ui.mjs`: Benchmark Lab diagnostics, execution selection, status, JSON export
- `webgpu-validation.test.mjs`: CPU equation + fixture tests and interface/static shader checks

## Reproducible testing on iPad and Galaxy S24 Ultra

1. Open **Benchmark Lab** in Safari or Chrome over HTTPS.
2. Find **Experiment 02 / WebGPU** and check the support diagnostics. If the GPU is unavailable in a Worker, the probe falls back to the main-thread GPU, if offered.
3. Keep the same grid, obstacle and flow speed on both devices; start with **Detailed 240×104**, **Block**, flow **0.150**, and **8 kernel dispatches**.
4. Select **Run WGSL kernel probe**, confirm that CPU reference validation reports **PASS**, and export `airflow-webgpu-probe.json`.
5. Repeat with 32 dispatches, and optionally try **Large 480×208** if the device can run it.
6. Compare **dispatch + queue completion time**, **readback time**, **full-output maximum difference**, and **kernel cell evaluations/s**. These are CPU-observed GPU queue timings, not hardware GPU timestamps.

Keep the screen awake and the browser tab foregrounded; thermal throttling, other apps and power mode affect measurements. Each probe requires device initialization and shader compilation. Those operations are intentionally excluded from the dispatch completion metric; overall UI timing includes them. No test results are uploaded automatically.

## Engineering caveats

- GPU uses WGSL `f32`; CPU/Rust solvers use `f64` internally. The D2Q9 probe CPU reference matches the GPU *f32 output* within an absolute difference tolerance of `2e-5`.
- Browser WebGPU and WorkerNavigator.gpu support vary by version/device. The probe **checks** for each context and shows an error rather than pretending to be supported.
- A GPU dispatch command does not measure GPU work time exactly. This project reports `performance.now()` elapsed time until `queue.onSubmittedWorkDone()`, plus a **separately measured** buffer-copy/map readback phase. GPU timestamps would need separate optional API support and validation.
- Real GPU execution cannot be verified in the headless GitHub Actions Node test environment. The CI tests check input generation, equation invariants, UI references, shader source structure and JavaScript syntax. Actual shader compilation and correctness need a WebGPU device.

## Exit criteria before Stage 2 (full D2Q9 GPU solver)

- Real GPU device on at least iPad or S24 Ultra can compile `d2q9.wgsl` and produce **PASS** with all 9 populations verified.
- Collect device JSON for 8 and 32 dispatch workloads, ideally on both devices.
- Verify the transfer cost is not disproportionate; if it is, use GPU-resident ping-pong populations with fewer readbacks in the future solver.
- Implement collision, streaming, bounce-back boundaries and inlet/outflow handling in WGSL, then validate against a Rust reference with tolerances that reflect `f32` precision and propagation over hundreds of steps.
- Only after successful solver parity and full UI benchmarks should WebGPU become an optional Student Lab engine.

## References

- [WebGPU API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [WebGPU in Web Workers — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WorkerNavigator/gpu)
