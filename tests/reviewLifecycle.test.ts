import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";

vi.mock("obsidian", () => ({
  Plugin: class {
    app: App;
    constructor(app: App) { this.app = app; }
    loadData = async () => ({});
    register = () => {};
    registerEvent = () => {};
    registerDomEvent = () => {};
    addSettingTab = () => {};
    addCommand = () => {};
    addRibbonIcon = () => ({});
    addStatusBarItem = () => ({ remove() {} });
  },
  PluginSettingTab: class {},
  TFile: class { path = "note.md"; extension = "md"; },
  TFolder: class {},
  Notice: class {},
}));

vi.mock("../src/statusbar", async () => {
  const { DueCounterCache, getLastReviewedDay } = await import("../src/review");
  return {
    ReviewStatusBar: class {
      day: string | null = null;
      constructor(
        _el: unknown, private app: App,
        private settings: () => import("../src/settings").ReviewSettings,
        _mark: unknown
      ) {}
      update(file: TFile | null) {
        this.day = file ? getLastReviewedDay(file, this.app, this.settings()) : null;
      }
      closeDetails() {}
    },
    DueCounterStatusBar: class {
      cache: InstanceType<typeof DueCounterCache>;
      count = 0;
      constructor(_el: unknown, app: App, settings: () => import("../src/settings").ReviewSettings,
        _open: unknown) {
        this.cache = new DueCounterCache(app, settings);
      }
      update() { this.count = this.cache.countDue(); }
      invalidateFile(file: TFile) { this.cache.invalidateFile(file); }
      removeFile(file: TFile) { this.cache.removeFile(file); }
    },
  };
});

import { TFile as FileClass } from "obsidian";
import ReviewPlugin from "../src/main";
import { getReviewDetails } from "../src/reviewDetails";
import { pickRandomDue } from "../src/review";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup() {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("activeWindow", {});
  const file = new FileClass();
  const fm: Record<string, unknown> = {};
  const handlers = new Map<string, (file: TFile) => void>();
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const write = vi.fn(() => new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; }));
  const app = {
    metadataCache: {
      getFileCache: () => ({ frontmatter: fm }),
      on: (event: string, callback: (file: TFile) => void) => handlers.set(event, callback),
    },
    workspace: { getActiveFile: () => file, on: () => {}, onLayoutReady: () => {} },
    vault: { getMarkdownFiles: () => [file], getAbstractFileByPath: () => file, on: () => {} },
    fileManager: { processFrontMatter: write },
  } as unknown as App;
  const plugin = new ReviewPlugin(app, {} as never);
  await plugin.onload();
  const internal = plugin as unknown as {
    markReviewed(file: TFile): Promise<boolean>;
    statusBar: { day: string | null };
    dueCounter: { count: number };
  };
  plugin.updateAll();
  const changed = () => { handlers.get("changed")!(file); vi.advanceTimersByTime(500); };
  return { app, plugin, internal, fm, file, changed, finish: () => finish(), fail: () => fail(new Error("write failed")), write };
}

describe("review write and metadata lifecycle", () => {
  it("uses the latest metadata when an external edit overtakes a pending mark", async () => {
    const s = await setup();
    const pending = s.internal.markReviewed(s.file);
    s.fm.reviewed = "2000-01-01";
    s.changed();
    expect(s.internal.statusBar.day).toBe("2000-01-01");
    s.finish();
    expect(await pending).toBe(true);
    expect(s.internal.dueCounter.count).toBe(1);
    expect(getReviewDetails(s.file, s.app, s.plugin.settings)?.lastReviewedDay).toBe("2000-01-01");
    expect(pickRandomDue(s.app, s.plugin.settings)).toBe(s.file);
    delete s.fm.reviewed;
    s.changed();
    expect(s.internal.statusBar.day).toBeNull();
    expect(s.internal.dueCounter.count).toBe(1);
  });

  it("keeps cache-derived state until delayed metadata arrives, then supports deletion and undo", async () => {
    const s = await setup();
    const pending = s.internal.markReviewed(s.file);
    s.finish();
    await pending;
    expect(s.internal.statusBar.day).toBeNull();
    expect(s.internal.dueCounter.count).toBe(1);
    s.fm.reviewed = "9999-01-01";
    s.changed();
    expect(s.internal.statusBar.day).toBe("9999-01-01");
    expect(s.internal.dueCounter.count).toBe(0);
    delete s.fm.reviewed;
    s.changed();
    expect(s.internal.statusBar.day).toBeNull();
    expect(s.internal.dueCounter.count).toBe(1);
    s.fm.reviewed = "9999-01-01";
    s.changed();
    expect(s.internal.dueCounter.count).toBe(0);
  });

  it("deduplicates writes and leaves persisted state alone on failure", async () => {
    const s = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = s.internal.markReviewed(s.file);
    const second = s.internal.markReviewed(s.file);
    expect(s.write).toHaveBeenCalledTimes(1);
    s.fail();
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(s.internal.statusBar.day).toBeNull();
    expect(s.internal.dueCounter.count).toBe(1);
  });

  it("rechecks metadata on completion even without a changed event", async () => {
    const s = await setup();
    const pending = s.internal.markReviewed(s.file);
    s.fm.reviewed = "9999-01-01";
    s.finish();
    expect(await pending).toBe(true);
    expect(s.internal.statusBar.day).toBe("9999-01-01");
    expect(s.internal.dueCounter.count).toBe(0);
    expect(pickRandomDue(s.app, s.plugin.settings)).toBeNull();
  });

  it("uses the currently configured key when an older write completes", async () => {
    const s = await setup();
    const pending = s.internal.markReviewed(s.file);
    s.plugin.settings.frontmatterReviewedKey = "checked";
    s.fm.reviewed = "9999-01-01";
    s.finish();
    await pending;
    expect(s.internal.statusBar.day).toBeNull();
    expect(s.internal.dueCounter.count).toBe(1);
  });

  it("does not report a saved write as failed when rendering throws", async () => {
    const s = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(s.plugin, "updateAll").mockImplementation(() => { throw new Error("render failed"); });
    const pending = s.internal.markReviewed(s.file);
    s.finish();
    expect(await pending).toBe(true);
  });

  it("does not mark a replacement file reviewed when the original disappears", async () => {
    const s = await setup();
    const pending = s.internal.markReviewed(s.file);
    const replacement = new FileClass();
    vi.spyOn(s.app.vault, "getAbstractFileByPath").mockReturnValue(replacement);
    vi.spyOn(s.app.vault, "getMarkdownFiles").mockReturnValue([replacement]);
    vi.spyOn(s.app.workspace, "getActiveFile").mockReturnValue(replacement);
    s.finish();
    await pending;
    expect(s.internal.statusBar.day).toBeNull();
    expect(s.internal.dueCounter.count).toBe(1);
  });
});
