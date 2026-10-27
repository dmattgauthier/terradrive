# Rollover contact and coachwork pass 12

The Sprinter's outer rear cabin could enter the ground after rolling onto its
side. The former cabin collision box covered only part of the rendered width,
height and length. The visible body had no physical collision of its own.

Each vehicle now receives twelve overlapping convex collision sections derived
from its exact exported opaque coachwork. These are welded into the simulated
chassis. The existing raised approach/departure undertray, mass, centre of mass
and low-friction contact material remain in use. A stale or missing mesh/data
match is reported as an error. There is no scripted lifting or velocity reset
during a rollover.

Garage selection prepares these parts while chassis simulation is paused.
Closing the garage refreshes their welded state and restores the configured
mass and centre of mass before driving resumes. Every rollover fixture uses
that same garage selection/upgrade/return path before its drop, and checks the
actual welded body rather than relying only on a cached readiness flag.
The fixture lets activation settle before placing the drop and requires an
observed physical tipped pose, so an upright trial cannot count as rollover
evidence.

`Tools/bake-coachwork-collision.mjs` generates
`Content/NativeData/vehicle-collision.json` after source export. The normal
`Tools/build-native.ps1 -ImportAssets -Package` workflow builds this file beside
the lower-body ground probes and stages both with the game. Mesh SHA-256 values
must agree before collision can be used.

The source model pass develops the broad surfaces and their attached seams,
glass and trim together. Wheel hardpoints and the original browser model
implementation are preserved.

| Vehicle | Revisions in this pass |
| --- | --- |
| Wrangler Rubicon | Upper door pressing, tucked lower door, rolled rear corner, dished fog reflectors and domed lens covers. |
| Bronco Badlands | Rear wheel haunch, folded belt highlight, tucked rocker and a flatter bonnet section around its central plateau. |
| Civic Sport | Drawn rear quarter, less square nose/trunk corner returns and a shallow lower door contour. The straight A-pillar edges and seal alignment are preserved. |
| Sprinter 2500 Crew | Rear roof/cabin taper, bowed front cabin surface, waist draw and a more defined short bonnet stamping. |
| HUMMER EV SUV | Rear haunch and closure returns, lower door draw and a restrained central bonnet section between the twin crests. |
| Urus Performante | Fuller rear shoulder, single shallow lower door draw, tucked rear greenhouse, more wrapped front fascia and a stronger hatch fold. |

Reference review uses front, side, rear and oblique views. Primary references
include the [2024 Wrangler gallery](https://www.jeep.com/am/en/wrangler/gallery.html),
the [Ford Bronco brochure](https://www.ford.mx/content/dam/Ford/website-assets/latam/mx/nameplate/bronco/2023/pdf/ford-bronco-2023-catalogo-descargable.pdf),
the [Honda Civic press kit](https://hondanews.com/en-US/releases/release-53541be6030b25a47a2899aba12aa1f6-2022-honda-civic-sedan-press-kit),
the [2016 Sprinter Crew brochure](https://assets.mbvans.com/Mercedes-Benz-Vans/Brochures/Mercedes-Benz-Sprinter-Crew-Van.pdf),
the [2024 GMC SUV brochure](https://www.gmc.com/content/dam/gmc/na/us/english/index/about/download-brochures/2024-models/GMTH23CT000-2024-HUMMER-EV-SUV-FO-031924.pdf),
and the [original V8 Urus Performante](https://www.lamborghini.com/en-en/history/urus-performante).
The 2023 Bronco and 2022 Civic references share the modeled 2024 body generation;
other trims' wheels, accessories and powertrains are not copied. The Sprinter
retains the 144-inch wheelbase and standard roof. Urus references concern the
original V8 Performante, not a later hybrid.

Native review now supplies ten views for every model: front, side, rear, three
oblique views, bonnet, rear closure, pillar/side detail and overhead. Run
`Tools/verify-winter.ps1 -Mode Art`. Run `Tools/verify-rollover.ps1` for the
forty side, roof and partial-roll cases on pavement and Pine Ridge, including
recovery and disabled tipped-wheel drive. `-Quick` limits this to ten Sprinter
cases. Loose fixture data and the legacy-proxy option are diagnostic switches;
normal acceptance requires the collision data from the packaged content.

The short coasting fixtures use a fixed 20 Hz test clock so rendering stalls
cannot remove the required observation frames. Player driving keeps its normal
clock. Native verification stays capped and retains the 77 C GPU cutoff.

These remain original procedural reconstructions. The changes improve physical
form and contact but do not establish OEM/CAD accuracy or production racing-game
asset quality. Final native results and limitations are recorded in
[validation-native.md](validation-native.md).

## Native acceptance

The current full Windows package passes 1,021 native and 382 core checks, with 180 actually reviewed current captures. Executable SHA-256: `449198103240594d632968c382393523a8c3ae9454fd283e3762fbdfacc43a9c`. See [validation-native.md](validation-native.md) for provenance, scope, preservation and limitations.
