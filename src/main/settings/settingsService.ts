import { applySettingsPatch, type SettingsPatch, type ShortPipeConfig } from "@shared/config";
import { writeJsonFile } from "../storage/json";

export type SettingsServiceOptions = {
  configPath: string;
  initial: ShortPipeConfig;
};

/**
 * Owns the app-global `config.json` (model + style/output defaults). Holds the
 * config in memory so the project store can live-read the current defaults, and
 * persists every patch so changes survive a restart.
 */
export class SettingsService {
  private config: ShortPipeConfig;
  private readonly configPath: string;

  constructor(options: SettingsServiceOptions) {
    this.config = options.initial;
    this.configPath = options.configPath;
  }

  get(): ShortPipeConfig {
    return this.config;
  }

  async update(patch: SettingsPatch): Promise<ShortPipeConfig> {
    this.config = applySettingsPatch(this.config, patch);
    await writeJsonFile(this.configPath, this.config);
    return this.config;
  }
}
