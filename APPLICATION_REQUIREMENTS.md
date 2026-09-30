# CKYC Data Request Manager — Application Requirements

This is the functional source of truth for the CKYC Data Request Manager. When
implementation changes a user-visible behavior, update the related requirement
in the same change and run the requirements sync command.

The generated inventory at the end of this file refreshes automatically while
the local watcher is running. The inventory can report files and technical
structure, but it cannot infer a change in business intent; review these
functional requirements as part of implementation.

## Product scope

Provide Light Finance operators with a secure workspace to import LMS client
records, prepare CKYC search and download requests, process CKYC responses,
deliver final CKYC numbers to FinFlux, and review operational history.

## Users, access, and security

| Role | Required access |
| --- | --- |
| Viewer | Dashboard and read-only client register |
| Manager | Viewer access plus CKYC search/download requests, response handling, and Create CKYC data |
| Admin | Manager access plus FinFlux updates, user management, and audit trails |

- Require an authenticated account; public signup is disabled.
- Enforce role checks in both the UI and API.
- Use server-managed sessions, CSRF protection for mutations, and login rate
  limiting.
- Keep bootstrap Admin credentials secret-managed. Never store credentials in
  the requirements document, generated inventory, local setup notes, or source
  control.
- Record relevant account and operational mutations in the audit trail.

## Dashboard

- Summarize client imports, CKYC request and response activity, final CKYC
  availability, pending/error counts, and FinFlux status.
- Keep dashboard summaries consistent with the underlying register and saved
  operational records.

## LMS client register

- Import LMS files using the exact headers:
  `loanid`, `ClientID`, `disbursedon_date`, `Client_UID`, `Client_VID`,
  `Client_PAN`, `ClientName`, `mobile_no`, `alternate_mobile_no`, `Gender`,
  `date_of_birth`.
- Retain the source filename and report imported, skipped, and duplicate row
  counts. Skip rows that do not meet required-field validation.
- Prevent repeat imports from creating duplicate client identities.
- Normalize repeated whitespace in client names and mask UID values before
  storing them.
- Provide search, status filters, pagination, client detail views, and handoff
  from eligible clients into CKYC workflows.
- Export the filtered register to CSV with client identifiers, saved CKYC
  response/final-number details, response match information, request/response
  row evidence, errors, and FinFlux update status.
- Match FinFlux status using the exact LMS ClientID plus saved Final CKYC
  number. Display `Updated` for a successful exact-pair update, `Failed` for a
  failed attempt without a success, `Pending` when a final number exists with
  no success or failure, and `Final CKYC required` when no final number exists.

## CKYC search requests

- Let Managers and Admins select eligible clients and generate a previewable,
  downloadable pipe-delimited CKYC request file.
- Use the configured CKYC V1.1 format and FICODE `IN2884`:
  - Header: `10|IN2884|1|<record-count>|V1.1|DD-MM-YYYY||||`
  - Do not add a branch-code field.
  - Generate one `E` row from Aadhaar/UID, using only its last four digits.
  - Generate a separate `B` row for every available non-Aadhaar identifier
    (VID and PAN).
  - Number records sequentially and set the header count to generated KYC rows,
    not selected clients.
- Use gateway filenames in the form
  `IN2884_DATESTAMP_V1.1_SNNNNN.txt`, with stored sequential numbers beginning
  at `S10001`.
- Save the exact generated request content and metadata so the original file
  can be downloaded later.
- Exclude clients already resolved by a CKYC response ID or a completed CKYC
  error response from later search requests.

## CKYC response files and request history

- Show generated request history and response-uploaded status, with request
  details, content preview, and download.
- Accept gateway response files and retain the original uploaded file and
  response rows for review and download.
- Match returned records to clients using the supported request/response
  identifiers and expose the match source and exact matched row evidence.
- Keep valid uploaded response files visible and downloadable even when a
  request number is not available yet; attach them to a matching request later
  when possible.
- Allow authorized operators to archive older uploads without deleting their
  content, download access, or request associations.
- Restore missing response-row details only when the original response file
  contains one unambiguous matching row; reject missing, duplicate, or
  ambiguous matches.
- Preserve existing response-history limits and clearly communicate when
  older records are outside the displayed history.

## CKYC download requests

- Provide a separate download-request workflow for clients with a saved CKYC
  response ID and no final CKYC number.
- Generate type 60 rows as
  `60|<ALPHANUMERIC Reference NO>|<DD-MM-YYYY DOB>|1||`.
- Use the last 14 characters of the saved response ID and the matching LMS date
  of birth. Do not generate a row without a DOB.
- Generate the type 10 header as
  `10|<request-number>|IN2884|1|1BR|<record-count>|||||`.
- Use filenames in the form
  `IN2884_1_DDMMYYYY_V1.3_IRA010815_D<request-number>.txt`; request numbers
  begin at `D10701` and are unique.
- Accept portal `.xlsx` and final CKYC `.txt` responses, retain uploaded
  response records, and save matched KYC numbers as the client's final CKYC
  number.
- Attach a TXT response uploaded before its D request exists once the matching
  request number is generated.
- Exclude clients with a saved final CKYC number from future download requests.

## Create CKYC data

- Allow authorized users to import and review Create CKYC result files.
- Match Create results safely by client identity and final CKYC number; do not
  claim an ambiguous match when successful rows contain multiple different
  numbers for one client.
- Use confirmed successful Create results to identify a match without
  overwriting unrelated or conflicting response history.
- Preserve import history and expose result status and row-level evidence.

## FinFlux updates

- Restrict FinFlux operations to Admins.
- Allow Admins to select saved final CKYC records or preview an uploaded CSV or
  XLSX before submission.
- Require the exact `client_id, ckyc_number` input pair. Keep invalid rows
  visible in preview but exclude them from submission; reject duplicate or
  otherwise ambiguous pairs.
- Do not persist credentials entered for a FinFlux run in browser storage.
- Process large submissions in bounded batches, report asynchronous job
  progress/results, and retain failures separately from successful exact-pair
  confirmations.
- Treat a successful update as applying only to the exact ClientID and CKYC
  number submitted. Do not mark a changed CKYC number as updated based on a
  previous ClientID-only success.

## User management and audit

- Let Admins list users, create accounts, update user details/roles, and review
  newest-first audit history.
- Normalize usernames and enforce uniqueness; reserve the bootstrap Admin
  identity and prevent demoting the last Admin.
- Keep historical actor identifiers and audit records intact.
- Paginate audit history and expose the total record count.

## Local documentation update workflow

- Run `pnpm run requirements:sync` to refresh the generated implementation
  inventory once.
- Run `pnpm run requirements:watch` in a separate terminal during local
  implementation. It refreshes the inventory after changes to CKYC frontend,
  API, local app configuration, schema, API-contract, and dependency-manifest
  files. Stop it with `Ctrl+C`.
- The watcher updates only the generated inventory. Functional acceptance
  criteria above remain human-reviewed and must be updated with the feature
  implementation.

<!-- CKYC_REQUIREMENTS_AUTO_START -->

## Auto-generated implementation inventory

Last refreshed: 2026-09-30T04:42:23.239Z

### Frontend pages
- `artifacts/ckyc-manager/src/pages/admin-users.tsx`
- `artifacts/ckyc-manager/src/pages/audit-trails.tsx`
- `artifacts/ckyc-manager/src/pages/ckyc-create-data.tsx`
- `artifacts/ckyc-manager/src/pages/client-detail.tsx`
- `artifacts/ckyc-manager/src/pages/clients.tsx`
- `artifacts/ckyc-manager/src/pages/download-requests.tsx`
- `artifacts/ckyc-manager/src/pages/finflux-update.tsx`
- `artifacts/ckyc-manager/src/pages/not-found.tsx`
- `artifacts/ckyc-manager/src/pages/overview.tsx`
- `artifacts/ckyc-manager/src/pages/public-home.tsx`
- `artifacts/ckyc-manager/src/pages/request-detail.tsx`
- `artifacts/ckyc-manager/src/pages/requests.tsx`

### API route modules
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/ckyc-create-data.ts`
- `artifacts/api-server/src/routes/ckyc-downloads.ts`
- `artifacts/api-server/src/routes/ckyc.ts`
- `artifacts/api-server/src/routes/clients.ts`
- `artifacts/api-server/src/routes/dashboard.ts`
- `artifacts/api-server/src/routes/finflux.ts`
- `artifacts/api-server/src/routes/health.ts`
- `artifacts/api-server/src/routes/index.ts`

### Database schema modules
- `lib/db/src/schema/appAccess.ts`
- `lib/db/src/schema/authSessions.ts`
- `lib/db/src/schema/ckycCreateData.ts`
- `lib/db/src/schema/ckycDownloadRequests.ts`
- `lib/db/src/schema/ckycDownloadResponseRecords.ts`
- `lib/db/src/schema/ckycRequests.ts`
- `lib/db/src/schema/clients.ts`
- `lib/db/src/schema/finfluxCkycUpdates.ts`
- `lib/db/src/schema/index.ts`

### Test files
- `artifacts/api-server/src/ckyc-response-restore.test.ts`
- `artifacts/api-server/src/ckyc-workflow.test.ts`
- `artifacts/api-server/src/clients-response-status.test.ts`
- `artifacts/api-server/src/finflux.test.ts`
- `artifacts/api-server/src/local-auth.test.ts`
- `artifacts/api-server/src/role-permissions.test.ts`
- `artifacts/ckyc-manager/src/lib/client-register-filters.test.ts`
- `artifacts/ckyc-manager/src/lib/csv.test.ts`

### Dependency manifests
- Workspace: 1 runtime and 2 development dependencies; scripts: `build`, `typecheck`.
- `@workspace/ckyc-manager`: 0 runtime and 63 development dependencies; scripts: `dev`, `build`, `serve`, `typecheck`.
- `@workspace/api-server`: 7 runtime and 7 development dependencies; scripts: `dev`, `build`, `start`, `test`, `typecheck`.

### Environment variable names detected in source
Names only are listed; values are never read.
`BASE_PATH`, `BASE_URL`, `CKYC_ADMIN_PASSWORD`, `CKYC_TEST_AUTH_BYPASS`, `DEV`, `LOG_LEVEL`, `NODE_ENV`, `PORT`, `REPL_ID`, `SESSION_SECRET`

### Current implementation-file changes
- `M package.json`

<!-- CKYC_REQUIREMENTS_AUTO_END -->