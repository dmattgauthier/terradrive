# Fidelity pass 10: continuous Urus panels and meadow scale

This round develops the Urus side body and the scale of the proving-ground meadow. It retains the other five vehicle bodies, the previous glazing/optical work, physical soil solver, vehicle hardpoints and original acquired winter maps.

The Urus side sheet now uses a grid at fixed physical heights. The older grid followed the wheel arches upward, which put narrow shoulder and handle features on diagonal rows and produced pinched highlights. The new surface has a broader continuous door section, a clearer upper shoulder and shallower handle recesses. Seams, handles, side glazing and fender trim follow the same revised surface. Intake and bonnet apertures remain open. The design comparison uses Lamborghini's [V8 Urus Performante page](https://www.lamborghini.com/en-en/history/urus-performante) and [official brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/gateway_urus/performante/2022/banner/pdf/2023/URUS%20PERFORMANCE_DIGITAL_BROCHURE_WCAG_EN.pdf), especially its front-quarter door/shoulder views. Reference photographs remain local review material and are excluded from source publication.

MW meadow grass now uses more, smaller tufts with height variation independent of their footprint. Scanned sorrel groups use fewer overlapping plants at a smaller scale. This separates the low meadow from shrub-sized masses. Ground color shifts toward a less saturated olive green while retaining the photographic dirt, leafy grass, stones, root and dry-growth layers. All non-grass Fab formations, solid scanned obstacles, cleared routes and terrain heights are checked against the previous accepted data.

The Urus source vertex count increases from 741,537 to 789,687, including its other assembled parts. That is about 6.5% more vertices for this vehicle; it is a fidelity tradeoff, not a geometry optimization. Changes to grass instance counts and shape can affect rendering cost. Capped native checks retain the 77°C cutoff and report measured workload rather than promising improved GPU performance.

The winter verification camera now frames the coast from above actual scene collision instead of placing the eye inside a snowbank. This changes a test capture, not the authored winter scene or player camera controls.

These remain procedural reference-built vehicles. Fine surfacing, trim and interiors still need work, and the other five body meshes retain their earlier geometry. Winter Expedition's authored landscape remains static. Current package and rendered-review evidence is recorded in [validation-native.md](validation-native.md).

## Native acceptance

The final Windows package passes 676 native and 382 core checks, with 116 actually reviewed current captures. Executable SHA-256: `f5b5fee6e4eb8f635f0d945e03d407479bb6a622ba8bb7860a3ac68b145b86cf`. See [validation-native.md](validation-native.md) for current package provenance, rendering scope, preservation and limitations.
