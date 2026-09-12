# Review Anew

> Review Simple is now **Review Anew**. Your settings, review dates, and hotkeys are preserved. No migration is needed.

Helps you reread and refine your notes on a recurring schedule. Last review date lives in each note's frontmatter.

<img src=".github/assets/hero.jpg" alt="Review Anew due and reviewed note statuses">

## Features

- Per-note status bar indicator: `✓ 2025-11-04`, `⚠ due · 2025-09-10`, or `⚠ not reviewed`.
- Folder filter: **excluded** mode or **included**-only mode for batch review scope. Both lists preserved when switching.
- Intervals can be set at three levels: global default, per-folder rules, per-note frontmatter overrides.
- Review the active note's schedule and mark it reviewed from the status bar popup, or mark it directly from the command palette.
- Data stored in note frontmatter — no external database.
- Vault-wide counter of notes currently due for review.


<video src="https://github.com/user-attachments/assets/0aa6c179-e7a6-43a1-a914-7f7c487f79d9" controls></video>


## Quick start

1. Install **Review Anew** from [Obsidian's Community Plugins](https://community.obsidian.md/plugins/review-simple).
2. Set folders to review and mode that fits your needs.
3. Choose a review interval (in days).
4. Reread to refine. Open a random due note via command palette, or by clicking the counter in the status bar.
5. Click the per-note indicator to review its schedule, then choose **Mark reviewed**. To skip the details, use the command palette.

For unreleased builds from `master`, install `CitrusRenegade/review-simple-obsidian` through BRAT.

## Intervals

Review Anew uses folder settings for batch rules and frontmatter for per-note overrides.

Precedence:

1. `review_interval` in the note's frontmatter.
   - A number of days includes that note with that interval, even if it is outside the included folders or inside an excluded folder.
   - `never` excludes that note, even if folder or global rules would include it.
2. Folder filter mode, when the note has no frontmatter interval override.
   - In **excluded** mode, listed folders are skipped.
   - In **included**-only mode, only listed folders are reviewed.
3. Folder interval rule (longest matching path wins).
4. Global default interval.

Example per-note frontmatter:

```yaml
---
reviewed: 2025-10-15
review_interval: 14
---
```

## Commands

> [!TIP]
> Bind **Open random note for review** to `Ctrl+Shift+R` for a fast random review workflow.
>
> A review can include editing, cleanup, and moving the note to a better folder with Obsidian's built-in **Move current file to another folder** command.
>
> When the note is done, mark it reviewed.

- `Open random note for review` — opens a random note that's currently due.
- `Mark current note as reviewed` — writes today's date to frontmatter.

## UI actions

- Clicking the per-note status bar **review indicator** opens its review timing and interval calculation. Choose **Mark reviewed** in the popup to write today's date. The indicator is shown when the active note is included in review.
- Clicking the **due counter** status bar icon opens a random due note. The counter is hidden when there are no due notes.
- Clicking the **ribbon icon** opens a random due note.
- The **folder context menu** can exclude a folder from review when folder filtering is in **excluded** mode.


## Configuration

Settings → Review Anew:

- Global review interval (days).
- Folder filter mode (excluded / included-only) for batch review scope.
- Folder-specific intervals, one `folder/path,days` rule per line.
- Toggles to hide the per-note indicator or the due counter.
- Advanced: customize frontmatter keys (`reviewed`, `review_interval`). A per-note `review_interval` overrides folder filters.

## Alternatives

There are several Obsidian plugins and workflows for revisiting notes with their own trade-offs.

**[prncc/obsidian-repeat-plugin](https://github.com/prncc/obsidian-repeat-plugin)** - A close alternative for reviewing notes with frontmatter-driven schedules. Requires the Dataview plugin. Every note to be reviewed must have a `repeat` property. Bulk setup for existing notes is done through a separate `obsidian-scripts` workflow rather than through the plugin settings.

**[zachmueller/spaced-everything](https://github.com/zachmueller/spaced-everything)** - Implements a more opinionated workflow around spaced repetition for writing and incremental note development. Its "Onboard All Notes" feature performs a bulk frontmatter update, which may be less beginner-friendly in existing vaults. This is a broader onboarding model rather than a lightweight rule-based review workflow.

**[dartungar/obsidian-simple-note-review](https://github.com/dartungar/obsidian-simple-note-review)** - The closest conceptual alternative: it focuses on reviewing, resurfacing, and repeating ordinary notes. Requires the Dataview plugin. It uses note sets based on tags, folders, creation date, or DataviewJS queries, and keeps a persistent queue for each note set.

**[Obsidian Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition)** - A mature spaced repetition plugin with a strong flashcards-first workflow. Whole-note review is supported, but the main workflow and documentation are centered around creating and reviewing flashcards.

**[ryanjamurphy/review-obsidian](https://github.com/ryanjamurphy/review-obsidian)** - Not a revisit notes workflow, just quick adds the current note to a future daily note by one, using the Natural Language Dates plugin to resolve the target date. Maintenance status: no recent release; latest GitHub release was on Dec 10, 2024.

<ins>**Powerful plugins + home-grown templates**</ins> - A similar workflow can be built with Dataview queries, custom query logic, and Templater commands for quickly marking notes as reviewed. This can be very flexible, but it also means maintaining a custom system instead of using a focused review workflow.

*Inspired by the "Reviewed by ... on ..." field on WebMD and other.*

![Thin white WebP divider, direct URL](https://raw.githubusercontent.com/CitrusRenegade/review-simple-obsidian/master/.github/assets/readme-webp-divider.webp)

![Thin white WebP divider, relative path](.github/assets/readme-webp-divider.webp)
