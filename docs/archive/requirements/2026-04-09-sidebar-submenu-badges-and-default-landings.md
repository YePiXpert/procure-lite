# 2026-04-09 Sidebar Submenu Badges And Default Landings

## Summary

Continue the sidebar-navigation iteration by making the contextual second-level menu more informative and more action-oriented: add lightweight badges for the most meaningful subviews and make first entry into heavy areas land on the highest-frequency workspace slices.

## Goal

Reduce one more layer of navigation friction so operators can see where the work is before clicking and reach the most useful subview first.

## Deliverable

- Sidebar submenu badges that reflect meaningful workload or dataset signals
- Better default subview choices for first entry into `operations` and `reports`
- Small shell polish so the badge-bearing submenu still reads clearly and stays consistent with scoped search

## Constraints

- Keep the current first-level navigation stable
- Preserve the existing `view + subview` hash contract
- Use lightweight local counts instead of introducing backend aggregation just for badges
- Avoid badge spam on every submenu item; only show counts where they carry real signal
- Keep the round bounded to shell/navigation polish, not new business functionality

## Acceptance Criteria

- `operations` and `reports` show sidebar submenu badges where the count is meaningful
- Badge counts are derived from current loaded state and degrade safely when data is absent
- First-time entry into `operations` lands on `procurement` instead of `overview`
- First-time entry into `reports` lands on `tracker` instead of `overview`
- Existing remembered subview behavior and deep links still win over defaults
- `py -3 scripts/validate_project.py` passes after the implementation
- Touched frontend files pass `node --check`

## Mature Product Reference Lens

- Odoo and Dynamics surfaces typically lead users toward an execution slice rather than a passive overview when entering busy workspaces, and they use counts sparingly to highlight where action is concentrated: [Odoo Purchase](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase.html), [Dynamics 365 Supply Risk Assessment Workspace](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/supply-risk-assessment-workspace)
- ERPNext report families also work best when tracker-like analysis is an obvious first landing rather than buried behind an overview-only default: [ERPNext Buying Reports](https://docs.frappe.io/erpnext/v14/user/manual/en/buying_reports)

## Intended UX Shape

- The sidebar keeps showing the current workspace subviews
- Task-heavy subviews expose a small numeric badge
- Reference or summary slices stay unbadged unless a count really helps
- The first click into `operations` or `reports` opens the slice most likely to be used immediately

## Non-Goals

- Adding notification badges to every primary navigation item
- Creating per-subview server endpoints for counts
- Reworking the page body structure again in this round
- Expanding badge logic into a full saved-filter or inbox system

## Validation Material Role

Validation for this round means proving that sidebar badges render from real state, default subview behavior changes without breaking deep links, and the repo baseline stays green.

## Completion State

Complete when sidebar subview badges, improved default landings, and passing validation evidence are present in the repo.

## Evidence Inputs

- `static/view-config.js`
- `static/state.js`
- `static/index.html`
- `static/api.js`
- `py -3 scripts/validate_project.py`
