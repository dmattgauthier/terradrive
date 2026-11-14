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
