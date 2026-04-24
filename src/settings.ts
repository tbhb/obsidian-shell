import { type App, PluginSettingTab, Setting } from 'obsidian';
import type ShellPlugin from './main';

export type CwdStrategy = 'vault-root' | 'note-dir' | 'fixed-path';
export type CursorStyle = 'block' | 'bar' | 'underline';

export interface ShellPluginSettings {
  shell: {
    path: string;
    args: string[];
  };
  cwd: {
    strategy: CwdStrategy;
    fixedPath: string;
  };
  appearance: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    cursorStyle: CursorStyle;
    cursorBlink: boolean;
    followObsidianTheme: boolean;
  };
  behavior: {
    scrollback: number;
    copyOnSelection: boolean;
  };
}

export const DEFAULT_SETTINGS: ShellPluginSettings = {
  shell: {
    path: '',
    args: ['-l'],
  },
  cwd: {
    strategy: 'vault-root',
    fixedPath: '',
  },
  appearance: {
    fontFamily: '',
    fontSize: 13,
    lineHeight: 1.2,
    cursorStyle: 'block',
    cursorBlink: true,
    followObsidianTheme: true,
  },
  behavior: {
    scrollback: 2000,
    copyOnSelection: false,
  },
};

type PartialSettings = {
  shell?: Partial<ShellPluginSettings['shell']>;
  cwd?: Partial<ShellPluginSettings['cwd']>;
  appearance?: Partial<ShellPluginSettings['appearance']>;
  behavior?: Partial<ShellPluginSettings['behavior']>;
};

export function mergeSettings(stored: PartialSettings | null | undefined): ShellPluginSettings {
  const s = stored ?? {};
  return {
    shell: { ...DEFAULT_SETTINGS.shell, ...s.shell },
    cwd: { ...DEFAULT_SETTINGS.cwd, ...s.cwd },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...s.appearance },
    behavior: { ...DEFAULT_SETTINGS.behavior, ...s.behavior },
  };
}

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;
const LINE_HEIGHT_MIN = 1.0;
const LINE_HEIGHT_MAX = 2.0;
const LINE_HEIGHT_STEP = 0.05;
const SCROLLBACK_MIN = 500;
const SCROLLBACK_MAX = 20000;
const SCROLLBACK_STEP = 500;

const CUSTOM_FONT_SENTINEL = '__custom__';

const MONOSPACE_FONT_CANDIDATES: readonly string[] = [
  'Menlo',
  'Monaco',
  'SF Mono',
  'Courier New',
  'Consolas',
  'Cascadia Code',
  'Cascadia Mono',
  'JetBrains Mono',
  'Fira Code',
  'Fira Mono',
  'Source Code Pro',
  'IBM Plex Mono',
  'Ubuntu Mono',
  'Hack',
  'Inconsolata',
  'Roboto Mono',
  'Iosevka',
  'DejaVu Sans Mono',
  'Liberation Mono',
];

export function detectMonospaceFonts(fontFaceSet: FontFaceSet | null | undefined): string[] {
  if (!fontFaceSet || typeof fontFaceSet.check !== 'function') {
    return [];
  }
  return MONOSPACE_FONT_CANDIDATES.filter((f) => fontFaceSet.check(`12px "${f}"`));
}

export class ShellSettingTab extends PluginSettingTab {
  private readonly plugin: ShellPlugin;
  private customFontMode = false;

  constructor(app: App, plugin: ShellPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Mutation testing disabled for UI copy in this block. See AGENTS.md,
    // "Mutation testing" section, for the policy.
    // Stryker disable StringLiteral,ObjectLiteral,Regex
    new Setting(containerEl).setName('Executable').setHeading();

    new Setting(containerEl)
      .setName('Shell path')
      .setDesc(
        'Absolute path to the shell binary. Leave blank to auto-detect from the environment.',
      )
      .addText((text) =>
        text
          .setPlaceholder('/bin/zsh')
          .setValue(this.plugin.settings.shell.path)
          .onChange(async (value) => {
            this.plugin.settings.shell.path = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Shell arguments')
      .setDesc('Space-separated arguments passed to the shell. Default: -l (login shell).')
      .addText((text) =>
        text
          .setPlaceholder('-l')
          .setValue(this.plugin.settings.shell.args.join(' '))
          .onChange(async (value) => {
            this.plugin.settings.shell.args = value.split(/\s+/).filter(Boolean);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName('Working directory').setHeading();

    new Setting(containerEl)
      .setName('Starting directory')
      .setDesc('Where new shells open.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('vault-root', 'Vault root')
          .addOption('note-dir', "Active note's folder")
          .addOption('fixed-path', 'Custom path')
          .setValue(this.plugin.settings.cwd.strategy)
          .onChange(async (value) => {
            this.plugin.settings.cwd.strategy = value as CwdStrategy;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (this.plugin.settings.cwd.strategy === 'fixed-path') {
      new Setting(containerEl)
        .setName('Custom path')
        .setDesc(
          'Absolute path. Used only when the starting directory picker is set to custom path.',
        )
        .addText((text) =>
          text
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setPlaceholder('/Users/you/work')
            .setValue(this.plugin.settings.cwd.fixedPath)
            .onChange(async (value) => {
              this.plugin.settings.cwd.fixedPath = value.trim();
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl).setName('Appearance').setHeading();

    const detectedFonts = detectMonospaceFonts(document.fonts);
    const currentFont = this.plugin.settings.appearance.fontFamily;
    const knownFont = currentFont === '' || detectedFonts.includes(currentFont);
    const showCustom = this.customFontMode || !knownFont;

    new Setting(containerEl)
      .setName('Font family')
      .setDesc('Pick a detected monospace font, or pick the custom option to enter your own.')
      .addDropdown((dropdown) => {
        dropdown.addOption('', 'Default');
        for (const font of detectedFonts) {
          dropdown.addOption(font, font);
        }
        dropdown.addOption(CUSTOM_FONT_SENTINEL, 'Custom...');
        dropdown.setValue(showCustom ? CUSTOM_FONT_SENTINEL : currentFont);
        dropdown.onChange(async (value) => {
          if (value === CUSTOM_FONT_SENTINEL) {
            this.customFontMode = true;
          } else {
            this.customFontMode = false;
            this.plugin.settings.appearance.fontFamily = value;
            await this.plugin.saveSettings();
          }
          this.display();
        });
      });

    if (showCustom) {
      new Setting(containerEl)
        .setName('Custom font family')
        .setDesc('CSS font-family value. Commas, quotes, and fallbacks all work.')
        .addText((text) =>
          text
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setPlaceholder('Iosevka Term, monospace')
            .setValue(currentFont)
            .onChange(async (value) => {
              this.plugin.settings.appearance.fontFamily = value;
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName('Font size')
      .setDesc('Pixels.')
      .addSlider((slider) =>
        slider
          .setLimits(FONT_SIZE_MIN, FONT_SIZE_MAX, 1)
          .setValue(this.plugin.settings.appearance.fontSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.appearance.fontSize = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Line height')
      .setDesc('Multiplier on the font size. Higher values add breathing room between rows.')
      .addSlider((slider) =>
        slider
          .setLimits(LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, LINE_HEIGHT_STEP)
          .setValue(this.plugin.settings.appearance.lineHeight)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.appearance.lineHeight = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName('Cursor style').addDropdown((dropdown) =>
      dropdown
        .addOption('block', 'Block')
        .addOption('bar', 'Line')
        .addOption('underline', 'Underline')
        .setValue(this.plugin.settings.appearance.cursorStyle)
        .onChange(async (value) => {
          this.plugin.settings.appearance.cursorStyle = value as CursorStyle;
          await this.plugin.saveSettings();
        }),
    );

    new Setting(containerEl).setName('Cursor blink').addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.appearance.cursorBlink).onChange(async (value) => {
        this.plugin.settings.appearance.cursorBlink = value;
        await this.plugin.saveSettings();
      }),
    );

    new Setting(containerEl)
      .setName('Follow Obsidian theme')
      .setDesc("Map Obsidian's CSS variables into the terminal's colors.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.appearance.followObsidianTheme)
          .onChange(async (value) => {
            this.plugin.settings.appearance.followObsidianTheme = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName('Behavior').setHeading();

    new Setting(containerEl)
      .setName('Scrollback lines')
      .setDesc('How many lines of output to retain.')
      .addSlider((slider) =>
        slider
          .setLimits(SCROLLBACK_MIN, SCROLLBACK_MAX, SCROLLBACK_STEP)
          .setValue(this.plugin.settings.behavior.scrollback)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.behavior.scrollback = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Copy on select')
      .setDesc('Copy highlighted text to the clipboard automatically.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.behavior.copyOnSelection).onChange(async (value) => {
          this.plugin.settings.behavior.copyOnSelection = value;
          await this.plugin.saveSettings();
        }),
      );
    // Stryker restore StringLiteral,ObjectLiteral,Regex
  }
}
