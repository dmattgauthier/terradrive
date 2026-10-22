# Vehicle surfacing, circular loop and acquired scenery

This native-only round preserves the browser tree and player's garage save. All six vehicles retain their mechanical tuning, suspension hardpoints and upgrades. The models remain authored reference-based approximations, not manufacturer CAD or scans.

## Urus Performante

The old extrusion and rectangular nose are replaced by `Tools/urus-body.mjs`: compound width/shoulder stations, crowned bonnet/roof, rising beltline, tapered quarter glazing, drawn door skins, broad rear haunches, curved carbon arch extensions and open wheel houses. Separate concave intakes cut into a wrapped fascia have carbon reveals and recessed louvres. A curved rear fascia, Y lamps, clear reverse emitters, diffuser, paired titanium-colour outlets and anchored roof spoiler complete the exterior.

The original V8 Performante's brochure dimensions are 202.24 inches long, 79.76 inches wide without mirrors, 63.70 inches tall and 118.34 inches between axles. Bonnet, glass and shoulder landmarks are estimated from manufacturer front/rear/quarter photographs, not surveyed. No SE hybrid styling is substituted. Primary sources are [Lamborghini's Performante page](https://www.lamborghini.com/en-en/history/urus-performante), [original introduction](https://www.lamborghini.com/en-en/news/lamborghini-urus-performante-for-bar-raisers-only) and its 2024 digital brochure. Brochure pages 1–8, 11, 13, 15–16 and 27 were inspected; local research copies under Saved are excluded from publication. The former brochure URL now redirects.

## Other bodies

`Tools/body-refinement.mjs` continuously refines the five existing detailed bodies. Jeep retains its narrow bonnet/upright cabin; Bronco its broad bonnet/shallow shoulder; Civic gains roof curvature and rear-quarter fullness; W906 Sprinter tapers into its standard roof; HUMMER keeps its bluff hood/chamfered arches. Door crown, lower stampings, bonnet crown and cabin taper vary by model. Glass, seams, handles and trim follow the same mapping. Inverse-transpose Jacobian normals preserve reflections; wheel geometry/hardpoints stay separate.

Maximum local changes are about 0.75 inches (Wrangler), 1.11 (Bronco), 0.69 (Civic), 1.48 (Sprinter) and 1.45 (HUMMER). This is a surface refinement of those bodies. Exact trim decisions/references remain in [vehicle-model-research.md](vehicle-model-research.md). Primary shape references include [Jeep MY24](https://www.media.stellantis.com/uk-en/jeep/press/jeep-reveals-new-2024-wrangler), [Honda MY24](https://www.hondainfocenter.com/2024/Civic-Sedan/), [GMC's SUV brochure](https://www.gmc.com/content/dam/gmc/na/us/english/index/about/download-brochures/2024-models/GMTH23CT000-2024-HUMMER-EV-SUV-FO-031924.pdf), [Ford's catalogue](https://www.ford.mx/content/dam/Ford/website-assets/latam/mx/nameplate/bronco/2024/pdf/ford-bronco-2024-catalogo-descargable.pdf) and [Mercedes-Benz Crew brochure](https://assets.mbvans.com/Mercedes-Benz-Vans/Brochures/Mercedes-Benz-Sprinter-Crew-Van.pdf).

## Circular loop

The preserved browser generator deliberately uses an egg: a 72.2-foot longitudinal radius with a second harmonic against a 65.6-foot vertical radius. The native fork now uses equal 65.6-foot radii, no harmonic and a 131.2-foot circular side elevation. A smooth 45.9-foot lateral shift separates entrance and exit. Visual/collision decks, supports and crossmembers use the same new curve. Tire/inverted fixtures follow it. The browser course is untouched.

## Acquired Fab scenery

Eight meshes from the player's acquired **African Slate Quarry / Quixel Megascans** pack provide 282 slate outcrop, ledge, boulder and rubble instances around foothills and Granite Trials. Base colour, normal and roughness maps are imported with DirectX normal settings. Bounds establish the ground pivot. Native terrain triangle heights handle distant streamed ground; collision traces override them for the raised quarry approaches/courses. The placement aligns the slope and embeds each scanned base according to its type/height. Seeded yaw/scale and distance culling vary placements. Solid meshes have collision; driving corridors and spawns stay reserved.

Download the medium FBX pack through your own Epic library. `Tools/import-fab.py` reads its default extracted Epic cache directory, or `TERRA_FAB_CACHE`. Asset IDs/placement recipes are public in `Tools/fab-scenery.json`. If absent at export the optional scenery is disabled. Enabled-but-missing source assets fail import with instructions; missing cooked assets are diagnosed at runtime.

Raw Fab files remain in Epic's cache; generated Content/builds remain local. They are excluded from the source upload, following [Fab's terms](https://www.fab.com/eula?lang=en) for incorporated project use and restrictions on standalone asset redistribution. Automotive Winter Scene and Electric Dreams Env are not included.

Final native checks and rendered observations are in [validation-native.md](validation-native.md). Export checks cover independent circularity, finite geometry and body metadata. Numerical checks do not establish exact visual accuracy.
