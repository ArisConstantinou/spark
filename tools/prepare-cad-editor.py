# SPDX-License-Identifier: GPL-3.0-only
import os,pathlib,urllib.request,zipfile,io,json,hashlib,re,argparse,sys
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--manifest');parser.add_argument('--verified-site');args=parser.parse_args()
target=pathlib.Path(args.output).resolve();receipt=pathlib.Path(args.manifest).resolve() if args.manifest else target/'.component-manifest.json'
url='https://github.com/HakanSeven12/OpenCADStudio/releases/download/v2026.44/OpenCADStudio-v2026.44-web.zip';expected='5172f71b607e68881e6e2aa4be2fae208081a6ea8f5b27beb5367fb877b60053'
def fetch(url,limit):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SparkWorld-CAD-evaluation'}),timeout=120) as r:
  data=r.read(limit+1)
  if len(data)>limit:raise RuntimeError('Download exceeds reviewed bound')
  return data
old=json.loads(receipt.read_text()) if receipt.exists() else {'files':{}};files=dict(old['files'])
def write(name,content):
 p=target.joinpath(*pathlib.PurePosixPath(name).parts);digest=hashlib.sha256(content).hexdigest()
 if p.exists():
  current=hashlib.sha256(p.read_bytes()).hexdigest()
  if current==digest:files[name]=digest;return
  if current!=old['files'].get(name):raise RuntimeError('Externally changed or unknown file: '+str(p))
 p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(content);files[name]=digest
if args.verified_site:
 # Upstream replaced its v2026.44 ZIP in place on 2026-11-02. Recover only
 # the exact already-reviewed distribution, never accept the changed ZIP.
 pinned=json.loads(pathlib.Path(__file__).with_name('cad-component-v2026.44.json').read_text())
 if pinned['archive_sha256']!=expected:raise RuntimeError('Unexpected component lock')
 if args.verified_site!='https://arisconstantinou.github.io/spark/app/':raise RuntimeError('Unreviewed component recovery origin')
 total=0
 for name,digest in pinned['files'].items():
  p=pathlib.PurePosixPath(name)
  if p.is_absolute() or '..' in p.parts or ':' in name or '\\' in name:raise RuntimeError('Unsafe locked component entry')
  existing=target.joinpath(*p.parts)
  if existing.exists():
   if hashlib.sha256(existing.read_bytes()).hexdigest()!=digest:raise RuntimeError('Changed recovered component: '+name)
   files[name]=digest;continue
  content=fetch(args.verified_site+name,100*1024*1024);total+=len(content)
  if total>150*1024*1024:raise RuntimeError('Component recovery exceeds reviewed bound')
  if hashlib.sha256(content).hexdigest()!=digest:raise RuntimeError('Recovered component digest mismatch: '+name)
  write(name,content)
 receipt.parent.mkdir(parents=True,exist_ok=True);receipt.write_text(json.dumps(pinned,indent=2))
 print(json.dumps({'version':'v2026.44','files':len(files),'reused_verified_component':True}));sys.exit(0)
data=fetch(url,80*1024*1024)
if hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Pinned archive digest mismatch')
archive=zipfile.ZipFile(io.BytesIO(data));entries=[]
for info in archive.infolist():
 if info.is_dir():continue
 if not info.filename.startswith('app/'):raise RuntimeError('Unexpected archive root')
 name=info.filename[4:];p=pathlib.PurePosixPath(name)
 if p.is_absolute() or '..' in p.parts or ':' in name or '\\' in name:raise RuntimeError('Unsafe archive entry')
 entries.append((info,name))
if sum(i.file_size for i,_ in entries)!=144914536:raise RuntimeError('Unexpected uncompressed payload size')
for info,name in entries:
 content=archive.read(info)
 if name=='index.html':
  html=content.decode('utf-8');html,n=re.subn(r'<script\b[^>]*\bid="openaec-analytics-loader"[^>]*>\s*</script>','',html)
  if n!=1:raise RuntimeError('Upstream analytics hook changed; review before execution')
  html=html.replace('<meta charset="utf-8" />','<meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="default-src &apos;self&apos; blob: data:; script-src &apos;self&apos; &apos;unsafe-inline&apos; &apos;wasm-unsafe-eval&apos;; connect-src &apos;self&apos;; worker-src &apos;self&apos; blob:; style-src &apos;self&apos; &apos;unsafe-inline&apos;; font-src &apos;self&apos; data:; object-src &apos;none&apos;; base-uri &apos;self&apos;" />')
  html=re.sub(r'<link rel="(?:icon|apple-touch-icon)"[^>]*>','',html)
  html=html.replace('</head>','<link rel="icon" href="/app/logo.svg" type="image/svg+xml"></head>')
  html,n=re.subn(r'<script>\s*// Offline support: register the service worker\.[\s\S]*?</script>','<!-- The host provides versioned assets; no component service worker is installed. -->',html)
  if n!=1:raise RuntimeError('Upstream service-worker bootstrap changed; review required')
  html=html.replace('/app/','./')
  content=html.encode('utf-8')
 elif name=='videos.json':content=b'[]\n'
 write(name,content)
write('LICENSE-GPL-3.0.txt',fetch('https://raw.githubusercontent.com/HakanSeven12/OpenCADStudio/v2026.44/LICENSE',100000))
write('SPARKWORLD-EVALUATION.txt',b'OpenCADStudio v2026.44 CAD component for SparkWorld. Changes dated 2026-11-02: analytics loader removed; same-origin CSP added; bundled favicon selected; remote video feed disabled; bootstrap URLs made relative; component service worker registration disabled. JavaScript/WASM binaries unchanged. GPL-3.0. Copyright Hakan Seven and contributors. Upstream and corresponding source: https://github.com/HakanSeven12/OpenCADStudio/tree/v2026.44 . Web CAD component for SparkWorld. Corresponding source and integration changes: https://arisconstantinou.github.io/spark/cad-sources.html .\n')
receipt.parent.mkdir(parents=True,exist_ok=True)
receipt.write_text(json.dumps({'version':'v2026.44','asset_id':699085810,'archive_sha256':expected,'source_url':'https://github.com/HakanSeven12/OpenCADStudio/tree/v2026.44','modifications':['Remove third-party analytics loader','Add same-origin connection policy','Use bundled SVG favicon','Disable remote video thumbnail feed','Make bootstrap asset URLs relative for subdirectory hosting','Disable component service-worker registration; host owns asset versions'],'files':files},indent=2))
print(json.dumps({'target':str(target),'version':'v2026.44','payload_bytes':sum(i.file_size for i,_ in entries),'files':len(files),'license':'GPL-3.0'}))
