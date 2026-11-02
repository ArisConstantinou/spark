# CAD integration in SparkWorld

SparkWorld uses the same pinned ACadSharp 3.6.51 document reader/writer in a browser WebAssembly worker and in the Windows host. Original CAD bytes are retained. A derived scene supplies rendering, picking and layer dependencies; electrical annotations and sparse source-object offsets are stored separately. Editing the scene is not a guarantee of lossless DWG rewriting.

## What professional web CAD requires

A drawing contains a document database, block instances, layer states, model/paper spaces, external references and text resources. A list of visible paths is insufficient to describe that database. Global freeze, off state and new-viewport freeze have different meanings; a block can also depend on layers other than the layer of its child geometry. See [Autodesk's layer-state explanation](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Layer-states-explained-for-AutoCAD-based-products.html) and [ACadSharp's layer flags](https://github.com/DomCR/ACadSharp/blob/master/src/ACadSharp/Tables/LayerFlags.cs).

The browser should render a bounded local-coordinate scene with spatial picking and worker refinement while retaining links to the original document objects. Import diagnostics must identify missing geometry rather than inventing substitutes. A native export needs a document-level write and an independent comparison in another CAD application.

## Available implementation paths

| Path | Capability and consequence |
| --- | --- |
| Existing ACadSharp + our renderer | Local processing and a shared browser/Windows core under the existing MIT dependency. We own rendering, visibility and interaction semantics. Supported entities and round trips require tests; proxy objects, external content and CAD text fidelity remain limited. |
| ODA Drawings inWEB | Vendor SDK intended to bring DWG document access and editing into browser WebAssembly. Its exact version, deployment rights and suitability must be evaluated before integration. The current product information and older public API documentation are not equivalent release guarantees. |
| Native/server CAD processing | A backend can run document operations and stream view data. This needs hosting and a file-handling/privacy design; GitHub Pages alone is static hosting. Moving processing to a server does not by itself fix missing fonts, references or an incomplete adapter. |
| Autodesk APS Viewer/Model Derivative | Translates source files into viewing derivatives. This is a viewing pipeline, not a replacement for a native DWG editor. Cloud document operations would need a separate service/workflow and authorization to upload drawings. |

Primary references: [ODA's 2026 inWEB architecture](https://www.opendesign.com/blog/2026/september/oda-devconnect-2026-inwebtm), [ODA public API documentation and its version caveats](https://cloud.opendesign.com/docs/drawingapi/index.html), [ACadSharp source and license](https://github.com/DomCR/ACadSharp), and [Autodesk Model Derivative](https://aps.autodesk.com/model-derivative-api-2d-3d-conversions).

No commercial SDK has been purchased, installed or benchmarked in SparkWorld. No claim of equivalent compatibility or speed is made. The present implementation first fixes verified omissions in our own adapter and UI without silently changing licensing or uploading private drawings.

## Implemented layer behavior

- Inventory comes from the whole source layer table, including unused and paper-only layers. Model roots, block-definition objects and paper objects are distinguished.
- Source off/global-freeze flags determine the initial view. New-viewport freeze is recorded separately and does not hide model-space geometry.
- A layer row counts supported display parts controlled through its block dependencies. A checked layer can still be blocked by another layer; the reason is displayed.
- **Reveal & fit** enables the dependencies required by that layer's supported geometry and fits its real bounds. Other unrelated hidden layers remain hidden. **Show all** and **Source state** provide explicit view changes with undo.
- Unsupported types and skipped invisible source entities are disclosed per layer. A layer with no supported model-space geometry receives an explanation, not a fake reveal control.
- Layer toggles are view overrides. Original DWG bytes and source flags remain intact. JSON/SVG/PNG reflect the project view; native CAD export preserves the original source layer flags unless a separate supported document edit changes them.
- Older saved scene snapshots can be refreshed from their retained source without discarding electrical annotations, circuits, source offsets or the user's layer overrides.

## Remaining boundaries

Paper-space viewport projection, external-reference resolution, custom/proxy entities, SHX/BigFont fidelity and associative CAD recalculation are not established as complete. Showing a layer cannot recreate unsupported geometry or a missing referenced file. Source-hidden objects remain hidden according to the supported import policy and are counted as omissions. CAD-native exports must be compared independently before professional use.

Large browser DWG import/export can still be slow; a previous large-file AOT experiment did not resolve that bottleneck. Rendering responsiveness and import time are separate measurements. Desktop packaging, browser emulation and synthetic fixtures do not prove physical iPhone behavior or universal DWG compatibility.
