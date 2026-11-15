"""Build the native tire carcass material used by the import commandlet."""
import hashlib
import json
import os
import re
import unreal

TIRE_ASSET = re.compile(r'_tire(?:_size[0-9]+_0)?$')
ROOT = '/Game/Materials/TireCarcass'
NORMAL = '/Game/AutomotiveMaterials/Materials/Exterior/Rubber/Textures/T_Tire_Sidewall_N'
EDIT = unreal.MaterialEditingLibrary
LIB = unreal.EditorAssetLibrary

# The tread rolls through a stationary contact plane. C++ supplies the plane
# in scaled mesh coordinates and a world-normal displacement in local units.
# Leave the wheel bead fixed and widen only the lower sidewall.
OFFSET = r"""
if (Shape.w <= 0.01) return 0;
float distance = dot(Local, Plane.xyz) + Plane.w;
float radial = length(Local.xz);
float wall = saturate((radial - Shape.x) / max(1.0, Shape.y - Shape.x));
float inner = smoothstep(0.0, 0.24, wall);
float flatten = min(Shape.z, max(0.0, -distance)) * inner;
float shoulder = 1.0 - smoothstep(0.80, 1.0, wall);
float sector = 1.0 - smoothstep(0.0, 4.0 + Shape.w * 2.0, max(0.0, distance));
float bulge = sign(Local.y) * Push.w * sector * inner * shoulder;
return TransformLocalVectorToWorld(Parameters, Push.xyz * flatten + float3(0, bulge, 0));
"""

def connect(node, output, material, property_name):
    if not EDIT.connect_material_property(node, output, property_name):
        raise RuntimeError('Cannot connect tire material property ' + str(property_name))

def build_tire_carcass_materials(manifest):
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    name = 'M_NativeTireCarcass'
    path = ROOT + '/' + name
    signature = hashlib.sha256(open(__file__, 'rb').read()).hexdigest()
    material = LIB.load_asset(path) if LIB.does_asset_exist(path) else tools.create_asset(
        name, ROOT, unreal.Material, unreal.MaterialFactoryNew())
    if LIB.get_metadata_tag(material, 'TerraCarcassSignature') != signature:
        EDIT.delete_all_material_expressions(material)
        material.set_editor_property('two_sided', True)
        color = EDIT.create_material_expression(material, unreal.MaterialExpressionVectorParameter, -330, 160)
        color.set_editor_property('parameter_name', 'RubberTint')
        color.set_editor_property('default_value', unreal.LinearColor(.009, .011, .012, 1))
        rough = EDIT.create_material_expression(material, unreal.MaterialExpressionScalarParameter, -330, 260)
        rough.set_editor_property('parameter_name', 'RubberRoughness')
        rough.set_editor_property('default_value', .92)
        connect(color, 'RGB', material, unreal.MaterialProperty.MP_BASE_COLOR)
        connect(rough, '', material, unreal.MaterialProperty.MP_ROUGHNESS)

        normal_texture = LIB.load_asset(NORMAL)
        if not normal_texture:
            raise RuntimeError('Automotive tire sidewall normal is missing')
        normal = EDIT.create_material_expression(material, unreal.MaterialExpressionTextureSample, -330, 370)
        normal.set_editor_property('texture', normal_texture)
        normal.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        uv = EDIT.create_material_expression(material, unreal.MaterialExpressionTextureCoordinate, -600, 370)
        uv.set_editor_property('u_tiling', 2.)
        uv.set_editor_property('v_tiling', 2.)
        if not EDIT.connect_material_expressions(uv, '', normal, 'UVs'):
            raise RuntimeError('Cannot bind tire normal UVs')
        connect(normal, 'RGB', material, unreal.MaterialProperty.MP_NORMAL)

        local = EDIT.create_material_expression(material, unreal.MaterialExpressionPreSkinnedPosition, -710, -430)
        deformation = EDIT.create_material_expression(material, unreal.MaterialExpressionCustom, -330, -400)
        deformation.set_editor_property('code', OFFSET)
        deformation.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT3)
        inputs = []
        for pin in ('Local', 'Plane', 'Push', 'Shape'):
            item = unreal.CustomInput()
            item.set_editor_property('input_name', pin)
            inputs.append(item)
        deformation.set_editor_property('inputs', inputs)
        if not EDIT.connect_material_expressions(local, '', deformation, 'Local'):
            raise RuntimeError('Cannot bind tire mesh relative position')
        for index, pin in enumerate(('Plane', 'Push', 'Shape')):
            vector = EDIT.create_material_expression(material, unreal.MaterialExpressionVectorParameter, -710, -330 + 110*index)
            vector.set_editor_property('parameter_name', 'Carcass' + pin)
            vector.set_editor_property('default_value', unreal.LinearColor(0, 0, 0, 0))
            vector.set_editor_property('use_custom_primitive_data', True)
            vector.set_editor_property('primitive_data_index', index*4)
            if not EDIT.connect_material_expressions(vector, 'RGBA', deformation, pin):
                raise RuntimeError('Cannot bind tire ' + pin)
        connect(deformation, '', material, unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)
        LIB.set_metadata_tag(material, 'TerraCarcassSignature', signature)
        EDIT.recompile_material(material)
        LIB.save_loaded_asset(material)

    slots = {slot for asset in manifest['assets'] if TIRE_ASSET.search(asset['name']) for slot in asset['slots']}
    results = {}
    for record in manifest['materials']:
        slot = record['id']
        if slot not in slots:
            continue
        color = [a*b for a, b in zip(record['color'], record.get('vertexTint', [1, 1, 1]))]
        instance_sig = hashlib.sha256(json.dumps([signature, color, record['roughness']]).encode()).hexdigest()
        name = 'MI_TireCarcass_' + slot
        path = ROOT + '/' + name
        instance = LIB.load_asset(path) if LIB.does_asset_exist(path) else tools.create_asset(
            name, ROOT, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        if LIB.get_metadata_tag(instance, 'TerraCarcassSignature') != instance_sig:
            EDIT.set_material_instance_parent(instance, material)
            EDIT.set_material_instance_vector_parameter_value(instance, 'RubberTint', unreal.LinearColor(*color, 1))
            EDIT.set_material_instance_scalar_parameter_value(instance, 'RubberRoughness', record['roughness'])
            EDIT.update_material_instance(instance)
            LIB.set_metadata_tag(instance, 'TerraCarcassSignature', instance_sig)
            LIB.save_loaded_asset(instance)
        results[slot] = instance
    if results.keys() != slots:
        raise RuntimeError('Missing tire deformation material slots')
    unreal.log('TERRA_TIRE_CARCASS_MATERIALS count=' + str(len(results)))
    return results

if __name__ == '__main__':
    root = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
    with open(os.path.join(root, 'SourceAssets', 'import.json'), encoding='utf8') as stream:
        build_tire_carcass_materials(json.load(stream))
