import { describe, it, expect } from 'vitest';
import { worldbookResolver } from './worldbookResolver';
import { AliasTable } from './aliasTable';
import type { VfsContext } from './types';
import type { WorldbookEntry, OrderNode } from '../../types';

function makeEntry(uid: number, name: string, content: string, enabled = true): WorldbookEntry {
  return {
    uid,
    name,
    enabled,
    content,
    strategy: {
      type: 'keyword',
      keys: ['alpha', 'beta'],
      keysSecondary: { logic: 'and_any', keys: [] },
      scanDepth: 'same_as_global',
      caseSensitive: null,
      matchWholeWords: null,
    },
    position: { type: 'before_character_definition', role: null, depth: 4, order: 100 },
    probability: 100,
    recursion: { preventIncoming: false, preventOutgoing: false, delayUntil: false },
    effect: { sticky: null, cooldown: null, delay: null },
  };
}

function makeStore() {
  const entries = [
    makeEntry(1, 'first', 'hello foo world'),
    makeEntry(2, 'second', 'second content', false),
  ];
  const order: OrderNode[] = [
    { identifier: '1', enabled: true },
    { identifier: '2', enabled: true },
  ];
  return { worldbookName: 'test wb', entries, order, markDirty: () => {} };
}

function ctx(store: ReturnType<typeof makeStore>): VfsContext {
  return {
    presetStore: {} as VfsContext['presetStore'],
    worldbookStore: store as unknown as VfsContext['worldbookStore'],
    characterStore: {} as VfsContext['characterStore'],
    uiStore: {} as VfsContext['uiStore'],
    aliasTable: new AliasTable(),
  };
}

function listed() {
  const store = makeStore();
  const c = ctx(store);
  worldbookResolver.list(['entries'], c);
  return { c, store };
}

describe('worldbookResolver', () => {
  it('lists entries with aliases', () => {
    const { c } = listed();
    const r = worldbookResolver.list(['entries'], c);
    const items = (r.structured as { items: { alias: string }[] }).items;
    expect(items.map((i) => i.alias)).toEqual(['1', '2']);
  });

  it('gets a top-level leaf', () => {
    const { c } = listed();
    const r = worldbookResolver.get(['entries', '1', 'name'], c);
    expect(r.ok).toBe(true);
    expect(r.structured).toBe('first');
  });

  it('gets and sets a nested field via dot-path key', () => {
    const { c, store } = listed();
    const get = worldbookResolver.get(['entries', '1', 'position.depth'], c);
    expect(get.structured).toBe(4);

    const set = worldbookResolver.write(
      ['entries', '1', 'position.depth'],
      { op: 'set', value: 7 },
      c
    );
    expect(set.ok).toBe(true);
    expect(store.entries[0].position.depth).toBe(7);
    expect(set.changes![0]).toEqual({
      kind: 'set_field',
      path: '/worldbook/entries/1/position.depth',
      before: 4,
      after: 7,
    });
  });

  it('rejects invalid enum value on nested enum field', () => {
    const { c } = listed();
    const r = worldbookResolver.write(
      ['entries', '1', 'position.type'],
      { op: 'set', value: 'bogus' },
      c
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('invalid value');
  });

  it('searches nested list field (strategy.keys) and returns usable path', () => {
    const { c } = listed();
    const r = worldbookResolver.search(['entries'], { kind: 'text', value: 'beta' }, c);
    expect(r.ok).toBe(true);
    const hits = (r.structured as { hits: { path: string }[] }).hits;
    expect(hits[0].path).toBe('/worldbook/entries/1/strategy.keys');
  });

  it('creates an entry and deletes it', () => {
    const store = makeStore();
    const c = ctx(store);
    const created = worldbookResolver.create(['entries'], { comment: 'third', content: 'x' }, c);
    expect(created.ok).toBe(true);
    expect(created.structured).toEqual({ path: '/worldbook/entries/3', alias: '3' });
    expect(store.entries).toHaveLength(3);

    const del = worldbookResolver.remove(['entries', '3'], c);
    expect(del.ok).toBe(true);
    expect(store.entries).toHaveLength(2);
  });
});
