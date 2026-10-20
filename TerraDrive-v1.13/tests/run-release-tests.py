#!/usr/bin/env python3
"""Run each release regression file in an isolated Node process.

Usage: python3 tests/run-release-tests.py [output-directory]
The source tree is read-only during the gate. Up to three independent files run
at once; each has its own globals, logs, result, and timeout.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
RELEASE = '.'.join(VERSION.split('.')[:2])
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / ('docs/validation-v' + RELEASE) / 'tests'
OUT.mkdir(parents=True, exist_ok=True)
TESTS = sorted((ROOT / 'tests').glob('*.test.mjs'))


def source_hashes():
    files = sorted(p for p in (ROOT / 'dist').rglob('*') if p.is_file())
    files += [ROOT / 'package.json'] + sorted(p for p in (ROOT / 'tests').rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


def run_file(test):
    started = time.monotonic()
    try:
        result = subprocess.run(['node', str(test)], cwd=ROOT, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                timeout=420)
        output, code = result.stdout, result.returncode
    except subprocess.TimeoutExpired as error:
        output = (error.stdout or b'').decode() if isinstance(error.stdout, bytes) else error.stdout or ''
        output += '\nRelease gate timeout after 420 seconds.\n'
        code = 124
    log = test.stem + '.txt'
    (OUT / log).write_text(output)
    counts = {}
    for key in ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
        matches = re.findall(r'^(?:#|ℹ)\s+' + key + r'\s+(\d+)\s*$', output, re.MULTILINE)
        counts[key] = int(matches[-1]) if matches else None
    row = {'file': str(test.relative_to(ROOT)),
           'kind': 'node:test' if 'node:test' in test.read_text() else 'assert-script', 'exitCode': code,
           'seconds': round(time.monotonic() - started, 3), 'counts': counts, 'log': log}
    print(json.dumps(row), flush=True)
    return row


started_at = datetime.now(timezone.utc).isoformat()
started = time.monotonic()
before = source_hashes()
with ThreadPoolExecutor(max_workers=3) as executor:
    futures = [executor.submit(run_file, test) for test in TESTS]
    results = sorted([future.result() for future in as_completed(futures)], key=lambda row: row['file'])
after = source_hashes()
counts_present = all(row['kind'] == 'assert-script' or row['counts']['tests'] is not None for row in results)
summary = {'release': VERSION, 'startedAt': started_at,
           'seconds': round(time.monotonic() - started, 3), 'isolatedProcesses': len(TESTS),
           'maximumParallelProcesses': 3, 'sourceStable': before == after,
           'allPassed': before == after and counts_present and all(row['exitCode'] == 0 and (row['kind'] == 'assert-script' or row['counts']['fail'] == 0) for row in results),
           'standaloneAssertionScripts': [row['file'] for row in results if row['kind'] == 'assert-script'],
           'totals': {key: sum(row['counts'][key] or 0 for row in results) for key in ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']},
           'results': results, 'sourceHashes': before}
(OUT / 'release-test-results.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({key: value for key, value in summary.items() if key not in ['results', 'sourceHashes']}, indent=2), flush=True)
sys.exit(0 if summary['allPassed'] else 1)
