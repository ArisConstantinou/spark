"""Prepare a pinned upstream checkout for the SparkWorld viewport host.

This changes presentation and adds one atomic lazy electrical placement API.
It does not build, download dependencies, remove CAD entity support, overwrite
a distributed component, or publish a website.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess

UPSTREAM = "0e77cae652271d08c7619238e619f9b6668ae17c"
FILES = ("src/app/view/mod.rs", "src/app/control/mod.rs", "scripts/build-web-worker.sh", "src/app/control/entities.rs", "src/io/web_recent.rs", "src/io/web_autosave.rs", "src/app/update/mod.rs", "src/app/mod.rs", "src/app/update/file.rs", "src/io/web_worker.rs", "src/scene/camera_ops.rs")
HASHES = {'src/app/view/mod.rs': '3422aecae17991fe2340bef06c3b15fc25006bed872a69a273a939fda82a2ab8', 'src/app/control/mod.rs': '57b289fc4baf65a8fcb5eca485747cbeceabed10168889d29ab2d656048d0951', 'scripts/build-web-worker.sh': 'fc75c0ab179ea626112102e8848e2ad8f030f9bc3d0030e4e2e8bb94be6024a0'}
HASHES['src/app/control/entities.rs'] = 'c82ad39f92c03c6e50ab32ac6f301a146999eca01d2a3eab2f7b3391a29d44a7'
HASHES.update({
    'src/io/web_recent.rs': '98bcfde9fd0b1d067e38e0306724b82df50bb223b336a8ea6e2c281ae4eaf758',
    'src/io/web_autosave.rs': '0d5312ee4390c69cc6eb8c6f1a72351976750f2baeef0750a64ac0aa48a93f90',
    'src/app/update/mod.rs': 'f42f9abffe03b563b5e0864c8725001d5c02141b42af0fdccd8f16bd35ca8edc',
    'src/app/mod.rs': 'f55313343a8f9d3c4fb3f67e214eb66a02ef13fcd7ab4d2bab9f49b140ed5069',
    'src/app/update/file.rs': 'e0d2b892c4879cae8db09058081fe7f86ce91239be4a2050d78babf078e1044a',
    'src/io/web_worker.rs': '44d8b5b0b089d6503582555f6dc2b6510775f028e238a09d3ce543b9a46ca6f0',
    'src/scene/camera_ops.rs': 'fedb026fb7879d600ef3c6a557c1d74d92f4f13f18e22cf886141b689231e537',
})


def replace_once(text, before, after):
    if text.count(before) != 1:
        raise ValueError("Upstream host anchor changed: " + before[:90])
    return text.replace(before, after, 1)


def transform_view(text):
    text = replace_once(text, "    pub fn view_main(&self) -> Element<'_, Message> {",
                        "    pub fn view_main(&self) -> Element<'_, Message> {\n        let spark_host = spark_hosted_view();")
    text = replace_once(text, "fn command_line_inset(app: &OpenCADStudio) -> f32 {",
                        "fn command_line_inset(app: &OpenCADStudio) -> f32 {\n    if spark_hosted_view() { return 0.0; }")
    text = replace_once(text, "let viewcube_visible = self.show_viewcube", "let viewcube_visible = !spark_host && self.show_viewcube")
    text = replace_once(text, "        } else if tab.is_start {\n            start_page_view(",
                        "        } else if tab.is_start && spark_host {\n            Space::new().width(Fill).height(Fill).into()\n        } else if tab.is_start {\n            start_page_view(")
    for side in ("Left", "Right"):
        name = side.lower() + "_edge"
        before = f"let {name} = self.build_edge_stack(crate::app::config::DockSide::{side}, tab);"
        after = f"let {name} = if spark_host {{ None }} else {{ self.build_edge_stack(crate::app::config::DockSide::{side}, tab) }};"
        text = replace_once(text, before, after)
    text = replace_once(text, "let workspace = self.dock_overlay(workspace, tab);",
                        "let workspace = if spark_host { workspace } else { self.dock_overlay(workspace, tab) };")
    text = replace_once(text, "let center_stack: Element<'_, Message> = if thumbnail_capture_clean {",
                        "let center_stack: Element<'_, Message> = if spark_host || thumbnail_capture_clean {")
    text = replace_once(text, "viewport_stack = viewport_stack.push(bar_layer);",
                        "if !spark_host { viewport_stack = viewport_stack.push(bar_layer); }")
    text = replace_once(text, "        let main_ui = container({",
                        "        let main_ui = container({\n            if spark_host {\n                column![center_stack].width(Fill).height(Fill)\n            } else {")
    start = text.index("        let main_ui = container({")
    end = text.index('        mark("statusbar");', start)
    section = text[start:end]
    section = replace_once(section, "        })\n        .style(|theme: &Theme|",
                           "            }\n        })\n        .style(|theme: &Theme|")
    text = text[:start] + section + text[end:]
    return text + '''

/// SparkWorld owns application chrome; preserve native drawing/input/modals.
pub(crate) fn spark_hosted_view() -> bool {
    #[cfg(target_arch = "wasm32")]
    {
        static HOSTED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        *HOSTED.get_or_init(|| web_sys::window()
            .and_then(|window| window.location().search().ok())
            .is_some_and(|query| query.trim_start_matches('?')
                .split('&').any(|part| part == "spark_host=1")))
    }
    #[cfg(not(target_arch = "wasm32"))]
    { false }
}
'''


def transform_control(text):
    text = replace_once(text, '            "block_define" => self.control_block_define(req)?,',
                        '            "spark_symbol_place" => self.control_spark_symbol_place(req)?,\n            "block_define" => self.control_block_define(req)?,')
    text = replace_once(text, '            | "block_define"', '            | "spark_symbol_place"\n            | "block_define"')
    text = replace_once(text, '"capabilities":["commands",', '"capabilities":["spark_symbol_place","commands",')
    text = replace_once(text, '            "camera":({let c=tab.scene.camera.borrow();',
                        '            "hosted_view":crate::app::view::spark_hosted_view(),\n            "hosted_initial_layout":cfg!(target_arch = "wasm32"),\n            "layouts":tab.scene.layout_names(),\n            "camera":({let c=tab.scene.camera.borrow();')
    return replace_once(text, 'pub(super) fn controlled_open_pending(', '''#[cfg(target_arch = "wasm32")]
pub(in crate::app) fn spark_open_layout(app: &OpenCADStudio) -> Option<&str> {
    app.control.pending.as_ref()
        .filter(|pending| !pending.cancelled && pending.request["op"] == "open")
        .and_then(|pending| pending.request.get("initial_layout"))
        .and_then(Value::as_str)
        .filter(|name| !name.is_empty() && name.len() <= 4096)
}

pub(super) fn controlled_open_pending(''')


def transform_open_view(text):
    before = '''            let saved = crate::io::saved_active_layout(&self.tabs[i].scene.document)
                .and_then(|n| names.iter().find(|x| x.eq_ignore_ascii_case(&n)).cloned());'''
    after = '''            #[cfg(target_arch = "wasm32")]
            let requested = crate::app::control::spark_open_layout(self)
                .and_then(|name| names.iter().find(|candidate| candidate.eq_ignore_ascii_case(name)))
                .cloned();
            #[cfg(not(target_arch = "wasm32"))]
            let requested: Option<String> = None;
            let saved = requested.or_else(|| {
                crate::io::saved_active_layout(&self.tabs[i].scene.document)
                    .and_then(|n| names.iter().find(|x| x.eq_ignore_ascii_case(&n)).cloned())
            });'''
    return replace_once(text, before, after)


def transform_worker_handoff(text):
    start = text.index("pub(super) async fn parse_document(")
    end = text.index("pub(super) async fn sha256_document(", start)
    body = text[start:end]
    sender = "    let message_sender = sender.clone();"
    body = replace_once(body, sender, sender + "\n    let finished_worker = worker.clone();")
    response = "        let data = event.data();"
    body = replace_once(body, response,
                        "        // The message owns its transferred buffer. Release the worker\n"
                        "        // before allocating the main-thread model.\n"
                        "        finished_worker.terminate();\n" + response)
    return text[:start] + body + text[end:]


def transform_default_model_camera(text):
    start = text.index("    fn apply_active_vport_camera(")
    end = text.index("    pub(super) fn camera_from_view_mode(", start)
    body = text[start:end]
    camera = "        let Some(new_cam) = self.camera_from_vport(&vp) else {"
    body = replace_once(body, camera, '''        // Some writers leave an untouched *Active viewport in a drawing.
        // Keep its display flags, but let restore_saved_camera fit the drawing
        // instead of using the table's 10-unit view at the origin.
        if crate::app::spark_hosted_view() {
            let default = codec::tables::VPort::new("*Active");
            if vp.view_center == default.view_center
                && vp.view_target == default.view_target
                && vp.view_direction == default.view_direction
                && vp.view_height == default.view_height
                && vp.view_twist == default.view_twist
                && vp.perspective == default.perspective
            {
                return false;
            }
        }
''' + camera)
    return text[:start] + body + text[end:]


def transform_worker(text):
    return replace_once(text,
                        '  target/wasm32-unknown-unknown/release/ocs_web_worker.wasm',
                        '  "${CARGO_TARGET_DIR:-target}/wasm32-unknown-unknown/release/ocs_web_worker.wasm"')


def transform_entities(text):
    addition = Path(__file__).with_name('cad-symbol-operation.rs').read_text(encoding='utf-8')
    return replace_once(text, '    pub(super) fn control_block_define(', addition + '    pub(super) fn control_block_define(')


def transform_recent(text):
    before = '''    let window = web_sys::window().ok_or_else(|| "browser window unavailable".to_string())?;
    let root = JsFuture::from(window.navigator().storage().get_directory())
        .await
        .map_err(js_error)?
        .dyn_into::<web_sys::FileSystemDirectoryHandle>()
        .map_err(js_error)?;'''
    text = replace_once(text, before, '    let root = storage_root().await?;')
    return text + '\n' + Path(__file__).with_name('cad-browser-storage.rs').read_text(encoding='utf-8')


def transform_autosave(text):
    before = '''    let window = web_sys::window().ok_or_else(|| "browser window unavailable".to_string())?;
    let root = JsFuture::from(window.navigator().storage().get_directory())
        .await
        .map_err(super::web_recent::js_error)?
        .dyn_into::<web_sys::FileSystemDirectoryHandle>()
        .map_err(super::web_recent::js_error)?;'''
    return replace_once(text, before, '    let root = super::web_recent::storage_root().await?;')


def transform_cache_notice(text):
    # FileOpened still installs the parsed document (or reports a genuine parse
    # failure). An optional recent-copy failure must not increment the global
    # command error revision and turn a successful control-open into a failure.
    for message in ('Opened drawing, but recent copy could not be stored: {error}',
                    'Saved download, but recent copy could not be stored: {error}'):
        index = text.index('"' + message + '"')
        start = text.rfind('self.command_line.push_error(', 0, index)
        if start < 0 or index - start > 150:
            raise ValueError('Upstream cache notice changed')
        text = text[:start] + text[start:index].replace('push_error(', 'push_info(', 1) + text[index:]
    return text


def transform_persistence_request(text):
    text = replace_once(text, '''        if let Some(window) = web_sys::window() {
            if let Ok(promise) = window.navigator().storage().persist() {
                let _ = wasm_bindgen_futures::JsFuture::from(promise).await;
            }
        }''', '        crate::io::web_recent::request_persistence().await;')
    return replace_once(text, "\nmod view;\n", "\nmod view;\npub(crate) use view::spark_hosted_view;\n")


def prepare(root):
    root = Path(root).resolve()
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if actual != UPSTREAM:
        raise ValueError("The CAD source must match pinned commit " + UPSTREAM)
    changes = {}
    for relative, transform in zip(FILES, (transform_view, transform_control, transform_worker, transform_entities, transform_recent, transform_autosave, transform_cache_notice, transform_persistence_request, transform_open_view, transform_worker_handoff, transform_default_model_camera)):
        path = root / relative
        original = path.read_bytes()
        digest = hashlib.sha256(original).hexdigest()
        if digest != HASHES.get(relative):
            raise ValueError("Changed or unreviewed CAD source: " + relative)
        changes[path] = transform(original.decode("utf-8"))
    # All inputs and anchors pass before any source file is modified.
    for path, text in changes.items():
        path.write_text(text, encoding="utf-8", newline="\n")
        print(path.relative_to(root), hashlib.sha256(path.read_bytes()).hexdigest())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="clean checkout of the pinned upstream commit")
    prepare(parser.parse_args().source)
