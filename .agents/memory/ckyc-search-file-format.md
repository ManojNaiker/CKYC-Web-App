---
name: CKYC portal search format
description: The portal-accepted search-file layout confirmed from a previously successful upload
---

Generate CKYC search files using the confirmed pipe-delimited bulk-search layout. The type 10 header is `10|INSTITUTION|1|REFERENCE|V1.1|DD-MM-YYYY||||` (10 fields), E/B data rows have 8 fields, and lines use CRLF endings. Filename serials start at `S10001`.

**Why:** The user supplied the current correct header and confirmed that the downloaded 11-field `1BR` header was wrong. The portal requires the 10-field V1.1 bulk-search header, while the filename uses its own S-series.

**How to apply:** Keep institution, reference, version, and hyphenated file date in the type 10 record; do not put row count or filename serial there. Aadhaar E rows use the last four digits plus name, date of birth, and gender; B rows use the complete alternate identifier with empty trailing fields.