# 2026-04-09 Main Push Release Plan

## Execution Summary

Freeze the governed release record, exclude local runtime-only artifacts, validate the current workspace, commit the full 2026-04-09 deliverable set, push it directly to `origin/main`, and then verify that release automation was triggered.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 推送新版本吧`
- Frozen requirement: `docs/archive/requirements/2026-04-09-main-push-release.md`
- Current branch: `main`
- Current checked-in version: `1.2.21`
- Existing release automation: `.github/workflows/bump-version-and-tag.yml`

## Internal Grade Decision

L: one governed publication lane with validation, curated staging, commit, push, and remote-release verification.

## Work Order

1. Freeze release requirement and plan surfaces
2. Exclude local runtime-only artifacts from publication scope
3. Validate current workspace state
4. Stage and commit the full 2026-04-09 deliverable set
5. Push the publication commit to `origin/main`
6. Verify that the push landed and the automated release path was triggered

## Implementation Scope

### Phase 1. Release Freeze

Write scope:

- `docs/archive/requirements/2026-04-09-main-push-release.md`
- `docs/archive/plans/2026-04-09-main-push-release-plan.md`

Responsibilities:

- freeze the publication intent and acceptance criteria
- record the existing repository release truth

Acceptance gate:

- governed release artifacts exist before staging and push

### Phase 2. Publication Hygiene

Write scope:

- `.gitignore`

Responsibilities:

- exclude `.auth_cookie_secret`
- exclude `logs/`
- keep the publication commit free of local runtime-only artifacts

Acceptance gate:

- publication staging excludes local runtime-only files

### Phase 3. Validation, Commit, And Push

Write scope:

- current 2026-04-09 source changes
- current 2026-04-09 docs and runtime receipts

Responsibilities:

- rerun baseline validation
- stage the intended deliverable set only
- generate a conventional commit message based on the actual change set
- push directly to `origin/main`

Acceptance gate:

- the commit lands on `origin/main` without history rewrite

### Phase 4. Remote Release Verification

Write scope:

- runtime receipts under `outputs/runtime/vibe-sessions/...`

Responsibilities:

- verify the push landed remotely
- verify the new main-branch commit is eligible for release automation
- record only the publication truth that actually happened

## Ownership Boundaries

- publication hygiene: `.gitignore`
- governed release artifacts: `docs/...` and `outputs/runtime/vibe-sessions/...`
- release publication: current 2026-04-09 source/docs/receipts only

## Verification Commands

- `py -3 scripts/validate_project.py`
- `git status --short --untracked-files=all`
- `git push origin HEAD:main`
- remote verification via `git fetch origin` and release-workflow observation

## Delivery Acceptance Plan

The round is complete only if:

1. validation passes
2. the intended 2026-04-09 deliverables are committed
3. the commit is pushed to `origin/main`
4. local runtime-only artifacts stay out of the publication commit
5. the pushed commit is verified on the remote branch

## Rollback Rules

- Do not force-push or rewrite main if publication follow-up is needed
- If the push fails, fix the cause locally and retry without destructive git commands

## Phase Cleanup Expectations

- Write release requirement, plan, and runtime receipts
- Leave no temporary helper scripts in the repository
