---
name: CKYC uploaded response visibility
description: Persistence and retrieval behavior for uploaded final CKYC response files
---

Uploaded final CKYC response files must remain visible and downloadable even when their filename does not contain a D request number and therefore cannot be matched to a generated request.

**Why:** Portal Excel exports can be named independently of the generated D request. Treating request linkage as a prerequisite made a successful upload appear to disappear from the Download page.

**How to apply:** Keep uploaded response records independently listable and provide a direct file-download path; use request linkage only as an additional history association.