"""Acquire the exact reviewed native viewport component, or verify an installed one.

No compilation, dependency upgrades, cleanup, source modifications or file uploads.
Authenticated downloads use gh's redirect handling; credentials are never passed
to an arbitrary archive origin. Local write invocations require StorageGuard.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import urllib.request
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True)
parser.add_argument('--verify-only', action='store_true')
parser.add_argument('--frame-baseline', action='store_true', help='Use the immutable pre-fix regression component')
args = parser.parse_args()
lock = json.loads(Path(__file__).with_name('cad-host-frame-baseline.json' if args.frame_baseline else 'cad-host-component.json').read_text())
target = Path(args.output).resolve()
sha = lambda data: hashlib.sha256(data).hexdigest()

def manifest(data):
    if sha(data) != lock['manifest_sha256']:
        raise ValueError('Unreviewed CAD component manifest')
    value = json.loads(data)
    for key in ('integration_commit', 'upstream_commit', 'patch_sha256'):
        if value[key] != lock[key]:
            raise ValueError('Unexpected CAD provenance: ' + key)
    if value['presentation'] != 'sparkworld-viewport-host':
        raise ValueError('The component is not the reviewed viewport host')
    for name in value['files']:
        p = PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or ':' in name or '\\' in name:
            raise ValueError('Unsafe component path')
    return value

if args.verify_only:
    value = manifest((target / '.component-manifest.json').read_bytes())
    for name, digest in value['files'].items():
        if sha((target / name).read_bytes()) != digest:
            raise ValueError('Changed component file: ' + name)
    print(json.dumps({'verified': True, 'files': len(value['files']), 'integration_commit': value['integration_commit']}))
    raise SystemExit(0)

if not os.environ.get('GITHUB_ACTIONS') and not os.environ.get('CODEX_GENERATED_OUTPUT'):
    raise ValueError('Local generated writes require the reviewed StorageGuard job')
if os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN'):
    data = subprocess.check_output(['gh', 'api', 'repos/ArisConstantinou/spark/releases/assets/' + str(lock['asset_id']), '-H', 'Accept: application/octet-stream'])
else:
    with urllib.request.urlopen(lock['archive_url'], timeout=120) as response:
        data = response.read(80 * 1024 * 1024 + 1)
if len(data) > 80 * 1024 * 1024 or sha(data) != lock['archive_sha256']:
    raise ValueError('CAD archive digest or size mismatch')
archive = zipfile.ZipFile(io.BytesIO(data))
raw_manifest = archive.read('.component-manifest.json')
value = manifest(raw_manifest)
payload = {**value['files'], '.component-manifest.json': lock['manifest_sha256']}
if len(payload) > 100 or sum(i.file_size for i in archive.infolist()) > 200 * 1024 * 1024:
    raise ValueError('CAD component exceeds reviewed bounds')
entries = {}
for name, digest in payload.items():
    info = archive.getinfo(name)
    if (info.external_attr >> 16) & 0o170000 == 0o120000:
        raise ValueError('Archive symlinks are not permitted')
    content = archive.read(info)
    if sha(content) != digest:
        raise ValueError('CAD archive file hash mismatch: ' + name)
    entries[name] = content
# No unknown or changed existing destination is overwritten. Existing identical
# files are reused; retained old hashes are not disposable merely due to age.
for name, content in entries.items():
    path = target / name
    if path.exists() and (path.is_symlink() or sha(path.read_bytes()) != sha(content)):
        raise ValueError('Unknown/changed existing component output: ' + name)
for name, content in sorted(entries.items(), key=lambda item: item[0] == 'index.html'):
    path = target / name
    if path.exists():
        continue
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as output:
        output.write(content)
print(json.dumps({'prepared': True, 'files': len(payload), 'integration_commit': value['integration_commit']}))
