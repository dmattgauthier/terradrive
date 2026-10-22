# Tire interaction by surface

This round corrects the dark tread ribbons previously applied to every soft surface. Rubber geometry is now restricted to traction loss on asphalt. Ordinary pavement rolling does not deposit rubber. All off-road marks come from the loaded soil mesh and its persistent packing state.

The fine terrain grid resolves 2.46-inch cells in 13.1-foot tiles. A moving footprint is swept between successive grounded wheel contacts so faster driving does not stamp isolated holes. Contact pressure, footprint area, load and slip determine depth. Packing stiffens subsequent contacts without raising an existing rut. Teleports, unsupported tires and rigid obstacles break the sweep.

| Surface | Persistent response |
|---|---|
| Hard dirt / grassy soil | Shallow compression, a light dusty trail and yellowed, flattened grass material |
| Loose dirt pockets | Deeper load-dependent grooves and displaced shoulders within the dirt biome, with matching soil tint |
| Mud / soft wet soil | Depressed tire grooves with raised shoulders and a small leading pile; moderately darker exposed wet soil |
| Sand | Grooves and displaced side ridges with the sand's original color |
| Snow | Weight-dependent compression, raised snow beside the tire and a smoother, slightly blue packed base |
| Grass and sedges | Nearby plant instances bend in the direction of travel and lose height under loaded tires |
| Rock | No excavation or rubber deposits |
| Pavement / tarmac | Black rubber only during sufficient longitudinal or lateral sliding |

Excavated volume is divided between displaced berm material and compaction. Snow compacts a larger fraction than mud or sand. Soil height affects subsequent suspension support and rut rolling resistance. Material packing reduces small-scale surface roughness while retaining the normals of the physical groove and berm. Backspace restores soil, plants and skid geometry. Loose-dirt pockets use a continuous procedural field shared by material tint and physical soil strength; they are estimated terrain variation, not a hydrology simulation.

The session keeps up to 768 rendered fine tiles and 8,192 offscreen soil states. Far detailed meshes move to the cache; approaching the area restores their groove and packing data. Filling the rendering pool therefore no longer stops all new deformation. Adjacent cached and rendered tile borders remain synchronized. The cache also has a finite limit and may discard the farthest history when full. There is no disk save of deformation. This is an estimated height-field soil model; it does not simulate individual grains, snow temperature, liquid mud flow or arbitrary overhangs.

## Fab library and additional free candidates

The signed-in Epic Launcher library was inspected on October 21, 2026. It contains **Automotive Winter Scene**, **African Slate Quarry** and **Electric Dreams Env**. African Slate Quarry's medium FBX version was downloaded through the Launcher (approximately 461 MB download, 470 MB on disk). It contains meshes, plant variants and 2K PBR maps. The later [body/scenery round](body-shapes-and-fab.md) integrates eight acquired slate meshes and 24 PBR textures in 282 placements; raw Fab files remain excluded from public source.

Automotive Winter Scene's Add to Project dialog showed no available project, including with Show all projects enabled. Electric Dreams is a full sample with PCG and Substrate examples; its [official listing](https://www.fab.com/listings/d79688f5-29be-4fb2-a650-2d4a813f5306) identifies it as Unreal-only content. Neither full sample was added to this project during this corrective terrain round.

Additional useful listings verified as free on Fab:

- [Snow, Quixel Megascans](https://www.fab.com/listings/2ddf31c1-5d66-49b9-ac6a-284ebf57c9e6): a dedicated scanned snow texture set with normal, roughness and displacement maps.
- [Soil Mud, Quixel Megascans](https://www.fab.com/listings/11eef52b-2c9b-4123-b4de-df266f4ac044): clumped damp soil for a distinct excavated-rut material.
- [Forest Floor, Quixel Megascans](https://www.fab.com/listings/dae56d09-862c-4f77-9e72-a41281c49633): mixed grass, weeds and soil for greater ground-cover variation.
- [Megaplants, Quixel's April 2026 release notes](https://quixel.com/news/quixel-on-fab-new-megascans-and-megaplants): free English Oak, Greasewood, Goat Willow and Baltic Pine families. Their procedural vegetation workflow has experimental dependencies; selected meshes would need optimization and validation on this laptop.

Fab library assets are separate from the vendored CC0 assets. Raw downloaded Fab content is excluded from the public source repository. The [Fab Standard License summary](https://www.fab.com/eula?lang=en) permits incorporating assets into projects and restricts standalone redistribution. Asset-specific terms and acquisition must be retained when integrating a pack. None of these candidates is required for the new deformation behavior.

Desktop automation ended when the quarry listing opened in Firefox: Computer Use reported that URL policy enforcement was unsupported for that browser. No further desktop input was issued. Verification continues through Unreal compilation, packaged native tests and game-generated screenshots.
