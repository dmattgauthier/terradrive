"""Isolate visible terrain artifacts by replaying immutable native inputs.

These are labelled diagnostics, not release captures. They change only the
listed material uniforms or remove the named water draw, using the production
programs, photographed assets, lights, camera, and mesh buffers already captured.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

parser = argparse.ArgumentParser()
parser.add_argument('--capture', required=True, type=Path)
parser.add_argument('--out', required=True, type=Path)
parser.add_argument('--study', choices=['ridge-water', 'bed', 'sky', 'corner'], default='ridge-water')
args = parser.parse_args()
capture, output = args.capture.resolve(), args.out.resolve()
assert capture != output, 'Diagnostics must never overwrite their captured inputs'
output.mkdir(parents=True, exist_ok=True)
for source in capture.iterdir():
    if source.is_file() and not (output / source.name).exists():
        (output / source.name).symlink_to(source)

module_path = Path(__file__).with_name('shader-compile-native.py')
spec = importlib.util.spec_from_file_location('terrain_native_renderer', module_path)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
native.Image, native.ImageStat = Image, ImageStat
scenes = json.loads((capture / 'render-scenes.json').read_text())
manifest = json.loads((capture / 'manifest.json').read_text())
assets = Path(scenes['assets'])
environment_results = [native.replay_pmrem(recipe, output, assets) for recipe in scenes.get('pmrem', [])]
cases = {case['name']: case for case in scenes['cases']}
results, changes = [], []


def replay(source_name, name, edit):
    case = copy.deepcopy(cases[source_name])
    case['name'] = 'diagnostic-' + name
    case['metadata']['diagnosticOnly'] = True
    delta = edit(case)
    assert case['metadata']['cameraMatrix'] == cases[source_name]['metadata']['cameraMatrix']
    assert case['metadata']['projectionMatrix'] == cases[source_name]['metadata']['projectionMatrix']
    case['metadata']['diagnosticChanges'] = delta
    results.append(native.render(case, output, assets))
    changes.append({'name': case['name'], 'sourceCase': source_name, 'changes': delta})
    return case['name']


def ridge_normal_off(case):
    changed = []
    for index, draw in enumerate(case['draws']):
        if draw['sourceMesh'] == 'distant-ridge':
            changed.append({'draw': index, 'sourceMesh': draw['sourceMesh'], 'uniform': 'normalScale',
                            'before': draw['uniforms']['normalScale'], 'after': [0, 0]})
            draw['uniforms']['normalScale'] = [0, 0]
    assert len(changed) == 2, 'Both actual runtime ridge layers must participate'
    return changed


def water_control(hdr=True, sun=True, remove=False):
    def change(case):
        selected = [draw for draw in case['draws'] if draw['sourceMesh'] == 'depth-masked-water-wetland']
        assert len(selected) == 1, 'Expected the actual wetland water draw'
        if remove:
            case['draws'].remove(selected[0])
            return [{'sourceMesh': selected[0]['sourceMesh'], 'action': 'hide water sheet only'}]
        draw, changed = selected[0], []
        for name, enabled, value in [('envMapIntensity', hdr, 0), ('directionalLights[0].color', sun, [0, 0, 0])]:
            if not enabled:
                changed.append({'sourceMesh': draw['sourceMesh'], 'uniform': name,
                                'before': draw['uniforms'][name], 'after': value})
                draw['uniforms'][name] = value
        return changed
    return change


def bed_control(hdr=True, sun=True, coat=True):
    def change(case):
        changed = water_control(remove=True)(case)
        for draw in case['draws']:
            if draw['sourceMesh'] != 'ground-wetland':
                continue
            for name, enabled, value in [('envMapIntensity', hdr, 0), ('directionalLights[0].color', sun, [0, 0, 0]), ('clearcoat', coat, 0)]:
                if not enabled:
                    changed.append({'sourceMesh': draw['sourceMesh'], 'uniform': name,
                                    'before': draw['uniforms'][name], 'after': value})
                    draw['uniforms'][name] = value
        assert len(changed) > 1
        return changed
    return change


def sky_control(infinite=False, hidden=False, double_ridge=False):
    def change(case):
        changed = []
        for draw in list(case['draws']):
            if draw['sourceMesh'] == 'procedural-atmosphere':
                if hidden:
                    case['draws'].remove(draw)
                    changed.append({'sourceMesh': draw['sourceMesh'], 'action': 'hide sky draw only'})
                elif infinite:
                    source_name = draw['shader']
                    new_name = source_name + '-infinite-diagnostic'
                    old = 'gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);'
                    new = 'gl_Position=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position.z=gl_Position.w;'
                    vertex = (capture / (source_name + '.vert')).read_text()
                    assert vertex.count(old) == 1, 'Expected the finite production sky vertex transform'
                    (output / (new_name + '.vert')).write_text(vertex.replace(old, new))
                    (output / (new_name + '.frag')).write_text((capture / (source_name + '.frag')).read_text())
                    draw['shader'] = new_name
                    changed.append({'sourceMesh': draw['sourceMesh'], 'action': 'replace only finite sky vertex transform with current runtime infinite transform', 'before': old, 'after': new,
                                    'originalVertexSHA256': hashlib.sha256(vertex.encode()).hexdigest(), 'diagnosticVertexSHA256': hashlib.sha256(vertex.replace(old, new).encode()).hexdigest()})
            if double_ridge and draw['sourceMesh'] == 'distant-ridge':
                changed.append({'sourceMesh': draw['sourceMesh'], 'uniform': 'render side', 'before': draw['side'], 'after': 2})
                draw['side'] = 2
        assert changed
        return changed
    return change


def comparison(before, after, region):
    original, altered = [Image.open(output / (name + '.png')).convert('RGB') for name in [before, after]]
    difference = ImageChops.difference(original, altered)
    def highlight(picture):
        pixels = picture.crop(region)
        values = pixels.get_flattened_data() if hasattr(pixels, 'get_flattened_data') else pixels.getdata()
        return sum(1 for rgb in values if min(rgb) >= 250)
    return {'before': before, 'after': after, 'fixedRegion': region,
            'fullImageMeanAbsoluteDifference': ImageStat.Stat(difference).mean,
            'regionMeanAbsoluteDifference': ImageStat.Stat(difference.crop(region)).mean,
            'changedBounds': difference.getbbox(),
            'regionPixelsClippedAt250': {'before': highlight(original), 'after': highlight(altered)}}


if args.study == 'ridge-water':
    ridge_original = replay('native-hdr-trail-verge', 'ridge-original', lambda case: [])
    ridge_flat = replay('native-hdr-trail-verge', 'ridge-normal-off', ridge_normal_off)
    water_original = replay('native-hdr-wetland-shore', 'water-original', lambda case: [])
    water_hdr_off = replay('native-hdr-wetland-shore', 'water-HDR-off', water_control(hdr=False))
    water_sun_off = replay('native-hdr-wetland-shore', 'water-directional-off', water_control(sun=False))
    water_lights_off = replay('native-hdr-wetland-shore', 'water-HDR-and-directional-off', water_control(hdr=False, sun=False))
    water_hidden = replay('native-hdr-wetland-shore', 'water-sheet-hidden', water_control(remove=True))
    comparisons = [comparison(ridge_original, ridge_flat, (0, 80, 1100, 300))]
    comparisons += [comparison(water_original, name, (200, 300, 1050, 715))
                    for name in [water_hdr_off, water_sun_off, water_lights_off, water_hidden]]
elif args.study == 'bed':
    bed_original = replay('native-hdr-wetland-shore', 'bed-original', water_control(remove=True))
    bed_hdr_off = replay('native-hdr-wetland-shore', 'bed-HDR-off', bed_control(hdr=False))
    bed_sun_off = replay('native-hdr-wetland-shore', 'bed-directional-off', bed_control(sun=False))
    bed_coat_off = replay('native-hdr-wetland-shore', 'bed-coat-off', bed_control(coat=False))
    comparisons = [comparison(bed_original, name, (200, 300, 1050, 715))
                   for name in [bed_hdr_off, bed_sun_off, bed_coat_off]]
else:
    comparisons = []
    sky_views = [('native-hdr-trail-verge', 'trail', (20, 236, 270, 268)),
                 ('native-hdr-sand-dunes', 'sand', (850, 252, 1095, 280))]
    if args.study == 'corner':
        sky_views = [('native-hdr-corner-inward', 'corner', (0, 0, 1100, 360))]
    for source_name, short, region in sky_views:
        original = replay(source_name, short + '-sky-original', lambda case: [])
        infinite = replay(source_name, short + '-sky-infinite', sky_control(infinite=True))
        hidden = replay(source_name, short + '-sky-hidden', sky_control(hidden=True))
        double = replay(source_name, short + '-ridge-double-side', sky_control(double_ridge=True))
        comparisons += [comparison(original, name, region) for name in [infinite, hidden, double]]
hash_file = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
report = {'diagnosticOnly': True, 'inputCapture': str(capture),
          'inputManifestSHA256': hash_file(capture / 'manifest.json'),
          'sourceHashes': manifest['sourceHashes'], 'captureHarnessHashes': manifest['harnessHashes'],
          'diagnosticScriptSHA256': hash_file(Path(__file__)),
          'nativeRendererSHA256': hash_file(module_path), 'changes': changes,
          'replays': results, 'comparisons': comparisons, 'environments': environment_results,
          'method': 'Replay actual captured GLES programs and inputs. Only explicitly recorded uniforms, draw isolation or finite/infinite sky vertex transform changed; no runtime edits. Native software diagnostic, not a browser screenshot or release source capture.'}
if args.study == 'corner':
    old, new, hidden = [Image.open(output / ('diagnostic-corner-' + name + '.png')).convert('RGB')
                        for name in ['sky-original', 'sky-infinite', 'sky-hidden']]
    region = (0, 0, 1100, 360)
    gained = sum(old.getpixel((x, y)) == hidden.getpixel((x, y))
                 and new.getpixel((x, y)) != hidden.getpixel((x, y))
                 for y in range(region[1], region[3]) for x in range(region[0], region[2]))
    report['skyCoverageControl'] = {'fixedRegion': region, 'previouslyUncoveredPixelsGainingSky': gained,
                                    'method': 'Original equals the sky-hidden replay at the pixel, while the infinite-sky replay differs; all other draws are unchanged.'}
(output / 'diagnostic-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'output': str(output), 'comparisons': comparisons}, indent=2))
