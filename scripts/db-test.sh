#!/usr/bin/env bash
# ============================================================
# Runs every migration + every SQL security test on a LOCAL Postgres.
#
#   DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
#
# Safety: refuses to run unless the host is localhost, so it can
# never touch a hosted (production/staging) database by accident.
#
# What it does:
#   1. creates a fresh scratch database
#   2. loads a tiny Supabase imitation (roles, auth, storage)
#   3. applies supabase/migrations/*.sql in order
#   4. runs supabase/tests/*.test.sql, each must finish without error
# ============================================================
set -euo pipefail

BASE_URL="${DATABASE_URL:-}"
if [ -z "$BASE_URL" ]; then
  echo "Set DATABASE_URL to a local Postgres, e.g. postgres://postgres@localhost:5432/postgres" >&2
  exit 1
fi

HOST=$(echo "$BASE_URL" | sed -E 's#^[a-z]+://([^@/]*@)?([^:/]+).*#\2#')
if [ "$HOST" != "localhost" ] && [ "$HOST" != "127.0.0.1" ]; then
  echo "Refusing to run: host '$HOST' is not local. These tests drop and recreate a database." >&2
  exit 1
fi

DB_NAME="liferpg_test"
ROOT_URL="$BASE_URL"                                   # used to create/drop the scratch DB
TEST_URL="$(echo "$BASE_URL" | sed -E "s#/[^/?]*(\?.*)?\$#/$DB_NAME#")"

psql "$ROOT_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE)" -c "CREATE DATABASE $DB_NAME"

run() { psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

echo "▶ loading Supabase stub"
run -f supabase/tests/00_supabase_stub.sql

echo "▶ applying migrations"
for f in supabase/migrations/*.sql; do
  echo "   $f"
  PGOPTIONS="-c client_min_messages=warning" run -f "$f" > /dev/null
done

echo "▶ loading test helpers"
run -f supabase/tests/01_helpers.sql

FAILED=0
# NOTE: "set -o pipefail" makes the pipeline below fail when psql fails.
for t in supabase/tests/*.test.sql; do
  echo "▶ $t"
  # -o /dev/null hides query result tables; we only want the "ok / FAIL" lines.
  if ! run -o /dev/null -f "$t" 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE:  )?//'; then FAILED=1; fi
done

if [ "$FAILED" -ne 0 ]; then echo "✖ some DB tests failed" >&2; exit 1; fi
echo "✔ all DB tests passed"
