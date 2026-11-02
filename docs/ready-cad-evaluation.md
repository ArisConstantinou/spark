# Ready-made CAD editor evaluation

## Candidate and scope

Open CAD Studio v2026.44 is the evaluated upstream editor, not SparkWorld-authored CAD technology. Its shared native/WebAssembly core reads and writes DWG/DXF and supplies the editing UI, command system, layers, blocks and layouts. Upstream explicitly describes the project as actively developed.

- Source: https://github.com/HakanSeven12/OpenCADStudio/tree/v2026.44
- Web integration API: https://github.com/HakanSeven12/OpenCADStudio/blob/v2026.44/docs/automation/web.md
- License: https://github.com/HakanSeven12/OpenCADStudio/blob/v2026.44/LICENSE
- Evaluated release archive SHA-256: `5172f71b607e68881e6e2aa4be2fae208081a6ea8f5b27beb5367fb877b60053`

QCAD Community Edition is another free CAD editor, but its upstream identifies DWG support as an optional proprietary plugin. A free DXF editor is therefore not automatically an answer to SparkWorld's free DWG editing/export requirement: https://github.com/qcad/qcad .

## Web integration

`web/cad-studio.html` embeds the actual upstream editor and uses its control channel for import, native DWG copy export, undo/redo and zoom extents. The parent shell follows SparkWorld's graphite/cobalt theme. Five bottom actions replace the sidebar at narrow widths; the CAD button toggles the editor's clean-screen mode, exposing the actual CAD tools when requested. The electrical workspace can hand its original source over locally after saving its annotations and circuits.

CAD editing does not automatically synchronize the electrical workspace's circuits, source offsets or annotations. The web release preserves that separate project. The previous Windows package is not updated by this web release.

The vendor payload is about 145 MB uncompressed, including a roughly 90 MB main WASM module. It is acquired from the pinned release, not checked into source. Relative bootstrap URLs support hosting under `/spark/`. GitHub Actions tests the assembled site before deploying the same artifact. Windows packaging is deferred.

The evaluation transformation removes the upstream third-party analytics loader, applies a same-origin connection policy, uses a bundled favicon and disables the remote video feed. It retains the editor's JavaScript/WASM and attribution. The optional local supporters feed returns 404. The current older local server uses a generic WASM MIME type, causing the runtime to fall back from streaming compilation; this is not a production-host performance result.

## Verified evidence

The guarded editor evaluation and integration harnesses use disposable headless browser state and the same canonical test directory. No user window is opened, focused or controlled. Drawings are processed locally; the harness observes no third-party requests.

- Three real drawings expose the complete source layer counts: 29, 60 and 122.
- An eight-layer synthetic drawing opens; a native line is added, moved by `(25,30)`, undone and redone.
- The host's actual Save button downloads a distinct DWG 2018 copy. Reopening retains the added line at exactly `(25,30)`–`(1025,30)`.
- An independent ACadSharp decoder reads that exported file and verifies its eight layers and additional line.
- A large real DWG opens in both paper and model space, saves through the host and reopens in the independent decoder.
- Independent source/export comparison preserves all 60 layers, the Model/A3/A4 layouts and the counts of all 18 source entity classes, including dimensions, hatches, leaders and raster-image records. The original source hash remains unchanged. These are database-count checks, not a claim that every property, font or referenced image is identical.
- Latest host suite: 18 checks passed. Mobile checks establish host navigation/layout in Chromium emulation only.

Actual private evidence lives in the canonical tests directory: `ocs-evaluation.json`, `ocs-integration.json`, `ocs-native-compare.json`, `ocs-integrated-desktop.png` and `ocs-integrated-mobile.png`. Private drawings and their reports must not be committed to the public repository.

## Remaining boundaries

- The exact phone drawing that triggered the user's missing-geometry report is not available locally; its issue has not been claimed reproduced or fixed by this evaluation.
- Source layer inventory, rendered geometry, native save fidelity and physical-device interaction are separate acceptance checks.
- Two custom SHX font files are missing in the large tested drawing. External fonts/images/xrefs still need the original associated files. Retaining a raster-image record does not embed its image.
- An additional local 10-check suite verifies actual pointer selection and rendered geometry appearing/disappearing when freeze and parent/child visibility flags change at the same camera. `view_focus` is advertised but rejected by the browser dispatcher in this version; the working native `ZOOM WINDOW` command is used instead.
- Physical iPhone behavior, Windows WebView2 integration and independent AutoCAD visual comparison require further acceptance work. Browser emulation is not physical-device proof.
- The combined web distribution is GPL-3.0. LICENSE, THIRD_PARTY_NOTICES.md and cad-sources.html identify the corresponding source, exact upstream version, acquisition/transform script, font OFL and icon notices. The previous MIT references concerned components such as ACadSharp, not an existing project-wide MIT license.
- No paid CAD SDK, subscription, third-party drawing upload or second native editor installation was used.

## Reproducible web component recovery - 2026-11-02
Upstream replaced the v2026.44 web asset in place (asset699085810, SHA2565172f71b607e68881e6e2aa4be2fae208081a6ea8f5b27beb5367fb877b60053, became asset701140660 / SHA2567a219b7328ba7c67cfa2d99bd5ebbc3a5a68e284fe48521dff7928a5df36a61e at09:05UTC). The changed download was rejected, not upgraded.

`tools/cad-component-v2026.44.json` pins every one of the37 distributed component files from verified SparkWorld31863ee / CI41414569686. The lock was extracted from the immutable verified-web-site artifact13126653882 after matching its published SHA25662b6fe445a4530bbd75b72b11b631e7852d0a39d5e4fc24126d5ccf685e8fd89, and every embedded component file was checked against its lock. CI uses the explicit `--verified-site https://arisconstantinou.github.io/spark/app/` recovery mode to reuse those exact bytes. It fails on any file/hash/origin mismatch. This retains the already-tested JavaScript/WASM, licenses and host changes; no upstream binary update or integrity-check bypass. This source depends on that reviewed distribution staying available until an explicitly reviewed engine update replaces it.

The electrical reference adapter5 additionally evaluates Spline entities with the pinned ACadSharp NURBS implementation, preserving rational weights and block transforms. This is sampled reference display. Leader/MultiLeader/Wipeout/custom-SHX and all drawings are not claimed fully supported. Existing saved adapter4 views must be refreshed, preserving the project and original source bytes.
