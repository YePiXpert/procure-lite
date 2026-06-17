#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

service_name="${PROCURE_LITE_SERVICE_NAME:-procure-lite}"
timeout_seconds="${PROCURE_LITE_VERIFY_TIMEOUT_SECONDS:-120}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is not installed or not in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] Docker Compose is not available." >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "[INFO] Created .env from .env.example"
fi

echo "[INFO] Starting ${service_name} with Docker Compose..."
docker compose up -d --build

container_id="$(docker compose ps -q "${service_name}")"
if [ -z "${container_id}" ]; then
  echo "[ERROR] Could not resolve container id for service ${service_name}." >&2
  docker compose ps
  exit 1
fi

echo "[INFO] Waiting for Docker healthcheck..."
deadline=$((SECONDS + timeout_seconds))
while true; do
  health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_id}")"
  if [ "${health_status}" = "healthy" ] || [ "${health_status}" = "none" ]; then
    break
  fi
  if [ "${health_status}" = "unhealthy" ]; then
    echo "[ERROR] Container healthcheck is unhealthy." >&2
    docker compose ps
    docker compose logs --tail=120 "${service_name}" >&2
    exit 1
  fi
  if [ "${SECONDS}" -ge "${deadline}" ]; then
    echo "[ERROR] Timed out waiting for healthcheck. Last status: ${health_status}" >&2
    docker compose ps
    docker compose logs --tail=120 "${service_name}" >&2
    exit 1
  fi
  sleep 2
done

port="$(grep -E '^[[:space:]]*PROCURE_LITE_PORT[[:space:]]*=' .env 2>/dev/null | tail -n 1 | cut -d '=' -f 2- | sed 's/[[:space:]]*#.*$//' | tr -d '[:space:]')"
port="${port:-8000}"
if [[ "${port}" == *":"* ]]; then
  host_port="${port##*:}"
else
  host_port="${port}"
fi
base_url="http://127.0.0.1:${host_port}"

echo "[INFO] Checking public metadata endpoint..."
python - "${base_url}" <<'PY'
import json
import sys
import urllib.request

base_url = sys.argv[1]
with urllib.request.urlopen(f"{base_url}/api/app/metadata", timeout=10) as response:
    payload = json.loads(response.read().decode("utf-8"))
version = str(payload.get("version") or "").strip()
if not version:
    raise SystemExit("metadata endpoint did not return version")
print(f"[INFO] Running version: {version}")
PY

echo "[INFO] Checking in-container system status..."
status_json="$(docker compose exec -T "${service_name}" python - <<'PY'
import json
from routers.system import _build_system_status

print(json.dumps(_build_system_status(), ensure_ascii=False))
PY
)"

python - "${status_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
health = payload.get("health") or {}
storage_risk = health.get("storage_risk", "unknown")
database_check = health.get("database_check") or {}

print(f"[INFO] Storage risk: {storage_risk}")
print(f"[INFO] Database check ok: {database_check.get('ok')}")

if storage_risk == "critical":
    raise SystemExit("critical storage risk reported by /api/system/status")
if database_check.get("ok") is False:
    raise SystemExit(f"database check failed: {database_check.get('error')}")
PY

echo "[INFO] Deployment verification passed."
echo "[INFO] If a future update fails, inspect logs with:"
echo "       docker compose logs --tail=200 ${service_name}"
