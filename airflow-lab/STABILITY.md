# Stage 3.4A — Timed stability recording

Stage 3.4B now has a separate [GPU scheduling experiment page](https://raymond2z.github.io/Ryan.github.io/airflow-lab/performance.html?engine=webgpu).
See [GPU_EXPERIMENTS.md](GPU_EXPERIMENTS.md) for 30/60 paint/flow profiles,
two-times demand and bounded automatic load control. They are opt-in research;
the Student Lab and this stability page keep their prior runtime defaults.
Recorder exports additionally retain visual-work timing and experimental policy
events when used on that page. This does not establish new physical device results.

The latest Stage 3.3 solver, 30 FPS paint pacing and fixed/adaptive batch defaults are retained. This update adds opt-in recording and removes engine/FPS/diagnostic controls from Beginner mode; it does not raise the GPU step limit or render rate.

## Use

Open [Stability recording](https://raymond2z.github.io/Ryan.github.io/airflow-lab/stability.html?engine=webgpu&quality=detail&tune=adaptive). The dedicated page starts in Advanced mode with the diagnostic panel open. The ordinary Student Lab starts in Beginner mode. Advanced mode also exposes recording in Student Lab.

Select conditions, let the flow settle, then start recording. Five minutes is the default; two minutes is for quick investigation and ten minutes is for major changes or an observed problem. These are alternatives, not three mandatory consecutive tests. Recording only starts after WebGPU is active and running in a visible tab. It never changes shape, speed, engine or workload. Engine and detail selectors are temporarily disabled during recording because those controls reload the document.

The timer ends automatically. Stop allows a partial report. Download the JSON after completion or while running. Starting another run replaces the preceding recording; reloading clears it. Data stays in browser memory until explicitly downloaded and is never automatically uploaded. An optional device label is entered by the user; it is not detected hardware metadata.

## Evidence and limits

The report contains the complete recording's Worker and paint samples, rate windows, initial configuration and event timeline rather than only the last 160 observations. A safety cap of 60,000 samples per series and 2,000 events protects memory; any overflow is reported, with `samplesComplete: false`. The existing short live diagnostic export remains available separately.

- P95 uses exact nearest rank and is separated for **paint intervals**, **paint work**, **Worker round trips**, **Worker work** and combined queue/readback time. Paint timing excludes particle advection and is not browser presentation or input latency. Intervals use actual paint completion observations and include interruption gaps.
- Worker timings remain browser wall clocks, not hardware GPU timestamps. NaN timing, long paint/sample gaps, visibility, pause/interaction, setting changes, flow resets, optional-force errors, engine errors and fallback are recorded.
- Full one-second rate windows support weighted first-third/last-third throughput comparison. The first partial window is excluded. Hidden/paused/interactive windows and windows longer than 2.5 seconds are excluded from this throughput summary and retained in raw records; use the event timeline to assess contamination. Overlapping settings changes still make a run need review.
- Browser background throttling may delay completion. The report retains requested and actual elapsed durations. **Timer completed is not a stability PASS**; an empty, interrupted, truncated or anomalous recording needs review. Device-lost and nonfinite fluid errors are recorded from the existing solver's error messages; there is no new independent numerical validation.
- Download before leaving the page. A page-exit event is stored in memory if possible, but the recorder does not promise to recover it after unloading or a crash.

## Current baseline (2026-10-10)

Source reviewed: `e644e248b6ff24b4b73dd50b7fbfa9dd4fadd596` (PR #14). CI and Pages deployment passed. Existing exported device runs reached about 30 FPS and 709–719 simulation steps/s on S24 Ultra/iPad, at Detailed 240×104, Circle, 0.150, viscosity 0.025, Adaptive 24, Super fast and Force off.

The supplied desktop report `airflow-stage3-3-live-performance(1).json`, collected 2026-10-10 05:16:39 UTC, has 29.46 Canvas FPS, 29.46 new GPU snapshots/s and 707.06 steps/s under the same selected conditions. Among its 160 samples, Worker round-trip P95 is 22.4 ms and paint-work P95 is 0.9 ms (nearest rank). Its timestamp span is 19.343 seconds with a 14.080-second gap, so it cannot establish several minutes of uninterrupted stability. This evidence does not prove a GPU hardware throughput ceiling.

## Revised priorities and verification policy

1. Add this recording tool without changing the validated solver or default workload.
2. Prioritize classroom interaction and fair comparison evidence. Keep engine, grid and conditions fixed within an experiment and compare similar simulation step counts. Do not automatically change grid resolution mid-comparison.
3. Treat 60 FPS Canvas and higher fresh-flow update targets as optional research in the separate experiment page. Repainting and tracer animation are not new numerical fluid fields. Compare measured rates and stability before promoting either experiment; the ordinary Student Lab retains its earlier fixed/adaptive controller.
4. Promoting Adaptive to the ordinary Student Lab default remains a separate decision after reviewing a representative complete stability report.

Documentation and teaching-text edits need no repeated physical-device benchmarks. Routine code changes use relevant automated checks; do not request fresh desktop, iPad and S24 Ultra results after every incremental update. Consolidated device acceptance is warranted for substantial solver/shader, Worker transport, renderer, resolution, default-workload or fallback changes, or an actual device-specific regression. Stage 3.4A uses synthetic-clock recorder and existing scheduling/integration regressions; it does not claim a new five-minute physical GPU stability result.
