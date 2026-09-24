---
name: CKYC response name status
description: How the LMS report classifies CKYC response names against the imported client
---

The LMS report derives response-name status from the saved CKYC response row instead of requiring a backfill column. Compact-equivalent or exact token-set names are `Properly Match`; names with strong token coverage, order changes, compound/prefix/suffix variants, minor spelling differences, or a first-name-only response are `Match`; an LMS `NA` suffix with a matching first name is `Properly Match`; a missing response ID or weak name coverage is `Not Match`. A successful, nonblank, unambiguous CKYC Create result whose number exactly matches the client's stored Final CKYC takes precedence and is labeled `Match via Create CKYC`.

**Why:** The client register already contains a large history of response rows. Dynamic derivation updates old and new report exports consistently without a risky full-table migration.

**How to apply:** Keep the saved response row and LMS client name as the source data. Ignore generic short suffix matches such as `bhai` inside a longer token. Derive Create status dynamically from successful Create rows; conflicting successful CKYC numbers for one LMS client make that evidence ambiguous. Apply the same precedence in the client list and CSV export. If matching rules change, update the shared report derivation and its CSV tests rather than assigning one-off labels to existing records.