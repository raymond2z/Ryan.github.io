# Airflow Lab — performance research

## Live entry points

- [Student Lab](https://raymond2z.github.io/Ryan.github.io/airflow-lab/)
- [Benchmark Lab](https://raymond2z.github.io/Ryan.github.io/airflow-lab/benchmark.html)

The student website retains its existing JavaScript solver; the benchmark evaluates alternative engines independently.

## Implemented engines

| Engine | Physics | Execution | Status |
| --- | --- | --- | --- |
| JavaScript | Original D2Q9 BGK regularized solver | Main thread | Available |
| JavaScript Worker | Same D2Q9 JavaScript solver | Web Worker | Available |
| Rust / WebAssembly | Independent, f64 Rust port of the same equations | Web Worker | Available after the tested .wasm binary is deployed |
| WebGPU | Not implemented | — | Planned |

The compiled `rust/airflow_solver.wasm` is a **real binary**, built from `rust/src/lib.rs` by GitHub Actions. It is not a placeholder or simulated benchmark. Rust's interface uses an exported C ABI, and all shape masks are copied from the original JavaScript shape generator. No external Rust crates or CDN script dependencies are needed in the browser.

## Rebuilding Rust/WASM

On a machine with Rust and Cargo:

```bash
rustup target add wasm32-unknown-unknown
cargo test --manifest-path airflow-lab/rust/Cargo.toml --release
cargo build --manifest-path airflow-lab/rust/Cargo.toml --release --target wasm32-unknown-unknown
cp airflow-lab/rust/target/wasm32-unknown-unknown/release/airflow_solver.wasm airflow-lab/rust/airflow_solver.wasm
node --test airflow-lab/wasm-integration.test.mjs
node --test airflow-lab/benchmark.test.mjs
```

When Rust source or the build workflow changes, `.github/workflows/airflow-rust-wasm.yml` recompiles the solver, runs Rust and JavaScript numerical regression tests, then commits the verified WASM binary back to the same branch (when the branch is writable). The deployed GitHub Pages site uses the checked-in `.wasm` artifact.

## Comparing engines fairly

1. Use the same browser and device (avoid switching tabs), with a stable power/thermal state.
2. Keep **grid, shape, speed, viscosity, warmup, and measured steps** identical.
3. Begin with 50 steps; for reliable comparisons use 500 steps and three repeats per engine.
4. Compare **compute Steps/s** separately from **UI FPS** and **wall time**.
5. Interpret results as a **qualitative 2D teaching model**: the simulator is not a calibrated wind tunnel.

The warmup consists of eight full simulation steps and is excluded from compute time. JS/Worker and Rust/WASM results each use an equivalent fresh shape mask, viscosity 0.025, 64 × 28 speed-field preview, and identical physical parameters. WASM download/compilation is excluded from timed solver steps. JS-vs-JS numerical summaries use a tighter tolerance (1e-9), while Rust-vs-JS mean-field summaries allow numerical differences of up to 1e-7. The CI tests also compare obstacle pixels and final speed-preview samples.

A Web Worker may improve UI responsiveness but does not guarantee faster physical calculations. WASM may or may not outperform optimized JavaScript on a particular device; benchmark first.

## Privacy

Benchmark measurements remain in the current browser session until manually downloaded with **Export CSV**. This project does not upload device results to a server or automatically send them to GitHub. 

## Student Lab integration (Rust/WASM Worker)

The public Student Lab now supports a separate engine selector:

- **Auto:** starts with the existing JavaScript display and attempts to initialize the Rust/WASM Worker. Once ready, it restarts the flow and runs computation off the UI thread.
- **Rust / WASM:** explicitly requests the compiled Rust engine with automatic JavaScript fallback if the device cannot initialize it.
- **JavaScript:** keeps the original in-page solver and all classroom tools.

Changing the engine or the grid reloads the page and clears current experiments. This is intentional: comparisons should begin from known initial conditions.

When the WASM engine is active, the worker retains its solver and its f64 arrays. It sends three Float32 arrays (density and x/y velocity) to the UI for visualization, reusing transferred buffers to reduce mobile memory churn. Shape masks are synchronized after drag/draw/erase/reset; viscosity and speed change in place; Stir applies momentum in the Rust solver. The original JavaScript solver remains an independent fallback.

### Phone and iPad validation

1. Open Student Lab on the same phone or iPad; select **Detailed** grid, **Block**, flow speed **0.150**, and **Normal** animation pace.
2. Observe **Canvas fps** and **Flow steps/s** for a few minutes using Auto (Rust/WASM), then switch to JavaScript and repeat after a full reload.
3. Test drag, pause/step, speed adjustment, change shape, and snapshots in both modes. Try **Stir** in Advanced mode.
4. Do not interpret the Student Lab live FPS as a benchmark solver speed; the Worker integration also includes field-transfer and canvas-paint costs.
5. For standardized solver comparisons, continue using Benchmark Lab with three repetitions and export its CSV.

The current release includes automated Rust-worker tests for reset, settings changes, transfer buffers, numerical agreement, stale-message rejection and the Stir tool. It does **not** claim measured iPad/Samsung Student Lab FPS improvement before testing the completed interface.

## Student Lab — Experimental real-time WebGPU (2026-10)

The Student Lab now offers four engine selections in the same page:

- **Auto:** WebGPU module Worker when supported, then **Rust/WASM**, then **JavaScript**.
- **WebGPU (experimental):** explicitly request the real GPU D2Q9 evolving flow; if GPU setup or numerical checks fail, automatically fall back to Rust/WASM, then JavaScript.
- **Rust/WASM:** tested D2Q9 f64 worker. Recommended for model-force visualizations.
- **JavaScript:** original main-thread educational solver.

The GPU worker is a *persistent* solver, not the Stage 1 single equilibrium probe. It executes the validated Stage 2 `d2q9-solver-r2-20261010.wgsl` collision/streaming pipeline on GPU-resident f32 populations; all the existing Student Lab visuals and particle trails remain on Canvas. A final macroscopic field is read back every small frame batch (capped at eight public simulation steps) and dispatched with transferable and recyclable f32 arrays. The worker serializes async reset / push / step messages to avoid races. The new GPU stirring shader `student-gpu-stir-v1.wgsl` supports the classroom Stir interaction.

### Feature compatibility

| Feature | WebGPU | Rust/WASM | JavaScript |
|---|---|---|---|
| All shape presets, custom barrier and dragging | Yes (reset mask) | Yes | Yes |
| Speed/viscosity changes | Yes (GPU uniform updates) | Yes | Yes |
| Pause/play, ten-step, particles, speed/density/curl views | Yes | Yes | Yes |
| Probe and captured A/B images / report | Yes | Yes | Yes |
| Stir | Yes (local GPU equilibrium modification) | Yes | Yes |
| Model force arrows | **Not yet** (disabled when GPU active) | Yes | Yes |

**Model-force measurement is deliberately disabled in WebGPU mode:** GPU currently performs fluid evolution but does not compute the momentum-exchange force used in the Rust/JS solver. Do not present the absent GPU force as a measured zero value.

The GPU handles change-of-speed smoothing per dispatch batch rather than per half-step, so transient changes may not be bit-identical to the JS/Rust implementation. Also, GPU shader f32 and Rust solver f64 should not be assumed to produce identical results for extended swirls. The GPU worker checks density bounds and finiteness before publishing frames and switches back to Rust if unstable. For strict side-by-side scientific comparisons keep the **same engine, grid, settings and simulation step count** for both captures.

Prior GPU speedups measured in Benchmark Lab only establish **full-solver throughput**, not a guaranteed multiplier for the Student Lab Canvas FPS, which includes macroscopic readback, particle movement and drawing.

### Release checks

GitHub CI validates JavaScript syntax, Student Lab engine and DOM routing, numerical assumptions and compiles the Student Stir WGSL with Naga. This does not replace on-device browser execution, but the user has already obtained 500-step WebGPU benchmark results and opted to proceed with Student Lab integration without additional benchmark sessions. The Student Lab will fall back to proven Rust/JS on unsupported browsers or GPU errors.
