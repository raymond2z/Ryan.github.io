# Line Lab racing revision

Learn PID keeps manual rules/P/PD/PID experiments. Evolve a Racer searches five bounded settings: P, I, D, maximum drive command (35–100%), and error slowdown (0–0.85). All candidates share identical motors, sensors and dynamics. Maximum motor command remains 100%; playback speed does not affect physics.

Slowdown uses only measured sensor error: `drive = Speed * (1 - Slow * min(1, abs(error)/2))`. No track coordinates are supplied to the controller. The race referee separately measures projected arc length, requires 24 ordered checkpoints, rejects off-course motion/projection jumps, and stops after 0.8 s of continuous line loss or 12 s elapsed. A valid completed lap ranks above every unfinished attempt; finishers rank by time. Unfinished attempts rank by valid progress. A score encodes that ordering: unfinished `49 * progress`; finished `60 + 40 * (1 - lapTime/12)`.

Each animation replays the recorded physics result. A population can be watched at 0.5–4×, paused, or inspected individually. Blue marks the current leader; failed cars turn grey and remain at their last position. Finishers hold at the finish. Each race is independent: no collisions. Fast training computes additional generations without playing every race. Settings changes reset the search; changing playback or auto batch size does not.

This is a teaching simulation, not a calibrated real robot or tyre-slip model. Gains and results are model-specific. A new track may change the ranking. Generation 1 is uniformly random within the gene bounds, with no curated weak starting population.

## Reproduce validation

With Node.js 24 or a recent Node.js supporting ES modules:

```
node checks.mjs
node benchmark.mjs
```

`checks.mjs` covers distance-based fading, genetic bounds and ancestry, unchanged elites, deterministic guided/automatic equivalence, locked-gene track transfer, race checkpoint ordering, backwards travel, shortcut/off-course rejection, and sensor-error slowdown.

## Benchmark, 5 November 2026

Tight turns, population 12, mutation probability 0.2, no motor weakness. GA: 20 generations, 240 total evaluated candidates (including copied elites). Uniform random search: 240 candidates with identical bounds, same seed and identical first 12 candidates. Both methods use the same evaluator. Seeds were fixed at 1, 7, 42, 99, 2026 before comparison. Times are simulated seconds.

| Seed | Generation 1 best | Generation 20 best | Random search best | Finishers, first → last |
|---|---:|---:|---:|---:|
| 1 | 6.78 | 5.68 | 5.96 | 12 → 12 |
| 7 | 6.38 | 5.78 | 5.88 | 12 → 12 |
| 42 | 5.88 | 5.62 | 5.88 | 10 → 12 |
| 99 | 6.40 | 5.64 | 5.88 | 11 → 12 |
| 2026 | 6.02 | 5.64 | 5.80 | 12 → 12 |

These five cases improved over their initial best by approximately 4.4–16.2%. All five beat the equal-budget random-search baseline. This small deterministic benchmark is not evidence of universal superiority, nor a guarantee of improvement in every generation or on other tracks. Full results are in `benchmark-results.json`.

Browser QA: generation playback, individual selection, all five inheritance rows, automatic 20-generation batch, frozen-gene transfer, exact five-gene application to Learn PID, and reset. No application console errors observed.
