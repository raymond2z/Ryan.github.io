# Stage 3.4B-2 — Independent flow scheduling and delivery feedback

Build: `gpu-cadence-feedback-20261010`.

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
| Auto load | 30 or 60/s | 15, 20, 30, 40 or 60/s | Respond to actual delivery, Worker/visual work and tracer backlog |

These are targets/ceilings, not measured performance guarantees. Request delivery
is limited by timer scheduling, main-thread work, demand and Worker completion.
Drawing remains limited by animation callbacks; GPU requests no longer require
one. A separate, cancellable timer waits for absolute request deadlines, and
Worker completion wakes it when the in-flight slot becomes free.
Devices can remain below the target, including below Auto's lowest setting.

The research request scheduler uses absolute deadlines. It skips missed
deadlines rather than sending a catch-up burst, and the app sends no second
step request while one is in flight in the current field revision. There is
only one flow timer; a busy Worker suspends it until completion. Demand is
accumulated from this independent clock, with at most 100 ms accepted at each
tick and the existing pending-work cap. Pause, hidden tabs, drawing/moving an
object and engine fallback cancel the timer. Resuming starts a fresh clock.
The existing serialized Worker protocol, obsolete-revision filtering, finite-field validation
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

The current release provides updated experiments and automated regression
evidence. The previous build has representative device recordings (below);
this update has **not** been benchmarked on those physical devices.
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
It also observes one-second delivery windows: paints, fresh fields, animation
callbacks, requested steps/s and capped tracer backlog. Interrupted, hidden,
interacting, sparse, stale and mixed-cadence windows cannot justify increased
load. Its P95 is nearest-rank. Worker round-trip time covers messaging, processing
and delivery; full visual work includes tracer advection plus paint. Timings
remain browser wall clocks, not GPU hardware timestamps or presentation/input
latency measurements.

- Three consecutive windows of work headroom **and actual delivery** are needed
  to raise request cadence. Worker overload reduces it promptly, bounded to
  15–60/s. Three windows below 75% of the requested fresh-field rate lower the
  request target one level. Demand below the target is excluded from this test.
- High visual work lowers painting to 30/s and reduces request/advection demand.
  Three eligible windows below 75% of the paint target also lower painting, even
  if individual paints appear inexpensive. Particle-off and low-demand windows
  do not manufacture a paint shortfall.
- After a reduction, painting holds for at least 15 seconds. Recovery to 60/s
  requires three successful windows below 6 ms visual work and at least 55
  animation callbacks/s. A sustained 24 Hz browser callback stream cannot
  repeatedly trigger a 60 Hz recovery. At the 30/s floor, delivery headroom is
  assessed against the observed callback ceiling when it is lower than 30/s.
- Adaptive batches change by two steps, bounded to 4–24. Their budget follows
  the current request interval; partial demand-limited packets do not justify
  batch increases. Two windows of capped tracer backlog also reduce adaptive
  batches; Fixed mode remains at 8. Actual delivery must show headroom before
  increasing a batch. Invalid, sparse and stale measurements cannot raise load.
- Long pauses discard old samples. Visibility and field reset reinitialize
  experimental scheduling; hidden tabs do not create catch-up queues.
- Auto never changes wind, viscosity, grid, shape or force settings. Fixed
  profiles use the existing Fixed/Adaptive batch controller.

Live JSON identifies the profile/build/demand, active engine, current policy,
recent adjustment timeline, latest delivery window (including callback and
request counts), actual fresh-field rate, full visual work, reused
raster paints and capped tracer debt. Its existing 160-sample limit makes it
a short diagnostic rather than a long stability record.

Timed stability JSON retains complete samples, separate visual-work P95,
duration-weighted actual delivery rates, per-window policy and
`experiment_policy_snapshot` at recording start, `load_adjustment`,
`experiment_policy_reset` and
`tracer_backlog_capped` events. Normal Auto adjustments are distinct from a user
changing settings. Profile, demand and preset controls are disabled during a
recording; other existing setting changes still appear in its event history.
Timer completion is not a stability PASS. Data is never automatically uploaded.

Classroom comparisons on the research page still capture exactly 2,000 steps.
Profile/demand are locked during the guide, included in capture metadata and
restored for repeats. A manual comparison flags different research settings.

## Previous device evidence — not a benchmark of this update

The user supplied these two-minute reports from `gpu-cadence-20261010`. Rates
are weighted by valid foreground window duration. Device identity is supplied
by the user. The reports are not committed; only the aggregate findings are
recorded here.

| Device | Profile / demand | Paints/s | Fresh fields/s | Solver steps/s | Recording |
| --- | --- | ---: | ---: | ---: | --- |
| S24 Ultra | Auto / 2× | 24.65 | 24.30 | 557.09 | Completed, uninterrupted, no dropped samples |
| iPad | Auto / 2× | 59.13 | 59.09 | 1,063.70 | Completed, uninterrupted, no dropped samples |
| Desktop | Flow probe / 2× | 59.35 | 49.86 | 1,196.21 | Foreground windows only; a hidden interval and two foreground stalls |

S24 started near 60 paints/s, then settled near 24. Its target remained 60
paints/s and mostly 40 flow requests/s. Eleven load changes did not resolve
the gap. The old governor used work times without observing delivered cadence,
and flow dispatch depended on rAF. These are confirmed implementation gaps,
not a diagnosis of the device/browser cause of the slowdown. iPad held a
60/60 policy with 18-step batches; early-to-late throughput changed by about
−0.10%. The different desktop profile prevents a controlled hardware ranking.

Keep classroom defaults. Do not rerun all three devices for routine changes.
If validating this scheduling revision, one targeted S24 Auto / 2× run at the
same grid/settings addresses the known delivery gap; further device testing
needs a specific reason.

## Validation

The related suite has 67 passing tests, covering real application frame/input/export
handlers with asynchronous Worker doubles and simulated cancellable timers,
flow requests without animation callbacks, stop/resume/backpressure and late
deadlines, numerical final-step clamping,
30/40/60 Hz deadlines on 60/90/120 Hz callbacks, independent paint/field counts,
cached raster work, backpressure, bounded overload/recovery, invalid/sparse/stale
samples, sustained delivery shortfalls, recovery cooldown, demand-aware
exclusions, backlog feedback, classroom isolation, repeat restoration,
fallback and duration-weighted recorder data.
These checks are not physical GPU benchmarks. Existing GitHub workflows also
run the full solver/benchmark/WASM checks.

```sh
node --check airflow-lab/app.mjs
node --check airflow-lab/gpu-experiment.mjs
node --test airflow-lab/gpu-experiment.test.mjs airflow-lab/shape-comparison.test.mjs airflow-lab/live-performance.test.mjs airflow-lab/stability-recorder.test.mjs airflow-lab/learning-record.test.mjs airflow-lab/student-gpu-integration.test.mjs
```
