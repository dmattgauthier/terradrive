# Granite Steps rock detail

The large outcrops are shared physical terrain derived from the existing CC0
[Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01) profiles. Their
native one-metre triangles discarded intermediate ridge and shoulder detail.
Candidate2 restored bounded half-metre detail and changed material scale, but
its five native views still showed triangular silhouettes and broad planar
faces. Those captures and their successful 125/125 ground rays remain earlier
evidence; they do not validate the final quarter-metre implementation.

`Tools/garden-geology.mjs` now evaluates the existing 65-by-65 analytical scan
profiles on a native-only quarter-metre field. It preserves all browser files,
acquired assets and the recovery `terrain.bin`. The source field is not stale:
the existing half-metre stream agreed with the browser analytical field to
float precision in all five camera regions. The remaining issue was sampling
resolution and the first pass's deliberate retention of coarse silhouettes.

Twelve existing chunks around six authored rock groups use approximately
10-inch triangles; the other eighteen garden chunks retain approximately
20-inch triangles. Other terrain retains its original one-metre resolution.
All resolutions share exactly the same height/collision interpolation and
stitched borders. The same thirty garden components and material sections are
used. Four-metre soil handoff masks still remove the same physical area.

The recovered scan shoulders are bounded before filtering. A separable
binomial filter smooths that bounded correction, with a 25 cm standard
deviation; shaping fades between 8 and 10.5 metres from the six existing
groups. Inside fully restored areas, a floor can deepen at most 10 cm from
the original metre surface, while shoulder fill is limited to 45 cm. Outside
these groups, the previous bounded half-metre surface remains. This prevents
restoration of narrow original crevices that would introduce new traps.

The final portable measurements show 38.524 cm maximum fill and 11.3411 cm
maximum cut from the original metre field; the latter includes the previous
half-metre correction outside the restored groups. Fully restored floor cut
is at most 9.44843 cm. Relative to Candidate2, maximum fill is 31.9402 cm and
maximum cut is 6.90631 cm. The maximum correction gradient is 0.776949. Maximum
total sampled grade changes from 3.95888 to 4.26247; this is a rock obstacle
course, not a claim that every existing steep face becomes less steep.

`Tools/test-ground-grid.cmd` passes 15,025 checks, including 3,236 mixed
resolution seam vertices, 254,478 profile points and 15,000 independent triangle
intersections. Render/support disagreement is below 0.00023 cm and seam error
below 0.00007 cm. RMS error against the denser original scan field falls from
6.54505 to 5.21883 cm; deep crack error remains deliberately bounded. Source
validation checks every value for finiteness, compares 4,096 samples against
the actual analytical profiles and verifies its complete header, provenance
and SHA-256. The machine-readable geometry results are written to
`Saved/rock-garden-grid-report.json`.

The immutable cache uses 1,971,716 bytes, approximately 1.88 MiB; source
filtering runs once during world initialization. The fixed geometry addition
over the original metre renderer is 243,072 vertices and 479,232 triangles.
Relative to Candidate2, the addition is 148,992 vertices and 294,912 triangles.
These are explicit geometry budgets, not a performance improvement claim.

The existing MW Rock, mossy rock and Winter RockWall materials use closer
stone scales, stronger scan normals and mineral/lichen variation. There are
no additional texture reads or new texture assets in this pass. The native
source bake must run before packaging, including when asset import is skipped;
`NativeData` is already staged as UFS. The five views in
`Tools/rock-garden-views.json`, rollover and rut checks must be repeated against
the final packaged binary. Photorealistic rock quality and native performance
remain subject to those actual visual and runtime checks.
