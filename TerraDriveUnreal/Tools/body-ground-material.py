"""Project-owned vertex-colored, lit body scuffs; no tire rubber texture."""
import json
import os
import unreal

lib=unreal.EditorAssetLibrary
edit=unreal.MaterialEditingLibrary
asset_tools=unreal.AssetToolsHelpers.get_asset_tools()
path='/Game/Materials/BodyGroundScuff'
material=lib.load_asset(path) if lib.does_asset_exist(path) else asset_tools.create_asset('BodyGroundScuff','/Game/Materials',unreal.Material,unreal.MaterialFactoryNew())
if not isinstance(material,unreal.Material):
    raise RuntimeError('Body ground material is unavailable or has an incompatible asset type')
edit.delete_all_material_expressions(material)
material.set_editor_property('two_sided',True)
material.set_editor_property('blend_mode',unreal.BlendMode.BLEND_OPAQUE)
color=edit.create_material_expression(material,unreal.MaterialExpressionVertexColor,-400,0)
# VertexColor's RGB output is the unnamed default pin in UE 5.8.
if not edit.connect_material_property(color,'',unreal.MaterialProperty.MP_BASE_COLOR):
    raise RuntimeError('Failed to connect body-scuff vertex colors')
for prop,value in [(unreal.MaterialProperty.MP_ROUGHNESS,.96),(unreal.MaterialProperty.MP_SPECULAR,.025)]:
    node=edit.create_material_expression(material,unreal.MaterialExpressionConstant,-400,200)
    node.set_editor_property('r',value)
    if not edit.connect_material_property(node,'',prop):raise RuntimeError('Failed to connect body-scuff surface property')
edit.recompile_material(material)
if not lib.save_loaded_asset(material):raise RuntimeError('Body ground material failed to save')
root=unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
with open(os.path.join(root,'Saved','body-ground-material.json'),'w',encoding='utf-8') as stream:
    json.dump({'pass':True,'asset':path,'vertexColored':True,'opaque':True,'purpose':'Pale broken rigid-surface body scrapes. Soft ground uses its physically compacted terrain mesh and ground material.'},stream,indent=2)
unreal.log('TERRA_BODY_GROUND_MATERIAL_SAVED '+path)
