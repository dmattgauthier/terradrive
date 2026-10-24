# Terra Drive

Native Unreal Engine 5.8.3 / C++ migration of the supplied Terra Drive 1.15 off-road simulator.

`TerraDriveUnreal/` is the native project. `TerraDrive-v1.13/dist/` preserves the original buildless browser implementation and its vendored assets as the migration reference. Despite the historical folder name, that source is version 1.15.0.

The Unreal migration is a playable development preview. Asset import and Windows cooking/packaging have succeeded, and the packaged game has been exercised on an NVIDIA RTX 4060 Laptop GPU. See `TerraDriveUnreal/README.md` for controls and build instructions, and `TerraDriveUnreal/docs/validation-native.md` for measured results and remaining migration limits. Generated Unreal assets and Windows binaries are excluded from source control; the conversion and import tools recreate assets from the supplied reference source.

The winter round adds a **Winter Expedition** destination containing the complete acquired Automotive Winter Scene. Use the garage destination button or **0** to travel between it and the native proving ground. See [winter-level.md](TerraDriveUnreal/docs/winter-level.md) for the authored scene, travel behavior and limits: its original landscape is not excavated, and automated road checks cover four short driving trials and all internal joins rather than a continuous drive of the entire road.

The proving ground gains acquired snow/grass detail, physical snow relief, slushy fringes and more meadow planting; see [winter-ground-detail.md](TerraDriveUnreal/docs/winter-ground-detail.md). [Vehicle round 7](TerraDriveUnreal/docs/model-refinement-7.md) adds real Urus bonnet openings, a recessed hatch plate well and a thicker spoiler, body-detail corrections and revised factory tires/wheels for all six vehicles. [Momentum and suspension](TerraDriveUnreal/docs/momentum-and-suspension.md) describes the shaped undertray and progressive compression stops. Source implementation and standalone checks are distinct from final cooked-game acceptance; the linked validation record identifies the tested executable.

The earlier [terrain transition update](TerraDriveUnreal/docs/terrain-transitions.md) blends ground cover across irregular natural fringes and narrow pavement shoulders. Color, surface detail, roughness and traction change gradually while each region stays recognizable. The original source terrain field and preserved browser source remain intact.

The [rock visibility and GPU update](TerraDriveUnreal/docs/rendering-and-gpu.md) closes scanned rock boundaries and adds **Tab → 03 Graphics**. Cool at 30 FPS is the new default; 45 FPS Balanced and 60 FPS Quality are available. Garage/background caps and lighter grass rendering reduce unnecessary work. Native verification uses capped, temperature-monitored runs.

The preceding [all-vehicle coachwork round 6](TerraDriveUnreal/docs/model-refinement-6.md) refined the six bodies, cabin shading, glazing reveals, flares and model details, including open Urus windshield/hatch apertures. An all-six native close-camera mode supports repeatable art review. The earlier [vehicle and landscape integration](TerraDriveUnreal/docs/realism-terrain.md) supplies automotive finishes, MW landscape maps/foliage and scanned Winter Scene snow, rock and ice. Acquired Epic assets are local build dependencies; the public source includes the integration recipes. City Sample Vehicles is installed locally for reference and future integration.

The earlier ground-contact update restores tire support on uneven rigid ledges after rejected sphere side contacts. See [ground-contact.md](TerraDriveUnreal/docs/ground-contact.md) for the native reproduction and [vehicle-art-production.md](TerraDriveUnreal/docs/vehicle-art-production.md) for the proposed path from the current procedural bodies to accurate production meshes.

The native preview includes the Summit loop/jump/articulation park and a Granite Trials arena with four rocky routes. Finite suspension contact prevents roof-down driving, airborne tire debris moves and expires, and selectable axle lockers/low range affect climbing traction. See `TerraDriveUnreal/docs/offroad-challenges.md` for the course controls.

The native garage provides direct vehicle selection, a live model preview and seven upgrade categories with stock plus three stages. Per-vehicle builds are saved locally. Terrain uses layered photographic ground, slope-aware patches, normal/roughness maps and world-space variation. See `TerraDriveUnreal/docs/garage-and-terrain.md` for details.

Drag the garage preview to orbit, scroll to zoom, or choose front/side/rear views. Braking overrides throttle, held opposite input brakes to a stop and then selects reverse after a short dwell, and upgraded Hummer suspension raises the body consistently in the garage and driving. Vehicle refinements include separate factory-diameter rims, seated upgrade tires, stationary brake hardware and restored physical materials. Manufacturer reference decisions are documented in [vehicle-model-research.md](TerraDriveUnreal/docs/vehicle-model-research.md).

Third-party asset attribution is retained in `TerraDrive-v1.13/dist/assets/terrain/manifest.json` and adjacent source/license records. Unreal Engine itself is not included.

The native game uses imperial displays and includes pressure-sensitive tire footprints, traction-limited wheelspin, rut resistance and seamless soil deformation. Articulated suspension and upgrade equipment accompany additional physical boulders/deadwood and varied vegetation. See `TerraDriveUnreal/docs/terrain-interaction-and-models.md`.

The sixth native vehicle is the original V8 Lamborghini Urus Performante. Brake and reverse emitters, persistent soft-ground tread impressions and pavement skidmarks accompany scanned CC0 rocks/vegetation and a photographic HDR sky. See [lighting-tracks-urus.md](TerraDriveUnreal/docs/lighting-tracks-urus.md) for controls, asset licenses and model references.

The earlier Urus/quarry round reshaped the Urus body and cabin and added **Slate Rim**, a 1,065-foot quarry trail with matching CC0 cliff, boulder, grass and ground scans. It is the ninth challenge, selectable with **J**. See [urus-slate-rim.md](TerraDriveUnreal/docs/urus-slate-rim.md) for the authored geometry, source assets and native verification workflow. Vehicle models remain manufacturer-reference approximations; no OEM CAD is included.
