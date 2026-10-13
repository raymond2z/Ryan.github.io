# Tinkercad Sim Lab — English teaching images

Updated: 13 October 2026 (Macau)

## Open the pack

Extract the ZIP, then open index.html in a browser. No internet connection is needed to view the 34 images. Individual PNGs are in images/. Filenames retain the source article's image numbers 02–35; these are image IDs, not a claim that the tutorial begins at Step 2. The article's ramp construction step precedes image 02.

The English captions and settings table are editable text. image-index.csv and image-index.json record the image mapping and source URLs.

## What was completed

English teaching headlines, connector menus, interaction instructions and keyboard labels were produced using the built-in image-generation editor. Earlier usable results were retained. Incorrect interaction labels and missing parameter rows found during review were corrected. No new web research was performed in this revision.

The images are AI-localized teaching illustrations derived from screenshots, not pixel-identical captures of an English Tinkercad session. Small peripheral labels, keyboard details and spacing may differ. Use the settings below for exact values; do not infer an unlisted parameter from a blurred or obscured label.

## Settings reference

| Component | Motor type | Limits | Maximum speed | Interaction |
|---|---|---|---|---|
| Ramp Axis Connector | Servo | 0° to 180° | 20 RPM | Key 1 → Set Position → 22.5° |
| Bat Axis Connector | Servo | 0° to 180° | 400 RPM | Key 1 → Set Position → 180°; Key 2 → Set Position → 0° |
| Alternative stopper Slider Connector | Continuous | 0 to 12 units | 200 units/s | Key 1 → Change Speed → 200 units/s |

The ramp screenshots show Motor Torque 100000 N·m; the bat screenshots show 1000 N·m. The slider screenshots show Motor Force 10000 N and initial Motor Speed 0 units/s. These are the source tutorial's simulation values.

For the ramp version, start the simulation, press 1 to release the ball and prepare the bat, then press 2 to swing back toward 0°. The slider section is an alternative way to release the ball.

Image 35 preserves the source's intermediate keyboard-selection view: the action selector still shows None while the headline describes the action to assign next. Select Change Speed and enter 200 units/s.

## Translation corrections

- bat (not the automatic translation “butt”)
- Servo
- Continuous (the motor option mistranslated literally as “solid line”)
- Set Position (an absolute target angle) versus Change Position
- RPM, not PRM; rotational speed and torque are different properties
- Maximum Speed, not “Thinking speed”

## Source and provenance

Source article: KIDSPRO, “Recreate a baseball game with Tinkercad Sim Lab! Explanation of axis connectors & slider connectors!”
https://kidsprogram.co.jp/online/tinkercadsimlab

Based on the translated HTML supplied by the user and the corresponding original instructional images retrieved in the previous stage. Original screenshots and branding belong to their respective owners. This English localization is an adapted teaching aid, not an official Tinkercad or KIDSPRO publication.

## Image-editing prompt specification

Mode: built-in image generation, text-localization edit.
Base instruction: Translate Japanese instructional text into English. Preserve the screenshot composition, 3D geometry, arrows, cursor, icons, panel layout and numeric settings. Use the corresponding image-index instruction for the headline. Translate relevant UI labels consistently: Axis Connector, Slider Connector, Motor Type, Servo, Continuous, Interaction, Edit Interaction, Set Position, Change Speed, Clear Action, When Pressed. Convert Japanese keyboard legends to Latin QWERTY letters while retaining selected numeric keys. Make targeted corrections to remaining labels without adding controls.

Review focus: 22.5°, 180°, 0°, 20 RPM, 400 RPM, 200 units/s; keep Set Position distinct from Change Position. No code-based image overlays were used.
