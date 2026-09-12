import { expect, it, vi } from "vitest";
import { processRenameNotice } from "../src/renameNotice";

it("shows once across persisted reloads for existing settings", async () => {
  let data: unknown = { globalIntervalDays: 45 };
  const show = vi.fn();
  const save = vi.fn(async () => { data = { globalIntervalDays: 45, renameNoticeHandled: true }; });
  await processRenameNotice(data, save, show);
  await processRenameNotice(data, save, show);
  expect(show).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
});

it.each([null, undefined, {}, [], { unrelated: true }])("silently handles fresh or unrecognized data: %j", async (data) => {
  const show = vi.fn();
  const save = vi.fn(async () => {});
  await processRenameNotice(data, save, show);
  expect(save).toHaveBeenCalledTimes(1);
  expect(show).not.toHaveBeenCalled();
  await processRenameNotice({ globalIntervalDays: 45, renameNoticeHandled: true }, save, show);
  expect(show).not.toHaveBeenCalled();
});

it("does not show if the durable marker cannot be saved", async () => {
  const show = vi.fn();
  await expect(processRenameNotice({ globalIntervalDays: 45 }, async () => { throw new Error("disk"); }, show)).rejects.toThrow("disk");
  expect(show).not.toHaveBeenCalled();
});
