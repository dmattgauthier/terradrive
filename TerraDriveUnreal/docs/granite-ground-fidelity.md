# Granite Trials ground and terrain shading

The straight boundary beside the Slate Rim survey was a material boundary on
`granite_trials`, not a missing strip in the natural heightfield. Its rectangular
approach mesh used pure `Terrain_rock`; the adjoining terrain used the mixed
world atlas. Both now use the same atlas, scan layers and world coordinates.
Only the rock slots on that constructed mesh change. The colored gate posts,
triangle geometry, physical rock classification and all route gates remain.

A broken grass-and-stone apron extends across the former rectangle edge and
becomes rock-dominant farther into the arena. Its stones inherit the existing
photographic rock, roughness and normal layers. This is a visual cover change;
`terrain.bin` and the physical coverage in `terrain-blend.bin` are preserved.
The rigid material supplies neutral soil attributes, so default white imported
vertex colors cannot make the arena look freshly churned.

The quarry lane is now baked into `TerrainTrail.tga`. Previously every dirt
pixel searched the twenty polyline segments to suppress grass along the lane.
The atlas uses the same polyline and smooth shoulder function, with a single
filtered lookup. Shading also skips secondary and accent texture layers only
when their mathematical weight is exactly zero. Texture derivatives are
computed before these branches. Existing scan detail and terrain geometry
budgets are unchanged.

`node Tools/validate-granite-ground.mjs` checks 85,143 positions against an
independent implementation of the previous route calculation. The lookup is
identical before quantization; half-metre atlas filtering has a maximum mask
weight error of 0.06370 in the sampled region. Four rectangle edges have no
coverage discontinuity (maximum sampled change across 0.79 inches is 0.00227).
The existing 6,862 scalar blend checks pass. `validate-terrain-transitions.mjs`
checks every atlas pixel, including the new apron and path mask, against the
physical data and recipe. These source tests do not establish native appearance
or frame-rate improvement.

The native binding check is `ATerraWorld::HasBlendedGraniteApproach()`. Packaged
acceptance should include the same Slate Rim sector-02 view, a Granite Trials
view, terrain-transition/rut behavior, and matched real-time quarry benchmarks.
`Tools/rebuild-ground.py` can update only materials/textures after the transition
bake. A full native cook is required before those measurements.

## Native verification, 2026-11-08

The candidate 4 Expanded suite passes 278 checks and captures the actual
constructed/natural boundary at close and oblique angles. Both show irregular
mixed grass, dirt and exposed stone across the former straight cut; the close
view is unobstructed. The Quarry survey passes 25 checks, with the stock Urus
completing all 20 gates upright. Six sector captures were inspected; sectors
04 and 06 are substantially obscured by foreground conifers, so those two
images establish only peripheral-ground appearance, not full visual coverage.
The dedicated Granite views establish the requested seam correction.

The same build passes 117 rut checks and 64 material-boundary checks. Reviewed
fresh driven mud/snow and dirt/snow transition captures retain depressions,
raised shoulders and material-specific marks. The physics heightfield hash
remains `04febae6063ca385d27e5843cdfe65fe72690942dd2cd4126c146745d313bd20`.
Final real-time timing and exact package hashes are recorded in the
[consolidated native record](expanded-roster-native.json).
