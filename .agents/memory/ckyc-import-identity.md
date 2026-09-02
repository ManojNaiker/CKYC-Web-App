---
name: CKYC import identity migration
description: Why duplicate protection uses a nullable import identity rather than a direct natural-key constraint
---

Use a nullable, deterministic import identity for newly imported LMS rows, while checking the natural LMS identity against all existing rows.

**Why:** The development register contained legacy duplicates before duplicate prevention was introduced. A direct unique constraint on the natural key would require destructive cleanup and could not be applied safely without an operator deciding which historical rows to retain.

**How to apply:** Keep legacy identity values nullable, assign the deterministic identity to every new import, and preserve the pre-insert legacy lookup whenever import behavior is changed. Treat historical duplicate cleanup as a separate, explicit data-maintenance decision.