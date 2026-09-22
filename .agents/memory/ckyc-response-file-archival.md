---
name: CKYC response file archival
description: Retention policy and operator behavior for long-running uploaded CKYC response storage
---

Use reversible manual archival for old uploaded CKYC response files. Archived records are hidden from the default active list, remain visible through an explicit archived review filter, and keep their content, download route, and request association.

**Why:** Automatic deletion or automatic archival could remove audit evidence or surprise operators. Uploaded response files may also be unmatched to a generated request, so retention must operate on the independent response record.

**How to apply:** Add archive state to the response record, keep archive/restore actions separate from download behavior, and do not mutate request-history rows when changing archive state.