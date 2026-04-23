/*
 * Runtime-level setup for tests.
 *
 * - Registers @testing-library/jest-dom matchers (toBeInTheDocument,
 *   toHaveTextContent, toHaveClass, etc.) on Vitest's expect.
 * - Polyfills the DOM-prototype helpers that Obsidian adds on top of
 *   HTMLElement (createEl, createDiv, empty, addClass, setText) so plugin
 *   code can run against plain jsdom.
 */

import '@testing-library/jest-dom/vitest';

type ElOptions = { text?: string; cls?: string | string[]; attr?: Record<string, string> };

function toClassList(cls: string | string[]): string[] {
  // Obsidian accepts either `string` or `string[]` for `cls`. A string may
  // contain multiple classes separated by whitespace (e.g. "mod-cta tw:mt-2").
  const raw = Array.isArray(cls) ? cls : [cls];
  return raw.flatMap((c) => c.split(/\s+/).filter(Boolean));
}

function applyOptions(el: HTMLElement, opts?: ElOptions): HTMLElement {
  if (!opts) return el;
  if (opts.text !== undefined) el.textContent = opts.text;
  if (opts.cls) {
    el.classList.add(...toClassList(opts.cls));
  }
  if (opts.attr) {
    for (const [k, v] of Object.entries(opts.attr)) el.setAttribute(k, v);
  }
  return el;
}

declare global {
  interface HTMLElement {
    empty(): void;
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      opts?: ElOptions,
    ): HTMLElementTagNameMap[K];
    createDiv(opts?: ElOptions): HTMLDivElement;
    createSpan(opts?: ElOptions): HTMLSpanElement;
    addClass(cls: string): void;
    removeClass(cls: string): void;
    setText(text: string): void;
  }
}

const proto = HTMLElement.prototype;

if (typeof proto.empty !== 'function') {
  proto.empty = function empty(this: HTMLElement) {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
}

if (typeof proto.createEl !== 'function') {
  proto.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
    this: HTMLElement,
    tag: K,
    opts?: ElOptions,
  ) {
    const el = document.createElement(tag);
    applyOptions(el, opts);
    this.appendChild(el);
    return el;
  };
}

if (typeof proto.createDiv !== 'function') {
  proto.createDiv = function createDiv(this: HTMLElement, opts?: ElOptions) {
    return this.createEl('div', opts);
  };
}

if (typeof proto.createSpan !== 'function') {
  proto.createSpan = function createSpan(this: HTMLElement, opts?: ElOptions) {
    return this.createEl('span', opts);
  };
}

if (typeof proto.addClass !== 'function') {
  proto.addClass = function addClass(this: HTMLElement, cls: string) {
    this.classList.add(...toClassList(cls));
  };
}

if (typeof proto.removeClass !== 'function') {
  proto.removeClass = function removeClass(this: HTMLElement, cls: string) {
    this.classList.remove(...toClassList(cls));
  };
}

if (typeof proto.setText !== 'function') {
  proto.setText = function setText(this: HTMLElement, text: string) {
    this.textContent = text;
  };
}
