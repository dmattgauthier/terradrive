# Continuous tire grooves and displaced shoulders

This earlier refinement is extended by [pass 26](terrain-ruts-26.md), which adds
cross-material footprints, blended banks and aperiodic world variation. Current
package acceptance is recorded in [native validation](validation-native.md).

The native proving ground now forms a rounded tire groove with low, broad banks of displaced material. The previous rectangular pressure target and narrow side Gaussian could produce abrupt walls. A small pile deposited in front of every ordinary rolling stamp was then cut by the next stamp; this repeatedly recycled material into pointed, alternating mounds, especially in snow.

The revised cross-section has a loaded central floor and depth-dependent, rounded walls. A quintic transition reaches both the floor and undisturbed ground with zero first and second derivatives. The existing 2.46-inch physical grid, swept contacts, pressure-dependent footprint, load response and finite terrain cache remain. Tire contact, procedural collision and rendering use the same displaced heights.

Ordinary rolling places excavated material beside the tire. Substantial wheelspin can make a small leading toe; it cannot create an unlimited front pile. Each receiver has a smooth, surface-dependent repose envelope. Capacity-aware redistribution moves unused shares to other available receiver cells, while unplaced volume is accounted for as compaction. The accounting remains `removed = displaced + compacted`, including material subsequently cut by a crossing tire.

| Surface | Result |
|---|---|
| Firm dirt and grassy soil | Shallow pressure marks, a light worn trail and flattened plant instances |
| Loose dirt | Deeper rounded grooves and broad, rough soil shoulders |
| Mud and wet ground | Loaded grooves, smoother moderately darker exposed wet floors, loose clods at the sides |
| Sand | Rounded depressions, granular banks and retained sand color |
| Snow | Weight-dependent compaction, smoother blue-grey floors and lower snow shoulders; a nominal 22% displacement budget, with the remainder compacting |
| Pavement | No soil excavation; rubber skidmarks remain restricted to actual traction loss |
| Rock | No excavation or rubber marks |

Packing now interpolates over the same triangles as height instead of switching at the nearest grid node. This removes small cell-by-cell jumps in the snow grip and rolling-resistance response. Existing packed grooves cannot be raised by a lighter repeated rolling pass; driving across a former loose bank can physically redistribute that bank.

The actual vehicle sweep uses the underside of the physical wheel centre as its footprint anchor. The finite rolling-envelope support witness remains correct for forces, but can switch between the front and rear of the tire as a groove opens. Stamping a short patch at that switching witness created crater rows during real driving even when a constant-load synthetic strip looked smooth. Soil-only supported-load and slip response use a 0.10-second relaxation, and the pressure footprint is recalculated consistently from that load. Actual suspension forces, wheel support and vehicle velocity are unchanged by this filtering.

Soft-ground contact also includes the tire's rolling arc. Sink and supported area are solved together: the contact length is at least the carcass pressure patch and expands with `2 * sqrt(2 * radius * sink - sink²)`. The enlarged area then feeds the same pressure-dependent depth calculation. Existing deeper ruts expand the working arc as well. This avoids digging only a short centre hole while the finite tire support continues bearing against an unworked front wall. For a 16.35-inch tire radius, two inches of sink produces roughly a 15.8-inch rolling contact length. Flotation tracks keep their full supported length. The actual rigid-body support witness and collision forces remain active.

Available dig depth is separate from ordinary load compression. Normal loading uses 20% of that capacity, with brief slip adding up to another 18%, scaled by contact stress. A persistent shear-work dose accumulates during wheelspin in the same soil; roughly 10–15 seconds of strong stationary spin can work toward the full available depth. A rolling footprint has little exposure and cannot instantly turn ordinary mud into a deep pit. Mud/wet-ground bank height is limited to 3.54 inches, with unused displaced capacity counted as compaction. These changes address real-drive self-high-centering found after the synthetic strip checks had passed.

Swept samples interpolate the supported load and tire tangent at no more than half a grid cell apart. Longitudinal overlap weights exposure time rather than the final groove depth, and the exponential depth response is bounded by its physical target. An old absolute 1.97-inch cut limit per sample was removed because it made short tire patches depend on the number and phase of samples. Unloaded wheels, rigid contacts and teleports still break the sweep.

Native snow has an explicit estimated layer above a frozen substrate: the local deposited wind relief plus a 4.72-inch residual cover. Its compressible depth is at most 70% of that layer, bounded by the previous maximum. Each detailed vertex caches its own limit from the same formula used by tire samples, so a footprint centred over a thick drift cannot cut through an adjacent thinner layer. This prevents a thin ordinary snow area from behaving like bottomless two-foot loose soil, while deeper drifts retain a meaningful challenge. The layer thickness and frozen base are a game-world estimate, not surveyed snow depth or a temperature-dependent snow model. Pressure, supported load and accumulated shear work determine how much of that available layer a tire actually compacts.

The ground material receives signed relief, packing, tire direction and wheelspin disturbance from the physical soil state. It treats the loaded floor and loose banks differently in color, roughness and normal detail. Filtered tread normal detail follows the last tire tangent inside the packed strip. High slip breaks a clear tread into disturbed soil. These small tread features are normal-map shading, not extra collision teeth or black off-road ribbons.

A first native review passed the physical checks but found that bright snow hid the grooves, mud looked too dry, and deeply excavated grassy soil retained too much green cover. The revised material lowers the exposure of native snow scans, gives compressed floors a clearer blue-grey response, exposes moist brown earth below torn grass, and adds filtered grain/clod normals to loose banks. Compressed sand is slightly darker instead of brighter. These are changes to the actual cooked ground material, not alterations to screenshots. Final visual acceptance still depends on captures from the current package.

Small continuous soil-strength and bank-width fields break up mechanically identical shoulders. The target varies at most 5.5%, and bank width at most 6%; the shortest wavelength is about four feet. This variation changes the excavated budget rather than adding unaccounted decorative height, and leaves the smooth wall profile and bank limits intact.

Procedural mesh updates explicitly disable sRGB conversion for these data channels. Unreal's create and update overloads have different defaults; using their defaults previously changed packing/loose values between creation and update. Signed relief uses an exact byte-128 neutral value with square-root encoding to retain shallow-mark detail after vertex-color quantization.

The active mesh limit remains 768 tiles, with at most 8,192 cached offscreen states. Height, packing and physical shear dose restore in full precision. Render-only tire heading is stored in 16 bits; heading and shear dose add six bytes per cached node compared with the former height/packing history. Immutable per-vertex layer limits are regenerated when an offscreen tile returns, adding about 13 MiB at the maximum active tile count. Tile borders copy the physical and shading state together. Backspace restores the ground, plants and mark history.

`Tools/test-core.cmd` includes independent rounded-profile/bank-envelope checks, six-metre rolling strips, supported-load response checks, and short 3.94-inch patch sweeps at 4.5, 13.4 and 26.8 mph. These run at 20, 30, 60 and 120 simulation frames per second over three grid phases. `Tools/verify-ruts.ps1` exercises the packaged game, measures continuous grooves, banks, wall slopes, repeated passes, volume accounting and repair, and produces close/oblique captures. See the current native-validation report for accepted package results; source checks alone do not establish rendered quality.

Winter Expedition has since been retired; its acquired originals remain preserved locally. The active proving-ground soil model is a bounded height field, not a granular, liquid-flow or temperature-dependent snow simulation. Broad collapsing walls and tread normals improve its appearance without resolving individual grains or exact tire-lug geometry.

## Historical native acceptance

The current body-contours-11 package passes 684 native checks and 382 core checks, with 124 current captures inspected. It retains the earlier terrain/rut work and the other four vehicle bodies while revising the Civic and Urus end contours and the Civic A-pillars. Executable SHA-256: `a1157c61c74428e5f301772de2a8be2afa048b38074d6d421dd122e1bfc8a077`. See [validation-native.md](validation-native.md) for current evidence and limits.
