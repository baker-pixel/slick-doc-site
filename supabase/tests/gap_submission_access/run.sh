#!/bin/bash
# Tests the lead-table lockdown (migration 20261126130000 + pending 20261126140000) on a
# THROWAWAY local Postgres: same table shape and the same 4 open policies as production,
# exercised as the anon / authenticated roles. Needs Postgres installed (brew postgresql@15).
#   supabase/tests/gap_submission_access/run.sh
# Phases: 0 reproduces today's exposure, 1 tests the RPCs after the additive migration,
# 2 drops the anon policies and proves anon is locked out while the funnel and apps still work.
set -euo pipefail
B="${PG_BIN:-/opt/homebrew/opt/postgresql@15/bin}"
D="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$D/../.." && pwd)"
WORK="$(mktemp -d)"; export PGPORT="${PGPORT:-54399}" PGHOST=/tmp PGUSER=postgres PGDATABASE=postgres
"$B/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"$B/pg_ctl" -D "$WORK/data" -o "-p $PGPORT -k /tmp" -l "$WORK/pg.log" -w start >/dev/null
trap '"$B/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
P="$B/psql -v ON_ERROR_STOP=1 -q"
$P -f "$D/bootstrap.sql" -f "$D/table.sql" -f "$D/live_policies.sql" -f "$D/tests.sql"
echo "== applying migration A (additive)"; $P -f "$R/migrations/20261126130000_gap_submission_access.sql"
$P -f "$D/tests_after_a.sql"
echo "== applying part 2 (drop anon policies)"; $P -f "$R/pending-migrations/20261126140000_drop_anon_gap_submission_policies.sql"
$P -f "$D/tests_after_drop.sql"
echo "ALL PHASES PASSED"
