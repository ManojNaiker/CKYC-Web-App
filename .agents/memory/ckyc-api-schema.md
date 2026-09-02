---
name: CKYC API schema compatibility
description: Compatibility note for OpenAPI numeric schemas in this workspace
---

Use OpenAPI `number` rather than `integer` for generated API numeric fields in this workspace.

**Why:** The installed Orval output targets the older Zod runtime, where generated `zod.int()` is unavailable and breaks the shared typecheck.

**How to apply:** When adding numeric IDs, counts, or pagination fields to the API contract, keep the runtime validation numeric and enforce whole-number semantics at the route boundary when needed.