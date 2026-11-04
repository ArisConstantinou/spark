"""Assemble one coherent web UI whose asset names identify its exact commit.

Keep the pinned CAD component and engine directories intact. Public module
entry points re-export the versioned modules so integrations share their state.
"""
import argparse
import html
import json
from pathlib import Path
import re
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--commit', required=True)
args = parser.parse_args()
if not re.fullmatch(r'[0-9a-f]{40}', args.commit):
    parser.error('--commit must be a full Git commit SHA')
root = Path(__file__).resolve().parents[1]
web = root / 'web'
output = args.output.resolve()
if output == web or web in output.parents:
    parser.error('Release output must be outside the source web directory')
package = json.loads((root / 'package.json').read_text())
core = json.loads((root / 'tools/cad-host-component.json').read_text())
version = {'version': package['version'], 'commit': args.commit,
           'cad_editor': 'SparkWorld viewport host', 'cad_core': core['integration_commit']}
shutil.copytree(web, output, dirs_exist_ok=True, ignore=shutil.ignore_patterns('app'))
files = sorted(path for path in web.iterdir() if path.suffix in ('.js', '.css', '.html'))
names = {path.name: f'{path.stem}.{args.commit}{path.suffix}' for path in files}
names['version.json'] = f'version.{args.commit}.json'
pattern = re.compile(r'''(['"])(\./)?(''' + '|'.join(re.escape(name) for name in names) + r''')\1''')
label = html.escape(f'v{version["version"]} · {args.commit[:7]}')
for path in files:
    source = path.read_text(encoding='utf-8')
    rendered = pattern.sub(lambda match: match[1] + (match[2] or '') + names[match[3]] + match[1], source)
    if path.suffix == '.html':
        rendered = rendered.replace('data-site-version>Development build<', 'data-site-version>' + label + '<')
    (output / names[path.name]).write_text(rendered, encoding='utf-8')
    if path.suffix == '.js':
        alias = f"export * from './{names[path.name]}';\n"
        if re.search(r'\bexport\s+default\b', source):
            alias += f"export {{default}} from './{names[path.name]}';\n"
        (output / path.name).write_text(alias, encoding='utf-8')
    else:
        (output / path.name).write_text(rendered, encoding='utf-8')
(output / 'version.json').write_text(json.dumps(version), encoding='utf-8')
(output / names['version.json']).write_text(json.dumps(version), encoding='utf-8')
print(json.dumps({'commit': args.commit, 'version': version['version'], 'versioned_files': len(files)}))
