"""Masked, lit tire rubber and tread impressions. Geometry follows soil height."""
for name,road in [('TireSkid',True),('TireImprint',False)]:
    dest='/Game/Materials/'+name
    m=lib.load_asset(dest) if lib.does_asset_exist(dest) else tools.create_asset(name,'/Game/Materials',unreal.Material,unreal.MaterialFactoryNew())
    edit.delete_all_material_expressions(m)
    m.set_editor_property('two_sided',True)
    m.set_editor_property('blend_mode',unreal.BlendMode.BLEND_MASKED)
    m.set_editor_property('opacity_mask_clip_value',.4)
    color=edit.create_material_expression(m,unreal.MaterialExpressionVertexColor,-450,0)
    edit.connect_material_property(color,'RGB',unreal.MaterialProperty.MP_BASE_COLOR)
    uv=edit.create_material_expression(m,unreal.MaterialExpressionTextureCoordinate,-450,150)
    custom=edit.create_material_expression(m,unreal.MaterialExpressionCustom,-150,150)
    custom.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT1)
    item=unreal.CustomInput();item.set_editor_property('input_name','UV');custom.set_editor_property('inputs',[item])
    custom.set_editor_property('code',
        'float edge=smoothstep(0,.09,min(UV.x,1-UV.x)); return edge*(.72+.28*sin(UV.x*77+sin(UV.y*24)));' if road else
        'float u=UV.x;float v=frac(UV.y*8+abs(u-.5)*1.2);float rib=step(.14,frac(u*5));return step(.14,v)*step(v,.88)*rib*step(.025,u)*step(u,.975);')
    edit.connect_material_expressions(uv,'',custom,'UV')
    edit.connect_material_property(custom,'',unreal.MaterialProperty.MP_OPACITY_MASK)
    for prop,value in [(unreal.MaterialProperty.MP_ROUGHNESS,.96),(unreal.MaterialProperty.MP_SPECULAR,.06)]:
        node=edit.create_material_expression(m,unreal.MaterialExpressionConstant,-100,350)
        node.set_editor_property('r',value);edit.connect_material_property(node,'',prop)
    edit.recompile_material(m);lib.save_loaded_asset(m)
