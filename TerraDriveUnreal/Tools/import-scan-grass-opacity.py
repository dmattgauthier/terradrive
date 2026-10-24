"""Rebuild only the scan-grass material using the ordinary importer's helpers.

Run with Unreal's Python commandlet after the original CC0 opacity map and
generated material binding are available. No meshes or maps are imported.
"""
import ast
import hashlib
import json
import os
import unreal

root=unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
source=os.path.join(root,'SourceAssets')
texture_root=os.path.join(root,'..','TerraDrive-v1.13','dist','assets','terrain')
tools=unreal.AssetToolsHelpers.get_asset_tools()
edit=unreal.MaterialEditingLibrary
lib=unreal.EditorAssetLibrary

def file_sha(path):
    result=hashlib.sha256()
    with open(path,'rb') as stream:
        for block in iter(lambda:stream.read(4*1024*1024),b''):result.update(block)
    return result.hexdigest()

def protected_files():
    result={}
    for directory in ['Content/Meshes','Content/Maps','Content/NativeData','Content/AutomotiveWinterScene/Maps','SourceAssets']:
        for folder,_,files in os.walk(os.path.join(root,directory)):
            for filename in files:
                path=os.path.join(folder,filename)
                if directory=='SourceAssets' and not filename.endswith('.obj'):continue
                result[os.path.relpath(path,root).replace('\\','/')]=file_sha(path)
    return result

before=protected_files()
mask_path=os.path.join(root,'Vendor','Environment','grass_medium_01','textures','grass_medium_01_alpha_1k.png')
mask_sha=file_sha(mask_path)
if mask_sha!='711a8e49af758d6a6ce1f610db858899a27be19da6d1866bd35c13bc7b8ffeff':
    raise RuntimeError('The acquired original grass opacity map does not match its CC0 source')
with open(os.path.join(source,'import.json'),encoding='utf8') as stream:data=json.load(stream)
d=next(item for item in data['materials'] if item['id']=='M_346')
if d.get('alpha')!='native/grass_medium_01/textures/grass_medium_01_alpha_1k.png' or d.get('alphaTest')!=.5:
    raise RuntimeError('The generated scan-grass opacity binding is missing')

# Compile the exact function definitions used by ordinary full imports.
# Avoid its top-level mesh, terrain, Fab and winter-map preparation loops.
helper_path=os.path.join(root,'Tools','import-assets.py')
with open(helper_path,encoding='utf8') as stream:tree=ast.parse(stream.read(),helper_path)
helpers=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in ['load_texture','material']]
if len(helpers)!=2:raise RuntimeError('The shared importer helper definitions changed')
exec(compile(ast.Module(body=helpers,type_ignores=[]),helper_path,'exec'),globals())
color=[a*b for a,b in zip(d['color'],d.get('vertexTint',[1,1,1]))]
mat=material(d['id'],color,d['roughness'],d['metallic'],d['opacity'],
    texture=load_texture(d.get('diffuse')),alpha=load_texture(d.get('alpha'),True),
    normal=load_texture(d.get('normal')),rough_map=load_texture(d.get('roughMap'),True),
    clip=d['alphaTest'],instance_tint=d.get('instanceTint',False),
    clearcoat=d.get('clearcoat',0),coat_roughness=d.get('coatRoughness',.15),emissive=d.get('emissive'),role=d.get('role',''))
node=edit.get_material_property_input_node(mat,unreal.MaterialProperty.MP_OPACITY_MASK)
output=edit.get_material_property_input_node_output_name(mat,unreal.MaterialProperty.MP_OPACITY_MASK)
texture=node.get_editor_property('texture') if node else None
valid=(mat.get_editor_property('blend_mode')==unreal.BlendMode.BLEND_MASKED and
    abs(mat.get_editor_property('opacity_mask_clip_value')-.5)<1e-6 and node is not None and
    str(output).upper()=='R' and texture is not None and texture.get_name()=='grass_medium_01_alpha_1k' and
    node.get_editor_property('sampler_type')==unreal.MaterialSamplerType.SAMPLERTYPE_MASKS and
    texture.get_editor_property('compression_settings')==unreal.TextureCompressionSettings.TC_MASKS and
    not texture.get_editor_property('srgb'))
if not valid:raise RuntimeError('The imported grass material does not use the exact authored R-channel cutout')
after=protected_files()
if before!=after:raise RuntimeError('Targeted grass opacity import changed a protected mesh, map, OBJ or NativeData file')
report={'pass':True,'material':mat.get_path_name(),'blendMode':'MASKED','clip':.5,'maskChannel':str(output),
    'maskTexture':texture.get_path_name(),'maskSampler':str(node.get_editor_property('sampler_type')),
    'maskSHA256':mask_sha,'protectedFilesUnchanged':True,'protectedFileSHA256':after,
    'sourceImporterSHA256':file_sha(helper_path)}
with open(os.path.join(root,'Saved','grass-opacity-import.json'),'w',encoding='utf8') as stream:json.dump(report,stream,indent=2)
with open(os.path.join(root,'Saved','grass-opacity-import-complete.txt'),'w',encoding='utf8') as stream:stream.write(mask_sha+'\n')
unreal.log('TERRA_SCAN_GRASS_OPACITY_IMPORT_COMPLETE material=M_346 mask=R clip=0.5 protectedFiles='+str(len(after)))
