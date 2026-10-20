"""Create an explicitly labelled, isolated material-state control of a model export.

Geometry, cameras, lights, PMREM recipes and shaders remain the original buffers.
Run render-model-native.py on the resulting model-scenes.json as a separate step.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('manifest', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--view-filter', required=True)
parser.add_argument('--disable-vehicle-receive-shadow', action='store_true')
parser.add_argument('--hide-glass', action='store_true')
parser.add_argument('--normal-bias', type=float)
args = parser.parse_args()
assert args.disable_vehicle_receive_shadow or args.hide_glass or args.normal_bias is not None, 'Specify an explicit control'
data = json.loads(args.manifest.read_text())
data['cases'] = [case for case in data['cases'] if re.search(args.view_filter, case['name'])]
assert data['cases'], 'The control filter selected no views'
args.output.mkdir(parents=True, exist_ok=False)
for source in args.manifest.parent.iterdir():
    if source.is_file() and source.suffix in ['.bin', '.vert', '.frag']:
        (args.output / source.name).symlink_to(source.resolve())
changes = {}
if args.disable_vehicle_receive_shadow:
    changes['vehicleReceiveShadow'] = False
if args.normal_bias is not None:
    changes['directionalShadowNormalBias'] = args.normal_bias
if args.hide_glass:
    changes['hideGlass'] = 'Omit material-tagged vehicleGlass display and corresponding shadow draws; retain seals and trim.'
for case in data['cases']:
    case['name'] += '-control'
    case['metadata']['control'] = {'originalManifest': str(args.manifest.resolve()), 'changes': changes,
                                  'unchanged': 'Actual geometry buffers, camera, light recipes and material programs; shadow catcher retained.'}
    if args.hide_glass:
        glass_geometry = {draw['geometry'] for draw in case['draws'] if 'vehicleGlass' in draw['material'].get('surfaceTags', [])}
        assert glass_geometry, 'The source checkpoint must record tagged vehicle glass'
        case['draws'] = [draw for draw in case['draws'] if draw['geometry'] not in glass_geometry]
        for shadow in case.get('shadows', []):
            shadow['draws'] = [draw for draw in shadow['draws'] if draw['geometry'] not in glass_geometry]
    for draw in case['draws']:
        if args.disable_vehicle_receive_shadow and draw['material']['type'] != 'ShadowMaterial':
            draw['uniforms']['receiveShadow'] = False
        if args.normal_bias is not None:
            for key in draw['uniforms']:
                if key.endswith('.shadowNormalBias'):
                    draw['uniforms'][key] = args.normal_bias
data['method'] += ' Explicit immutable-scene control; see each case metadata. No runtime source was changed.'
data['controlExporterHash'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
output = args.output / 'model-scenes.json'
output.write_text(json.dumps(data))
print(f'Exported {len(data["cases"])} isolated control views: {output}')
