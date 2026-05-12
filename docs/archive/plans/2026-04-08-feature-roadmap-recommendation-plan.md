# 2026-04-08 Feature Roadmap Recommendation Plan

## Execution Summary

Inspect the current product surface, confirm which business domains are already present versus missing, and produce a staged feature roadmap with explicit priority.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\liyan\\.codex\\skills\\vibe\\SKILL.md) 还要加什么新功能`
- Frozen requirement: `docs/archive/requirements/2026-04-08-feature-roadmap-recommendation.md`
- Current repo state as of 2026-04-08

## Anti-Proxy-Goal-Drift Controls

Prefill from the frozen requirement doc where available. Only diverge with explicit justification.

### Primary Objective

Recommend the best next features for the current product stage.

### Non-Objective Proxy Signals

- Generic wishlist output
- Enterprise-scope advice without repo evidence
- Unsequenced ideas without implementation fit

### Validation Material Role

Use repo inspection to confirm current strengths and missing business domains before making recommendations.

### Declared Tier

Tier 1 recommendation run.

### Intended Scope

Product roadmap only.

### Abstraction Layer Target

Product planning.

### Completion State Target

A concise prioritized roadmap tied to current product gaps and build sequence.

### Generalization Evidence Plan

- Confirm the current major screens and documented flows
- Confirm the current data model centers on `Item`
- Confirm supplier, stock, budget, approval, and notification domains are not yet modeled

## Internal Grade Decision

M: single-lane governed recommendation.

## Wave Plan

1. Freeze requirement and planning artifacts
2. Inspect repo evidence for current product shape and missing domains
3. Produce staged feature recommendations with rationale
4. Write runtime receipts and cleanup artifacts

## Ownership Boundaries

- Recommendation scope only
- No code or schema changes in this turn

## Verification Commands

- Read `README.md`
- Read `USAGE.md`
- Read `static/view-config.js`
- Read `db/sqlalchemy_models.py`
- Read `db/constants.py`

## Rollback Plan

- Remove the requirement, plan, and runtime ideation artifacts if the team does not want planning records stored in the repo

## Phase Cleanup Contract

- Leave only durable planning artifacts
- No temp scripts or generated code
