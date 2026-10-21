"""Import source-derived geometry/materials with Unreal Editor's Python commandlet."""
import hashlib
import json
import os
import unreal

root = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
source = os.path.join(root, 'SourceAssets')
texture_root = os.path.join(root, '..', 'TerraDrive-v1.13', 'dist', 'assets', 'terrain')
with open(os.path.join(source, 'import.json'), encoding='utf8') as stream:
    data = json.load(stream)
tools = unreal.AssetToolsHelpers.get_asset_tools()
edit = unreal.MaterialEditingLibrary
lib = unreal.EditorAssetLibrary

def load_texture(filename, mask=False):
    if not filename:
        return None
    dest = '/Game/Textures/' + os.path.splitext(os.path.basename(filename))[0]
    texture = lib.load_asset(dest) if lib.does_asset_exist(dest) else None
    if texture is None:
        task = unreal.AssetImportTask()
        task.filename = os.path.join(texture_root, filename)
        task.destination_path = '/Game/Textures'
        task.automated = True
        task.save = True
        tools.import_asset_tasks([task])
        if not task.imported_object_paths:
            raise RuntimeError('Texture import failed: ' + filename)
        texture = lib.load_asset(task.imported_object_paths[0])
    if mask:
        texture.set_editor_property('srgb', False)
        lib.save_loaded_asset(texture)
    return texture

def material(name, color, roughness=.8, metallic=0, opacity=1,
             sky=False, texture=None, alpha=None, clip=.38):
    dest = '/Game/Materials/' + name
    signature = hashlib.sha256(json.dumps([
        3, color, roughness, metallic, opacity, sky,
        texture.get_path_name() if texture else None,
        alpha.get_path_name() if alpha else None, clip
    ]).encode()).hexdigest()
    if lib.does_asset_exist(dest):
        m = lib.load_asset(dest)
        if lib.get_metadata_tag(m, 'TerraMaterialSignature') == signature:
            return m
        edit.delete_all_material_expressions(m)
    else:
        m = tools.create_asset(name, '/Game/Materials', unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property('two_sided', True)
    m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_OPAQUE)
    c = edit.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -500, 0)
    c.set_editor_property('constant', unreal.LinearColor(*color, 1))
    output = c
    if texture:
        t = edit.create_material_expression(m, unreal.MaterialExpressionTextureSample, -500, 160)
        t.set_editor_property('texture', texture)
        mul = edit.create_material_expression(m, unreal.MaterialExpressionMultiply, -200, 80)
        edit.connect_material_expressions(t, 'RGB', mul, 'A')
        edit.connect_material_expressions(c, '', mul, 'B')
        output = mul
    edit.connect_material_property(output, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR if sky else unreal.MaterialProperty.MP_BASE_COLOR)
    for prop, value in [(unreal.MaterialProperty.MP_ROUGHNESS, roughness), (unreal.MaterialProperty.MP_METALLIC, metallic)]:
        node = edit.create_material_expression(m, unreal.MaterialExpressionConstant, -180, 280)
        node.set_editor_property('r', value)
        edit.connect_material_property(node, '', prop)
    if sky:
        m.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
        m.set_editor_property('is_sky', True)
    if alpha:
        m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
        m.set_editor_property('opacity_mask_clip_value', clip)
        mask = edit.create_material_expression(m, unreal.MaterialExpressionTextureSample, -500, 450)
        mask.set_editor_property('texture', alpha)
        mask.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        edit.connect_material_property(mask, 'R', unreal.MaterialProperty.MP_OPACITY_MASK)
    elif opacity < .95:
        m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
        node = edit.create_material_expression(m, unreal.MaterialExpressionConstant, -180, 400)
        node.set_editor_property('r', opacity)
        edit.connect_material_property(node, '', unreal.MaterialProperty.MP_OPACITY)
    edit.set_base_material_usage(m, unreal.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES, True)
    lib.set_metadata_tag(m, 'TerraMaterialSignature', signature)
    edit.recompile_material(m)
    lib.save_loaded_asset(m)
    return m

materials = {}
for d in data['materials']:
    color = [c*t for c, t in zip(d['color'], d.get('vertexTint', [1, 1, 1]))]
    materials[d['id']] = material(d['id'], color, d['roughness'], d['metallic'], d['opacity'],
        texture=load_texture(d.get('diffuse')), alpha=load_texture(d.get('alpha'), True),
        clip=d.get('alphaTest') or .38)
texture_names = {'dirt':'forest_ground_04_diff_2k.jpg', 'asphalt':'asphalt_02_diff_1k.jpg',
    'mud':'brown_mud_02_diff_2k.jpg', 'wetland':'brown_mud_02_diff_2k.jpg',
    'rock':'mossy_rock_diff_1k.jpg', 'sand':'sand_03_diff_1k.jpg'}
for s in data['surfaces']:
    color = [.86,.88,.81] if s == 'dirt' else [.82,.81,.77] if s != 'snow' else [.87,.93,1]
    material('Terrain_'+s, color, .97 if s in ['snow','sand'] else .38 if s in ['mud','wetland'] else .85,
        texture=load_texture(texture_names.get(s)))
for name, color in [('mud',[.19,.12,.07]), ('water',[.40,.60,.68]), ('snow',[.90,.95,1]), ('sand',[.69,.50,.26])]:
    material('Spray_'+name, color, .3 if name == 'water' else .94)
material('M_Sky', [.38,.58,.78], sky=True)

for i, asset in enumerate(data['assets']):
    dest = '/Game/Meshes/' + asset['name']
    mesh = lib.load_asset(dest) if lib.does_asset_exist(dest) else None
    if mesh and lib.get_metadata_tag(mesh, 'TerraMeshSchema') != str(data['meshSchema']):
        mesh = None
    if mesh is None:
        task = unreal.AssetImportTask()
        task.filename = os.path.join(source, asset['name']+'.obj')
        task.destination_path = '/Game/Meshes'
        task.destination_name = asset['name']
        task.automated = True
        task.save = True
        task.replace_existing = True
        options = unreal.FbxImportUI()
        options.import_mesh = True
        options.import_materials = False
        options.import_textures = False
        options.import_as_skeletal = False
        options.mesh_type_to_import = unreal.FBXImportType.FBXIT_STATIC_MESH
        options.static_mesh_import_data.combine_meshes = True
        options.static_mesh_import_data.import_uniform_scale = 1.
        options.static_mesh_import_data.convert_scene = False
        options.static_mesh_import_data.convert_scene_unit = False
        options.static_mesh_import_data.normal_import_method = unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS
        options.static_mesh_import_data.generate_lightmap_u_vs = False
        task.options = options
        tools.import_asset_tasks([task])
        if not task.imported_object_paths:
            raise RuntimeError('Import failed: ' + asset['name'])
        mesh = lib.load_asset(task.imported_object_paths[0])
    for index, slot in enumerate(mesh.get_editor_property('static_materials')):
        slot_name = str(slot.get_editor_property('imported_material_slot_name'))
        mid = next((m for m in asset['slots'] if m in slot_name), asset['slots'][min(index,len(asset['slots'])-1)])
        if mesh.get_material(index) != materials[mid]:
            mesh.set_material(index, materials[mid])
    body = mesh.get_editor_property('body_setup')
    if body and body.get_editor_property('collision_trace_flag') != unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE:
        body.set_editor_property('collision_trace_flag', unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    lib.set_metadata_tag(mesh, 'TerraMeshSchema', str(data['meshSchema']))
    lib.save_loaded_asset(mesh)
    unreal.log('TERRA_IMPORT %d/%d %s' % (i+1, len(data['assets']), asset['name']))

level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
if lib.does_asset_exist('/Game/Maps/ProvingGround'):
    ok = level.load_level('/Game/Maps/ProvingGround')
else:
    ok = level.new_level('/Game/Maps/ProvingGround')
if not ok or not level.save_current_level():
    raise RuntimeError('Could not create/load/save ProvingGround')
lib.save_directory('/Game', only_if_is_dirty=True, recursive=True)
unreal.log('TERRA_IMPORT_COMPLETE')
os.makedirs(os.path.join(root, 'Saved'), exist_ok=True)
with open(os.path.join(root, 'Saved', 'import-complete.json'), 'w', encoding='utf8') as stream:
    json.dump({'meshes':len(data['assets']), 'meshSchema':data['meshSchema'],
        'map':'/Game/Maps/ProvingGround', 'complete':True}, stream)
