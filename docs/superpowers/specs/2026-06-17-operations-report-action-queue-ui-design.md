# Operations Report Action Queue UI Design

## Goal

Show the operations action queue summary in the reports efficiency view so report users can see which execution buckets need attention without switching to the operations workbench first.

## Current State

The operations report API now returns `action_queue_summary`, and `static/api.js` normalizes it into `operationsReport.actionQueueSummary`. The report efficiency view still displays status inventory, cycle distribution, and monthly amount structure only.

## Design

Add a compact "action queue summary" report card near the top of the efficiency view, before the status snapshot. The card will render six stable buckets:

- purchase
- receipt
- inventory
- import
- invoice
- all

`static/state.js` will expose `reportActionQueueSummaryRows`, a computed list that maps internal keys to display labels, numeric counts, and light visual classes. `static/index.html` will render those rows in a responsive grid inside the existing `report-visual-card` pattern.

This keeps the report view aligned with the existing dense operational style. The card is read-only and does not add navigation in this slice; navigation can be added later once the target workbench filters are explicit.

## Testing

Add static tests that assert:

- `reportActionQueueSummaryRows()` exists and reads `operationsReport.actionQueueSummary`.
- The efficiency view renders a card using `reportActionQueueSummaryRows`.
- The rendered markup includes the stable bucket keys.

Run existing syntax checks and smoke checks after implementation.
