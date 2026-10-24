"""Unified native ground: filtered coverage, shared samplers, branch only into present biomes."""
blend_report=json.load(open(os.path.join(root,'Saved','terrain-transitions.json'),encoding='utf8'))
def blend_mask(name):
    filename=os.path.join(source,name+'.tga');digest=hashlib.sha256(open(filename,'rb').read()).hexdigest();dest='/Game/Textures/'+name
    tex=lib.load_asset(dest) if lib.does_asset_exist(dest) else None
    if not tex or lib.get_metadata_tag(tex,'TerraBlendHash')!=digest:
        task=unreal.AssetImportTask();task.filename=filename;task.destination_path='/Game/Textures';task.destination_name=name
        task.automated=True;task.save=True;task.replace_existing=True;tools.import_asset_tasks([task]);tex=lib.load_asset(dest)
        if not tex:raise RuntimeError('Transition texture import failed: '+name)
        tex.set_editor_property('srgb',False);tex.set_editor_property('compression_no_alpha',False);tex.set_editor_property('compression_settings',unreal.TextureCompressionSettings.TC_VECTOR_DISPLACEMENTMAP)
        tex.set_editor_property('address_x',unreal.TextureAddress.TA_CLAMP);tex.set_editor_property('address_y',unreal.TextureAddress.TA_CLAMP)
        lib.set_metadata_tag(tex,'TerraBlendHash',digest);lib.save_loaded_asset(tex)
    return tex
masks=[blend_mask('TerrainBlendA'),blend_mask('TerrainBlendB')]
prefix,body=terrain_code.split('TerraSurface f;',1)
prefix=prefix.rsplit('};',1)[0]
body=body.replace('f.','')
signature=hashlib.sha256((terrain_code+blend_report['signature']+open(os.path.join(root,'Tools','terrain-ground-blend.py'),encoding='utf8').read()+repr([(name,[[t.get_path_name() for t in layer['maps']] for layer in layers],wet,scale) for name,layers,wet,scale in terrain_specs])).encode()).hexdigest()
dest='/Game/Materials/Terrain_GroundBlend';m=lib.load_asset(dest) if lib.does_asset_exist(dest) else tools.create_asset('Terrain_GroundBlend','/Game/Materials',unreal.Material,unreal.MaterialFactoryNew())
if lib.get_metadata_tag(m,'TerraGroundBlendSignature')!=signature:
    edit.delete_all_material_expressions(m);m.set_editor_property('two_sided',True);m.set_editor_property('tangent_space_normal',False);m.set_editor_property('blend_mode',unreal.BlendMode.BLEND_OPAQUE)
    pins=['Primary','NormalMap','RoughMap','Secondary','SecondaryNormal','SecondaryRough','Accent','AccentNormal','AccentRough']
    params=','.join('Texture2D '+p for p in pins)+',SamplerState Shared,float3 World,float3 GeoNormal,float Wear,float LooseSoil,float3 Scales,float3 NormalSigns,float3 RoughChannels,float Biome,float Wetness,out float Roughness,out float3 SurfaceNormal'
    for p in pins:body=body.replace(p+'Sampler','Shared')
    library=prefix+'\nfloat3 evaluate('+params+'){\n'+body+'\n}\n};\nTerraSurface f;\n'
    textures={};calls=[]
    for biome,(surface_name,layers,wetness,scales) in enumerate(terrain_specs):
        args=[]
        for layer in layers:
            for tex in layer['maps']:
                key=tex.get_path_name()
                if key not in textures:textures[key]=(tex,'T'+str(len(textures)))
                args.append(textures[key][1])
        vector=lambda values:'float3('+','.join(str(x) for x in values)+')'
        wet_arg='saturate((1-w[6])*2.4)' if biome==6 else str(wetness)
        # Match Material Shared:Wrap, including World-group anisotropic filtering.
        # The global trilinear sampler blurs scan detail at grazing angles.
        args+=['View.MaterialTextureBilinearWrapedSampler','World','GeoNormal','Wear','LooseSoil',vector(scales),vector([x['normalY'] for x in layers]),vector([x['roughG'] for x in layers]),str(biome),wet_arg,'rr','nn']
        calls.append('[branch] if(w[%d]>.0005){float rr;float3 nn;float3 cc=f.evaluate(%s);color+=cc*w[%d];rough+=rr*w[%d];normal+=nn*w[%d];}'%(biome,','.join(args),biome,biome,biome))
    code=library+'''float2 uv=(World.yx*.01+400.0)/800.5+(.25/800.5);
float4 a=Texture2DSample(BlendA,GlobalTrilinearClampedSampler,uv);
float3 b=Texture2DSample(BlendB,GlobalTrilinearClampedSampler,uv).rgb;
float w[7]={a.r,a.g,a.b,a.a,b.r,b.g,b.b};float sum=0;float paved=saturate(w[1]*16);
// Competitive coverage exposes patches of each original surface. Detail is
// confined to mixed fringes; pavement keeps a quieter, narrow shoulder.
[unroll]for(int i=0;i<7;i++){[branch]if(w[i]>0&&w[i]<1){
float2 seed=float2(i*13.7,i*7.3);
float grain=(f.noise(World.xy*.0025+seed)*.50+f.noise(World.xy*.011+seed*2.3)*.32+f.noise(World.xy*.041+seed*4.7)*.18)*2-1;
w[i]=pow(w[i],lerp(3.2,1.5,paved))*exp2(grain*lerp(i==6?8.0:7.0,.35,paved));}sum+=w[i];}
[unroll]for(int i=0;i<7;i++)w[i]/=max(sum,.0001);
float3 color=0,normal=0;float rough=0;
'''+ '\n'.join(calls)+'\nRoughness=rough;SurfaceNormal=normalize(normal);Specular=.12+.33*w[6];return color;'
    custom=edit.create_material_expression(m,unreal.MaterialExpressionCustom,0,0);custom.set_editor_property('code',code);custom.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    all_inputs=['World','GeoNormal','Wear','LooseSoil','BlendA','BlendB']+[pin for tex,pin in textures.values()]
    inputs=[]
    for name in all_inputs:item=unreal.CustomInput();item.set_editor_property('input_name',name);inputs.append(item)
    custom.set_editor_property('inputs',inputs)
    outputs=[]
    for name,kind in [('Roughness',unreal.CustomMaterialOutputType.CMOT_FLOAT1),('SurfaceNormal',unreal.CustomMaterialOutputType.CMOT_FLOAT3),('Specular',unreal.CustomMaterialOutputType.CMOT_FLOAT1)]:
        item=unreal.CustomOutput();item.set_editor_property('output_name',name);item.set_editor_property('output_type',kind);outputs.append(item)
    custom.set_editor_property('additional_outputs',outputs)
    for name,klass,output in [('World',unreal.MaterialExpressionWorldPosition,''),('GeoNormal',unreal.MaterialExpressionVertexNormalWS,''),('Wear',unreal.MaterialExpressionVertexColor,'R'),('LooseSoil',unreal.MaterialExpressionVertexColor,'G')]:
        node=edit.create_material_expression(m,klass,-600,-200);edit.connect_material_expressions(node,output,custom,name)
    for tex,pin in [(masks[0],'BlendA'),(masks[1],'BlendB')]+list(textures.values()):
        obj=edit.create_material_expression(m,unreal.MaterialExpressionTextureObject,-600,100);obj.set_editor_property('texture',tex)
        if not tex.get_editor_property('srgb'):obj.set_editor_property('sampler_type',unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL if tex.get_editor_property('compression_settings')==unreal.TextureCompressionSettings.TC_NORMALMAP else unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        edit.connect_material_expressions(obj,'',custom,pin)
    for output,prop in [('',unreal.MaterialProperty.MP_BASE_COLOR),('Roughness',unreal.MaterialProperty.MP_ROUGHNESS),('SurfaceNormal',unreal.MaterialProperty.MP_NORMAL),('Specular',unreal.MaterialProperty.MP_SPECULAR)]:
        if not edit.connect_material_property(custom,output,prop):raise RuntimeError('Ground blend output failed: '+output)
    edit.recompile_material(m);lib.set_metadata_tag(m,'TerraGroundBlendSignature',signature);lib.save_loaded_asset(m)
    open(os.path.join(root,'Saved','terrain-ground-shader.hlsl'),'w').write(code)
json.dump({'version':1,'signature':signature,'material':dest,'coverageTextures':[t.get_path_name() for t in masks],'biomes':7,'sharedSamplers':True},open(os.path.join(root,'Saved','terrain-ground-bindings.json'),'w'),indent=2)
unreal.log('TERRA_GROUND_BLEND_READY '+dest)
