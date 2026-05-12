# 2026-04-09 Release Workflow Validation Fix Plan

## Execution Summary

Freeze the workflow-fix scope, patch the release workflow to install dependencies before validation, validate locally, commit the CI fix, and push it to `origin/main` so the automated patch release path can rerun.

## Frozen Inputs

- User request lineage: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 推送新版本吧`
- Observed failure: `Bump Version And Tag #17` failed on commit `25ab2a6`
- Frozen requirement: `docs/archive/requirements/2026-04-09-release-workflow-validation-fix.md`
- Current branch: `main`

## Internal Grade Decision

L: one bounded CI remediation plus a follow-up publication push.

## Work Order

1. Freeze workflow-fix requirement and plan
2. Patch `.github/workflows/bump-version-and-tag.yml`
3. Revalidate locally
4. Commit the CI fix
5. Push to `origin/main`
6. Verify that the automated bump workflow reruns on the corrected path

## Verification Commands

- `py -3 scripts/validate_project.py`
- `git push origin HEAD:main`
- remote workflow verification after push

## Delivery Acceptance Plan

The round is complete only if:

1. the workflow now installs dependencies before validation
2. the CI-fix commit lands on `origin/main`
3. the rerun is visible on the repository workflow page

## Rollback Rules

- Do not disable validation to get a green release
- If the workflow still fails, inspect the next concrete error before changing more pipeline steps
