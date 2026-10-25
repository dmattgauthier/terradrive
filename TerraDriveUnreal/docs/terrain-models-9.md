# Terrain surface and vehicle detail pass 9

This pass develops the existing photographic terrain and reference-built vehicle meshes. Native acceptance is recorded separately in `validation-native.md` after a fresh full cook, native checks and actual rendered review.

The terrain material applies a small continuous distortion to its world-space texture coordinates before the existing stochastic/triplanar sampling. Color, normal and roughness still use the same coordinates and derivatives. This breaks up surviving photograph motifs without adding texture fetches or tessellation. It adds some shader arithmetic; the native preset samples measure the resulting capped workload rather than assuming a performance gain.

Meadow patches now distinguish green growth, dry growth and exposed roots. A photographic leafy-grass layer supplies matching diffuse, normal and roughness maps alongside MW dirt and stones. A restrained green tint corrects the overly yellow initial native result. Fine soil/root normal variation fades with the pixel footprint. The quarry driving line keeps its original material mask, and the terrain height field and physics coefficients are unchanged.

Project-owned ground copies now explicitly retain their source color space and bounded resident resolution: 23 maps with 1K caps and 26 with 2K caps, with no streaming or LOD bias; smaller source maps retain their native resolution. This keeps the native close views from losing detail to low mips. It increases bounded texture residency rather than constituting a GPU optimization; the acquired source textures are unchanged. Actual property readbacks are recorded with the final cook.

Snow retains the installed Winter Scene scans, physical drift relief and the existing compacted-rut state. More defined blue-grey hollows, granular normal variation and two scales of meandering wind ridges make the untouched snow less uniform. The snow color response retains texture in bright areas while keeping compacted floors pale blue-grey. Fine ridges fade at distance; packed floors and wet margins suppress them. These changes are material detail, not extra collision ridges. The original imported Winter Expedition landscape and road remain static.

All six vehicle bodies receive narrow, opaque ceramic borders following their actual curved glazing. The borders leave the central panes open to the cabin and use a separate dark dielectric material rather than reflective body paint or chrome. The five shared body builders use the same bowed-glass perimeter calculation; the Urus's separate canopy and side-window surfaces have their own matching borders.

The Urus headlamps replace flat bright projector rectangles with six recessed reflector bowls and convex projector lenses inside the existing angular housings and outer covers. The Y-shaped light guides, open fascia intakes, bonnet apertures, carbon/paint boundaries and vehicle hardpoints remain. Manufacturer references include Lamborghini's [Urus Performante page](https://www.lamborghini.com/en-en/history/urus-performante) and [digital brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/gateway_urus/performante/2022/banner/pdf/2023/URUS%20PERFORMANCE_DIGITAL_BROCHURE_WCAG_EN.pdf). The model remains a procedural reference reconstruction with simplified fine surfacing, trim and interiors.

The source geometry audit checks all six bodies, normalized finite surfaces, open glazing, vents/grilles and wheel envelopes. The separate Urus audit retains 1,134 fascia probes and 90 bonnet probes. These complement native photographs and do not establish rendered quality by themselves. Vehicle dynamics, ruts, braking and suspension retain the previous implementation and are checked again in the new package.

## Native acceptance

The final package passes 676 native and 382 core checks, with 116 actually inspected current captures. Full-cook executable SHA-256: `0bdbf059543d6b837f99181207b1d0d12482a89627ca376476ac43eb7c65a51b`. See [validation-native.md](validation-native.md) for test counts, actual review, preservation, monitored rendering scope and remaining limits.

## Current native acceptance

The current body-contours-11 package passes 684 native checks and 382 core checks, with 124 current captures inspected. It retains the earlier terrain/rut work and the other four vehicle bodies while revising the Civic and Urus end contours and the Civic A-pillars. Executable SHA-256: `a1157c61c74428e5f301772de2a8be2afa048b38074d6d421dd122e1bfc8a077`. See [validation-native.md](validation-native.md) for current evidence and limits.
