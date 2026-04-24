// jscpd:ignore-start
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type ShellPlugin from '../src/main';
import { ShellPickerModal } from '../src/picker';
import { makeSessionEntry as makeEntry, makePlugin } from './helpers/plugin';

vi.mock('../src/pty', async () => (await import('./helpers/mocks')).ptyMockFactory());
vi.mock('../src/view', async () => (await import('./helpers/mocks')).viewMockFactory());
// jscpd:ignore-end

describe('ShellPickerModal', () => {
  let plugin: ShellPlugin;
  let modal: ShellPickerModal;

  beforeEach(() => {
    plugin = makePlugin();
    modal = new ShellPickerModal(plugin.app, plugin);
  });

  it('lists every session the plugin knows about', () => {
    const entries = [makeEntry('Shell 1'), makeEntry('Shell 2')];
    vi.spyOn(plugin, 'listSessions').mockReturnValue(entries);
    expect(modal.getItems()).toEqual(entries);
  });

  it('renders each row with the label and the state', () => {
    const entry = makeEntry('Shell 3');
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('detached');
    expect(modal.getItemText(entry)).toBe('Shell 3 — detached');
  });

  it('delegates selection to switchToSession', () => {
    const entry = makeEntry('Shell 4');
    const spy = vi.spyOn(plugin, 'switchToSession').mockResolvedValue();
    modal.onChooseItem(entry);
    expect(spy).toHaveBeenCalledWith(entry.id);
  });
});
