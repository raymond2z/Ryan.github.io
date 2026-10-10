# Stage 4C — Observe, explain and keep a learning record

The student workflow is **predict → observe A/B → explain → repeat**.
Stage 4A's matched-step captures and Stage 4B's selectable pairs, height
control and one retained previous comparison remain the foundation. Stage 4C
adds short observation prompts, evidence completion checks and a full learning
record download without adding grading or changing the simulation runtime.

## Student workflow

1. In Compare shapes, choose Shape A and Shape B from Circle, Block,
   Streamlined, Flat plate, Car, Bird or Pikachu. Choose two different presets.
2. Leave **Make both shapes equally tall** on to control front-facing height.
   It uniformly scales each silhouette in the guide; it does not match length
   or area. Turning it off keeps the original preset sizes, and the result
   check will flag differing frontal heights.
3. Choose a prediction. The options follow the selected pair; “I'm not sure
   yet” is available. Choose **Observe A** to start fresh flow at the current
   wind and viscosity. Both shapes face forward and use the Speed colour view.
4. The app pauses and saves A at exactly **2,000 public simulation steps**.
   Write an observation, then choose **Observe B**. B starts with the same
   conditions and is also captured at exactly 2,000 steps.
5. Use the observation prompts: look behind the shape and compare the same
   place in A and B. Short phrases about wake colours or paths are enough.
   Explain using what you saw; uncertainty and further testing are valid.
   The A/B PNG download remains available as a picture summary.
6. Choose **Repeat · keep this test** to check again. The app restores the
   original wind, viscosity, pair, size method, position, animation pace and
   workload, even if controls changed after the first run. The latest completed
   pair, notes, prediction and explanation remain under **Previous test**.
7. After the repeat, choose whether the wake looked similar, different or
   uncertain. The current PNG report includes this response. The previous pair
   has its own downloads and uses its original notes and explanation.
8. Read the comparison settings and tick the review box. The checklist marks
   written evidence as recorded; it cannot judge whether an explanation uses
   good evidence or is scientifically correct. It never scores an answer.
9. Choose **Save learning record** for a self-contained HTML file with both
   images, full observations, prediction, explanation, settings and checklist.
   A repeated test includes the previous round's evidence in the same file.
   Open it in a browser and use Print to print or save as PDF. Unfinished
   writing can be downloaded as soon as two views exist; missing responses
   are labelled. No student identity needs to be entered into the app.

Only the current pair and one previous pair are kept in page memory. Repeating
again replaces the older previous pair with the latest completed pair; download
older reports first. Reloading clears the work. No account or uploads are added.

## Conditions and limits

- The two grids retain their existing dimensions, 240 × 104 and 168 × 72.
  Matched height targets the current grid's default Block frontal height:
  31 or 21 raster cells. All supported pairs are verified to match within one
  grid cell. Uniform scaling uses the existing silhouette equations, with
  normal raster discretization; it is not an equal-area or equal-length test.
- The app aligns bounding-box centres to the shared position within half a
  raster cell. A prior dragged position is kept if both shapes fit. Otherwise
  both use one common clamped position with the existing 8-cell safety margin.
- Scaling applies to guided geometry only. Selecting a free-exploration shape
  restores its original preset size. A completed guided shape stays visible
  at its comparison size until changed; captures retain the actual size method
  and scale. Drawing changes the obstacle to a custom mask as before.
- Each trial starts fresh at the selected wind. Matching model steps does not
  match real seconds or certify steady state. Device speed affects waiting
  time. For later wake development, exit the guide and explore normally.
- Initial tracer markers use the same seed. Particle trails remain visual aids;
  Worker delivery and painting can affect their paths. Students compare wake
  colours, rather than claiming pixel-identical trails or statistical proof.
- Settings, pair/size choices, dragging, manual steps and manual capture stay
  locked while a guided comparison runs. Pause and Exit remain available.
  Cancelling a repeat preserves the previous completed pair, and an engine
  change ends the active run. A repeated run cannot silently change engine.
- Manual Shape, Speed and Angle captures still check recorded conditions
  beyond the selected variable. Differences in height, position, grid, engine,
  display settings or elapsed steps are shown for review. These checks do not
  establish physical validity or real car/aircraft performance.
- Reports freeze their source records and written reflection before loading
  images. A previous report cannot accidentally use the new round's notes.
  Guided predictions remain the original prediction even after controls change.
  Manual predictions are also frozen when A is captured; later edits to the
  planning dropdown do not rewrite the saved prediction. Switching experiment
  questions keeps the existing captured notes and written explanation.
- The settings review is a student acknowledgement, not certification that
  all conditions match. Differences remain visible in the UI and downloaded
  record even after review. Adding or removing a view resets that acknowledgement.
  Repeats retain the previous round's review state and start unchecked.
- HTML learning records preserve full text, including line breaks. The PNG
  remains a compact picture summary and can shorten long writing. HTML files
  embed their captured images, escape user text and accept no remote image
  URLs; no scripts or external dependencies are added. They are saved locally.
- Research stability JSON also records interface build, geometry scale and
  size method, so a resized silhouette is distinguishable from a native preset.

## Validation and scope

```sh
node --check airflow-lab/app.mjs
node --check airflow-lab/shape-comparison.mjs
node --check airflow-lab/learning-record.mjs
node --test airflow-lab/shape-comparison.test.mjs airflow-lab/learning-record.test.mjs airflow-lab/stability-recorder.test.mjs airflow-lab/live-performance.test.mjs airflow-lab/student-gpu-integration.test.mjs
```

The 44 relevant automated tests passed for this release. Tests include every
supported pair on both grids at the top-left and bottom-right boundaries;
actual raster height/centre/bounds checks; exact observation steps; native-size
warnings; selected-pair predictions; repeat restoration; retained notes; report
source isolation; checklist updates through real application input handlers;
manual prediction retention; complete text export; escaped user markup;
previous/current review isolation; cancellation; and the existing recorder/scheduler/integration
regressions. Application tests use a small DOM and asynchronous Worker protocol
double; the JavaScript final chunk uses the real solver. These are not physical
GPU benchmarks. GitHub also runs the existing full benchmark and WASM checks.

Solver, shaders, Worker kernels, engine selection, grid defaults, 30 FPS pacing
and Fixed 8 default remain unchanged. Physical desktop/phone/tablet benchmarking
is reserved for substantial runtime or classroom-default changes, following
STABILITY.md. 60 FPS and higher GPU update rates remain separate research work.
