"""Close scan boundaries on project copies, preserving original pack assets."""
rock_closure_report=[]

def close_rock_mesh(mesh,source_key):
    key='closed-scan-v2:'+source_key
    utils=unreal.GeometryScript_AssetUtils
    query=unreal.GeometryScript_MeshQueries
    repair=unreal.GeometryScript_MeshRepair
    lists=unreal.GeometryScript_List
    cap_material=lib.load_asset('/Game/Materials/Terrain_rock')
    saved_slot=lib.get_metadata_tag(mesh,'TerraRockCapSlot')
    original_materials=[s.material_interface for s in mesh.get_editor_property('static_materials')]
    cap_slot=int(saved_slot) if saved_slot else len(original_materials)
    if cap_slot==len(original_materials):original_materials.append(cap_material)
    else:original_materials[cap_slot]=cap_material
    changed=lib.get_metadata_tag(mesh,'TerraRockClosure')!=key
    count=utils.get_num_static_mesh_lods_of_type(mesh,unreal.GeometryScriptLODType.SOURCE_MODEL)
    lods=[(unreal.GeometryScriptLODType.SOURCE_MODEL,i,False) for i in range(count)]
    if utils.get_num_static_mesh_lods_of_type(mesh,unreal.GeometryScriptLODType.HI_RES_SOURCE_MODEL)>0:
        lods.append((unreal.GeometryScriptLODType.HI_RES_SOURCE_MODEL,0,True))
    results=[]
    for kind,index,hi_res in lods:
        dynamic=unreal.DynamicMesh()
        read_lod=unreal.GeometryScriptMeshReadLOD(lod_type=kind,lod_index=index)
        copied=utils.copy_mesh_from_static_mesh_v2(mesh,dynamic,unreal.GeometryScriptCopyMeshFromAssetOptions(),read_lod,False)
        if copied[-1]!=unreal.GeometryScriptOutcomePins.SUCCESS:
            raise RuntimeError('Cannot read rock source LOD: '+mesh.get_name()+' '+str(index))
        existing=set(lists.convert_index_list_to_array(query.get_all_triangle_i_ds(dynamic)[1]))
        before=query.get_is_closed_mesh(dynamic);filled=failed=0;cap_triangles=[]
        if not before:
            if not changed:raise RuntimeError('Previously repaired rock reopened: '+mesh.get_name())
            _,filled,failed=repair.fill_all_mesh_holes(dynamic,unreal.GeometryScriptFillHolesOptions(fill_method=unreal.GeometryScriptFillHolesMethod.AUTOMATIC))
            if failed or not query.get_is_closed_mesh(dynamic):
                # Assemblies may have pinched/bowtie boundaries. Separate the
                # touching loops, then cap their remaining small openings.
                repair.split_mesh_bowties(dynamic,True,True)
                repair.weld_mesh_edges(dynamic,unreal.GeometryScriptWeldEdgesOptions(tolerance=.0001))
                _,extra,failed=repair.fill_all_mesh_holes(dynamic,unreal.GeometryScriptFillHolesOptions(fill_method=unreal.GeometryScriptFillHolesMethod.TRIANGLE_FAN))
                filled+=extra
            if failed or not query.get_is_closed_mesh(dynamic):
                raise RuntimeError('Rock boundaries did not close: '+mesh.get_name()+' '+str((filled,failed)))
            cap_triangles=[t for t in lists.convert_index_list_to_array(query.get_all_triangle_i_ds(dynamic)[1]) if t not in existing]
            _,selection=unreal.GeometryScript_MeshSelection.convert_index_array_to_mesh_selection(dynamic,cap_triangles,unreal.GeometryScriptMeshSelectionType.TRIANGLES)
            unreal.GeometryScript_Materials.set_material_id_for_mesh_selection(dynamic,selection,cap_slot)
            unreal.GeometryScript_Normals.recompute_normals_for_mesh_selection(dynamic,selection,unreal.GeometryScriptCalculateNormalsOptions())
            options=unreal.GeometryScriptCopyMeshToAssetOptions(enable_recompute_tangents=True,emit_transaction=False,replace_materials=True,new_materials=original_materials)
            written=utils.copy_mesh_to_static_mesh(dynamic,mesh,options,unreal.GeometryScriptMeshWriteLOD(write_hi_res_source=hi_res,lod_index=index),False)
            if written[-1]!=unreal.GeometryScriptOutcomePins.SUCCESS:raise RuntimeError('Cannot save closed rock: '+mesh.get_name())
        # Verify static-mesh source geometry, rather than the transient dynamic edit.
        verify=unreal.DynamicMesh()
        readback=utils.copy_mesh_from_static_mesh_v2(mesh,verify,unreal.GeometryScriptCopyMeshFromAssetOptions(),read_lod,False)
        if readback[-1]!=unreal.GeometryScriptOutcomePins.SUCCESS or not query.get_is_closed_mesh(verify):raise RuntimeError('Closed rock readback failed: '+mesh.get_name())
        results.append({'lod':index,'hiRes':hi_res,'wasClosed':before,'filledHoles':filled,'failedFills':failed,'closedReadback':True,'capTriangles':len(cap_triangles)})
    mesh.set_material(cap_slot,cap_material)
    lib.set_metadata_tag(mesh,'TerraRockCapSlot',str(cap_slot))
    lib.set_metadata_tag(mesh,'TerraRockClosure',key);lib.save_loaded_asset(mesh)
    rock_closure_report.append({'mesh':mesh.get_path_name(),'lods':results})
    unreal.log('TERRA_ROCK_CLOSED '+mesh.get_name()+' '+str(results))
