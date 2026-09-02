---
name: Imported workflow registration
description: How to handle imported pnpm workspaces whose artifact TOMLs exist but managed workflow entries are not registered
---

Imported projects can contain valid artifact.toml service definitions without those services appearing in the workspace artifact/workflow registry. In that case, use one descriptive workflow to start the frontend and API together, preserving each service's documented port and required environment. The frontend dev server must proxy same-origin API paths to the API port when no active Replit router mapping exists.

**Why:** Direct managed-artifact restart fails when the import has not registered the artifact metadata, while leaving the project without a run workflow prevents the user from opening the app.

**How to apply:** First check the registered artifact/workflow lists. If the existing artifact entries are absent, avoid inventing a duplicate artifact; configure a descriptive project workflow that starts the API in the background and the frontend in the foreground. Verify an API endpoint through the frontend-facing port as well as the shared proxy; receiving SPA HTML from the frontend port means an explicit development proxy is still required.