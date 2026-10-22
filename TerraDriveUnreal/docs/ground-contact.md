# Firm-ground tire support correction

October 22, 2026. Investigated after a HUMMER screenshot on Axlebreaker showed the vehicle leaning with wheels buried in a firm surface.

## Reproduced defect

The original suspension used a sphere sweep for rigid scenery and an analytic support query for deformable ground. A sphere can touch the side of a ledge beyond the real tire width. Rejecting that side contact is necessary, but the previous code could then discard rigid support altogether, even with real rock beneath the tread. Initial-overlap hits were also discarded without looking for a valid tread surface. The analytic ground underneath the raised rock course could not replace the missing rock contact.

A new native regression probes the actual cooked Axlebreaker mesh from X=12800 to 14600 cm, at three lateral positions, three roll angles and three suspension distances. It requires more than 900 tested poses and no missing rigid support. Before the fix it recorded **84 missing contacts**. With the correction it records **zero**. The original failed report/log are retained privately in `Saved/BeforeGroundContact`; failed evidence is not counted as a pass.

## Correction

The sphere query remains the fast initial test. When it encounters rigid geometry but cannot supply a valid finite-width contact, the solver traces 15 points on a cylindrical rolling envelope: five positions along the tire arc and three across its tread. Each accepted contact must lie on actual geometry, face the suspension and remain inside the existing suspension query range. It does not obtain support from rocks outside the tread or extend the suspension to distant ground. Analytic support and deformation for soft ground remain in place.

## Native regression

Run `Tools/verify-native.ps1 -GroundOnly` after packaging. It caps the focused game at 20 FPS and requires a fresh report, clean mesh/render diagnostics, all 19 checks passing and successful process exit. The full verifier includes these checks too.

The focused run passed **19/19**: the rock-contact grid plus each of the six stock vehicles settling after a banked compression, retaining at least three loaded rigid contacts, keeping tires above the hard floor, and reversing more than 4.9 feet out of the test position. The HUMMER's actual native capture was inspected. The six compression/reverse tests use a flat approach near the first gate; they do not establish traversal of the entire Axlebreaker course. The contact grid exercises the uneven ledge surfaces separately.

This closes a reproduced wheel-support failure. It is not a claim that every possible snag, high-center situation or terrain collision issue has been eliminated. High-centering on real ledges and traction limitations from open axles are still part of the off-road simulation. `R` remains the recovery/restart control. Full current verification and executable hashes are in [validation-native.md](validation-native.md) and [native-validation.json](native-validation.json).

The browser source and current player garage are preserved. No mesh, material or terrain geometry was changed in this correction. The separate [vehicle-art production plan](vehicle-art-production.md) addresses the remaining visual-quality gap.
