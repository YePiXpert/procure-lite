# System Health UI Design

## Goal

Expose the Phase 1 backend health diagnostics in the existing settings/maintenance UI so an operator can quickly see whether Procure Lite is safe to back up, restore, and maintain.

This is a small Phase 2 UI pass. It should not change backend behavior, backup flows, restore flows, navigation, or the broader settings layout.

## Current Context

- `/api/system/status` already returns existing status fields plus `health`.
- `static/api.js` already calls `/api/system/status`, but currently drops the `health` object when normalizing state.
- The settings page already has a maintenance panel (`settings-maintenance-panel`) with version, database size, upload count, free space, state path, and database path.
- The backup section already has auto-backup status and a refresh button that reloads system status.

## Recommended Approach

Extend the existing maintenance panel rather than creating a new page or modal.

Reasons:
- Operators already look at settings for maintenance and recovery.
- The current panel has the right surrounding context: version, database, uploads, storage, and paths.
- A compact inline diagnostic block avoids another navigation destination.

## UI Behavior

Add a "System Health" diagnostic block below the existing status cards and above the path panel.

Show these diagnostics:

- Database check: ok, warning/failure, and error message when present.
- Storage risk: `ok`, `warning`, `critical`, or `unknown`.
- State directory writable: ok or warning.
- Auto-backup health: latest verified backup result, checked time, filename, item count, upload file count, and failure message when present.
- WebDAV config: configured/not configured, password decryptable/not decryptable.
- Runtime: maintenance mode and app version.

The UI should stay quiet when everything is healthy:
- Use restrained green/blue neutral badges for ok states.
- Use amber for warning/unknown.
- Use rose/red for critical or failed states.
- Avoid long explanatory text unless there is an error from the backend.

## Data Handling

Update `applySystemStatus(data)` in `static/api.js` so `this.systemStatus.health` is preserved with safe defaults.

Add small formatting helpers in `static/api.js` for:
- health badge text/class
- storage risk label/class
- database check label
- WebDAV password status label
- auto-backup health summary

The helpers should tolerate missing fields so older or partial API payloads do not break the UI.

## Components And Files

Modify only the existing frontend surface:

- `static/api.js`
  - Preserve `systemStatus.health`.
  - Normalize nested health objects.
  - Add display helper methods.

- `static/state.js`
  - Add default `systemStatus.health` shape.

- `static/index.html`
  - Extend `settings-maintenance-panel-template` with the diagnostic block.

- `static/app.css`
  - Add compact styles for health cards/badges.
  - Reuse the current settings card language; do not introduce a visually separate dashboard.

## Error Handling

If `/api/system/status` fails, keep existing behavior: show API error only when `loadSystemStatus(true)` is called.

If a nested health diagnostic is missing, render an `unknown` or `-` state instead of throwing in Vue templates.

Do not expose WebDAV password or cookie/auth secret values.

## Testing

Add focused frontend tests if the project has a lightweight existing JavaScript test harness. If not, verify through static checks and project validation:

- `python scripts/validate_project.py --skip-smoke`
- `python scripts/run_api_smoke_checks.py`
- targeted backend tests that still cover `/api/system/status`

Manual UI verification should confirm:
- healthy status renders without layout breakage
- warning/critical statuses render readable labels
- long path/filename/error text truncates or wraps without overlapping adjacent content

## Non-Goals

- No new backend API.
- No changes to backup/restore behavior.
- No modal or new settings subpage.
- No broad visual redesign of the settings page.
