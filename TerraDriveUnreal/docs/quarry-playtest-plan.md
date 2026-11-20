# Quarry playtest milestone

Build one Windows playtest around Slate Rim Quarry and the Granite fault-line crawl. Slate Rim sets the visual bar with the original V8 Urus Performante. A stock Wrangler demonstrates Granite’s locked center line and open-axle right bench.

| Order | Deliverable | Acceptance |
| --- | --- | --- |
| 1 | Identify the baseline package and stage a revision-labeled Windows build. Keep the player profile through the upgrade and retain the prior playable package for rollback. | Record comparable 1080p, 30 FPS-cap quarry runs with wall-clock frame timing, memory and temperatures. Exercise garage, quarry, mud, rollover, recovery and restart in a sustained run. |
| 2 | Author the Urus surfaces from exact-trim photographs and walkaround views. Establish the wheelbase, track and outer dimensions before detailing the hood, fascia, greenhouse, hatch, lamps, wheels and visible cabin. | Inspect matched front, profile, rear and oblique views. Bake coachwork and tire probes from the exported mesh. Validate wheels, lighting, tire clearance, recovery and factory driving in the packaged game. |
| 3 | Give Slate Rim continuous, layered quarry geology and plausible scree, soil and vegetation. Give Granite distinct center and right-bench approaches. | Inspect the scenery from the driving camera, drive all Slate Rim gates and both Granite lines, and verify contact and rut behavior with the authored terrain. |
| 4 | Brief the course before starting it, show the result after the last gate, and support retry and saved clean bests. Use simulated load, slip, surface and impacts for sound and gamepad feedback. | Complete and retry a course through normal menus. Reload the saved best, exercise recovery accounting, and verify that the driving cues respond to the simulation. |

The Urus is an original reconstruction from public reference imagery. Published dimensions constrain the envelope. Hidden surfaces, curvature between reference views and trim joints are estimated. The visual acceptance uses the native garage and driving camera. Reference imagery stays outside the game and source repository.

[Lamborghini factory brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/gateway_urus/performante/2022/banner/pdf/2023/04092023_URUS%20PERFORMANTE_DIGITAL_BROCHURE_WCAG_EN.pdf) · [Dinorwig slate landscape reference](https://www.visitwales.com/destinations/north-wales/eryri-snowdonia-mountains-and-coast/six-areas-unesco-awarded-slate)

## Reference and modeling decisions

| View | Landmark and surface decisions |
| --- | --- |
| Side profile | The wheels set the 118.35-inch spacing. The cowl sits ahead of the previous one. The windshield rises into the front roof bow, the rear quarter window narrows toward the haunch, and the rear spoiler extends over the hatch glass. The body has a wider rear shoulder and a rising crease through the lower doors. |
| Front and overhead | The carbon field rounds toward the nose between the two recessed cooling ducts. The fascia follows the thin outer lenses and wraps into the fenders. The apertures retain separate cooling packs behind the horizontal blades and body-color corner hooks. |
| Rear and cockpit | The lamp shelf rolls into a shallow painted plate recess, with narrower rear glass, stepped valance, and satin exhaust tips. The center stack retains the two screens, separate switch row, drive-mode selectors, and red starter cover. The 22-inch shiny-black Helianthus design has a dished face and five polygonal openings. |

The dimensional guide is 202.24 inches long, 79.76 inches wide across the body, and 63.70 inches high. The measured photo landmarks use axle centers as references and allow for perspective. The Monterey press footage corroborates the shape of the lower bumper on a second car.

[Factory photo set with nose, roof, extractor and cockpit close-ups](https://www.caranddriver.com/photos/g41614245/2023-lamborghini-urus-performante-drive-gallery/) · [Production-car photo set](https://www.caranddriver.com/photos/g43720602/2023-lamborghini-urus-performante-by-the-numbers-gallery/) · [Syndicated reference side and rear views](https://www.suvdrive.com/lamborghini/urus/lamborghini-urus-performante-2023) · [Monterey press footage](https://www.lambocars.com/lamborghini-urus-performante-the-unveil/)

## Windows storage

Launch `Build/Windows/Start Terra Drive.cmd` with the entire cooked Windows directory present. The launcher derives `Build/PlayerData` from its own location. Unreal keeps the garage, graphics, controls, clean course records, screenshots, and logs in that profile's `Saved` directory. A separate staging archive gets a sibling profile of its own.

Pass `-DriveLocalData -EngineRoot D:\TerraDriveTools\UE_5.8` and a D: archive directory to `Tools/build-native.ps1` on this workstation. `-BuildLabel` records the clean Git revision and the hash of the staged native executable. The import, cooked data, derived data cache, and verification evidence are all under the D: project. Windows, the installed Visual Studio compiler and SDK, and their global diagnostics are system dependencies.
