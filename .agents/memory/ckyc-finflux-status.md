---
name: FinFlux status matching
description: Matching FinFlux confirmations to saved CKYC identifiers and representing manual confirmations accurately
---

Mark a client Updated only when both the LMS ClientID and the saved Final CKYC number match the successful FinFlux pair. Do not count by ClientID alone when the saved CKYC number differs.

**Why:** A ClientID can remain the same while its Final CKYC number changes. Counting by ClientID alone can incorrectly mark a different identifier as complete.

**How to apply:** For manual confirmations, first verify that each ClientID resolves to one client row with one nonblank saved Final CKYC number, then record that exact pair. If the remote success time is unknown, label the displayed timestamp as when the status was recorded in CKYC Manager, not as the FinFlux update time.