# Third-party components

## acadrust DWG/DXF codec — MPL-2.0

The viewport uses acadrust, pinned to
https://github.com/HakanSeven12/acadrust/tree/53e6420c4df4d207409798c2719d32fc6cf2811d .
SparkWorld modifies the R2018 MTEXT writer to emit the fields required by
text-frame flags, without changing those flags or enabling background fill.
The DXF reader also restores the explicit MTEXT annotative state from retained
AcadAnnotative XDATA; ordinary unannotated text keeps its non-annotative default.
The bounded transformation and exact dependency revision are recorded in
tools/prepare-cad-codec.py. The modified files' complete Source Code Form is
distributed at app/acadrust-source/entities.rs and
app/acadrust-source/section_reader.rs, with its upstream source and
reproduction instructions in app/acadrust-source/README.txt. The exact diff is
app/SPARKWORLD-CODEC.patch and the complete license text is
app/LICENSE-acadrust-MPL-2.0.txt. Original copyright and license notices remain.

## Open CAD Studio web viewport component — GPL-3.0

Copyright Hakan Seven and contributors. Source and corresponding-source download:
https://github.com/HakanSeven12/OpenCADStudio/tree/0e77cae652271d08c7619238e619f9b6668ae17c and
https://github.com/HakanSeven12/OpenCADStudio/archive/0e77cae652271d08c7619238e619f9b6668ae17c.zip .
SparkWorld's integration and combined web distribution are provided under GPL-3.0;
see LICENSE and https://arisconstantinou.github.io/spark/cad-sources.html .
The pinned source transformation is tools/prepare-cad-host.py; the web compiler
workflow is .github/workflows/cad-host.yml. tools/cad-host-component.json locks
the built archive, integration commit and manifest digest; the exact build patch
is distributed as app/SPARKWORLD-SOURCE.patch.

The source-built web component adds optional viewport-only presentation and
layout/viewport state, while retaining native drawing/file support. Its worker
build uses the declared target directory. Distribution changes remove analytics
and the remote video feed, restrict connections to the host, use relative asset
URLs and disable the component service worker. Its compiled binaries therefore
differ from the original ready-made distribution. The component retains GPL text and its Noto font
OFL notices under app/LICENSE-GPL-3.0.txt and app/fonts/OFL.txt. Its Phosphor
icon notice is retained in licenses/PHOSPHOR.txt. Upstream build scripts and
Cargo.lock identify its source dependencies.

## ACadSharp 3.6.51 — MIT

Source: https://github.com/DomCR/ACadSharp

Pinned NuGet package repository commit: `219e5fc4a6def2b2d22fbbc1c2597d8e588df6c8`.

Copyright (c) 2021 Albert Domenech

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Development and runtime tooling

Microsoft WebView2 SDK wrappers 1.0.4314.35 are redistributed with the Windows package. Copyright (C) Microsoft Corporation. Their full redistribution notice is retained in licenses/WEBVIEW2.txt from the pinned NuGet package. The Edge WebView2 Runtime is installed separately and is not included in the package.

The .NET browser runtime and bundled System.* / Microsoft.Bcl runtime support libraries are MIT licensed. Copyright (c) .NET Foundation and Contributors. The MIT permission and warranty terms reproduced above also apply to these components. Source and license: https://github.com/dotnet/runtime/blob/main/LICENSE.TXT . The Windows .NET Framework runtime is provided separately by Windows; it is not bundled here.

Node.js and the .NET SDK are development/build prerequisites. Playwright and Sharp are verification tools, not application dependencies. The electrical-reference browser engine includes its .NET WebAssembly runtime; the previous Windows package uses the separately provided .NET Framework and WebView2 runtimes. The new web CAD editor is the separate GPL component described above.

## CAD verification samples

Autodesk sample DWG files are read in place from the existing AutoCAD installation for local verification only. They remain third-party reference files and are not distributed, copied into the app, or presented as Aris's designs.

## Application visuals

Electrical symbol vectors, interface icons and the welcome-plan illustration are authored in this project's source. They are schematic drawing aids and do not claim conformance to a particular licensed symbol standard. The electrical workspace uses browser/system fonts. The ready-made CAD editor bundles Noto subsets under SIL OFL as noted above.
