# Vehicle impact damage

Pass 15 adds localized body deformation and mechanical impairment to all nine native vehicles. Real rigid-body object collisions and sufficiently hard body landings drive the damage calculation. Ordinary suspension forces and tire contact do not create damage. Body panels dent around the contact point; short paint scrapes or glass cracks supplement the deformation. A lamp section directly affected by an impact has reduced brake/reverse illumination while retaining its normal control behavior.

The garage footer provides **DAMAGE ON / FREE RUN**, **REPAIR VEHICLE**, and condition/drive/brake percentages. Turning damage off immediately repairs the vehicle and prevents later impacts from accumulating damage. Physical collisions still work in Free Run. **R** recovery preserves existing damage. **Backspace** repairs the vehicle and resets soil, matching the existing world-reset control. Selecting another vehicle starts that vehicle clean.

The global damage toggle is stored in the version 5 garage save. Older saves default to damage enabled. Dents, scars and individual vehicle damage are transient and are not serialized between sessions.

## Response and limits

Severity uses the collision impulse normal to the contacted surface, divided by the vehicle's actual physics mass. Thresholds are an equivalent normal change in velocity, not the vehicle's speedometer reading:

| Contact | Minimum normal change in velocity |
| --- | --- |
| Object impact | 4.0 mph (1.8 m/s internally) |
| Upright body striking terrain | 10.1 mph (4.5 m/s internally) |
| Side/roof striking terrain | 3.7 mph (1.65 m/s internally) |

These values and the severity curve are gameplay calibration, not real crash-safety ratings. Repeated nearby callbacks within 0.18 seconds are deduplicated. Frame/body protection upgrades reduce the response. Per-vertex cumulative displacement is capped at about 9.4 inches. Front, rear and underbody damage affect power or braking; asymmetric side damage adds a bounded steering pull. Remaining drive output is at least 30% and braking capacity at least 55%; roof-only damage does not automatically imply a damaged engine.

The original coachwork collision hulls remain intact. This is surface deformation with collision-driven mechanical effects, not a soft-body crash simulation. It does not detach components, simulate structural collapse, deform wheel/suspension collision, or alter collision hulls to follow dents.

## Runtime cost

Vehicle bodies are imported with CPU access to their cooked mesh buffers. On the first accepted impact, the game copies the active body's LOD 0 sections into a procedural renderer, preserving imported normals, UVs, section material indices and live lamp materials. This has a one-time allocation/copy cost for that vehicle's current damage session. Later impacts update only affected sections using linear vertex work; no geometry changes occur every frame. Repair releases copied mesh sections and restores the original static body.

The EarthCruiser's exported body has finer topology in its upper 6.7-inch roof assembly, with a 6.3-inch target edge length across the cap, solar-panel backing, faces and grid strips. The offline exporter added **63,974 vertices and 122,244 triangles**, within an 80,000-added-vertex export guard, and verified shared-edge closure with no unresolved marked edges. It preserves the original clean surface positions, UVs and material seams while allowing the closely spaced layers to follow the same dent. Refinement occurs during export; the damage renderer uses the prepared mesh on accepted impacts without a runtime subdivision step. This is topology preparation, not a frame-time or GPU-cost guarantee.

There are at most 16 small scar sections and no additional simulated fragments. Scars project onto the damaged panel's triangles; another dent removes overlapping old scars so they cannot remain suspended above a newly moved panel. Missing CPU data or failed extraction produces an explicit error/notice and prevents invisible mechanical damage from being applied.

## Validation

The current editor diagnostic compile succeeds, and `Tools/test-damage.cmd` passes 47 portable checks. Those cover contact thresholds, 10,000 resting contacts, duplicate callbacks, severity/protection, Free Run, region-specific impairment, saturation, invalid input and smooth dent falloff.

`Tools/verify-damage.ps1` runs the dedicated packaged `-TerraDamageOnly` suite. It requires **228 checks and 45 fresh native captures**, with real moving-body wall impacts, repeated impacts exercising the same active deformed mesh, disabled replays, gravity-driven roof landings, normal recovery retaining damage, and material/collision/vertex readback for all nine vehicles. Seven actual terrain transitions run with damage enabled to detect nuisance damage while retaining rolling momentum. G63 garage captures show damaged condition and the repaired Free Run state. These are automated state transitions and rendered UI checks, not a claim of mouse-click testing.

The wrapper isolates user settings, checks the executable hash and capture freshness, limits rendering to 20 FPS, and monitors GPU temperature with a 77°C cutoff. The ordinary terrain and drivetrain regression suites disable damage so their deliberate collisions cannot contaminate unrelated baselines. The dedicated suite is therefore required before claiming native damage verification.

The first packaged diagnostic (`damage-candidate1`) produced 219 checks and 45 captures: all collision, deformation, repair, Free Run and garage checks passed; seven terrain-crossing checks failed because their initial fixture poses were overwritten when physics resumed from the garage. The harness now applies those poses in a later phase, checks their measured position/heading, and retains the strict surface-crossing assertions. Full-resolution inspection confirmed visible front and roof deformation with preserved finishes across all nine vehicles.

That diagnostic measured a 100.6 ms median first-impact CPU cost, ranging from 42.5 to 158.4 ms across 18 impacts. Dense reserved vertex remapping and a single initial upload now replace per-index hash extraction and the redundant pristine-then-deformed upload. The new path preserves every section and vertex; the final measurements below do not establish a general latency improvement.

The final package passes all 228 damage checks and all 45 fresh captures were actually reviewed. Final accepted first-contact handler CPU samples are **78.535–319.474 ms, median 135.240 ms** across 18 wall/roof contacts; 9 cached second-wall contacts measure **19.975–79.557 ms, median 41.852 ms**. Candidate 1 measured 42.5–158.4 ms (median 100.6 ms). These are different candidates and controlled runs, so the final measurements do **not** demonstrate a general latency improvement. The EarthCruiser's final first-wall/roof samples are 78.535 / 87.488 ms, compared with 848.329 / 795.606 ms in the rejected runtime-subdivision diagnostic. That comparison supports avoiding that specific runtime refinement cost only. A noticeable one-time hitch remains possible, including the final 319.474 ms Urus roof sample. These are impact-handler CPU events, not whole-frame, continuous GPU or broad gameplay benchmarks. First damage still allocates/copies the active body; later accepted impacts update affected geometry, with at most sixteen scar sections. Exact executable/cook provenance, temperature limits and acceptance observations are recorded in [native validation](validation-native.md).
