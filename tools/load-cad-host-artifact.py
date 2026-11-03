"""Review or install a verified web CAD host into the existing canonical component.

The archive stays in memory. Preserve old hashed assets and unknown files. Every
replacement requires the previous ownership hash; source drawings are excluded.
Run --plan first, then execute under StorageGuard with its measured peak budget.
"""
import argparse, hashlib, io, json, os
from pathlib import Path, PurePosixPath
import subprocess, zipfile

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--artifact',required=True,type=int)
parser.add_argument('--commit',required=True)
parser.add_argument('--plan',action='store_true')
parser.add_argument('--candidate',action='store_true',help='Explicitly evaluate a compiled component; not a public release acceptance')
args=parser.parse_args()
if len(args.commit)!=40 or any(c not in '0123456789abcdef' for c in args.commit):
    raise ValueError('An exact reviewed integration commit is required')
def api(suffix):
    return subprocess.check_output(['gh','api','repos/ArisConstantinou/spark/actions/artifacts/'+str(args.artifact)+suffix])
meta=json.loads(api(''))
if meta['name']!=('compiled-cad-host' if args.candidate else 'verified-cad-host') or meta['expired'] or meta['workflow_run']['head_sha']!=args.commit:
    raise ValueError('The artifact does not identify the reviewed host build')
if meta['size_in_bytes']>128*1024*1024:raise ValueError('Artifact archive exceeds the reviewed bound')
archive_bytes=api('/zip')
archive_digest='sha256:'+hashlib.sha256(archive_bytes).hexdigest()
if meta.get('digest')!=archive_digest:raise ValueError('Artifact archive digest mismatch')
archive=zipfile.ZipFile(io.BytesIO(archive_bytes));prefix='' if args.candidate else 'app/'
manifest=json.loads(archive.read(prefix+'.component-manifest.json'))
if manifest.get('presentation')!='sparkworld-viewport-host' or manifest.get('integration_commit')!=args.commit or manifest.get('upstream_commit')!='0e77cae652271d08c7619238e619f9b6668ae17c':
    raise ValueError('Unreviewed host provenance')
target=Path('E:/CodexGenerated/FYP/staging/build/web/ocs')
if target.is_symlink() or target.resolve()!=target:raise ValueError('The canonical component must be a physical generated directory')
receipt=target.parents[2]/'jobs/artifact-ocs.json'
old_bytes=receipt.read_bytes();old=json.loads(old_bytes)
owned={**old.get('retained_files',{}),**old.get('files',{})}
files={**manifest['files'],'.component-manifest.json':hashlib.sha256(archive.read(prefix+'.component-manifest.json')).hexdigest()};entries={}
if len(files)>200 or sum(i.file_size for i in archive.infolist() if i.filename.startswith(prefix))>200*1024*1024:
    raise ValueError('Host payload exceeds the reviewed bound')
for name,digest in files.items():
    p=PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or ':' in name or '\\' in name:raise ValueError('Unsafe component path')
    info=archive.getinfo(prefix+name)
    if (info.external_attr>>16)&0o170000==0o120000:raise ValueError('Archive symlink rejected')
    data=archive.read(info)
    if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('Component hash mismatch: '+name)
    path=target.joinpath(*p.parts)
    if any(part.is_symlink() for part in [path,*path.parents] if part!=target.parent):raise ValueError('Linked component path rejected')
    current=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
    if current==digest:continue
    if path.exists() and current!=owned.get(name):raise ValueError('Unknown or externally changed output: '+name)
    if path.with_name(path.name+'.codex-host.tmp').exists():raise ValueError('Previous replacement temporary needs review: '+name)
    entries[path]=(data,current)
ownership={'presentation':manifest['presentation'],'integration_commit':args.commit,
           'files':files,'retained_files':{k:v for k,v in owned.items() if k not in files},
           'artifact':{'id':args.artifact,'digest':archive_digest,'evaluation':args.candidate}}
receipt_bytes=json.dumps(ownership,indent=2).encode('utf-8')
growth=sum(max(0,len(data)-(p.stat().st_size if p.exists() else 0)) for p,(data,_) in entries.items())+max(0,len(receipt_bytes)-len(old_bytes))
replacement=max([len(old_bytes),len(receipt_bytes),*[len(data) for p,(data,_) in entries.items() if p.exists()]])
plan={'target':str(target),'artifact':args.artifact,'commit':args.commit,'evaluation':args.candidate,'changed_files':len(entries),'growth_bytes':growth,'peak_additional_bytes':growth+replacement+1048576,'retained_files':len(ownership['retained_files'])}
print(json.dumps(plan),flush=True)
if args.plan:raise SystemExit(0)
root=os.environ.get('CODEX_GENERATED_OUTPUT')
if not root or Path(root).resolve()!=target.parents[2]:raise ValueError('Use the existing FYP StorageGuard job')
def replace(path,data,previous):
    current=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
    if current!=previous:raise ValueError('Output changed since preflight: '+str(path))
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_name(path.name+'.codex-host.tmp')
    with temporary.open('xb') as stream:stream.write(data)
    current=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
    if current!=previous:raise ValueError('Output changed during replacement: '+str(path))
    os.replace(temporary,path)
for path,(data,previous) in sorted(entries.items(),key=lambda item:item[0].name=='index.html'):replace(path,data,previous)
replace(receipt,receipt_bytes,hashlib.sha256(old_bytes).hexdigest())
print(json.dumps({'installed':True,'files':len(files),'originals_deleted':0}))
