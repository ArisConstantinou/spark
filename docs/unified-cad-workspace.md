# One SparkWorld document

## Current implementation boundary

The Electrical workspace and the embedded CAD Studio are still separate pages
with separate saved state. `native-electrical.js` is a tested integration adapter;
it is not yet connected to production palette or navigation controls. Adding it
does not make the existing pages a single editor.

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
3. Link native block positions and electrical metadata to the same project
   history. Preparing library definitions currently adds engine undo entries;
   those setup entries must not appear as user editing actions.
4. Save and restore the native snapshot plus electrical project metadata together.
   Circuit IDs in entity XData are not the complete circuit schedule.
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
