"""Read a verified CI engine into RAM for browser tests, without a disk copy."""
import base64,io,json,pathlib,subprocess,sys,zipfile
data=subprocess.run(['gh','api','repos/ArisConstantinou/spark/actions/artifacts/'+sys.argv[1]+'/zip'],capture_output=True,check=True).stdout
assets={}
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    for entry in archive.infolist():
        if entry.is_dir() or not entry.filename.startswith('wwwroot/') or entry.filename.endswith(('.br','.gz','.pdb')):continue
        name=entry.filename[len('wwwroot/'):];parts=pathlib.PurePosixPath(name)
        if parts.is_absolute() or '..' in parts.parts:raise ValueError('Unsafe artifact path')
        assets[name]=base64.b64encode(archive.read(entry)).decode('ascii')
json.dump(assets,sys.stdout)
