# 2026-04-09 Reports And Operations Navigation Tiering Remediation

## Summary

Evaluate whether the current statistics-reporting and operations-workbench surfaces have outgrown single-page navigation, decide whether second-level menus should be introduced, and freeze a repo-grounded remediation direction.

## Goal

Reduce cognitive load and scrolling depth in the two most crowded business surfaces without turning the product into a harder-to-learn multi-level enterprise shell.

## Deliverable

- A clear yes or no decision on second-level menus
- A global information-architecture rule for when a view deserves secondary navigation
- A target submenu split for `reports` and `operations`
- A phased remediation plan that can be implemented on the current Vue/static architecture

## Constraints

- Keep the current top-level product mental model stable unless evidence shows the sidebar itself is the real problem
- Stay within the current static Vue architecture and hash-based navigation conventions
- Do not ship UI code changes in this turn
- Preserve existing report, tracker, and operations capabilities while restructuring
- Avoid replacing discoverability problems with hidden deep nesting

## Acceptance Criteria

- The requirement states explicitly whether second-level menus should be adopted
- The plan distinguishes between global navigation, contextual secondary navigation, and in-page actions
- The proposal names the target second-level groups for `reports` and `operations`
- The plan defines implementation phases, verification expectations, and rollback guidance
- The repo evidence and mature-product references both support the chosen direction

## Current Repo Evidence

- Top-level navigation is not the primary overload point today: `static/view-config.js` still exposes only six primary business entries plus one secondary settings entry.
- `static/state.js` keeps a single `currentView` but no `currentSubView`, which means the app currently has no first-class secondary-navigation model.
- `static/index.html` packs the reports experience into one long surface that now combines executive summary cards, tracker queues, supplier analytics, funnel analytics, and cycle analytics.
- `static/settings-operations-panel.js` now carries a broad operations shell with purchase, receipt, replenishment, action queues, supplier collaboration, invoice follow-up, import recovery, notifications, and a full-workbench disclosure in one component.
- Baseline validation is healthy today (`py -3 scripts/validate_project.py` passes), so this round can stay planning-only without masking existing instability.

## Decision

Adopt second-level menus, but only as contextual navigation inside overloaded views.

Do not convert the left sidebar into a deep nested tree right now.

The current evidence says the global sidebar is still understandable, while `reports` and `operations` have each grown beyond what a single scroll surface should carry. The right move is therefore:

- keep primary navigation focused on major business areas
- add a shared second-level navigation model for views that exceed a complexity threshold
- activate that model first for `reports` and `operations`

## Global Navigation Rule

Use primary navigation to answer: "Which business area am I in?"

Use second-level navigation to answer: "Which slice of that area am I working in right now?"

Use cards, buttons, and drill-through actions to answer: "What exact action do I take next?"

A view should be promoted to second-level navigation when at least two of the following are true:

- it serves more than three distinct user intents
- it requires more than one above-the-fold queue or chart family
- it introduces jump buttons or anchor links just to stay usable
- it bundles both "operational follow-up" and "master-data maintenance" into the same scroll flow

## Mature Product Signals

- Odoo Purchase separates product replenishment, deal execution, vendor-bill handling, and analysis/reporting rather than forcing them into one mixed page: [Odoo Purchase](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase.html), [Odoo Reordering Rules](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html)
- ERPNext treats buying reports and procurement-tracker style views as named report families, not just sub-sections hidden in a generic page: [ERPNext Buying Reports](https://docs.frappe.io/erpnext/v14/user/manual/en/buying_reports)
- Dynamics 365 uses workspace tabs such as Overview, Performance, and Risk to separate actionable workbench content from deeper analytics within the same domain surface: [Dynamics 365 Supply Risk Assessment Workspace](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/supply-risk-assessment-workspace)

## Primary Objective

Restore navigational clarity before these two surfaces accumulate enough weight that every future feature makes them harder to operate.

## Non-Objective Proxy Signals

- Adding a second-level menu to every top-level view for the sake of symmetry
- Replacing one overloaded page with a maze of hidden tabs
- Reopening product-scope debates such as Rust migration or ERP-scale workflow expansion
- Treating anchor links and disclosure blocks as a permanent substitute for page structure

## Validation Material Role

Validation for this round means proving that the recommendation is grounded in the current repo shape, current page complexity, and mature-product interaction patterns, while confirming that no product code changes were needed to reach the planning conclusion.

## Anti-Proxy-Goal-Drift Tier

Tier 1: information architecture decision and remediation planning only.

## Intended Scope

Planning only. No application-code or schema changes in this turn.

## Abstraction Layer Target

Global navigation policy, contextual submenu design, and phased UI remediation sequencing.

## Completion State

Complete when the project has a concrete, repo-specific plan that says where second-level menus should exist, where they should not, and how to implement them safely.

## Generalization Evidence Bundle

- `static/view-config.js`
- `static/state.js`
- `static/index.html`
- `static/settings-operations-panel.js`
- `static/api.js`
- `docs/archive/requirements/2026-04-08-operations-workbench-practical-redesign.md`
- `docs/archive/requirements/2026-04-09-phases-1-to-4-procurement-hardening.md`
- `docs/archive/plans/2026-04-09-current-stack-hardening-delivery-roadmap-plan.md`
- `py -3 scripts/validate_project.py`

## Non-Goals

- Shipping the second-level menu in this turn
- Rewriting the entire app into route-based frontend modules
- Changing the sidebar labels or overall product taxonomy beyond what the submenu model requires
- Splitting `dashboard`, `ledger`, `execution`, or `audit` before new evidence says they need it

## Autonomy Mode

Interactive governed, planning-first.

## Assumptions

- Users are currently more hurt by overloaded `reports` and `operations` than by the number of top-level sidebar entries.
- A shared submenu framework is safer than one-off per-page tabs because the app will likely need the pattern again.
- `settings` may eventually adopt the same framework, but it is not the current pressure point.
- The product benefits more from contextual second-level navigation than from creating additional first-level sidebar entries.

## Evidence Inputs

- current nav shape in `static/view-config.js`
- current page state model in `static/state.js`
- current reports structure in `static/index.html`
- current operations structure in `static/settings-operations-panel.js`
- mature reference docs from Odoo, ERPNext, and Dynamics 365
- validation baseline from `py -3 scripts/validate_project.py`
