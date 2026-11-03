"""Prepare a pinned upstream checkout for the SparkWorld viewport host.

This changes presentation only. It does not build, download dependencies, remove
CAD entity support, overwrite a distributed component, or publish a website.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess

UPSTREAM = "0e77cae652271d08c7619238e619f9b6668ae17c"
FILES = ("src/app/view/mod.rs", "src/app/control/mod.rs", "scripts/build-web-worker.sh")
HASHES = {'src/app/view/mod.rs': '3422aecae17991fe2340bef06c3b15fc25006bed872a69a273a939fda82a2ab8', 'src/app/control/mod.rs': '57b289fc4baf65a8fcb5eca485747cbeceabed10168889d29ab2d656048d0951', 'scripts/build-web-worker.sh': 'fc75c0ab179ea626112102e8848e2ad8f030f9bc3d0030e4e2e8bb94be6024a0'}


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
    return replace_once(text, '            "camera":({let c=tab.scene.camera.borrow();',
                        '            "hosted_view":crate::app::view::spark_hosted_view(),\n            "layouts":tab.scene.layout_names(),\n            "camera":({let c=tab.scene.camera.borrow();')


def transform_worker(text):
    return replace_once(text,
                        '  target/wasm32-unknown-unknown/release/ocs_web_worker.wasm',
                        '  "${CARGO_TARGET_DIR:-target}/wasm32-unknown-unknown/release/ocs_web_worker.wasm"')


def prepare(root):
    root = Path(root).resolve()
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if actual != UPSTREAM:
        raise ValueError("The CAD source must match pinned commit " + UPSTREAM)
    changes = {}
    for relative, transform in zip(FILES, (transform_view, transform_control, transform_worker)):
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
