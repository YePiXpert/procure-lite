# Release Checklist

Use this checklist before tagging, publishing, or deploying a Procure Lite update.

## 1. Working Tree

- Confirm the work is on `main`.
- Confirm there are no accidental local artifacts:

```powershell
git status --short
```

- Keep ignored runtime data such as `state/` or `procure-lite-state/` out of commits.

## 2. Required Local Verification

Run the focused checks that protect the current frontend module boundaries and system-health surface:

```powershell
.\.codex-venv\Scripts\python.exe -m pytest -p no:cacheprovider --basetemp .codex-pytest-tmp tests\test_operations_app_api_static.py tests\test_settings_maintenance_api_static.py tests\test_system_health_ui_static.py tests\test_system_status.py tests\test_pwa.py -v
```

Run project validation and the API smoke suite:

```powershell
.\.codex-venv\Scripts\python.exe scripts\validate_project.py --skip-smoke
.\.codex-venv\Scripts\python.exe scripts\run_api_smoke_checks.py
```

Run parser regression when import/OCR behavior changed:

```powershell
.\.codex-venv\Scripts\python.exe scripts\run_regression_suite.py --no-report
```

Run JavaScript syntax checks after frontend script changes:

```powershell
node --check static\operations-center-app-api.js
node --check static\settings-maintenance-api.js
node --check static\api.js
node --check static\ui.js
```

Finish with whitespace checks:

```powershell
git diff --check HEAD
```

Clean temporary test output:

```powershell
if (Test-Path -LiteralPath ".codex-pytest-tmp") { Remove-Item -LiteralPath ".codex-pytest-tmp" -Recurse -Force }
```

## 3. Runtime Smoke

Before deployment, start the app locally or in a staging container and confirm:

- First-time setup or login works.
- Dashboard, ledger, operations center, reports, audit, and settings routes render.
- Settings maintenance shows system health, local backups, and WebDAV status.
- Operations center can load supplier, inventory, purchase, receipt, invoice, and attachment queues.
- Backup download and backup health check succeed.

## 4. Data Safety

Before updating an existing VPS:

- Create or download a fresh local backup from the settings maintenance page.
- Keep the latest `procure-lite-state/` directory backup for rollback.
- Confirm free disk space is sufficient for a new backup archive and Docker image rebuild.

## 5. VPS Deployment

On the VPS:

```bash
cd /opt/procure-lite
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=120 procure-lite
```

After deployment:

- Open the public URL and log in.
- Visit settings maintenance and confirm system health is normal.
- Create a test backup or run the backup health check if the release changed backup, restore, storage, or system-status code.
- Check `docker compose logs --tail=120 procure-lite` for startup errors.

## 6. Rollback

If the new release fails smoke checks:

```bash
cd /opt/procure-lite
git log --oneline -5
git checkout <previous-good-commit>
docker compose up -d --build
```

If data was affected, restore from the fresh pre-release backup through the settings maintenance page or restore the saved `procure-lite-state/` directory.
