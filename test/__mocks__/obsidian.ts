/*
 * Minimal runtime stub of the `obsidian` module for Vitest.
 *
 * The real `obsidian` npm package is a types-only shim with no runtime main,
 * so importing it under Vitest throws. This stub provides just enough of the
 * public API for unit tests to import, instantiate, and drive plugin code —
 * including invoking captured callbacks (commands, ribbon, protocol, DOM
 * events, and settings onChange handlers).
 *
 * Extend this file as you need more of the API surface in your tests.
 */

import { vi } from 'vitest';

type AnyFn = (...args: unknown[]) => unknown;

// Loose command shape — real Obsidian typings are richer than our mock's
// subset, so we accept anything and let plugin code bind more specific types.
interface CapturedCommand {
  id: string;
  name: string;
  callback?: (...args: any[]) => unknown | Promise<unknown>;
  editorCallback?: (...args: any[]) => unknown | Promise<unknown>;
  editorCheckCallback?: (...args: any[]) => unknown | Promise<unknown>;
  checkCallback?: (...args: any[]) => unknown | Promise<unknown>;
}

interface CapturedRibbonIcon {
  icon: string;
  title: string;
  callback: (evt: MouseEvent) => unknown;
}

interface CapturedDomEvent {
  target: EventTarget;
  event: string;
  callback: (evt: Event) => unknown;
}

interface CapturedBasesView {
  name: string;
  icon: string;
  factory: (controller: QueryController, containerEl: HTMLElement) => unknown;
  options?: (config?: BasesViewConfig) => BasesAllOptions[];
}

// Mirrors the upstream Obsidian types. `| void` is deliberate so
// fire-and-forget handlers assign without type errors — swapping to
// `| undefined` breaks `() => {}` compatibility.
type MarkdownPostProcessorFn = (
  element: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => Promise<unknown> | void;

type MarkdownCodeBlockProcessorFn = (
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => Promise<unknown> | void;

interface CapturedMarkdownPostProcessor {
  processor: MarkdownPostProcessorFn;
  sortOrder: number | undefined;
}

interface CapturedMarkdownCodeBlockProcessor {
  handler: MarkdownCodeBlockProcessorFn;
  sortOrder: number | undefined;
}

const registries = {
  settings: [] as Setting[],
  notices: [] as Notice[],
};

export function __resetObsidianMocks(): void {
  registries.settings.length = 0;
  registries.notices.length = 0;
  Platform.isMobile = false;
  Platform.isDesktop = true;
}

export function __getSettings(): Setting[] {
  return [...registries.settings];
}

export function __getNotices(): Notice[] {
  return [...registries.notices];
}

export class Component {
  load = vi.fn();
  unload = vi.fn();
  addChild = vi.fn();
  removeChild = vi.fn();
  register = vi.fn();
  registerEvent = vi.fn();
  registerDomEvent = vi.fn();
  registerInterval = vi.fn();
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  dir?: string;
}

export class Plugin extends Component {
  app: App;
  manifest: PluginManifest;

  // Test introspection — the plugin code registers callbacks here; tests
  // invoke them to exercise branches.
  __commands: CapturedCommand[] = [];
  __ribbonIcons: CapturedRibbonIcon[] = [];
  __protocolHandlers = new Map<string, (params: Record<string, string>) => unknown>();
  __domEvents: CapturedDomEvent[] = [];
  __viewFactories = new Map<string, (leaf: WorkspaceLeaf) => unknown>();
  __statusBarItems: HTMLElement[] = [];
  __settingTabs: PluginSettingTab[] = [];
  __intervals: number[] = [];
  __basesViews = new Map<string, CapturedBasesView>();
  __markdownPostProcessors: CapturedMarkdownPostProcessor[] = [];
  __markdownCodeBlockProcessors = new Map<string, CapturedMarkdownCodeBlockProcessor>();

  constructor(
    app: App,
    manifest: PluginManifest = {
      id: 'mock-plugin',
      name: 'Mock Plugin',
      version: '0.0.0',
      minAppVersion: '0.0.0',
    },
  ) {
    super();
    this.app = app;
    this.manifest = manifest;
  }

  loadData = vi.fn((): Promise<unknown> => Promise.resolve(null as unknown));
  saveData = vi.fn((_data: unknown): Promise<void> => Promise.resolve());

  addRibbonIcon = vi.fn((icon: string, title: string, callback: (evt: MouseEvent) => unknown) => {
    this.__ribbonIcons.push({ icon, title, callback });
    return document.createElement('div');
  });

  addStatusBarItem = vi.fn(() => {
    const el = document.createElement('div');
    this.__statusBarItems.push(el);
    return el;
  });

  addCommand = vi.fn((cmd: CapturedCommand) => {
    this.__commands.push(cmd);
    return cmd;
  });

  addSettingTab = vi.fn((tab: PluginSettingTab) => {
    this.__settingTabs.push(tab);
  });

  registerView = vi.fn((type: string, factory: (leaf: WorkspaceLeaf) => unknown) => {
    this.__viewFactories.set(type, factory);
  });

  registerBasesView = vi.fn((id: string, registration: CapturedBasesView) => {
    this.__basesViews.set(id, registration);
    return true;
  });

  registerObsidianProtocolHandler = vi.fn(
    (scheme: string, handler: (params: Record<string, string>) => unknown) => {
      this.__protocolHandlers.set(scheme, handler);
    },
  );

  override registerDomEvent = vi.fn((target: EventTarget, event: string, callback: AnyFn) => {
    this.__domEvents.push({ target, event, callback: callback as (evt: Event) => unknown });
  });

  override registerInterval = vi.fn((handle: number) => {
    this.__intervals.push(handle);
    return handle;
  });

  registerMarkdownPostProcessor = vi.fn(
    (processor: MarkdownPostProcessorFn, sortOrder?: number) => {
      this.__markdownPostProcessors.push({ processor, sortOrder });
      return processor;
    },
  );

  registerMarkdownCodeBlockProcessor = vi.fn(
    (language: string, handler: MarkdownCodeBlockProcessorFn, sortOrder?: number) => {
      this.__markdownCodeBlockProcessors.set(language, { handler, sortOrder });
      return handler;
    },
  );

  // Test helpers
  __findCommand(id: string): CapturedCommand | undefined {
    return this.__commands.find((c) => c.id === id);
  }
}

interface CapturedWorkspaceEvent {
  event: string;
  cb: (...args: any[]) => any;
}

export class FileSystemAdapter {
  getFullPath(relativePath: string): string {
    return `/mock/vault/${relativePath}`;
  }
  getBasePath(): string {
    return '/mock/vault';
  }
}

export class App {
  workspace: {
    activeLeaf: WorkspaceLeaf | null;
    getLeavesOfType: (type: string) => WorkspaceLeaf[];
    getRightLeaf: (split: boolean) => WorkspaceLeaf | null;
    getLeftLeaf: (split: boolean) => WorkspaceLeaf | null;
    getLeaf: (mode?: boolean | 'split' | 'tab' | 'window') => WorkspaceLeaf;
    revealLeaf: (leaf: WorkspaceLeaf) => Promise<void>;
    detachLeavesOfType: (type: string) => void;
    getActiveViewOfType: (type: unknown) => unknown;
    getActiveFile: () => TFile | null;
    requestSaveLayout: () => void;
    on: (event: string, cb: (...args: any[]) => any) => CapturedWorkspaceEvent;
    openLinkText: (linktext: string, sourcePath: string, newLeaf?: unknown) => Promise<void>;
    trigger: (name: string, ...args: any[]) => void;
    __eventHandlers: CapturedWorkspaceEvent[];
  };
  vault: {
    adapter: FileSystemAdapter;
    getFileByPath: (path: string) => TFile | null;
    getFolderByPath: (path: string) => TFolder | null;
  };
  metadataCache: Record<string, unknown>;
  fileManager: Record<string, unknown>;
  secretStorage: SecretStorage | undefined;

  constructor() {
    this.secretStorage = new SecretStorage();
    const eventHandlers: CapturedWorkspaceEvent[] = [];
    this.workspace = {
      activeLeaf: null,
      getLeavesOfType: vi.fn((_type: string) => [] as WorkspaceLeaf[]),
      getRightLeaf: vi.fn((_split: boolean) => null),
      getLeftLeaf: vi.fn((_split: boolean) => null),
      getLeaf: vi.fn((_mode?: boolean | 'split' | 'tab' | 'window') => new WorkspaceLeaf()),
      revealLeaf: vi.fn((_leaf: WorkspaceLeaf) => Promise.resolve()),
      detachLeavesOfType: vi.fn((_type: string) => undefined),
      getActiveViewOfType: vi.fn(() => null),
      getActiveFile: vi.fn(() => null as TFile | null),
      requestSaveLayout: vi.fn(),
      on: vi.fn((event: string, cb: (...args: any[]) => any) => {
        const ref: CapturedWorkspaceEvent = { event, cb };
        eventHandlers.push(ref);
        return ref;
      }),
      openLinkText: vi.fn(async (_linktext: string, _sourcePath: string, _newLeaf?: unknown) => {
        // no-op stub — tests assert against the spy directly
      }),
      trigger: vi.fn((_name: string, ..._args: any[]) => undefined),
      __eventHandlers: eventHandlers,
    };
    this.vault = {
      adapter: new FileSystemAdapter(),
      getFileByPath: vi.fn(() => null),
      getFolderByPath: vi.fn(() => null),
    };
    this.metadataCache = {};
    this.fileManager = {};
  }
}

export class PluginSettingTab {
  app: App;
  containerEl: HTMLElement;

  constructor(app: App, _plugin: Plugin) {
    this.app = app;
    this.containerEl = document.createElement('div');
  }

  display(): void {}
  hide(): void {}
}

class TextComponent {
  value = '';
  private _onChange?: (v: string) => void | Promise<void>;
  setPlaceholder(_p: string): this {
    return this;
  }
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  onChange(cb: (v: string) => void | Promise<void>): this {
    this._onChange = cb;
    return this;
  }
  async __trigger(v: string): Promise<void> {
    this.value = v;
    await this._onChange?.(v);
  }
}

class ToggleComponent {
  value = false;
  private _onChange?: (v: boolean) => void | Promise<void>;
  setValue(v: boolean): this {
    this.value = v;
    return this;
  }
  onChange(cb: (v: boolean) => void | Promise<void>): this {
    this._onChange = cb;
    return this;
  }
  async __trigger(v: boolean): Promise<void> {
    this.value = v;
    await this._onChange?.(v);
  }
}

class SliderComponent {
  value = 0;
  private _onChange?: (v: number) => void | Promise<void>;
  setLimits(_min: number, _max: number, _step: number): this {
    return this;
  }
  setValue(v: number): this {
    this.value = v;
    return this;
  }
  setDynamicTooltip(): this {
    return this;
  }
  onChange(cb: (v: number) => void | Promise<void>): this {
    this._onChange = cb;
    return this;
  }
  async __trigger(v: number): Promise<void> {
    this.value = v;
    await this._onChange?.(v);
  }
}

class ButtonComponent {
  private _onClick?: () => void | Promise<void>;
  setButtonText(_t: string): this {
    return this;
  }
  setWarning(): this {
    return this;
  }
  setCta(): this {
    return this;
  }
  setTooltip(_t: string): this {
    return this;
  }
  setIcon(_i: string): this {
    return this;
  }
  onClick(cb: () => void | Promise<void>): this {
    this._onClick = cb;
    return this;
  }
  async __trigger(): Promise<void> {
    await this._onClick?.();
  }
}

class ExtraButtonComponent {
  private _onClick?: () => void | Promise<void>;
  setIcon(_i: string): this {
    return this;
  }
  setTooltip(_t: string): this {
    return this;
  }
  setDisabled(_d: boolean): this {
    return this;
  }
  onClick(cb: () => void | Promise<void>): this {
    this._onClick = cb;
    return this;
  }
  async __trigger(): Promise<void> {
    await this._onClick?.();
  }
}

class TextAreaComponent {
  value = '';
  private _onChange?: (v: string) => void | Promise<void>;
  setPlaceholder(_p: string): this {
    return this;
  }
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  onChange(cb: (v: string) => void | Promise<void>): this {
    this._onChange = cb;
    return this;
  }
  async __trigger(v: string): Promise<void> {
    this.value = v;
    await this._onChange?.(v);
  }
}

class SearchComponent {
  value = '';
  private _onChange?: (v: string) => void | Promise<void>;
  setPlaceholder(_p: string): this {
    return this;
  }
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  onChange(cb: (v: string) => void | Promise<void>): this {
    this._onChange = cb;
    return this;
  }
  async __trigger(v: string): Promise<void> {
    this.value = v;
    await this._onChange?.(v);
  }
}

class DropdownComponent {
  value = '';
  options: Record<string, string> = {};
  private _onChange?: (v: string) => void | Promise<void>;
  addOption(key: string, label: string): this {
    this.options[key] = label;
    return this;
  }
  addOptions(opts: Record<string, string>): this {
    Object.assign(this.options, opts);
    return this;
  }
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  onChange(cb: (v: string) => void | Promise<void>): this {
    this._onChange = cb;
    return this;
  }
  async __trigger(v: string): Promise<void> {
    this.value = v;
    await this._onChange?.(v);
  }
}

class ColorComponent {
  value = '';
  private _onChange?: (v: string) => void | Promise<void>;
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  setValueRgb(_rgb: { r: number; g: number; b: number }): this {
    return this;
  }
  onChange(cb: (v: string) => void | Promise<void>): this {
    this._onChange = cb;
    return this;
  }
  async __trigger(v: string): Promise<void> {
    this.value = v;
    await this._onChange?.(v);
  }
}

class MomentFormatComponent {
  value = '';
  sampleEl: HTMLElement | null = null;
  private _onChange?: (v: string) => void | Promise<void>;
  setPlaceholder(_p: string): this {
    return this;
  }
  setDefaultFormat(_f: string): this {
    return this;
  }
  setSampleEl(el: HTMLElement): this {
    this.sampleEl = el;
    return this;
  }
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  onChange(cb: (v: string) => void | Promise<void>): this {
    this._onChange = cb;
    return this;
  }
  async __trigger(v: string): Promise<void> {
    this.value = v;
    await this._onChange?.(v);
  }
}

class ProgressBarComponent {
  value = 0;
  setValue(v: number): this {
    this.value = v;
    return this;
  }
}

// SecretComponent extends BaseComponent in the real API. The mock only needs
// the public setValue/onChange surface that src code drives.
export class SecretComponent {
  value = '';
  containerEl: HTMLElement;
  private _onChange?: (v: string) => void | Promise<void>;
  constructor(_app: App, containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  onChange(cb: (v: string) => void | Promise<void>): this {
    this._onChange = cb;
    return this;
  }
  async __trigger(v: string): Promise<void> {
    this.value = v;
    await this._onChange?.(v);
  }
}

// Per-vault runtime store behind app.secretStorage. setSecret enforces the
// real API's lowercase-alphanumeric-with-dashes constraint so tests catch
// invalid IDs the way Obsidian would.
export class SecretStorage {
  private readonly secrets = new Map<string, string>();
  setSecret(id: string, secret: string): void {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`Invalid secret id: ${id}`);
    }
    if (secret === '') {
      this.secrets.delete(id);
      return;
    }
    this.secrets.set(id, secret);
  }
  getSecret(id: string): string | null {
    return this.secrets.get(id) ?? null;
  }
  listSecrets(): string[] {
    return [...this.secrets.keys()];
  }
}

type AnyComponent =
  | TextComponent
  | TextAreaComponent
  | SearchComponent
  | DropdownComponent
  | ToggleComponent
  | SliderComponent
  | ButtonComponent
  | ExtraButtonComponent
  | ColorComponent
  | MomentFormatComponent
  | ProgressBarComponent
  | SecretComponent;

export class Setting {
  name = '';
  desc = '';
  heading = false;
  settingEl: HTMLElement;
  components: AnyComponent[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    containerEl.appendChild(this.settingEl);
    registries.settings.push(this);
  }

  setName(name: string): this {
    this.name = name;
    return this;
  }
  setDesc(desc: string): this {
    this.desc = desc;
    return this;
  }
  setHeading(): this {
    this.heading = true;
    return this;
  }
  setTooltip(_tooltip: string): this {
    return this;
  }
  setClass(_cls: string): this {
    return this;
  }
  setDisabled(_disabled: boolean): this {
    return this;
  }
  addText(cb: (text: TextComponent) => void): this {
    const c = new TextComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addTextArea(cb: (area: TextAreaComponent) => void): this {
    const c = new TextAreaComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addSearch(cb: (search: SearchComponent) => void): this {
    const c = new SearchComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addDropdown(cb: (dropdown: DropdownComponent) => void): this {
    const c = new DropdownComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addToggle(cb: (toggle: ToggleComponent) => void): this {
    const c = new ToggleComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addSlider(cb: (slider: SliderComponent) => void): this {
    const c = new SliderComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addButton(cb: (button: ButtonComponent) => void): this {
    const c = new ButtonComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addExtraButton(cb: (button: ExtraButtonComponent) => void): this {
    const c = new ExtraButtonComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addColorPicker(cb: (picker: ColorComponent) => void): this {
    const c = new ColorComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addMomentFormat(cb: (moment: MomentFormatComponent) => void): this {
    const c = new MomentFormatComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addProgressBar(cb: (bar: ProgressBarComponent) => void): this {
    const c = new ProgressBarComponent();
    this.components.push(c);
    cb(c);
    return this;
  }
  addComponent<T>(cb: (el: HTMLElement) => T): this {
    const el = document.createElement('div');
    this.settingEl.appendChild(el);
    const component = cb(el);
    this.components.push(component as unknown as AnyComponent);
    return this;
  }
}

export class Scope {
  __bindings: { modifiers: string[]; key: string; fn: (...args: unknown[]) => unknown }[] = [];
  register = vi.fn((modifiers: string[], key: string, fn: (...args: unknown[]) => unknown) => {
    const binding = { modifiers, key, fn };
    this.__bindings.push(binding);
    return binding;
  });
}

export class Modal {
  app: App;
  contentEl: HTMLElement;
  titleEl: HTMLElement;
  scope: Scope;

  constructor(app: App) {
    this.app = app;
    this.contentEl = document.createElement('div');
    this.titleEl = document.createElement('div');
    this.scope = new Scope();
  }
  open = vi.fn();
  close = vi.fn();
  onOpen(): void {}
  onClose(): void {}
}

// Shape of a fuzzy match result — tests don't use the match ranges, but
// concrete classes accept a FuzzyMatch<T> so the mock needs the type.
export interface FuzzyMatch<T> {
  item: T;
  match: { score: number; matches: number[][] };
}

// SuggestModal's real implementation renders an input + results list via
// Obsidian's internals. The mock exposes the same abstract surface so
// concrete subclasses can be instantiated and driven directly from tests.
export abstract class SuggestModal<T> extends Modal {
  inputEl: HTMLInputElement;
  resultContainerEl: HTMLElement;
  emptyStateText = 'No matches.';
  limit = 50;

  constructor(app: App) {
    super(app);
    this.inputEl = document.createElement('input');
    this.resultContainerEl = document.createElement('div');
  }

  abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;

  setPlaceholder(placeholder: string): void {
    this.inputEl.placeholder = placeholder;
  }
}

// FuzzySuggestModal delegates the three SuggestModal abstracts to three
// simpler ones (getItems / getItemText / onChooseItem) and wraps results
// in FuzzyMatch<T>. The mock mirrors that contract so tests exercise the
// delegation path without pulling in Obsidian's real fuzzy scorer.
export abstract class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {
  abstract getItems(): T[];
  abstract getItemText(item: T): string;
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;

  getSuggestions(query: string): FuzzyMatch<T>[] {
    const needle = query.toLowerCase();
    return this.getItems()
      .filter((item) => this.getItemText(item).toLowerCase().includes(needle))
      .map((item) => ({ item, match: { score: 1, matches: [] } }));
  }

  renderSuggestion(match: FuzzyMatch<T>, el: HTMLElement): void {
    el.setText(this.getItemText(match.item));
  }

  onChooseSuggestion(match: FuzzyMatch<T>, evt: MouseEvent | KeyboardEvent): void {
    this.onChooseItem(match.item, evt);
  }
}

// Obsidian's setIcon stamps an SVG into the element. The mock only needs
// to mark the element so tests can assert which icon was requested.
export function setIcon(el: HTMLElement, icon: string): void {
  el.dataset['icon'] = icon;
}

// Obsidian's renderResults highlights matched ranges in `text`. The mock
// only needs to drop the text into the element so DOM assertions work.
export function renderResults(
  el: HTMLElement,
  text: string,
  _match: { score: number; matches: number[][] } | null | undefined,
  _offset?: number,
): void {
  el.setText(text);
}

export class Notice {
  constructor(
    public message: string,
    public duration?: number,
  ) {
    registries.notices.push(this);
  }
  hide = vi.fn();
}

export interface ViewStateResult {
  history: boolean;
}

export class ItemView extends Component {
  app: App = new App();
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super();
    this.leaf = leaf;
    this.containerEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.containerEl.appendChild(this.contentEl);
  }

  getViewType(): string {
    return '';
  }
  getDisplayText(): string {
    return '';
  }
  getIcon(): string {
    return '';
  }
  getState(): Record<string, unknown> {
    return {};
  }
  async setState(_state: unknown, _result: ViewStateResult): Promise<void> {}
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class MarkdownView {
  file: TFile | null = null;
}

export class TAbstractFile {
  path = '';
  name = '';
  parent: TFolder | null = null;
}
export class TFile extends TAbstractFile {
  basename = '';
  extension = '';
}
export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export class MenuItem {
  title = '';
  icon = '';
  private _onClick?: (evt?: unknown) => unknown;
  setTitle(title: string): this {
    this.title = title;
    return this;
  }
  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }
  onClick(cb: (evt?: unknown) => unknown): this {
    this._onClick = cb;
    return this;
  }
  __trigger(evt?: unknown): unknown {
    return this._onClick?.(evt);
  }
}

type MenuEntry = MenuItem | { separator: true };

export class Menu {
  items: MenuEntry[] = [];
  showAtMouseEvent = vi.fn();
  showAtPosition = vi.fn();
  addItem(cb: (item: MenuItem) => unknown): this {
    const item = new MenuItem();
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator(): this {
    this.items.push({ separator: true });
    return this;
  }
  __getMenuItems(): MenuItem[] {
    return this.items.filter((entry): entry is MenuItem => entry instanceof MenuItem);
  }
}

export interface Editor {
  replaceSelection(text: string): void;
  getSelection(): string;
  getValue(): string;
  setValue(text: string): void;
}

export class WorkspaceLeaf {
  view: unknown = null;
  setViewState = vi.fn((_state: unknown): Promise<void> => Promise.resolve());
  getViewState = vi.fn(() => ({ type: '', state: {} as unknown }));
}

export class QueryController extends Component {}

// Type-shape stubs so src code importing these symbols still compiles under
// `tsconfig.test.json`, which aliases `obsidian` to this file.
export type BasesAllOptions = {
  type: string;
  key: string;
  displayName: string;
  default?: unknown;
  options?: Record<string, string>;
};

export interface BasesViewConfig {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  getOrder(): string[];
  getDisplayName(propertyId: string): string;
}

export interface HoverParent {
  hoverPopover: HoverPopover | null;
}

export interface MarkdownSectionInformation {
  lineStart: number;
  lineEnd: number;
  text: string;
}

export interface MarkdownPostProcessorContext {
  docId: string;
  sourcePath: string;
  frontmatter: unknown;
  addChild(child: Component): void;
  getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null;
}

export class HoverPopover {}

// Mirror the real Obsidian API surface — Keymap is exported as a class with
// static helpers, so this stub has to be a class too.
// biome-ignore lint/complexity/noStaticOnlyClass: mirrors upstream API
export class Keymap {
  static isModEvent = vi.fn((_evt?: unknown) => false as unknown as boolean);
}

export function parsePropertyId(propertyId: string): { type: string; name: string } {
  const idx = propertyId.indexOf('.');
  if (idx < 0) {
    return { type: '', name: propertyId };
  }
  return { type: propertyId.slice(0, idx), name: propertyId.slice(idx + 1) };
}

// Real BasesView is abstract and constructed by Obsidian's runtime. The mock
// just records the controller and exposes config/data/app slots that tests
// populate before driving onDataUpdated.
export class BasesView extends Component {
  app: App | null = null;
  config: any = null;
  data: any = null;
  allProperties: string[] = [];
  controller: unknown;

  constructor(controller: unknown) {
    super();
    this.controller = controller;
  }
}

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isIosApp: false,
  isAndroidApp: false,
  isMacOS: true,
  isWin: false,
  isLinux: false,
};

// Expose the captured component types so tests can narrow safely.
export {
  ButtonComponent,
  ColorComponent,
  DropdownComponent,
  ExtraButtonComponent,
  MomentFormatComponent,
  ProgressBarComponent,
  SearchComponent,
  SliderComponent,
  TextAreaComponent,
  TextComponent,
  ToggleComponent,
};
