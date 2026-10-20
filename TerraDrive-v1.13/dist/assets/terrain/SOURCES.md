# Terra Drive environment assets

These photographic surface maps, foliage maps, rock models and outdoor HDR environments are original Poly Haven assets, downloaded on October 17–18, 2026 and self-hosted with the simulator. They replace the initial generic noise ground texture and untextured foliage. No Poly Haven API calls occur while playing.

## Credits and license

All listed assets are **CC0 1.0**. Poly Haven permits copying, alteration, redistribution, and commercial use. Attribution is appreciated but is not a condition of the downloaded assets. The exact asset pages and authors are preserved below as credits and provenance; this project is not endorsed by Poly Haven.

- [Poly Haven asset license](https://polyhaven.com/license)
- [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- [Poly Haven API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md) — used only during preparation, with the TerraDrive-asset-preparation user agent.

| Asset | Author(s) | Use in Terra Drive |
|---|---|---|
| [Asphalt 02](https://polyhaven.com/a/asphalt_02) | Rob Tuytel | Paved road aggregate and cracks, 3 m repeat |
| [Forest Ground 04](https://polyhaven.com/a/forest_ground_04) | Rob Tuytel, Rico Cilliers | Compacted trail centers and earth transitions; 2K albedo/normal and 1K roughness, provider width 3.15 m |
| [Sparse Grass](https://polyhaven.com/a/sparse_grass) | Amal Kumar | Retained original 1K grassland source; the selected 1.8 ground and ridge grass material uses Leafy Grass instead |
| [Leafy Grass](https://polyhaven.com/a/leafy_grass) | Charlotte Baglioni | Green low vegetation, leaves and twigs for the grassland floor, 1K albedo/normal/roughness at the provider's 2 m width |
| [Dry Riverbed Rock](https://polyhaven.com/a/dry_riverbed_rock) | Amal Kumar | Retained original rock texture; the 1.8 ledge and ridge material selects Mossy Rock instead |
| [Brown Mud 02](https://polyhaven.com/a/brown_mud_02) | Rob Tuytel | Mud and marsh bed with separate wetness response; 2K albedo/normal and 1K roughness, 1.3 m repeat |
| [Sand 03](https://polyhaven.com/a/sand_03) | Charlotte Baglioni | Sand dune grain and fine surface ridges, 2 m repeat |
| [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) | Rob Tuytel, Rico Cilliers | Twig atlas and opacity mask on procedural branch cards; bark on trunks |
| [Syferfontein 18D Clear](https://polyhaven.com/a/syferfontein_18d_clear) | Greg Zaal | Original 1K outdoor HDR retained for low-angle lighting; FloatType source solar centroid elevation 18.3527° |
| [Kiara 5 Noon](https://polyhaven.com/a/kiara_5_noon) | Greg Zaal | Original 1K midday HDR, 1024 × 512 pixels and 1,455,707 bytes; FloatType source solar centroid elevation 51.1923°, provider capture range 22 EV |
| [Gravel Floor 02](https://polyhaven.com/a/gravel_floor_02) | Dimitrios Savva, Jenelle van Heerden | Distinct gray gravel shoulders, 1K albedo/normal/roughness, provider width 2 m |
| [Gravel Ground 01](https://polyhaven.com/a/gravel_ground_01) | Rob Tuytel | Retained preparation candidate: tan compacted aggregate, 1K albedo/normal/roughness/AO/height, provider width 3 m; not used by the selected runtime ground shader |
| [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01) | Kless Gyzen | Six imported textured rock forms; original glTF/mesh buffer and 2K maps retained unchanged, with original provider 1K albedo/normal/roughness selected for small scenery stones using the same UV layout |
| [Mossy Rock](https://polyhaven.com/a/mossy_rock) | Rob Tuytel | Weathered gray stone, large fissures and lichen; 1K albedo/normal/roughness, provider width 3 m; selected for exposed rock and ridges |

## File provenance

`manifest.json` lists all 51 downloaded source files, official download URLs, original provider MD5 values, local SHA-256 values, byte sizes, license identifiers, and author metadata. Every download was checked against its provider hash. The initial 24 files (23 unmodified 1K JPEG maps and one 1K Radiance HDR) total 20,218,010 bytes and remain unchanged. The 1.8 preparation adds 27 original source files totaling 34,328,809 bytes. All 51 source files total 54,546,819 bytes. Adding the new midday HDR preserved all 50 previously frozen source entries and bytes. Retained alternatives and superseded originals are not automatically loaded by the game.

The new JPEG maps are the provider's unmodified 1K or 2K files. The original rock glTF, binary buffer and referenced images preserve the provider's relative paths. `../../../docs/terrain-assets-v1.8-sources.json` pins the new sources; `../../../tools/import-terrain-assets-v1.8.py` reproduces the download and verifies the bytes, or checks existing files entirely offline with `--verify-only`. See `../../../docs/assets-v1.8.md` for selection, physical-scale, color-space, memory and source-versus-runtime notes. No provider preview renders are redistributed in the project.

The lower-resolution rock maps are also original downloads. The official 1K glTF differs from the retained 2K glTF only in its three image filenames; all UV, mesh, material and sampler data match. This comparison is recorded in `../../../docs/terrain-assets-v1.8-rock-resolution-check.json`. The selected scenery material uses those 1K images with `flipY = false`; the original 2K glTF and maps stay unchanged as source references.

## Implementation notes and limits

Albedo textures use sRGB decoding; normal and roughness maps use linear data. Mud, sand, rock, and marsh bed blend into dirt and Leafy Grass using world position; trails and road edges retain their original layout. Hardpack, loose gravel and grass use the same cover fractions as the contact physics, and the road and biome materials use its exported boundaries. Base albedo, tangent-space normals, and roughness blend together, so lighting follows the surface detail. Weather darkens damp surfaces and reduces their roughness. Macro-scale variation reduces the appearance of a uniformly repeated tile.

The photographic surface detail is normal-mapped shading, not extra physical displacement. Existing terrain vertices, triangle topology, contact heights and persistent rut deformation are retained. No extra invisible obstacle is added by a normal map. The pine mesh is still procedural: it uses photographed needle-twig cutouts from the pine atlas and tapered bark-textured trunks. Grass and reeds use curved blade geometry. The new mossy stone source contains actual imported rock meshes, with derivative scenery geometry documented separately. These are rendering approximations, not a scanned landscape or complete imported tree model.

The real HDR captures supply image-based lighting and filtered paint/glass/water reflections. Kiara 5 Noon is selected for midday, and the original Syferfontein 18D Clear remains available for low-angle light. Matching the directional sun's elevation to each measured capture allows yaw-only reflection alignment while keeping the photographed horizon horizontal. The procedural startup environment remains until a selected HDR preset loads successfully. While a later preset loads, or if that request fails, the last successful environment is retained. The sky itself remains procedural, enabling weather and time-of-day changes; these are two measured source lighting conditions, not a captured weather sequence.

`../../../docs/terrain-assets-v1.8-hdr-audit.json` records both full FloatType and default HalfFloatType decodes through the actual vendored loader. Runtime FloatType decoding preserves solar-core channel values above the default half-float clamp of 65,504. Before environment filtering, the runtime softly compresses only the bright solar core with a common RGB gain, preserving its chromaticity while the directional light supplies direct sunlight and shadows. Source HDR bytes remain unchanged; the recorded solar-direction measurements precede runtime preprocessing or exposure. Reproduce the audit offline with `node tools/audit-terrain-hdr-v1.8.mjs` from the repository root.

HDRLoader.js and its compatibility wrapper RGBELoader.js are vendored from Three.js r180, under the existing Three.js MIT license. The Three.js import was changed to the local `three.module.js`. Terra Drive imports HDRLoader directly. Source: https://github.com/mrdoob/three.js/blob/r180/examples/jsm/loaders/HDRLoader.js

## Verification boundary

Node checks verify local file hashes, finite geometry, shader include compatibility with Three.js r180, complete material maps and color spaces, branch atlas UV bounds, matching visual/physical rut heights, camera handedness, and scenery batching. Those structural checks alone do not constitute GPU shader compilation or browser visual QA. The release validation records separate native EGL/GLES shader and pixel checks where performed; those native checks are not browser driving or frame-rate measurements.
