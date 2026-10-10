# Stage 4A — Compare shapes with matched conditions

The classroom priority is a short **predict → observe → explain** task.
The existing student page, manual snapshots and PNG report remain the entry point.

## Student workflow

1. Open the Shape test and choose a prediction, including “I'm not sure yet”.
2. Choose **Observe A · Block**. The current wind speed and viscosity are kept.
   Both shapes face forward at 0°, use the same preset scale, and share a
   position that fits both inside the grid. The colour view is Speed, particles
   are on, arrows and force are off. The flow starts fresh at the selected wind.
3. The app pauses and saves A at exactly **2,000 public simulation steps**.
   Describe the wake in A's observation box.
4. Choose **Observe B · Streamlined**. The app resets the flow with the same
   settings, then pauses and saves B at exactly 2,000 steps.
5. Compare the wake colours behind the shapes. Explain whether the evidence
   supports the prediction, then download the existing A/B PNG report.

The run duration in real seconds varies by device. Matching elapsed model steps
is more useful here than an arbitrary timer. This is one observation point,
not a claim that a fluctuating wake has reached steady state. For later wakes,
exit the guide and use the normal controls to explore.

## Conditions and limits

- The guided pair is deliberately Block / Streamlined. Their front-facing
  heights match within one raster grid cell on both existing grids. Their
  length, area and contour differ. This does not isolate contour while holding
  every geometric quantity constant, and does not measure real aerodynamic drag.
- A common safe anchor is computed before A starts. A previously dragged
  position is kept if both shapes fit; otherwise both use the same clamped
  position. Geometry and the solver are unchanged.
- Each trial starts with fresh flow, the selected inlet speed and the same
  seeded initial tracer markers. Tracer trails are visual aids, not an exact
  equality check; delivery and rendering batches may still affect the trails.
  Students compare wake colours and describe visible evidence.
- Settings, shape edits, dragging, manual steps and manual capture are locked
  during the guide. Pause is available while a trial runs. **Exit comparison**
  restores free exploration and keeps any saved A for review. Remove existing
  snapshots before starting a new guided run; the app never silently erases them.
- Background tabs naturally pause progress. An engine error or fallback ends
  the comparison; it cannot silently complete B on a different engine. Restart
  a fresh pair after removing any partial snapshots.
- Manual captures now record grid, engine, position, frontal height, display
  settings and elapsed steps. The comparison check flags differences beyond
  the chosen variable in Shape, Speed or Angle experiments. It checks recorded
  conditions, not physical validity or statistical significance.
- The guided prediction is saved with the captures, so the downloaded report
  keeps the original prediction even if the prediction control changes later.
- Snapshots, notes and predictions remain in page memory until downloaded;
  reloading clears them. No account, telemetry or uploads are added.

## Implementation and validation

The app caps only the final guided step batch to the remaining steps, then
captures the returned field before permitting another trial. Worker revisions
continue to reject stale pre-reset frames. The independent matched-comparison
module tests batch sizes, common positions and condition checks. A small DOM /
asynchronous Worker protocol double runs the real app handlers for automatic
capture, control locks, cancellation and fallback. The JavaScript final chunk
uses the real solver. These are application tests, not hardware GPU benchmarks.

```sh
node --check airflow-lab/app.mjs
node --check airflow-lab/shape-comparison.mjs
node --test airflow-lab/shape-comparison.test.mjs airflow-lab/stability-recorder.test.mjs airflow-lab/live-performance.test.mjs airflow-lab/student-gpu-integration.test.mjs
```

The 32 relevant tests passed for this release. GitHub also runs the existing
full benchmark and WASM checks. No solver, shader, Worker kernel, grid default,
30 FPS schedule or Fixed 8 default is changed. Repeated phone / tablet /
desktop benchmarking is reserved for substantial runtime or classroom-default
changes, following `STABILITY.md`.

## Next classroom work

4A provides one usable controlled comparison. Further shape pairs, reset/repeat
observations, and short student evidence prompts can follow observed classroom
needs. 60 FPS and higher GPU update-rate experiments remain separate research
work and are not required for this task.
