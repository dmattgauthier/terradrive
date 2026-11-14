# Exterior and rock-crawl review

## Exterior comparisons

We compared the previous native front, side, rear and three-quarter views
with real vehicles of the selected trim and generation. Published reference
dimensions anchor the silhouettes. Smaller features use estimates from the
photographs. All revised meshes are built from the existing model source.

| Vehicle | Photo views and corrections |
| --- | --- |
| Urus Performante | Front and front quarter showed a deeper intake with smaller perimeter blades. The profile showed a sharper rising shoulder and a folded lower door. The rear and rear quarter showed a stronger bumper break across the corners. The revised body has a formed, open grille, less pronounced hood pressings, and reshaped bumper, plate recess and reflectors. [Lamborghini model archive](https://www.lamborghini.com/en-en/history/urus-performante) · [Same-trim studio photos](https://www.marshallgoldmanoh.com/used-vehicle-2023-lamborghini-urus-performante-c-3816/) |
| Mercedes-Benz G 580 | The front, side and rear photos show the optional Black Panel grille, an EV-specific hood and front fascia, quarter vents and a squared charging-cable box. The model now includes the raised grille elements, front trim, a charge flap and inset side details. [Mercedes-Benz media gallery](https://media.mbusa.com/news/the-gelandewagen-electrified) |
| AMG G 63 4×4² | Side and three-quarter views show the pronounced angular carbon arches. Rear photos show the exposed sidewall and dedicated spare carrier. The model updates those shapes and uses the production rear-spoiler profile. [Mercedes-Benz Photopass](https://www.flickr.com/photos/mercedesbenzphotopass/albums/72177720301942165/) · [Production vehicle gallery](https://bringatrailer.com/listing/2022-mercedes-amg-g63-18/) |
| G 63 AMG 6×6 | Period front and side photos distinguish the round projector housing, separate running-light strip, twin grille trim and lower shield. The revised front uses those details. The previously validated tandem arches, pickup hoop and side-step clearance remain. [Mercedes-Benz driving gallery](https://mb-live.jp/report/re_6x6_testdrive_150107/) · [Mercedes-Benz specification release](https://www.mercedes-benz.jp/news/release/2014/20140425_1.pdf) |
| Wrangler Rubicon | Front and rear three-quarter views informed the forged recovery hooks and photo-shaped rocker protection. The rail has a formed cross section and attached end returns, and the rear plate stays low on the bumper. [Jeep exterior gallery](https://www.jeep.com/am/en/wrangler/gallery.html) · [Stellantis model release](https://www.media.stellantis.com/uk-en/jeep/press/jeep-reveals-new-2024-wrangler) |

The packaged rear view revealed an uneven highlight above the Urus plate.
Rounding the center fold and adding finer triangles only to the hatch removed
the visible ripples in matching straight and oblique views. Across 3,984
sampled hatch triangles, maximum normal error fell from 18.37° to 1.52° and
maximum deviation from the intended surface fell from 0.36 to 0.04 inches.
[Hatch geometry verification](urus-panel-validation.json)

## Granite fault-line crawl

The 131-foot route climbs about 23 feet to the crest. Five staggered shelves
load opposite corners of the vehicle. The painted bedrock controls both
ground appearance and traction. Terrain collision and tire support follow the
actual raised shelves. Begin square to the marked lane, select low range and
engage the axle locks before the shelves, then release throttle at the crest.

The stock Rubicon test compares 4H with open axles, 4L with open axles, and 4L
with both axles locked. All three use the same lane, steering logic and normal
crawl throttle ceiling. The simulator determines the outcome from the torque
and available tire grip. The matching Windows trials gave these results.

| Stock Rubicon setup | Gates | Result |
| --- | ---: | --- |
| 4H, open axles | 0/6 | Stalled on the approach after gaining 2.9 feet. |
| 4L, open axles | 6/6 | Finished in 40.05 seconds. |
| 4L, front and rear locked | 6/6 | Finished in 31.15 seconds, 8.90 seconds sooner. |

The locked run held equal wheel speed across both axles while crawling. The
[verification record](exterior-rock-crawl-native.json) includes peak applied
wheel torque, shelf articulation, and exact package hashes. Times are in-game
times under the fixed 20 Hz functional test. Drivers can choose their line
and throttle.

## Follow-up verification for PR #16

The exporter now rebuilds its terrain field from source samples on every
run. An export over the existing field and a retry with `world.json` removed
produced byte-identical terrain and manifests. The terrain SHA-256 was
`a3fdcfb4d11b19e4b00d4e0cecf0f2979998c8ea1ef2e5289e9f17b23c8aa98e`, matching
the field from before the fix. The validator checked 14,036 cells across the
four challenge footprints. Only the G 63 body changed among 363 exported
meshes.

The G-Class geometry suite passed all 104 checks. Front-face rays hit the
exposed rear sidewall and tread, and both vertices along the bead seam had
matching unit normals. All 327 exported tire-fit checks passed.
[Export checks](export-validation.json) · [G-Class geometry](gclass-variants-validation.json) · [Tire fits](tire-fit-validation.json)

In the freshly cooked Windows game, challenge hints updated after rebinding
and resetting the keys during the same pause session. Boreal's live snow
surface was 12.84 cm above its authored spawn, and garage entry, a suspension
upgrade, and return to driving each used the live height within 0.1 cm.
The corrected spare rendered in the straight rear and close three-quarter
views.

All 421 checks passed on the same full cook in Unreal Engine 5.8.3. The runs
used isolated settings, offscreen rendering at 1600 × 900, and a fixed 20 Hz
clock. The highest GPU temperature was 53.9 °C. Each run exited with code 0
and logged zero runtime errors.

| Suite | Passing checks |
| --- | ---: |
| Pause interface and controls | 157 |
| Terrain challenges and Boreal garage | 27 |
| G 63 4×4² rendering | 11 |
| Granite fault-line crawl | 18 |
| Terrain ruts | 117 |
| G 63 4×4² rollover on ten poses | 91 |

The tested executable SHA-256 was
`010ab8decd3765e3059ff59751b289796efabf97847ff414218955b683014666`.
The SHA-256 of the sorted build-input hash manifest was
`b94b54c5e62f89bda48eb138e8f35b6b181037651818ab704480c4c1bdec206c`.
The validation package was archived separately from the installed game.
These fixed-clock runs measured functional behavior. Uncapped throughput
and long-session temperatures remain unmeasured.

## Export reuse and active HUD notices

The build checks the terrain, world manifest, and import manifest against
the completed export before reusing them. A regression test interrupts
publication after both manifests are replaced and before the terrain is
replaced. The build refuses the mixed files, and a complete retry restores
reuse. The five export regression tests also cover missing completion records
and a mismatch in each of the three files. A full export and a retry with
`world.json` absent matched the previously validated output byte for byte.
The terrain validator checked 14,036 cells across all four challenge footprints.

The HUD now resolves route hints as it draws them. The native fixture starts
a route, observes the default key on-screen, pauses and rebinds the key, then
resumes to verify the updated notice. It repeats the sequence with a reset
and verifies that the notice still expires on its original timer.

The new Windows executable passed 238 offscreen functional checks at fixed
20 Hz. This includes 163 interface checks, 27 challenge checks and 48 recovery
checks. All three runs exited with zero runtime errors. The peak GPU
temperature was 60.84 °C. The isolated package combined the new executable
with the five byte-identical content files from the preceding full cook.

The tested executable SHA-256 was
`ae1ec51dc63ea4b7939ae2b4f6b75ed752c8768504f5011110081450cce33e19`.
The SHA-256 of the sorted game build-input hash manifest was
`65988cd1edb09bc9371f841b006502f56f477ffed38499ab3985f203aa4a0977`.

## Build verification and route restart

The export verifier runs through a dedicated command entry point. All eight
source regression tests passed. One uses a real Windows junction to verify
that the build rejects an interrupted export through an alternate path.
The package-only regression exercises a legacy import record, a record for
an older export, a changed terrain mask, and an older cook record. A full
export in a temporary project also recovered from a truncated legacy import
manifest and tire-fit cache. A separate retry rebuilt a truncated mask cache
and reproduced the existing physical blend and transition data byte for byte.

An isolated import processed all 363 mesh entries and completed a full
Windows cook. The import receipt identifies the verified export and baked
terrain mask. The cook receipt matches that import. The full-cook executable
SHA-256 was
`34d4429a376c04781992e2f5edadc5f28160fceb5bebcdd47cc18249294a2740`.
That package passed all 27 challenge checks with zero runtime errors.

The native restart fixture starts Brake-control descent, rebinds the descent
key, and waits for the original notice to expire. It activates Restart Route
in the pause menu and checks that the HUD displays a fresh hint with the
rebound key. It then resets the key while the new notice is active and checks
that the new notice retains its own expiration time.

The new Windows executable passed 241 offscreen functional checks at fixed
20 Hz with the prior cook's byte-identical staged content. This includes 166
interface checks, 27 challenge checks, and 48 recovery checks. All three runs
exited with zero runtime errors. Peak GPU temperature was 65.52 °C.
The tested executable SHA-256 was
`252961a49cc7a2541b7a3788f8ca057a53d346fa303fc1954e3566aa4d0f36f8`.
The SHA-256 of the game build-input hash manifest was
`d6d8def026ce4f521157f802bb0fffd854fd044d69e8a9679137e79ad6b23569`.

## Collision bake, terrain cache and cook reuse

The lower-body probe and coachwork bakers now run through Windows directory
junctions. The import checks each baked body against the exported OBJ hash
before recording both JSON files in the import receipt. The terrain baker
records the hashes of the three texture masks, physical blend and fixture
data. A truncated or altered output triggers a full rebake even if the old
report remains.

The Windows cook writes its payload to disk and records a hash of each
relative path and file's contents in the cook receipt. `-SkipCook` verifies
that fingerprint and the import receipt before AutomationTool starts.

All 11 Windows source regression tests passed. The three new cases reproduced
on `29d3b21` and passed with these fixes. They cover a second valid export
baked through a real junction, a truncated physical mask with a matching
report, and a replacement cooked tree with matching filenames and sizes.
The isolated import processed 363 mesh entries. The new terrain outputs,
coachwork hulls and tire probes matched the preceding validated bytes.
The lower-body probe geometry matched for all 12 vehicles.

Unreal 5.8.3 completed a full Windows cook with 4,804 files totaling
2,897,872,761 bytes. A one-byte edit to the cooked asset registry with the
receipt intact was rejected before AutomationTool started. Restoring that
file allowed `-Package -SkipCook` to regenerate a package with the same
executable and staged content hashes as the full cook.

The restaged package passed 288 offscreen functional checks at fixed 20 Hz.
These include 53 terrain-transition checks, 91 Wrangler rollover checks,
117 rut checks and 27 challenge checks. All four runs exited with zero
runtime errors. The peak GPU temperature was 64.34 °C.

- Cooked tree SHA-256 `5dadd30763ae73bae06a8a05ed4a1480c4248b3bcab0fab3ebb47240714a1b1f`
- Executable SHA-256 `9751cd0719b82e9a62147af6ebc6868bde00c456f6ddb4a2eec5663633421adb`
- Unreal source and configuration hash manifest SHA-256 `3d72407f026cf8a300f413c16e362057b54ceaa6f25448389bb596fb196e9096`
- Build recipe hash manifest SHA-256 `52f2870b579894994299eea6671349d226ffdee3abe7323c20eedfb244970ecc`
