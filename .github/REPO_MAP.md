---
last_reviewed: 2026-08-22
---

# Repository map

This repository is an Obsidian plugin for scheduled note review.

## Runtime entrypoint

- `src/main.ts` owns the Obsidian plugin lifecycle: loading/saving settings, registering commands, ribbon and status bar items, file menu items, vault/workspace/metadata events, and writing the `reviewed` frontmatter value.

## Review logic

- `src/review.ts` owns reviewability, interval precedence, folder include/exclude behavior, reviewed-day normalization, due checks, due counts, and random due-note selection.
- Effective interval precedence is per-note frontmatter interval, per-note `never`, folder filter, folder-specific interval, then global interval.

## Settings and UI

- `src/settings.ts` defines settings, defaults, saved-data sanitization, and the Obsidian settings tab.
- `src/statusbar.ts` renders the current-note review status and vault-wide due counter, including click handlers for opening review details or a random due note.
- `src/reviewDetailsPopover.ts` shows current-note timing and calculation details and directly confirms marking the note reviewed.

## Frontmatter and dates

- `src/frontmatter.ts` writes string frontmatter values.
- `src/dates.ts` formats local calendar days as `YYYY-MM-DD`.
- `src/interval.ts` parses positive integer day counts.

## Review state updates

- Metadata cache is the single read source for reviewed days across status, details, due counts, and random selection. Do not overlay a pending write's date or force a note to not-due when a write completes.
- `src/reviewMarkCoordinator.ts` deduplicates and serializes writes by file identity and property key. Pending-operation state controls actions, not review calculations.
- `src/main.ts` invalidates the affected due entry and refreshes from current metadata after a successful write, and again on metadata changes. Completion can precede or follow the metadata event; a newer edit or removed property must win over the original write's intent.
- `tests/reviewLifecycle.test.ts` exercises this event/write ordering through the plugin lifecycle, alongside the calculation and UI unit tests.

## Tests

- `tests/review.test.ts` covers interval resolution, include/exclude behavior, `never`, due logic, reviewed-day parsing, due counts, and random selection.
- `tests/dates.test.ts` covers local date formatting.

## Review priorities

Prioritize Obsidian lifecycle bugs, due/review interval logic, frontmatter edge cases, folder filters, settings validation, stale UI state, large vault performance, and unsafe APIs such as raw HTML, network access, `eval`, shell access, or filesystem access outside Obsidian APIs.

## Freshness

`last_reviewed` means this map was checked against the source tree on that date. Update it only when the map is reviewed or changed.
