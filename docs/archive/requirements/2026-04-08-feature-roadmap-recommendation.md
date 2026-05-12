# 2026-04-08 Feature Roadmap Recommendation

## Summary

Recommend the next set of product features for the office supplies tracker based on current implemented capabilities, visible domain gaps, and likely user value.

## Goal

Produce a prioritized feature roadmap that builds on the current procurement, ledger, execution, reporting, audit, and backup foundation without prematurely turning the product into a heavyweight ERP.

## Deliverable

- A prioritized list of recommended new features
- Clear reasoning for why each feature matters now
- Sequencing guidance for what to build first, next, and later

## Constraints

- Base recommendations on the current repo state, not a hypothetical rewrite
- Favor features that reuse existing import, ledger, execution, and reporting flows
- Avoid recommending large enterprise-only scope unless justified

## Acceptance Criteria

- Recommendations are tailored to the current product rather than generic office software advice
- The roadmap distinguishes immediate, mid-term, and later-stage features
- The guidance explains both value and implementation fit

> Fill the anti-drift fields once here. Downstream governed plan and completion surfaces should reuse them rather than restate them.

## Primary Objective

Identify the highest-leverage new features for the current product stage.

## Non-Objective Proxy Signals

- Long generic feature wishlists
- Features that require a full architecture rewrite first
- Recommendations disconnected from the existing data model and screens

## Validation Material Role

Validation means grounding the roadmap in the current repo capabilities and confirmed missing domains.

## Anti-Proxy-Goal-Drift Tier

Tier 1: bounded product recommendation with repo-grounded evidence.

## Intended Scope

Product planning and prioritization only. No business-code implementation in this turn.

## Abstraction Layer Target

Product and domain roadmap.

## Completion State

Complete when the roadmap is prioritized, repo-grounded, and delivered with explicit sequencing.

## Generalization Evidence Bundle

- Current feature inventory from README and USAGE
- Current navigation structure
- Current domain model showing missing supplier, stock, budget, approval, and notification entities

## Non-Goals

- Implementing the new features now
- Full technical design for every feature
- Multi-quarter enterprise transformation plan

## Autonomy Mode

Interactive governed, inference-driven, recommendation-focused.

## Assumptions

- The product is still at a focused internal-tool stage
- Single-user or lightly shared usage is still the dominant mode
- The best next features should deepen operational value before major collaboration expansion

## Evidence Inputs

- `README.md`
- `USAGE.md`
- `static/view-config.js`
- `db/sqlalchemy_models.py`
- `db/constants.py`
