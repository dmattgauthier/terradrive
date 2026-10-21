# Terra Drive

Native Unreal Engine 5.8.3 / C++ migration of the supplied Terra Drive 1.15 off-road simulator.

`TerraDriveUnreal/` is the native project. `TerraDrive-v1.13/dist/` preserves the original buildless browser implementation and its vendored assets as the migration reference. Despite the historical folder name, that source is version 1.15.0.

The Unreal migration is a playable development preview. Asset import and Windows cooking/packaging have succeeded, and the packaged game has been exercised on an NVIDIA RTX 4060 Laptop GPU. See `TerraDriveUnreal/README.md` for controls and build instructions, and `TerraDriveUnreal/docs/validation-native.md` for measured results and remaining migration limits. Generated Unreal assets and Windows binaries are excluded from source control; the conversion and import tools recreate assets from the supplied reference source.

The native preview includes the Summit loop/jump/articulation park and a Granite Trials arena with four rocky routes. Finite suspension contact prevents roof-down driving, airborne tire debris moves and expires, and selectable axle lockers/low range affect climbing traction. See `TerraDriveUnreal/docs/offroad-challenges.md` for the course controls.

Third-party asset attribution is retained in `TerraDrive-v1.13/dist/assets/terrain/manifest.json` and adjacent source/license records. Unreal Engine itself is not included.
