# SparkWorld CAD boundary

SparkWorld is an electrical drawing workspace. Its own tools, panels and saved
project model should use the CAD core through a stable host interface. Embedding
the complete foreign editor is an interim integration, not the intended UI.

## Keep available in the product

| Area | SparkWorld behavior | Required engine services |
| --- | --- | --- |
| Draw and modify | Lines, polylines, curves, basic shapes, move/copy/rotate/trim | Native commands, snapping, geometry kernel, preview and commit |
| Electrical work | UK/Cyprus symbols, circuits, installation notes, routes | Native blocks, transforms, electrical metadata and one project save |
| Source inspection | Searchable layers, reveal dependencies, explicit Details | Block/layer tables, record properties, original source flags |
| Documents | Projects, native import/export, backups, model/layout choice | DWG/DXF reader/writer, source bytes, database identity and layouts |
| Interaction | Selection, undo/redo, pan/zoom, responsive touch | Picking, history, native viewport bounds and input routing |
| Documentation | Text, dimensions, measurements | Native text/dimension definitions and existing source styles |

The controls already implemented in `web/cad-controls.js` call native commands
and properties. Their first acceptance test verifies Line, command input,
coordinate editing, undo/redo and DWG reopen. Registration of another command
alone does not prove its entire workflow has passed acceptance.

## Do not expose as primary SparkWorld tools yet

General-purpose 3D authoring, parametric/node-graph editing, point-cloud tools,
specialized interchange managers and the vendor start/sponsor/tutorial page are
outside the current electrical workflow. This is a presentation boundary, not
authorization to remove CAD records or supporting geometry from imported files.

In particular, hiding a solid-modeling tool does not prove its tessellator,
entity decoder or serializer can be removed. Imported blocks may contain solids,
splines, proxy data, text, dimensions, images or references that the user did not
create through SparkWorld. Preserve original bytes and verify native round trips
before removing any engine capability.

## Current package evidence

The pinned distributed component has 37 files totaling 144,949,769 bytes in the
canonical component directory. Its main WASM is 89,593,544 bytes and its save
worker WASM is 20,630,363 bytes. The rest includes fonts and supporting assets.
These are uncompressed on-disk sizes, not measured initial network transfer or a
percentage of code actually used. There is no measured basis for a "10% usage"
claim or a promised bundle reduction.

## Renderer host boundary still required

The present component paints its ribbon, tabs, command overlay and status bar
inside the WASM canvas. CSS cannot restyle those widgets. CLEANSCREEN hides some
chrome but retains tabs/status/command UI and therefore does not meet the final
single-interface requirement.

A source-level viewport host should retain rendering, picking, live command
previews, snapping, text editing, modal/loss notices and native history while
omitting its own application chrome. It must report the actual drawing rectangle
and document/selection/command state to the custom host. The host then owns
toolbars, property panels, document/layout navigation and command feedback.
Cropping the old UI or assuming fixed 32px/30px insets is not acceptance.

The source available at upstream commit
`0e77cae652271d08c7619238e619f9b6668ae17c` renders the combined UI in
`src/app/view/mod.rs::view_main`; its workspace, floating command line and outer
chrome are distinct construction sections. A modified source build is not yet
compiled or verified. Retain the distributed component and pinned provenance
until a replacement passes the same DWG and interaction checks.

## Gates for a replacement

1. One correctly sized native viewport at desktop and mobile pixel densities.
2. Real source symbols and layer dependencies remain visible when enabled.
3. Own toolbar, native properties, electrical blocks, gestures and history work
   on that same viewport; selection does not auto-open a large panel.
4. Original-source hashes, layouts, block identity, geometry and export/reopen
   checks pass; unsupported external/font content remains disclosed.
5. Saved projects migrate without overwriting earlier drawings.
6. The deployed asset/version identity is verified. Physical iPhone and exact
   `155-2.dwg` evidence remain separate from synthetic/headless acceptance.

This boundary does not introduce a simulator, engineering certification or a
Windows build. Those remain outside the current web completion work.
