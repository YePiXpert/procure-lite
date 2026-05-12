# 2026-04-08 Import Task Lifecycle Optimization

## Summary

Improve the reliability and operability of the async document-import task flow without changing OCR behavior, database schema, or the existing frontend polling contract.

## Goal

Make background import tasks safer to operate over time by adding lifecycle metadata and memory cleanup, while preserving the current `pending/processing/completed/failed` workflow.

## Deliverable

- A bounded task registry for upload parsing tasks
- Router integration that records task lifecycle timestamps and expiry metadata
- Frontend handling that turns expired or missing task lookups into a clearer user-facing error
- Runtime governance artifacts for this optimization slice

## Constraints

- Do not change OCR engines or parsing business rules
- Do not introduce database migrations
- Keep `/api/upload-ocr` and `/api/tasks/{task_id}` backward-compatible for the current frontend polling flow
- Keep active tasks from being dropped during ordinary single-user desktop usage

## Acceptance Criteria

- Upload parsing still reports `pending`, `processing`, `completed`, and `failed`
- Task payloads expose lifecycle metadata that existing frontend code can safely ignore
- Finished or expired tasks are pruned from memory over time
- Missing or expired task lookups return a clearer 404 detail
- `py -3 scripts/validate_project.py` passes after the change

> Fill the anti-drift fields once here. Downstream governed plan and completion surfaces should reuse them rather than restate them.

## Primary Objective

Optimize the import task lifecycle so the app remains stable and understandable during repeated document uploads.

## Non-Objective Proxy Signals

- Large-scale refactors outside the upload task path
- OCR accuracy changes
- Cosmetic UI redesign

## Validation Material Role

Validation must prove the code still parses, the task API stays compatible, and the pruning behavior is internally consistent.

## Anti-Proxy-Goal-Drift Tier

Tier 2: bounded implementation with evidence-backed completion only.

## Intended Scope

Backend task-state management for upload parsing, plus the minimum frontend compatibility message update.

## Abstraction Layer Target

Application service layer and existing API integration layer.

## Completion State

Complete when the task registry is integrated, compatibility is preserved, validation passes, and runtime receipts are written.

## Generalization Evidence Bundle

- Baseline syntax validation succeeds
- Targeted manual checks for task creation, task completion payload shape, and expired-task messaging

## Non-Goals

- Reworking parser performance hot paths
- Switching task state from memory to database persistence
- Altering import preview behavior or duplicate-handling rules

## Autonomy Mode

Interactive governed with inferred scope freeze around the upload task lifecycle.

## Assumptions

- This is a single-user or low-concurrency desktop-style deployment
- In-memory task state is intentional, but currently under-governed
- Existing frontend polling should keep working unchanged if status values remain stable

## Evidence Inputs

- `routers/imports.py`
- `static/api.js`
- `scripts/validate_project.py`
- `README.md`
- `USAGE.md`
