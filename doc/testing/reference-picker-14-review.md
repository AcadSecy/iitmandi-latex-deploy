# Reference picker: review follow-up

The picker indexes project files in its own order. That order is not the
bibliography declaration order, so its duplicate-key warning must not promise
which entry a compiler will select. The warning now identifies the displayed
source, asks for duplicate entries to be resolved, and points to the compile log.
Citation keys and the index's selection order are unchanged.

On 16 November 2026, the frontend Mocha suite
`modules/reference-picker/test/frontend/advanced-reference-index.test.ts`
passed all 24 tests. It covers deleting the first definition, editing the later
definition, editing the displayed definition, deleting the later definition,
moving a key, malformed/empty input, protected names and escaped accents. The
additional regression confirms the displayed title updates while both sources
exist and the warning disappears when the other source is deleted.

The existing PR head `4ba6945d1f943d32f1f600b359b113a1242317c0` had a successful
Build and check run before this correction. The updated head needs its own CI
result and maintainer review. No deployed-platform acceptance is claimed here.
