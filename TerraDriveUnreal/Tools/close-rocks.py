"""Close scan boundaries on project copies, preserving original pack assets."""
rock_closure_report=[]

def close_rock_mesh(mesh,source_key):
    key='closed-scan-v3:'+source_key
    utils=unreal.GeometryScript_AssetUtils
    query=unreal.GeometryScript_MeshQueries
    repair=unreal.GeometryScript_MeshRepair
    lists=unreal.GeometryScript_List
    cap_material=lib.load_asset('/Game/Materials/Terrain_rock')
    for usage in [unreal.MaterialUsage.MATUSAGE_NANITE,unreal.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES]:
        edit.set_base_material_usage(cap_material,usage,True)
    lib.save_loaded_asset(cap_material)
    saved_slot=lib.get_metadata_tag(mesh,'TerraRockCapSlot')
    original_materials=[s.material_interface for s in mesh.get_editor_property('static_materials')]
    cap_slot=int(saved_slot) if saved_slot else len(original_materials)
    if cap_slot==len(original_materials):original_materials.append(cap_material)
    else:original_materials[cap_slot]=cap_material
    changed=lib.get_metadata_tag(mesh,'TerraRockClosure')!=key
    count=utils.get_num_static_mesh_lods_of_type(mesh,unreal.GeometryScriptLODType.SOURCE_MODEL)
    if count<1:raise RuntimeError('Rock has no source LOD to verify: '+mesh.get_name())
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
        parts_before=query.get_num_connected_components(dynamic);edges_before=query.get_num_open_border_edges(dynamic)
        parts_welded=parts_before;edges_welded=edges_before
        if not before:
            if not changed:raise RuntimeError('Previously repaired rock reopened: '+mesh.get_name())
            # OBJ/photogrammetry UV seams duplicate geometry vertices. Join
            # coincident edges while retaining per-corner UV/normal overlays.
            # Capping these seams creates thousands of false faces and
            # malformed triangle fans instead of one solid scanned boulder.
            repair.weld_mesh_edges(dynamic,unreal.GeometryScriptWeldEdgesOptions(tolerance=.001,only_unique_pairs=True))
            parts_welded=query.get_num_connected_components(dynamic);edges_welded=query.get_num_open_border_edges(dynamic)
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
            if cap_triangles:
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
        results.append({'lod':index,'hiRes':hi_res,'wasClosed':before,'sourceParts':parts_before,'partsAfterWeld':parts_welded,'openEdgesBeforeWeld':edges_before,'openEdgesAfterWeld':edges_welded,'filledHoles':filled,'failedFills':failed,'closedReadback':True,'readbackParts':query.get_num_connected_components(verify),'capTriangles':len(cap_triangles)})
    mesh.set_material(cap_slot,cap_material)
    lib.set_metadata_tag(mesh,'TerraRockCapSlot',str(cap_slot))
    lib.set_metadata_tag(mesh,'TerraRockClosure',key);lib.save_loaded_asset(mesh)
    rock_closure_report.append({'mesh':mesh.get_path_name(),'lods':results})
    unreal.log('TERRA_ROCK_CLOSED '+mesh.get_name()+' '+str(results))


def configure_boulder_collision(mesh,source_key):
    # Photogrammetry contains tiny welded fans and deep cracks unsuitable for
    # repeated chassis manifolds. Fit physical convex pieces to the scan while
    # retaining its full triangle surface for visibility and tire queries.
    key='boulder-convex-v3:'+source_key
    collision=unreal.GeometryScript_Collision
    if lib.get_metadata_tag(mesh,'TerraBoulderCollision')!=key:
        dynamic=unreal.DynamicMesh()
        lod=unreal.GeometryScriptMeshReadLOD(lod_type=unreal.GeometryScriptLODType.SOURCE_MODEL,lod_index=0)
        result=unreal.GeometryScript_AssetUtils.copy_mesh_from_static_mesh_v2(mesh,dynamic,unreal.GeometryScriptCopyMeshFromAssetOptions(),lod,False)
        if result[-1]!=unreal.GeometryScriptOutcomePins.SUCCESS:raise RuntimeError('Cannot read boulder for collision: '+mesh.get_name())
        options=unreal.GeometryScriptCollisionFromMeshOptions(
            method=unreal.GeometryScriptCollisionGenerationMethod.CONVEX_HULLS,
            emit_transaction=False,auto_detect_spheres=False,auto_detect_boxes=False,auto_detect_capsules=False,
            max_convex_hulls_per_mesh=6,convex_hull_target_face_count=80,
            convex_decomposition_search_factor=.25,convex_decomposition_error_tolerance=2.,
            convex_decomposition_min_part_thickness=2.,max_shape_count=12)
        collision.set_static_mesh_collision_from_mesh(dynamic,mesh,options)
        shapes=collision.get_simple_collision_from_static_mesh(mesh)
        if collision.get_simple_collision_shape_count(shapes)>12:
            # UE's generator only applies MaxShapeCount when there are more
            # input components than the limit. Decomposition may create more
            # shapes from fewer components, so enforce the global budget by
            # merging pieces rather than discarding any part of the rock.
            shapes,_=collision.merge_simple_collision_shapes(shapes,unreal.GeometryScriptMergeSimpleCollisionOptions(
                max_shape_count=12,error_tolerance=2.,consider_all_possible_merges=True))
            collision.set_simple_collision_of_static_mesh(shapes,mesh,unreal.GeometryScriptSetSimpleCollisionOptions(emit_transaction=False))
    shapes=collision.get_simple_collision_from_static_mesh(mesh)
    count=collision.get_simple_collision_shape_count(shapes)
    if count<1 or count>12:raise RuntimeError('Boulder collision hulls unavailable: '+mesh.get_name()+' '+str(count))
    body=mesh.get_editor_property('body_setup')
    body.set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_SIMPLE_AND_COMPLEX)
    body.set_editor_property('double_sided_geometry',True)
    lib.set_metadata_tag(mesh,'TerraBoulderCollision',key);lib.save_loaded_asset(mesh)
    unreal.log('TERRA_BOULDER_COLLISION '+mesh.get_name()+' hulls='+str(count)+' physical=simple queries=complex')
