import {
  Menu,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
  normalizePath,
} from "obsidian";
import {
  ReviewSettings,
  ReviewSettingTab,
  loadReviewSettings,
} from "./settings";
import { migrateRenamedFolderReviewRules } from "./folderRules";
import { DueCounterStatusBar, ReviewStatusBar } from "./statusbar";
import { getEffectiveInterval, pickRandomDue } from "./review";
import { setStringFrontmatter } from "./frontmatter";
import { formatLocalDate } from "./dates";
import { ReviewMarkCoordinator } from "./reviewMarkCoordinator";
import { shouldRefreshActiveReviewAfterRename } from "./reviewStatusRefresh";
import { processRenameNotice, RENAME_NOTICE_TITLE, RENAME_NOTICE_BODY } from "./renameNotice";

export default class ReviewPlugin extends Plugin {
  settings!: ReviewSettings;
  private statusBar: ReviewStatusBar | null = null;
  private dueCounter: DueCounterStatusBar | null = null;
  private ribbonIconEl: HTMLElement | null = null;
  private settingTab: ReviewSettingTab | null = null;
  private dueCounterRefreshTimeout: number | null = null;
  private localDayRefreshTimeout: number | null = null;
  private currentLocalDay = formatLocalDate(new Date());
  private reviewMarkCoordinator = new ReviewMarkCoordinator<TFile, string>();
  private pendingRenamedFiles = new Set<TFile>();
  private pendingRenamedFolders = new Set<string>();
  private pendingRenamedFolderFiles = new Map<string, Set<TFile>>();
  private renameRefreshQueued = false;
  private renameRefreshTimeout: number | null = null;

  private isPendingRename(file?: TFile | null): boolean {
    if (this.pendingRenamedFiles.size > 0 && !file) return true;
    if (this.pendingRenamedFolders.size > 0 && !file) return true;
    if (!file) return false;
    if (this.pendingRenamedFiles.has(file)) return true;

    for (const folderPath of this.pendingRenamedFolders) {
      if (file.path.startsWith(`${folderPath}/`)) return true;
    }
    return false;
  }

  private updateReviewStatus(
    file: TFile | null,
    preserveReviewDetails = false
  ): void {
    if (file && this.isPendingRename(file)) {
      this.statusBar?.update(null, preserveReviewDetails);
      return;
    }

    this.statusBar?.update(file, preserveReviewDetails);
  }

  private scheduleRenameRefreshProbe(delay: number): void {
    if (this.renameRefreshTimeout !== null) return;

    this.renameRefreshTimeout = window.setTimeout(() => {
      this.renameRefreshTimeout = null;
      this.refreshPendingRenameState();
    }, delay);
  }

  private queueRenameRefresh(file?: TFile, folderPath?: string): void {
    if (file) this.pendingRenamedFiles.add(file);
    if (folderPath) {
      this.pendingRenamedFolders.add(folderPath);
      this.pendingRenamedFolderFiles.set(
        folderPath,
        new Set(
          this.app.vault.getMarkdownFiles()
            .filter((file) => file.path.startsWith(`${folderPath}/`))
        )
      );
    }
    this.dueCounter?.setMetadataRefreshPending(this.isPendingRename());
    if (this.renameRefreshQueued) return;

    this.renameRefreshQueued = true;
    queueMicrotask(() => {
      this.renameRefreshQueued = false;
      this.refreshPendingRenameState();
    });
    // A cache listener can itself queue a microtask during the rename event.
    // Probe once after that event-loop turn as well.
    this.scheduleRenameRefreshProbe(0);
  }

  private refreshPendingRenameState(): void {
    if (!this.isPendingRename()) return;

    for (const file of this.pendingRenamedFiles) {
      // Vault rename and MetadataCache rekeying use separate listeners. Keep
      if (!this.app.metadataCache.getFileCache(file)) continue;

      this.pendingRenamedFiles.delete(file);
      this.dueCounter?.invalidateFile(file);
    }

    for (const [folderPath, files] of this.pendingRenamedFolderFiles) {
      if ([...files].some((file) => !this.app.metadataCache.getFileCache(file))) {
        continue;
      }

      this.pendingRenamedFolders.delete(folderPath);
      this.pendingRenamedFolderFiles.delete(folderPath);
      this.dueCounter?.invalidateAll();
    }

    if (this.isPendingRename()) {
      // There is no per-file cache-ready event for renames. Re-check only
      // tracked renamed entries until MetadataCache provides their snapshot.
      this.scheduleRenameRefreshProbe(50);
      return;
    }

    this.dueCounter?.setMetadataRefreshPending(false);
    const activeFile = this.app.workspace.getActiveFile();
    this.updateReviewStatus(
      activeFile,
      activeFile
        ? this.reviewMarkCoordinator.shouldPreserveDetails(
          activeFile,
          this.settings.frontmatterReviewedKey
        )
        : false
    );
    this.refreshDueCounter();
  }

  private completeRenameRefreshAfterRemoval(): void {
    if (this.isPendingRename()) return;

    this.dueCounter?.setMetadataRefreshPending(false);
    const activeFile = this.app.workspace.getActiveFile();
    const currentActiveFile = activeFile &&
      this.app.vault.getAbstractFileByPath(activeFile.path) === activeFile
      ? activeFile
      : null;
    this.updateReviewStatus(currentActiveFile);
    this.refreshDueCounter();
  }

  private async openRandomDue(): Promise<void> {
    if (this.isPendingRename()) return;

    const file = pickRandomDue(
      this.app,
      this.settings,
      Math.random
    );
    if (!file) {
      new Notice("No notes due for review");
      return;
    }
    try {
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (e) {
      console.error("Failed to open random due note:", e);
      new Notice("Failed to open random note for review");
      this.dueCounter?.invalidateFile(file);
      this.scheduleDueCounterRefresh();
    }
  }

  updateAll(preserveReviewDetails = false): void {
    this.updateReviewStatus(
      this.app.workspace.getActiveFile(),
      preserveReviewDetails
    );
    this.refreshDueCounter();
  }

  refreshReviewState(): void {
    this.dueCounter?.invalidateAll();
    this.updateAll();
  }

  private refreshDueCounter(): void {
    if (this.dueCounterRefreshTimeout !== null) {
      window.clearTimeout(this.dueCounterRefreshTimeout);
      this.dueCounterRefreshTimeout = null;
    }
    if (this.isPendingRename()) return;
    this.dueCounter?.update();
  }

  private scheduleDueCounterRefresh(): void {
    if (this.dueCounterRefreshTimeout !== null) {
      window.clearTimeout(this.dueCounterRefreshTimeout);
      this.dueCounterRefreshTimeout = null;
    }
    if (!this.settings.showDueCounter) {
      return;
    }
    this.dueCounterRefreshTimeout = window.setTimeout(() => {
      this.dueCounterRefreshTimeout = null;
      this.refreshDueCounter();
    }, 500);
  }

  private scheduleLocalDayRefresh(): void {
    if (this.localDayRefreshTimeout !== null) {
      window.clearTimeout(this.localDayRefreshTimeout);
      this.localDayRefreshTimeout = null;
    }

    const now = new Date();
    const nextLocalDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1
    );
    const delay = Math.max(1000, nextLocalDay.getTime() - now.getTime());

    this.localDayRefreshTimeout = window.setTimeout(() => {
      this.localDayRefreshTimeout = null;
      this.currentLocalDay = formatLocalDate(new Date());
      this.refreshReviewState();
      this.scheduleLocalDayRefresh();
    }, delay);
  }

  private refreshIfLocalDayChanged(): void {
    const today = formatLocalDate(new Date());
    if (today === this.currentLocalDay) return;

    this.currentLocalDay = today;
    this.refreshReviewState();
    this.scheduleLocalDayRefresh();
  }

  private async handleVaultRename(
    file: TAbstractFile,
    oldPath: string
  ): Promise<void> {
    if (file instanceof TFile) {
      if (file.extension !== "md") {
        if (oldPath.toLowerCase().endsWith(".md")) {
          this.dueCounter?.removeFile(oldPath);
          if (this.app.workspace.getActiveFile() === file) {
            this.updateReviewStatus(file);
          }
          this.scheduleDueCounterRefresh();
        }
        return;
      }

      this.dueCounter?.renameFile(file, oldPath);
      this.queueRenameRefresh(file);
      if (this.app.workspace.getActiveFile() === file) {
        this.updateReviewStatus(file);
      }
      return;
    }

    this.dueCounter?.invalidateAll();

    if (!(file instanceof TFolder)) {
      this.scheduleDueCounterRefresh();
      return;
    }

    this.queueRenameRefresh(undefined, file.path);
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && shouldRefreshActiveReviewAfterRename(
      "folder", false, activeFile.path, file.path
    )) {
      this.updateReviewStatus(activeFile);
    }

    const changed = migrateRenamedFolderReviewRules(
      this.settings,
      oldPath,
      file.path
    );
    if (changed) {
      await this.saveSettings();
      this.settingTab?.refresh();
    }

  }

  updateRibbonIcon(): void {
    if (this.settings.showRibbonIcon && !this.ribbonIconEl) {
      this.ribbonIconEl = this.addRibbonIcon(
        "clipboard-clock",
        "Open random note for review",
        () => {
          void this.openRandomDue();
        }
      );
    } else if (!this.settings.showRibbonIcon && this.ribbonIconEl) {
      this.ribbonIconEl.remove();
      this.ribbonIconEl = null;
    }
  }

  private markReviewed(
    file: TFile,
    preserveReviewDetails = false
  ): Promise<boolean> {
    if (!preserveReviewDetails) this.statusBar?.closeDetails(false);

    const reviewedKey = this.settings.frontmatterReviewedKey;
    return this.reviewMarkCoordinator.run(
      file,
      reviewedKey,
      preserveReviewDetails,
      () => this.performMarkReviewed(file, reviewedKey)
    );
  }

  private async performMarkReviewed(
    file: TFile,
    reviewedKey: string
  ): Promise<boolean> {
    const today = formatLocalDate(new Date());
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        setStringFrontmatter(fm, reviewedKey, today);
      });
    } catch (e) {
      console.error("Failed to mark as reviewed:", e);
      new Notice("Failed to mark note as reviewed");
      return false;
    }

    try {
      const resolvedFile = this.app.vault.getAbstractFileByPath(file.path);
      const currentFile = resolvedFile instanceof TFile ? resolvedFile : null;
      new Notice("Marked as reviewed");
      // A completed write is not a metadata snapshot. Re-read the current
      // cache now; a later metadata event will invalidate it again if needed.
      // Never force a date or due=false: a newer external edit may already exist.
      if (currentFile !== file) this.dueCounter?.removeFile(file);
      if (currentFile) this.dueCounter?.invalidateFile(currentFile);
      this.updateAll(
        this.reviewMarkCoordinator.shouldPreserveDetails(file, reviewedKey)
      );
    } catch (e) {
      console.error("Marked as reviewed but failed to refresh review state:", e);
    }
    return true;
  }

  private addFileMenuItems(menu: Menu, file: TAbstractFile): void {
    if (!(file instanceof TFolder)) return;
    if (this.settings.folderFilterMode !== "excluded") return;

    const folderPath = normalizePath(file.path);
    if (!folderPath || this.settings.excludedFolders.includes(folderPath)) {
      return;
    }

    menu.addItem((item) => {
      item
        .setTitle("Exclude folder from review")
        .setIcon("folder-x")
        .onClick(() => {
          void this.excludeFolderFromReview(folderPath);
        });
    });
  }

  private async excludeFolderFromReview(folderPath: string): Promise<void> {
    if (this.settings.folderFilterMode !== "excluded") return;
    if (this.settings.excludedFolders.includes(folderPath)) return;

    this.settings.excludedFolders = [...this.settings.excludedFolders, folderPath];
    await this.saveSettings();
    this.refreshReviewState();
    new Notice("Folder excluded from review");
  }

  async onload(): Promise<void> {
    const startupData: unknown = await this.loadData();
    this.settings = loadReviewSettings(startupData);
    let unloaded = false;
    this.register(() => { unloaded = true; });

    this.settingTab = new ReviewSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.register(() => this.settingTab?.dispose());
    this.updateRibbonIcon();

    const statusBarEl = this.addStatusBarItem();
    this.register(() => statusBarEl.remove());
    this.statusBar = new ReviewStatusBar(
      statusBarEl,
      this.app,
      () => this.settings,
      (file) => this.markReviewed(file, true)
    );
    this.register(() => this.statusBar?.dispose());

    const counterEl = this.addStatusBarItem();
    this.register(() => counterEl.remove());
    this.dueCounter = new DueCounterStatusBar(
      counterEl,
      this.app,
      () => this.settings,
      () => {
        void this.openRandomDue();
      }
    );

    this.addCommand({
      id: "open-random",
      name: "Open random note for review",
      callback: () => {
        void this.openRandomDue();
      },
    });

    this.addCommand({
      id: "mark-current",
      name: "Mark current note as reviewed",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (getEffectiveInterval(file, this.app, this.settings) === null) {
          return false;
        }
        if (!checking) {
          void this.markReviewed(file);
        }
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.updateReviewStatus(this.app.workspace.getActiveFile());
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        this.updateReviewStatus(file);
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        this.addFileMenuItems(menu, file);
      })
    );

    this.registerEvent(
      this.app.metadataCache.on("changed", (file: TFile) => {
        const active = this.app.workspace.getActiveFile();
        if (active === file) {
          this.updateReviewStatus(file,
            this.reviewMarkCoordinator.shouldPreserveDetails(
              file, this.settings.frontmatterReviewedKey
            )
          );
        }
        this.dueCounter?.invalidateFile(file);
        this.scheduleDueCounterRefresh();
        this.refreshPendingRenameState();
      })
    );

    this.registerEvent(
      this.app.metadataCache.on("resolved", () => {
        this.refreshPendingRenameState();
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          this.dueCounter?.invalidateFile(file);
          this.scheduleDueCounterRefresh();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        const hadPendingRename = this.isPendingRename();
        if (file instanceof TFile) {
          this.pendingRenamedFiles.delete(file);
          for (const [folderPath, files] of this.pendingRenamedFolderFiles) {
            files.delete(file);
            if (files.size === 0) {
              this.pendingRenamedFolders.delete(folderPath);
              this.pendingRenamedFolderFiles.delete(folderPath);
            }
          }
          this.dueCounter?.removeFile(file);
        } else {
          if (file instanceof TFolder) {
            for (const folderPath of this.pendingRenamedFolders) {
              if (
                folderPath === file.path ||
                folderPath.startsWith(`${file.path}/`)
              ) {
                this.pendingRenamedFolders.delete(folderPath);
                this.pendingRenamedFolderFiles.delete(folderPath);
              }
            }
          }
          this.dueCounter?.invalidateAll();
        }
        if (hadPendingRename) this.completeRenameRefreshAfterRemoval();
        this.scheduleDueCounterRefresh();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void this.handleVaultRename(file, oldPath);
      })
    );

    this.register(() => {
      if (this.dueCounterRefreshTimeout !== null) {
        window.clearTimeout(this.dueCounterRefreshTimeout);
        this.dueCounterRefreshTimeout = null;
      }
      if (this.localDayRefreshTimeout !== null) {
        window.clearTimeout(this.localDayRefreshTimeout);
        this.localDayRefreshTimeout = null;
      }
      if (this.renameRefreshTimeout !== null) {
        window.clearTimeout(this.renameRefreshTimeout);
        this.renameRefreshTimeout = null;
      }
      this.pendingRenamedFiles.clear();
      this.pendingRenamedFolders.clear();
      this.pendingRenamedFolderFiles.clear();
    });

    this.registerDomEvent(activeWindow, "focus", () =>
      this.refreshIfLocalDayChanged()
    );

    this.scheduleLocalDayRefresh();
    this.app.workspace.onLayoutReady(() => this.updateAll());
    this.app.workspace.onLayoutReady(() => {
      if (unloaded) return;
      void processRenameNotice(startupData, async () => {
        this.settings.renameNoticeHandled = true;
        try {
          await this.saveSettings();
        } catch (error) {
          this.settings.renameNoticeHandled = false;
          throw error;
        }
      }, () => {
        if (unloaded) return;
        const message = createFragment();
        message.createEl("strong", { text: RENAME_NOTICE_TITLE });
        message.createEl("br");
        message.appendText(RENAME_NOTICE_BODY);
        new Notice(message, 20000);
      }).catch((error: unknown) => {
        console.error("Failed to save rename announcement state:", error);
      });
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = loadReviewSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
    this.updateRibbonIcon();
    this.refreshReviewState();
    this.settingTab?.refresh();
  }
}
