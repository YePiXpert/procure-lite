#!/bin/bash
# Procure Lite Docker launcher

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is not installed or not in PATH."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] Docker Compose is not available."
  exit 1
fi

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "Building and starting Procure Lite..."
docker compose up -d --build

port="$(grep -E '^[[:space:]]*PROCURE_LITE_PORT[[:space:]]*=' .env 2>/dev/null | tail -n 1 | cut -d '=' -f 2- | sed 's/[[:space:]]*#.*$//' | tr -d '[:space:]')"
port="${port:-8000}"

echo ""
echo "Procure Lite is running:"
echo "  http://<VPS_PUBLIC_IP>:${port}"
echo "  or your configured HTTPS domain"
echo ""
echo "Stop service:"
echo "  docker compose down"
