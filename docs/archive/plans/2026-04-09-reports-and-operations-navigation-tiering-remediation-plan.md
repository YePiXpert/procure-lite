# 2026-04-09 Reports And Operations Navigation Tiering Remediation Plan

## Execution Summary

Keep the sidebar stable, add a shared contextual second-level navigation framework, and apply it first to `operations` and `reports`, where page scope has clearly outgrown single-surface navigation.

## Frozen Inputs

- User request: `[$vibe](C:\\Users\\李彦鹏\\.codex\\skills\\vibe\\SKILL.md) 统计报表和运营工作台是不是内容太多了。全局考虑是否采用二级菜单？给我个整改计划`
- Frozen requirement: `docs/archive/requirements/2026-04-09-reports-and-operations-navigation-tiering-remediation.md`
- Current branch: `main`
- Current version: `1.2.21`
- Baseline validation: `py -3 scripts/validate_project.py` passed on 2026-04-09

## Internal Grade Decision

M: single-lane governed planning run.

## Repo Diagnosis

Why the answer is "yes, but contextually":

- Primary sidebar load is still reasonable: six business views plus settings.
- `reports` has grown into a multi-intent surface with summary metrics, tracker queues, supplier analytics, funnel analytics, and cycle analytics in one page.
- `operations` now behaves like a workspace, a follow-up center, a master-data center, and an exception console all at once.
- The app currently lacks a first-class submenu state model, so growth pressure is leaking into anchors, preview cards, and long disclosures instead of being handled structurally.

Working diagnosis:

- do not add more first-level sidebar items yet
- do add second-level navigation inside overloaded views
- do define a reusable rule so this does not become a one-off hack

## Global IA Policy

### Keep Primary Navigation Stable

Leave these as the first-level business areas:

1. `dashboard`
2. `ledger`
3. `execution`
4. `operations`
5. `reports`
6. `audit`
7. `settings`

Primary navigation should stay focused on domain entry points, not on every task family.

### Introduce Contextual Secondary Navigation

Add a shared submenu layer that appears only when the active first-level view defines subviews.

Recommended state model:

- keep `currentView`
- add `currentSubViewByView`
- sync hash as `#<view>/<subview>` when a view has a second-level target
- keep backward compatibility so plain `#reports` and `#operations` still land on default subviews

Recommended configuration model:

- extend `static/view-config.js` with optional `subviews`
- compute current subview metadata alongside `currentViewMeta`
- render a shared secondary-nav strip in the page header area, not in the left sidebar

### Submenu Trigger Rule

Adopt second-level navigation only when a view meets at least two of these conditions:

- more than three distinct job stories
- more than six visible blocks or heavy cards in one scroll flow
- more than one data modality mixed together, such as queues plus master data plus analytics
- use of jump links, previews, or accordion disclosure purely to compensate for overload

## Target Structure

### Operations

Target subviews:

1. `overview`
   - today’s counts
   - action queue summary
   - priority exceptions
   - top follow-up shortcuts
2. `procurement`
   - purchase queue
   - receipt queue
   - replenishment recommendations
   - invoice closure queue if it is treated as procurement follow-up
3. `master-data`
   - suppliers
   - price records
   - inventory profiles
   - sourcing maintenance forms
4. `exceptions`
   - import recovery
   - notifications
   - overdue handling
   - full follow-up history where needed

Design rule:

- no operations subview should carry more than four major content blocks or more than one dominant user intent

### Reports

Target subviews:

1. `overview`
   - total amount
   - department distribution
   - status distribution
   - monthly amount trend
2. `tracker`
   - to-order queue
   - waiting-receipt queue
   - pending-invoice queue
   - supplier lead-time trend
3. `suppliers`
   - supplier spend summary
   - top suppliers
   - supplier trend
   - supplier item detail and unassigned supplier records
4. `efficiency`
   - funnel
   - request-to-arrival cycle
   - arrival-to-distribution cycle

Design rule:

- each reports subview should answer one analysis question family, not combine operational queues with broad descriptive analytics

### Settings

Do not force a submenu migration immediately.

Follow-up rule:

- if `settings` gains more business configuration families or the current page starts using jump links/disclosures to stay usable, reuse the same submenu framework later

## Implementation Phases

### Phase 0. Shared Submenu Infrastructure

Objective:

- make second-level navigation a product capability, not a page-specific workaround

Scope:

- extend `static/view-config.js` with optional subview definitions
- add `currentSubViewByView` and derived helpers in `static/state.js`
- update hash parsing and `switchView` behavior in `static/api.js`
- add a shared submenu strip in `static/index.html`

Primary write scope:

- `static/view-config.js`
- `static/state.js`
- `static/api.js`
- `static/index.html`

Acceptance gate:

- the app can render a second-level nav only for views that define subviews
- old hashes still open the correct first-level view
- direct links can land on a specific subview

Suggested verification:

- `py -3 scripts/validate_project.py`
- `node --check static/api.js`
- `node --check static/state.js`
- `node --check static/view-config.js`

### Phase 1. Operations Workbench Split

Objective:

- reduce one workspace-sized component into clearer subviews and seams

Scope:

- move `operations` from one long mixed panel to the four target subviews
- keep the first default subview highly action-oriented
- retire the large "full workbench" disclosure as the main structural escape hatch
- split UI logic so queue handling and master-data maintenance are no longer co-located in one giant template path

Primary write scope:

- `static/settings-operations-panel.js`
- optional new `static/operations-*.js` modules if the split is implemented through component extraction
- `static/index.html`
- `static/api.js`
- `static/state.js`

Acceptance gate:

- a user can enter `operations` and immediately choose between overview, procurement, master data, and exceptions
- no single operations subview remains responsible for all follow-up modes
- jump buttons are reduced because the page structure itself does more of the work

Suggested verification:

- validation baseline
- `node --check` on every touched static module
- manual checks for subview switching, queue actions, and supplier-maintenance continuity

### Phase 2. Reports Split

Objective:

- stop mixing descriptive analytics and operational tracker queues in one long report canvas

Scope:

- split reports into overview, tracker, suppliers, and efficiency
- keep refresh and export behavior visible without duplicating controls on every subview
- ensure tracker drill-through still opens the correct ledger record

Primary write scope:

- `static/index.html`
- `static/api.js`
- `static/state.js`
- `db/reports.py` only if the data contract needs minor reshaping for cleaner subview ownership

Acceptance gate:

- the tracker report becomes a named subview instead of one section inside a larger page
- supplier analytics no longer compete visually with operational queues
- report exports still have a clear home

Suggested verification:

- validation baseline
- source-level or smoke verification that tracker drill-through still works
- manual switching checks across all report subviews

### Phase 3. Cross-View Polish And Documentation

Objective:

- make the new navigation model coherent and durable

Scope:

- align header copy, breadcrumbs or titles, and deep-link behavior
- update `USAGE.md` and relevant planning docs to reflect the shipped submenu model
- document the submenu trigger rule so future views do not expand chaotically

Primary write scope:

- `USAGE.md`
- `static/view-config.js`
- `static/index.html`
- any touched ops/report modules

Acceptance gate:

- the submenu system feels like a product-level pattern, not a one-off patch
- docs and navigation labels agree with shipped behavior

Suggested verification:

- validation baseline
- manual navigation walkthrough:
  - `reports/overview`
  - `reports/tracker`
  - `operations/overview`
  - `operations/master-data`

## Ownership Boundaries

- navigation and state model: `static/view-config.js`, `static/state.js`, `static/api.js`
- shared shell rendering: `static/index.html`
- operations restructuring: `static/settings-operations-panel.js`
- reports restructuring: `static/index.html` plus any extracted report helpers
- documentation and rollout notes: `USAGE.md`, new requirement/plan artifacts

## Delivery Acceptance Plan

This remediation is ready to implement if the team agrees to these rules:

1. do not solve local page overload by adding more first-level sidebar entries first
2. do not ship page-specific tabs without a shared submenu state model
3. keep each subview tied to one dominant job story
4. if a subview starts accumulating jump links just to stay usable, split it again

## Completion Language Rules

- Say the remediation plan is complete only if it includes the decision, the target submenu map, the phased implementation order, and verification expectations.
- Do not claim the app already has second-level menus; this run only plans them.

## Rollback Rules

- If the team does not want to preserve this planning round, remove only this round’s requirement, plan, and runtime artifacts.
- Leave earlier analysis and implementation artifacts unchanged.

## Phase Cleanup Expectations

- No code prototypes or partial UI experiments should be left behind from this round.
- Runtime receipts should record that this was a planning-only governed run backed by baseline validation and source analysis.
