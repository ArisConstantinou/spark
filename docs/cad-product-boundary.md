# SparkWorld CAD boundary

SparkWorld is an electrical drawing workspace. Its own tools, panels and saved
project model should use the CAD core through a stable host interface. Embedding
the complete foreign editor is an interim integration, not the intended UI.

## Canvas-first interface

The main workspace owns its visible controls and uses the SparkWorld theme.
Do not restore the permanent "Native DWG + DXF" strip or stack document tabs,
tool categories and tool buttons into separate rows. Open drawings share the
title bar; one compact tool row contains the group chooser, drawing tools and
layer control. Mobile drawing options open in a themed popover without changing
the drawing rectangle. The command field stays on one line while idle and shows
the current native prompt and working option buttons when a command is active.

Retain the permanent desktop navigation and the five mobile bottom actions.
Provider attribution belongs in the accessible source/license information.
Native text editors and transient dialogs still need a matching host interface
or verified theme; preserving their behavior does not establish visual acceptance.

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

## Earlier distributed package evidence

Before the viewport-host replacement, the pinned distributed component had 37 files totaling 144,949,769 bytes in the
canonical component directory. Its main WASM is 89,593,544 bytes and its save
worker WASM is 20,630,363 bytes. The rest includes fonts and supporting assets.
These are uncompressed on-disk sizes, not measured initial network transfer or a
percentage of code actually used. There is no measured basis for a "10% usage"
claim or a promised bundle reduction.

## Implemented native viewport host

The locally installed component omits its application ribbon, sidebar, start
page, tabs, floating command overlay and status bar at the source level. The
native drawing rectangle fills the iframe. No CSS clipping or fixed chrome
insets are used for this presentation mode.

SparkWorld owns the document tabs in the title bar, one compact tool row, layer
panel, property editor, electrical library, project storage and command input.
The default web route now opens this workspace; earlier CAD Studio bookmarks
redirect to it. The explicit image-editor route remains available for saved
legacy image projects.

Own TEXT/MTEXT tools use the matching host form and create actual native text
entities. The first completed audit reproduced the old engine inline and rich
text editor. Those native editors remain reachable through other engine paths
such as direct engine calls; replacing the main tools does not establish that
every advanced command or native dialog has been reskinned. This remains a
separate acceptance boundary, not permission to discard existing formatting.

The source available at upstream commit
`0e77cae652271d08c7619238e619f9b6668ae17c` renders the combined UI in
`src/app/view/mod.rs::view_main`; its workspace, floating command line and outer
chrome are distinct construction sections. `tools/prepare-cad-host.py` validates
that commit, the original source hashes and every replacement anchor before
editing the view, state bridge and worker build hook. The worker hook uses the
same declared compiler output directory as the main build. The experimental web-only workflow compiles this
optional presentation mode and checks the shared UI at pixel density 2.
The compiled host has passed local native viewport, command/property/history,
layout and actual-source DWG round-trip checks. Keep its exact provenance and
the distinction between local acceptance and a deployed release. Native dialog
surfaces, migration, performance and hosted asset identity remain release gates.

## Gates for a replacement

1. One correctly sized native viewport at desktop and mobile pixel densities.
2. Real source symbols and layer dependencies remain visible when enabled.
3. Own toolbar, native properties, electrical blocks, gestures and history work
   on that same viewport; selection does not auto-open a large panel.
4. Original-source hashes, layouts, block identity, geometry and export/reopen
   checks pass; unsupported external/font content remains disclosed.
5. Saved projects migrate without overwriting earlier drawings.
6. The deployed asset/version identity is verified. Physical iPhone and exact
   `155-2.dwg` evidence remain separate from synthetic/headless acceptance. The
   exact private source has passed local layer/block/type checks and native
   export/reopen, including an independent display-geometry comparison. Those
   results do not establish arbitrary-file fidelity or physical-device proof.

This boundary does not introduce a simulator, engineering certification or a
Windows build. Those remain outside the current web completion work.
