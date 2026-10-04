import { afterEach, describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
import { ReviewRenameCoordinator } from "../src/reviewRenameCoordinator";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup() {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const file = { path: "Archive/note.md", extension: "md" } as TFile;
  let available = false;
  const host = {
    getMarkdownFiles: () => [file],
    hasMetadata: () => available,
    invalidateFile: vi.fn(), invalidateAll: vi.fn(),
    setPending: vi.fn(), onReady: vi.fn(),
  };
  return { file, host, coordinator: new ReviewRenameCoordinator(host),
    ready: () => { available = true; } };
}

describe("rename metadata coordination", () => {
  it("slows prolonged missing-cache probes but recovers without a metadata event", async () => {
    const s = setup();
    const reads = vi.spyOn(s.host, "hasMetadata");
    s.coordinator.queue(s.file);
    await Promise.resolve();
    vi.advanceTimersByTime(2000);
    const before = reads.mock.calls.length;
    vi.advanceTimersByTime(10000);
    expect(reads.mock.calls.length - before).toBeLessThanOrEqual(10);
    expect(s.coordinator.isPending(s.file)).toBe(true);
    s.ready();
    vi.advanceTimersByTime(1000);
    expect(s.coordinator.isPending()).toBe(false);
    expect(s.host.onReady).toHaveBeenCalledOnce();
  });

  it("tracks unresolved folder members by identity after they move out, not new occupants", async () => {
    const s = setup();
    s.coordinator.queue(undefined, "Archive");
    s.file.path = "Elsewhere/note.md";
    const replacement = { path: "Archive/new.md", extension: "md" } as TFile;
    expect(s.coordinator.isPending(s.file)).toBe(true);
    expect(s.coordinator.isPending(replacement)).toBe(false);
    s.ready();
    await Promise.resolve();
    expect(s.coordinator.isPending()).toBe(false);
  });

  it("retains one file identity through repeated moves and refreshes only when metadata arrives", async () => {
    const s = setup();
    s.coordinator.queue(s.file);
    s.file.path = "Second/note.md";
    s.coordinator.queue(s.file);
    await Promise.resolve();
    vi.advanceTimersByTime(150);
    expect(s.coordinator.isPending(s.file)).toBe(true);
    expect(s.host.onReady).not.toHaveBeenCalled();
    s.host.invalidateFile.mockClear();
    s.ready();
    vi.advanceTimersByTime(50);
    expect(s.coordinator.isPending()).toBe(false);
    expect(s.host.invalidateFile).toHaveBeenCalledExactlyOnceWith(s.file);
    expect(s.host.onReady).toHaveBeenCalledOnce();
  });

  it("does not revive refresh work from a queued microtask after unload", async () => {
    const s = setup();
    s.coordinator.queue(s.file);
    s.coordinator.dispose();
    s.host.invalidateFile.mockClear();
    s.ready();
    await Promise.resolve();
    vi.advanceTimersByTime(500);
    expect(s.host.onReady).not.toHaveBeenCalled();
    expect(s.host.invalidateFile).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases each ready member of overlapping folder moves independently", async () => {
    const s = setup();
    const other = { path: "Archive/Sub/other.md", extension: "md" } as TFile;
    s.host.getMarkdownFiles = () => [s.file, other];
    s.host.hasMetadata = (file?: TFile) => file === other;
    s.coordinator.queue(undefined, "Archive");
    s.coordinator.queue(undefined, "Archive/Sub");
    await Promise.resolve();
    expect(s.coordinator.isPending(s.file)).toBe(true);
    expect(s.coordinator.isPending(other)).toBe(false);
    expect(s.host.onReady).toHaveBeenCalledOnce();
    s.file.path = "Elsewhere/note.md";
    s.coordinator.removeFolder("Archive");
    expect(s.coordinator.isPending(s.file)).toBe(true);
    s.coordinator.removeFile(s.file);
    expect(s.coordinator.isPending()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels delayed readiness probes on unload", async () => {
    const s = setup();
    s.coordinator.queue(undefined, "Archive");
    await Promise.resolve();
    vi.advanceTimersByTime(50);
    expect(s.coordinator.isPending(s.file)).toBe(true);
    s.coordinator.dispose();
    s.ready();
    vi.advanceTimersByTime(500);
    expect(s.host.onReady).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
