# Terrain, transition and rut refinement — pass 26

Soft terrain already blended visually, but a finite tire footprint discarded every cell whose original surface ID differed from its centre. A rut could therefore end halfway through a footprint at a dirt/mud or dirt/snow boundary. The entire bank budget also switched when the centre crossed that boundary. Broad, softly mixed colors and the older grass photograph made the same boundaries read as blurred stripes.

## Ground and transitions

The dirt/meadow layer now uses the installed MW Landscape grass color and normal scan at a smaller world scale. Existing stochastic sampling, photographic dirt/stone layers, slope treatment and texture residency limits remain. No new terrain texture allocation or foliage density increase is required: the grass scan was already used by the wetland material.

Mixed fringes retain distinct patches with narrower material contacts nearby and a wider filtered join at distance. Pavement keeps a quieter gravel shoulder. The existing continuous coverage field and its nominal fringe widths still drive grip, rolling resistance and available soil depth. The additional patch competition affects shading; it does not impose sharp grip changes at every visible patch.

Damp soil now extends between mud and melting-snow patches. Moisture follows the original continuous terrain cover before visual patch competition: a thin snow island stays slushy even when it wins a pixel, and exposed soil can remain damp between islands. Sand can darken beside wet ground, while its untouched fine wind grain is erased under loaded tire marks. Sustained wheelspin smooths and wets exposed clay floors; displaced banks retain rougher clods. These features use the existing scan layers and physical packing, relief and shear channels. They add no decorative collision teeth or black off-road strips.

## Rut continuity and displaced material

Footprints now work all eligible soft cells in their finite contact area. Each cell retains its own cached depth limit, including the finite snow layer. Original pavement and rock cells remain rigid and receive neither excavation nor deposited soil. The existing physical grid is still approximately **2.46 inches**; tire forces, rendered fine geometry and terrain collision use the same displaced heights.

Bank compaction fraction, width and height blend over the loose-material coverage at the footprint centre. The amount available remains the volume actually removed; unused receiver capacity is still accounted for as compaction. Pure snow retains its lower displacement budget and sand its larger sideways displacement. Packed snow's grip contribution now follows snow coverage through a mixed fringe.

Quintic-interpolated, aperiodic world fields replace the sinusoidal bank variation. Broad collapse and smaller clod groups vary coherently over roughly one-foot and larger scales. Floor strength and bank shape do not restart their spatial phase at a material ID. There is no frame/stamp random height; repeat work at the same coordinates reproduces the same result. Existing smooth wall profiles, receiver caps, volume accounting, soil cache and collision-error bounds remain.

## Validation

The standalone simulation suite passes **667 checks**, including pure-material bank properties, mixed-fringe compaction bounds/continuity and repeatable bounded world fields. These are source/physics checks, separate from Unreal rendering.

The fresh before package passes **185 native checks**: Transitions 53, Detail 15 and Ruts 117. It produces 36 captures with matching isolated Quality settings, 1600×900 rendering, a paced fixed 20 Hz clock and a 20 FPS cap. Its peak sampled GPU temperature is 52°C. Those results describe the unchanged pass 25 executable, before this terrain update.

The new `RutTransitions` native mode spans all seven actual terrain boundary fixtures with a finite loaded footprint. It checks both soft sides, protected hard cells, floor continuity, off-road marks, volume accounting, repeatability, visible coverage and the actual terrain collider. Two close/oblique views per boundary accompany its 64 checks.

The first editor compilation caught a missing component header in that new fixture. Its full build-tool diagnostics and source are retained. A later static review added a wait for the final screenshot before clearing the camera/ground. Candidate3 then passed all 64 boundary checks, but two close images exposed overly clean white snow islands; those results and images remain as rejected visual evidence. The subsequent material revision uses natural coverage for moisture and a slightly broader contact join. Those earlier checks do not count as final-package acceptance.

The final package passes **927 fresh native checks**: RutTransitions 64, Transitions 53, Detail 15, Ruts 117, Movement 120, Garden 10, Rollover 513 and SixWheel 35. All processes exit 0, and accepted game logs are scanned for fatal/ensure/shader errors. Movement covers the seven original terrain boundaries and all ten vehicle rise fixtures; rollover covers the complete 64-pose roster. Actual driven mud/snow ruts and all three driven axles of the 6×6 remain covered.

All 50 focused terrain/rut views were inspected; exact byte matches to previously inspected C4 frames and any new final-frame reviews are distinguished in the [evidence summary](terrain-ruts-native-26.json). Additional selected behavior views are listed there. The before build remains separately identified; its 185 checks are not added to final acceptance.

All 193 frozen producers and 319 generated inputs match the accepted package. All 307 mesh inputs and the main terrain data remain byte-identical to the fresh baseline. The full material cook is from Candidate4. The final Game target corrects only the guarded momentum fixture: it requires each vehicle's actual supported contact count and measures every wheel, with the original clearance/travel/braking limits retained. All other 192 producers and the five cooked containers match; executable SHA256 is `a9c196c22c2e151a1b18c9a4af6e81ba5eb68de8a521ea3df3774fc84115441a`. All 927 checks run afresh on that final executable and those containers. Exact hashes and shader/binding signatures are in the evidence summary.

The final standalone run passes **667 checks**, with retained stdout, binary hash and matching source inputs. Peak sampled GPU temperature across final native runs is **54.0°C**. All native runs are bounded and capped; no uncapped FPS or endurance claim is made.

Use `Tools/verify-fidelity.ps1 -Mode Transitions`, `Detail`, `Ruts`, `RutTransitions`, `Movement`, `Garden` and `Rollover` with a distinct `-OutputDirectory` for each run. These functional checks isolate player garage, graphics, controls and user settings, require GPU telemetry and stop at 77°C. Fixed-clock checks do not establish uncapped throughput or long-session thermal stability.

## Limits

The soil remains a bounded height field with compaction and volume redistribution, rather than individual moving grains, fluid mud or temperature-dependent snow. Fine tread and wind grain are filtered material normals. This pass keeps the main terrain/obstacle geometry, acquired originals and vehicle mesh inputs; it does not add new routes or a new landscape mesh.

## Preservation and cleanup

Full hashes preserve 1,214 browser files, 715 acquired original asset files and eight player-state paths. Cleanup removed 215 superseded generated files/build copies (3104011853 bytes, approximately 3.10 GB), with current package containers and player files unchanged. One validated pass 25 rollback is retained at `Saved/Rollback-P25`; failed/current records and images, source inputs, local symbols and useful compile/shader caches remain.
