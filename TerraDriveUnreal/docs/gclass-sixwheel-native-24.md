# G-Class six-wheel native acceptance, pass24

The current package adds the G63 AMG 6×6 as a separate three-axle vehicle and replaces the existing G63 slot with the newer 4×4². It preserves the original nine saved profiles and appends a tenth. All bodies received contour/equipment work; diagnostic native captures exposed vent, badge, cab-sheet and door-return defects that were corrected before this acceptance.

## Final package

Launch `Build/Windows/TerraDrive.exe`. Both editor and game targets compiled. 307 meshes were accepted; the final correction reimported eight changed meshes and reused 299 byte-identical accepted inputs. The changed content received a full successful cook. The last code-only garage correction reused that content cook. Current package/Binaries executables match:

`140b976cbe874c8eb8af407e9eb62e175dcf9e1fb68d97ec0b0c1ef7f0e633a0`

The frozen source has 190 producers, manifest SHA-256 `ad2e7716a880e9ca1523f0a73ac002236d76337b588ec03db65c1419fceb8601`. The generated input manifest SHA-256 is `4f4361e728ea289bf352580e401d3812652484e4892ae1dc39bfb776185f9d03`. Exact container hashes, checks and preservation results are in [fidelity-native-24.json](fidelity-native-24.json). Native evidence stays under `Saved/Pass24-2026-11-01T02-34-15Z/Candidate5/Validation`.

## Native checks

All 1762 checks below passed on that executable. Runs used isolated garage/controls/graphics/user directories, 1600×900 rendering, a paced fixed 20 Hz simulation and a 77°C cutoff. Art/Garden used Quality; other fixtures used Cool. These are functional checks, not uncapped FPS or long-session PC-crash acceptance.

| Suite | Checks | Captures | Peak GPU °C |
| --- | ---: | ---: | ---: |
| SixWheel | 35 | 6 | 47.0 |
| Garden | 10 | 5 | 49.0 |
| Art | 110 | 100 | 55.0 |
| Interface | 140 | 24 | 54.0 |
| Mechanical | 557 | 20 | 54.0 |
| ElectricPressure | 280 | 36 | 54.0 |
| Rollover | 513 | 64 | 54.0 |
| Ruts | 117 | 16 | 54.0 |

The six-wheel run covers six loaded/driven rotating contacts, all five factory locks, full-velocity braking, three actual EV swap driving/braking trials, charging/refueling and v7→v8 profile migration. Every EV trial confirms the actual road destination after closing the garage. The mud trial requires positive travel and measurable displaced soil at the worked footprint of all three axles. The rolling tire-support witness can lie ahead of that footprint, so its instantaneous depth alone is not a rut-creation measurement.

The garage trial uncovered a production race: a kinematic garage teleport left a Chaos Position target queued. Resuming dynamics and immediately traveling wrote the new dynamic transform, but Chaos subsequently reapplied the stale target. `SetGarage(false)` now clears that target through the locked physics game-thread API after resume, welding and mass setup. The test preserves same-frame travel and checks the real destination; it does not add a delay to hide the race.

## Geometry, references and limits

Fresh portable checks pass 15,025 ground-grid assertions, 798 nonlinear tandem assertions and 31 energy assertions. Source models pass ten vehicles / 121 expedition checks, including 65 portal checks, plus 196 separate attachment/closure checks. The 93 shared G-body checks retain the explicit standard donor distinction. See [vehicle-fidelity-24.md](vehicle-fidelity-24.md) for inspected manufacturer sources, source checks and estimated dimensions.

The garden uses shared quarter/half-metre geometry around the existing formations, one bounded immutable cache and matching contact interpolation. The native source field hash is `fab093775cd20e9a2a5d3cc1777200454b2f944a7a7b40045dbeffb320a8a816`. See [rock-garden-fidelity-24.md](rock-garden-fidelity-24.md) for restoration bounds, seams, grade changes and added geometry. The result improves local relief and shoulders, while the large formations retain the limits of a heightfield representation.

Vehicles remain original photographic reconstructions with simplified detail. This round does not establish production racing-game asset fidelity or a performance improvement. Failed import/diagnostic results are retained separately from this final acceptance. Browser source, acquired packs and current player files passed the preservation audit.

## Cleanup and preservation

Removed 1,645 regenerable or superseded files totaling 11,512,213,724 bytes (about 11.5 GB): duplicate staging/cook/compile caches, the old generated source-asset backup, the superseded rollback, duplicate packaged symbols, historical default screenshots and obsolete standalone test intermediates. The current executable/containers, current local symbols, generated inputs, current/failed verification records and one complete E582 rollback remain. Original browser source/history archives and current player files are retained.

The audit checks 1,214 browser files by bytes, 8 player paths by presence/hash and 715 original acquired-pack files by baseline length/timestamp. The 43 project-owned FabScenery import copies remain at their original lengths; 11 were re-saved by the importer, so no claim of byte identity is made for those derived copies. They are distinct from the original acquired packs. Detailed hashes and cleanup inventory stay with the local evidence.
