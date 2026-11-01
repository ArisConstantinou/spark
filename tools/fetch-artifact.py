"""Extract a reviewed CI artifact directly into the single canonical build.

No ZIP copy is retained. Existing files are replaced only when their hashes match
the previous owned manifest. Original/user assets never belong in this directory.
"""
import hashlib, io, json, os, pathlib, subprocess, sys, zipfile
artifact,kind=sys.argv[1:3]
root=pathlib.Path(os.environ['CODEX_GENERATED_OUTPUT'])
target=root/'build'/('web/engine' if kind=='browser' else 'windows')
receipt=root/'jobs'/('artifact-'+kind+'.json')
if kind=='windows':
    command="Get-CimInstance Win32_Process -Filter \"Name='SparkWorld.exe'\" | Select-Object ExecutablePath | ConvertTo-Json -Compress"
    running=subprocess.run(['powershell','-NoProfile','-Command',command],capture_output=True,text=True,check=True).stdout.strip()
    processes=json.loads(running) if running else [];processes=processes if isinstance(processes,list) else [processes]
    for process in processes:
        executable=process.get('ExecutablePath')
        if not executable or pathlib.Path(executable).resolve()==(target/'SparkWorld.exe').resolve():raise RuntimeError('Close the canonical SparkWorld app before updating its files. No process was stopped.')
old=json.loads(receipt.read_text()) if receipt.exists() else {'files':{}}
result=subprocess.run(['gh','api','repos/ArisConstantinou/spark/actions/artifacts/'+artifact+'/zip'],capture_output=True)
if result.returncode: raise RuntimeError(result.stderr.decode(errors='replace'))
archive=zipfile.ZipFile(io.BytesIO(result.stdout));entries=[]
for info in archive.infolist():
    if info.is_dir(): continue
    name=info.filename
    if kind=='browser':
        if not name.startswith('wwwroot/') or name.endswith(('.br','.gz','.pdb')): continue
        name=name[len('wwwroot/'):]
    part=pathlib.PurePosixPath(name)
    if part.is_absolute() or '..' in part.parts or ':' in name or '\\' in name: raise ValueError('Unsafe archive entry')
    entries.append((info,name))
total=sum(info.file_size for info,_ in entries)
if total>64*1024*1024: raise ValueError('Artifact exceeds reviewed 64 MiB extraction budget')
files=dict(old['files'])
for info,name in entries:
    path=target.joinpath(*pathlib.PurePosixPath(name).parts);data=archive.read(info)
    digest=hashlib.sha256(data).hexdigest()
    if path.exists():
        current=hashlib.sha256(path.read_bytes()).hexdigest()
        if current==digest: files[name]=digest;continue
        if current!=old['files'].get(name): raise ValueError('Externally changed file: '+str(path))
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);files[name]=digest
receipt.write_text(json.dumps({'artifact':artifact,'files':files},indent=2))
print(json.dumps({'target':str(target),'bytes':total,'files':len(entries)}))
