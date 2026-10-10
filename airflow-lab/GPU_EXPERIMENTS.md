# Stage 3.4B — Display cadence, fresh fields and automatic load

Open [GPU scheduling experiments](https://raymond2z.github.io/Ryan.github.io/airflow-lab/performance.html?engine=webgpu).
This dedicated page starts in Advanced mode with the research controls visible.
Student Lab and the original stability page retain their classroom scheduling
and defaults. Profile and pace query parameters are ignored on those pages.

## Profiles

| Profile | Paint ceiling | GPU request ceiling | Purpose |
| --- | --- | --- | --- |
| Baseline | 30/s | 30/s | Controlled reference on this research page |
| Display | 60/s | 30/s | Smoother tracer presentation over the latest field |
| Flow probe | 60/s | 60/s | Attempt more fresh fields without a request backlog |
| Auto load | 30 or 60/s | 15, 20, 30, 40 or 60/s | Respond to measured Worker and visual work |

These are targets/ceilings, not measured performance guarantees. Request delivery
is limited by browser animation callbacks, demand and Worker completion. A 60 Hz
screen can deliver 60 requests/s only if the Worker finishes between callbacks.
Devices can remain below the target, including below Auto's lowest setting.

The research request scheduler uses absolute deadlines. It skips missed
deadlines rather than sending a catch-up burst, and the app sends no second
step request while one is in flight in the current field revision. The existing
serialized Worker protocol, obsolete-revision filtering, finite-field validation
and GPU → Rust/WASM → JavaScript fallback remain intact.

## Compare once, then investigate what matters

1. Keep one device, grid and tab. **Use comparison preset** selects Circle,
   wind 0.150, viscosity 0.025, Super fast, Adaptive, particles on and Force off.
   It does not change grid, research profile or simulation demand.
2. Use Baseline at **1× demand** as the reference. Let readings settle, then
   export diagnostics if useful. Change only to Display to isolate painting.
3. Try Flow probe at 1×, then optionally **2× throughput probe**. One-times
   Super fast supplies about **720 public steps/s**; two-times supplies about
   **1,440**. More frequent fresh fields can contain fewer steps per field.
   Raising the cadence alone cannot remove a demand ceiling. These are request
   rates, not claims that a device computes those numbers.
4. Try Auto load with Adaptive selected. Review the visible adjustment reason
   and actual paints/s, fresh fields/s and steps/s. Fixed mode keeps 8-step
   batches even while Auto adjusts cadence; it does not silently override the
   workload selector.
5. For stability evidence, use the existing timed recorder. A two-minute
   consolidated exploratory run is available; five/ten minutes remain options
   for a promising candidate or a substantial problem. No repeated desktop,
   phone and tablet benchmark is required for routine text or teaching changes.

The current release provides the experiments and automated regression evidence.
It does **not** establish a new S24 Ultra, iPad or desktop throughput result.
Promoting a research configuration to the classroom defaults remains a separate
decision based on representative device evidence and interaction quality.

## What 60 paint means

Paint scheduling is independent of GPU field delivery. Intermediate paints can
advance visual tracer debt using the latest velocity field and reuse its colour
raster. They do not interpolate or compute new numerical fluid fields. If
particles are off and no field changes, unnecessary extra paints are skipped.
Display refresh and slow animation demand can also lower the observed count.

The Worker still computes two lattice half-steps per public simulation step;
its **24-step maximum**, shader math, resolution and numerical parameters are
unchanged. Two-times demand accelerates model time, not inlet wind speed.
The app keeps pending work bounded. Tracer debt remains capped at 96 steps;
visual debt dropped under load is counted and logged, without removing solver
steps. Particle trails remain visual markers rather than measurement evidence.

## Load governor and evidence

Auto starts at 60 paints/s, 30 flow requests/s and an 8-step batch. It evaluates
one-second windows with at least six valid Worker and six visual samples.
Its P95 is nearest-rank. Worker round-trip time covers messaging, processing
and delivery; full visual work includes tracer advection plus paint. Timings
remain browser wall clocks, not GPU hardware timestamps or presentation/input
latency measurements.

- Three consecutive windows of headroom are needed to raise request cadence.
  Overload reduces it promptly, bounded to 15–60/s.
- High visual work lowers painting to 30/s and reduces request/advection demand.
  Three windows below 6 ms visual work permit a return to 60/s.
- Adaptive batches change by two steps, bounded to 4–24. Their budget follows
  the current request interval; partial demand-limited packets do not justify
  batch increases. Invalid, sparse and stale measurements cannot raise load.
- Long pauses discard old samples. Visibility and field reset reinitialize
  experimental scheduling; hidden tabs do not create catch-up queues.
- Auto never changes wind, viscosity, grid, shape or force settings. Fixed
  profiles use the existing Fixed/Adaptive batch controller.

Live JSON identifies the profile/build/demand, active engine, current policy,
recent adjustment timeline, actual fresh-field rate, full visual work, reused
raster paints and capped tracer debt. Its existing 160-sample limit makes it
a short diagnostic rather than a long stability record.

Timed stability JSON retains complete samples, separate visual-work P95,
per-window policy and `load_adjustment`, `experiment_policy_reset` and
`tracer_backlog_capped` events. Normal Auto adjustments are distinct from a user
changing settings. Profile, demand and preset controls are disabled during a
recording; other existing setting changes still appear in its event history.
Timer completion is not a stability PASS. Data is never automatically uploaded.

Classroom comparisons on the research page still capture exactly 2,000 steps.
Profile/demand are locked during the guide, included in capture metadata and
restored for repeats. A manual comparison flags different research settings.

## Validation

The related suite has 57 tests, covering real application frame/input/export
handlers with asynchronous Worker doubles, numerical final-step clamping,
30/40/60 Hz deadlines on 60/90/120 Hz callbacks, independent paint/field counts,
cached raster work, backpressure, bounded overload/recovery, invalid/sparse/stale
samples, classroom isolation, repeat restoration, fallback and recorder data.
These checks are not physical GPU benchmarks. Existing GitHub workflows also
run the full solver/benchmark/WASM checks.

```sh
node --check airflow-lab/app.mjs
node --check airflow-lab/gpu-experiment.mjs
node --test airflow-lab/gpu-experiment.test.mjs airflow-lab/shape-comparison.test.mjs airflow-lab/live-performance.test.mjs airflow-lab/stability-recorder.test.mjs airflow-lab/learning-record.test.mjs airflow-lab/student-gpu-integration.test.mjs
```
