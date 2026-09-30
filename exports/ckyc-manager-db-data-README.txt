CKYC Manager development database data export
=============================================

This package contains data only. Create/update the local database schema first,
then import the SQL dump.

The dump includes the current CKYC, client, FinFlux, and audit data. Historical
application-user rows are retained with password hashes cleared. Authentication
session rows are intentionally omitted because they are temporary and must not
be reused in a local environment.

Recommended import:

  psql "$DATABASE_URL" -f exports/ckyc-manager-db-data.sql

If the local database already contains app data, import into a fresh/empty
local database to avoid duplicate rows and unique-key conflicts.

The dump preserves primary-key values and includes PostgreSQL sequence updates.
It does not contain DATABASE_URL, password hashes, active sessions, application
secrets, or schema DDL.
