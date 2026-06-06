import type { CaptionStyle, LayoutKind, Theme } from "./project";
import { CAPTION_STYLES, clampTargetDuration, LAYOUT_KINDS, THEMES } from "./project";

export type ShortPipeConfig = {
  version: 1;
  defaultModel: string;
  /**
   * Global default output folder for rendered shorts. When unset, each project
   * writes shorts to its own `output/` folder under the project directory.
   */
  defaultOutputDir?: string;
  /** Default vertical layout applied to agent proposals that omit one. */
  defaultLayout: LayoutKind;
  /** Default color polarity applied to agent proposals that omit one. */
  defaultTheme: Theme;
  /** Default caption style applied to agent proposals that omit one. */
  defaultCaptionStyle: CaptionStyle;
  /** Roughly how long each short should be, in seconds. Guides the agent's word range. */
  defaultTargetDurationSec: number;
};

export const DEFAULT_CODEX_MODEL = "openai-codex/gpt-5.5";

export function defaultShortPipeConfig(): ShortPipeConfig {
  return {
    version: 1,
    defaultModel: DEFAULT_CODEX_MODEL,
    defaultLayout: "center-square",
    defaultTheme: "dark",
    defaultCaptionStyle: "clean",
    defaultTargetDurationSec: 60,
  };
}

/** The subset of config the settings UI can change. */
export type SettingsPatch = Partial<
  Pick<
    ShortPipeConfig,
    | "defaultOutputDir"
    | "defaultLayout"
    | "defaultTheme"
    | "defaultCaptionStyle"
    | "defaultTargetDurationSec"
  >
>;

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeShortPipeConfig(value: unknown): ShortPipeConfig {
  const base = defaultShortPipeConfig();
  if (!value || typeof value !== "object") return base;
  const c = value as Record<string, unknown>;
  return {
    version: 1,
    defaultModel: normalizeString(c.defaultModel) ?? base.defaultModel,
    defaultOutputDir: normalizeString(c.defaultOutputDir),
    defaultLayout: LAYOUT_KINDS.includes(c.defaultLayout as LayoutKind)
      ? (c.defaultLayout as LayoutKind)
      : base.defaultLayout,
    defaultTheme: THEMES.includes(c.defaultTheme as Theme)
      ? (c.defaultTheme as Theme)
      : base.defaultTheme,
    defaultCaptionStyle: CAPTION_STYLES.includes(c.defaultCaptionStyle as CaptionStyle)
      ? (c.defaultCaptionStyle as CaptionStyle)
      : base.defaultCaptionStyle,
    defaultTargetDurationSec:
      typeof c.defaultTargetDurationSec === "number"
        ? clampTargetDuration(c.defaultTargetDurationSec)
        : base.defaultTargetDurationSec,
  };
}

/**
 * Merge a settings patch onto the current config and re-normalize. Passing an
 * empty string for `defaultOutputDir` clears it back to per-project output.
 */
export function applySettingsPatch(config: ShortPipeConfig, patch: SettingsPatch): ShortPipeConfig {
  return normalizeShortPipeConfig({ ...config, ...patch });
}
