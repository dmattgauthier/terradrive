"""Material-only Unreal Python commandlet entry point for ground iterations.

Requires the existing SourceAssets/import.json, baked transition TGAs and
Saved/terrain-transitions.json. Run in a separate editor commandlet with no
game/editor/cook/build overlap. This does not import meshes, prepare Fab
scenery, load a level or save a map. A full cook is still needed afterward.

The importer itself is parsed, never executed. Only its exact load_texture
function AST is compiled into these globals before the ground recipe runs.
"""
import ast
from datetime import datetime, timezone
import hashlib
import json
import os

import unreal


root = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
source = os.path.join(root, 'SourceAssets')
texture_root = os.path.join(root, '..', 'TerraDrive-v1.13', 'dist', 'assets', 'terrain')
tools = unreal.AssetToolsHelpers.get_asset_tools()
edit = unreal.MaterialEditingLibrary
lib = unreal.EditorAssetLibrary
# terrain-materials.py updates this in-memory material lookup for its rock
# alias. There is deliberately no source mesh/material assignment loop here.
materials = {}


def sha256_file(filename):
    digest = hashlib.sha256()
    with open(filename, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def metadata_tree(directory, excluded_top=()):
    """Cheap preservation guard; metadata, not a claim of byte-level hashing."""
    records = []
    if not os.path.isdir(directory):
        raise RuntimeError('Required existing asset directory is missing: ' + directory)
    for folder, subdirs, filenames in os.walk(directory):
        if os.path.normcase(os.path.abspath(folder)) == os.path.normcase(os.path.abspath(directory)):
            subdirs[:] = [name for name in subdirs if name not in excluded_top]
        subdirs.sort()
        for name in sorted(filenames):
            filename = os.path.join(folder, name)
            info = os.stat(filename)
            records.append((os.path.relpath(filename, directory).replace('\\', '/'),
                            info.st_size, info.st_mtime_ns))
    return records


marker = os.path.join(root, 'Saved', 'ground-rebuild-complete.json')
os.makedirs(os.path.dirname(marker), exist_ok=True)
if os.path.isfile(marker):
    os.remove(marker)
unreal.log('TERRA_GROUND_REBUILD_START material_only=true')

try:
    importer = os.path.join(root, 'Tools', 'import-assets.py')
    terrain_script = os.path.join(root, 'Tools', 'terrain-materials.py')
    with open(importer, encoding='utf8') as stream:
        importer_source = stream.read()
    parsed = ast.parse(importer_source, filename=importer)
    definitions = [node for node in parsed.body
                   if isinstance(node, ast.FunctionDef) and node.name == 'load_texture']
    if len(definitions) != 1:
        raise RuntimeError('Importer must contain exactly one top-level load_texture definition')
    loader = definitions[0]
    loader_source = ast.get_source_segment(importer_source, loader)
    if not loader_source:
        raise RuntimeError('Could not recover exact importer texture-loader source')
    # No top-level importer statements, mesh loops or level helpers are run.
    loader_module = ast.Module(body=[loader], type_ignores=[])
    ast.fix_missing_locations(loader_module)
    exec(compile(loader_module, importer, 'exec'), globals())

    manifest = os.path.join(source, 'import.json')
    required = [manifest, os.path.join(source, 'TerrainBlendA.tga'),
                os.path.join(source, 'TerrainBlendB.tga'),
                os.path.join(root, 'Saved', 'terrain-transitions.json'),
                os.path.join(root, 'Tools', 'terrain-surface.hlsl'),
                os.path.join(root, 'Tools', 'terrain-ground-blend.py'), terrain_script]
    for filename in required:
        if not os.path.isfile(filename):
            raise RuntimeError('Run the existing asset export/transition bake first; missing: ' + filename)
    with open(manifest, encoding='utf8') as stream:
        data = json.load(stream)

    # Saving is restricted to project-owned texture/material folders. Compare
    # file metadata elsewhere to catch accidental source/map/Fab resaves.
    content = os.path.join(root, 'Content')
    protected = {
        'SourceAssets': metadata_tree(source),
        'ContentOutsideTexturesAndMaterials': metadata_tree(content, ('Textures', 'Materials')),
        'PreservedBrowser': metadata_tree(os.path.join(root, '..', 'TerraDrive-v1.13')),
        'Vendor': metadata_tree(os.path.join(root, 'Vendor')),
    }
    input_fingerprints = {os.path.relpath(filename, root).replace('\\', '/'): sha256_file(filename)
                          for filename in required}
    with open(terrain_script, encoding='utf8') as stream:
        terrain_source = stream.read()
    exec(compile(terrain_source, terrain_script, 'exec'), globals())

    saved_directories = ['/Game/Textures', '/Game/Materials']
    for directory in saved_directories:
        if not lib.save_directory(directory, only_if_is_dirty=True, recursive=True):
            raise RuntimeError('Could not save dirty ground assets in: ' + directory)
    current = {
        'SourceAssets': metadata_tree(source),
        'ContentOutsideTexturesAndMaterials': metadata_tree(content, ('Textures', 'Materials')),
        'PreservedBrowser': metadata_tree(os.path.join(root, '..', 'TerraDrive-v1.13')),
        'Vendor': metadata_tree(os.path.join(root, 'Vendor')),
    }
    for name, before in protected.items():
        if current[name] != before:
            raise RuntimeError('Protected source/map/mesh file metadata changed during ground rebuild: ' + name)
    for relative, digest in input_fingerprints.items():
        if sha256_file(os.path.join(root, relative)) != digest:
            raise RuntimeError('Ground recipe/input changed while the commandlet was running: ' + relative)

    bindings_path = os.path.join(root, 'Saved', 'terrain-ground-bindings.json')
    with open(bindings_path, encoding='utf8') as stream:
        ground_bindings = json.load(stream)
    if len(terrain_bindings) != 7 or ground_bindings.get('biomes') != 7:
        raise RuntimeError('Ground rebuild did not produce all seven surfaces and the unified blend')
    completed = {
        'complete': True, 'materialOnly': True,
        'completedUTC': datetime.now(timezone.utc).isoformat(),
        'surfaces': len(terrain_bindings),
        'groundBlend': ground_bindings.get('material'),
        'groundBlendSignature': ground_bindings.get('signature'),
        'loadTextureReusedFrom': 'Tools/import-assets.py',
        'loadTextureSourceSHA256': hashlib.sha256(loader_source.encode('utf8')).hexdigest(),
        'inputSHA256': input_fingerprints, 'savedDirectories': saved_directories,
        'saveOnlyIfDirty': True, 'explicitLevelOrMeshLoading': False,
        'protectedFileMetadataUnchanged': True,
        'protectedFileCounts': {name: len(records) for name, records in protected.items()},
        'preservationGuard': 'Source/Fab/map/browser/Vendor file sizes and modification times; selected ground inputs also have SHA256 checks. Full publication preservation is verified separately.',
        'requiresFullCook': True,
    }
    temporary = marker + '.tmp'
    with open(temporary, 'w', encoding='utf8') as stream:
        json.dump(completed, stream, indent=2)
        stream.write('\n')
    os.replace(temporary, marker)
    unreal.log('TERRA_GROUND_REBUILD_COMPLETE surfaces=7 material_only=true saved_dirty_textures_materials=true')
except Exception as error:
    unreal.log_error('TERRA_GROUND_REBUILD_FAILED ' + str(error))
    raise
