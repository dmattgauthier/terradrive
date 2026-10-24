"""Read-only source/copy texture exports for diagnosing native ground detail.

Run alone with UnrealEditor-Cmd -run=pythonscript. No asset settings are
changed and no Unreal packages are saved. PNGs contain the source mip exported
by TextureExporterPNG; JSON separately records the loaded texture dimensions
and its build/streaming settings.
"""
import json
import os
import struct
import unreal

root = os.path.abspath(unreal.Paths.project_dir())
destination = os.path.join(root, 'Saved', 'GroundInspection')
os.makedirs(destination, exist_ok=True)
lib = unreal.EditorAssetLibrary
winter = '/Game/AutomotiveWinterScene/Megascans/'
sources = []
for directory, prefix, channels in [
        ('Surfaces/CleanSnow', 'T_CleanSnow', ['BC', 'N', 'TRO']),
        ('Surfaces/SnowRoad', 'T_Road_Extra', ['BC', 'N', 'TRD']),
        ('3D_Assets/Road_01', 'T_Road_01_Wet', ['BC', 'N', 'TRD']),
        ('3D_Assets/Road_01', 'T_Road_01', ['BC', 'N', 'TRO'])]:
    sources.extend(winter+directory+'/'+prefix+'_'+channel for channel in channels)
sources.extend('/Game/MWLandscapeAutoMaterial/Textures/Ground/TEX_MWAM_Grass_'+channel
               for channel in ['col', 'nrm'])
settings = ['srgb', 'compression_settings', 'compression_no_alpha', 'compression_quality',
            'flip_green_channel', 'lod_group', 'lod_bias', 'mip_gen_settings',
            'max_texture_size', 'never_stream', 'virtual_texture_streaming',
            'filter', 'address_x', 'address_y', 'use_legacy_gamma',
            'preserve_border', 'do_scale_mips_for_alpha_coverage',
            'adjust_brightness', 'adjust_brightness_curve', 'adjust_saturation',
            'adjust_vibrance', 'adjust_rgb_curve', 'adjust_hue',
            'lossy_compression_amount', 'downscale', 'downscale_options']
report = {'sourceExport': 'Unreal TextureExporterPNG source mip; independent of cooked LOD bias',
          'assets': [], 'missingCopies': [], 'errors': []}


def property_value(obj, key):
    value = obj.get_editor_property(key)
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    return str(value)


for source in sources:
    name = source.rsplit('/', 1)[-1]
    for kind, path in [('Original', source), ('Copy', '/Game/Textures/Ground_'+name)]:
        if not lib.does_asset_exist(path):
            if kind == 'Copy':
                report['missingCopies'].append(path)
                continue
            raise RuntimeError('Required inspection source texture is missing: '+path)
        texture = lib.load_asset(path)
        if not isinstance(texture, unreal.Texture2D):
            raise RuntimeError('Expected Texture2D: '+path)
        record = {'kind': kind, 'path': path, 'name': name, 'settings': {}, 'unavailableSettings': []}
        for key in settings:
            try:
                record['settings'][key] = property_value(texture, key)
            except Exception:
                record['unavailableSettings'].append(key)
        try:
            record['loadedSize'] = [texture.blueprint_get_size_x(), texture.blueprint_get_size_y()]
        except Exception as error:
            record['loadedSizeError'] = str(error)
        try:
            record['importData'] = [str(filename) for filename in
                texture.get_editor_property('asset_import_data').extract_filenames()]
        except Exception:
            pass
        output_dir = os.path.join(destination, kind)
        os.makedirs(output_dir, exist_ok=True)
        output = os.path.join(output_dir, name+'.png')
        record['reusedSourceExport'] = os.path.isfile(output)
        success = record['reusedSourceExport']
        if not success:
            task = unreal.AssetExportTask()
            task.object = texture
            task.exporter = unreal.TextureExporterPNG()
            task.filename = output
            task.automated = True
            task.prompt = False
            task.replace_identical = True
            success = unreal.Exporter.run_asset_export_task(task)
        record['png'] = output
        record['exported'] = bool(success and os.path.isfile(output))
        if record['exported']:
            with open(output, 'rb') as stream:
                header = stream.read(29)
            if header[:8] != b'\x89PNG\r\n\x1a\n':
                raise RuntimeError('Texture exporter did not write PNG: '+output)
            record['sourceExportSize'] = list(struct.unpack('>II', header[16:24]))
            record['pngBitDepth'], record['pngColorType'] = header[24], header[25]
            record['pngBytes'] = os.path.getsize(output)
        else:
            report['errors'].append('PNG export failed: '+path)
        record['normalDecode'] = ('TC_NORMALMAP: GPU BC5 RG is sampled as encoded [0,1] by raw Texture2DSampleGrad; reconstruct XY with RG*2-1 and Z=sqrt(1-dot(XY,XY)). Material normal sample expressions add their own decode.'
            if record['settings'].get('compression_settings') == '<TextureCompressionSettings.TC_NORMALMAP: 1>'
            else 'See compression_settings and srgb; source PNG is not a decoded runtime normal sample.')
        report['assets'].append(record)
        unreal.log('TERRA_GROUND_INSPECT %s %s loaded=%s source=%s' %
                   (kind, name, record.get('loadedSize'), record.get('sourceExportSize')))
    unreal.SystemLibrary.collect_garbage()

with open(os.path.join(destination, 'inspection.json'), 'w', encoding='utf8') as stream:
    json.dump(report, stream, indent=2)
if report['errors']:
    raise RuntimeError('Ground inspection exports incomplete: '+repr(report['errors']))
unreal.log('TERRA_GROUND_INSPECTION_COMPLETE assets=%d missingUnusedCopies=%d report=%s' %
           (len(report['assets']), len(report['missingCopies']), os.path.join(destination, 'inspection.json')))
