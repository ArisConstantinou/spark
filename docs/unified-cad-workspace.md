# One SparkWorld document

## Current implementation boundary

The published Electrical workspace and separate CAD Studio remain the current
production route. The candidate main-page route `?workspace=cad` reuses the
complete ready-made editor and adds the SparkWorld project browser, electrical
palette, circuit metadata, native layers, compact selection and explicit Details.
The full native CAD tools remain available in that same page.

The next candidate adds SparkWorld-owned Draw/Modify/Annotate/View controls,
native command prompts and input, and an explicit Details property editor.
These controls call the existing editor's command and property API; the local
acceptance test creates a line, changes its native coordinates, undoes/redoes
the change and verifies DWG export/reopen. This is functional integration, but
the component's remaining document tabs, status bar and floating command UI are
still visible. A viewport-only renderer host has not been built or accepted.
Do not describe the visual integration or mobile input as complete.

Legacy-copy migration preserves corrected drawing units, sparse block movement,
source bytes, circuits, point notes, routes and measurements. Its saved hidden
layer view is applied to the working copy; Source state restores original DWG
flags independently. The earlier project database remains unchanged.

The candidate saves native DWG geometry and electrical metadata together in a
`sparkworld/cad-v2` project. Original file bytes are retained separately from the
working snapshot. Complete project JSON includes circuits and point notes; the
native DWG copy contains CAD geometry and does not yet carry the complete circuit
schedule and metadata from this UI. The older project database is preserved;
copy-on-import migrates native-source movements, symbols, routes and measurements.

The candidate has passed local browser checks with a synthetic fixture and a
real 60-layer private drawing. It is still under acceptance, not the default
published workspace. Initial import and preparation took about 54 seconds for
that drawing in local headless Chromium. This is not physical-mobile performance
proof. Kilometre and unknown-unit imports require explicit unit confirmation
before placing symbols with millimetre sizes.

## Implemented foundation

- All 13 existing library vectors can become native block definitions in the
  same document as imported CAD. Source definitions are never replaced.
- An electrical placement is one native Insert and one native undo step.
  Moving that Insert moves the complete symbol.
- Coordinates convert explicitly from the electrical model's millimetres/Y-down
  into native drawing units/Y-up. The caller supplies the confirmed units.
- Electrical labels, circuit IDs, mounting height and notes can be stored as
  `SPARKWORLD` XData. Unicode strings are split below the CAD string byte limit.
  Metadata changes are separate undo steps; this is not an atomic placement plus
  metadata transaction.
- Project block mappings are checked against the reopened native block table.
  Edits carry a document ID and revision, preventing redirection to another tab.

The served browser component was tested locally against a real 60-layer drawing:
placement, whole-block movement, undo/redo, DWG export/reopen, long Greek metadata,
original-file preservation, and source layer retention. Independent ACadSharp
inspection additionally checked original entity-class counts, layer flags,
layouts, block identities, membership and nested reference targets. Anonymous
block names were normalized during export, so identity checks use handles and
membership hashes. These checks do not establish universal geometric, font or
external-reference fidelity.

`tests/native-electrical.cjs` repeats the adapter acceptance checks with the
public synthetic CAD fixture inside the assembled-site browser suite. Private
drawings and their exports remain local.

## Remaining integration requirements

1. Use one project model and one canvas; retain legacy projects and original
   bytes. Migration must be explicit and reversible without overwriting them.
2. Present the existing custom palette, searchable layers, circuits, compact
   selection and explicit Details around that canvas.
3. Finish metadata-aware history and native copying/deletion semantics. Library
   setup is already saved/reopened as a baseline, so a placed symbol is removed
   by one native Undo without exposing setup instances.
4. Complete interoperability and acceptance of the v2 project format, including
   large backups and migration. Native snapshot plus metadata already save and
   reload together in the candidate; native DWG alone is not the full project.
5. Verify direct pointer placement, selection, drag, measurements, routes,
   layer dependencies and mobile gestures through the actual unified UI.
6. Reproduce the reported file-specific omissions with the actual source file.
   Physical iPhone acceptance and missing external fonts/references remain
   separate evidence requirements.

The pinned component advertises some operations that its web dispatcher rejects,
including `batch`, `view_focus` and GUI-only `capture`. Integration must use tested
operations and must not assume an advertised capability provides a transaction.
See the [upstream automation specification](https://github.com/HakanSeven12/OpenCADStudio/blob/v2026.44/docs/automation/API-SPEC.md)
and the actual browser acceptance tests.


## Rejected transfer optimization

The pinned browser `entities_copy_to` operation copies Insert records without
copying their referenced block definitions. A target query can therefore show
an Insert while its definition is absent. The candidate does not use that
operation to install the electrical library. Block-table and roundtrip checks
are required; an Insert count alone is insufficient evidence.
