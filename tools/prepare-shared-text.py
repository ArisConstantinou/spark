"""Share cached glyph buffers without changing native geometry or edit semantics."""
import argparse,hashlib,re,subprocess
from pathlib import Path
HASHES = {'src/app/update/viewport.rs': '4e8b1e12feb4ac05061f87bbf0876a005e1896db288e2dcbb4f50c0a0d99547d', 'src/entities/dimension.rs': '31828c52b19469c40ae25d6ee985574860ffe79678d455c1eef44a7e604530b5', 'src/entities/leader.rs': '5a60e5f11327d96fb206c0129c79aa1eeee0dd2cbf0bf95615ca1237b991d861', 'src/entities/multileader.rs': '72e147c18c4bc7d8e59c0e4eee9aa926575f3895746d6e7819e056b422b47fdf', 'src/entities/table.rs': '91357a2b451db9579f7d5ae7f1191dd9d04aebda9d0b548f8c127352ca829ccc', 'src/io/pdf_export.rs': '21fc433d6cb24a5560c5b93dcd59daf51657125c35f38b631fdc403fb7577ea0', 'src/modules/annotate/data_link.rs': '16ebe22444aedba9f97a6de6ddeba63894ffb87e8a26c5c7994523140ad4db39', 'src/modules/annotate/leader_cmd.rs': 'b83d464cdc0aea2f05c3b3d9aed14433a6824baa1bb6e9fc7c263030d1c57943', 'src/modules/annotate/mleader_cmd.rs': '8293bbf1c8444073b996e2ff0ab87a716399011f59bdffd1fd1e559c5c7a5e9f', 'src/modules/annotate/mleader_edit.rs': 'f564aae478283326ffb9b9b2bbbf6391cb37db45cc65268afa59a46f8dad1f15', 'src/modules/annotate/tolerance_cmd.rs': 'dc4e71b73a907dde1f3e5e6bfcfbbe160f10ebc1947605067166dcfb19ec113e', 'src/modules/draw/draw/mline.rs': 'e78973125817f1b165154ce86c7ca51b8665269166afc9640f9ac3b07d3ae988', 'src/modules/draw/draw/raster_image.rs': '3f2b298c7f3d9ebfed720981c557a8c35ba00cbef3e17134828b80238774b20e', 'src/modules/draw/draw/ray.rs': 'cbe0898ef0046970db847c68e2a18aa5fc1f1b0087a574dad8c2c36922505902', 'src/modules/draw/modify/trim.rs': 'd0d19e2c26a6cb73b2edd99570077547e3a6b713473eadfcdc36ee4e92160f77', 'src/modules/model/primitive_cmd.rs': '3bc3dc051411641cd3fc4bd2f7226f8dce9a2b5c821885f34441256691674173', 'src/modules/view/plot_window.rs': '633e994f225ae7c0a8aa64f9ce227cf1673e72467cb170df6f8aae0467faef3c', 'src/modules/view/zoom_window.rs': '3703a205da13fb3ac0e17f1b79eb67828e5ed1b310563ef78fdb31a7d1c300d6', 'src/scene/cache/block_cache.rs': '0b72c20d5d54adc2fe4f0c6c3f7c27fb2c50bda30d13de415594a2919717838b', 'src/scene/convert/tess.rs': '46bac914c3f426d9aff3e42e378607d5d6cf556ecd059f47923db67b98964937', 'src/scene/convert/tessellate.rs': 'f201598ae97be9884d65421b419fb203fe625a5eca5974baeb2325cbbfbabcdd', 'src/scene/model/mod.rs': 'dede1b2b1a323566a7088a1f5261a7495cf50ea835f4b664a6293cd0669f055b', 'src/scene/model/wire_model.rs': 'e26308dddbc40a83b3f2883fc0837b25d21d626829b5b0caaa1e9395d9f5cdee', 'src/scene/pick/hit_test.rs': '95542dc0dbbc1e39e33519a07f140ce3e87ada6f6b2bd9c739f4db7869a65d9f', 'src/scene/pick/xclip.rs': 'c9c4f3265ef8a6e5ac309422910c72c4fd624df5295f0b5a8ff4658eab54cbde', 'src/scene/project.rs': '9ba8adb71a64470dbfc1230da2b44cc36a116f2b69d96999de4cc1a3ff58c93a', 'src/scene/text/complex_lt.rs': 'e08adff81a0bf326b4d45585c1f5e7ab4204fbd69693b4209df71450f0365eb8', 'src/snap.rs': 'b4a9a8bde944d0abc82fd84714149df4e6f87db30ec355e8017da04a38c31330'}
MODULE_SHA = 'cac47b28d87adca8581845f2d9bab8be9bebbbe862de25ddffd943b19f55f5b6'
UPSTREAM='0e77cae652271d08c7619238e619f9b6668ae17c'

def assignment_end(text,start):
    stack=[];quoted=False;escaped=False
    for position in range(start,len(text)):
        char=text[position]
        if quoted:
            if escaped:escaped=False
            elif char=='\\':escaped=True
            elif char=='"':quoted=False
            continue
        if char=='"':quoted=True;continue
        if char in '([{':stack.append(char)
        elif char in ')]}':
            assert stack and '([{'.index(stack.pop())==')]}'.index(char),'Unbalanced glyph assignment'
        elif char==';' and not stack:return position
    raise ValueError('Unterminated glyph assignment')

def transform(name,text):
    field='pub text_verts: Vec<crate::scene::pipeline::text_gpu::TextVertex>,'
    if name in ('src/scene/model/wire_model.rs','src/scene/cache/block_cache.rs'):
        assert text.count(field)==1,name
        text=text.replace(field,'pub text_verts: crate::scene::model::wire_vec::WireVec<crate::scene::pipeline::text_gpu::TextVertex>,',1)
    # Explicit conversions retain Vec semantics at existing ownership boundaries.
    # Vec-to-Vec conversions are identities; WireVec-to-Vec detaches if shared.
    text=re.sub(r'(?m)^(\s*)text_verts: (Vec::new\(\)|sdf_verts|verts|wire\.text_verts|b\.text_verts),$',r'\1text_verts: \2.into(),',text)
    assignments=list(re.finditer(r'\b(?:out|self|wire|w|e|block)\.text_verts\s*=\s*',text))
    for match in reversed(assignments):
        end=assignment_end(text,match.end());expression=text[match.end():end]
        text=text[:match.end()]+'('+expression+').into()'+text[end:]
    if name=='src/scene/text/complex_lt.rs':
        assert text.count('            text_verts,')==1
        text=text.replace('            text_verts,','            text_verts: text_verts.into(),',1)
    if name=='src/scene/model/mod.rs':
        assert 'mod wire_vec;' not in text;text+='\npub mod wire_vec;\n'
    return text

def prepare(root):
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==UPSTREAM
    changes={}
    # Validate every source preimage before modifying any file.
    for name,digest in HASHES.items():
        path=root/name;data=path.read_bytes();assert hashlib.sha256(data).hexdigest()==digest,name
        changed=transform(name,data.decode());assert changed!=data.decode(),name
        changes[name]=changed.encode()
    module=Path(__file__).with_name('shared-wire-vec.rs').read_bytes()
    assert hashlib.sha256(module).hexdigest()==MODULE_SHA
    target=root/'src/scene/model/wire_vec.rs';assert not target.exists()
    for name,data in changes.items():(root/name).write_bytes(data)
    target.write_bytes(module)
    # Include this new source file in the exact distributed GPL source patch.
    subprocess.check_call(['git','add','--intent-to-add','--','src/scene/model/wire_vec.rs'],cwd=root)
    print('Shared text geometry prepared:',len(changes),'existing source files; canonical drawing and codec unchanged')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);args=parser.parse_args();prepare(args.source)
