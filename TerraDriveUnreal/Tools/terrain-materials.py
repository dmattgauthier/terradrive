"""Build varied world-space ground from the preserved photographic source maps.

Executed by import-assets.py with its editor helpers in scope.
"""
with open(os.path.join(root, 'Tools', 'terrain-surface.hlsl'), encoding='utf8') as stream:
    terrain_code = stream.read()

def terrain_map(stem, kind):
    filename = stem + '_' + kind + '_1k.jpg'
    texture = load_texture(filename)
    if kind != 'diff':
        texture.set_editor_property('srgb', False)
        # Explicit RGB decode in HLSL preserves the supplied OpenGL normal.
        texture.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_DEFAULT)
        lib.save_loaded_asset(texture)
    return texture

def terrain_material(name, stems, biome, wetness):
    dest = '/Game/Materials/' + name
    signature = hashlib.sha256((terrain_code+repr((stems,biome,wetness,3))).encode()).hexdigest()
    m = lib.load_asset(dest) if lib.does_asset_exist(dest) else tools.create_asset(
        name, '/Game/Materials', unreal.Material, unreal.MaterialFactoryNew())
    if lib.get_metadata_tag(m, 'TerraTerrainSignature') == signature:
        return m
    edit.delete_all_material_expressions(m)
    m.set_editor_property('two_sided', True)
    m.set_editor_property('tangent_space_normal', False)
    m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_OPAQUE)
    custom = edit.create_material_expression(m, unreal.MaterialExpressionCustom, 0, 0)
    custom.set_editor_property('description', 'Terra: ecological patches / triplanar detail / roughness')
    custom.set_editor_property('code', terrain_code)
    custom.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    inputs = []
    for name in ['World','GeoNormal','Primary','Secondary','Accent','NormalMap','RoughMap','Biome','Wetness']:
        item = unreal.CustomInput()
        item.set_editor_property('input_name', name)
        inputs.append(item)
    custom.set_editor_property('inputs', inputs)
    outputs = []
    for name, kind in [('Roughness',unreal.CustomMaterialOutputType.CMOT_FLOAT1),
                       ('SurfaceNormal',unreal.CustomMaterialOutputType.CMOT_FLOAT3)]:
        item = unreal.CustomOutput()
        item.set_editor_property('output_name', name)
        item.set_editor_property('output_type', kind)
        outputs.append(item)
    custom.set_editor_property('additional_outputs', outputs)
    world = edit.create_material_expression(m, unreal.MaterialExpressionWorldPosition,-600,-240)
    normal = edit.create_material_expression(m, unreal.MaterialExpressionVertexNormalWS,-600,-160)
    edit.connect_material_expressions(world,'',custom,'World')
    edit.connect_material_expressions(normal,'',custom,'GeoNormal')
    maps = [(stems[0],'diff','Primary'),(stems[1],'diff','Secondary'),
            (stems[2],'diff','Accent'),(stems[0],'nor_gl','NormalMap'),(stems[0],'rough','RoughMap')]
    for i, (stem,kind,pin) in enumerate(maps):
        obj = edit.create_material_expression(m, unreal.MaterialExpressionTextureObject,-600,i*140)
        obj.set_editor_property('texture', terrain_map(stem,kind))
        if kind != 'diff':
            obj.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        edit.connect_material_expressions(obj,'',custom,pin)
    for i, (pin,value) in enumerate([('Biome',biome),('Wetness',wetness)]):
        node = edit.create_material_expression(m,unreal.MaterialExpressionConstant,-260,700+i*80)
        node.set_editor_property('r',float(value))
        edit.connect_material_expressions(node,'',custom,pin)
    for output, prop in [('',unreal.MaterialProperty.MP_BASE_COLOR),
                         ('Roughness',unreal.MaterialProperty.MP_ROUGHNESS),
                         ('SurfaceNormal',unreal.MaterialProperty.MP_NORMAL)]:
        if not edit.connect_material_property(custom,output,prop):
            raise RuntimeError('Could not connect terrain output '+output)
    specular = edit.create_material_expression(m,unreal.MaterialExpressionConstant,0,300)
    specular.set_editor_property('r',.12)
    edit.connect_material_property(specular,'',unreal.MaterialProperty.MP_SPECULAR)
    edit.set_base_material_usage(m,unreal.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES,True)
    edit.recompile_material(m)
    lib.set_metadata_tag(m,'TerraTerrainSignature',signature)
    lib.save_loaded_asset(m)
    return m

terrain_specs = [
    ('dirt',('forest_ground_04','sparse_grass','gravel_floor_02'),.32),
    ('asphalt',('asphalt_02','gravel_ground_01','brown_mud_02'),.15),
    ('mud',('brown_mud_02','dry_riverbed_rock','forest_ground_04'),.8),
    ('wetland',('brown_mud_02','leafy_grass','forest_ground_04'),.95),
    ('rock',('dry_riverbed_rock','mossy_rock','gravel_ground_01'),.12),
    ('sand',('sand_03','gravel_floor_02','dry_riverbed_rock'),.08),
    ('snow',('sand_03','mossy_rock','dry_riverbed_rock'),0)]
for biome, (surface, stems, wetness) in enumerate(terrain_specs):
    terrain_material('Terrain_'+surface,stems,biome,wetness)
# Only the quarry's rock slot; colored gate posts keep their original materials.
for d in data['materials']:
    if d.get('diffuse') == 'mossy_rock_diff_1k.jpg':
        materials[d['id']] = lib.load_asset('/Game/Materials/Terrain_rock')
unreal.log('TERRA_TERRAIN_VARIATION_COMPLETE surfaces=7 layers=3 normal_roughness=true')
