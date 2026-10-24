# Complete Automotive Winter Scene destination

The garage's **Winter Expedition** destination and the **0** key travel to
`/Game/Maps/WinterExpedition`. The same control returns to the proving ground.
Vehicle selection, all six upgrade builds, tire pressure and track selection
carry across map travel. Travel saves the player's garage before leaving;
automated verification uses its isolated garage instead.

This destination is prepared from the **complete** acquired
`/Game/AutomotiveWinterScene/Maps/IceRoad` map, including its original
`IceRoad_Lighting` sublevel. The surveyed source has one landscape, 460 static
mesh actors, 18 cinematic cameras and 10,646 foliage/snow-clump instances.
The preparation recipe retains every scenery actor and instance. It does not
replace the authored landscape with the procedural proving-ground terrain.

`Tools/winter-level.py` makes a project-owned map with
`LevelEditorSubsystem.new_level_from_template`, creates four starts on the
authored road and reconstructs its main driving route from road spline meshes.
The acquired source maps remain unchanged. Solid roads, rocks, walls, fences
and barriers receive project-owned mesh copies with cooked triangle collision.
Decorative snow chunks and small vegetation do not act as concrete obstacles.
The authored animated wind/snow cards remain visible. Runtime disables their
collision; the preparation recipe also disables it in regenerated maps. Native diagnostics
found these visual-effect sheets above valid road collision; they must not
become tire support or catch the vehicle body. The acquired wind mesh asset
and original maps remain unchanged.

`TerraWinter` adapts the existing native vehicle to the authored scene's actual
static collision. Its tire support, surface sampling, recovery bounds and
spawn headings use this map. The snow-covered road uses packed-snow traction;
an asset called “road” is not assigned dry asphalt grip. Ice, exposed rock and
soft snow have distinct traction and rolling resistance.

The complete authored landscape keeps its original materials and collision.
Physical excavation/rut meshes are enabled in the native proving ground's
deformable terrain; they are not laid invisibly underneath the acquired winter
landscape. The complete winter destination currently does not excavate that
original landscape.

After installing Automotive Winter Scene into this project, run the ordinary
native asset import and a full cook. The recipe creates the generated map and
`Content/NativeData/winter-level.json`. The packaging configuration includes
the generated destination, its original lighting dependency and project-owned
collision meshes. Raw acquired assets and generated binary content are not
uploaded to the public source repository.

The native `-TerraValidate -TerraWinterOnly -TerraCapture` test starts on the
proving ground, travels into the complete winter level, checks retained scene
content, exercises tire support, acceleration and braking at four starts, takes
six scene images, and returns through real map travel while checking the saved
vehicle build and pressure. It also queries the finite tire footprint at every
internal road join, with nine positions spread 11.8 inches fore/aft and 23.6
inches across the road. The 49 internal joins produce 441 probes; all
must hit finite packed-snow road support. A hit on the landscape beneath a
missing road seam does not satisfy this check. These are contact queries and
four short driving trials; they do not claim a continuous drive of the whole
winter road. The 46 checks must run through the temperature-monitored
verification wrapper with the existing 20 FPS test limit.
