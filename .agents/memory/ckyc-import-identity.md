---
name: CKYC import identity migration
description: Why duplicate protection uses a nullable import identity rather than a direct natural-key constraint
---

Treat ClientID alone as the identity for new LMS imports: repeated ClientIDs are skipped even when their loan IDs differ. Check all existing rows, including legacy rows with missing or older import identities.

**Why:** The user confirmed that one ClientID should produce one imported client record, regardless of loan ID. Historical duplicates already exist, and deleting or choosing among them could discard CKYC data without an operator deciding which row to keep.

**How to apply:** Keep legacy identity values nullable, retain a pre-insert ClientID lookup for every import, and let the first valid row for a ClientID win within one file. Treat historical duplicate cleanup as a separate, explicit data-maintenance decision.