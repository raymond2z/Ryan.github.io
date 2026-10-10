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

## Original Stage 1 exit criteria (historical)

- Real GPU device on at least iPad or S24 Ultra can compile `d2q9.wgsl` and produce **PASS** with all 9 populations verified.
- Collect device JSON for 8 and 32 dispatch workloads, ideally on both devices.
- Verify the transfer cost is not disproportionate; if it is, use GPU-resident ping-pong populations with fewer readbacks in the future solver.
- Implement collision, streaming, bounce-back boundaries and inlet/outflow handling in WGSL, then validate against a Rust reference with tolerances that reflect `f32` precision and propagation over hundreds of steps.
- Only after successful solver parity and full UI benchmarks should WebGPU become an optional Student Lab engine.

## References

- [WebGPU API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [WebGPU in Web Workers — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WorkerNavigator/gpu)

## Stage 2 — Evolving D2Q9 f32 solver (experimental)

Stage 2 now lives in **Experiment 03** of the same Benchmark Lab. It is a **real evolving flow-field solver** and not the repeated-equilibrium-kernel evaluation of Experiment 02.

### Physics implementation

- `d2q9-solver.wgsl` implements **regularized BGK collision**, the scalar positivity limiter, nine D2Q9 populations, pull-streaming with bounce-back against the **same JavaScript obstacle mask**, a fixed inlet and far-field boundary, and zero-gradient copy outflow.
- One public simulation step contains **two** `dt=0.5` half-steps, as in the original JavaScript/Rust simulations.
- Nine-population fields remain on the **GPU** in a ping-pong arrangement; two collision/stream passes execute per half-step. The final density and velocity are reduced on the GPU and copied to CPU once.
- Test conditions: **Fast (168×72) and Detailed (240×104)**, 7 original benchmark shapes, wind speed 0.040/0.085/0.150, viscosity 0.025, 8 untimed evolving warmup steps, followed by **50/150/500** timed evolving steps.
- The current solver reproduces the **flow-state evolution core**, but does not yet implement student UI interactions such as dynamic stirring, changing viscosity mid-run, force measurements or model drag. Do **not** replace the Student Lab Rust engine yet.

### Numerical verification and honest performance measurement

After GPU evolution, an **independent original JavaScript f64 reference simulation** executes the same total steps. Reference computation is explicitly **excluded** from measured GPU solver compute time.

The results include:
- GPU Steps/s (**complete evolving steps**, not kernel evaluations) and GPU compute-dispatch queue wall time
- Final GPU macro-field readback duration
- Original JavaScript f64 reference CPU duration (for context only; separately timed)
- Full-field **RMS and maximum absolute deviations** for density, x and y velocities, plus nonfinite-cell and density-range checks
- A final 64×28 simulated speed-field preview and exportable `airflow-webgpu-full-solver.json`

The GPU uses `f32`, CPU uses `f64`. A provisional review heuristic flags RMS density `<0.01` and RMS component velocity `<0.03`, but these are **not physical calibration guarantees or proof of exact parity**. Vortices may diverge over hundreds of steps; report the actual errors, not just a PASS label.

Measured GPU compute duration uses wall-clock time until `GPUQueue.onSubmittedWorkDone()` after each chunk of at most 8 public steps. It includes command encoding/submission/queue synchronization overhead and does **not** equal a precise GPU hardware timer. Shader compilation, GPU initialization, final field readback and CPU numerical validation are excluded from solver throughput. Warmup is also excluded.

### Recommended device experiments

1. In Benchmark Lab select **Detailed / Block / Speed 0.085 / 50 steps** and click **Run complete GPU solver**.
2. Check the final field preview, error RMS and finiteness, and export the JSON. A failed numerical check is important feedback, not a successful performance result.
3. Repeat at 150 and 500 steps only if the preceding run is stable. Try speed 0.150 afterward for a stronger wake.
4. On the same device and with the same settings, measure Rust/WASM using Experiment 01 and compare **full simulation Steps/s**, not the earlier Stage 1 kernel throughput.
5. Record results on both Galaxy S24 Ultra and iPad. Do at least three trials for meaningful device comparisons.

### Verification status

CI checks shader structure, CPU algorithm assumptions, initial conditions and obstacle masks, bounce-back streaming equivalence, macroscopic field consistency, selector wiring and JavaScript syntax. **GitHub Actions does not certify runtime WebGPU shader compilation or numerical results on physical devices.** Use the actual iPad and S24 Ultra outputs before claiming a GPU speedup or activating GPU in Student Lab.


## Stage 3.1 — Relative Force GPU Research (2026-10)

**Choice A: classroom-relative force only.** This project does not assume physical dimensions or convert forces into SI newtons. A positive (F_x) is the model **Drag** along the left-to-right inlet; positive **Lift** is (-F_y), because Canvas Y increases downward. The **Resultant** is `Math.hypot(Fx,Fy)`. Negative Drag and Lift values may occur during unsteady flow and are *not* clamped to zero.

### Matching the existing Rust/JS solver

The original Rust and JavaScript solvers already use D2Q9 obstacle momentum exchange. At each `dt = 0.5` half-step, each fluid → solid link contributes `2 * f_post[q] * (CX[q], CY[q])`. The total is then exponentially smoothed with `s = 1 - 0.98 ** 0.5` and multiplied by `1 / (0.5 ** 2) = 4`.

The new **`gpu-relative-force-v1.wgsl`** uses workgroup reductions, *not* contested floating-point atomics. Its first compute pass reads the **post-collision populations** already produced by the solver, detects adjacent solid links using the same D2Q9 directions and obstacle mask, and sums the boundary momentum exchange per workgroup. Its second compute pass sums the partial results into one GPU-resident smoothed `(Fx, Fy)` pair. The pair is copied to JavaScript only **once at the end of each Benchmark run**, alongside the full-field readback.

**`gpu-relative-force.mjs`** creates those pipelines and buffers, and includes a separate CPU math reference for tests. The `gpu-solver.mjs` Benchmark engine now enables force calculations and reports the final **GPU f32**, **independently compiled Rust/WASM f64**, and **JavaScript f64** force values and the absolute GPU-vs-Rust discrepancies. Rust and JS are executed **after GPU timing** and are excluded from GPU solver Steps/s. Force evaluation itself is included in that GPU Steps/s metric, so the additional GPU cost is honestly measured.

### Keep Student Lab stable during force verification

The live Student Lab **has not enabled GPU force arrows or inserted the new per-half-step force dispatches**. Its proven GPU/Rust/JS engine selection and Canvas remain unchanged. This is intentional: the force pipeline adds GPU passes that may reduce mobile FPS and has not yet been verified on the user's physical devices.

### Next device-side verification

1. Open `benchmark.html` or `stage2-r2.html` and find **Experiment 03**.
2. Choose **Detailed / Block / Speed 0.085 / 50 steps**, and run the GPU solver. Confirm that a force table shows **GPU, Rust/WASM and JavaScript** Drag/Lift/Resultant. Export `airflow-webgpu-full-solver.json`.
3. If no error appears, try **150 and 500 steps** and then **Speed 0.150**. Repeat on iPad and Galaxy S24 Ultra as convenient.
4. Compare absolute force discrepancies (particularly vertical Lift near zero), direction and sign, and GPU Steps/s with the previous force-free solver. Do not treat identical GPU and Rust fluid-field means as proof of matching boundary forces.
5. Repeat **Block / Streamlined / Flat plate** and ±20° later in Stage 3.2. Existing Benchmark presets default to 0°; angled and custom-object validation requires a separate test path.

**Automated tests** check force momentum-exchange links and sign convention, half-step smoothing, Rust WASM vs JavaScript f64 force parity for representative shapes, shader structure, benchmark UI references, Student Lab isolation, and Naga WGSL syntax/semantic validation. The workflow **cannot run a physical WebGPU adapter** or prove GPU↔Rust parity on an iPad/S24 Ultra; that must come from real exported GPU force results.

### Promotion gates (Stage 3.2 → 3.3)

Before enabling force arrows in Student Lab:

- Verify GPU↔Rust force comparison on actual devices, including symmetric and tilted shapes (lift near zero needs absolute, not percentage tolerance).
- Set practical tolerances based on observed absolute and RMS errors across steps, not just a single final snapshot.
- Profile the added force passes and readback against real Student Lab FPS. If too slow, lower force reporting frequency while still integrating the GPU-smoothed values every half-step.
- Render Drag, Lift and Resultant from the same GPU force state using fixed, documented *relative* scales, while identifying that multiple barriers yield a **combined** force.
- Only then add fixed-window A/B force averages and annotated comparison reports.

## Stage 3.2 — Opt-in relative GPU force in the live Student Lab (experimental)

The Stage 3 live WebGPU solver, worker, shape-dragging, viscosity controls, Stir, and engine selection were **already implemented** before this update. Stage 3.2 does not recreate or replace these working parts. It adds an opt-in bridge to the independently validated Stage 3.1 GPU momentum-exchange force controller.

### Student controls and engineering approach

- Advanced-mode **Force on shape** works on **WebGPU**, as well as existing Rust/WASM and JavaScript solvers. The WebGPU force feature is deliberately **off by default**. It displays a relative model Drag, Lift and Resultant readout alongside the Canvas force arrow. Values are explicitly **not newtons**.
- The new `student-gpu-worker-v2.mjs` lazily loads `gpu-relative-force-v1.wgsl` and allocates the force buffers **only when the user enables the force switch**. When off, it dispatches **no force kernels or force readbacks**. The original verified `student-gpu-worker-v1.mjs` remains untouched.
- When enabled, two extra force compute passes execute **after each lattice collision and before streaming**; force is exponentially smoothed using the same Rust/JS half-step scheme. The eight-byte GPU force state is copied **once per displayed frame**, not at each half-step. GPU population buffers remain resident.
- `forceStatus` messages isolate *force setup errors* from ordinary GPU flow evolution: if the optional force controller cannot be created, disable the force checkbox with an explanation while continuing fluid animation.
- The existing force display, interactive drag/draw, probe, animation pace, quality and engine selection remain available. A/B comparison captures include **instantaneous smoothed-model-force snapshots** when force is enabled and current, labeled as relative values; they are **not fixed-window force averages**.
- A separate cache-safe page `stage3-force.html` provides a first-device-test entry point. The canonical `index.html` also adopts the versioned script and new force controls.

### Evidence and remaining limits

The latest supplied iPad 500-step, speed 0.150, 240×104 Block result had GPU full solver **1,457.7 Steps/s**, density RMS `6.03e-7`, velocity x RMS `1.10e-6`, and zero invalid cells. The final GPU relative model Drag (`0.7962894`) agreed closely with the independent compiled Rust Drag (`0.7963026`) with absolute difference `1.32e-5`. This validates **the Benchmark computation on the iPad**, not yet the live Student Lab integration or other geometry.

For Student Lab validation:
1. Open `stage3-force.html?engine=webgpu&quality=detail` on iPad or S24 Ultra, select Advanced mode, Block, Speed 0.150 and activate Force on shape after the flow settles.
2. Verify fluid animation continues, the live Drag/Lift/Resultant values are finite and are explicitly labeled as model units, and the force direction resembles the Rust/WASM reference at the same simulation stage.
3. Repeat with Force off and Force on (at least 3 trials), recording **actual Canvas FPS, Flow Steps/s and pointer responsiveness**. Disabled force must have no extra GPU force passes; the increase in work is expected to be measurable when enabled.
4. Test normal shape dragging, custom barriers, viscosity changes, Stir, pause/Step and GPU → Rust fallback. The new force controller must reset its smoothing window whenever the flow is reset.
5. Collect matching device samples for Block, Streamlined and Flat Plate at several wind speeds. **Do not interpret short-lived force samples as calibrated forces or average A/B drag coefficients.**

CI verifies JavaScript integration, force kernel placement and force-toggle gating, Rust-vs-JS relative-force parity and WGSL syntax. Real device force readbacks, accuracy and animation responsiveness still require physical-device tests. Keep Stage 3.2 marked **experimental** until these tests pass. Stage 3.3 can add timed force-window averaging, cross-engine side-by-side capture and explicit fallback/device health reporting.


## Stage 3.3 — Diagnose live FPS plateau and bound GPU Worker batches

The user's actual live Student Lab readings (iPad: 20–21 Canvas FPS / about 168 Flow Steps/s; Galaxy S24 Ultra: 20–22 Canvas FPS / about 158–173 Flow Steps/s at speed 0.150) **remain essentially unchanged when selecting Super fast**. Higher wind speed likewise does not directly demand more numerical steps per second. The confirmed source-code bottleneck is that the older Worker accepts a hard maximum of **8 steps** per update, while the main UI also restricts dispatch cadence to about 30 Hz. With 20–22 replies per second, the observed 160–176 Steps/s is consistent with an 8-step batch cap. This is evidence of a software-imposed throughput ceiling, not evidence that the underlying GPU is saturated.

### What this update changes

- A fresh test page, `stage3-performance.html?engine=webgpu&quality=detail&tune=adaptive`, includes an **open** Performance diagnostics panel. The student `index.html` keeps the panel collapsible and uses Fixed 8 steps by default until validated on actual devices.
- **Fixed 8** preserves the old GPU Worker batch size for an approximate A/B control (though the new rendering scheduler itself differs from the previous release). **Adaptive 4–24** adjusts the GPU batch cap at most once every 3 valid worker replies, using an exponentially smoothed **CPU-wall-clock worker duration**, targeting about 30 ms per Worker request. The cap resets with model resets or changing batching mode. The Worker itself still hard-rejects more than 24 steps per message.
- The separate browser requestAnimationFrame Canvas scheduler aims for **at most 30 draws/sec**, consuming the most recent GPU field and distributing tracer movement between draws when possible. Canvas can repaint a fluid field without receiving a new GPU state; the panel therefore reports **unique GPU fluid snapshots per second separately** from Canvas paints per second. Neither metric is the same as D2Q9 Steps/s.
- Live timing estimates include JavaScript **command encoding** time (CPU), combined **GPU queue execution + buffer transfer + readback wait**, Worker unpack time, main-thread paint time, and the end-to-end main-to-Worker-to-main round trip. The separate queue/readback phase is NOT a hardware GPU timestamp and cannot distinguish kernel GPU time from its synchronization and transfer.
- Diagnostics can be reset or exported as `airflow-stage3-3-live-performance.json`, retaining recent individual Worker and Canvas observations, selected grid, speed, shape, force setting, animation pace and measured rates.
- The Stage 3.2 opt-in GPU force calculation, original JS and Rust/WASM fallback, simulation geometry interactions, stirring, force snapshots and A/B classroom capture are retained. WebGPU v3 Worker inherits the existing solver and optional force controller, adding timing and a new batch cap only.

### Device test plan

On **both** iPad and Galaxy S24 Ultra:
1. Open the Stage 3.3 test page at Detailed 240×104, **Block, speed 0.150, Super fast, Force off**.
2. Select **Fixed 8**, allow 5–10 seconds to settle; note Canvas FPS, *new GPU frames/s*, Flow Steps/s, Worker round-trip, command encoding, queue+readback and paint duration. Export JSON.
3. Change to **Adaptive**, reset readings, allow 5–10 seconds to settle, repeat. Confirm that batch size grows beyond 8 only if the measured Worker duration permits, and that pointer/drag remains responsive.
4. Repeat with Force on **separately**, never mix force-on and force-off trials. Optionally disable moving particles to distinguish tracer cost from fluid and Canvas cost.
5. Save 3 samples per condition if practical. Compare **median** throughput and FPS rather than one best sample. If adaptive batch raises Flow Steps/s but not Canvas FPS, next investigate Canvas pixel conversion and particle drawing. If queue/readback dominates, consider GPU-resident rendering rather than simply increasing step cap.

### Engineering limits

This update does not claim a 30 FPS achievement or a 60 FPS GPU renderer; the new Canvas scheduler can paint more often than new fluid-field snapshots arrive. The main fluid field is still read back and redrawn via Canvas, and GPU force remains an opt-in experiment. Do not treat higher simulated Steps/s as improved interactive responsiveness without measuring frame cadence and pointer latency. CI covers stepper bounds, render scheduling logic, JavaScript syntax, WebGPU Worker structure and existing numerical reference tests. Real GPU performance must be verified on the physical devices.


## Stage 3.3 hotfix — 60 Hz fractional rAF timing aliasing (2026-10-10)

Two real-device Stage 3.3 exports support separating solver throughput from Canvas FPS:

- The iPad `Super fast` export used Detailed 240×104, Circle, speed 0.150, viscosity 0.025, force off, Adaptive batch cap 24. It recorded **696 Flow Steps/s**, **29 fresh GPU field samples/s**, but only **22 Canvas paints/s**. Across 160 recent samples, the GPU queue+readback wait averaged ~9.1 ms, command encoding ~0.18 ms, Worker round-trip ~10.4 ms, and Canvas drawing ~5.6 ms. A majority of sampled requests (147/160) processed all 24 GPU steps. Thus independent solver throughput has improved substantially, while the display remains FPS-constrained.
- The other export had the same grid/shape/physics but **Normal (animation = 7)**, with **~214 Flow Steps/s**, **~30.5 new GPU field samples/s**, **~21.7 Canvas paints/s**. It provides no device identity. These two reports cannot establish any device ranking or a same-settings A/B improvement.

### Source-code scheduling problem and fix

The previous per-frame render gate was `now - lastPaint >= 1000/30`. On a nominal **60 Hz requestAnimationFrame** clock, a 2-refresh interval can be marginally below 33.333… ms due to fractional/timestamp quantization, leading to a wait for the *third* refresh (~50 ms, ~20 FPS). Measuring ~29 field updates but only ~22 paints is consistent with that scheduling artifact. It does not prove that no other factor (browser scheduling, main-thread rendering, tracing) contributes.

A new `createGpuPaintPacer()` scheduler:
- Tracks **absolute 30 Hz paint deadlines** instead of measuring 33.333… ms anew from the last actual paint;
- Applies a bounded **1.5 ms frame-alignment tolerance** so a mathematically on-time 2-refresh callback isn't rejected by floating-point / display timing jitter;
- Skips elapsed deadlines after a delayed browser callback, avoiding accumulated phase drift;
- Only schedules work for newly dirty fluid fields or pending tracer interpolation; respects existing GPU Worker, Adaptive 4–24 Steps, Rust/JS fallback, and opt-in force.
- Adds Node regression simulations for 60, 90 and 120 Hz rAF, plus idle/reset/late callback behavior.

**Validation gate**: GitHub CI confirms the scheduling tests and existing GPU numerical checks, but there is no hardware browser GPU execution in CI. Compare the **fresh** `stage3-fps.html?engine=webgpu&quality=detail&tune=adaptive` against the previous Stage 3.3 measurement conditions: Circle, speed .150, Super fast, force off, detailed 240×104. After 5–10 seconds, export JSON and record Canvas FPS versus unique GPU snapshots/s. The expected engineering goal is to close the observed ~29 samples/s versus ~22 paints/s gap, **not a guaranteed 30 FPS**. Do not claim solver Steps/s acceleration from this scheduling change alone.
