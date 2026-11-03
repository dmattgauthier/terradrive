# Preserve absent terrain materials in wide joins

The material join remap could add coverage to biomes absent from the input
mask. If three or more competing weights had a dominant weight below the
distance-dependent join width, subtracting `dominant` and adding `join` gave
every zero weight a positive value. An equal three-way mix at `join = .49`
assigned about 7.472% to each of four absent biomes, including snow's specular
contribution.

The recipe now subtracts `max(0, dominant - join)` before renormalizing. This
keeps absent weights at zero. When the join is wider than the dominant weight,
the supplied proportions remain intact. Where the dominant weight exceeds the
join, the existing competitive transition profile is retained algebraically.
The material signature includes the recipe source, so rebuilding regenerates
the affected material.

## Regression check

Run from the repository root:

```powershell
node TerraDriveUnreal/Tools/validate-ground-blend.mjs
```

The check extracts the production scalar HLSL join block, translates its scalar
declarations and unroll annotations to JavaScript, and supplies the footprint
directly. It does not duplicate the join equations. It covers the reported
three-way case, an unequal broad mix, existing close two-way joins, and all
127 nonempty combinations of seven biomes with equal/skewed weights, different
pavement factors, close/distant footprints and relabeled indices.

The original recipe fails with an absent asphalt weight of
`0.07472178060413355`. The corrected recipe passes **6,862 cases**, checking
zero preservation, finite nonnegative normalized coverage, dominant-material
survival, equal proportions and index symmetry. The failed and passing output
remain separately preserved under `Saved/BlendCoverageFix/`. Python recipe
syntax and Node syntax checks also pass.

This regression uses JavaScript arithmetic, not GPU floating-point execution.
It does not emulate derivatives, filtering or the full material renderer, and
does not establish how often the failing mixture occurs in authored terrain.

## Packaged native validation

Fresh checks on 2026-11-02 (America/New_York) use a newly rebuilt material and
a full content cook. Packaging exits 0. The cook reports **0 errors and four
warnings**, all slow derived-data-cache reads of engine Substrate assets;
there are no failed material shaders. Pass 26 results are historical evidence
and are not counted below.

| New native run | Checks passed | Peak GPU temperature |
| --- | ---: | ---: |
| Transitions | 53 | 53°C |
| Detail | 15 | 54°C |
| RutTransitions | 64 | 55°C |
| Ruts | 117 | 56°C |
| Rollover | 513 | 57°C |

All **762 checks** pass with process exit 0. Runtime logs contain no scanned
fatal/assert/ensure/material-shader diagnostics. Runs are serialized, offscreen
at 1600×900, with isolated player/settings paths, a paced fixed 20 Hz clock,
a 20 FPS cap and a 77°C stop threshold. Peak sampled temperature is 57°C.
These establish bounded function, not throughput or long-session stability.

Contact sheets of all 14 transition, six detail and 16 rut captures were
inspected. The mud and snow transition view 1 captures were also inspected at
full size. Surfaces and physical rut relief remain identifiable. The wide snow
detail view remains partly obscured by a pine branch. These fixtures do not
measure the frequency of the synthetic three-way regression case.

The material-only rebuild preserves protected source/map/mesh metadata. The
before/after content-hash snapshots also match across all 2335 protected
paths. Full raw logs, reports, captures, the original failing regression,
container hashes and acceptance receipt remain under `Saved/BlendCoverageFix/`.

Tested identities (SHA256 except the material signature):

| Input or product | Digest |
| --- | --- |
| recipe | `215187c76c145ce0904c8cb656dc37caee263b1dd0e5df069eb7960357cd4cbb` |
| regression | `c277861c57e8ca1e9030f54d50aff706a8346c37e2d8443e7d79296a83bffd14` |
| executable | `590d2867f6c79270d9c2ddc6afb9045b6e533adfd53c86f89828a2ca21a7fc3a` |
| previousExecutable | `a9c196c22c2e151a1b18c9a4af6e81ba5eb68de8a521ea3df3774fc84115441a` |
| shader | `a9375863ccdc4a3e9bfad2df37c0d334fd9621da8ce584958fd1fa4cf27c3b34` |
| materialSignature | `71d212a30f96105a70821cd31e17539e91b8faed3f49896a26cf2b456ea2e661` |
| packageLog | `88fed725e90be10afb05fb85ab896572c7531ca3e6304a22bc0462cc2a3c6e67` |
| containerManifest | `e8563163f962bafd7b14280d6d1e1ec1041a75f222f910aff274aecf3efe5ef3` |

The container-manifest digest is SHA256 of the compact JSON array of
`{name, sha256}` records sorted by filename for the packaged Paks directory;
the full array is retained in the local acceptance receipt. All fresh runs use
the newly built executable. Its hash alone does not identify the corrected
cook: shader, material and container identities also distinguish this package
from historical evidence.

## Preservation

The prior cooked containers and blend material are backed up locally before
rebuilding. Fresh before/after hashes cover the complete browser reference,
vendor files, acquired asset folders, NativeData, SourceAssets and the eight
known player-state paths. Generated products and private local evidence are
excluded from the source change.
