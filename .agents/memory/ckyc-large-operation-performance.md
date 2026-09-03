---
name: CKYC large-operation performance
description: Performance constraints for CKYC workflows operating on tens of thousands of clients.
---

Large CKYC operations must avoid synchronous duplicate copies of full client datasets and sequential per-client database writes. Read large portal XLSX responses with a streaming parser, filter at the database, and write matched results in bounded bulk batches.

**Why:** With roughly 96,000 clients, full response validation caused extreme API CPU and memory pressure, while one-at-a-time CKYC number updates allowed uploads to remain active for minutes and block normal use.

**How to apply:** For new bulk CKYC flows, keep work server-side where practical, select only required fields and statuses, stream spreadsheets instead of loading full workbooks, use bounded SQL batches, and verify normal endpoint latency and process memory after a large-operation change.