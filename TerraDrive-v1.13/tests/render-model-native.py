"""Draw per-material VehicleView exports with the existing native EGL bindings.

This module does not modify the terrain compiler harness. It adds material state,
per-draw program/uniform switching, and transparent back/front passes for models.
"""
import ctypes as C
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('terra_native_model_bindings', Path(__file__).with_name('shader-compile-native.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
native.Image = Image
replay_source_hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                        for path in [Path(__file__), Path(__file__).with_name('shader-compile-native.py')]}

u, i, f, p = C.c_uint, C.c_int, C.c_float, C.c_void_p
depth_mask = native.proc('glDepthMask', None, C.c_ubyte)
blend = native.proc('glBlendFuncSeparate', None, u, u, u, u)
cull = native.proc('glCullFace', None, u)
front_face = native.proc('glFrontFace', None, u)
polygon_offset = native.proc('glPolygonOffset', None, f, f)
active_attribute = native.proc('glGetActiveAttrib', None, u, u, i, C.POINTER(i), C.POINTER(i), C.POINTER(u), C.c_char_p)
attribute_constant = native.proc('glVertexAttrib4f', None, u, f, f, f, f)

source = Path(sys.argv[1])
base = source.parent
manifest = json.loads(source.read_text())
baseline_label = manifest.get('baselineLabel') or ('Published ' + manifest['baselineRevision'][:8] if manifest.get('baselineRevision') else 'No published model')
case_names = {case['name'] for case in manifest['cases']}
environment_reports = [native.replay_pmrem(recipe, base, base) for recipe in manifest.get('pmrem', [])]
programs, compile_results, vao_cache = {}, {}, {}
for shader in manifest['shaders']:
    program, result = native.compile_pair((base / shader['vertex']).read_text(), (base / shader['fragment']).read_text(), True)
    assert all(result[stage]['ok'] for stage in ['vertex', 'fragment', 'link']), (shader['name'], result)
    programs[shader['name']] = program
    compile_results[shader['name']] = result
print(f"Model shader gate PASS: {len(programs)} actual assembled material programs. {native.info['renderer']}", flush=True)


def bind_geometry(program, draw):
    key = (program, draw['geometry'])
    if key in vao_cache:
        native.bind_vao(vao_cache[key][0])
        bind_defaults(program, draw)
        return
    vao = native.object_id(native.gen_vao)
    native.bind_vao(vao)
    buffers = []
    for name, attribute in draw['attributes'].items():
        location = native.attrloc(program, name.encode())
        if location < 0:
            continue
        raw = (base / attribute['file']).read_bytes()
        data = C.create_string_buffer(raw)
        buffer = native.object_id(native.gen_buf)
        buffers.append(buffer)
        native.bind_buf(0x8892, buffer)
        native.buf_data(0x8892, len(raw), data, 0x88E4)
        native.enable_attr(location)
        native.attrptr(location, attribute['itemSize'], 0x1406, 0, 0, None)
    bind_defaults(program, draw)
    raw = (base / draw['index']).read_bytes()
    data = C.create_string_buffer(raw)
    buffer = native.object_id(native.gen_buf)
    buffers.append(buffer)
    native.bind_buf(0x8893, buffer)
    native.buf_data(0x8893, len(raw), data, 0x88E4)
    vao_cache[key] = (vao, buffers)


def bind_defaults(program, draw):
    # Replay the actual material's constants, including BodyDamage's white
    # color and zero tdDamage on shared rigid wheel/axle materials.
    count = i()
    native.getprogram(program, 0x8B89, C.byref(count))
    for index in range(count.value):
        name = C.create_string_buffer(256)
        size, kind = i(), u()
        active_attribute(program, index, len(name), None, C.byref(size), C.byref(kind), name)
        key_name = name.value.decode()
        if key_name in draw['attributes']:
            continue
        supplied = draw['material']['defaultAttributeValues'].get(key_name, [])
        defaults = tuple((supplied + [0, 0, 0, 1][len(supplied):])[:4])
        assert key_name in ['color', 'uv', 'uv1', 'uv2', 'uv3', 'tdDamage'], f'Unbound model attribute: {key_name}'
        attribute_constant(native.attrloc(program, name.value), *defaults)


def material_state(material, mirrored):
    if material['transparent']:
        native.enable(0x0BE2)
        blend(1 if material['premultipliedAlpha'] else 0x0302, 0x0303, 1, 0x0303)
    else:
        native.disable(0x0BE2)
    depth_mask(int(material['depthWrite']))
    (native.enable if material['depthTest'] else native.disable)(0x0B71)
    native.depth(0x0203)
    front_face(0x0900 if mirrored else 0x0901)
    if material['side'] == 2:
        native.disable(0x0B44)
    else:
        native.enable(0x0B44)
        cull(0x0404 if material['side'] == 1 else 0x0405)
    if material['polygonOffset']:
        native.enable(0x8037)
        polygon_offset(material['polygonOffsetFactor'], material['polygonOffsetUnits'])
    else:
        native.disable(0x8037)


width, height = manifest['cases'][0]['width'], manifest['cases'][0]['height']
scale = manifest['cases'][0].get('supersample', 1)
render_width, render_height = width * scale, height * scale
framebuffer = native.framebuffer(render_width, render_height)
reports = []
for case in manifest['cases']:
    assert (case['width'], case['height']) == (width, height)
    assert case.get('supersample', 1) == scale
    for shadow in case.get('shadows', []):
        specification = shadow['target']
        target = native.render_targets.get(specification['id']) or native.create_render_target(specification)
        native.bind_fb(0x8D40, target['framebuffer'])
        native.viewport(0, 0, specification['width'], specification['height'])
        depth_mask(1)
        native.clearcolor(1, 1, 1, 1)
        native.clear(0x4000 | 0x0100)
        for draw in shadow['draws']:
            program = programs[draw['shader']]
            native.use(program)
            material_state(draw['material'], draw['mirrored'])
            native.uniforms(program, draw['uniforms'], base, base)
            bind_geometry(program, draw)
            native.draw(0x0004, draw['count'], 0x1405, p(draw['start'] * 4))
            native.error('model shadow ' + draw['sourceMesh'])
    native.bind_fb(0x8D40, framebuffer)
    native.viewport(0, 0, render_width, render_height)
    depth_mask(1)
    native.clearcolor(*case['clearColor'])
    native.clear(0x4000 | 0x0100)
    for draw in case['draws']:
        program = programs[draw['shader']]
        native.use(program)
        material_state(draw['material'], draw['mirrored'])
        native.uniforms(program, draw['uniforms'], base, base)
        bind_geometry(program, draw)
        native.draw(0x0004, draw['count'], 0x1405, p(draw['start'] * 4))
        native.error('model draw ' + draw['sourceMesh'])
    native.finish()
    pixels = (C.c_ubyte * (render_width * render_height * 4))()
    native.read(0, 0, render_width, render_height, 0x1908, 0x1401, pixels)
    native.error('model pixels ' + case['name'])
    image = Image.frombytes('RGBA', (render_width, render_height), bytes(pixels)).transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert('RGB')
    if scale > 1:
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    output = base / (case['name'] + '.png')
    image.save(output)
    stats = ImageStat.Stat(image)
    assert max(stats.stddev) > 12, 'Model render is blank or nearly uniform: ' + case['name']
    background = Image.new('RGB', image.size, image.getpixel((0, 0)))
    changed_bounds = ImageChops.difference(image, background).getbbox()
    assert changed_bounds, 'Model is not visible: ' + case['name']
    framed = case['metadata'].get('projectedModelBounds')
    if framed and not case['metadata'].get('intentionalDetailCrop', False):
        assert framed['min'][0] > 0 and framed['min'][1] > 0 and framed['max'][0] < width and framed['max'][1] < height, 'Vehicle geometry outside frame: ' + case['name']
    reports.append({key: value for key, value in case.items() if key not in ['draws', 'shadows']} | {
        'image': str(output), 'pixelMean': stats.mean, 'pixelStddev': stats.stddev, 'drawnBounds': changed_bounds,
    })
    print('Rendered', case['name'], changed_bounds, flush=True)


try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
except OSError:
    font = ImageFont.load_default()


def sheet(filename, groups):
    # An intentionally filtered/control run must never pull stale PNGs from a
    # previous checkpoint into its contact sheets or overwrite their captions.
    groups = [[item for item in group if item[0] in case_names and (base / (item[0] + '.png')).exists()] for group in groups]
    groups = [group for group in groups if group]
    if not groups:
        return
    thumb_width, thumb_height, caption = 550, 360, 54
    sheet = Image.new('RGB', (max(map(len, groups)) * thumb_width, len(groups) * (thumb_height + caption)), '#eef1f3')
    pen = ImageDraw.Draw(sheet)
    for row, group in enumerate(groups):
        for column, (name, label) in enumerate(group):
            image = Image.open(base / (name + '.png')).resize((thumb_width, thumb_height), Image.Resampling.LANCZOS)
            x, y = column * thumb_width, row * (thumb_height + caption)
            sheet.paste(image, (x, y))
            pen.text((x + 10, y + thumb_height + 7), label, fill='#20262a', font=font)
            record = next((case for case in manifest['cases'] if case['name'] == name), None)
            ruler = record and record['metadata'].get('scaleBar')
            if ruler:
                length = ruler['pixels'] * thumb_width / width
                yy = y + thumb_height + 40
                pen.line((x + 12, yy, x + 12 + length, yy), fill='#20262a', width=2)
                for fraction in [0, .5, 1]:
                    xx = x + 12 + fraction * length
                    pen.line((xx, yy - 4, xx, yy + 4), fill='#20262a', width=2)
                pen.text((x + 20 + length, yy - 10), '1 m', fill='#20262a', font=font)
    sheet.save(base / filename)


vehicles = list(dict.fromkeys(case['vehicle'] for case in manifest['cases']))
sheet('model-comparison.png', [[
    (f'baseline-{vehicle}-front', vehicle + ' · before front'),
    (f'current-{vehicle}-front', 'Current front'),
    (f'baseline-{vehicle}-rear', 'Before rear'),
    (f'current-{vehicle}-rear', 'Current rear'),
] for vehicle in vehicles])
sheet('model-current-overview.png', [[
    (f'current-{vehicle}-front', vehicle + ' · current front'),
    (f'current-{vehicle}-rear', vehicle + ' · current rear'),
] for vehicle in vehicles])
for vehicle in vehicles:
    # File names retain the historical right/left camera switches. State the
    # signed model axis explicitly: +Z is forward; +X is the driver's side on
    # these left-hand-drive body models, not the vehicle's right-hand side.
    view_labels = {'ortho-right': '+X side (driver)', 'ortho-left': '-X side (passenger)',
                   'ortho-front': 'front (+Z)', 'ortho-rear': 'rear (-Z)'}
    sheet(f'model-{vehicle}-orthographic.png', [[
        (f'baseline-{vehicle}-{view}', baseline_label + ' · ' + view_labels[view]),
        (f'current-{vehicle}-{view}', 'Current · ' + view_labels[view]),
    ] for view in ['ortho-right', 'ortho-left', 'ortho-front', 'ortho-rear']])
    sheet(f'model-{vehicle}-details.png', [[
        (f'current-{vehicle}-detail-front', 'Current · front corner'),
        (f'current-{vehicle}-detail-side-rear', 'Current · rear side panel'),
        (f'current-{vehicle}-detail-rear', 'Current · rear corner'),
    ]])
    sheet(f'model-{vehicle}-air-suspension.png', [[
        (f'state-{state}-{vehicle}-front', label + ' · front'),
        (f'state-{state}-{vehicle}-rear', label + ' · rear'),
        (f'state-{state}-{vehicle}-ortho-right', label + ' · side'),
    ] for state, label in [('normal','Normal'),('increased','Increased +46mm'),('extract','Extract +149mm'),('launch-lowered','Launch preparation −50.8mm estimate'),('articulated','Physical one-wheel obstacle')]])
    sheet(f'model-{vehicle}-paint.png', [[
        (f'state-normal-{vehicle}-front', 'White body · factory trim'),
        (f'state-blue-paint-{vehicle}-front', 'Blue body · same factory trim'),
    ]])
    if any(f'baseline-{vehicle}-{view}' in case_names for view in ['detail-front', 'detail-side-rear', 'detail-rear']):
        sheet(f'model-{vehicle}-detail-comparison.png', [[
            (f'baseline-{vehicle}-{view}', baseline_label + ' geometry · ' + label),
            (f'current-{vehicle}-{view}', 'Current geometry · ' + label),
        ] for view, label in [('detail-front', 'front corner'), ('detail-side-rear', 'rear side panel'), ('detail-rear', 'rear corner')]
          if f'baseline-{vehicle}-{view}' in case_names and f'current-{vehicle}-{view}' in case_names])
    sheet(f'model-{vehicle}-signals.png', [
        [(f'current-{vehicle}-detail-front-headlights-off', 'Headlights off'), (f'current-{vehicle}-detail-front-headlights-on', 'Headlights on')],
        [(f'current-{vehicle}-ortho-rear-lights-off', 'Rear lights · no brake / D'), (f'current-{vehicle}-ortho-rear-braking', 'Brake applied / D'), (f'current-{vehicle}-ortho-rear-reverse', 'No brake / R')],
    ])
    sheet(f'model-{vehicle}-brake-details.png', [[
        (f'current-{vehicle}-{view}-lights-off', label + ' · no brake / D'),
        (f'current-{vehicle}-{view}-braking', label + ' · brake applied / D'),
    ] for view, label in [('detail-rear', 'Rear corner'), ('detail-side-rear', 'Side-facing guide')]])
    sheet(f'model-{vehicle}-cabins.png', [[
        (f'baseline-{vehicle}-{view}', baseline_label + ' · ' + label),
        (f'current-{vehicle}-{view}', 'Current · ' + label),
    ] for view, label in [('cabin-through-windscreen', 'through actual windscreen'),
                         ('cabin-through-side', 'through actual side glass'),
                         ('cabin-interior', 'inside-cabin QA camera')]])
sheet('model-winch-fronts.png', [[(f'current-{vehicle}-front-winch', vehicle + ' · winch installed') for vehicle in vehicles]])
underbody_vehicles = [vehicle for vehicle in vehicles if vehicle in ['wrangler-rubicon', 'civic-sport']]
if underbody_vehicles:
    sheet('model-underbody.png', [[(f'current-{vehicle}-underside', vehicle + ' · underside diagnostic') for vehicle in underbody_vehicles]])
sheet('model-upgrades.png', [[
    (f'upgrade-{vehicle}-front', vehicle + ' · fitted tires and suspension'),
    (f'upgrade-{vehicle}-rear', 'Fitted build · rear'),
    (f'upgrade-{vehicle}-underside', 'Fitted build · driveline and suspension'),
] for vehicle in vehicles])

comparison = []
for vehicle in vehicles:
    for view in ['front', 'rear', 'detail-front', 'detail-side-rear', 'detail-rear',
                 'cabin-through-windscreen', 'cabin-through-side', 'cabin-interior']:
        if f'baseline-{vehicle}-{view}' not in case_names or f'current-{vehicle}-{view}' not in case_names:
            continue
        if not (base / f'baseline-{vehicle}-{view}.png').exists() or not (base / f'current-{vehicle}-{view}.png').exists():
            continue
        before = Image.open(base / f'baseline-{vehicle}-{view}.png')
        after = Image.open(base / f'current-{vehicle}-{view}.png')
        difference = ImageChops.difference(before, after)
        comparison.append({'vehicle': vehicle, 'view': view, 'meanAbsoluteDifference': ImageStat.Stat(difference).mean, 'changedBounds': difference.getbbox()})
signal_checks = []
for vehicle in vehicles:
    for off_suffix, on_suffix, label in [
        ('detail-front-headlights-off', 'detail-front-headlights-on', 'headlights'),
        ('ortho-rear-lights-off', 'ortho-rear-braking', 'brake lamps'),
        ('ortho-rear-lights-off', 'ortho-rear-reverse', 'reverse lamps'),
        ('detail-rear-lights-off', 'detail-rear-braking', 'brake lamps through rear-corner optics'),
        ('detail-side-rear-lights-off', 'detail-side-rear-braking', 'brake lamps through side-facing optics'),
    ]:
        off_name, on_name = f'current-{vehicle}-{off_suffix}', f'current-{vehicle}-{on_suffix}'
        if off_name not in case_names or on_name not in case_names:
            continue
        difference = ImageChops.difference(Image.open(base / (off_name + '.png')), Image.open(base / (on_name + '.png')))
        channels = difference.split()
        strongest = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
        visible = strongest.point(lambda value: 255 if value >= 3 else 0)
        visible_pixels = round(ImageStat.Stat(visible).sum[0] / 255)
        assert visible_pixels >= 8, f'{vehicle}: {label} state has no visible effect through the actual model geometry'
        signal_checks.append({'vehicle': vehicle, 'feature': label, 'offCase': off_name, 'onCase': on_name,
                              'pixelsChangedByAtLeastThree8BitLevels': visible_pixels, 'changedBounds': visible.getbbox(),
                              'meanAbsolute8BitRGBDifference': ImageStat.Stat(difference).mean})
report = {
    'backend': native.info, 'baseline': manifest.get('baseline'), 'baselineRevision': manifest['baselineRevision'], 'baselineLabel': manifest.get('baselineLabel'), 'sourceHashes': manifest['sourceHashes'], 'replaySourceHashes': replay_source_hashes,
    'method': manifest['method'], 'sourceStudy': manifest.get('sourceStudy'), 'canvasBackend': manifest.get('canvasBackend'), 'compile': compile_results, 'environments': environment_reports, 'cases': reports, 'comparisons': comparison, 'signalChecks': signal_checks,
    'limits': ['Native EGL/GLES, not a browser screenshot or frame-rate benchmark',
               'Actual Canvas2D decal calls use Skia/Nimbus Sans as Arial; font rasterization can differ from the browser' if manifest.get('canvasBackend') else 'Canvas text decals omitted in this older exported checkpoint',
               'Small spare-tread instances expanded with exact matrices', 'Shared runtime studio radiance/lights and depth shadows; neutral study backdrop', '2x supersampling differs from browser MSAA', 'Orthographic ruler uses exact pixels-per-metre; detail views intentionally crop the model'],
}
report_name = 'model-render-report.json' if source.stem == 'model-scenes' else source.stem + '-render-report.json'
(base / report_name).write_text(json.dumps(report, indent=2))
for vao, buffers in vao_cache.values():
    native.del_buf(len(buffers), (u * len(buffers))(*buffers))
    native.del_vao(1, C.byref(u(vao)))
for program in programs.values():
    native.delete_program(program)
print(f'Native model QA PASS: {len(reports)} model views. Artifacts: {base}', flush=True)
