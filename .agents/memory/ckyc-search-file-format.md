---
name: CKYC portal search format
description: The portal-accepted search-file layout confirmed from a previously successful upload
---

Generate CKYC search files using the confirmed pipe-delimited bulk-search layout. The type 10 header is `10|INSTITUTION|1|RECORD-COUNT|V1.1|DD-MM-YYYY||||` (10 fields), E/B data rows have 8 fields, and lines use CRLF endings. Filename serials start at `S10001`. A search file must contain no more than 10 lakh generated CKYC rows.

**Why:** The user supplied the current correct header and clarified that its fourth value (for example `178649`) is the number of records in the uploaded file, not a reference code. The portal requires the 10-field V1.1 bulk-search header, uses its own S-series in the filename, and rejects search files above 10 lakh records.

**How to apply:** Keep institution, total generated row count, version, and hyphenated file date in the type 10 record; do not put filename serial there. Aadhaar E rows use the last four digits plus name, date of birth, and gender; B rows use the complete alternate identifier with empty trailing fields. Count generated E/B rows rather than selected clients when enforcing the 10-lakh limit.