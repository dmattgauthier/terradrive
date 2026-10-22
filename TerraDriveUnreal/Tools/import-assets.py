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
        task.filename = os.path.join(root,'Vendor','Environment',filename[7:]) if filename.startswith('native/') else os.path.join(texture_root, filename)
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
             sky=False, texture=None, alpha=None, clip=.38, instance_tint=False, normal=None, rough_map=None,
             clearcoat=0, coat_roughness=.15, emissive=None, role=''):
    emissive = emissive or [0,0,0]
    dest = '/Game/Materials/' + name
    signature = hashlib.sha256(json.dumps([
        5 if instance_tint else 4, color, roughness, metallic, opacity, sky,
        texture.get_path_name() if texture else None,
        alpha.get_path_name() if alpha else None, clip,
        clearcoat, coat_roughness, emissive, role, 9 if role=='carbon' else 8, normal.get_path_name() if normal else None, rough_map.get_path_name() if rough_map else None
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
    coated = clearcoat > 0 and opacity >= .95 and not sky
    m.set_editor_property('use_material_attributes', coated)
    attributes = edit.create_material_expression(m, unreal.MaterialExpressionMakeMaterialAttributes, 200, 0) if coated else None
    def connect(node, prop, pin):
        if attributes:
            ok = edit.connect_material_expressions(node, '', attributes, pin)
        else:
            ok = edit.connect_material_property(node, '', prop)
        if not ok:
            raise RuntimeError('Could not connect '+name+' '+pin)
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
    if not sky and instance_tint:
        channels=[]
        for channel in range(3):
            node=edit.create_material_expression(m,unreal.MaterialExpressionPerInstanceCustomData,-500,-180-channel*65)
            node.set_editor_property('data_index',channel)
            node.set_editor_property('const_default_value',1.)
            channels.append(node)
        rg=edit.create_material_expression(m,unreal.MaterialExpressionAppendVector,-260,-200)
        rgb=edit.create_material_expression(m,unreal.MaterialExpressionAppendVector,-120,-160)
        edit.connect_material_expressions(channels[0],'',rg,'A')
        edit.connect_material_expressions(channels[1],'',rg,'B')
        edit.connect_material_expressions(rg,'',rgb,'A')
        edit.connect_material_expressions(channels[2],'',rgb,'B')
        # Conventional instanced meshes need vertex interpolation; direct
        # pixel-stage per-instance reads only work with Nanite in UE 5.8.
        interpolated=edit.create_material_expression(m,unreal.MaterialExpressionVertexInterpolator,-30,-140)
        if not edit.connect_material_expressions(rgb,'',interpolated,'VS'):
            raise RuntimeError('Could not interpolate instance color: '+name)
        tint=edit.create_material_expression(m,unreal.MaterialExpressionMultiply,40,0)
        edit.connect_material_expressions(output,'',tint,'A')
        edit.connect_material_expressions(interpolated,'',tint,'B')
        output=tint
    if role == 'carbon':
        position=edit.create_material_expression(m,unreal.MaterialExpressionPreSkinnedPosition,-780,80)
        weave=edit.create_material_expression(m,unreal.MaterialExpressionCustom,-450,40)
        weave.set_editor_property('code','float2 q=float2(Local.x+Local.z*.31,Local.y+Local.z*.87)*5.5;float2 cell=floor(q);float parity=fmod(cell.x+cell.y,2);float strand=sin((parity<1?q.x:q.y)*6.283185);float sheen=.58+.30*strand*strand;return float3(.028,.033,.037)*sheen;')
        weave.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT3)
        item=unreal.CustomInput();item.set_editor_property('input_name','Local');weave.set_editor_property('inputs',[item])
        interpolator=edit.create_material_expression(m,unreal.MaterialExpressionVertexInterpolator,-600,100)
        if not edit.connect_material_expressions(position,'',interpolator,'VS') or not edit.connect_material_expressions(interpolator,'',weave,'Local'):raise RuntimeError('Carbon local-space interpolation failed')
        output=weave
    connect(output, unreal.MaterialProperty.MP_EMISSIVE_COLOR if sky else unreal.MaterialProperty.MP_BASE_COLOR, 'EmissiveColor' if sky else 'BaseColor')
    for prop, value, pin in [(unreal.MaterialProperty.MP_ROUGHNESS, roughness, 'Roughness'), (unreal.MaterialProperty.MP_METALLIC, metallic, 'Metallic')]:
        node = edit.create_material_expression(m, unreal.MaterialExpressionConstant, -180, 280)
        node.set_editor_property('r', value)
        connect(node, prop, pin)
    if coated:
        m.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_CLEAR_COAT)
        # UE keeps MP_CustomData0/1 hidden from Python. MakeMaterialAttributes
        # exposes the engine's ClearCoat/ClearCoatRoughness inputs by name.
        for pin,value in [('ClearCoat',clearcoat),('ClearCoatRoughness',coat_roughness)]:
            node=edit.create_material_expression(m,unreal.MaterialExpressionConstant,-160,340)
            node.set_editor_property('r',value)
            if not edit.connect_material_expressions(node,'',attributes,pin):
                raise RuntimeError('Could not connect '+name+' '+pin)
        if not edit.connect_material_property(attributes,'',unreal.MaterialProperty.MP_MATERIAL_ATTRIBUTES):
            raise RuntimeError('Could not connect material attributes: '+name)
    elif not sky:
        m.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_DEFAULT_LIT)
    if not sky and (max(emissive)>0 or role in ('brake','reverse')):
        node=edit.create_material_expression(m,unreal.MaterialExpressionConstant3Vector,-160,500)
        node.set_editor_property('constant',unreal.LinearColor(*emissive,1))
        if role in ('brake','reverse'):
            node.set_editor_property('constant',unreal.LinearColor(1,.008,.003,1) if role=='brake' else unreal.LinearColor(.85,.94,1,1))
            gain=edit.create_material_expression(m,unreal.MaterialExpressionScalarParameter,-350,550)
            gain.set_editor_property('parameter_name','TerraLamp');gain.set_editor_property('default_value',0)
            mul=edit.create_material_expression(m,unreal.MaterialExpressionMultiply,0,500)
            edit.connect_material_expressions(node,'',mul,'A');edit.connect_material_expressions(gain,'',mul,'B');node=mul
        connect(node,unreal.MaterialProperty.MP_EMISSIVE_COLOR,'EmissiveColor')
    if normal:
        normal.set_editor_property('srgb',False)
        normal.set_editor_property('compression_settings',unreal.TextureCompressionSettings.TC_NORMALMAP)
        normal.set_editor_property('flip_green_channel',True);lib.save_loaded_asset(normal)
        sample=edit.create_material_expression(m,unreal.MaterialExpressionTextureSample,-450,700)
        sample.set_editor_property('texture',normal);sample.set_editor_property('sampler_type',unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        connect(sample,unreal.MaterialProperty.MP_NORMAL,'Normal')
    if rough_map:
        rough_map.set_editor_property('srgb',False);lib.save_loaded_asset(rough_map)
        sample=edit.create_material_expression(m,unreal.MaterialExpressionTextureSample,-450,850)
        sample.set_editor_property('texture',rough_map);sample.set_editor_property('sampler_type',unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        edit.connect_material_property(sample,'G',unreal.MaterialProperty.MP_ROUGHNESS)
    if sky:
        m.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
        m.set_editor_property('is_sky', True)
    if alpha:
        m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
        m.set_editor_property('opacity_mask_clip_value', clip)
        mask = edit.create_material_expression(m, unreal.MaterialExpressionTextureSample, -500, 450)
        mask.set_editor_property('texture', alpha)
        mask.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        edit.connect_material_property(mask, 'A' if role=='scan' else 'R', unreal.MaterialProperty.MP_OPACITY_MASK)
    elif opacity < .95:
        m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
        if role in ('glass','lens'):
            m.set_editor_property('translucency_lighting_mode',unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
            m.set_editor_property('screen_space_reflections',True)
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
        texture=load_texture(d.get('diffuse')), alpha=load_texture(d.get('alpha'), True),normal=load_texture(d.get('normal')),rough_map=load_texture(d.get('roughMap'),True),
        clip=d.get('alphaTest') or .38, instance_tint=d.get('instanceTint',False),
        clearcoat=d.get('clearcoat',0),coat_roughness=d.get('coatRoughness',.15),
        emissive=d.get('emissive'),role=d.get('role',''))
texture_names = {'dirt':'forest_ground_04_diff_2k.jpg', 'asphalt':'asphalt_02_diff_1k.jpg',
    'mud':'brown_mud_02_diff_2k.jpg', 'wetland':'brown_mud_02_diff_2k.jpg',
    'rock':'mossy_rock_diff_1k.jpg', 'sand':'sand_03_diff_1k.jpg'}
terrain_script = os.path.join(root, 'Tools', 'terrain-materials.py')
with open(terrain_script, encoding='utf8') as terrain_stream:
    exec(compile(terrain_stream.read(), terrain_script, 'exec'), globals())
for name, color in [('mud',[.19,.12,.07]), ('water',[.40,.60,.68]), ('snow',[.90,.95,1]), ('sand',[.69,.50,.26])]:
    material('Spray_'+name, color, .3 if name == 'water' else .94)
material('M_Sky', [.38,.58,.78], sky=True)
exec(compile(open(os.path.join(root,'Tools','sky-material.py'),encoding='utf8').read(),'sky-material.py','exec'),globals())
exec(compile(open(os.path.join(root,'Tools','tire-mark-materials.py'),encoding='utf8').read(),'tire-mark-materials.py','exec'),globals())
material('Native_SuspensionSteel',[.035,.05,.055],.48,.72)
material('Native_Chrome',[.45,.53,.57],.25,.88)

for i, asset in enumerate(data['assets']):
    dest = '/Game/Meshes/' + asset['name']
    mesh = lib.load_asset(dest) if lib.does_asset_exist(dest) else None
    if mesh and (lib.get_metadata_tag(mesh, 'TerraMeshSchema') != str(data['meshSchema']) or
                 lib.get_metadata_tag(mesh, 'TerraMeshHash') != asset.get('sha256','')):
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
    if asset['name'] in ['scan_mountainside_0','scan_boulder_01_0'] and lib.get_metadata_tag(mesh,'TerraNaniteRevision')!='1':
        # The editor subsystem is not instantiated in Python commandlets.
        # Editor property writes run the mesh's property-change/build path.
        nanite=mesh.get_editor_property('nanite_settings')
        nanite.set_editor_property('enabled',True)
        nanite.set_editor_property('fallback_relative_error',0.)
        nanite.set_editor_property('fallback_percent_triangles',1.)
        mesh.set_editor_property('nanite_settings',nanite)
        if body:body.set_editor_property('double_sided_geometry',True)
        lib.set_metadata_tag(mesh,'TerraNaniteRevision','1')
    if body and body.get_editor_property('collision_trace_flag') != unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE:
        body.set_editor_property('collision_trace_flag', unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    lib.set_metadata_tag(mesh, 'TerraMeshSchema', str(data['meshSchema']))
    lib.set_metadata_tag(mesh, 'TerraMeshHash', asset.get('sha256',''))
    lib.save_loaded_asset(mesh)
    unreal.log('TERRA_IMPORT %d/%d %s' % (i+1, len(data['assets']), asset['name']))
    if i%8==7:
        unreal.SystemLibrary.collect_garbage()

exec(compile(open(os.path.join(root,'Tools','import-fab.py'),encoding='utf8').read(),'import-fab.py','exec'),globals())
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
