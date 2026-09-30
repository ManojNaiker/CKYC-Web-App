# CKYC Manager Local Setup

## Dependency source of truth

This is a Node.js/TypeScript pnpm workspace; it does not use Python
`requirements.txt`.

- `package.json` at the repository root defines workspace-level tools and
  commands.
- `artifacts/ckyc-manager/package.json` and
  `artifacts/api-server/package.json` define the app and API dependencies.
- `pnpm-workspace.yaml` defines workspace package discovery and shared version
  catalogs.
- `pnpm-lock.yaml` pins the resolved dependency tree for repeatable installs.

Install dependencies from the repository root:

```sh
pnpm install --frozen-lockfile
```

When adding a dependency, add it to the package that imports it; use the shared
catalog when appropriate, then commit the updated manifest and lockfile.

## Prerequisites

- Node.js 20 or newer.
- pnpm.
- A development PostgreSQL database.

## Environment

Set these variables in your local shell or approved secret manager. Do not put
real values in this file or commit them.

| Variable | Local use |
| --- | --- |
| `DATABASE_URL` | Connection to a development PostgreSQL database |
| `SESSION_SECRET` | Signing/encryption material for local sessions |
| `CKYC_ADMIN_PASSWORD` | Bootstrap local Admin password |
| `PORT` | Service port; use `8080` for the API and `21959` for the web app |
| `BASE_PATH` | Web app base path; use `/` for the local Vite server |
| `NODE_ENV` | Set by the API dev/test scripts |
| `LOG_LEVEL` | Optional API log verbosity |
| `CKYC_TEST_AUTH_BYPASS` | Test-only auth bypass; the CKYC test script sets it |
| `REPL_ID` | Optional Replit development-plugin switch; not needed for ordinary local development |

Use a development database only. Never point local schema-push or integration
tests at production data.

## Prepare the database

After setting `DATABASE_URL` to your development database, apply the current
development schema when needed:

```sh
pnpm --filter @workspace/db run push
```

This command is for development schema setup, not production migrations.

## Run locally

Start the API and web app in separate terminals from the repository root.

Terminal 1:

```sh
PORT=8080 pnpm --filter @workspace/api-server run dev
```

Terminal 2:

```sh
PORT=21959 BASE_PATH=/ pnpm --filter @workspace/ckyc-manager run dev
```

The Vite server proxies `/api` to `http://127.0.0.1:8080`. The API requires the
database and local Admin/session variables above.

## Verify changes

```sh
pnpm run typecheck
pnpm test:ckyc
pnpm run requirements:sync
```

To keep the generated implementation inventory in
`APPLICATION_REQUIREMENTS.md` refreshed while coding, run this in another
terminal:

```sh
pnpm run requirements:watch
```