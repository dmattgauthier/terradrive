"""Run once with UnrealEditor-Cmd -run=pythonscript -script=... ."""
import unreal, json, os
root = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
source = os.path.join(root, 'SourceAssets')
with open(os.path.join(source, 'import.json'), encoding='utf8') as f:
    data = json.load(f)
tools = unreal.AssetToolsHelpers.get_asset_tools()
edit = unreal.MaterialEditingLibrary
lib = unreal.EditorAssetLibrary
def material(name, color, roughness=.8, metallic=0, opacity=1, sky=False, texture=None):
    dest='/Game/Materials/'+name
    if lib.does_asset_exist(dest): return lib.load_asset(dest)
    m=tools.create_asset(name,'/Game/Materials',unreal.Material,unreal.MaterialFactoryNew())
    m.set_editor_property('two_sided',True)
    c=edit.create_material_expression(m,unreal.MaterialExpressionConstant3Vector,-500,0)
    c.set_editor_property('constant',unreal.LinearColor(*color,1))
    output=c
    if texture:
        t=edit.create_material_expression(m,unreal.MaterialExpressionTextureSample,-500,160)
        t.set_editor_property('texture',texture)
        mul=edit.create_material_expression(m,unreal.MaterialExpressionMultiply,-200,80)
        edit.connect_material_expressions(t,'RGB',mul,'A');edit.connect_material_expressions(c,'',mul,'B');output=mul
    edit.connect_material_property(output,'',unreal.MaterialProperty.MP_EMISSIVE_COLOR if sky else unreal.MaterialProperty.MP_BASE_COLOR)
    for prop,value in [(unreal.MaterialProperty.MP_ROUGHNESS,roughness),(unreal.MaterialProperty.MP_METALLIC,metallic)]:
        node=edit.create_material_expression(m,unreal.MaterialExpressionConstant,-180,280);node.set_editor_property('r',value);edit.connect_material_property(node,'',prop)
    if sky:m.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_UNLIT)
    # Small lamp lenses and glazing retain tint without screen-door artefacts.
    if opacity<.95:
        m.set_editor_property('blend_mode',unreal.BlendMode.BLEND_TRANSLUCENT)
        node=edit.create_material_expression(m,unreal.MaterialExpressionConstant,-180,400);node.set_editor_property('r',opacity);edit.connect_material_property(node,'',unreal.MaterialProperty.MP_OPACITY)
    edit.recompile_material(m);lib.save_loaded_asset(m);return m
materials={d['id']:material(d['id'],d['color'],d['roughness'],d['metallic'],d['opacity']) for d in data['materials']}
texture_names={'dirt':'forest_ground_04_diff_2k.jpg','asphalt':'asphalt_02_diff_1k.jpg','mud':'brown_mud_02_diff_2k.jpg','wetland':'brown_mud_02_diff_2k.jpg','rock':'mossy_rock_diff_1k.jpg','sand':'sand_03_diff_1k.jpg'}
texture_root=os.path.join(root,'..','TerraDrive-v1.13','dist','assets','terrain')
for s in data['surfaces']:
    texture=None
    file=os.path.join(texture_root,texture_names.get(s,''))
    if os.path.isfile(file):
        task=unreal.AssetImportTask();task.filename=file;task.destination_path='/Game/Textures';task.automated=True;task.save=True;task.replace_existing=True;tools.import_asset_tasks([task]);texture=lib.load_asset(task.imported_object_paths[0]) if task.imported_object_paths else None
    color=[.86,.88,.81] if s=='dirt' else [.82,.81,.77] if s!='snow' else [.87,.93,1]
    material('Terrain_'+s,color,.97 if s in ['snow','sand'] else .38 if s in ['mud','wetland'] else .85,texture=texture)
for name,color in [('mud',[.19,.12,.07]),('water',[.40,.60,.68]),('snow',[.90,.95,1]),('sand',[.69,.50,.26])]:material('Spray_'+name,color,.3 if name=='water' else .94)
material('M_Sky',[.38,.58,.78],sky=True)
for i,a in enumerate(data['assets']):
    dest='/Game/Meshes/'+a['name']
    if lib.does_asset_exist(dest):continue
    task=unreal.AssetImportTask();task.filename=os.path.join(source,a['name']+'.obj');task.destination_path='/Game/Meshes';task.destination_name=a['name'];task.automated=True;task.save=True
    options=unreal.FbxImportUI();options.import_mesh=True;options.import_materials=False;options.import_textures=False;options.import_as_skeletal=False;options.mesh_type_to_import=unreal.FBXImportType.FBXIT_STATIC_MESH
    options.static_mesh_import_data.combine_meshes=True;options.static_mesh_import_data.import_uniform_scale=1.;options.static_mesh_import_data.convert_scene=False;options.static_mesh_import_data.convert_scene_unit=False;options.static_mesh_import_data.normal_import_method=unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS
    options.static_mesh_import_data.generate_lightmap_u_vs=False
    task.options=options;tools.import_asset_tasks([task])
    if not task.imported_object_paths:raise RuntimeError('Import failed '+a['name'])
    mesh=lib.load_asset(task.imported_object_paths[0])
    for slot_index,slot in enumerate(mesh.get_editor_property('static_materials')):
        slot_name=str(slot.imported_material_slot_name)
        mid=next((m for m in a['slots'] if m in slot_name),a['slots'][min(slot_index,len(a['slots'])-1)])
        mesh.set_material(slot_index,materials[mid])
    # Car particles can trace against the actual imported body triangles.
    body=mesh.get_editor_property('body_setup')
    if body:body.set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    lib.save_loaded_asset(mesh)
    unreal.log('TERRA_IMPORT %d/%d %s' % (i+1,len(data['assets']),a['name']))
level=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
if not lib.does_asset_exist('/Game/Maps/ProvingGround'):
    level.new_level('/Game/Maps/ProvingGround')
level.save_current_level()
lib.save_directory('/Game',only_if_is_dirty=True,recursive=True)
unreal.log('TERRA_IMPORT_COMPLETE')
os.makedirs(os.path.join(root,'Saved'),exist_ok=True)
with open(os.path.join(root,'Saved','import-complete.json'),'w',encoding='utf8') as f:
    json.dump({'meshes':len(data['assets']),'map':'/Game/Maps/ProvingGround','complete':True},f)
