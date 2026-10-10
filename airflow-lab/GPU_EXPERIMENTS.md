# Stage 3.4B-3 — Measure throughput before keeping Auto changes

Build: `gpu-throughput-20261010`.

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
| Auto load | 30 or 60/s | 15, 20, 30, 40 or 60/s | Measure solver throughput; validate and restore trials |

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
steps. Auto free exploration can consume up to 64 debt steps per paint while
reducing visible marker density to keep the midpoint integration work bounded.
Each midpoint substep remains at most two model steps. The first reduced marker
count is held for three seconds; recovery is gradual. Reactivated markers are
reseeded so stale positions are not presented as current paths.

The panel and JSON expose active versus nominal marker counts. This changes
visual density, not the numerical grid, public step count or inlet speed. The
fixed research profiles and guided matched comparisons retain their original
marker density and presentation behavior. Particle trails remain visual markers
rather than measurement evidence.

## Load governor and evidence

Auto starts at 60 paints/s, 30 flow requests/s and an 8-step batch. It observes
one-second delivery windows and at least six valid Worker/visual samples.
Worker round-trip P95 includes fixed readback, messaging and delivery overhead;
it is not used as a per-batch compute budget proportional to request frequency.
All timings remain browser wall clocks, not GPU hardware timestamps.

- Establish three clean windows at the same paint/cadence/batch policy. Change
  **one numerical control** for a trial: batch size or request cadence.
- Measure three clean trial windows, using duration-weighted **solver steps/s**.
  A 5% gain is needed to keep a larger/smaller batch or higher request rate.
  A lower request rate can be kept if throughput stays within 2% of its baseline.
- Two consecutive windows below 80% of baseline end the trial early. A trial
  without enough clean windows times out after 15 seconds. Failed trials restore
  the accepted cadence and batch, hold for 10 seconds, and block that candidate
  for 60 seconds. Accepted trials hold for at least three seconds before another.
- Start with larger batches when full-packet evidence exists, then probe request
  rates. Smaller batches are also tested, rather than repeatedly forced smaller
  to meet an arbitrary fraction of a 60 Hz interval. There is no linear cost
  assumption and no promise of a global optimum.
- Demand already fulfilled (at least 95% of requested steps/s) stops exploratory
  tuning. Partial demand-limited packets cannot justify a larger batch.
- Interrupted, hidden, interacting, sparse, stale and mixed-policy windows
  cannot validate an improvement. Batch changes now invalidate the containing
  delivery window as well as cadence changes. User activity cancels a pending
  trial and recalibrates its baseline. A drawing-policy change also cancels it.
- Three eligible windows below 75% of the paint target lower drawing to 30/s;
  high visual work can lower it promptly. Recovery waits at least 15 seconds and
  requires three successful windows below 6 ms and at least 55 browser callbacks/s.
- A request ceiling persistently far above delivery (three windows below 65%)
  can be lowered while keeping the accepted batch. In a trial this first restores
  the checkpoint. P95 exceeding 72% of a request interval no longer cuts batches.
- Particle backlog is handled by the separate visual budget. It never directly
  reduces numerical batches. All numerical controls remain bounded to 15–60
  requests/s and 4–24 steps; Fixed workload stays at 8 steps.

Auto does not change wind, viscosity, shape, grid, solver kernels or Force.
Its checkpoint is a configuration with measured evidence, not a guarantee
against later thermal/browser changes. Subsequent trials use recent conditions.

Live JSON identifies the profile/build/demand, active engine, current policy,
recent adjustment timeline, latest delivery window (including callback and
request counts), accepted/trial policy, baseline and trial solver throughput,
trial decisions, marker density, actual fresh-field rate, full visual work, reused
raster paints and capped tracer debt. Its existing 160-sample limit makes it
a short diagnostic rather than a long stability record.

Timed stability JSON retains complete samples, separate visual-work P95,
duration-weighted actual delivery rates, per-window policy and
`experiment_policy_snapshot` at recording start, `load_adjustment`,
`experiment_policy_reset`, `tracer_backlog_capped` and `visual_adjustment` events. Throughput trial decisions
are recorded with their measured baseline, candidate score and retained/restored
outcome. Per-window optimization metadata identifies what was being measured.
Normal Auto adjustments are distinct from a user changing settings.
Profile, demand and preset controls are disabled during a
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


The subsequent `gpu-cadence-feedback-20261010` S24 Auto / 2× report completed
cleanly but measured **26.62 paints/s, 43.17 fresh fields/s and 438.37 steps/s**.
The timer decoupling worked: its last ~12 seconds delivered about 60 fresh
fields/s over ~24 paints/s. However, the old interval-based controller reduced
batches to four steps, leaving roughly 240 solver steps/s. Its last-third
throughput fell 37.44% from the first third, with 37 load adjustments and 1,704
visual debt steps capped. This was a numerical-throughput regression despite
more frequent field delivery. This release addresses that policy failure with
measured trials and separates tracer work from solver adaptation; **new physical
S24/iPad/desktop gains remain unmeasured**.

Keep classroom defaults. Do not rerun all three devices for routine changes.
If validating this scheduling revision, one targeted S24 Auto / 2× run at the
same grid/settings addresses the known delivery gap; further device testing
needs a specific reason.

## Validation

The 76-test related suite covers real application frame/input/export
handlers with asynchronous Worker doubles and simulated cancellable timers,
flow requests without animation callbacks, stop/resume/backpressure and late
deadlines, numerical final-step clamping,
30/40/60 Hz deadlines on 60/90/120 Hz callbacks, independent paint/field counts,
cached raster work, backpressure, bounded overload/recovery, invalid/sparse/stale
samples, retained/restored throughput trials, fixed-overhead regressions,
slower high-frequency candidates, timeouts, activity invalidation, demand
exclusions, marker-work bounds and recovery, classroom isolation, repeat restoration,
fallback and duration-weighted recorder data.
These checks are not physical GPU benchmarks. Existing GitHub workflows also
run the full solver/benchmark/WASM checks.

```sh
node --check airflow-lab/app.mjs
node --check airflow-lab/gpu-experiment.mjs
node --test airflow-lab/gpu-experiment.test.mjs airflow-lab/shape-comparison.test.mjs airflow-lab/live-performance.test.mjs airflow-lab/stability-recorder.test.mjs airflow-lab/learning-record.test.mjs airflow-lab/student-gpu-integration.test.mjs
```
