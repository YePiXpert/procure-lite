# 2026-04-09 Ledger Horizontal Context Optimization

## Summary

Optimize the ledger table so horizontal scrolling no longer strips away row identity, while also reducing the total width of the table in the most-used desktop workflow.

## Goal

Make the ledger usable as a procurement workbench instead of a spreadsheet strip where users lose track of which row they are editing once they scroll to downstream fields such as invoice and payment progress.

## Deliverable

- A sticky left-side summary column that keeps row identity visible during horizontal scrolling
- Consolidation of the current context-heavy columns into a compact editable summary layout
- A narrower ledger table that fits more columns into the common desktop viewport
- Verification that the current baseline still passes after the UI refactor

## Constraints

- Preserve the existing inline-edit workflow for core ledger fields
- Keep supplier selection, purchase-link editing, and action buttons working
- Avoid changing backend data contracts for this round
- Keep the iteration bounded to ledger usability and horizontal context retention

## Acceptance Criteria

- When users scroll to the right side of the ledger, they can still see what record the current row represents
- The row identity context includes item name plus procurement metadata that helps distinguish similar rows
- The overall number of standalone columns is reduced compared with the previous layout
- Existing inline edit paths for item name, serial number, department, handler, supplier, and purchase link remain available
- `py -3 scripts/validate_project.py` passes after the implementation

## Current Problem Statement

- The current ledger splits row identity across several separate columns: serial number, department, handler, item name, supplier, and purchase link
- Only the checkbox column and the action column stay sticky
- Once the user scrolls toward later workflow fields, the visible row loses its semantic anchor and becomes difficult to identify

## Intended UX Shape

- The left side of each row should behave like a frozen worklist summary, not a narrow spreadsheet fragment
- Item identity and procurement context should stay visible while downstream workflow fields remain editable
- The table should feel shorter horizontally even before any scrolling begins

## Non-Goals

- Redesigning the entire ledger page layout
- Introducing a card view instead of the table
- Changing backend response payloads or database schema
- Reworking report, operations-center, or detail-drawer behavior

## Validation Material Role

Validation for this round means proving that the ledger structure was compacted, that the inline-edit paths remain in place, and that the project baseline still passes.

## Completion State

Complete when the sticky summary-column pattern is shipped, the redundant standalone context columns are removed, and validation evidence is present.

## Evidence Inputs

- `static/index.html`
- `static/ledger-table-panel.js`
- `py -3 scripts/validate_project.py`
