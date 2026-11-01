"""Read a verified CI engine into RAM for browser tests, without a disk copy."""
import base64,io,json,pathlib,subprocess,sys,zipfile
data=subprocess.run(['gh','api','repos/ArisConstantinou/spark/actions/artifacts/'+sys.argv[1]+'/zip'],capture_output=True,check=True).stdout
assets={}
include_all='--all' in sys.argv[2:]
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    for entry in archive.infolist():
        if entry.is_dir() or (not include_all and not entry.filename.startswith('wwwroot/')) or entry.filename.endswith(('.br','.gz','.pdb')):continue
        name=entry.filename if include_all else entry.filename[len('wwwroot/'):];parts=pathlib.PurePosixPath(name)
        if parts.is_absolute() or '..' in parts.parts or ':' in name or '\\' in name:raise ValueError('Unsafe artifact path')
        assets[name]=base64.b64encode(archive.read(entry)).decode('ascii')
json.dump(assets,sys.stdout)
