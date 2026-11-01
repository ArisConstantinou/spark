"""Refresh only owned Windows interface files in the existing canonical build."""
import hashlib,json,os,pathlib
root=pathlib.Path(os.environ['CODEX_GENERATED_OUTPUT']);source=pathlib.Path(__file__).resolve().parent.parent
receipt=root/'jobs/artifact-windows.json';owned=json.loads(receipt.read_text());target=root/'build/windows'
inputs=[(p,'web/'+p.name) for p in (source/'web').iterdir() if p.is_file()]
inputs.append((source/'THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md'))
for p,name in inputs:
    data=p.read_bytes();destination=target.joinpath(*name.split('/'))
    if destination.exists():
        current=hashlib.sha256(destination.read_bytes()).hexdigest()
        if current!=owned['files'].get(name):raise RuntimeError('Externally changed output: '+str(destination))
        if current==hashlib.sha256(data).hexdigest():continue
    destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data);owned['files'][name]=hashlib.sha256(data).hexdigest()
receipt.write_text(json.dumps(owned,indent=2));print('Matching source interface synchronized.')
