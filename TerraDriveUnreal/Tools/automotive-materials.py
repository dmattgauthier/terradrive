"""Bind original vehicle geometry to the locally acquired Epic Automotive pack.

Executed by import-assets.py. Licensed UAssets remain local; this recipe is
public. Parents are never edited. Import through Fab > Add to Project first.
"""
automotive_parents = {
    'paint': 'Exterior/CarPaint/MI_CarPaint_White',
    'carbon': 'Exterior/CarbonFiber/MI_CarbonFiber',
    'black': 'Exterior/Plastic/MI_Plastic_Glossy',
    'rubber': 'Exterior/Rubber/MI_Rubber_Rough',
    'metal': 'Exterior/Metal/MI_Metal_Chrome_01',
    'satinMetal': 'Exterior/Metal/MI_Metal_Chrome_01',
    'plastic': 'Interior/Plastic/MI_Plastic_SmallGrain_black',
    'alcantara': 'Interior/Leather/MI_Suede_Grey',
    'wheel': 'Exterior/CarPaint/MI_CarPaint_Black',
    'rotor': 'Exterior/BrakeRotor/MI_BrakeRotor_Carbon_Ceramic',
    'brakeSteel': 'Exterior/BrakeRotor/MI_BrakeRotor_Iron_Clean',
}
automotive_overrides = {
    'paint': {'PaintRoughness': .48, 'MinRoughness': .075, 'MaxRoughness': .12,
              'OrangePeelIntensity': .025, 'ClearcoatIntensity': 1.},
    'carbon': {'Clear Coat Amount': .85, 'Clear Coat Roughness': .18,
               'Normal Intensity': .14, 'Roughness Min': .32, 'Roughness Max': .42, 'Anisotropy': 0.},
    'black': {'Roughness Min': .13, 'Roughness Max': .22, 'Normal Intensity': .12},
    'metal': {'Roughness Min': .16, 'Roughness Max': .26},
    'satinMetal': {'Roughness Min': .34, 'Roughness Max': .46},
    'wheel': {'MinRoughness': .22, 'MaxRoughness': .30, 'OrangePeelIntensity': .015, 'PaintRoughness': .45},
    'rotor': {'Roughness Min': .36, 'Roughness Max': .51, 'Crack Intensity': .15},
    'brakeSteel': {'Roughness Min': .31, 'Roughness Max': .47, 'Normal Intensity': .20},
}
automotive_instances = {}
automotive_bindings = []
for record in data['materials']:
    role = record.get('automotive', '')
    if not role:
        continue
    if role not in automotive_parents:
        raise RuntimeError('Unknown automotive finish: ' + role)
    parent_path = '/Game/AutomotiveMaterials/Materials/' + automotive_parents[role]
    if not lib.does_asset_exist(parent_path):
        raise RuntimeError('Missing Epic Automotive Materials: add the acquired pack to TerraDrive through Epic Launcher/Fab. Required: ' + parent_path)
    # Key by source material too: chrome, radiator slats and plate backing
    # need different tints even though they use the same Epic master family.
    owner = record.get('automotiveOwner', 'urus') or 'urus'
    name = ('MI_Urus_' if owner == 'urus' else 'MI_Vehicle_' + owner + '_') + role + '_' + record['id']
    dest = '/Game/Materials/Automotive/' + name
    instance = lib.load_asset(dest) if lib.does_asset_exist(dest) else tools.create_asset(
        name, '/Game/Materials/Automotive', unreal.MaterialInstanceConstant,
        unreal.MaterialInstanceConstantFactoryNew())
    parent = lib.load_asset(parent_path)
    edit.set_material_instance_parent(instance, parent)
    scalars = set(str(n) for n in edit.get_scalar_parameter_names(instance))
    vectors = set(str(n) for n in edit.get_vector_parameter_names(instance))
    switch_names = set(str(n) for n in edit.get_static_switch_parameter_names(instance))
    switches_to_disable = ['Add Dust', 'Add Fingerprints', 'Add Stains']
    if role in ('paint', 'wheel'): switches_to_disable += ['UseFlakes']
    if role == 'carbon': switches_to_disable += ['Use Anisotropy']
    for parameter in switches_to_disable:
        if parameter in switch_names:
            edit.set_material_instance_static_switch_parameter_value(instance, parameter, False)
            if edit.get_material_instance_static_switch_parameter_value(instance, parameter):
                raise RuntimeError('Could not disable automotive switch: ' + parameter)
    values = {'Dust Intensity': 0., 'Fingerprints Intensity': 0., 'Stains Intensity': 0.}
    values.update(automotive_overrides.get(role, {}))
    for parameter, value in values.items():
        if parameter in scalars:
            # UE 5.8's setter returns false even after setting the value
            # (MaterialEditingLibrary.cpp); verify the actual readback.
            edit.set_material_instance_scalar_parameter_value(instance, parameter, value)
            if abs(edit.get_material_instance_scalar_parameter_value(instance, parameter)-value)>1.e-5:
                raise RuntimeError('Could not set automotive scalar: ' + parameter)
    color = record['color']
    # THREE source colors have already been converted from sRGB to linear.
    # The former .14 linear override made authored near-black carbon a pale
    # grey (about .41 sRGB), flattening the bonnet, intakes and spoiler. Keep
    # the designed charcoal tint and the acquired parent's weave/clear coat.
    if role == 'rotor': color = [.20, .20, .20]
    color_name = 'BaseColor' if role in ('paint', 'wheel') else 'Tint'
    if color_name in vectors:
        edit.set_material_instance_vector_parameter_value(instance, color_name, unreal.LinearColor(*color, 1))
        actual = edit.get_material_instance_vector_parameter_value(instance, color_name)
        if max(abs(a-b) for a,b in zip([actual.r,actual.g,actual.b],color))>1.e-5:
            raise RuntimeError('Could not set automotive color: ' + name)
    overrides = instance.get_editor_property('base_property_overrides')
    overrides.set_editor_property('override_two_sided', True)
    overrides.set_editor_property('two_sided', True)
    instance.set_editor_property('base_property_overrides', overrides)
    edit.update_material_instance(instance)
    lib.save_loaded_asset(instance)
    materials[record['id']] = instance
    switches = {str(n): edit.get_material_instance_static_switch_parameter_value(instance,n)
                for n in edit.get_static_switch_parameter_names(instance)}
    automotive_bindings.append({'slot': record['id'], 'role': role, 'owner': owner, 'instance': dest, 'parent': parent_path, 'switches': switches,
        'sourceLinearColor':record['color'], 'boundLinearColor':list(color),
        'scalarReadback':{parameter:edit.get_material_instance_scalar_parameter_value(instance,parameter)
                          for parameter in values if parameter in scalars}})
with open(os.path.join(root, 'Saved', 'automotive-bindings.json'), 'w', encoding='utf8') as stream:
    json.dump({'publisher': 'Epic Games', 'pack': 'Automotive Materials', 'bindings': automotive_bindings}, stream, indent=2)
if automotive_bindings:
    unreal.log('TERRA_AUTOMOTIVE_BOUND ' + str(len(automotive_bindings)))
