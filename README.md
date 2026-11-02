# SparkWorld

**Created by Aris** · Electrical drafting for browser and Windows.

The graphite/cobalt workspace imports DWG/DXF and plan images, selects and moves supported source CAD, places UK/Cyprus Type G electrical points, draws circuit routes and exports drawings. Desktop uses a sidebar; mobile uses compact bottom navigation.

## Use

Target web address: **https://arisconstantinou.github.io/spark/**. CAD processing runs in a private WebAssembly worker on the device, without uploading drawings to a conversion service. The first operation downloads the engine. Hosted startup still requires a connection; offline installation is not implemented.

For Windows, extract the complete portable package and run **SparkWorld.exe** beside its supporting libraries and `web` folder. Requirements: Windows 10/11 x64, .NET Framework 4.8 and Microsoft Edge WebView2 Runtime. The app does not install prerequisites or change Windows settings. The package is unsigned; Windows trust/security prompts are separate from the application's custom themed controls and dialogs.

Projects save on the current device. Browser and desktop profiles are separate. Export **JSON** to back up or transfer the complete editable project, including original source bytes and source offsets. Clearing app/browser data can remove local projects.

## Native web CAD Studio

Open **CAD Studio** from the desktop sidebar or mobile **More**. It embeds Open CAD Studio v2026.44 for native DWG/DXF editing, layers, blocks, paper/model layouts and DWG 2018 copy export. Files are processed locally in WebAssembly. The first load downloads a roughly 90 MB main module and supporting fonts/resources.

The electrical-reference import report offers **Edit source in CAD Studio**. The original source is handed over locally. Existing electrical annotations and circuits stay saved in the Electrical workspace; the two workspaces do not silently merge edits. CAD Studio exports a distinct copy rather than replacing the imported source.

The electrical workspace keeps its existing drafting workflow and improved source-layer inspector. Custom fonts, referenced files, unusual entities and physical mobile behavior require drawing-specific verification. Keep your originals.

The current Windows package remains separate; this release does not claim the new CAD Studio is packaged or verified in Windows.

## Electrical-reference drawing

Import DWG, DXF, PNG, JPEG, WebP or SparkWorld JSON. Review coverage and declared units; correct units explicitly when necessary. Calibrate plan images from a known distance.

Select CAD paths, text or fills to inspect source identity and bounds. Dragging part of a block moves the complete source instance. The inspector supports precise X/Y offsets, reset, undo and redo. Original file bytes remain intact. Source deletion and arbitrary CAD geometry editing are not implemented.

Place, move, rotate and duplicate electrical points. Set references, mounting heights and circuit membership. Draw routes with successive clicks and Enter. Routes and measurements can be selected and dragged.

On touch screens, tap to select/place, drag an unselected area to pan, and pinch with two fingers to zoom. Drag an already selected object to move it. **Finish wire** completes a route without a keyboard. Mobile **More** includes Undo, Redo and Snap.

**Layers** lists the complete source table. Search a layer and use **Reveal & fit** to enable the block dependencies that hide its supported geometry and bring it into view. **Show all** and **Source state** change the view with undo support. Rows disclose paper-only, invisible-source and unsupported content. Older saved projects offer **Refresh CAD view**, preserving electrical edits and layer choices. Layer visibility is a view override; native export retains the original source layer flags. See [CAD integration and limits](docs/cad-integration.md).

Export JSON, SVG, PNG, circuit CSV, DWG or DXF. Native export applies source movements and adds annotations on `SPARKWORLD_ELECTRICAL`. DWG uses 2018/AC1032. Keep the original and compare the new drawing in the intended CAD software.

V select · W wire · M measure · F fit · R rotate point · Ctrl Z undo · Ctrl Shift Z redo · Ctrl S save. Middle drag or Space+drag pans; the wheel zooms at the pointer. Delete removes electrical additions.

## Scope and limits

The target is 2D model-space electrical plans. Display includes lines, arcs, circles, polylines, text, block instances, hatch boundaries/patterns, solids and stored dimension pictures. Import reports disclose unsupported content. External references/images, custom SHX/BigFont appearance, proxy objects, layouts, 3D solids and arbitrary DWG fidelity are not guaranteed. Dimensions use stored pictures, without recalculation.

Native export re-encodes CAD through ACadSharp. It is not a lossless byte-preserving editor; unsupported or external content may be omitted. Desktop hosting does not eliminate parser/format limits. CAD/image imports accept up to 48 MiB; JSON accepts 128 MiB. Complex drawings can exceed processing or memory limits.

Very large browser drawings can take several minutes to decode or write. In local verification, a 6.6 MB / 115,089-primitive drawing took about 165 seconds to decode in WebAssembly. This is separate from camera interaction latency. The Windows host runs the native engine. CAD constraints and associative dependencies are not recalculated; review exported drawings in the intended CAD application.

The renderer spatially indexes CAD in a worker and refines a composited bitmap while the camera moves. A floating origin preserves large-coordinate precision. Vector/native exports are independent of the bitmap. Fit can focus on the main cluster with an explicit distant-entity notice; All shows every visible object.

Socket artwork uses front-view Type G patterns. Symbols and circuit notes are drafting aids. Electrical sizing, protection coordination, compliance certification and simulation are not implemented.

## Development

Node 22+ serves the source UI on the fixed loopback address **http://127.0.0.1:5173/** using `node server.mjs`.

The browser project is `cad-browser/SparkWorld.CadBrowser.csproj`; compile with .NET 10 and wasm-tools. The local server maps `.out/browser/wwwroot` to `/engine`; `SPARK_ENGINE_ROOT` overrides it. Add `?engine=browser` to test WebAssembly locally.

The optional local native API uses `cad/CadBridge.csproj`, `SPARK_CAD_DLL` and `SPARK_DOTNET`. Defaults are `.out/cad/CadBridge.dll` and `dotnet`. Native source-edit round trips are in `cad-tests/SparkWorld.CadTests.csproj`.

Compile `desktop/SparkWorld.Desktop.csproj` on Windows with the .NET Framework targeting pack, and include the matching `web` directory beside the executable. Its native engine, custom file navigator, guarded saves and window controls do not use OS file dialogs or JavaScript alert/confirm.

GitHub Actions validates native round trips and the assembled web release; Windows packaging is opt-in. Private local drawings and their screenshots must never be committed. See CONTRIBUTING.md and THIRD_PARTY_NOTICES.md.

## License and corresponding source

SparkWorld integration and the combined web distribution are licensed under **GNU GPL version 3**; see LICENSE. Copyright 2026 Aris Constantinou for SparkWorld-authored code. Open CAD Studio is copyright Hakan Seven and contributors. Existing MIT component notices and font OFL notices remain in THIRD_PARTY_NOTICES.md and the distributed component.

See [CAD sources](https://arisconstantinou.github.io/spark/cad-sources.html) for the exact upstream version, source archive, integration transformations and license texts. Reproduce the pinned editor payload with `python tools/prepare-cad-editor.py --output .out/site/app`. GitHub Actions tests the assembled `/spark/` site before deploying that same artifact. Windows builds are opt-in through workflow dispatch.
