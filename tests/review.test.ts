import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import {
  addCalendarDays,
  countDue,
  DueCounterCache,
  getCalendarDayDelta,
  getCalendarDaysSince,
  getEffectiveInterval,
  getLastReviewedDay,
  getOverdueRatioScore,
  getReviewIntervalCalculation,
  getReviewableFiles,
  isDue,
  NEVER_REVIEWED_RANDOM_SCORE,
  pickRandomDue,
  pickTournamentWinner,
} from "../src/review";
import type { ReviewSettings } from "../src/settings";

const NOW = new Date(2026, 0, 31, 12);

function randomSequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

const baseSettings: ReviewSettings = {
  globalIntervalDays: 45,
  folderFilterMode: "excluded",
  excludedFolders: [],
  includedFolders: [],
  folderIntervals: [],
  showReviewStatus: true,
  showDueCounter: true,
  showRibbonIcon: false,
  reviewDetailsFontSizeAdjustment: 0,
  frontmatterIntervalKey: "review_interval",
  frontmatterReviewedKey: "reviewed",
};

function file(path: string): TFile {
  return { path, extension: "md" } as TFile;
}

function appWithFrontmatter(
  frontmatterByPath: Record<string, Record<string, unknown>>,
  paths = Object.keys(frontmatterByPath)
): App {
  const markdownFiles = paths.map((path) => file(path));
  return {
    metadataCache: {
      getFileCache: (target: TFile) => ({
        frontmatter: frontmatterByPath[target.path] ?? {},
      }),
    },
    vault: {
      getMarkdownFiles: () => markdownFiles,
    },
  } as unknown as App;
}

describe("pickTournamentWinner", () => {
  it("returns null when no notes are due", () => {
    expect(pickTournamentWinner([], () => 0)).toBeNull();
  });

  it("returns the only due note when there is one", () => {
    expect(pickTournamentWinner(["only"], () => 0)).toBe("only");
  });

  it("samples two distinct candidates for tournament selection", () => {
    const scored: string[] = [];
    const result = pickTournamentWinner(
      ["a", "b", "c"],
      (item) => {
        scored.push(item);
        return item === "b" ? 2 : 1;
      },
      randomSequence(0, 0)
    );

    expect(result).toBe("b");
    expect(scored).toHaveLength(2);
    expect(new Set(scored)).toEqual(new Set(["a", "b"]));
  });

  it("returns the candidate with the higher overdue ratio", () => {
    const result = pickTournamentWinner(
      [
        { id: "barely-due", reviewed: "2026-01-01", interval: 30 },
        { id: "stale", reviewed: "2025-11-01", interval: 30 },
      ],
      (item) => getOverdueRatioScore(item.reviewed, item.interval, NOW),
      randomSequence(0, 0)
    );

    expect(result?.id).toBe("stale");
  });

  it("prefers a stale weekly note over a barely stale yearly note", () => {
    const result = pickTournamentWinner(
      [
        { id: "yearly", reviewed: "2025-01-01", interval: 365 },
        { id: "weekly", reviewed: "2026-01-10", interval: 7 },
      ],
      (item) => getOverdueRatioScore(item.reviewed, item.interval, NOW),
      randomSequence(0, 0)
    );

    expect(result?.id).toBe("weekly");
  });

  it("scores never-reviewed notes moderately above barely-due notes", () => {
    expect(getOverdueRatioScore(null, 30, NOW)).toBe(NEVER_REVIEWED_RANDOM_SCORE);

    const neverBeatsBarelyDue = pickTournamentWinner(
      [
        { id: "never", reviewed: null, interval: 30 },
        { id: "barely-due", reviewed: "2026-01-01", interval: 30 },
      ],
      (item) => getOverdueRatioScore(item.reviewed, item.interval, NOW),
      randomSequence(0, 0)
    );
    const staleBeatsNever = pickTournamentWinner(
      [
        { id: "never", reviewed: null, interval: 30 },
        { id: "stale", reviewed: "2025-11-01", interval: 30 },
      ],
      (item) => getOverdueRatioScore(item.reviewed, item.interval, NOW),
      randomSequence(0, 0)
    );

    expect(neverBeatsBarelyDue?.id).toBe("never");
    expect(staleBeatsNever?.id).toBe("stale");
  });

  it("returns one candidate when tournament scores are equal", () => {
    const result = pickTournamentWinner(["a", "b"], () => 1, randomSequence(0, 0));

    expect(["a", "b"]).toContain(result);
  });
});

describe("getEffectiveInterval", () => {
  it("keeps note overrides on the fast path without building folder candidates", () => {
    const target = file("Projects/Active/a.md");
    const settingsWithGuardedFolderIntervals = {
      ...baseSettings,
      get folderIntervals(): ReviewSettings["folderIntervals"] {
        throw new Error("folder interval candidates should not be read");
      },
    };

    expect(
      getEffectiveInterval(
        target,
        appWithFrontmatter({
          "Projects/Active/a.md": { review_interval: 60 },
        }),
        settingsWithGuardedFolderIntervals
      )
    ).toBe(60);
  });

  it("lets frontmatter interval include notes outside included-only folders", () => {
    const interval = getEffectiveInterval(
      file("Notes/a.md"),
      appWithFrontmatter({ "Notes/a.md": { review_interval: 7 } }),
      {
        ...baseSettings,
        folderFilterMode: "included",
        includedFolders: [],
      }
    );

    expect(interval).toBe(7);
  });

  it("lets frontmatter interval include notes in excluded folders", () => {
    const interval = getEffectiveInterval(
      file("Archive/a.md"),
      appWithFrontmatter({ "Archive/a.md": { review_interval: 7 } }),
      {
        ...baseSettings,
        excludedFolders: ["Archive"],
      }
    );

    expect(interval).toBe(7);
  });

  it("lets frontmatter never exclude notes that folder rules would include", () => {
    const interval = getEffectiveInterval(
      file("Notes/a.md"),
      appWithFrontmatter({ "Notes/a.md": { review_interval: "never" } }),
      {
        ...baseSettings,
        folderFilterMode: "included",
        includedFolders: ["Notes"],
        folderIntervals: [{ folder: "Notes", days: 7 }],
      }
    );

    expect(interval).toBeNull();
  });

  it("matches frontmatter never case-insensitively after trimming whitespace", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      folderFilterMode: "included",
      includedFolders: ["Notes"],
      folderIntervals: [{ folder: "Notes", days: 7 }],
    };

    for (const value of ["Never", " NEVER ", "never "]) {
      expect(
        getEffectiveInterval(
          file("Notes/a.md"),
          appWithFrontmatter({ "Notes/a.md": { review_interval: value } }),
          settings
        )
      ).toBeNull();
    }
  });

  it("does not let folder intervals override excluded folders", () => {
    const interval = getEffectiveInterval(
      file("Archive/a.md"),
      appWithFrontmatter({}),
      {
        ...baseSettings,
        excludedFolders: ["Archive"],
        folderIntervals: [{ folder: "Archive", days: 7 }],
      }
    );

    expect(interval).toBeNull();
  });

  it("applies included-only filtering when a note has no frontmatter interval", () => {
    const interval = getEffectiveInterval(
      file("Notes/a.md"),
      appWithFrontmatter({}),
      {
        ...baseSettings,
        folderFilterMode: "included",
        includedFolders: ["Projects"],
      }
    );

    expect(interval).toBeNull();
  });

  it("does not let invalid frontmatter intervals bypass folder filtering", () => {
    const interval = getEffectiveInterval(
      file("Notes/a.md"),
      appWithFrontmatter({ "Notes/a.md": { review_interval: 0 } }),
      {
        ...baseSettings,
        folderFilterMode: "included",
        includedFolders: ["Projects"],
      }
    );

    expect(interval).toBeNull();
  });

  it("requires strict positive integer frontmatter intervals", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      folderFilterMode: "included",
      includedFolders: [],
    };

    for (const value of ["7 days", "7abc", "1e2", "7.5", 7.5, 0]) {
      expect(
        getEffectiveInterval(
          file("Loose/a.md"),
          appWithFrontmatter({ "Loose/a.md": { review_interval: value } }),
          settings
        )
      ).toBeNull();
    }

    expect(
      getEffectiveInterval(
        file("Loose/a.md"),
        appWithFrontmatter({ "Loose/a.md": { review_interval: "08" } }),
        settings
      )
    ).toBe(8);
  });
});

describe("getReviewIntervalCalculation", () => {
  const layeredSettings: ReviewSettings = {
    ...baseSettings,
    globalIntervalDays: 90,
    folderFilterMode: "included",
    includedFolders: ["Projects"],
    folderIntervals: [
      { folder: "Projects", days: 20 },
      { folder: "Projects/Active", days: 30 },
      { folder: "Other", days: 10 },
    ],
  };

  it("keeps matching interval candidates visible while a note override wins", () => {
    const calculation = getReviewIntervalCalculation(
      file("Projects/Active/a.md"),
      appWithFrontmatter({
        "Projects/Active/a.md": { review_interval: 60 },
      }),
      layeredSettings
    );

    expect(calculation).toEqual({
      mode: "included",
      effectiveIntervalDays: 60,
      candidates: [
        { kind: "note", days: 60, applied: true },
        {
          kind: "folder",
          folder: "Projects/Active",
          days: 30,
          applied: false,
        },
        {
          kind: "folder",
          folder: "Projects",
          days: 20,
          applied: false,
        },
        { kind: "default", days: 90, applied: false },
      ],
    });
  });

  it("applies the most specific matching folder interval without a note override", () => {
    const calculation = getReviewIntervalCalculation(
      file("Projects/Active/a.md"),
      appWithFrontmatter({ "Projects/Active/a.md": {} }),
      layeredSettings
    );

    expect(calculation).toEqual({
      mode: "included",
      effectiveIntervalDays: 30,
      candidates: [
        {
          kind: "folder",
          folder: "Projects/Active",
          days: 30,
          applied: true,
        },
        {
          kind: "folder",
          folder: "Projects",
          days: 20,
          applied: false,
        },
        { kind: "default", days: 90, applied: false },
      ],
    });
  });
});

describe("reviewable and due files", () => {
  it("uses frontmatter interval as a per-note opt-in for due counts and random picks", () => {
    const app = appWithFrontmatter(
      {
        "Loose/manual.md": { review_interval: 7 },
        "Loose/plain.md": {},
      },
      ["Loose/manual.md", "Loose/plain.md"]
    );
    const settings: ReviewSettings = {
      ...baseSettings,
      folderFilterMode: "included",
      includedFolders: [],
    };

    expect(getReviewableFiles(app, settings).map((f) => f.path)).toEqual([
      "Loose/manual.md",
    ]);
    expect(countDue(app, settings)).toBe(1);
    expect(pickRandomDue(app, settings, randomSequence(0))?.path).toBe(
      "Loose/manual.md"
    );
  });

  it("keeps frontmatter never variants stronger than included folders in reviewable lists", () => {
    const app = appWithFrontmatter(
      {
        "Notes/a.md": { review_interval: "never" },
        "Notes/b.md": { review_interval: " Never " },
        "Notes/c.md": {},
      },
      ["Notes/a.md", "Notes/b.md", "Notes/c.md"]
    );
    const settings: ReviewSettings = {
      ...baseSettings,
      folderFilterMode: "included",
      includedFolders: ["Notes"],
    };

    expect(getReviewableFiles(app, settings).map((f) => f.path)).toEqual([
      "Notes/c.md",
    ]);
  });
});

describe("DueCounterCache", () => {
  it("updates a changed file without another full-vault scan", () => {
    const a = file("Notes/a.md");
    const b = file("Notes/b.md");
    const frontmatterByPath: Record<string, Record<string, unknown>> = {
      "Notes/a.md": { reviewed: "2026-01-31" },
      "Notes/b.md": {},
    };
    let scanCount = 0;
    const app = {
      metadataCache: {
        getFileCache: (target: TFile) => ({
          frontmatter: frontmatterByPath[target.path] ?? {},
        }),
      },
      vault: {
        getMarkdownFiles: () => {
          scanCount += 1;
          return [a, b];
        },
      },
    } as unknown as App;
    const cache = new DueCounterCache(app, () => baseSettings);

    expect(cache.countDue(NOW)).toBe(1);
    expect(scanCount).toBe(1);

    frontmatterByPath["Notes/a.md"] = { reviewed: "2025-01-31" };
    cache.invalidateFile(a);

    expect(cache.countDue(NOW)).toBe(2);
    expect(scanCount).toBe(1);
  });

  it("keeps the cached count correct after create, delete, and file rename", () => {
    const a = file("Notes/a.md");
    const b = file("Notes/b.md");
    const c = file("Notes/c.md");
    const renamedB = file("Archive/b.md");
    let markdownFiles = [a, b];
    const frontmatterByPath: Record<string, Record<string, unknown>> = {
      "Notes/a.md": {},
      "Notes/b.md": { reviewed: "2026-01-31" },
      "Notes/c.md": {},
      "Archive/b.md": {},
    };
    let settings: ReviewSettings = {
      ...baseSettings,
      excludedFolders: ["Archive"],
    };
    const app = {
      metadataCache: {
        getFileCache: (target: TFile) => ({
          frontmatter: frontmatterByPath[target.path] ?? {},
        }),
      },
      vault: {
        getMarkdownFiles: () => markdownFiles,
      },
    } as unknown as App;
    const cache = new DueCounterCache(app, () => settings);

    expect(cache.countDue(NOW)).toBe(1);

    markdownFiles = [a, b, c];
    cache.invalidateFile(c);
    expect(cache.countDue(NOW)).toBe(2);

    markdownFiles = [b, c];
    cache.removeFile(a);
    expect(cache.countDue(NOW)).toBe(1);

    markdownFiles = [renamedB, c];
    cache.renameFile(renamedB, "Notes/b.md");
    expect(cache.countDue(NOW)).toBe(1);

    settings = {
      ...settings,
      excludedFolders: [],
    };
    cache.invalidateAll();
    expect(cache.countDue(NOW)).toBe(2);
  });

  it("rebuilds after review rules change", () => {
    const a = file("Notes/a.md");
    let scanCount = 0;
    let settings: ReviewSettings = baseSettings;
    const app = {
      metadataCache: {
        getFileCache: () => ({ frontmatter: {} }),
      },
      vault: {
        getMarkdownFiles: () => {
          scanCount += 1;
          return [a];
        },
      },
    } as unknown as App;
    const cache = new DueCounterCache(app, () => settings);

    expect(cache.countDue(NOW)).toBe(1);
    expect(scanCount).toBe(1);

    settings = {
      ...baseSettings,
      folderFilterMode: "included",
      includedFolders: [],
    };
    cache.invalidateAll();

    expect(cache.countDue(NOW)).toBe(0);
    expect(scanCount).toBe(2);
  });

  it("rebuilds when the local day changes", () => {
    const a = file("Notes/a.md");
    let scanCount = 0;
    const app = {
      metadataCache: {
        getFileCache: () => ({ frontmatter: { reviewed: "2026-01-30" } }),
      },
      vault: {
        getMarkdownFiles: () => {
          scanCount += 1;
          return [a];
        },
      },
    } as unknown as App;
    const settings: ReviewSettings = {
      ...baseSettings,
      globalIntervalDays: 2,
    };
    const cache = new DueCounterCache(app, () => settings);

    expect(cache.countDue(new Date(2026, 0, 31))).toBe(0);
    expect(cache.countDue(new Date(2026, 0, 31, 23))).toBe(0);
    expect(scanCount).toBe(1);

    expect(cache.countDue(new Date(2026, 1, 1))).toBe(1);
    expect(scanCount).toBe(2);
  });

  it("does not apply a completed mark to a replacement at the same path", () => {
    const original = file("Notes/a.md");
    const replacement = file("Notes/a.md");
    let files = [original];
    const app = {
      metadataCache: {
        getFileCache: () => ({ frontmatter: {} }),
      },
      vault: {
        getMarkdownFiles: () => files,
      },
    } as unknown as App;
    const cache = new DueCounterCache(app, () => baseSettings);

    expect(cache.countDue(NOW)).toBe(1);
    files = [replacement];
    cache.removeFile(original);
    cache.invalidateFile(replacement);

    expect(cache.countDue(NOW)).toBe(1);
  });

});

describe("getLastReviewedDay", () => {
  it("parses date-only frontmatter as a canonical review day", () => {
    const last = getLastReviewedDay(
      file("Notes/a.md"),
      appWithFrontmatter({ "Notes/a.md": { reviewed: "2026-06-10" } }),
      baseSettings
    );

    expect(last).toBe("2026-06-10");
  });

  it("normalizes legacy Date frontmatter by UTC day to avoid negative-timezone drift", () => {
    const last = getLastReviewedDay(
      file("Notes/a.md"),
      appWithFrontmatter({
        "Notes/a.md": { reviewed: new Date("2026-06-10") },
      }),
      baseSettings
    );

    expect(last).toBe("2026-06-10");
  });

  it("normalizes string datetime-like frontmatter by written calendar day", () => {
    const app = appWithFrontmatter({
      "Notes/zulu.md": { reviewed: "2026-06-10T00:00:00.000Z" },
      "Notes/offset.md": { reviewed: "2026-06-10T00:00:00+03:00" },
      "Notes/spaced.md": { reviewed: "2026-06-10 12:30" },
    });

    expect(getLastReviewedDay(file("Notes/zulu.md"), app, baseSettings)).toBe(
      "2026-06-10"
    );
    expect(getLastReviewedDay(file("Notes/offset.md"), app, baseSettings)).toBe(
      "2026-06-10"
    );
    expect(getLastReviewedDay(file("Notes/spaced.md"), app, baseSettings)).toBe(
      "2026-06-10"
    );
  });

  it("normalizes numeric legacy frontmatter by UTC day", () => {
    const app = appWithFrontmatter({
      "Notes/number.md": { reviewed: Date.UTC(2026, 5, 10) },
    });

    expect(getLastReviewedDay(file("Notes/number.md"), app, baseSettings)).toBe(
      "2026-06-10"
    );
  });

  it("ignores impossible date-only frontmatter values", () => {
    const last = getLastReviewedDay(
      file("Notes/a.md"),
      appWithFrontmatter({ "Notes/a.md": { reviewed: "2026-02-31" } }),
      baseSettings
    );

    expect(last).toBeNull();
  });

  it("ignores impossible datetime-like and non-date frontmatter values", () => {
    const app = appWithFrontmatter({
      "Notes/datetime.md": { reviewed: "2026-02-31T00:00:00" },
      "Notes/text.md": { reviewed: "not a date" },
    });

    expect(getLastReviewedDay(file("Notes/datetime.md"), app, baseSettings)).toBeNull();
    expect(getLastReviewedDay(file("Notes/text.md"), app, baseSettings)).toBeNull();
  });
});

describe("calendar review-day arithmetic", () => {
  it("keeps a signed calendar-day delta for review-detail timing", () => {
    expect(getCalendarDayDelta("2026-09-10", new Date(2026, 7, 28))).toBe(-13);
  });

  it("adds an interval as a canonical review day across a month boundary", () => {
    expect(addCalendarDays("2026-08-10", 30)).toBe("2026-09-09");
  });
});

describe("isDue", () => {
  it("uses calendar-day age instead of elapsed milliseconds", () => {
    const app = appWithFrontmatter({
      "Notes/a.md": { reviewed: "2026-06-10" },
    });

    expect(
      isDue(file("Notes/a.md"), app, baseSettings, new Date(2026, 6, 24, 23))
    ).toBe(false);
    expect(
      isDue(file("Notes/a.md"), app, baseSettings, new Date(2026, 6, 25, 0))
    ).toBe(true);
  });

  it("does not count negative calendar-day age for future reviewed dates", () => {
    expect(getCalendarDaysSince("2026-07-25", new Date(2026, 6, 24))).toBe(0);
  });
});
