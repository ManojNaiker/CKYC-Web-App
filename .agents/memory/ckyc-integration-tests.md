---
name: CKYC integration test isolation
description: The CKYC integration suite runs against the shared development PostgreSQL database.
---

Use a unique run-scoped prefix for imported records and generated response files, then delete created requests and Create rows before clients during teardown. Run database-backed test files serially when one asserts global aggregate counts; otherwise parallel fixtures can change those counts.

**Why:** The development database is shared with existing workspace data, so fixed identifiers or broad cleanup can make tests flaky or remove operator data. Parallel test workers also share the database and can invalidate exact dashboard-count assertions.

**How to apply:** Keep the suite self-contained and cleanup-safe; avoid exact global counts or list snapshots where possible, delete only rows created by the current run, and serialize tests when aggregate assertions cannot be made run-scoped. Assert list entries by IDs created in the current run.