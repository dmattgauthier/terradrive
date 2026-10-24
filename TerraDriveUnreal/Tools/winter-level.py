"""Prepare a driveable copy of Epic's complete Automotive Winter Scene.

Executed from import-assets.py after the native meshes/materials exist. The
acquired IceRoad and IceRoad_Lighting maps are never edited or saved. The
complete source map is the template, including all scenery and foliage.
Only the generated /Game/Maps/WinterExpedition map and project-owned collision
mesh copies are changed. No scenery is selected away, decimated or discarded.
"""
import hashlib
import json
import math
import os
import unreal

root = os.path.abspath(unreal.Paths.project_dir())
lib = unreal.EditorAssetLibrary
level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
actors_api = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
source_map = '/Game/AutomotiveWinterScene/Maps/IceRoad'
destination_map = '/Game/Maps/WinterExpedition'
source_lighting = '/Game/AutomotiveWinterScene/Maps/IceRoad_Lighting'
collision_directory = '/Game/WinterGameplay/Meshes'
source_map_files = [os.path.join(root, 'Content', 'AutomotiveWinterScene', 'Maps', name)
                    for name in ['IceRoad.umap', 'IceRoad_Lighting.umap']]
source_map_hashes = {os.path.basename(path): hashlib.sha256(open(path, 'rb').read()).hexdigest()
                     for path in source_map_files}


def xyz(value):
    return [round(float(value.x), 3), round(float(value.y), 3), round(float(value.z), 3)]


def vec(values):
    return unreal.Vector(*values)


def length(a, b):
    return math.sqrt(sum((a[i]-b[i])**2 for i in range(3)))


def transformed(component, local):
    transform = component.get_world_transform()
    return xyz(unreal.MathLibrary.transform_location(transform, local))


def surface_trace(world, point):
    # Use authored collision in the generated map. Dynamic native vehicles do
    # not exist during import, and the source HDRI dome has no collision.
    result = unreal.SystemLibrary.line_trace_single(world,
        unreal.Vector(point[0], point[1], point[2]+1500),
        unreal.Vector(point[0], point[1], point[2]-5000),
        unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, True, [],
        unreal.DrawDebugTrace.NONE, True)
    if isinstance(result, tuple):
        hit = next((value for value in result if isinstance(value, unreal.HitResult)), None)
        success = any(value is True for value in result)
    else:
        hit, success = result, result is not None
    if success and hit is not None:
        try:
            return xyz(hit.impact_point)
        except Exception:
            pass
    return point


if not lib.does_asset_exist(source_map):
    raise RuntimeError('Automotive Winter Scene IceRoad must be installed to prepare the full winter level')
if lib.does_asset_exist(destination_map):
    if not level.load_level(destination_map):
        raise RuntimeError('Could not load generated WinterExpedition map')
else:
    if not level.new_level_from_template(destination_map, source_map):
        raise RuntimeError('Could not copy the complete IceRoad map as WinterExpedition')

world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
settings = world.get_world_settings()
settings.set_editor_property('default_game_mode', unreal.load_class(None, '/Script/TerraDrive.TerraGameMode'))
settings.set_editor_property('kill_z', -100000.)
all_actors = actors_api.get_all_level_actors()
scene_actors = [actor for actor in all_actors if actor.get_outer().get_outer().get_path_name().startswith(destination_map)]
landscapes = [actor for actor in scene_actors if 'Landscape' in actor.get_class().get_name()]
if len(landscapes) != 1:
    raise RuntimeError('Expected the original complete IceRoad landscape, found %d' % len(landscapes))
center, extent = landscapes[0].get_actor_bounds(False)
bounds_min = [center.x-extent.x, center.y-extent.y, center.z-extent.z]
bounds_max = [center.x+extent.x, center.y+extent.y, center.z+extent.z]
road_segments = []
collision_meshes = {}
collision_components = 0
foliage_instances = 0
wind_visual_components = 0

for actor in scene_actors:
    for component in actor.get_components_by_class(unreal.StaticMeshComponent):
        mesh = component.get_editor_property('static_mesh')
        if not mesh:
            continue
        original_path = lib.get_metadata_tag(mesh, 'TerraWinterSourceMesh') or mesh.get_path_name()
        identity = original_path.lower()
        if isinstance(component, unreal.InstancedStaticMeshComponent):
            foliage_instances += component.get_instance_count()
        road = '/road_' in identity
        solid = road or any(token in identity for token in
            ['rock_', 'quarry_', 'outcrop_', 'ice_cliff_', 'stone_wall',
             'guardrail_', '/fence_', 'electric_pole', '/plastic_pole'])
        if solid:
            destination_mesh = collision_directory + '/' + mesh.get_name()
            if original_path.startswith(collision_directory):
                copied = mesh
            elif original_path in collision_meshes:
                copied = collision_meshes[original_path]
            else:
                copied = lib.load_asset(destination_mesh) if lib.does_asset_exist(destination_mesh) else lib.duplicate_asset(original_path, destination_mesh)
                if not copied:
                    raise RuntimeError('Could not make gameplay collision mesh for ' + original_path)
                body = copied.get_editor_property('body_setup')
                if not body:
                    raise RuntimeError('No body setup for ' + destination_mesh)
                body.set_editor_property('collision_trace_flag', unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
                body.set_editor_property('double_sided_geometry', True)
                lib.set_metadata_tag(copied, 'TerraWinterSourceMesh', original_path)
                lib.set_metadata_tag(copied, 'TerraWinterCollisionRevision', '1')
                lib.save_loaded_asset(copied)
                collision_meshes[original_path] = copied
            component.set_static_mesh(copied)
            component.set_collision_profile_name('BlockAll')
            component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
            component.set_editor_property('component_tags', list(set(list(component.get_editor_property('component_tags')) + [unreal.Name('TerraWinterTerrain' if road else 'TerraRock')])))
            collision_components += 1
        # Painted snow clumps remain intact decorative snow. They must not
        # behave as concrete blocks under a tire or snag the chassis.
        if '/snow_chunks/' in identity or '/vegetation/' in identity:
            component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        if '/automotivewinterscene/fx/wind/' in identity:
            # Preserve every animated wind/snow card while removing its
            # inherited collision, which sits above the real road surface.
            component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
            wind_visual_components += 1
        if road and isinstance(component, unreal.SplineMeshComponent):
            a = transformed(component, component.get_start_position())
            b = transformed(component, component.get_end_position())
            if length(a, b) > 10:
                road_segments.append({'start': a, 'end': b, 'component': component.get_path_name()})

# Reconstruct the authored continuous road from its spline segments. The
# northern end is the entry; every connected segment is preserved in the map.
# Turnout branches may be explored even when they are outside this main route.
if not road_segments:
    raise RuntimeError('The full IceRoad scene has no authored road spline mesh segments')
remaining = road_segments[:]
start_segment = max(remaining, key=lambda segment: max(segment['start'][1], segment['end'][1]))
current = max([start_segment['start'], start_segment['end']], key=lambda p: p[1])
route = [current]
ordered_segments = []
while remaining:
    choices = [(length(current, segment[endpoint]), index, endpoint)
               for index, segment in enumerate(remaining) for endpoint in ['start', 'end']]
    gap, index, endpoint = min(choices)
    if gap > 1800 and ordered_segments:
        break
    segment = remaining.pop(index)
    other = 'end' if endpoint == 'start' else 'start'
    if gap > 20:
        route.append(segment[endpoint])
    route.append(segment[other])
    ordered_segments.append(segment)
    current = segment[other]
route = [surface_trace(world, point) for point in route]

# Start slightly along the road rather than at an open mesh end. Additional
# scenic starts are drawn from the same authored road and keep its local yaw.
def scenic_spawn(fraction, name):
    distances = [length(route[i-1], route[i]) for i in range(1, len(route))]
    wanted = sum(distances)*fraction
    travelled = 0.
    for index, distance in enumerate(distances):
        if travelled+distance >= wanted:
            t = (wanted-travelled)/distance
            a, b = route[index], route[index+1]
            p = [a[i]+(b[i]-a[i])*t for i in range(3)]
            p = surface_trace(world, p)
            yaw = math.degrees(math.atan2(b[1]-a[1], b[0]-a[0]))
            return {'name': name, 'position': p, 'yaw': yaw}
        travelled += distance
    raise RuntimeError('Could not choose winter road spawn')

spawns = [scenic_spawn(.015, 'Ice Road / north approach'),
          scenic_spawn(.34, 'Ice Road / frozen coast'),
          scenic_spawn(.67, 'Ice Road / quarry bends'),
          scenic_spawn(.94, 'Ice Road / south approach')]
spawns[3]['yaw'] = (spawns[3]['yaw']+180)%360

# Ensure authored lighting loads in the packaged destination, independent of
# editor visibility flags inherited from the sample map.
lighting = unreal.GameplayStatics.get_streaming_level(world, unreal.Name(source_lighting))
if lighting:
    if not isinstance(lighting, unreal.LevelStreamingAlwaysLoaded):
        if not unreal.EditorLevelUtils.remove_level_from_world(lighting.get_loaded_level()):
            raise RuntimeError('Could not replace generated map lighting reference with always-loaded streaming')
        lighting = unreal.EditorLevelUtils.add_level_to_world(world, source_lighting, unreal.LevelStreamingAlwaysLoaded)
else:
    lighting = unreal.EditorLevelUtils.add_level_to_world(world, source_lighting, unreal.LevelStreamingAlwaysLoaded)
if not lighting:
    raise RuntimeError('Unable to retain the complete authored IceRoad_Lighting sublevel')
# AlwaysLoaded::ShouldBeLoaded() is always true and its native constructor
# sets visibility true. BlueprintSetter-only C++ functions are exposed as
# properties rather than callable Python methods, so no setter call is needed.

player_starts = [actor for actor in scene_actors if isinstance(actor, unreal.PlayerStart)]
start = player_starts[0] if player_starts else actors_api.spawn_actor_from_class(unreal.PlayerStart,
    vec([spawns[0]['position'][0], spawns[0]['position'][1], spawns[0]['position'][2]+300]))
start.set_actor_label('TerraWinterPlayerStart')
start.set_actor_rotation(unreal.Rotator(0, spawns[0]['yaw'], 0), False)

manifest = {'version': 1, 'map': destination_map, 'sourceMap': source_map,
            'lightingMap': source_lighting, 'completeAuthoredScene': True,
            'sourceSceneActorCount': len(scene_actors), 'totalActorCount': len(all_actors),
            'foliageInstances': foliage_instances, 'collisionComponents': collision_components,
            'nonCollidingWindVisuals': wind_visual_components,
            'collisionMeshCopies': len(collision_meshes),
            'boundsMin': bounds_min, 'boundsMax': bounds_max, 'spawns': spawns,
            'roadSegmentCount': len(road_segments), 'mainRoadSegmentCount': len(ordered_segments),
            'roadLengthCM': sum(length(route[i-1], route[i]) for i in range(1, len(route))),
            'roadRoute': route[1:], 'authoredRoadSegments': road_segments,
            'originalAssetsModified': False,
            'deformation': 'Native proving-ground snow is deformable. The complete authored winter landscape retains its original collision and materials.'}
signature = hashlib.sha256(open(os.path.join(root, 'Tools', 'winter-level.py'), 'rb').read()).hexdigest()
lib.set_metadata_tag(world, 'TerraWinterRecipe', signature)
if not level.save_current_level():
    raise RuntimeError('Could not save the complete generated WinterExpedition map')
after_source_hashes = {os.path.basename(path): hashlib.sha256(open(path, 'rb').read()).hexdigest()
                       for path in source_map_files}
if after_source_hashes != source_map_hashes:
    raise RuntimeError('An acquired original winter map changed during preparation')
manifest['originalMapSHA256'] = source_map_hashes
os.makedirs(os.path.join(root, 'Content', 'NativeData'), exist_ok=True)
os.makedirs(os.path.join(root, 'Saved'), exist_ok=True)
for output in [os.path.join(root, 'Content', 'NativeData', 'winter-level.json'),
               os.path.join(root, 'Saved', 'winter-level-preparation.json')]:
    with open(output, 'w', encoding='utf8') as stream:
        json.dump(manifest, stream, indent=2)
unreal.log('TERRA_WINTER_LEVEL_COMPLETE actors=%d foliage=%d collision=%d roadSegments=%d roadFeet=%.0f' %
           (len(scene_actors), foliage_instances, collision_components, len(road_segments), manifest['roadLengthCM']/30.48))
