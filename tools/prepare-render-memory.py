"""Bound transient derived-text memory without changing drawing records or pixels."""
import argparse,hashlib,subprocess
from pathlib import Path

UPSTREAM='0e77cae652271d08c7619238e619f9b6668ae17c'
HASHES={
 'src/scene/mod.rs':'02c4ad573512ba3196b456933976de8adfe4e923882f2ab8964636a9a7ce684b',
 'src/scene/view/render.rs':'f4302951a0209dc8f61e560d2a62d210442acacf3cec9ce7ea1f7882c0e3580b',
}

def once(text,before,after):
    assert text.count(before)==1,'Unexpected upstream memory-lifecycle anchor'
    return text.replace(before,after,1)

def transform(name,text):
    if name=='src/scene/mod.rs':
        return once(text,
            '            self.block_defn_cache.borrow_mut().clear();\n            wires = self.wires_for_block_culled(',
            '            self.block_defn_cache.borrow_mut().clear();\n'
            '            // These provisional wires have not been published or bound\n'
            '            // to the resident memo. Their old atlas UVs are unusable.\n'
            '            // Release them before constructing the replacement set.\n'
            '            drop(std::mem::take(&mut wires));\n'
            '            wires = self.wires_for_block_culled(')
    assert name=='src/scene/view/render.rs'
    return once(text,
        '        let mut out: Vec<crate::scene::pipeline::text_gpu::TextVertex> = Vec::new();\n        for w in wires {',
        '        // This source failed the exact reuse check above. Its previous\n'
        '        // derived glyph batch is no longer a useful cache entry; live\n'
        '        // render primitives keep their own Arc until the GPU handoff.\n'
        '        // Do not retain eight historical full batches after text edits.\n'
        '        if let Some((_, previous)) = self.last_sdf_text.borrow_mut().remove(&source_key) {\n'
        '            self.sdf_text_cache.borrow_mut().retain(|_, vertices| !Arc::ptr_eq(vertices, &previous));\n'
        '        }\n'
        '        // The same visibility/instancing predicates as the copy loop\n'
        '        // give an exact allocation, avoiding repeated growth copies.\n'
        '        let count: usize = wires.iter()\n'
        '            .filter(|w| w.display_visible && w.render_instance.is_none())\n'
        '            .map(|w| w.text_verts.len()).sum();\n'
        '        let mut out: Vec<crate::scene::pipeline::text_gpu::TextVertex> = Vec::with_capacity(count);\n'
        '        for w in wires {')

def prepare(root):
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==UPSTREAM
    changes={}
    for name,digest in HASHES.items():
        data=(root/name).read_bytes()
        assert hashlib.sha256(data).hexdigest()==digest,name
        changes[name]=transform(name,data.decode()).encode()
    for name,data in changes.items():(root/name).write_bytes(data)
    print('Bounded provisional geometry and glyph-cache lifetime; drawing records and render output unchanged')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path)
    prepare(parser.parse_args().source)
