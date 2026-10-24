#!/usr/bin/env bash
# Applies all migrations to a throwaway PostgreSQL cluster and runs the SQL
# tests. Requires PostgreSQL 15+ binaries (initdb, pg_ctl, psql).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pgbin="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
tmp="$(mktemp -d)"
port="${PG_TEST_PORT:-55432}"
runas=()
cleanup() { "${runas[@]}" "$pgbin/pg_ctl" -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT

if [ "$(id -u)" = "0" ]; then
  # initdb refuses to run as root.
  id forma_pg >/dev/null 2>&1 || useradd -M -s /bin/false forma_pg
  chown -R forma_pg "$tmp"
  runas=(runuser -u forma_pg --)
fi

"${runas[@]}" "$pgbin/initdb" -D "$tmp/data" -U postgres --auth=trust >/dev/null
"${runas[@]}" "$pgbin/pg_ctl" -D "$tmp/data" -o "-p $port -k $tmp" -l "$tmp/log" start >/dev/null
psql_cmd=("$pgbin/psql" -h "$tmp" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${psql_cmd[@]}" -f "$here/00_local_auth_stub.sql"
for f in "$here"/../migrations/*.sql; do
  echo "applying $(basename "$f")"
  "${psql_cmd[@]}" -f "$f"
done
"${psql_cmd[@]}" -f "$here/10_rls_and_sync_test.sql"
