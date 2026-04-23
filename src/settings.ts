import { PluginSettingTab } from 'obsidian';

export type TerminalPluginSettings = Record<string, never>;

export const DEFAULT_SETTINGS: TerminalPluginSettings = {};

export function mergeSettings(
  stored: Partial<TerminalPluginSettings> | null | undefined,
): TerminalPluginSettings {
  return Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
}

export class TerminalSettingTab extends PluginSettingTab {
  display(): void {
    this.containerEl.empty();
  }
}
