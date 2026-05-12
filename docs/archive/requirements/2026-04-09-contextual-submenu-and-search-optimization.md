# 2026-04-09 Contextual Submenu And Search Optimization

## Summary

Implement a shared second-level navigation model and contextual retrieval experience for the overloaded `operations` and `reports` views, using mature procurement-product interaction patterns while preserving the current app shell.

## Goal

Reduce the cognitive and scrolling burden of the two heaviest views by turning them into clearer task and analysis workspaces with secondary menus and lightweight in-view search.

## Deliverable

- A shared `view + subview` navigation model
- Contextual second-level menus for `operations` and `reports`
- Lightweight search and filtering scoped to each of those views
- Refined page structures that keep current capabilities but group them by operator intent

## Constraints

- Stay on the current static Vue, hash-based frontend architecture
- Preserve current first-level sidebar entries
- Keep existing reporting, tracker, procurement, import, and invoice capabilities available
- Avoid a full frontend framework rewrite or route-system rebuild
- Keep the new search experience lightweight and local to the active business context

## Acceptance Criteria

- `operations` and `reports` expose explicit second-level menus
- The URL hash can represent both view and subview
- Backward-compatible hashes still open the expected first-level view
- `operations` is re-grouped into intent-driven workspaces instead of one long mixed page
- `reports` is re-grouped into named analytical subviews instead of one long mixed page
- Each of the two views exposes a contextual search/filter box that helps narrow visible content
- `py -3 scripts/validate_project.py` passes after the implementation
- Touched frontend files pass `node --check`

## Mature Product Reference Lens

- Odoo separates replenishment, execution, and purchasing concerns instead of forcing them into a single mixed flow: [Odoo Purchase](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase.html), [Odoo Reordering Rules](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html)
- ERPNext exposes buying analytics and procurement-tracker style views as named report families: [ERPNext Buying Reports](https://docs.frappe.io/erpnext/v14/user/manual/en/buying_reports)
- Dynamics 365 workspaces use secondary tabs such as Overview, Performance, and Risk to separate actionable slices inside one domain area: [Dynamics 365 Supply Risk Assessment Workspace](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/supply-risk-assessment-workspace)

## Primary Objective

Ship a real usability improvement that makes the existing product feel more structured and searchable without widening domain scope.

## Non-Goals

- Introducing nested first-level sidebar trees
- Rebuilding the app as a route-heavy SPA with a new router library
- Designing a global omnibox that searches every product area at once
- Expanding into new procurement business scope such as approvals or RFQs

## Current Repo Evidence

- `static/view-config.js` currently models only top-level views, not second-level slices
- `static/state.js` has `currentView` but no first-class `currentSubView`
- `static/api.js` hashes only track the first-level view today
- `static/index.html` carries a large reports surface that mixes overview metrics, tracker queues, supplier analytics, and efficiency analytics
- `static/settings-operations-panel.js` carries a large operations surface that mixes overview, action queues, procurement follow-up, supplier master data, invoices, import recovery, and notifications

## Intended UX Shape

- Keep the sidebar for business-area entry
- Add a contextual submenu row below the page header only when the active view supports subviews
- Scope search to the active view and current task context
- Keep drill-through actions local and obvious

## Planned Subviews

### Operations

- `overview`
- `procurement`
- `master-data`
- `exceptions`

### Reports

- `overview`
- `tracker`
- `suppliers`
- `efficiency`

## Search Intent

- `operations` search should help find queue items, suppliers, price records, imports, invoices, and related item names within the current context
- `reports` search should help narrow tracker rows and supplier/department analysis lists without pretending to be a full BI query layer

## Validation Material Role

Validation for this round means proving that the shared submenu model works, that the two overloaded views become easier to navigate, and that the changes preserve the current baseline behavior closely enough for the existing smoke path to stay green.

## Completion State

Complete when the repo contains the shared submenu capability, the two restructured views, contextual search/filter behavior, and passing validation evidence.

## Evidence Inputs

- `static/view-config.js`
- `static/state.js`
- `static/api.js`
- `static/index.html`
- `static/settings-operations-panel.js`
- `docs/archive/requirements/2026-04-09-reports-and-operations-navigation-tiering-remediation.md`
- `docs/archive/plans/2026-04-09-reports-and-operations-navigation-tiering-remediation-plan.md`
- `py -3 scripts/validate_project.py`
