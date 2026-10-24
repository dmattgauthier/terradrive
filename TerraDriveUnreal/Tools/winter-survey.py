"""Read-only commandlet survey of the complete acquired winter scene.

Run this by itself through UnrealEditor-Cmd -run=pythonscript.  No asset is
created, changed or saved.  The only output is a JSON report in Saved/.
"""
import collections
import json
import os
import unreal

root = os.path.abspath(unreal.Paths.project_dir())
lib = unreal.EditorAssetLibrary
level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
actors_api = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
registry = unreal.AssetRegistryHelpers.get_asset_registry()
report = {"sourceMap": "/Game/AutomotiveWinterScene/Maps/IceRoad", "maps": [],
          "actors": [], "textures": [], "errors": []}


def xyz(value):
    return [round(float(value.x), 3), round(float(value.y), 3), round(float(value.z), 3)]


def prop(obj, key, default=None):
    try:
        value = obj.get_editor_property(key)
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        if isinstance(value, unreal.Object):
            return value.get_path_name()
        return str(value)
    except Exception:
        return default


for path in lib.list_assets('/Game/AutomotiveWinterScene', recursive=True, include_folder=False):
    if path.endswith('.IceRoad') or path.endswith('.IceRoad_Lighting'):
        report['maps'].append(path)
    if '/Megascans/Surfaces/' in path or '/Textures/Ground/' in path:
        obj = lib.load_asset(path)
        if isinstance(obj, unreal.Texture2D):
            record = {'path': path}
            for key in ['srgb', 'compression_settings', 'lod_group', 'lod_bias',
                        'max_texture_size', 'never_stream', 'virtual_texture_streaming']:
                record[key] = prop(obj, key)
            try:
                record['size'] = [unreal.TextureBlueprintLibrary.texture_get_size_x(obj),
                                  unreal.TextureBlueprintLibrary.texture_get_size_y(obj)]
            except Exception:
                try:
                    record['size'] = [obj.blueprint_get_size_x(), obj.blueprint_get_size_y()]
                except Exception:
                    pass
            report['textures'].append(record)

options = unreal.AssetRegistryDependencyOptions(include_soft_package_references=True,
    include_hard_package_references=True, include_searchable_names=False,
    include_soft_management_references=False, include_hard_management_references=False)
for map_path in report['maps']:
    package = map_path.split('.')[0]
    report.setdefault('dependencies', {})[package] = [str(v) for v in registry.get_dependencies(package, options)]

if not level.load_level(report['sourceMap']):
    raise RuntimeError('Unable to read full Automotive Winter Scene IceRoad map')
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
try:
    settings = world.get_world_settings()
    report['worldSettings'] = {key: prop(settings, key) for key in
        ['default_game_mode', 'world_to_meters', 'kill_z', 'enable_world_bounds_checks',
         'enable_world_composition', 'world_partition']}
except Exception as error:
    report['errors'].append('world settings: ' + str(error))
try:
    report['levels'] = [v.get_path_name() for v in unreal.EditorLevelUtils.get_levels(world)]
except Exception as error:
    report['errors'].append('levels: ' + str(error))
try:
    report['streamingLevels'] = [v.get_path_name() for v in world.get_editor_property('streaming_levels')]
except Exception as error:
    report['errors'].append('streaming levels: ' + str(error))

counts = collections.Counter()
for actor in actors_api.get_all_level_actors():
    name = actor.get_class().get_name()
    counts[name] += 1
    record = {'path': actor.get_path_name(), 'label': actor.get_actor_label(),
              'class': name, 'position': xyz(actor.get_actor_location()),
              'yaw': round(float(actor.get_actor_rotation().yaw), 3),
              'scale': xyz(actor.get_actor_scale3d()), 'components': []}
    try:
        center, extent = actor.get_actor_bounds(False)
        record['boundsCenter'], record['boundsExtent'] = xyz(center), xyz(extent)
    except Exception:
        pass
    for component in actor.get_components_by_class(unreal.SceneComponent):
        component_type = component.get_class().get_name()
        if not (isinstance(component, unreal.StaticMeshComponent) or
                isinstance(component, unreal.SplineComponent) or
                isinstance(component, unreal.LightComponent) or
                'Landscape' in component_type or 'PostProcess' in component_type):
            continue
        info = {'name': component.get_name(), 'class': component_type}
        for key in ['static_mesh', 'collision_enabled', 'collision_profile_name',
                    'cast_shadow', 'max_draw_distance', 'forced_lod_model',
                    'enable_density_scaling', 'intensity', 'mobility',
                    'landscape_material', 'component_size_quads', 'num_subsections']:
            value = prop(component, key)
            if value is not None:
                info[key] = value
        if isinstance(component, unreal.StaticMeshComponent):
            info['materials'] = [m.get_path_name() if m else None for m in component.get_materials()]
            if isinstance(component, unreal.InstancedStaticMeshComponent):
                info['instanceCount'] = component.get_instance_count()
        if isinstance(component, unreal.SplineComponent):
            n = component.get_number_of_spline_points()
            info['points'] = [xyz(component.get_location_at_spline_point(i, unreal.SplineCoordinateSpace.WORLD)) for i in range(n)]
            info['length'] = component.get_spline_length()
        record['components'].append(info)
    if 'Landscape' in name:
        record['landscape'] = {key: prop(actor, key) for key in
            ['landscape_material', 'component_size_quads', 'num_subsections',
             'subsection_size_quads', 'collision_mip_level', 'simple_collision_mip_level']}
    report['actors'].append(record)

report['actorClassCounts'] = dict(sorted(counts.items()))
report['actorCount'] = len(report['actors'])
os.makedirs(os.path.join(root, 'Saved'), exist_ok=True)
destination = os.path.join(root, 'Saved', 'winter-scene-survey.json')
with open(destination, 'w', encoding='utf8') as stream:
    json.dump(report, stream, indent=2)
unreal.log('TERRA_WINTER_SURVEY_COMPLETE actors=%d report=%s' % (report['actorCount'], destination))
