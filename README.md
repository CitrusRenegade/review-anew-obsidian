# Review Anew

> Review Simple is now **Review Anew**. Your settings, review dates, and hotkeys are preserved. No migration is needed.

Reread and refine your Obsidian notes on a recurring schedule. Last review date lives in each note's frontmatter.

<img src=".github/assets/hero.webp" alt="Review Simple due and reviewed note statuses">

## Features

- **Review on your schedule.** Set a default interval for your vault, rules for specific folders, or an interval for one note.
- **See what is due.** The status bar shows the active note's review status and a count of notes due across your vault.
- **Open a note to review.** Click the due counter or use a command to open a random due note.
- **Check the schedule.** Click a note's review indicator to see its review dates, interval, and how the schedule was calculated.
- **Keep review dates with your notes.** Marking a note reviewed writes today's date to frontmatter. No separate review database or other plugin is required.


## Quick start

1. Install and enable **Review Anew** from [Community Plugins](https://community.obsidian.md/plugins/review-simple).
2. Open **Settings → Review Anew** and choose which folders to review: exclude folders, or review only the folders you include.
3. Set your default review interval in days.
4. Run **Open random note for review**, or click the due counter in the status bar.
5. Reread and edit the note as needed. Click its review indicator and choose **Mark reviewed**, or run **Mark current note as reviewed**.

You can start with folder rules; you do not need to add properties to every note first. Notes in review scope with no review date are due immediately.

For unreleased builds from `master`, add `CitrusRenegade/review-anew-obsidian` to BRAT.

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

## Alternatives

There are several Obsidian plugins and workflows for revisiting notes with their own trade-offs.

**[prncc/obsidian-repeat-plugin](https://github.com/prncc/obsidian-repeat-plugin)** - A close alternative for reviewing notes with frontmatter-driven schedules. Requires the Dataview plugin. Every note to be reviewed must have a `repeat` property. Bulk setup for existing notes is done through a separate `obsidian-scripts` workflow rather than through the plugin settings.

**[zachmueller/spaced-everything](https://github.com/zachmueller/spaced-everything)** - Implements a more opinionated workflow around spaced repetition for writing and incremental note development. Its "Onboard All Notes" feature performs a bulk frontmatter update, which may be less beginner-friendly in existing vaults. This is a broader onboarding model rather than a lightweight rule-based review workflow.

**[dartungar/obsidian-simple-note-review](https://github.com/dartungar/obsidian-simple-note-review)** - The closest conceptual alternative: it focuses on reviewing, resurfacing, and repeating ordinary notes. Requires the Dataview plugin. It uses note sets based on tags, folders, creation date, or DataviewJS queries, and keeps a persistent queue for each note set.

**[Obsidian Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition)** - A mature spaced repetition plugin with a strong flashcards-first workflow. Whole-note review is supported, but the main workflow and documentation are centered around creating and reviewing flashcards.

**[ryanjamurphy/review-obsidian](https://github.com/ryanjamurphy/review-obsidian)** - Not a revisit notes workflow, just quick adds the current note to a future daily note by one, using the Natural Language Dates plugin to resolve the target date.

<ins>**Powerful plugins + home-grown templates**</ins> - A similar workflow can be built with Dataview queries, custom query logic, and Templater commands for quickly marking notes as reviewed. This can be very flexible, but it also means maintaining a custom system instead of using a focused review workflow.

*Inspired by the “Reviewed by … on …” field on WebMD.*
