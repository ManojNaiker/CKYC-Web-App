---
name: CKYC response name status
description: How the LMS report classifies CKYC response names against the imported client
---

The LMS report derives response-name status from the saved CKYC response row instead of requiring a backfill column. Exact normalized names are `Properly Match`; partial/token-compatible names or an unavailable response name are `Match`; a missing response ID or incompatible name is `Not Match`.

**Why:** The client register already contains a large history of response rows. Dynamic derivation updates old and new report exports consistently without a risky full-table migration.

**How to apply:** Keep the saved response row and LMS client name as the source data. If matching rules change, update the shared report derivation and its CSV tests rather than assigning one-off labels to existing records.