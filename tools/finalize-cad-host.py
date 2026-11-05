"""Apply the existing same-origin distribution policy to a newly built host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source")
parser.add_argument("output")
parser.add_argument("--codec-source")
args = parser.parse_args()
source, output = Path(args.source).resolve(), Path(args.output).resolve()
html_file = output / "index.html"
html = html_file.read_text(encoding="utf-8")
html, count = re.subn(r'<script\b[^>]*\bid="openaec-analytics-loader"[^>]*>\s*</script>', "", html)
if count != 1:
    raise ValueError("The reviewed analytics bootstrap changed")
html, count = re.subn(r'<script>\s*// Offline support: register the service worker\.[\s\S]*?</script>',
                     '<!-- SparkWorld owns asset versions; no component service worker. -->', html)
if count != 1:
    raise ValueError("The reviewed service-worker bootstrap changed")
html = html.replace('<meta charset="utf-8" />', '<meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="default-src &apos;self&apos; blob: data:; script-src &apos;self&apos; &apos;unsafe-inline&apos; &apos;wasm-unsafe-eval&apos;; connect-src &apos;self&apos;; worker-src &apos;self&apos; blob:; style-src &apos;self&apos; &apos;unsafe-inline&apos;; font-src &apos;self&apos; data:; object-src &apos;none&apos;; base-uri &apos;self&apos;" />')
html = re.sub(r'<link rel="(?:icon|apple-touch-icon)"[^>]*>', "", html)
html = html.replace('</head>', '<link rel="icon" href="./logo.svg" type="image/svg+xml"></head>')
html_file.write_text(html, encoding="utf-8")
(output / "videos.json").write_text("[]\n", encoding="utf-8")
shutil.copyfile(source / "LICENSE", output / "LICENSE-GPL-3.0.txt")
patch = subprocess.check_output(["git", "diff", "--", "src", "scripts/build-web-worker.sh", "Cargo.toml", "Cargo.lock"], cwd=source)
(output / "SPARKWORLD-SOURCE.patch").write_bytes(patch)
upstream = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
codec_metadata = {}
if args.codec_source:
    codec = Path(args.codec_source).resolve()
    codec_revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=codec, text=True).strip()
    if codec_revision != "53e6420c4df4d207409798c2719d32fc6cf2811d":
        raise ValueError("Unreviewed codec source")
    writer = "src/io/dwg/dwg_stream_writers/object_writer/entities.rs"
    reader = "src/io/dxf/reader/section_reader.rs"
    changed = subprocess.check_output(["git", "diff", "--name-only"], cwd=codec, text=True).splitlines()
    if sorted(changed) != sorted([writer, reader]):
        raise ValueError("Unexpected codec modifications")
    codec_patch = subprocess.check_output(["git", "diff", "--", writer, reader], cwd=codec)
    (output / "SPARKWORLD-CODEC.patch").write_bytes(codec_patch)
    (output / "acadrust-source").mkdir(exist_ok=True)
    shutil.copyfile(codec / writer, output / "acadrust-source" / "entities.rs")
    shutil.copyfile(codec / reader, output / "acadrust-source" / "section_reader.rs")
    shutil.copyfile(codec / "LICENSE", output / "LICENSE-acadrust-MPL-2.0.txt")
    (output / "acadrust-source" / "README.txt").write_text(
        "Modified Source Code Form, MPL-2.0. Original source and all other files:\n"
        "https://github.com/hakanaktt/acadrust/tree/" + codec_revision + "\n"
        "Modified files: " + writer + "; " + reader + "\n"
        "SparkWorld change: emit the background fields required by R2018 MTEXT text-frame flags.\n"
        "Read MTEXT annotativeness from its retained AcadAnnotative DXF XDATA.\n"
        "Reproduce using tools/prepare-cad-codec.py and .github/workflows/cad-host.yml in the integration commit.\n",
        encoding="utf-8")
    codec_metadata = {"codec_upstream_commit": codec_revision,
                      "codec_patch_sha256": hashlib.sha256(codec_patch).hexdigest()}
(output / "SPARKWORLD-HOST.txt").write_text(
    "OpenCADStudio viewport host for SparkWorld. GPL-3.0. Hakan Seven and contributors.\n"
    "Upstream: https://github.com/HakanSeven12/OpenCADStudio/tree/" + upstream + "\n"
    "Source patch: SPARKWORLD-SOURCE.patch. Build and integration scripts: "
    "https://github.com/ArisConstantinou/spark/tree/codex/cad-layer-visibility .\n"
    "Changes: optional viewport-only presentation; state hosted_view/layouts; atomic lazy electrical placement; worker target path; same-origin CSP; "
    "analytics and component service worker disabled; capability-safe optional browser storage; "
    "recent-cache failures do not invalidate successful opens/downloads; "
    "optional initial layout with native saved camera or fit for an untouched model view; "
    "the completed parser is released before reconstructing the model; "
    "obsolete provisional atlas geometry and per-source glyph batches are released before replacement, "
    "and derived glyph collections reserve their exact required capacity; "
    "bounded native performance snapshots and independent trace configuration are available without drawing edits.\n", encoding="utf-8")
files = {p.relative_to(output).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
         for p in sorted(output.rglob("*")) if p.is_file() and p.name != ".component-manifest.json"}
manifest = {"upstream_commit": upstream, "presentation": "sparkworld-viewport-host",
            "integration_commit": os.environ.get("GITHUB_SHA"),
            "tools": {name: subprocess.check_output([name, "--version"], text=True).strip()
                      for name in ("rustc", "trunk", "wasm-bindgen")},
            "patch_sha256": hashlib.sha256(patch).hexdigest(), "files": files}
manifest.update(codec_metadata)
(output / ".component-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps({"upstream": upstream, "files": len(files), "payload_bytes": sum(p.stat().st_size for p in output.rglob('*') if p.is_file())}))
