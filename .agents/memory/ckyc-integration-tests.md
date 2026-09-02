---
name: CKYC integration test isolation
description: The CKYC integration suite runs against the shared development PostgreSQL database.
---

Use a unique run-scoped prefix for imported records and generated response files, then delete created requests before clients during teardown.

**Why:** The development database is shared with existing workspace data, so fixed identifiers or broad cleanup can make tests flaky or remove operator data.

**How to apply:** Keep the suite self-contained and cleanup-safe; avoid exact global counts and only delete rows created by the current run.