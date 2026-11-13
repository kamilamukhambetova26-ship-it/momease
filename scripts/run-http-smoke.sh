#!/usr/bin/env bash
# Полная проверка сайта: чистая БД -> миграции -> демо-данные -> сервер -> HTTP-тесты.
# Запуск: npm run build && bash scripts/run-http-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PGLITE_DIR=.data/http-smoke
export AUTH_SECRET="${AUTH_SECRET:-smoke-test-secret-0123456789abcdefghijklmnop}"
export NEXT_TELEMETRY_DISABLED=1
unset DATABASE_URL
PORT="${PORT:-3100}"

rm -rf "$PGLITE_DIR"
npx tsx scripts/migrate.ts
SEED_DEMO=1 npx tsx scripts/seed.ts >/dev/null
npx tsx scripts/ids.ts

if curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "Порт $PORT уже занят. Остановите другой сервер или задайте PORT=..." >&2
  exit 1
fi

# Запускаем next напрямую (не через npx), чтобы trap остановил именно сервер
node node_modules/next/dist/bin/next start -p "$PORT" >/tmp/momease-smoke-server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 1
done

BASE="http://localhost:$PORT" npx tsx scripts/http-smoke.ts
