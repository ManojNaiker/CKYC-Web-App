---
name: CKYC local Admin authentication
description: Durable constraints for the Admin-provisioned username/password model that replaced Clerk.
---

Preserve the bootstrap Admin login backed by workspace secrets, durable opaque database sessions, and CSRF protection. Additional users may sign in with unique usernames and scrypt password hashes, but only an authenticated Admin can create accounts. Keep public signup disabled and preserve historical Clerk-era user and audit IDs.

**Why:** The user approved individual username/password accounts after initially choosing a single Admin login, with the constraint that account creation remain Admin-only. Existing Clerk-era user IDs still provide attribution for historical audit records.

The bootstrap Admin username is fixed and its password remains secret-managed. Its profile name and email may be edited in Manage Users, so successful bootstrap logins must preserve those profile fields.

**Why:** The login upsert runs on every successful Admin login; resetting name and email there would silently undo profile edits.

**How to apply:** Keep bootstrap credential management separate from profile editing, and preserve the stable Admin principal, role checks, historical actor IDs, and password-hash secrecy.