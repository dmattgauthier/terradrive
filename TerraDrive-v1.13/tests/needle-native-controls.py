"""Read-only C5 needle-light study using original native shaders and buffers.

Only copied case metadata/uniforms/draw lists are changed. Source snapshots,
assets, shader text, geometry, and the shared QA harness remain untouched.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import importlib.util
import json
from PIL import Image, ImageStat
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--capture', required=True, type=Path,
                    help='Immutable native capture directory containing manifest.json and render-scenes.json')
parser.add_argument('--out', required=True, type=Path,
                    help='Separate directory for labelled diagnostic frames and report')
parser.add_argument('--harness', type=Path,
                    default=Path(__file__).with_name('shader-compile-native.py'),
                    help='Capture-matched native renderer; defaults to sibling shader-compile-native.py')
args = parser.parse_args()
capture = args.capture.resolve()
output = args.out.resolve()
module_path = args.harness.resolve()
output.mkdir(parents=True, exist_ok=True)
assert capture.resolve() != output.resolve()
hash_file = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((capture / 'manifest.json').read_text())
manifest_hash = hash_file(capture / 'manifest.json')
assert hash_file(module_path) == manifest['harnessHashes']['tests/shader-compile-native.py']
for source in capture.iterdir():
    if source.is_file() and source.suffix in ('.bin', '.vert', '.frag'):
        destination = output / source.name
        if not destination.exists():
            destination.symlink_to(source)

spec = importlib.util.spec_from_file_location('pine_native_renderer', module_path)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
native.Image, native.ImageStat = Image, ImageStat
scenes = json.loads((capture / 'render-scenes.json').read_text())
assets = Path(scenes['assets'])
environments = [native.replay_pmrem(recipe, output, assets) for recipe in scenes['pmrem']]
cases = {case['name']: case for case in scenes['cases']}
replays, changes = [], []

def replay(source_name, suffix, strength=.62, shadow=True, visible=True, direct=True):
    original = cases[source_name]
    case = copy.deepcopy(original)
    case['name'] = 'diagnostic-' + source_name.removeprefix('native-hdr-') + '-' + suffix
    case['metadata']['diagnosticOnly'] = True
    changed = []
    for index, draw in enumerate(list(case['draws'])):
        if draw['sourceMesh'] != 'pine-needle-crowns':
            continue
        if not visible:
            case['draws'].remove(draw)
            changed.append({'draw': index, 'sourceMesh': draw['sourceMesh'], 'action': 'hide visible needle draw only; retain all shadow casters'})
            continue
        for name, value in [('tdNeedleTransmission', strength), ('receiveShadow', shadow)]:
            before = draw['uniforms'][name]
            if value != before:
                changed.append({'draw': index, 'sourceMesh': draw['sourceMesh'], 'uniform': name, 'before': before, 'after': value})
                draw['uniforms'][name] = value
        if not direct:
            for name in ['directionalLights[0].color', 'spotLights[0].color']:
                before = draw['uniforms'][name]
                draw['uniforms'][name] = [0, 0, 0]
                changed.append({'draw': index, 'sourceMesh': draw['sourceMesh'], 'uniform': name, 'before': before, 'after': [0, 0, 0]})
    assert case['metadata']['cameraMatrix'] == original['metadata']['cameraMatrix']
    assert case['metadata']['projectionMatrix'] == original['metadata']['projectionMatrix']
    case['metadata']['diagnosticChanges'] = changed
    replays.append(native.render(case, output, assets))
    changes.append({'name': case['name'], 'sourceCase': source_name, 'changes': changed})
    return case['name']

names = {}
for period, source_name in [('day', 'native-hdr-bank-tree'), ('sunset', 'native-hdr-sunset-bank-tree')]:
    names[period] = {
        'trial': replay(source_name, 'trial'),
        'zero': replay(source_name, 'zero', strength=0),
        'trialNoShadow': replay(source_name, 'trial-needle-no-shadow', shadow=False),
        'zeroNoShadow': replay(source_name, 'zero-needle-no-shadow', strength=0, shadow=False),
        'noNeedles': replay(source_name, 'no-needles', visible=False)
    }
names['day']['trialNoDirect'] = replay('native-hdr-bank-tree', 'trial-needle-no-direct', direct=False)
names['day']['zeroNoDirect'] = replay('native-hdr-bank-tree', 'zero-needle-no-direct', strength=0, direct=False)

def array(name, directory=output):
    return np.asarray(Image.open(directory / (name + '.png')).convert('RGB'), dtype=np.float64)

analysis = {}
for period, group in names.items():
    images = {key: array(name) for key, name in group.items()}
    zero, trial, empty = [images[k] for k in ['zero', 'trial', 'noNeedles']]
    source_name = 'native-hdr-' + ('bank-tree' if period == 'day' else 'sunset-bank-tree')
    original = array(source_name, capture)
    assert np.array_equal(original, trial), 'Unchanged replay must exactly reproduce the actual trial frame'
    y, x = np.indices(zero.shape[:2])
    box = (x >= 409) & (x <= 683) & (y >= 72) & (y <= 483) & (np.abs(x - 551) > 6)
    # Fixed camera crown rectangle, trunk excluded, strong needle/background contrast.
    mask = box & (np.abs(zero - empty).max(axis=2) > 80)
    luminance = lambda a: a @ np.array([.2126, .7152, .0722])
    stats = {}
    for key in ['zero', 'trial', 'zeroNoShadow', 'trialNoShadow']:
        a = images[key]
        values = luminance(a)[mask]
        stats[key] = {
            'medianRGB8': np.median(a[mask], axis=0).tolist(),
            'displayLumaPercentiles10_50_90': np.percentile(values, [10, 50, 90]).tolist(),
            'displayLumaMean': float(values.mean()),
            'displayLumaBelow32Fraction': float((values < 32).mean()),
            'displayLumaBelow48Fraction': float((values < 48).mean())
        }
    delta = trial - zero
    no_shadow_delta = images['trialNoShadow'] - images['zeroNoShadow']
    changed = np.abs(delta).max(axis=2) > 0
    influence = np.abs(zero - empty).max(axis=2) > 0
    dark_shadow = mask & (np.abs(no_shadow_delta).max(axis=2) > 5) & (np.abs(delta).max(axis=2) == 0)
    analysis[period] = {
        'roi': {'inclusiveX': [409, 683], 'inclusiveY': [72, 483], 'excludedTrunkAbsoluteXDistanceFrom551AtMost': 6,
                'minimumNeedleRemovalRGB8Contrast': 80, 'selectedPixels': int(mask.sum())},
        'stats': stats,
        'unchangedTrialReplayPixelIdenticalToCapture': True,
        'changedPixelsWholeFrame': int(changed.sum()),
        'changedPixelsOutsideNeedleRemovalSupport': int((changed & ~influence).sum()),
        'crownMeanAbsoluteRGB8Difference': np.abs(delta[mask]).mean(axis=0).tolist(),
        'crownDisplayLumaMeanIncrease': float(luminance(delta)[mask].mean()),
        'crownNeedlePixelsUnchangedInShadowButChangedByMoreThan5WithoutShadow': int(dark_shadow.sum()),
        'method': 'RGB8 display-space statistics from unchanged actual native programs. Camera rectangle and trunk exclusion are fixed. Strong needle-only removal contrast selects visible crown pixels; all shadow passes remain unchanged. Shadow controls disable receiveShadow only on the needle material. These are relative image measurements, not physical reflectance or browser performance.'
    }
assert np.array_equal(array(names['day']['trialNoDirect']), array(names['day']['zeroNoDirect'])), 'The added response must vanish when incident direct-light colors are zero'
assert hash_file(capture / 'manifest.json') == manifest_hash
report = {
    'diagnosticOnly': True, 'capture': str(capture), 'output': str(output),
    'inputManifestSHA256': manifest_hash,
    'inputRenderScenesSHA256': hash_file(capture / 'render-scenes.json'),
    'sourceHashes': manifest['sourceHashes'], 'captureHarnessHashes': manifest['harnessHashes'],
    'diagnosticScriptSHA256': hash_file(Path(__file__)),
    'nativeRendererSHA256': hash_file(module_path),
    'dayTrialAndZeroPixelIdenticalWithNeedleDirectLightDisabled': True,
    'changes': changes, 'replays': replays, 'environments': environments,
    'analysis': analysis,
    'method': 'Diagnostic native GLES replay of the immutable C5 production inputs. No shader source, asset, camera, geometry, density, global color, source capture or shared QA harness edited.'
}
(output / 'diagnostic-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'output': str(output), 'analysis': analysis, 'noDirectPixelIdentity': True}, indent=2))
