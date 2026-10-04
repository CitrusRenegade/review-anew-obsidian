---
last_reviewed: 2026-10-04
---

# Repository map

This repository is an Obsidian plugin for scheduled note review.

## Runtime entrypoint

- `src/main.ts` owns the Obsidian plugin lifecycle: loading/saving settings, registering commands, ribbon and status bar items, file menu items, vault/workspace/metadata events, and writing the `reviewed` frontmatter value.

## Review logic

- `src/review.ts` owns reviewability, interval precedence, folder include/exclude behavior, reviewed-day normalization, due checks, due counts, and random due-note selection.
- Effective interval precedence is per-note frontmatter interval, per-note `never`, folder filter, folder-specific interval, then global interval.
- The same evaluator supplies effective intervals, reviewable-note selection and optional explanation candidates. Vault scans do not build or sort explanation candidates.
- `DueCounterCache` in `src/review.ts` incrementally recalculates changed files and rebuilds on settings or local-day changes. The status-bar counter owns this cache; random selection reads current metadata independently.

## Settings and UI

- `src/settings.ts` defines settings, defaults, saved-data sanitization, and the Obsidian settings tab.
- `src/statusbar.ts` renders the current-note review status and vault-wide due counter, including click handlers for opening review details or a random due note.
- `src/reviewDetailsPopover.ts` shows current-note timing and calculation details and directly confirms marking the note reviewed.

## Frontmatter and dates

- `src/frontmatter.ts` writes string frontmatter values.
- `src/dates.ts` formats local calendar days as `YYYY-MM-DD`.
- Reviewed values represent calendar days, not instants. Review logic uses canonical `YYYY-MM-DD` strings; legacy `Date` and numeric inputs normalize by UTC day, datetime strings by their written day. New marks write today's local day. Preserve this boundary policy when changing date code.
- `src/interval.ts` parses positive integer day counts.

## Review state updates

- Metadata cache is the single read source for reviewed days across status, details, due counts, and random selection. Do not overlay a pending write's date or force a note to not-due when a write completes.
- `src/reviewMarkCoordinator.ts` deduplicates and serializes writes by file identity and property key. Pending-operation state controls actions, not review calculations.
- `src/reviewRenameCoordinator.ts` tracks unresolved file identities, including snapshots of moved folders. Each ready note recovers independently. Missing metadata excludes only those identities from counting and random selection; the counter shows `N+` until its total is complete. Readiness probes slow from 50 ms to 1 s after the initial second, while metadata events still recover immediately. Folder-rule persistence and rendering remain in the plugin.
- `src/main.ts` invalidates the affected due entry and refreshes from current metadata after a successful write, and again on metadata changes. Completion can precede or follow the metadata event; a newer edit or removed property must win over the original write's intent.
- `tests/reviewLifecycle.test.ts` exercises this event/write ordering through the plugin lifecycle, alongside the calculation and UI unit tests.

## Tests

- `tests/review.test.ts` covers interval resolution, include/exclude behavior, `never`, due logic, reviewed-day parsing, due counts, and random selection.
- `tests/dates.test.ts` covers local date formatting.
- `tests/reviewLifecycle.test.ts` covers write/metadata ordering, configured writer fields and rename events. Persisted frontmatter is separate from published metadata; events allow multiple listeners.
- `tests/reviewRenameCoordinator.test.ts` covers repeated moves and cancellation of queued/delayed work on unload.
- `tests/settingsCompatibility.test.ts` covers persisted settings meaning and save/reload compatibility; settings and settings-tab tests cover rule migration and controls.
- Details, status, actions, positioning and rename notices have focused unit suites.
- `tests/browser/*.test.mjs` renders popovers with production CSS in Chromium. Obsidian APIs are substituted; these tests do not establish real-host compatibility.
- `npm run check` runs unit/type checks, calendar-day regressions in UTC, America/Los_Angeles and Pacific/Kiritimati, build, both linters and browser tests. The timezone runs include DST boundaries, local midnight and focus after a skipped day. Run `npx playwright install chromium` for local browser setup; CI/release install Chromium and Linux dependencies explicitly.
- See `tests/README.md` for the real-host acceptance journey in the configured test vault.
- `npm run test:native` separately verifies candidate hashes and real-host integration with owned fixtures. Keyboard focus can be Blocked while integration scenarios continue; cleanup and per-scenario results are recorded in a JSON report. Instrumentation lives only in `tests/native/`.

## Review priorities

Prioritize Obsidian lifecycle bugs, due/review interval logic, frontmatter edge cases, folder filters, settings validation, stale UI state, large vault performance, and unsafe APIs such as raw HTML, network access, `eval`, shell access, or filesystem access outside Obsidian APIs.

## Freshness

`last_reviewed` means this map was checked against the source tree on that date. Update it only when the map is reviewed or changed.
