"""Offline CC0 photographic sky cube, imported as Unreal's HDR TextureCube."""
cube=load_texture('native/kloofendal_48d_partly_cloudy_puresky_1k.hdr')
if not isinstance(cube,unreal.TextureCube):
    raise RuntimeError('HDR sky must import as a TextureCube')
m=lib.load_asset('/Game/Materials/M_Sky')
edit.delete_all_material_expressions(m)
sample=edit.create_material_expression(m,unreal.MaterialExpressionTextureSampleParameterCube,-200,0)
sample.set_editor_property('parameter_name','EnvironmentSky');sample.set_editor_property('texture',cube)
sample.set_editor_property('sampler_type',unreal.MaterialSamplerType.SAMPLERTYPE_COLOR if cube.get_editor_property('srgb') else unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
direction=edit.create_material_expression(m,unreal.MaterialExpressionWorldPosition,-600,0)
normal=edit.create_material_expression(m,unreal.MaterialExpressionNormalize,-400,0)
if not edit.connect_material_expressions(direction,'',normal,''):
    raise RuntimeError('Sky direction normalization connection failed')
# MaterialEditingLibrary resolves editor pin names: Coordinates is shortened
# to UVs by UMaterialGraphNode in UE 5.8. A failed connection otherwise cooks
# a default material while AutomationTool still reports success.
if not edit.connect_material_expressions(normal,'',sample,'UVs'):
    raise RuntimeError('HDR sky cube UV direction connection failed')
mul=edit.create_material_expression(m,unreal.MaterialExpressionMultiply,0,0)
if not edit.connect_material_expressions(sample,'RGB',mul,'A'):
    raise RuntimeError('HDR sky radiance connection failed')
mul.set_editor_property('const_b',.30)
if not edit.connect_material_property(mul,'',unreal.MaterialProperty.MP_EMISSIVE_COLOR):
    raise RuntimeError('HDR sky emissive connection failed')
m.set_editor_property('two_sided',True);m.set_editor_property('is_sky',True)
m.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_UNLIT)
edit.recompile_material(m);lib.save_loaded_asset(m)
