# Native fidelity pass 10 validation

Verified October 24, 2026 at 10:39 PM America/New_York with Unreal Engine 5.8.3, Windows Development, DX12 SM6 and the RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` with its complete Windows folder.

The current executable SHA-256 is `f5b5fee6e4eb8f635f0d945e03d407479bb6a622ba8bb7860a3ac68b145b86cf`. The fresh full asset import/cook/package is `Saved/fidelity10-build-1.log`, SHA-256 `3ebbcea30b64ab542a91da2bbc0680049d01cc78affb42be46f4ed20b0e048aa`. Compiled and packaged game bytes match. Source/tool/configuration fingerprints stayed frozen through acceptance; package/native data and report hashes are recorded in [native-validation.json](native-validation.json).

**676/676 native checks and 382/382 independent core checks pass.** Every report below is fresh, follows the accepted asset cook and belongs to the current executable.

| Native check | Passed | Process exit |
|---|---:|---:|
| Full | 287/287 | 0 |
| Ruts | 101/101 | 0 |
| Art | 42/42 | 0 |
| Movement | 84/84 | 0 |
| Detail | 15/15 | 0 |
| Winter | 46/46 | 0 |
| Transitions | 53/53 | 0 |
| Cool | 16/16 | 0 |
| Balanced | 16/16 | 0 |
| QualitySmoke | 16/16 | 0 |

The source geometry audit passes all six models. The Urus retains 1,134 fascia probes and 90 bonnet probes with zero painted intrusions. These geometry checks complement actual rendered inspection.

## Changed surfaces and scale

The Urus revision 10 side skin has fixed physical-height rows, a broader continuous door section, a distinct upper shoulder and shallower handle recesses. Seams and fittings follow the same surface. Its source vertex count rises from 741,537 to 789,687 (about 6.5%); this is a fidelity tradeoff. The other 237 OBJ meshes, including the other five body meshes, are byte-identical. Prior glazing, projector optics, wheels, open intake/bonnet geometry and cabins remain.

MW meadow instances change from 1447 to 2234, with smaller varied-height tufts. Scanned sorrel groups change from 10064 to 6290, with smaller plants and less overlap. Native detail instances change from 16133 to 12359. A restrained olive-green ground tint reduces the previous saturated green. Non-grass Fab groups, solid native/scanned groups, routes, loop frames and terrain height bytes match the preservation checkpoint. Snow texture/rut shading and the previous material residency caps are retained.

Vehicle/world physics source and simulation-core hashes are unchanged. The Urus lower-body query probes are regenerated from the revised mesh, and the fresh native ground-contact and movement checks cover the resulting support. All six Space stops, held-S reverse, incline holds, actual mud/snow driving, rounded-rise trials and the stock Urus twenty-gate Slate Rim route pass. Real solid-object collisions remain.

## Actual rendered review

116 distinct fresh game PNGs were actually inspected and recorded by hash, covering 36 settled vehicle Art angles, additional Urus angles, terrain close/wide views, controlled and real driven ruts, rocky support, transition coasts, suspension, winter roads and presets. The coast verification overview now uses an elevated collision-cleared eye; the acquired winter map and player camera controls are unchanged. Specific observations and limits are in the recorded root review. No separate manual/controller session is claimed.

Art, terrain detail, winter and rut checks use Quality at 20 FPS and 1600×900. Full driving uses 1280×720; transitions/presets use 1920×1080. Movement retains its isolated 1600×900 wrapper settings. Prior pass9 Art/Detail views use the same explicit Quality/20 FPS settings, while broader older captures can differ in preset. Comparisons remain visual evidence, not an image-quality score.

## GPU and preservation

The full 20 FPS run recorded 367 GPU samples: max 59°C, mean 26.9% utilization and 8.2W. Short Cool/Balanced/Quality-smoke peaks were 64/72/68°C. Quality smoke remains capped 20 FPS; all wrappers retain the 77°C cutoff. These samples do not establish normal 60 FPS endurance, long-session thermal stability or a cause for previous PC reboots.

All 1,214 local browser hashes match; 189 published browser files and 86 existing binary assets are preserved. Current player builds and the Quality at 60 FPS preference match the fresh baseline. Original IceRoad/IceRoad_Lighting and source terrain.bin are unchanged. Generated builds, raw acquired Epic/Fab packs, reference photographs, caches and player data remain local.

The vehicles remain procedural reference reconstructions with simplified fine surfacing, trim and interiors. Some ground motifs remain, and imported winter scenery retains its authored shapes. Physical soil is a bounded height field in the proving ground; Winter Expedition's authored landscape/road stays static. Feature details are in [fidelity-10.md](fidelity-10.md).
