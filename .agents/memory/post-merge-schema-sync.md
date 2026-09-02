---
name: Post-merge schema sync
description: Constraints for automatically synchronizing development PostgreSQL schemas after workspace merges
---

Post-merge setup runs with stdin closed. Database schema commands used there must target the exact pnpm workspace package name and must not require an interactive confirmation.

**Why:** A prompt-based or incorrectly filtered command can fail after a merge while leaving the running preview unable to serve routes that reference newly added columns or constraints.

**How to apply:** Keep the interactive database push command for manual development use, and expose or invoke a separate non-interactive development-only sync command from `scripts/post-merge.sh`. Fail the hook with a clear schema-sync message so the merge setup is visibly unsuccessful.