"""Package the verified owned payload, reusing one canonical Windows ZIP."""
import hashlib,json,os,pathlib,subprocess,zipfile
root=pathlib.Path(os.environ['CODEX_GENERATED_OUTPUT']);payload=root/'build/windows';target=root/'build/SparkWorld-Windows-x64.zip';record=root/'jobs/windows-package.json'
manifest=json.loads((root/'jobs/artifact-windows.json').read_text());owned=manifest['files']
source=pathlib.Path(__file__).resolve().parent.parent;commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
if target.exists():
    if not record.exists() or hashlib.sha256(target.read_bytes()).hexdigest()!=json.loads(record.read_text())['sha256']:raise RuntimeError('Package was externally changed; preserved.')
files=[]
for name,digest in owned.items():
    p=payload.joinpath(*name.split('/'))
    if hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise RuntimeError('Payload changed: '+name)
    if not name.endswith('.pdb'):files.append((p,name))
temporary=target.with_suffix('.zip.writing')
if temporary.exists():raise RuntimeError('An earlier incomplete package exists; preserve it for review.')
with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for p,name in files:archive.write(p,name)
    archive.write(pathlib.Path(__file__).resolve().parent.parent/'README.md','README.md')
    archive.writestr('build-info.json',json.dumps({'source_commit':commit,'windows_artifact_id':manifest['artifact']}))
os.replace(temporary,target)
result={'path':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'files':len(files)+2,'source_commit':commit,'windows_artifact_id':manifest['artifact']}
record.write_text(json.dumps(result,indent=2));print(json.dumps(result))
