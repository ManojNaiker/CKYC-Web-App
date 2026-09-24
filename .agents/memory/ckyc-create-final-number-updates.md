---
name: CKYC Create final-number updates
description: Safety rule for applying portal CKYC Create results to the LMS client register
---

Successful CKYC Create rows with a valid CKYC number should fill matching LMS clients whose Final CKYC value is blank. Never replace an existing Final CKYC automatically, and skip a Client ID when one upload contains conflicting CKYC numbers for it.

**Why:** CKYC Create uploads were originally stored only as reconciliation batches, leaving thousands of confirmed numbers absent from the LMS register. Existing numbers may come from an earlier verified workflow and must not be silently overwritten.

**How to apply:** Match by Client ID, accept only successful portal rows with non-blank CKYC numbers, deduplicate identical values, reject conflicts, and use bounded bulk updates for large uploads.