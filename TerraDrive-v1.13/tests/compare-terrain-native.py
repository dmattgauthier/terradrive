"""Compare source-verified native terrain captures without inventing imagery.

Pixel differences establish that production rendering changed, not that larger
numbers mean better graphics. Final visual conclusions require image review.
"""
import argparse
import hashlib
import io
import json
import math
import shutil
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

parser = argparse.ArgumentParser()
parser.add_argument('--baseline', required=True, type=Path)
parser.add_argument('--current', required=True, type=Path)
parser.add_argument('--out', required=True, type=Path)
parser.add_argument('--draft', action='store_true', help='Allow a diagnostic capture without final source-stability proof; visibly label it draft.')
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_complete_png(picture, path):
    """Publish a contact sheet only after its complete PNG has been verified."""
    encoded = io.BytesIO()
    picture.save(encoded, format='PNG')
    data = encoded.getvalue()
    temporary = path.with_name(path.name + '.tmp')
    assert temporary.write_bytes(data) == len(data), f'Incomplete PNG write: {path}'
    with Image.open(temporary) as check:
        check.verify()
    assert temporary.stat().st_size == len(data), f'Truncated PNG: {path}'
    temporary.replace(path)


def compare_camera_metadata(old, new, name):
    """Only source-declared perspective far-plane coefficients may change.

    Pose, coordinate, FOV/aspect/offset terms and the recovered near plane stay
    fixed. A different farClip value alone cannot excuse an arbitrary matrix.
    """
    for key in ['camera', 'cameraMatrix', 'coordinate']:
        assert old.get(key) == new.get(key), f'Camera changed for {name}: {key}'
    a, b = old.get('projectionMatrix'), new.get('projectionMatrix')
    if a is None or b is None:
        assert a == b, f'Projection metadata missing on one side for {name}'
        return {'cameraPoseFOVNearIdentical': True, 'projectionIdentical': True, 'farPlaneChange': None}
    assert len(a) == len(b) == 16 and all(isinstance(value, (int, float)) and math.isfinite(value) for value in a + b), f'Invalid projection for {name}'
    changed = [i for i in range(16) if a[i] != b[i]]
    assert set(changed) <= {10, 14}, f'Camera FOV/aspect/offset changed for {name}: {changed}'
    if not changed:
        return {'cameraPoseFOVNearIdentical': True, 'projectionIdentical': True, 'farPlaneChange': None}
    old_far, new_far = old.get('farClip'), new.get('farClip')
    assert all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0 for value in [old_far, new_far]), f'Far-plane change needs finite source farClip metadata for {name}'
    assert old_far != new_far, f'Projection changed without a distinct source farClip for {name}'
    near = []
    for matrix, far in [(a, old_far), (b, new_far)]:
        assert matrix[11] == -1 and matrix[15] == 0, f'Expected a perspective projection for {name}'
        assert matrix[10] != 1, f'Invalid depth projection for {name}'
        value = matrix[14] / (matrix[10] - 1)
        assert math.isfinite(value) and 0 < value < far, f'Invalid recovered near plane for {name}'
        assert math.isclose(matrix[10], -(far + value) / (far - value), rel_tol=1e-12, abs_tol=1e-12), f'Depth coefficient disagrees with farClip for {name}'
        assert math.isclose(matrix[14], -2 * far * value / (far - value), rel_tol=1e-12, abs_tol=1e-12), f'Depth translation disagrees with farClip for {name}'
        near.append(value)
    assert math.isclose(near[0], near[1], rel_tol=1e-12, abs_tol=1e-12), f'Camera near plane changed for {name}'
    return {'cameraPoseFOVNearIdentical': True, 'projectionIdentical': False,
            'farPlaneChange': {'baselineFarClip': old_far, 'currentFarClip': new_far,
                               'baselineNearClip': near[0], 'currentNearClip': near[1],
                               'differingProjectionElements': changed}}


def load_capture(path):
    manifest = json.loads((path / 'manifest.json').read_text())
    compiled = json.loads((path / 'compile-report.json').read_text())
    rendered = json.loads((path / 'render-report.json').read_text())
    stability_path = path / 'source-stability.json'
    stability = json.loads(stability_path.read_text()) if stability_path.exists() else None
    assert manifest['sourceHashes'] == compiled['sourceHashes'] == rendered['sourceHashes'], 'Compiler and pixels must use the same source manifest'
    assert manifest['harnessHashes'] == compiled['harnessHashes'] == rendered['harnessHashes'], 'Compiler and pixel harness provenance must match'
    assert all(case['matchedExpectation'] for case in compiled['cases']), 'A shader gate failed'
    assert compiled['maximumActiveSamplers'] <= compiled['activeSamplerBudget'] == 16, 'WebGL2 sampler budget exceeded'
    if not args.draft:
        assert rendered.get('completePixelGate') is True, 'Final comparison requires the complete native pixel gate, not selected diagnostic views'
        assert stability and stability['sourceStable'] and stability['harnessStable'], 'A final comparison requires source and harness stability proof'
        assert stability['sourceHashes'] == manifest['sourceHashes'] and stability['harnessHashes'] == manifest['harnessHashes']
    return {'root': path, 'manifest': manifest, 'compile': compiled, 'render': rendered, 'stability': stability,
            'cases': {case['name']: case for case in rendered['cases']}}


baseline, current = load_capture(args.baseline), load_capture(args.current)
assert baseline['manifest']['harnessHashes'] == current['manifest']['harnessHashes'], 'Before and after must use identical capture/replay code'

studies = [
    ('native-trail-erosion', 'Packed trail and gravel', 'Material closeup; physical surface boundaries retained'),
    ('native-hdr-trail-verge', 'Trail at driving height', 'Actual local grass, grit, terrain and outdoor HDR'),
    ('native-hdr-rock-outcrops', 'Rock ledges and scree', 'Actual contact surface, rock shading and scattered models'),
    ('native-hdr-sand-dunes', 'Sand and dry vegetation', 'Actual dune geometry, sand texture and foreground tufts'),
    ('native-hdr-ground-stone-detail', 'Imported stones at close range', 'Actual production scatter, with the same inspection camera'),
    ('native-hdr-bank-tree', 'Conifer and bank vegetation', 'The same bank tree and fixed camera'),
    ('native-hdr-wetland-shore', 'Marsh and waterline', 'Actual reeds, depth mask, planar capture and HDR'),
    ('native-hdr-mud-bank', 'Mud pool and bank', 'Actual mud material, water shader and reflection'),
    ('native-mud-rutted', 'Deformed mud', 'The same wheel-contact deformation sequence'),
    ('native-hdr-sunset-trail-verge', 'Golden-hour trail', 'Actual runtime time-of-day switch and environment preset'),
    ('native-hdr-sunset-bank-tree', 'Golden-hour conifer and bank', 'Actual warmer light, shadows, sky and camera exposure'),
    ('native-hdr-sunset-wetland-shore', 'Golden-hour marsh', 'Actual preset, water reflection and shoreline material'),
    ('native-hdr-corner-inward', 'Sky from the field corner', 'Matched pose/FOV/near; source runtime far clip and atmosphere'),
    ('native-hdr-granite-boulders', 'Granite boulder forms', 'Actual contact geometry; fixed elevated quarter view'),
    ('native-hdr-granite-reverse-quarter', 'Granite blocks and sun shadows', 'Actual source rocks and shadow setup; fixed reverse quarter view'),
    ('native-hdr-mud-rut-overview', 'Branching mud ruts and pools', 'Actual authored ground, stones, vegetation and paired reflection'),
    ('native-hdr-challenge-loop', 'Challenge park and giant loop', 'Fixed overview; actual loop road, exterior supports and terrain'),
    ('native-hdr-challenge-jumps', 'Jump and obstacle lanes', 'The same fixed camera over the park site; actual course meshes'),
    ('native-hdr-long-valley', 'Long valley visibility', 'Matched pose/FOV/near; source runtime far clip and fog'),
    ('native-hdr-challenge-loop-driver', 'Loop approach at driver height', 'Fixed approach camera; actual road surface and support clearance'),
    ('native-hdr-challenge-loop-exit-driver', 'Loop exit at driver height', 'Fixed exit camera; actual road surface and support clearance'),
]
comparisons = []
for name, title, detail in studies:
    if name not in baseline['cases'] or name not in current['cases']:
        assert args.draft, 'Missing final comparison camera: ' + name
        continue
    old_record, new_record = baseline['cases'][name], current['cases'][name]
    assert not old_record['metadata'].get('cameraTracksVehicle') and not new_record['metadata'].get('cameraTracksVehicle'), f'Tracking camera cannot enter fixed-camera comparison: {name}'
    camera_comparison = compare_camera_metadata(old_record['metadata'], new_record['metadata'], name)
    old = Image.open(args.baseline / (name + '.png')).convert('RGB')
    new = Image.open(args.current / (name + '.png')).convert('RGB')
    assert old.size == new.size, 'Pixel dimensions differ for ' + name
    difference = ImageChops.difference(old, new)
    difference_stat = ImageStat.Stat(difference)
    histogram = difference.convert('L').histogram()
    changed_fraction = sum(histogram[7:]) / (old.width * old.height)
    comparisons.append({'name': name, 'title': title, 'detail': detail,
                        'cameraIdentical': camera_comparison['projectionIdentical'], **camera_comparison,
                        'sourceRuntimeVisibility': {label: {key: record['metadata'].get(key) for key in ['farClip', 'fogDensity']}
                                                    for label, record in [('baseline', old_record), ('current', new_record)]},
                        'meanAbsolutePixelDifference': difference_stat.mean,
                        'changedPixelFractionAbove6': changed_fraction, 'changedBounds': difference.getbbox(),
                        'baselineImageSHA256': digest(args.baseline / (name + '.png')),
                        'currentImageSHA256': digest(args.current / (name + '.png')),
                        'baselineGeometry': {key: old_record['metadata'].get(key) for key in ['drawCalls', 'triangles', 'instancesBaked']},
                        'currentGeometry': {key: new_record['metadata'].get(key) for key in ['drawCalls', 'triangles', 'instancesBaked']}})

# Preserve the actual paired PNGs and provenance alongside the contact sheets.
# Raw geometry/texture buffers are reproducible from source and stay temporary;
# these compact review artifacts survive independently of scratch captures.
for label, capture in [('baseline', baseline), ('current', current)]:
    target = args.out / label
    target.mkdir(exist_ok=True)
    for record in comparisons:
        shutil.copy2(capture['root'] / (record['name'] + '.png'), target)
    for filename in ['manifest.json', 'compile-report.json', 'render-report.json', 'source-stability.json']:
        source = capture['root'] / filename
        if source.exists():
            shutil.copy2(source, target)

try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 19)
    title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 23)
except OSError:
    font = title_font = ImageFont.load_default()


def contact_sheet(filename, rows):
    width, height, gap, row_label, header, footer = 660, 432, 12, 61, 100, 55
    sheet = Image.new('RGB', (width * 2 + gap * 3, header + len(rows) * (height + row_label + gap) + footer), '#162125')
    pen = ImageDraw.Draw(sheet)
    qualifier = 'DRAFT / ' if args.draft else ''
    pen.text((gap, 12), qualifier + 'Terra Drive / actual native terrain rendering', '#eef3e8', font=title_font)
    pen.text((gap, 53), 'Baseline v' + baseline['manifest']['version'], '#d9e3d6', font=font)
    pen.text((width + gap * 2, 53), 'Current v' + current['manifest']['version'], '#d9e3d6', font=font)
    for row, record in enumerate(rows):
        top = header + row * (height + row_label + gap)
        for column, capture in enumerate([args.baseline, args.current]):
            picture = Image.open(capture / (record['name'] + '.png')).convert('RGB')
            picture = picture.resize((width, height), Image.Resampling.LANCZOS)
            sheet.paste(picture, (gap + column * (width + gap), top))
        pen.text((gap, top + height + 7), record['title'], '#eef3e8', font=title_font)
        pen.text((gap, top + height + 35), record['detail'], '#bbc9c3', font=font)
    pen.text((gap, sheet.height - footer + 8), 'Matched pose/FOV/near; source far clip and fog. Native GLES / actual assets; not a browser screenshot.', '#bbc9c3', font=font)
    save_complete_png(sheet, args.out / filename)


prefix = 'terrain-v' + '.'.join(current['manifest']['version'].split('.')[:2])
for suffix, selected in [('surfaces', studies[:4]), ('scenery-water', studies[4:9]),
                         ('lighting', studies[9:13]), ('geology', studies[13:16]),
                         ('park-distance', studies[16:19]), ('loop-driver', studies[19:])]:
    names = {name for name, _, _ in selected}
    rows = [record for record in comparisons if record['name'] in names]
    if rows:
        contact_sheet(prefix + '-' + suffix + '-comparison.png', rows)

# Vehicle-tracking cameras follow the actual integrated physics state, which may
# change with tire/soil behavior. Compare such a frame only with its own hidden-
# emitter control, never with a different runtime's nominally named camera.
feature_controls = []
for effect, before_name, after_name in [
    ('Contact-driven mud and water ejection', 'native-hdr-hummer-tire-spray-no-ejecta', 'native-hdr-hummer-tire-spray'),
    ('Configured sun shadows on granite geometry', 'native-hdr-granite-reverse-quarter-no-shadows', 'native-hdr-granite-reverse-quarter'),
]:
    if before_name not in current['cases'] or after_name not in current['cases']:
        assert args.draft, 'Missing final same-capture control: ' + before_name
        continue
    before_record, after_record = current['cases'][before_name], current['cases'][after_name]
    camera_check = compare_camera_metadata(before_record['metadata'], after_record['metadata'], after_name + ' control')
    assert camera_check['projectionIdentical'], 'Same-capture control requires an identical full projection: ' + after_name
    before = Image.open(args.current / (before_name + '.png')).convert('RGB')
    after = Image.open(args.current / (after_name + '.png')).convert('RGB')
    assert before.size == after.size, 'Control pixel dimensions differ for ' + after_name
    difference = ImageChops.difference(before, after)
    channels = difference.split()
    maximum_channel = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
    changed_pixels = sum(maximum_channel.histogram()[3:])
    assert changed_pixels >= 8, 'Actual rendering contribution is not visible: ' + effect
    feature_controls.append({
        'effect': effect, 'before': before_name, 'after': after_name,
        'comparisonScope': 'Current source only; same capture, camera and physics pose',
        'cameraIdentical': True, 'cameraTracksVehicle': bool(after_record['metadata'].get('cameraTracksVehicle')),
        'comparisonNote': after_record['metadata'].get('comparisonNote'),
        'pixelsChangedByAtLeast3': changed_pixels, 'imagePixels': before.width * before.height,
        'changedBounds': difference.getbbox(), 'meanAbsolutePixelDifference': ImageStat.Stat(difference).mean,
        'beforeSHA256': digest(args.current / (before_name + '.png')),
        'afterSHA256': digest(args.current / (after_name + '.png')),
        'interpretation': 'Pixels establish an actual rendering contribution, not a quality score or browser performance result.',
    })
    for name in [before_name, after_name]:
        shutil.copy2(args.current / (name + '.png'), args.out / 'current')

spray_case = current['cases'].get('native-hdr-hummer-tire-spray')
if spray_case:
    assert spray_case['metadata'].get('cameraTracksVehicle') is True, 'The Hummer spray fixture must explicitly declare its tracking camera'
reflection_name = 'native-hdr-tire-spray-reflection'
if reflection_name in current['cases']:
    shutil.copy2(args.current / (reflection_name + '.png'), args.out / 'current')
(args.out / 'feature-controls.json').write_text(json.dumps({
    'release': current['manifest']['version'], 'capture': str(args.current), 'draft': args.draft,
    'sourceStable': bool(current['stability'] and current['stability']['sourceStable']),
    'harnessStable': bool(current['stability'] and current['stability']['harnessStable']),
    'completePixelGate': current['render'].get('completePixelGate'),
    'captureManifestSHA256': digest(args.current / 'manifest.json'),
    'controls': feature_controls, 'sprayFixture': spray_case['metadata'] if spray_case else None,
    'method': 'Actual application captures. Hummer spray is excluded from fixed-camera baseline comparisons because the camera follows integrated physics; its emitter-hidden control uses the same final pose and full camera projection.',
}, indent=2) + '\n')

changed_files = sorted(key for key in baseline['manifest']['sourceHashes'].keys() | current['manifest']['sourceHashes'].keys()
                       if baseline['manifest']['sourceHashes'].get(key) != current['manifest']['sourceHashes'].get(key))
report = {'schema': 'terra-native-terrain-comparison-v2', 'draft': args.draft,
          'method': 'Production geometry/material/light/native-shader captures with identical pose, FOV, aspect, near plane and capture code. Source runtime far clip and fog may differ. Only projection elements 10/14 may differ, and only when finite distinct farClip metadata mathematically explains both with an unchanged near plane. Pixel metrics demonstrate a difference, not a numerical quality rating. Contact sheets contain only resized native images and labels.',
          'harnessIdentical': True, 'baselineVersion': baseline['manifest']['version'], 'currentVersion': current['manifest']['version'],
          'baselineSourceRoot': baseline['manifest']['sourceRoot'], 'currentSourceRoot': current['manifest']['sourceRoot'],
          'baselineCaptureRoot': str(args.baseline), 'currentCaptureRoot': str(args.current),
          'preservedPairedImages': {'baseline': 'baseline/', 'current': 'current/'},
          'captureManifestHashes': {'baseline': digest(args.baseline / 'manifest.json'), 'current': digest(args.current / 'manifest.json')},
          'comparisonScriptSHA256': digest(Path(__file__)),
          'trackingCameraPolicy': 'Vehicle-tracking frames are excluded from fixed-camera baseline comparisons and compared only with their same-capture emitter-hidden controls.',
          'sameCaptureFeatureControlReport': 'feature-controls.json',
          'changedRuntimeOrAssetFiles': changed_files, 'comparisons': comparisons,
          'farPlaneChangedStudies': [record['name'] for record in comparisons if record['farPlaneChange']],
          'unpairedCurrentCaptureCases': sorted(current['cases'].keys() - baseline['cases'].keys()),
          'samplers': {'baseline': baseline['compile']['maximumActiveSamplers'], 'current': current['compile']['maximumActiveSamplers'], 'budget': 16}}
(args.out / (prefix + '-comparison.json')).write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'matchedCameraPosesFOVAndNear': len(comparisons), 'sourceFarPlaneChanges': len(report['farPlaneChangedStudies']),
                  'draft': args.draft, 'harnessIdentical': True, 'report': str(args.out / (prefix + '-comparison.json'))}, indent=2))
