# Settings Maintenance API Extraction Design

## Summary

Extract the system maintenance frontend methods from `static/api.js` into a focused browser module without changing the settings maintenance UI or backend API contracts.

## Context

The previous optimization round added system health diagnostics to the settings maintenance surface. That left more backup, local backup, system status, and health formatting behavior in the root `AppApi` module. `static/settings-maintenance-panel.js` is currently a template-only component, so the root app still owns all maintenance behavior.

This round should make that boundary clearer while keeping the visible product behavior unchanged.

## Recommended Approach

Create `static/settings-maintenance-api.js` that exports `window.SettingsMaintenanceApi` as a Vue options fragment with a `methods` object. `static/ui.js` will merge it into the root app alongside `AppState` and `AppApi`, with an explicit nested `methods` merge so `AppApi.methods` does not overwrite the maintenance methods.

The extracted methods are:

- `normalizeAutoBackupConfig`
- `normalizeSystemHealth`
- `applySystemStatus`
- `loadSystemStatus`
- `loadLocalBackups`
- `setAutoBackupEnabled`
- `setAutoBackupIntervalHours`
- `setAutoBackupKeepBackups`
- `recentLocalBackups`
- `localBackupTotalSize`
- `saveAutoBackupConfig`
- `runAutoBackupNow`
- `restoreLocalBackup`
- `storageRiskLabel`
- `systemHealthBadgeClass`
- `booleanHealthLabel`
- `backupHealthSummary`

`formatFileSize` stays in `static/api.js` because it is a general formatting helper used outside the maintenance boundary.

## Data Flow

The maintenance panel keeps calling root methods through the existing Vue bindings. The root app receives those methods from `SettingsMaintenanceApi`, so no template or component event contract needs to change. Because Vue options are plain objects before `createApp`, `static/ui.js` must explicitly merge `SettingsMaintenanceApi.methods` and `AppApi.methods` into one `methods` object.

Script loading order becomes:

1. `state.js`
2. `operations-center-api.js`
3. `settings-maintenance-api.js`
4. `api.js`
5. panel/component scripts
6. `ui.js`

`settings-maintenance-api.js` must load before `ui.js`. It can load before `api.js` because it only defines a browser global and does not depend on `AppApi`.

## Error Handling

Keep existing behavior:

- `loadSystemStatus(showError)` and `loadLocalBackups(showError)` only surface toast errors when explicitly requested.
- save/run/restore operations continue to use `showApiError`, `showToast`, `openConfirmDialog`, and `refreshDataViews` from the root app.
- system health normalization remains defensive when optional backend fields are missing.

## Testing

Add a static regression test that proves:

- `static/index.html` loads `settings-maintenance-api.js` before `api.js` and `ui.js`.
- `static/ui.js` merges `global.SettingsMaintenanceApi` into `createApp`.
- maintenance methods live in `static/settings-maintenance-api.js`.
- the extracted maintenance methods no longer live in `static/api.js`.

Run existing system status, PWA, validation, and API smoke checks to verify behavior stays wired.

## Non-Goals

- Do not split WebDAV modal methods in this round.
- Do not change backend API payloads or URLs.
- Do not redesign the settings maintenance UI.
- Do not move general ledger, import, operations, or report methods.

## Acceptance Criteria

- The root Vue app still exposes the maintenance methods used by the settings maintenance template.
- `static/api.js` is smaller and no longer owns the maintenance-specific method block.
- Tests prove the new script and merge contract.
- Existing focused and smoke verification passes.
