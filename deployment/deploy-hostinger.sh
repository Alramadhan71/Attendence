#!/usr/bin/env bash
set -euo pipefail

APP_NAME="attendence"
APP_DIR="/opt/$APP_NAME"
DOMAIN="attendence.muslimalramadan71.com"
LOCAL_PORT="5182"
UPSTREAM="${APP_NAME}-app-1:80"
NETWORK="${APP_NAME}_default"
GATEWAY_DIR="/opt/shared-gateway"

cd "$APP_DIR"
docker compose up -d --build --remove-orphans

for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$LOCAL_PORT/health" >/dev/null 2>&1; then
    echo "Internal health check passed."
    break
  fi
  sleep 2
  if [ "$i" = "30" ]; then
    docker compose logs --no-color --tail=120 app >&2
    exit 1
  fi
done

if [ -d "$GATEWAY_DIR" ]; then
  CADDYFILE="$GATEWAY_DIR/Caddyfile"
  BEGIN="# BEGIN $APP_NAME"
  END="# END $APP_NAME"
  touch "$CADDYFILE"
  awk -v begin="$BEGIN" -v end="$END" '
    $0 == begin { skip = 1; next }
    $0 == end { skip = 0; next }
    !skip { print }
  ' "$CADDYFILE" > "$CADDYFILE.tmp"
  mv "$CADDYFILE.tmp" "$CADDYFILE"
  cat >> "$CADDYFILE" <<CADDY
$BEGIN
$DOMAIN {
  encode gzip zstd
  reverse_proxy $UPSTREAM
}
$END
CADDY

  CADDY_CONTAINER="$(cd "$GATEWAY_DIR" && docker compose ps -q caddy 2>/dev/null || true)"
  if [ -n "$CADDY_CONTAINER" ]; then
    docker network connect "$NETWORK" "$CADDY_CONTAINER" 2>/dev/null || true
    cd "$GATEWAY_DIR"
    docker compose up -d
    docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile
  fi
fi

for i in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
    echo "Public deployment verification passed."
    exit 0
  fi
  sleep 2
done

echo "Public health check failed for https://$DOMAIN/health" >&2
exit 1
