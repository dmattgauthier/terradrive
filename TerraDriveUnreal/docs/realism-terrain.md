# Vehicle surfacing and acquired landscape integration

October 23, 2026. The native export preserves the browser implementation and the simulation's vehicle dimensions, wheel pivots and suspension hardpoints.

## Vehicle changes

The five original body builders now use native construction helpers with analytic surface normals, rounded solid fittings and narrower glazing seals. The Urus also uses the rounded fittings and analytic normals across its authored bonnet, cabin and body surfaces. Lamp forks have been corrected toward the outside of the housings. Native glass uses a view-dependent edge opacity, and the lighter front glazing exposes the cabin rather than reading as a solid black panel.

All six vehicles now receive project-owned instances of Epic Automotive Materials for paint, trim, rubber, metal and cabin finishes. Wheels and brake discs have separate finishes, including iron discs for the ordinary vehicles and carbon ceramic for the Urus. Imported parent assets are never edited. The integration report is generated at `Saved/automotive-bindings.json`.

The first native review exposed exterior paint visible inside the Urus cabin. The corrective pass adds inner pillar trims, a roof liner and door cards reaching the beltline. The HUMMER's stamped side sheets now use a denser surface grid, with the seam projector following that same grid, and reduced extra bulging in the door skins.

The Urus side comparison also showed an excessively narrow waist and thick arch reveals. The revised cross section broadens the lower doors and reduces the additional waist dish while leaving the measured width, wheelbase, axles, upper greenhouse and mechanical hardpoints unchanged. Reference matching remains qualitative rather than a CAD overlay.

These remain hand-authored reference reconstructions. Automotive shaders and smoother normals improve the presentation but do not establish manufacturer CAD accuracy. Panel transitions, detailed lamp optics, exact interior components and production topology/UV/LOD authoring remain gaps against a finished racing-game asset. References include the [original Lamborghini Performante](https://www.lamborghini.com/en-en/history/urus-performante) and the research recorded in [vehicle-art-production.md](vehicle-art-production.md).

## Terrain and scenery

Add the acquired packs to this `.uproject` through Epic Launcher/Fab before running `Tools/build-native.ps1 -ImportAssets -Package`:

- **Automotive Materials** under `Content/AutomotiveMaterials`.
- **Landscape Material | MW Landscape Auto Material** under `Content/MWLandscapeAutoMaterial`. The free [MAWI pack](https://www.fab.com/listings/6602874e-ef24-48c9-9055-a7ac07384696) supplies dirt, grass, stone, rock, sand and foliage used by this pass.
- **Automotive Winter Scene** under `Content/AutomotiveWinterScene`, supplying scanned snow, compacted snow road, rock wall and authored rock/ice formations.
- **African Slate Quarry**, already acquired and used by `Tools/fab-scenery.json`; set `TERRA_FAB_CACHE` if its extracted FBX cache is elsewhere.

If a pack is already in Epic's Vault, copying its entire `data/Content/<PackRoot>` folder into this project's `Content` folder preserves its package paths. Keep its original folder name and dependencies together. Otherwise use **Add to Project**, **Show all projects**, select **TerraDrive** and the newest version offered by that pack; retain UE 5.8.3 for the project.

Terra Drive uses its own deformable procedural ground, so a Landscape-only auto-material cannot simply replace its ground shader. `terrain-materials.py` references selected acquired textures from the original pack roots and builds project-owned materials. It retains physical soil state and tire deformation. `terrain-surface.hlsl` blends randomized overlapping texture projections, using corresponding offsets and rotations for color, normals and roughness. Broad mineral/vegetation patches, slope exposure and different layer scales add variation within each region. It handles BC5 normals and packed roughness channels without changing the supplied textures.

Snow uses scanned snow and compacted-road albedo rather than recolored sand. Existing tire wear still compacts snow, crushes grass, lightens hard dirt and darkens wet soil. Rubber skid marks remain restricted to pavement. The quarry's graded corridor remains clear of vegetation.

The scenery recipe supplements African Slate with Winter Scene rocks and ice at biome edges, plus MW grass clusters. It duplicates only the selected static meshes into `/Game/FabScenery/Meshes`. Temperate formations use the matching native rock material instead of the Winter Scene's snow/weather master; ice and foliage retain their acquired material dependencies. Original pack meshes and materials remain unchanged. Foliage has no solid collision. Formations avoid the authored route corridors and spawn areas.

**City Sample Vehicles** was also added through the user's library (latest offered version: 5.3) into `Content/CitySampleVehicles`. It is available for professional topology/material reference and a future explicitly named fictional vehicle integration. Its generic bodies are not substituted for the Urus, HUMMER or other branded vehicles. It is not a cooked runtime dependency of this pass.

Its supplied vehicle Blueprints use their own Chaos/Control Rig setup. The static meshes can be inspected as art references; adding one as a playable Terra Drive vehicle still requires drivetrain, wheel-pivot, upgrade and input integration.

Raw acquired UAssets, caches, reference photographs, saves and packaged builds stay outside the public source upload. Only original source, recipes and documentation are published. `Saved/terrain-bindings.json` and `Saved/fab-import-report.json` record the local integration.

The three MW grass variants register with the existing tire-crushing system. Loaded footprints flatten and bend their actual instances; terrain repair restores them. Native validation checks this behavior separately for all three imported variants.

## Verification

Export, full shader cook and packaged-game results are recorded in [native-validation.json](native-validation.json). Native inspection includes all six garage models, six Urus views and the terrain regions. The native regression checks each body's automotive instances, loadable acquired terrain maps, imported scenery collision and existing driving, braking, suspension, soil and ground-contact behavior. Automated loading checks establish integration; the saved native captures provide separate visual evidence.
