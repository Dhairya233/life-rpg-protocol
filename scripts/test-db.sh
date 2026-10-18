#!/usr/bin/env bash
# ============================================================
# Database security tests (plain Postgres, no Docker/Supabase needed).
#
#   DATABASE_URL='postgres://postgres@localhost:5432/liferpg_test' scripts/test-db.sh
#
# Steps:
#   1. wipe the test database and install tiny Supabase stand-ins
#   2. apply every migration in supabase/migrations/ in order
#   3. run supabase/tests/*.test.sql
#
# Options (environment variables):
#   MIGRATIONS_UPTO=020  stop after migration 020, i.e. test the ORIGINAL
#                        database. Combine with TESTS=05 to see the attack
#                        tests FAIL against the original design.
#   TESTS=05             run only test files whose name starts with this.
#
# SAFETY: the script erases the schemas public/auth/storage/tests, so it
# refuses to run unless the database name contains "test".
# ============================================================
set -uo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a throwaway Postgres database whose name contains 'test'}"

root="$(cd "$(dirname "$0")/.." && pwd)"
run_sql()  { psql "$DATABASE_URL" -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }
# Show only the lines a human cares about (NOTICE text, errors).
tidy()     { sed -E 's/^psql:[^ ]+ (NOTICE|ERROR|WARNING):  /\1: /; s/^NOTICE: +//' | grep -vE '^(WARNING|HINT|DETAIL|CONTEXT)|wal_level|^$'; }

db_name="$(psql "$DATABASE_URL" -X -At -c 'SELECT current_database()')" || exit 2
if [[ "$db_name" != *test* ]]; then
  echo "Refusing to run: database name '$db_name' does not contain 'test'." >&2
  exit 2
fi

echo "==> Resetting '$db_name' and installing Supabase stand-ins"
run_sql -c "DROP SCHEMA IF EXISTS tests, public, auth, storage CASCADE; CREATE SCHEMA public;
            ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;" >/dev/null 2>&1
run_sql -f "$root/supabase/tests/00_supabase_stub.sql" >/dev/null 2>&1 || { echo "stub install failed" >&2; exit 1; }

echo "==> Applying migrations${MIGRATIONS_UPTO:+ (up to $MIGRATIONS_UPTO)}"
for f in "$root"/supabase/migrations/*.sql; do
  num="$(basename "$f" | cut -d_ -f1)"
  if [[ -n "${MIGRATIONS_UPTO:-}" && "$((10#$num))" -gt "$((10#$MIGRATIONS_UPTO))" ]]; then break; fi
  if ! out="$(run_sql -f "$f" 2>&1)"; then
    echo "Migration FAILED: $(basename "$f")" >&2; echo "$out" >&2; exit 1
  fi
done

run_sql -f "$root/supabase/tests/01_helpers.sql" >/dev/null || exit 1

status=0
for f in "$root"/supabase/tests/${TESTS:-}*.test.sql; do
  [[ -e "$f" ]] || continue
  echo "==> $(basename "$f")"
  run_sql -f "$f" 2>&1 | tidy
  [[ ${PIPESTATUS[0]} -ne 0 ]] && status=1
done

# The race-condition test needs two database sessions, so it is a shell script.
if [[ -z "${TESTS:-}" ]]; then
  export DATABASE_URL
  "$root/supabase/tests/concurrency.sh" || status=1
fi

if [[ $status -eq 0 ]]; then echo "ALL DATABASE TESTS PASSED"; else echo "DATABASE TESTS FAILED"; fi
exit $status
