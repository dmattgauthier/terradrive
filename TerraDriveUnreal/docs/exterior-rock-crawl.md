# Exterior and rock-crawl review

## Exterior comparisons

We compared the previous native front, side, rear and three-quarter views
with real vehicles of the selected trim and generation. Published reference
dimensions anchor the silhouettes. Smaller features use estimates from the
photographs. All revised meshes are built from the existing model source.

| Vehicle | Photo views and corrections |
| --- | --- |
| Urus Performante | Front and front quarter showed a deeper intake with smaller perimeter blades. The profile showed a sharper rising shoulder and a folded lower door. The rear and rear quarter showed a stronger bumper break across the corners. The revised body has a formed, open grille, less pronounced hood pressings, and reshaped bumper, plate recess and reflectors. [Lamborghini model archive](https://www.lamborghini.com/en-en/history/urus-performante) Ã‚Â· [Same-trim studio photos](https://www.marshallgoldmanoh.com/used-vehicle-2023-lamborghini-urus-performante-c-3816/) |
| Mercedes-Benz G 580 | The front, side and rear photos show the optional Black Panel grille, an EV-specific hood and front fascia, quarter vents and a squared charging-cable box. The model now includes the raised grille elements, front trim, a charge flap and inset side details. [Mercedes-Benz media gallery](https://media.mbusa.com/news/the-gelandewagen-electrified) |
| AMG G 63 4Ãƒâ€”4Ã‚Â² | Side and three-quarter views show the pronounced angular carbon arches. Rear photos show the exposed sidewall and dedicated spare carrier. The model updates those shapes and uses the production rear-spoiler profile. [Mercedes-Benz Photopass](https://www.flickr.com/photos/mercedesbenzphotopass/albums/72177720301942165/) Ã‚Â· [Production vehicle gallery](https://bringatrailer.com/listing/2022-mercedes-amg-g63-18/) |
| G 63 AMG 6Ãƒâ€”6 | Period front and side photos distinguish the round projector housing, separate running-light strip, twin grille trim and lower shield. The revised front uses those details. The previously validated tandem arches, pickup hoop and side-step clearance remain. [Mercedes-Benz driving gallery](https://mb-live.jp/report/re_6x6_testdrive_150107/) Ã‚Â· [Mercedes-Benz specification release](https://www.mercedes-benz.jp/news/release/2014/20140425_1.pdf) |
| Wrangler Rubicon | Front and rear three-quarter views informed the forged recovery hooks and photo-shaped rocker protection. The rail has a formed cross section and attached end returns, and the rear plate stays low on the bumper. [Jeep exterior gallery](https://www.jeep.com/am/en/wrangler/gallery.html) Ã‚Â· [Stellantis model release](https://www.media.stellantis.com/uk-en/jeep/press/jeep-reveals-new-2024-wrangler) |

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
