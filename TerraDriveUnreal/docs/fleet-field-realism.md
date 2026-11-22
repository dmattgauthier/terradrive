# Fleet exteriors, braking and terrain

The twelve stock bodies and eighteen tire-clearance bodies changed in this pass. An export comparison against the installed release checked the stock vehicle dimensions, suspension hardpoints, tire menus and wheel meshes. The exterior profiles are hand-authored from real photographs. The named dimensions and wheel fit are useful constraints, while panel depths and folds remain visual estimates.

| Vehicle | Visible change | Reference |
| --- | --- | --- |
| Wrangler Rubicon | The hood stamping widens at the cowl and tapers toward the grille. | [Jeep gallery](https://www.jeep.com/am/en/wrangler/gallery.html) |
| Bronco Badlands | Two channels flank the flat hood below the raised fender sights. | [Ford brochure](https://www.ford.mx/content/dam/Ford/website-assets/latam/mx/nameplate/bronco/2024/pdf/ford-bronco-2024-catalogo-descargable.pdf) |
| Civic Sport | The rear bumper shoulder sweeps upward to the lamps and turns under beside the reflectors. | [Honda Sport photographs](https://hondanews.com/en-US/releases/release-a463299e9046a088b84018a7580565c4/photos/0) |
| Sprinter 2500 | Each rear door has its own stamped waist and recessed lower panel. The crease ends at the center joint. | [Mercedes-Benz crew van brochure](https://assets.mbvans.com/Mercedes-Benz-Vans/Brochures/Mercedes-Benz-Sprinter-Crew-Van.pdf) |
| Hummer EV SUV | The rear step wraps into the rear quarters and drops around the receiver. | [GMC SUV brochure](https://www.gmc.com/content/dam/gmc/na/us/english/index/about/download-brochures/2024-models/GMTH23CT000-2024-HUMMER-EV-SUV-FO-031924.pdf) |
| Urus Performante | The rear wing sweeps forward at its tips, with enclosed carbon side fins and a stop lamp that follows its trailing edge. Recesses under the door handles flow into the diagonal door pressings. Four metal exhaust feeds terminate behind the sloping dark backs of the stock finishers. | [Lamborghini exterior and aerodynamics](https://www.lamborghini.com/en-en/history/urus-performante) |
| EarthCruiser EXP | A gathered fabric cover and two tension straps follow the rear spare. | [EarthCruiser EXP98 photographs](https://earthcruiser.com/wp-content/uploads/2023/11/EC98_Sales_Flyer-1.pdf) |
| G 580 EQ | The rear plate sits in a recessed bumper opening and the reflectors follow the corners. | [Mercedes-Benz G 580](https://media.mbusa.com/news/the-gelandewagen-electrified) |
| AMG G 63 4×4² | Four contoured wheel tubs close the gaps behind the wide carbon flares. | [AMG exterior walkaround](https://www.mercedes-amg.com/en/mercedes-amg-g63-4x4-walkaround) |
| G 63 AMG 6×6 | The bumper ends sweep upward to the lamps around the flat central plate mount. | [Mercedes-Benz driving gallery](https://mb-live.jp/report/re_6x6_testdrive_150107/) |
| Grave Digger | The front fenders form the asymmetric fiberglass recesses around the red lamps. | [Monster Jam truck photographs](https://www.monsterjam.com/en-us/truck/grave-digger/) |
| Subaru Impreza 22B STI | The rear wing has a rounded leading edge, cambered underside and thin upturned trailing edge. | [STI heritage gallery](https://www.sti.jp/brand/heritage/1998/impreza-22b/) |

## Driving behavior

Service-brake torque is calibrated to the stock mass and rolling radius for each vehicle. Larger tires reduce braking force at the ground for the same applied wheel torque. Conversions carry their added mass into the braking maneuver. At high pedal demand the tires can still be the limiting factor. The stock brake capacity is an estimate. [Wilwood’s off-road brake sizing discussion](https://shop.wilwood.com/blogs/news/brake-bias-in-ultra4-4400-off-road-cars)

Combustion-engine RPM uses the signed carrier speed of the axles connected to the transmission, including the rear tandem on the 6×6. Electric layouts continue to calculate speed at each motor. [MIT differential kinematics](https://web.mit.edu/2.972/OldFiles/www/reports/differential/differential.html)

## Terrain

The ground shader reads local elevation relative to its surroundings and shelter from a fixed prevailing wind. Drier grass and exposed grains follow ridges, mud films collect in hollows, rock recesses show moisture staining, and snow and dune deposits vary with exposure. The two fields share the existing trail texture. Drivable terrain height and grip use the existing physical surface field.

Plant patches along the main trail use mixed scans, different headings and irregular spacing. The planted verge begins at least 13.6 ft from the centerline. In a matched generator check the scanned understory fell from 6,285 instances to 4,348, while the 13.6–32.8 ft perimeter band increased from 405 to 971. All 427 solid scan placements matched the previous generator.

### Material-only atlas compatibility

The terrain shader treats green byte 0 as neutral landform in legacy atlases.
The Direct3D compiler check reproduced the old crest weight of 1.007874,
confirmed the new weight of 0, and verified the original decode for all
255 nonzero values.

Two isolated Unreal 5.8 `rebuild-ground.py` runs with `-nullrhi` completed
successfully. Each updated seven biome materials and `Terrain_GroundBlend`,
produced a fresh completion marker, and preserved the protected file metadata.
Both bakes passed the transition checks across 2,563,201 texels each. The trail
red and alpha channels and the physical coverage mask matched byte for byte.

| Atlas | Baker revision | `TerrainTrail.tga` SHA-256 |
| --- | --- | --- |
| Legacy | `3f571161d7b8b47f9c4fa91d7601a52796385849` | `0bcb578fe947fbef47796c0971a1d3b61c7a6d4272dae52a38050d29369d55ff` |
| Fresh | `2b6c4c00489ef0d89d7b27db65649dda36e684bc` | `6a6c994275d5a1a166fda83c9152cf35cb196d0b80baaebfb8809801882383aa` |

Both runs used shader SHA-256 `d8d15d9605603604da8504289cbb666c0d898ec33c5d1923d2a88decf5e8820f`,
editor executable SHA-256 `4dbab2739e7afef7ec96cdfe48a63211742209f9a56af0620cf228913d64fb0c`,
and project editor module SHA-256 `13ca165e954fa54f1449c7c16f5eba2bf6c2866557f9eb0af1dc1921b643692a`.
The packaged driving measurements below predate this material-only fix.

## Packaged driving measurements

The Wrangler braking replay enters each stop at 20.1 mph with 37 PSI, Stage III suspension and a steady 22% brake input. The battery starts full for the converted vehicle, which removes regeneration from the comparison. These are simulation results for this maneuver.

| Wrangler setup | Stopping distance |
| --- | ---: |
| Factory powertrain and factory tire diameter | 36.6 ft |
| Factory powertrain and 50-inch tires | 55.4 ft |
| Quad-motor conversion and factory tire diameter | 43.5 ft |

The full-cook Windows build passed 928 native checks, including ten camera views of each vehicle, braking and tire pressure, movement, ruts, surface transitions, six-wheel operation and the quarry survey. The EarthCruiser recovered in place after both 55-degree Pine Ridge rollovers. The 50-inch Hummer cleared the Granite full-lock ledge checks at 16 PSI. All 381 imports completed. Source checks covered 845 dynamics assertions and 2,563,201 terrain-atlas samples.

The Urus rear view exposed a silver pipe cap inside each dark outlet. Recessing the feeds gives at least 2.5 inches of clearance behind the sloping inner backs. Ray checks on the factory and large-tire body meshes found zero exposed samples in direct rear and both rear-quarter views. Close snow can still read as low-contrast, and some understory cards are visible up close.

## Installed release

The broad native run used source `56de2715f6e5ecd91411abe656b37d4df4c092a1` and executable SHA-256 `baa50460b4bfd169394bb0be932398496c6178b1688b51b9995d867b7ad03650`. The intermediate exhaust build (`aeff5d0da01b7ea3783a88a0f9f553bb01eb9eea`) passed 359 targeted native checks. Both builds and the installed release share all five cooked content containers byte for byte.

Release `fleet-field-realism-3` was built from `b1a54bcaf06db8df039e8ccdb1f19d11cc2585ae`. Its executable SHA-256 is `d219b65055339a3ab3e2d22a8e2dbdd59cba6904e803ce41573eb4165600cc27`. This exact executable passed 71 checks across the underbody, ten-angle Urus capture, quarry survey and real-time quarry replay. Direct-rear and rear-quarter images confirmed that all four outlets have dark interiors. Installation preserved all six player save and settings files by SHA-256.

A paired stock Urus run used the same quarry route, 1920 × 1080 resolution, Cool preset, real-time clock and 30 FPS cap. Each sample covered 30 seconds.

| Build | Average FPS | Mean frame | 95th percentile | Longest frame |
| --- | ---: | ---: | ---: | ---: |
| Previous installed release | 29.79 | 33.57 ms | 34.20 ms | 74.89 ms |
| Fleet realism release | 29.89 | 33.45 ms | 33.85 ms | 53.71 ms |

Both averages sit near the frame cap. These two short runs measure frame pacing on this route. They do not establish uncapped throughput or performance over a long play session.
