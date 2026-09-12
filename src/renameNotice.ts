export const RENAME_NOTICE_TITLE = "Say hello to Review Anew!";
export const RENAME_NOTICE_BODY = "Review Simple is now Review Anew. Same plugin, same experience — everything else stays the same. Thanks for staying with us!";

export async function processRenameNotice(
  data: unknown,
  saveHandled: () => Promise<void>,
  show: () => void
): Promise<void> {
  const raw = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown> : {};
  if (raw.renameNoticeHandled === true) return;
  const existing = typeof raw.globalIntervalDays === "number" &&
    Number.isSafeInteger(raw.globalIntervalDays) && raw.globalIntervalDays > 0;
  // Persist first: a failed write must not cause repeated announcements.
  await saveHandled();
  if (existing) show();
}
