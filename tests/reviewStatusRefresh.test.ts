import { describe, expect, it } from "vitest";
import { shouldRefreshActiveReviewAfterRename } from "../src/reviewStatusRefresh";

describe("shouldRefreshActiveReviewAfterRename", () => {
  it("refreshes an active renamed note but not an unrelated note", () => {
    expect(shouldRefreshActiveReviewAfterRename("file", true)).toBe(true);
    expect(shouldRefreshActiveReviewAfterRename("file", false)).toBe(false);
  });

  it("refreshes only an active note moved with its renamed folder", () => {
    expect(
      shouldRefreshActiveReviewAfterRename(
        "folder",
        false,
        "Archive/note.md",
        "Archive"
      )
    ).toBe(true);
    expect(
      shouldRefreshActiveReviewAfterRename(
        "folder",
        false,
        "Inbox/note.md",
        "Archive"
      )
    ).toBe(false);
  });
});
