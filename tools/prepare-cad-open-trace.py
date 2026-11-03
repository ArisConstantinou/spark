"""Add phase markers to a diagnostic build of the pinned browser CAD engine."""

import argparse
import hashlib
from pathlib import Path


SOURCES = {
    "src/io/web_worker.rs": "44d8b5b0b089d6503582555f6dc2b6510775f028e238a09d3ce543b9a46ca6f0",
    "src/io/mod.rs": "032f5690bdc495750e3600b26751518932d172921284afd4ed8496a8324edde9",
    "src/app/update/file.rs": "e0d2b892c4879cae8db09058081fe7f86ce91239be4a2050d78babf078e1044a",
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
        sender = "    let message_sender = sender.clone();"
        response = "        let data = event.data();"
        if body.count(sender) != 1 or body.count(response) != 1:
            raise ValueError("CAD worker handoff changed")
        body = body.replace(sender, sender + "\n    let finished_worker = worker.clone();", 1)
        body = body.replace(
            response,
            "        // The message already owns its transferred buffer. Release the\n"
            "        // completed worker before allocating the main-thread model.\n"
            "        finished_worker.terminate();\n" + response,
            1,
        )
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


def prepare(root):
    changes = {}
    for (relative, digest), transform in zip(SOURCES.items(), (trace_worker, trace_load, trace_install)):
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
