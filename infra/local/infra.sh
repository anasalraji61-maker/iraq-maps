#!/bin/sh
# Local PostgreSQL 16 + PostGIS and Redis without Docker (ADR-0004). Idempotent.
# Usage: sh infra/local/infra.sh up|down|status
# Dev-only defaults below are not secrets; they never reach production.
set -eu

PG_VERSION=16
PG_CLUSTER=main
PG_PORT=5432
DB_USER=iraqmaps
DB_PASSWORD=iraqmaps
DB_NAME=iraqmaps
TEMPLATE_DB=iraqmaps_template # cloned by createTestDatabase() in packages/db-kit
REDIS_PORT=6379

as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
as_postgres() { if [ "$(id -u)" -eq 0 ]; then runuser -u postgres -- "$@"; else sudo -u postgres "$@"; fi; }
sql() { as_postgres psql -p "$PG_PORT" -v ON_ERROR_STOP=1 -qAt -c "SET client_min_messages = warning" "$@"; }
pg_running() { as_root pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" status >/dev/null 2>&1; }
redis_running() { redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1; }

ensure_db() { # $1 = name, $2 = extra CREATE DATABASE options
  if [ -z "$(sql -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$1'")" ]; then
    sql -d postgres -c "CREATE DATABASE $1 OWNER $DB_USER ENCODING 'UTF8' LOCALE 'C.UTF-8' TEMPLATE template0 $2"
  fi
  sql -d "$1" -c 'CREATE EXTENSION IF NOT EXISTS postgis' -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm'
}

up() {
  pg_running || as_root pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" start
  until pg_isready -q -h localhost -p "$PG_PORT"; do sleep 0.2; done
  sql -d postgres -c "DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN CREATE ROLE $DB_USER; END IF;
  END \$\$" -c "ALTER ROLE $DB_USER LOGIN CREATEDB PASSWORD '$DB_PASSWORD'"
  ensure_db "$TEMPLATE_DB" "IS_TEMPLATE true"
  ensure_db "$DB_NAME" ""
  redis_running || redis-server --daemonize yes --port "$REDIS_PORT" --save "" --appendonly no >/dev/null
  until redis_running; do sleep 0.2; done
  echo "postgres and redis are up"
  echo "DATABASE_URL=postgres://$DB_USER:$DB_PASSWORD@localhost:$PG_PORT/$DB_NAME"
  echo "REDIS_URL=redis://localhost:$REDIS_PORT"
}

down() {
  if pg_running; then as_root pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" stop; fi
  if redis_running; then redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null; fi
  echo "postgres and redis are down"
}

status() {
  ok=0
  if pg_running; then echo "postgres: up (port $PG_PORT)"; else echo "postgres: down"; ok=1; fi
  if redis_running; then echo "redis: up (port $REDIS_PORT)"; else echo "redis: down"; ok=1; fi
  return $ok
}

case "${1:-}" in
  up | down | status) "$1" ;;
  *) echo "usage: $0 up|down|status" >&2; exit 2 ;;
esac
