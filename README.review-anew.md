<h1><img src=".github/assets/review-anew-draft.svg" width="56" height="56" alt=""> Review Anew</h1>

Reread and refine your Obsidian notes on a recurring schedule. Choose which folders to review, set your intervals, and open a note when it is due. The last review date stays in the note's frontmatter.

> Review Simple is now **Review Anew**. Your settings, review dates, and hotkeys are preserved. No migration is needed.

## What it does

- **Review on your schedule.** Set a default interval for your vault, rules for specific folders, or an interval for one note.
- **See what is due.** The status bar shows the active note's review status and a count of notes due across your vault.
- **Open a note to review.** Click the due counter or use a command to open a random due note.
- **Check the schedule.** Click a note's review indicator to see its review dates, interval, and how the schedule was calculated.
- **Keep review dates with your notes.** Marking a note reviewed writes today's date to frontmatter. No separate review database or other plugin is required.

Review can mean rereading, correcting an outdated detail, adding a connection, or moving a note to a better folder. When you are finished, mark it reviewed.

## Get started

Requires Obsidian **1.13.0 or later**.

1. Install and enable **Review Anew** from [Community Plugins](https://community.obsidian.md/plugins/review-simple).
2. Open **Settings → Review Anew** and choose which folders to review: exclude folders, or review only the folders you include.
3. Set your default review interval in days.
4. Run **Open random note for review**, or click the due counter in the status bar.
5. Reread and edit the note as needed. Click its review indicator and choose **Mark reviewed**, or run **Mark current note as reviewed**.

You can start with folder rules; you do not need to add properties to every note first. Notes in review scope with no review date are due immediately.

For unreleased builds from `master`, add `CitrusRenegade/review-simple-obsidian` to BRAT.

## Review intervals

Use the global interval as your default, folder rules for groups of notes, and frontmatter for individual exceptions.

For example, set the global interval to **30 days**, then add these folder-specific intervals:

```text
Projects,7
Reference,90
```

Notes in `Projects` are reviewed every 7 days; notes in `Reference` every 90 days. Other included notes use the global interval. For nested folders, the longest matching folder path wins.

To give one note its own interval:

```yaml
---
reviewed: 2026-09-08
review_interval: 14
---
```

Here, `reviewed` is the last review date and `review_interval` is the number of days between reviews. The plugin updates `reviewed` when you mark the note reviewed; you do not need to maintain that date manually.

To keep a note out of review:

```yaml
---
review_interval: never
---
```

### Which rule wins?

1. **Per-note interval.** A positive number in `review_interval` includes the note with that interval, even outside your included folders or inside an excluded folder. `never` excludes it.
2. **Folder filter.** Without a per-note override, excluded mode skips the folders you list; included-only mode reviews only the folders you list.
3. **Folder interval.** For a note that passes the filter, the longest matching folder rule sets its interval.
4. **Global interval.** Used when no per-note or folder interval applies.

The included and excluded folder lists are kept separately, so switching modes preserves both lists.

## Commands and controls

| Control | Action |
| --- | --- |
| **Open random note for review** | Opens a random note that is currently due. |
| **Mark current note as reviewed** | Writes today's date to the active note's frontmatter. |
| Note's status bar indicator | Opens review details, including the schedule calculation and **Mark reviewed** action. |
| Status bar due counter | Opens a random due note. Hidden when no notes are due. |
| Optional ribbon button | Opens a random due note. Enable it in settings. |
| **Exclude folder from review** in a folder's context menu | Adds the folder to the excluded list when using excluded mode. |

The note indicator appears for notes included in review. It shows the last review date, whether the note is due, or that it has not been reviewed yet.

Assign hotkeys to the two commands in **Settings → Hotkeys**. For example, you can bind **Open random note for review** to `Ctrl+Shift+R` if that shortcut is available in your setup.

## Settings

In **Settings → Review Anew**, you can:

- Set the global interval, folder filter, and folder-specific intervals.
- Show or hide the note indicator and due counter.
- Enable the ribbon button, which is off by default.
- Change the frontmatter property names used for review dates and intervals. The defaults are `reviewed` and `review_interval`.

## Other review workflows

Review Anew focuses on recurring review of ordinary notes, with folder rules and status bar controls. Other plugins offer different ways to organize that work:

- **[Simple Note Review](https://github.com/dartungar/obsidian-simple-note-review)** organizes notes into customizable sets with persistent review queues. Useful when you want to work through a defined collection; it requires Dataview.
- **[Repeat](https://github.com/prncc/obsidian-repeat-plugin)** supports periodic and spaced schedules through a note's `repeat` property and a dedicated review view. It requires Dataview and a `repeat` property on each participating note.
- **[Spaced Everything](https://github.com/zachmueller/spaced-everything)** applies spaced repetition to incremental note development, with a broader workflow for writing and revisiting notes.
- **[Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition)** supports flashcards and whole-note review for studying and recall.
- **[Review](https://github.com/ryanjamurphy/review-obsidian)** adds a link to the current note in a future daily note. Useful for a reminder on a particular day; it requires Natural Language Dates.

You can also build a review workflow with Dataview and Templater if you prefer to maintain your own queries and commands.

## Feedback

Report bugs or suggest improvements in [GitHub Issues](https://github.com/CitrusRenegade/review-simple-obsidian/issues). For scheduling problems, include the relevant folder rule and frontmatter, with private note content removed.

Licensed under [MIT](LICENSE).

*Inspired by the “Reviewed by … on …” field on WebMD.*
