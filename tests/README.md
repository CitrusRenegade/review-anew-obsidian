Run `npm run check` before handing off a candidate. It includes the Chromium popover suites; install the browser once with `npx playwright install chromium`. Browser tests assert geometry and interaction using a substituted Obsidian API, so a pass does not establish native host behavior.

`npm run test:timezones` runs calendar-day and lifecycle regressions in UTC, America/Los_Angeles and Pacific/Kiritimati. It is included in `check`, so both CI and release gates exercise negative/positive offsets, DST transitions, local midnight and wake/focus refresh.

## Compatibility contract

Preserve plugin ID `review-simple`, commands `open-random` and `mark-current`, saved settings keys/defaults, custom frontmatter keys, and the existing interval precedence. Preserve both folder lists when switching modes, first-wins normalized duplicate folder rules, and tournament selection behavior.

Reviewed values are calendar days. New marks write the local `YYYY-MM-DD` day; legacy Date/numeric inputs retain UTC-day normalization and datetime strings retain the written day. Persisted writes and metadata publication are separate events. A successful mark must never override a newer metadata edit or deletion.

Missing relocated metadata is unknown, not an empty note. Only unresolved file identities are excluded from random selection and counting; ready members of a moved folder recover independently. While waiting, the counter shows `N+` with an incomplete-count explanation, including `0+`. After the first second, probes slow to once per second without giving up on late recovery. Metadata events recover immediately; deletion and unload cancel obsolete work.

## Native acceptance

Use the repository-configured `test3` vault at `C:\test3`. Verify the actual vault path, loaded plugin ID and candidate asset/linkage before reload. Record app version and candidate revision or artifact hash.

Use uniquely identified test notes; preserve existing notes/settings. Keep a record of fixtures so cleanup can remove only those fixtures after a failure. Restore the initial active note and any settings changed for a scenario.

1. Open an included test note through normal UI. Open review details from the status bar; confirm the displayed interval agrees with folder and note rules. Check narrow/wide layout, keyboard opening/closing and readable folder path endings.
2. Click Mark reviewed. Check the configured frontmatter field contains today's local day, unrelated properties remain, and status/details/counter agree after metadata publication. An API write alone does not verify the button.
3. Edit the date manually, delete it, and undo the deletion. Confirm status and due membership follow the current metadata rather than the original mark intent.
4. Move the note and its folder; confirm no temporary unreviewed result or wrong random candidate is exposed while relocated metadata is unavailable. Confirm an unrelated due note remains available, the count is marked incomplete, and late metadata restores exact status/count without a new event. Repeat with an attachment and deletion of a pending fixture.
5. Reload the plugin. Confirm saved settings, dates and command registrations persist without duplicates, and repeat opening/closing details.

Record each scenario as Passed, Failed or Blocked with the observed result. Missing app/vault, wrong candidate, unavailable focus or unsupported capability is Blocked, never Passed. Include screenshots for layout review. Restore changed settings and remove only suite-owned fixtures; never reset the vault.

Run `npm run test:native` separately from headless CI. The runner checks the configured vault, installed candidate hashes and actual window visibility, then writes a JSON report in the system temporary directory. Override defaults with `--vault=NAME --vault-path=PATH --report=PATH`; use a fresh `--run-id=ID` for each run. Never repeat an incomplete run ID before inspecting its host operation and fixtures.

Keyboard acceptance requires foreground focus. When focus is unavailable, keyboard scenarios are Blocked; other host integration scenarios continue, and the overall result remains Blocked. Keyboard opening/closing and source editor Backspace/Ctrl+Z use Electron input events; deletion and undo must be persisted and reflected in metadata, status and due count. Programmatic DOM clicks verify handlers in the real host, not physical mouse input. Other external date edits use Obsidian's frontmatter API. The layout scenario checks native viewport widths of 640 and 1440 pixels, verifies folder text geometry and captures screenshots. It restores the initial window bounds and maximized state.

The runner owns unique fixture roots and restores its settings, active note and metadata instrumentation. Cleanup refuses foreign contents or fixtures moved outside those roots. Exit codes are 0 for Passed, 1 for Failed and 2 for Blocked. `--probe=missing-action` removes the fixture popover action to exercise failure detection; `--probe=focus-blocked` exercises unavailable initial focus. Keep test instrumentation out of the production bundle. Mobile, third-party themes, sleep/wake and large-vault performance remain separate acceptance surfaces.
