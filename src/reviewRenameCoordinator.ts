import type { TFile } from "obsidian";
import { isWithinFolder } from "./folderRules";

interface RenameRefreshHost {
  getMarkdownFiles(): TFile[];
  hasMetadata(file: TFile): boolean;
  invalidateFile(file: TFile): void;
  setPending(pending: boolean): void;
  onReady(): void;
}

/** Waits for relocated metadata before allowing derived review state to refresh. */
export class ReviewRenameCoordinator {
  private pendingFiles = new Set<TFile>();
  private pendingSince: number | null = null;
  private refreshQueued = false;
  private refreshTimeout: number | null = null;
  private disposed = false;

  constructor(private readonly host: RenameRefreshHost) {}

  isPending(file?: TFile | null): boolean {
    return file ? this.pendingFiles.has(file) : this.pendingFiles.size > 0;
  }

  queue(file?: TFile, folderPath?: string): void {
    if (this.disposed) return;
    const affected = file ? [file] : folderPath
      ? this.host.getMarkdownFiles().filter((entry) => isWithinFolder(entry.path, folderPath))
      : [];
    for (const entry of affected) {
      this.pendingFiles.add(entry);
      this.host.invalidateFile(entry);
    }
    if (this.isPending() && this.pendingSince === null) this.pendingSince = Date.now();
    this.host.setPending(this.isPending());
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      this.refresh();
    });
    // Cache listeners can queue their own microtasks during the rename event.
    this.scheduleProbe(0);
  }

  refresh(): void {
    if (this.disposed || !this.isPending()) return;
    let changed = false;
    for (const file of this.pendingFiles) {
      if (file.extension !== "md") {
        this.pendingFiles.delete(file);
        changed = true;
        continue;
      }
      if (!this.host.hasMetadata(file)) continue;
      this.pendingFiles.delete(file);
      this.host.invalidateFile(file);
      changed = true;
    }
    if (this.isPending()) {
      // Never turn absent metadata into empty frontmatter. After the initial
      // rekey window, retain a slower recovery path even without host events.
      this.scheduleProbe(Date.now() - (this.pendingSince ?? Date.now()) >= 1000 ? 1000 : 50);
      if (changed) {
        this.host.setPending(true);
        this.host.onReady();
      }
      return;
    }
    this.pendingSince = null;
    if (this.refreshTimeout !== null) window.clearTimeout(this.refreshTimeout);
    this.refreshTimeout = null;
    this.host.setPending(false);
    this.host.onReady();
  }

  removeFile(file: TFile): void {
    this.pendingFiles.delete(file);
    this.finishRemoval();
  }

  removeFolder(path: string): void {
    for (const file of this.pendingFiles) {
      if (isWithinFolder(file.path, path)) this.pendingFiles.delete(file);
    }
    this.finishRemoval();
  }

  dispose(): void {
    this.disposed = true;
    if (this.refreshTimeout !== null) window.clearTimeout(this.refreshTimeout);
    this.refreshTimeout = null;
    this.pendingFiles.clear();
    this.pendingSince = null;
  }

  private finishRemoval(): void {
    if (this.isPending()) return;
    this.pendingSince = null;
    if (this.refreshTimeout !== null) window.clearTimeout(this.refreshTimeout);
    this.refreshTimeout = null;
  }

  private scheduleProbe(delay: number): void {
    if (this.refreshTimeout !== null || this.disposed) return;
    this.refreshTimeout = window.setTimeout(() => {
      this.refreshTimeout = null;
      this.refresh();
    }, delay);
  }
}
