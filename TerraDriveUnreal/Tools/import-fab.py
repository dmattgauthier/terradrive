"""Import only acquired Quarry scenery. Never copy raw Fab content to Vendor."""
recipe=json.load(open(os.path.join(root,'Tools','fab-scenery.json'),encoding='utf8'))
cache=os.environ.get('TERRA_FAB_CACHE',os.path.join(os.environ.get('ProgramData','C:/ProgramData'),
    'Epic/EpicGamesLauncher/VaultCache/FabLibrary',recipe['cacheFolder']))
fab_report=[]
exec(compile(open(os.path.join(root,'Tools','close-rocks.py'),encoding='utf8').read(),'close-rocks.py','exec'))
if data.get('fabScenery',{}).get('enabled'):
    if not os.path.isdir(cache):
        raise RuntimeError('Acquired Fab pack is enabled but missing. Set TERRA_FAB_CACHE to the extracted African Slate Quarry directory.')
    def fab_texture(asset_id,suffix,mask=False):
        folder=os.path.join(cache,asset_id)
        candidates=sorted(p for p in os.listdir(folder) if p.endswith('_'+suffix+'.jpg'))
        if not candidates: raise RuntimeError('Missing Quarry '+asset_id+' '+suffix)
        filename=os.path.join(folder,candidates[0]);name='Fab_'+asset_id+'_'+suffix;dest='/Game/FabScenery/Textures/'+name
        texture=lib.load_asset(dest) if lib.does_asset_exist(dest) else None
        if not texture:
            task=unreal.AssetImportTask();task.filename=filename;task.destination_path='/Game/FabScenery/Textures'
            task.destination_name=name;task.automated=True;task.save=True
            tools.import_asset_tasks([task])
            if not task.imported_object_paths: raise RuntimeError('Fab texture import failed: '+filename)
            texture=lib.load_asset(task.imported_object_paths[0])
        if mask: texture.set_editor_property('srgb',False)
        return texture
    for entry in recipe['assets']:
        asset_id=entry['id'];filename=os.path.join(cache,asset_id,asset_id+'.fbx')
        texture=fab_texture(asset_id,'BaseColor');normal=fab_texture(asset_id,'Normal',True);rough=fab_texture(asset_id,'Roughness',True)
        mat=material('Fab_'+asset_id,[1,1,1],.9,texture=texture,normal=normal,rough_map=rough)
        # Quixel FBX export's Unreal/DirectX normal convention differs from
        # the OpenGL CC0 textures used by the original terrain pipeline.
        if normal.get_editor_property('flip_green_channel'):
            normal.set_editor_property('flip_green_channel',False);lib.save_loaded_asset(normal)
        # These scans have open backs/undersides. Backface culling made entire
        # surfaces vanish when approached from the reverse direction.
        if not mat.get_editor_property('two_sided'):
            mat.set_editor_property('two_sided',True);edit.recompile_material(mat);lib.save_loaded_asset(mat)
        if mat.get_editor_property('blend_mode')!=unreal.BlendMode.BLEND_OPAQUE:
            raise RuntimeError('Quarry rock must remain opaque: '+asset_id)
        digest=hashlib.sha256(open(filename,'rb').read()).hexdigest();dest='/Game/FabScenery/Meshes/'+asset_id
        mesh=lib.load_asset(dest) if lib.does_asset_exist(dest) else None
        if not mesh or lib.get_metadata_tag(mesh,'TerraFabHash')!=digest:
            task=unreal.AssetImportTask();task.filename=filename;task.destination_path='/Game/FabScenery/Meshes'
            task.destination_name=asset_id;task.automated=True;task.save=True;task.replace_existing=True
            options=unreal.FbxImportUI();options.import_mesh=True;options.import_materials=False;options.import_textures=False
            options.import_as_skeletal=False;options.mesh_type_to_import=unreal.FBXImportType.FBXIT_STATIC_MESH
            options.static_mesh_import_data.combine_meshes=True;options.static_mesh_import_data.convert_scene=True
            options.static_mesh_import_data.convert_scene_unit=True;options.static_mesh_import_data.generate_lightmap_u_vs=False
            options.static_mesh_import_data.normal_import_method=unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS_AND_TANGENTS
            task.options=options;tools.import_asset_tasks([task])
            if not task.imported_object_paths:raise RuntimeError('Fab mesh import failed: '+asset_id)
            mesh=lib.load_asset(task.imported_object_paths[0])
        for i in range(len(mesh.get_editor_property('static_materials'))):mesh.set_material(i,mat)
        body=mesh.get_editor_property('body_setup')
        if body:body.set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
        bounds=mesh.get_bounding_box();size=bounds.max-bounds.min
        if not (5<size.z<500 and 5<max(size.x,size.y)<1000):raise RuntimeError('Unexpected Fab dimensions/orientation: '+asset_id+' '+str(size))
        lib.set_metadata_tag(mesh,'TerraFabHash',digest);lib.save_loaded_asset(mesh)
        close_rock_mesh(mesh,digest)
        fab_report.append({'id':asset_id,'mesh':dest,'opaque':mat.get_editor_property('blend_mode')==unreal.BlendMode.BLEND_OPAQUE,'twoSided':mat.get_editor_property('two_sided'),'boundsCM':{'min':[bounds.min.x,bounds.min.y,bounds.min.z],'max':[bounds.max.x,bounds.max.y,bounds.max.z]},'sourceSHA256':digest})
    for entry in recipe.get('unrealAssets',[]):
        source=entry['source'];dest='/Game/FabScenery/Meshes/'+entry['id']
        if not lib.does_asset_exist(source):raise RuntimeError('Missing acquired scenery: '+source)
        mesh=lib.load_asset(dest) if lib.does_asset_exist(dest) else lib.duplicate_asset(source,dest)
        if not isinstance(mesh,unreal.StaticMesh):raise RuntimeError('Not a scenery static mesh: '+source)
        # The source rock instances use the Winter Scene's snow/weather master.
        # Temperate formations share the native biome's photographic rock finish;
        # retain the original ice shading only for the Snow Basin formations.
        if entry['id'].startswith('Winter_') and 'Ice' not in entry['id']:
            finish=lib.load_asset('/Game/Materials/Terrain_rock')
            for slot in range(len(mesh.get_editor_property('static_materials'))):mesh.set_material(slot,finish)
            close_rock_mesh(mesh,source)
        body=mesh.get_editor_property('body_setup')
        if body and entry.get('solid',True):body.set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
        lib.save_loaded_asset(mesh)
        fab_report.append({'id':entry['id'],'mesh':dest,'sourceAsset':source})
    unreal.log('TERRA_FAB_IMPORTED %d acquired scenery meshes'%len(fab_report))
os.makedirs(os.path.join(root,'Saved'),exist_ok=True)
json.dump({'enabled':bool(fab_report),'pack':recipe['pack'],'assets':fab_report},open(os.path.join(root,'Saved','fab-import-report.json'),'w'),indent=2)
json.dump({'meshes':rock_closure_report},open(os.path.join(root,'Saved','rock-closure-report.json'),'w'),indent=2)
