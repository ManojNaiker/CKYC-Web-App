---
name: CKYC local Admin authentication
description: Durable constraints for the single-account authentication model that replaced Clerk.
---

Use one app-managed `Admin` login backed by a workspace secret, durable opaque database sessions, and CSRF protection. Keep historical Clerk-era application users and audit actors unchanged even though they can no longer sign in.

**Why:** The user explicitly chose a single local Admin account with no signup. Existing user rows still provide attribution for historical audit records, so deleting or rewriting them would damage the audit trail.

**How to apply:** New authentication work should preserve the stable local Admin principal, existing role authorization checks, and old audit associations. Do not reintroduce public registration or silently migrate historical actor IDs.