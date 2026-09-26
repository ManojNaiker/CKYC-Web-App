---
name: CKYC API schema compatibility
description: Compatibility note for OpenAPI numeric schemas in this workspace
---

Use OpenAPI `number` rather than `integer` for generated API numeric fields in this workspace. Avoid `format: email`: current Orval output calls `zod.email()`, which is unavailable in the installed Zod 3 runtime; keep email fields as strings and validate verified addresses at the service boundary.

**Why:** The installed Orval output targets the older Zod runtime, where generated `zod.int()` and `zod.email()` are unavailable and break the shared typecheck.

**How to apply:** When adding numeric IDs, counts, or pagination fields to the API contract, keep the runtime validation numeric and enforce whole-number semantics at the route boundary when needed. For email fields, use plain strings in the contract and rely on the trusted identity provider's verification status.