# Derby Lab update log

Add a dated entry for each update. Record what changed, why, and how it was checked.

## 2026-11-27 · Inspect the tightest gap

- Added **Inspect tightest gap** in Balance Lab. It jumps to the exact simulation step with the smallest gap, highlights the location in blue, and identifies the part of the chassis and the track surface. Collisions retain their red marker.
- Added the closest approach time and location to pitch report exports. The playback timeline now includes that frame.
- Verified both track profiles at five clearance settings. Finish times, collision results, and minimum gaps matched the previous model. With 40 mm wheels, a 100 mm wheelbase, a 140 mm body, and 18 mm clearance, the original track's tightest gap was 0.93 mm at 0.8844 s at the front overhang above the center guide, around 1.615 m along the track. All 15 experiment-review tests passed.

## 2026-11-27 · Ground clearance and chassis contact

- Expanded ground clearance from 8–10 mm to 8–25 mm in 0.5 mm steps. Added ground clearance and body length sliders to Direct car design. The side view previews the dimensions and marks the distance from level ground to the underside.
- Added a red dot at the first detected chassis collision. Inspect chassis contact jumps to that moment and identifies the body region, road or center guide, and track position. The model stops when overlap exceeds its existing 0.20 mm tolerance.
- Added the minimum clearance across integration steps and included it with collision details in pitch report exports. Earlier playback samples missed the tightest gap.
- Verified both track profiles using 40 mm wheels, a 100 mm wheelbase and a 140 mm body. On the original track, 16.5 mm clearance hits the center guide near 1.615 m. At 18 mm the model finishes in 0.947 s with a 0.93 mm minimum gap. On the straight slope, that setup finishes with a 14.27 mm minimum gap.
- Checked setup import and export at both the old default and the new maximum. All 15 experiment-review tests passed.

## 2026-11-27 · Track profiles

- Added a straight slope with the same horizontal span and start-to-finish drop as the original track. Both labs, saved setups and experiment records support track selection.
- Added wheel diameter adjustment and a live preview to Direct car design.
