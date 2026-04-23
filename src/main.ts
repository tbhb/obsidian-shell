import { Plugin } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type TerminalPluginSettings,
  TerminalSettingTab,
} from './settings';
import './styles.css';

export default class TerminalPlugin extends Plugin {
  settings: TerminalPluginSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new TerminalSettingTab(this.app, this));
  }

  onunload(): void {}

  async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<TerminalPluginSettings> | null;
    this.settings = mergeSettings(stored);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
