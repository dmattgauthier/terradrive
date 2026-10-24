"""Build varied world-space ground from the preserved photographic source maps.

Executed by import-assets.py with its editor helpers in scope.
"""
with open(os.path.join(root, 'Tools', 'terrain-surface.hlsl'), encoding='utf8') as stream:
    terrain_code = stream.read()
trail_points=data.get('quarryTrail',{}).get('samples',[])[::6]
if trail_points:
    literal=','.join('float2(%.5f,%.5f)'%(p['x'],p['y']) for p in trail_points)
    terrain_code=terrain_code.replace('/*QUARRY_TRAIL*/','float2 trail[%d]={%s}; float trailDistance=1e9; for(int ti=1;ti<%d;++ti){float2 a=trail[ti-1],d=trail[ti]-a; float t=saturate(dot(p.xy-a,d)/dot(d,d));trailDistance=min(trailDistance,length(p.xy-a-d*t));} float path=1-smoothstep(2.25,3.8,trailDistance);b*=1-path;c=lerp(c,.15,path);'%(len(trail_points),literal,len(trail_points)))
else:
    terrain_code=terrain_code.replace('/*QUARRY_TRAIL*/','')

def terrain_map(stem, kind):
    filename = ('native/'+stem+'/'+stem+'_'+kind+'_2k.jpg') if stem in ['dry_ground_rocks','rocks_ground_05'] else stem+'_'+kind+'_1k.jpg'
    texture = load_texture(filename)
    # These project-owned ground maps are sampled in world space, with tire
    # direction in UV0. A streaming estimate from that UV stream cannot
    # express their actual texel density. Bound and retain the ground maps;
    # scenery atlases and the acquired source packs keep their own policies.
    cap = 2048 if filename.endswith('_2k.jpg') else 1024
    changed = texture.get_editor_property('lod_bias') != 0 or texture.get_editor_property('max_texture_size') != cap or not texture.get_editor_property('never_stream')
    if changed:
        texture.set_editor_property('lod_bias', 0)
        texture.set_editor_property('max_texture_size', cap)
        texture.set_editor_property('never_stream', True)
    if kind == 'diff':
        if not texture.get_editor_property('srgb'):
            texture.set_editor_property('srgb', True)
            changed = True
    if kind != 'diff':
        texture.set_editor_property('srgb', False)
        # Explicit RGB decode in HLSL preserves the supplied OpenGL normal.
        texture.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_DEFAULT)
        lib.save_loaded_asset(texture)
    elif changed:
        lib.save_loaded_asset(texture)
    return texture

def acquired_map(path):
    if not lib.does_asset_exist(path):
        raise RuntimeError('Add the acquired terrain pack to this project: '+path)
    # The showroom pack ships its snow maps with LOD bias 2 (256px effective
    # here). Native close ground needs the actual scan detail. Keep the source
    # pack untouched and bound the project-owned copies to 2K for GPU memory.
    dest='/Game/Textures/Ground_'+path.rsplit('/',1)[-1]
    texture=lib.load_asset(dest) if lib.does_asset_exist(dest) else lib.duplicate_asset(path,dest)
    if not texture:raise RuntimeError('Could not prepare ground scan: '+path)
    # Custom world-space UVs do not supply a reliable UV0 streaming scale.
    # Keep only these bounded ground copies resident, not the scenery library.
    if texture.get_editor_property('lod_bias')!=0 or texture.get_editor_property('max_texture_size')!=2048 or not texture.get_editor_property('never_stream'):
        texture.set_editor_property('lod_bias',0)
        texture.set_editor_property('max_texture_size',2048)
        texture.set_editor_property('never_stream',True)
        lib.save_loaded_asset(texture)
    return texture

mw='/Game/MWLandscapeAutoMaterial/Textures/Ground/TEX_MWAM_'
winter='/Game/AutomotiveWinterScene/Megascans/Surfaces/'
def source_layer(stem):
    return {'maps':[terrain_map(stem,k) for k in ['diff','nor_gl','rough']], 'normalY':-1.,'roughG':0.}
def mw_layer(name, rough_stem):
    # MW supplies BC5 normals and color; retain a photographic soil roughness map.
    return {'maps':[acquired_map(mw+name+'_col'),acquired_map(mw+name+'_nrm'),terrain_map(rough_stem,'rough')],'normalY':1.,'roughG':0.}
def winter_layer(folder, prefix, packed):
    return {'maps':[acquired_map(winter+folder+'/'+prefix+'_'+k) for k in ['BC','N',packed]],'normalY':1.,'roughG':1.}

terrain_bindings=[]
def terrain_material(name, layers, biome, wetness, scales):
    dest = '/Game/Materials/' + name
    paths=[[t.get_path_name() for t in layer['maps']] for layer in layers]
    residency = [[{'path':t.get_path_name(), 'maxTextureSize':t.get_editor_property('max_texture_size'),
                   'lodBias':t.get_editor_property('lod_bias'), 'neverStream':t.get_editor_property('never_stream'), 'sRGB':t.get_editor_property('srgb')}
                  for t in layer['maps']] for layer in layers]
    terrain_bindings.append({'material':dest,'textures':paths,'scalesM':scales,'residency':residency})
    signature = hashlib.sha256((terrain_code+repr((paths,biome,wetness,scales,5))).encode()).hexdigest()
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
    for name in ['World','GeoNormal','Primary','Secondary','Accent','NormalMap','SecondaryNormal','AccentNormal','RoughMap','SecondaryRough','AccentRough','NormalSigns','RoughChannels','Scales','Biome','Wetness','Wear','LooseSoil','SoilDisplacement','Churn','TireDirection']:
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
    wear=edit.create_material_expression(m,unreal.MaterialExpressionVertexColor,-600,-80)
    edit.connect_material_expressions(wear,'R',custom,'Wear')
    edit.connect_material_expressions(wear,'G',custom,'LooseSoil')
    edit.connect_material_expressions(wear,'B',custom,'SoilDisplacement')
    edit.connect_material_expressions(wear,'A',custom,'Churn')
    tangent=edit.create_material_expression(m,unreal.MaterialExpressionTextureCoordinate,-600,-20)
    tangent.set_editor_property('coordinate_index',0)
    edit.connect_material_expressions(tangent,'',custom,'TireDirection')
    maps = [(layer['maps'][kind],kind,pin) for layer,pins in zip(layers,[['Primary','NormalMap','RoughMap'],['Secondary','SecondaryNormal','SecondaryRough'],['Accent','AccentNormal','AccentRough']]) for kind,pin in enumerate(pins)]
    for i, (texture,kind,pin) in enumerate(maps):
        obj = edit.create_material_expression(m, unreal.MaterialExpressionTextureObject,-600,i*140)
        obj.set_editor_property('texture', texture)
        if kind:
            is_normal=texture.get_editor_property('compression_settings')==unreal.TextureCompressionSettings.TC_NORMALMAP
            obj.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL if is_normal else unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        edit.connect_material_expressions(obj,'',custom,pin)
    for pin,values in [('NormalSigns',[x['normalY'] for x in layers]),('RoughChannels',[x['roughG'] for x in layers]),('Scales',scales)]:
        node=edit.create_material_expression(m,unreal.MaterialExpressionConstant3Vector,-300,1100)
        node.set_editor_property('constant',unreal.LinearColor(*values,1))
        edit.connect_material_expressions(node,'',custom,pin)
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
    specular.set_editor_property('r',.45 if biome==6 else .12)
    edit.connect_material_property(specular,'',unreal.MaterialProperty.MP_SPECULAR)
    edit.set_base_material_usage(m,unreal.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES,True)
    edit.recompile_material(m)
    lib.set_metadata_tag(m,'TerraTerrainSignature',signature)
    lib.save_loaded_asset(m)
    return m

terrain_specs = [
    ('dirt',[mw_layer('Dirt','dry_ground_rocks'),source_layer('leafy_grass'),mw_layer('Stones','rocks_ground_05')],.32,[1.6,1.75,2.4]),
    ('asphalt',[source_layer(s) for s in ['asphalt_02','gravel_ground_01','brown_mud_02']],.15,[2.1,2.7,1.55]),
    ('mud',[source_layer(s) for s in ['brown_mud_02','dry_riverbed_rock','forest_ground_04']],.8,[2.1,2.7,1.55]),
    ('wetland',[source_layer('brown_mud_02'),mw_layer('Grass','leafy_grass'),source_layer('forest_ground_04')],.95,[2.1,2.7,1.55]),
    ('rock',[mw_layer('Rock','rocks_ground_05'),source_layer('mossy_rock'),winter_layer('RockWall','T_Rock','HRO')],.12,[5.,3.4,4.]),
    ('sand',[mw_layer('SandA','sand_03'),mw_layer('SandC','gravel_floor_02'),source_layer('dry_riverbed_rock')],.08,[3.2,2.7,1.55]),
    ('snow',[winter_layer('CleanSnow','T_CleanSnow','TRO'),winter_layer('SnowRoad','T_Road_Extra','TRD'),winter_layer('Pebbles','T_Pebbles','HRO')],0,[4.0,2.4,2.4])]
for biome, (surface, layers, wetness, scales) in enumerate(terrain_specs):
    terrain_material('Terrain_'+surface,layers,biome,wetness,scales)
exec(compile(open(os.path.join(root,'Tools','terrain-ground-blend.py'),encoding='utf8').read(),'terrain-ground-blend.py','exec'))
json.dump({'surfaces':terrain_bindings},open(os.path.join(root,'Saved','terrain-bindings.json'),'w'),indent=2)
# Only the quarry's rock slot; colored gate posts keep their original materials.
for d in data['materials']:
    if d.get('diffuse') == 'mossy_rock_diff_1k.jpg':
        materials[d['id']] = lib.load_asset('/Game/Materials/Terrain_rock')
unreal.log('TERRA_TERRAIN_VARIATION_COMPLETE surfaces=7 layers=3 stochastic=true acquired=true normal_roughness=true')
