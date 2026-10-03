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
  TFolder: class { path = "Archive"; },
  Notice: class {},
}));

vi.mock("../src/statusbar", async () => {
  const { DueCounterCache, getLastReviewedDay } = await import("../src/review");
  return {
    ReviewStatusBar: class {
      day: string | null = null;
      hidden = false;
      constructor(
        _el: unknown, private app: App,
        private settings: () => import("../src/settings").ReviewSettings,
        _mark: unknown
      ) {}
      update(file: TFile | null) {
        if (!file || file.extension !== "md") {
          this.hidden = true;
          this.day = null;
          return;
        }
        this.hidden = false;
        this.day = getLastReviewedDay(file, this.app, this.settings());
      }
      closeDetails() {}
    },
    DueCounterStatusBar: class {
      cache: InstanceType<typeof DueCounterCache>;
      count = 0;
      pendingMetadataRefresh = false;
      constructor(_el: unknown, app: App, settings: () => import("../src/settings").ReviewSettings,
        _open: unknown) {
        this.cache = new DueCounterCache(app, settings);
      }
      update() {
        if (!this.pendingMetadataRefresh) this.count = this.cache.countDue();
      }
      setMetadataRefreshPending(value: boolean) { this.pendingMetadataRefresh = value; }
      invalidateAll() { this.cache.invalidateAll(); }
      invalidateFile(file: TFile) { this.cache.invalidateFile(file); }
      removeFile(file: TFile) { this.cache.removeFile(file); }
      renameFile(file: TFile, oldPath: string) { this.cache.renameFile(file, oldPath); }
    },
  };
});

import { TFile as FileClass, TFolder as FolderClass } from "obsidian";
import ReviewPlugin from "../src/main";
import { getReviewDetails } from "../src/reviewDetails";
import { pickRandomDue } from "../src/review";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup() {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("activeWindow", {});
  const file = new FileClass();
  const otherFile = new FileClass();
  otherFile.path = "other.md";
  let markdownFiles = [file];
  const fm: Record<string, unknown> = {};
  let cacheAvailable = true;
  let activeFile: TFile | null = file;
  type EventHandler = (...args: unknown[]) => void;
  const metadataHandlers = new Map<string, EventHandler>();
  const vaultHandlers = new Map<string, EventHandler>();
  const workspaceHandlers = new Map<string, EventHandler>();
  const openFile = vi.fn(async () => undefined);
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const write = vi.fn(() => new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; }));
  const app = {
    metadataCache: {
      getFileCache: (target: TFile) => {
        if (target.extension !== "md") return null;
        if (target === file && !cacheAvailable) return null;
        return {
          frontmatter: target === file
            ? fm
            : target === otherFile ? { reviewed: "9999-01-01" } : {},
        };
      },
      on: (event: string, callback: (...args: never[]) => void) =>
        metadataHandlers.set(event, callback as unknown as EventHandler),
    },
    workspace: {
      getActiveFile: () => activeFile,
      on: (event: string, callback: (...args: never[]) => void) =>
        workspaceHandlers.set(event, callback as unknown as EventHandler),
      onLayoutReady: () => {},
      getLeaf: () => ({ openFile }),
    },
    vault: {
      getMarkdownFiles: () => markdownFiles,
      getAbstractFileByPath: () => file,
      on: (event: string, callback: (...args: never[]) => void) =>
        vaultHandlers.set(event, callback as unknown as EventHandler),
    },
    fileManager: { processFrontMatter: write },
  } as unknown as App;
  const plugin = new ReviewPlugin(app, {} as never);
  await plugin.onload();
  const internal = plugin as unknown as {
    markReviewed(file: TFile): Promise<boolean>;
    openRandomDue(): Promise<void>;
    statusBar: { day: string | null; hidden: boolean };
    dueCounter: { count: number; pendingMetadataRefresh: boolean };
  };
  plugin.updateAll();
  const changed = () => {
    metadataHandlers.get("changed")!(file);
    vi.advanceTimersByTime(500);
  };
  const emitChanged = () => metadataHandlers.get("changed")!(file);
  const rename = (oldPath: string, target: TFile = file) =>
    vaultHandlers.get("rename")!(target, oldPath);
  const renameFolder = (folder: InstanceType<typeof FolderClass>, oldPath: string) =>
    vaultHandlers.get("rename")!(folder, oldPath);
  const deleteFile = (target: TFile) => {
    markdownFiles = markdownFiles.filter((file) => file !== target);
    vi.spyOn(app.vault, "getAbstractFileByPath").mockReturnValue(null);
    vaultHandlers.get("delete")!(target);
  };
  const deleteFolder = (folder: InstanceType<typeof FolderClass>) => {
    markdownFiles = [];
    vi.spyOn(app.vault, "getAbstractFileByPath").mockReturnValue(null);
    vaultHandlers.get("delete")!(folder);
  };
  const resolved = () => metadataHandlers.get("resolved")?.();
  return {
    app, plugin, internal, fm, file, otherFile, changed, emitChanged,
    rename, renameFolder, deleteFile, deleteFolder, resolved, openFile,
    setCacheAvailable: (value: boolean) => { cacheAvailable = value; },
    setMarkdownFiles: (files: TFile[]) => { markdownFiles = files; },
    setActiveFile: (value: TFile | null) => {
      activeFile = value;
      workspaceHandlers.get("active-leaf-change")?.();
    },
    finish: () => finish(), fail: () => fail(new Error("write failed")), write,
  };
}

describe("review write and metadata lifecycle", () => {
  it("does not overwrite an interval when saved frontmatter keys collide", async () => {
    const s = await setup();
    s.plugin.settings.frontmatterReviewedKey = "review_interval";
    s.fm.review_interval = 7;

    const result = s.internal.markReviewed(s.file);
    if (s.write.mock.calls.length > 0) s.finish();

    expect(await result).toBe(false);
    expect(s.write).not.toHaveBeenCalled();
    expect(s.fm.review_interval).toBe(7);
  });

  it.each(["file", "folder"])("releases a pending %s rename when its note becomes an attachment", async (kind) => {
    const s = await setup();
    const remaining = new FileClass();
    remaining.path = "remaining.md";
    s.setMarkdownFiles([s.file, remaining]);
    s.plugin.refreshReviewState();
    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    if (kind === "file") s.rename("note.md");
    else s.renameFolder(new FolderClass(), "Inbox");
    await Promise.resolve();
    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(true);

    s.file.path = "Archive/note.txt";
    s.file.extension = "txt";
    s.setMarkdownFiles([remaining]);
    s.rename("Archive/note.md");
    vi.advanceTimersByTime(500);

    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(false);
    expect(s.internal.dueCounter.count).toBe(1);
    expect(s.internal.statusBar.hidden).toBe(true);
    await s.internal.openRandomDue();
    expect(s.openFile).toHaveBeenCalledWith(remaining);
  });

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

  it("waits for relocated metadata before refreshing an active renamed note", async () => {
    const s = await setup();
    s.fm.reviewed = "2000-01-01";
    s.plugin.updateAll();
    expect(s.internal.statusBar.day).toBe("2000-01-01");

    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");

    expect(s.internal.statusBar.hidden).toBe(true);
    expect(s.internal.statusBar.day).toBeNull();

    s.fm.reviewed = "9999-01-01";
    s.setCacheAvailable(true);
    s.resolved();

    expect(s.internal.statusBar.day).toBe("9999-01-01");
  });

  it("retries an active rename refresh when metadata resolves after the event dispatch", async () => {
    const s = await setup();
    s.fm.reviewed = "2000-01-01";
    s.plugin.updateAll();

    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");
    await Promise.resolve();
    expect(s.internal.statusBar.hidden).toBe(true);
    expect(s.internal.statusBar.day).toBeNull();

    s.fm.reviewed = "9999-01-01";
    s.setCacheAvailable(true);
    s.resolved();

    expect(s.internal.statusBar.day).toBe("9999-01-01");
  });

  it("refreshes after the rename event settles without a metadata event", async () => {
    const s = await setup();
    s.fm.reviewed = "2000-01-01";
    s.plugin.updateAll();

    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");
    await Promise.resolve();
    expect(s.internal.statusBar.hidden).toBe(true);

    s.fm.reviewed = "9999-01-01";
    s.setCacheAvailable(true);
    vi.advanceTimersByTime(0);

    expect(s.internal.statusBar.hidden).toBe(false);
    expect(s.internal.statusBar.day).toBe("9999-01-01");
    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(false);
  });

  it("keeps checking cache readiness after a delayed rekey without a metadata event", async () => {
    const s = await setup();
    s.fm.reviewed = "2000-01-01";
    s.plugin.updateAll();

    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");
    await Promise.resolve();
    vi.advanceTimersByTime(0);
    expect(s.internal.statusBar.hidden).toBe(true);

    s.fm.reviewed = "9999-01-01";
    s.setCacheAvailable(true);
    vi.advanceTimersByTime(50);

    expect(s.internal.statusBar.hidden).toBe(false);
    expect(s.internal.statusBar.day).toBe("9999-01-01");
    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(false);
  });

  it("uses the cache rekeyed before the rename microtask without a metadata event", async () => {
    const s = await setup();
    s.fm.reviewed = "2000-01-01";
    s.plugin.updateAll();

    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");
    s.fm.reviewed = "9999-01-01";
    s.setCacheAvailable(true);
    await Promise.resolve();

    expect(s.internal.statusBar.hidden).toBe(false);
    expect(s.internal.statusBar.day).toBe("9999-01-01");
    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(false);
  });

  it("does not gate review state while a non-Markdown attachment is renamed", async () => {
    const s = await setup();
    const attachment = new FileClass();
    attachment.path = "Archive/cover.png";
    attachment.extension = "png";

    s.rename("Inbox/cover.png", attachment);
    vi.advanceTimersByTime(100);

    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(false);
    expect(s.internal.statusBar.hidden).toBe(false);
  });

  it("removes review state when an active Markdown note is renamed to an attachment", async () => {
    const s = await setup();
    s.file.path = "Inbox/note.md";
    s.fm.reviewed = "2000-01-01";
    s.plugin.refreshReviewState();
    expect(s.internal.dueCounter.count).toBe(1);

    s.file.path = "Archive/note.txt";
    s.file.extension = "txt";
    s.setMarkdownFiles([]);
    s.rename("Inbox/note.md");
    vi.advanceTimersByTime(500);

    expect(s.internal.statusBar.hidden).toBe(true);
    expect(s.internal.dueCounter.count).toBe(0);
    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(false);
  });

  it("does not render an unreviewed state when returning to a renamed note before cache rekeys", async () => {
    const s = await setup();
    s.fm.reviewed = "2000-01-01";
    s.plugin.updateAll();

    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");
    s.setActiveFile(s.otherFile);
    s.setActiveFile(s.file);

    expect(s.internal.statusBar.hidden).toBe(true);
    expect(s.internal.statusBar.day).toBeNull();

    s.fm.reviewed = "9999-01-01";
    s.setCacheAvailable(true);
    s.resolved();

    expect(s.internal.statusBar.hidden).toBe(false);
    expect(s.internal.statusBar.day).toBe("9999-01-01");
  });

  it("does not cache a renamed reviewed note as due while metadata is unavailable", async () => {
    const s = await setup();
    s.file.path = "Inbox/note.md";
    s.fm.reviewed = "9999-01-01";
    s.plugin.refreshReviewState();
    expect(s.internal.dueCounter.count).toBe(0);

    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");
    vi.advanceTimersByTime(500);

    expect(s.internal.dueCounter.count).toBe(0);

    s.setCacheAvailable(true);
    await Promise.resolve();

    expect(s.internal.dueCounter.count).toBe(0);
  });

  it("cancels a scheduled due refresh while renamed metadata is unavailable", async () => {
    const s = await setup();
    s.file.path = "Inbox/note.md";
    s.fm.reviewed = "9999-01-01";
    s.plugin.refreshReviewState();
    expect(s.internal.dueCounter.count).toBe(0);

    s.emitChanged();
    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");
    vi.advanceTimersByTime(500);

    expect(s.internal.dueCounter.count).toBe(0);

    s.setCacheAvailable(true);
    await Promise.resolve();

    expect(s.internal.dueCounter.count).toBe(0);
  });

  it("keeps derived review UI hidden until metadata is ready after a folder move", async () => {
    const s = await setup();
    s.file.path = "Inbox/note.md";
    s.fm.reviewed = "9999-01-01";
    s.plugin.refreshReviewState();
    expect(s.internal.dueCounter.count).toBe(0);

    s.emitChanged();
    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.renameFolder(new FolderClass(), "Inbox");
    vi.advanceTimersByTime(500);

    expect(s.internal.statusBar.hidden).toBe(true);
    expect(s.internal.dueCounter.count).toBe(0);

    s.setCacheAvailable(true);
    s.resolved();

    expect(s.internal.statusBar.hidden).toBe(false);
    expect(s.internal.statusBar.day).toBe("9999-01-01");
    expect(s.internal.dueCounter.count).toBe(0);
  });

  it("restores the due counter when a pending renamed file is deleted", async () => {
    const s = await setup();
    s.file.path = "Inbox/note.md";
    s.fm.reviewed = "9999-01-01";
    s.plugin.refreshReviewState();

    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");
    s.deleteFile(s.file);

    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(false);
    expect(s.internal.dueCounter.count).toBe(0);
  });

  it("restores the due counter when a pending renamed folder is deleted", async () => {
    const s = await setup();
    s.file.path = "Inbox/note.md";
    s.fm.reviewed = "9999-01-01";
    s.plugin.refreshReviewState();

    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    const folder = new FolderClass();
    s.renameFolder(folder, "Inbox");
    s.deleteFolder(folder);

    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(false);
    expect(s.internal.dueCounter.count).toBe(0);
  });

  it("keeps a mark completion cache-driven while its note is pending a rename refresh", async () => {
    const s = await setup();
    const mark = s.internal.markReviewed(s.file);
    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");
    s.fm.reviewed = "9999-01-01";
    s.finish();
    await mark;

    expect(s.internal.statusBar.hidden).toBe(true);
    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(true);

    s.setCacheAvailable(true);
    s.resolved();

    expect(s.internal.statusBar.day).toBe("9999-01-01");
    expect(s.internal.dueCounter.pendingMetadataRefresh).toBe(false);
  });

  it("does not open a random note while rename metadata is pending", async () => {
    const s = await setup();
    s.setCacheAvailable(false);
    s.file.path = "Archive/note.md";
    s.rename("Inbox/note.md");

    await s.internal.openRandomDue();

    expect(s.openFile).not.toHaveBeenCalled();
  });
});
