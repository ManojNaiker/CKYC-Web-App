# CKYC Data Request Manager

A CKYC operations workspace for importing LMS client records, generating document-specific search request files, and tracking returned response files.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
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

## Product

- Import CSV LMS exports into a searchable client register.
- Review dashboard counts and recent CKYC activity.
- Select client rows, configure CKYC header values, and generate a correctly named `.txt` request file.
- Upload a gateway response to its matching request, preview both files, and download either one.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Keep CKYC dates in the file’s required `DDMMYYYY` / `DD-MM-YYYY` text formats; they are intentionally not converted to timestamps.
- The header uses the total generated KYC row count, not the number of selected clients; there is no branch-code field in the request builder.
- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
