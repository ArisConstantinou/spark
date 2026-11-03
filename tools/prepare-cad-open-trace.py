"""Add phase markers to a diagnostic build of the pinned browser CAD engine."""

import argparse
import hashlib
from pathlib import Path


SOURCES = {
    "src/io/web_worker.rs": "35afc2f7a151c5b66b1ccff130548a27e4c8345e0cd2b56378174b6fd496861f",
    "src/io/mod.rs": "032f5690bdc495750e3600b26751518932d172921284afd4ed8496a8324edde9",
    "src/app/update/file.rs": "c73d5dd5bb86ae0b16248c7c6c333e2dfcdd4927982a5489e6a3e37b588db687",
    "src/scene/mod.rs": "02c4ad573512ba3196b456933976de8adfe4e923882f2ab8964636a9a7ce684b",
    "src/scene/view/viewport_pane.rs": "c000e4d49d8a56542bb45f5de6c24032178d092b5515c7ce54ea5074ec00f798",
}


def mark(source, anchor, phase, *, after=False):
    if source.count(anchor) != 1:
        raise ValueError(f"CAD trace anchor changed: {phase}")
    indentation = anchor[: len(anchor) - len(anchor.lstrip())]
    marker = (
        f'{indentation}#[cfg(target_arch = "wasm32")]\n'
        f'{indentation}web_sys::console::debug_1(&"SPARK_OPEN_TRACE {phase}".into());'
    )
    replacement = anchor + "\n" + marker if after else marker + "\n" + anchor
    return source.replace(anchor, replacement, 1)


def within(source, first, last, transform):
    start = source.index(first)
    end = source.index(last, start + len(first))
    return source[:start] + transform(source[start:end]) + source[end:]


def trace_worker(source):
    def transform(body):
        body = mark(body, "                    let bytes = Uint8Array::new(&value).to_vec();", "copy-start")
        body = mark(body, "                    let bytes = Uint8Array::new(&value).to_vec();", "decode-start", after=True)
        body = mark(body, "                    if payload.0 != PROTOCOL_VERSION {", "decode-finished")
        return mark(body, "                            Ok((outcome, payload.2))", "restore-fields-finished")

    return within(source, "pub(super) async fn parse_document(", "pub(super) async fn sha256_document(", transform)


def trace_load(source):
    def transform(body):
        body = mark(body, "    let mut doc = outcome.document;", "fixups-start")
        body = mark(body, "    crate::entities::field::update_fields(&mut doc, 1, None);", "fields-start")
        body = mark(body, "    let xref_infos = resolve_web_xrefs(&mut doc, progress.clone()).await;", "xref-start")
        body = mark(body, "    let mut caches = crate::scene::build_derived_caches(&doc);", "derived-start")
        return mark(body, "    let mut caches = crate::scene::build_derived_caches(&doc);", "derived-finished", after=True)

    return within(source, "async fn load_web_bytes(", "async fn parse_web_document(", transform)


def trace_install(source):
    def transform(body):
        body = mark(body, "        let timings = caches.timings;", "install-start")
        body = mark(body, "        self.tabs[i].scene.warm_interaction_caches();", "interaction-start")
        body = mark(body, "        self.tabs[i].scene.warm_interaction_caches();", "interaction-finished", after=True)
        body = mark(body, "        crate::io::linetypes::repair_document(&mut self.tabs[i].scene.document);", "layout-finished")
        body = mark(body, "        self.tabs[i].scene.restore_saved_camera();", "camera-start")
        body = mark(body, "        self.tabs[i].note_document_loaded();", "install-ready")
        return mark(body, "        let sheet_set_task = self.sheet_set_after_open(i);", "install-finished", after=True)

    return within(source, "    pub(super) fn on_file_opened(", "    pub(super) fn on_web_autosave_defer(", transform)


def mark_large_frame(source, anchor, phase, scene):
    if source.count(anchor) != 1:
        raise ValueError(f"CAD render trace anchor changed: {phase}")
    indent = anchor[: len(anchor) - len(anchor.lstrip())]
    lines = [
        '#[cfg(target_arch = "wasm32")]',
        "{",
        "    use std::sync::atomic::{AtomicBool, Ordering};",
        "    static LOGGED: AtomicBool = AtomicBool::new(false);",
        f"    if !LOGGED.load(Ordering::Relaxed) && {scene}.document.entity_count() >= 10_000",
        "        && !LOGGED.swap(true, Ordering::Relaxed)",
        "    {",
        f'        web_sys::console::debug_1(&"SPARK_OPEN_TRACE {phase}".into());',
        "    }",
        "}",
    ]
    return source.replace(anchor, "\n".join(indent + line for line in lines) + "\n" + anchor, 1)


def trace_resident_geometry(source):
    def transform(body):
        for anchor, phase in (
            ("        let mut wires = self.wires_for_block_culled(", "resident-tessellation-start"),
            ("        for _ in 0..3 {", "resident-first-pass-finished"),
            ("            wires = self.wires_for_block_culled(", "resident-atlas-rebuild"),
            ("        self.building_resident_set.set(false);", "resident-tessellation-finished"),
            ("        let layout = Self::resident_wire_layout(&wires);", "resident-layout-start"),
            ("        let arc = Arc::new(wires);", "resident-layout-finished"),
        ):
            body = mark_large_frame(body, anchor, phase, "self")
        return body

    return within(source, "    fn resident_wires_for(", "    fn resident_wire_key(", transform)


def trace_viewport(source):
    def transform(body):
        body = mark_large_frame(body, "        match self.pane {", "viewport-primitive-start", "self.scene")
        body = body.replace("        match self.pane {", "        let primitive = match self.pane {", 1)
        end = "\n        }\n    }\n\n"
        if not body.endswith(end):
            raise ValueError("CAD viewport draw return changed")
        body = body[:-len(end)] + "\n        };\n        primitive\n    }\n\n"
        return mark_large_frame(body, "        primitive\n", "viewport-primitive-finished", "self.scene")

    return within(source, "    fn draw(", "    fn update(", transform)


def prepare(root):
    changes = {}
    transforms = (trace_worker, trace_load, trace_install, trace_resident_geometry, trace_viewport)
    for (relative, digest), transform in zip(SOURCES.items(), transforms, strict=True):
        path = root / relative
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError(f"Unreviewed CAD source: {relative}")
        changes[path] = transform(raw.decode("utf-8"))
    for path, content in changes.items():
        path.write_text(content, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    prepare(parser.parse_args().source)
