---
name: CKYC portal search format
description: The portal-accepted search-file layout confirmed from a previously successful upload
---

Generate CKYC search files using the legacy type 10/type 20 pipe-delimited layout. The type 10 header code is `10022`; the header has 11 fields, E/B data rows have 8 fields, and lines use CRLF endings.

**Why:** The user supplied a previously accepted portal upload. Files using the document-set-derived header value were rejected by the CKYC portal with an exact-field-count error.

**How to apply:** Keep the institution code and total generated E/B row count in the type 10 record. Aadhaar E rows use the last four digits plus name, date of birth, and gender; B rows use the complete alternate identifier with empty trailing fields.