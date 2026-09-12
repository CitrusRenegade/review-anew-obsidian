import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type {
  SettingControl,
  SettingDefinition,
  SettingDefinitionItem,
} from "obsidian";
import { parsePositiveDayCount } from "./interval";
import { normalizeFolderReviewRules } from "./folderRules";
import { isValidFrontmatterKey } from "./frontmatterKey";
import type ReviewPlugin from "./main";

export interface FolderInterval {
  folder: string;
  days: number;
}

export type FolderFilterMode = "excluded" | "included";

export interface ReviewSettings {
  renameNoticeHandled?: boolean;
  globalIntervalDays: number;
  folderFilterMode: FolderFilterMode;
  excludedFolders: string[];
  includedFolders: string[];
  folderIntervals: FolderInterval[];
  showReviewStatus: boolean;
  showDueCounter: boolean;
  showRibbonIcon: boolean;
  reviewDetailsFontSizeAdjustment: number;
  frontmatterIntervalKey: string;
  frontmatterReviewedKey: string;
}

export const DEFAULT_SETTINGS: ReviewSettings = {
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

type ReviewSettingDefinition =
  | {
      label: string;
      description?: string | DocumentFragment;
      aliases?: string[];
      control: SettingControl<keyof ReviewSettings>;
      render?: undefined;
    }
  | {
      label: string;
      description?: string | DocumentFragment;
      aliases?: string[];
      render: (setting: Setting) => void;
      control?: undefined;
    };

interface ReviewSettingSection {
  heading?: string;
  items: ReviewSettingDefinition[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPositiveDayCount(value: unknown, fallback: number): number {
  return parsePositiveDayCount(value) ?? fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asReviewDetailsFontSizeAdjustment(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return DEFAULT_SETTINGS.reviewDetailsFontSizeAdjustment;
  }
  return Math.max(-2, Math.min(2, value));
}

function asNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function asFrontmatterKey(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return isValidFrontmatterKey(trimmed) ? trimmed : fallback;
}

function asFolderFilterMode(value: unknown): FolderFilterMode {
  return value === "included" || value === "excluded"
    ? value
    : DEFAULT_SETTINGS.folderFilterMode;
}

function validatePositiveDayCount(value: number): string | void {
  return Number.isSafeInteger(value) && value > 0
    ? undefined
    : "Enter a whole number of days.";
}

function validateReviewDetailsFontSizeAdjustment(value: number): string | void {
  return Number.isInteger(value) && value >= -2 && value <= 2
    ? undefined
    : "Choose a whole-number font step from -2 to 2.";
}

function validateFrontmatterKey(value: string): string | void {
  return isValidFrontmatterKey(value.trim())
    ? undefined
    : "Enter a simple YAML field name.";
}

function asPathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => normalizePath(item));
}

function asFolderIntervals(value: unknown): FolderInterval[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const folder = asNonEmptyString(item.folder, "");
    const days = parsePositiveDayCount(item.days);
    if (!folder || days === null) return [];
    return [{ folder: normalizePath(folder), days }];
  });
}

export function loadReviewSettings(data: unknown): ReviewSettings {
  const raw = isRecord(data) ? data : {};
  const settings = {
    renameNoticeHandled: raw.renameNoticeHandled === true,
    globalIntervalDays: asPositiveDayCount(
      raw.globalIntervalDays,
      DEFAULT_SETTINGS.globalIntervalDays
    ),
    folderFilterMode: asFolderFilterMode(raw.folderFilterMode),
    excludedFolders: asPathList(raw.excludedFolders),
    includedFolders: asPathList(raw.includedFolders),
    folderIntervals: asFolderIntervals(raw.folderIntervals),
    showReviewStatus: asBoolean(
      raw.showReviewStatus,
      DEFAULT_SETTINGS.showReviewStatus
    ),
    showDueCounter: asBoolean(
      raw.showDueCounter,
      DEFAULT_SETTINGS.showDueCounter
    ),
    showRibbonIcon: asBoolean(
      raw.showRibbonIcon,
      DEFAULT_SETTINGS.showRibbonIcon
    ),
    reviewDetailsFontSizeAdjustment: asReviewDetailsFontSizeAdjustment(
      raw.reviewDetailsFontSizeAdjustment
    ),
    frontmatterIntervalKey: asFrontmatterKey(
      raw.frontmatterIntervalKey,
      DEFAULT_SETTINGS.frontmatterIntervalKey
    ),
    frontmatterReviewedKey: asFrontmatterKey(
      raw.frontmatterReviewedKey,
      DEFAULT_SETTINGS.frontmatterReviewedKey
    ),
  };
  normalizeFolderReviewRules(settings);
  return settings;
}

export class ReviewSettingTab extends PluginSettingTab {
  plugin: ReviewPlugin;
  private refreshTimeout: number | null = null;
  private saveTimeout: number | null = null;

  constructor(app: App, plugin: ReviewPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private refreshReviewState(): void {
    if (this.refreshTimeout !== null) {
      window.clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    this.plugin.refreshReviewState();
  }

  private scheduleReviewStateRefresh(): void {
    if (this.refreshTimeout !== null) {
      window.clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = window.setTimeout(() => {
      this.refreshTimeout = null;
      this.plugin.refreshReviewState();
    }, 500);
  }

  private async saveSettingsNow(): Promise<void> {
    try {
      await this.plugin.saveSettings();
    } catch (e) {
      console.error("Failed to save review settings:", e);
    }
  }

  private scheduleSettingsSave(): void {
    if (this.saveTimeout !== null) {
      window.clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      this.saveTimeout = null;
      void this.saveSettingsNow();
    }, 500);
  }

  dispose(): void {
    if (this.refreshTimeout !== null) {
      window.clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    if (this.saveTimeout !== null) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
      void this.saveSettingsNow();
    }
  }

  refresh(): void {
    this.update();
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof ReviewSettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings;

    if (key === "globalIntervalDays" && typeof value === "number") {
      if (validatePositiveDayCount(value) !== undefined) return;
      settings.globalIntervalDays = value;
    } else if (
      key === "reviewDetailsFontSizeAdjustment" &&
      typeof value === "number"
    ) {
      if (validateReviewDetailsFontSizeAdjustment(value) !== undefined) return;
      settings.reviewDetailsFontSizeAdjustment = value;
    } else if (
      (key === "showReviewStatus" || key === "showDueCounter" || key === "showRibbonIcon") &&
      typeof value === "boolean"
    ) {
      settings[key] = value;
    } else if (
      (key === "frontmatterIntervalKey" || key === "frontmatterReviewedKey") &&
      typeof value === "string"
    ) {
      const frontmatterKey = value.trim();
      if (validateFrontmatterKey(frontmatterKey) !== undefined) return;
      settings[key] = frontmatterKey;
    } else {
      return;
    }

    await this.plugin.saveSettings();
    if (key === "showRibbonIcon") {
      this.plugin.updateRibbonIcon();
    } else {
      this.refreshReviewState();
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const toDefinition = (
      item: ReviewSettingDefinition
    ): SettingDefinition<keyof ReviewSettings> => {
      const base = {
        name: item.label,
        desc: item.description,
        aliases: item.aliases,
      };
      return item.control !== undefined
        ? { ...base, control: item.control }
        : { ...base, render: item.render };
    };
    const definitions: SettingDefinitionItem[] = [];
    for (const section of this.getSettingSections()) {
      if (section.heading) {
        definitions.push({
          type: "group",
          heading: section.heading,
          items: section.items.map(toDefinition),
        });
      } else {
        definitions.push(...section.items.map(toDefinition));
      }
    }
    return definitions;
  }

  private getSettingSections(): ReviewSettingSection[] {
    const isIncluded = this.plugin.settings.folderFilterMode === "included";

    return [
      {
        items: [
          {
            label: "Global review interval",
            description:
              "Default number of days for reviewed notes without a per-note or folder interval.",
            aliases: ["days", "due", "schedule"],
            control: {
              type: "number",
              key: "globalIntervalDays",
              min: 1,
              step: 1,
              placeholder: "45",
              validate: validatePositiveDayCount,
            },
          },
          {
            label: isIncluded ? "Mode: Include" : "Mode: Exclude",
            aliases: ["mode", "include", "exclude"],
            description: createFragment((el) => {
              el.appendText("OFF — listed folders are excluded by default.");
              el.createEl("br");
              el.appendText(
                "ON — only listed folders are reviewed by default. Per-note intervals can still include individual notes."
              );
            }),
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle
                  .setValue(this.plugin.settings.folderFilterMode === "included")
                  .onChange(async (value) => {
                    this.plugin.settings.folderFilterMode = value
                      ? "included"
                      : "excluded";
                    await this.plugin.saveSettings();
                    this.refreshReviewState();
                    this.refresh();
                  })
              );
            },
          },
          {
            label: isIncluded
              ? "Global included folders"
              : "Global excluded folders",
            description:
              "One path per line, relative to vault root. Per-note intervals override this list.",
            render: (setting) => {
              setting.addTextArea((text) => {
                const currentList = isIncluded
                  ? this.plugin.settings.includedFolders
                  : this.plugin.settings.excludedFolders;
                text
                  .setPlaceholder(
                    isIncluded
                      ? "Notes\nJournal"
                      : "Templates\nAttachments\nArchive"
                  )
                  .setValue(currentList.join("\n"))
                  .onChange((value) => {
                    const parsed = value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((s) => normalizePath(s));
                    if (isIncluded) {
                      this.plugin.settings.includedFolders = parsed;
                    } else {
                      this.plugin.settings.excludedFolders = parsed;
                    }
                    normalizeFolderReviewRules(this.plugin.settings);
                    this.scheduleSettingsSave();
                    this.scheduleReviewStateRefresh();
                  });
                text.inputEl.rows = 5;
                text.inputEl.addClass("review-settings-textarea");
              });
            },
          },
          {
            label: "Folder-specific intervals",
            description:
              'Custom review intervals per folder. Format: "folder/path,days" — one rule per line. ' +
              "Uses longest matching path when rules overlap. Example: Daily Notes,90",
            render: (setting) => {
              setting.addTextArea((text) => {
                text
                  .setPlaceholder("Notes,90\nprojects/portfolio,30")
                  .setValue(
                    this.plugin.settings.folderIntervals
                      .map((r) => `${r.folder},${r.days}`)
                      .join("\n")
                  )
                  .onChange((value) => {
                    this.plugin.settings.folderIntervals = value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .flatMap((line) => {
                        const idx = line.lastIndexOf(",");
                        if (idx < 1) return [];
                        const folder = line.slice(0, idx).trim();
                        const days = parsePositiveDayCount(line.slice(idx + 1));
                        if (!folder || days === null) return [];
                        return [{ folder: normalizePath(folder), days }];
                      });
                    normalizeFolderReviewRules(this.plugin.settings);
                    this.scheduleSettingsSave();
                    this.scheduleReviewStateRefresh();
                  });
                text.inputEl.rows = 5;
                text.inputEl.addClass("review-settings-textarea");
              });
            },
          },
        ],
      },
      {
        heading: "UI",
        items: [
          {
            label: "Review status in status bar",
            description:
              "Shows per-file review indicator (last review date / due / not reviewed) for the active note.",
            aliases: ["status", "indicator"],
            control: {
              type: "toggle",
              key: "showReviewStatus",
            },
          },
          {
            label: "Due counter in status bar",
            description:
              "Shows total count of notes due for review across vault, next to the current-note indicator.",
            aliases: ["due", "pending", "count"],
            control: {
              type: "toggle",
              key: "showDueCounter",
            },
          },
          {
            label: "Ribbon icon",
            description:
              "Adds a left ribbon button that opens a random note due for review.",
            aliases: ["ribbon", "button"],
            control: {
              type: "toggle",
              key: "showRibbonIcon",
            },
          },
        ],
      },
      {
        heading: "Advanced",
        items: [
          {
            label: "Frontmatter interval key",
            description:
              'Frontmatter field for per-note interval override. Set to a number (days) to include the note, or "never" to exclude it.',
            aliases: ["YAML", "metadata", "review_interval"],
            control: {
              type: "text",
              key: "frontmatterIntervalKey",
              validate: validateFrontmatterKey,
            },
          },
          {
            label: "Frontmatter reviewed key",
            description:
              "Frontmatter field where the last review date is stored.",
            aliases: ["YAML", "metadata", "reviewed"],
            control: {
              type: "text",
              key: "frontmatterReviewedKey",
              validate: validateFrontmatterKey,
            },
          },
        ],
      },
    ];
  }
}
