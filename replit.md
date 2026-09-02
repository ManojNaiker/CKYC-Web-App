# CKYC Data Request Manager

A CKYC operations workspace for importing LMS client records, generating document-specific search request files, and tracking returned response files.

## Run & Operate

- Replit Run button: start the `CKYC Manager` workflow, which serves the React app and API together.
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm test:ckyc` — run the CKYC import, request-generation, and response-file integration checks
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ckyc-manager/` — React web app with overview, client register, request builder, and request detail screens.
- `artifacts/api-server/src/routes/` — Express routes for client imports, CKYC request generation, responses, and dashboard summary.
- `lib/api-spec/openapi.yaml` — source of truth for the API contract and generated client hooks.
- `lib/db/src/schema/clients.ts` and `lib/db/src/schema/ckycRequests.ts` — Drizzle schema for stored LMS rows and file trails.

## Architecture decisions

- LMS rows preserve the source column names at the API boundary, while the database uses conventional snake_case columns.
- CKYC request content is generated server-side and preserved with each request so the exact outbound file can be downloaded later.
- The first format supports the sample pipe-delimited header and E/B record modes; Aadhaar (`Client_UID`) uses its last four digits for E, while each available non-Aadhaar identifier uses a separate B row.
- Request and response files are handled as text so operators can preview and download them without needing a separate desktop utility.

## Functional requirements

### LMS client data

- Import LMS CSV exports and preserve these source headers exactly:
  `loanid`, `ClientID`, `disbursedon_date`, `Client_UID`, `Client_VID`, `Client_PAN`, `ClientName`, `mobile_no`, `alternate_mobile_no`, `Gender`, `date_of_birth`.
- Store imported rows in PostgreSQL and show them in a searchable, paginated client register.
- Preserve the source file name and report imported/skipped row counts.
- Collapse repeated whitespace in `ClientName` to a single space during import and CKYC file generation.

### CKYC search request generation

- Allow operators to select clients and generate a pipe-delimited CKYC text file.
- Use the current CKYC defaults:
  - Version: `V1.1`
  - FICODE / institution code: `IN2884`
  - Type 10 header field 4: total generated CKYC record count
  - Type 10 header: `10|IN2884|1|<record-count>|V1.1|DD-MM-YYYY||||`
  - No branch-code field
- Build one CKYC row for every available KYC identifier:
  - Aadhaar (`Client_UID`) → one `E` row using the last four digits, with name, date of birth, and gender.
  - Every available non-Aadhaar identifier (`Client_VID`, `Client_PAN`) → its own `B` row.
- Number generated CKYC rows sequentially from `1`.
- Set the header row count to the total number of generated KYC rows, not the number of selected clients.
- Use the gateway filename format:
  `FICODE_DATESTAMP_VERSION_SNNNNNN.txt`
  - Example: `IN2884_02092026_V1.1_S10001.txt`
  - The serial is six digits and is generated from the stored request sequence.
- Preview and download the generated request file, and retain its content and metadata in PostgreSQL.

### CKYC response handling

- Show request history with generated/response-uploaded status.
- Open request details with request content preview and download.
- Upload a CKYC gateway response text file against its matching request.
- Preview and download the stored response file.

### Workspace and branding

- Provide an overview dashboard with imported client, request, response, and workspace-health counts.
- Use the attached Light Finance logo and display `Light Finance` as the application brand.
- Use logo-matched blue, orange, and lime accents with a neutral background so the logo remains readable and does not overlap application content.
- Keep the responsive operations workspace usable on desktop and mobile.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Keep CKYC dates in the file’s required `DDMMYYYY` / `DD-MM-YYYY` text formats; they are intentionally not converted to timestamps.
- The header uses the total generated KYC row count, not the number of selected clients; there is no branch-code field in the request builder.
- Gateway request filenames must follow `FICODE_DATESTAMP_VERSION_SNNNN.txt`, starting at `S10001`, for example `IN2884_02092026_V1.1_S10001.txt`.
- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
