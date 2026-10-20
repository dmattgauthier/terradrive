# Terra Drive

Native Unreal Engine 5.8.3 / C++ migration of the supplied Terra Drive 1.15 off-road simulator.

`TerraDriveUnreal/` is the native project. `TerraDrive-v1.13/dist/` preserves the original buildless browser implementation and its vendored assets as the migration reference. Despite the historical folder name, that source is version 1.15.0.

The Unreal migration is in development. See `TerraDriveUnreal/README.md` for current controls, build instructions and validation limits. Generated Unreal assets and Windows binaries are excluded from source control; the conversion and import tools recreate assets from the supplied reference source.

Third-party asset attribution is retained in `TerraDrive-v1.13/dist/assets/terrain/manifest.json` and adjacent source/license records. Unreal Engine itself is not included.
