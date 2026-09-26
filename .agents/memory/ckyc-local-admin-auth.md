---
name: CKYC local Admin authentication
description: Durable constraints for the Admin-provisioned username/password model that replaced Clerk.
---

Preserve the bootstrap Admin login backed by workspace secrets, durable opaque database sessions, and CSRF protection. Additional users may sign in with unique usernames and scrypt password hashes, but only an authenticated Admin can create accounts. Keep public signup disabled and preserve historical Clerk-era user and audit IDs.

**Why:** The user approved individual username/password accounts after initially choosing a single Admin login, with the constraint that account creation remain Admin-only. Existing Clerk-era user IDs still provide attribution for historical audit records.

**How to apply:** Preserve the stable bootstrap Admin principal and existing role checks. Never expose password hashes, reintroduce public registration, or rewrite historical actor IDs.