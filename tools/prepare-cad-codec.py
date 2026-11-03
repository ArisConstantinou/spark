"""Patch only pinned AC1032 MTEXT text-frame serialization, without upgrading CAD.

ODA DWG specification5.4.1 section20.4.46, p149 requires background
properties for R2018 text frames even when the background-fill bit is unset.
Keep flags/appearance unchanged; emit the fields their wire flag requires.
"""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess

HOST = '0e77cae652271d08c7619238e619f9b6668ae17c'
CODEC = '53e6420c4df4d207409798c2719d32fc6cf2811d'
WRITER = 'src/io/dwg/dwg_stream_writers/object_writer/entities.rs'
HASHES = {
    'Cargo.toml': '43e53784a8b0a0ef8604b39a7c291fcbcbc7ed86f1f057d6f2f82cc51cac93f5',
    'Cargo.lock': 'f68075c843019e41247cf42314bb16a50d2f8e601ca45b5ed0791c7b2ff8cd2c',
    WRITER: 'b3c1f5c64400a5414ef22c9e921e25698b34154d78212544a27f9444b49cb522',
}


def once(text, before, after):
    if text.count(before) != 1:
        raise ValueError('Pinned MTEXT anchor changed: ' + before[:80])
    return text.replace(before, after, 1)


def transform_writer(text):
    return once(text,
        '            // A frame alone does not carry fill properties in the R2018 layout.\n'
        '            // Including them shifts the annotative/column fields in ACAD.\n'
        '            if (e.background_fill_flags & 0x01) != 0 {',
        '            // ODA5.4.1 section20.4.46: R2018 text-frame records carry\n'
        '            // these fields even without background fill. Keep the flags\n'
        '            // unchanged; omitting the fields misaligns column metadata.\n'
        '            if (e.background_fill_flags & 0x01) != 0\n'
        '                || (self.version.r2018_plus(self.dxf_version)\n'
        '                    && (e.background_fill_flags & 0x10) != 0)\n'
        '            {')


def prepare(host, codec):
    host, codec = Path(host).resolve(), Path(codec).resolve()
    if host.parent != codec.parent or codec.name != 'cad-codec-source':
        raise ValueError('Use the reviewed sibling cad-codec-source checkout')
    for root, expected in ((host, HOST), (codec, CODEC)):
        actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
        if actual != expected:
            raise ValueError('Unexpected CAD revision: ' + actual)
    originals = {}
    for root, relative in ((host, 'Cargo.toml'), (host, 'Cargo.lock'), (codec, WRITER)):
        data = (root / relative).read_bytes()
        if hashlib.sha256(data).hexdigest() != HASHES[relative]:
            raise ValueError('Changed or unreviewed source: ' + relative)
        originals[root / relative] = data.decode('utf-8')
    manifest = originals[host / 'Cargo.toml']
    if '[patch."https://github.com/HakanSeven12/acadrust.git"]' in manifest:
        raise ValueError('Codec override already exists')
    manifest += '\n[patch."https://github.com/HakanSeven12/acadrust.git"]\nacadrust = { path = "../cad-codec-source" }\n'
    lock = originals[host / 'Cargo.lock']
    match = re.search(r'(?ms)^\[\[package\]\]\nname = "acadrust"\n.*?(?=^\[\[package\]\]|\Z)', lock)
    if not match:
        raise ValueError('Pinned acadrust package is absent')
    old = match.group(0)
    source = 'source = "git+https://github.com/HakanSeven12/acadrust.git?rev=53e6420#' + CODEC + '"\n'
    updated = once(old, source, '')
    changes = {host / 'Cargo.toml': manifest,
               host / 'Cargo.lock': once(lock, old, updated),
               codec / WRITER: transform_writer(originals[codec / WRITER])}
    # Validate every revision/hash/anchor before editing any source.
    for file, text in changes.items():
        file.write_text(text, encoding='utf-8', newline='\n')
        print(file.name, hashlib.sha256(file.read_bytes()).hexdigest())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('host')
    parser.add_argument('codec')
    args = parser.parse_args()
    prepare(args.host, args.codec)
