#!/bin/bash
# Office Supplies Tracker Docker launcher

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is not installed or not in PATH."
  exit 1
fi

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "Pulling the published Docker image..."
docker compose pull office-supplies-tracker

echo "Starting Office Supplies Tracker..."
docker compose up -d

port="$(grep -E '^[[:space:]]*OFFICE_SUPPLIES_PORT[[:space:]]*=' .env 2>/dev/null | tail -n 1 | cut -d '=' -f 2- | sed 's/[[:space:]]*#.*$//' | tr -d '[:space:]')"
port="${port:-8000}"

echo ""
echo "Office Supplies Tracker is running:"
echo "  http://localhost:${port}"
echo ""
echo "Stop service:"
echo "  docker compose down"
