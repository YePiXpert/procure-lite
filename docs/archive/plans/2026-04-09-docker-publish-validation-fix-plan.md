# 2026-04-09 Docker Publish Validation Fix Plan

## Execution Summary

Freeze the Docker workflow-fix scope, patch the publish workflow to install dependencies before validation, validate locally, commit the CI fix, push it to `origin/main`, and confirm that the Docker publish workflow reruns on the corrected path.

## Frozen Inputs

- User request lineage: `[$vibe](C:\\Users\\liyan\\.codex\\skills\\vibe\\SKILL.md) github action报错`
- Observed failure: `Docker Publish #57` failed on commit `e3c80fe`
- Frozen requirement: `docs/archive/requirements/2026-04-09-docker-publish-validation-fix.md`
- Current branch: `main`

## Internal Grade Decision

L: one bounded CI remediation plus a follow-up publication push.

## Work Order

1. Freeze Docker workflow-fix requirement and plan
2. Patch `.github/workflows/docker-publish.yml`
3. Revalidate locally
4. Commit the CI fix
5. Push to `origin/main`
6. Verify that the Docker publish workflow reruns on the corrected path

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

- Do not disable validation to get a green Docker build
- If the workflow still fails, inspect the next concrete error before changing more pipeline steps
