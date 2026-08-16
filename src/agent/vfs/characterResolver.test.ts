import { describe, it, expect } from 'vitest';
import { characterResolver } from './characterResolver';
import { AliasTable } from './aliasTable';
import type { VfsContext } from './types';
import type { Character } from '../../types';

function makeChar(): Character {
  return {
    avatar: '',
    name: 'Test Char',
    description: 'a brave hero',
    otherPrompts: {
      scenario: 'in a dungeon',
      mesExample: '',
      personality: 'brave',
      systemPrompt: '',
      postHistoryInstructions: '',
      depthPrompt: { prompt: 'deep prompt', depth: 4, role: 0 },
    },
    greetings: ['Hello!', 'Yo!'],
    creatorMeta: { creator: '', creatorNotes: '', version: '', tags: [] },
    talkativeness: 0.5,
    fav: false,
    worldbook: null,
    regexs: [],
    scripts: [],
  };
}

function makeStore() {
  return {
    character: makeChar() as Character | null,
    hasData: true,
    regexs: [] as unknown[],
    scripts: [] as unknown[],
    markDirty: () => {},
    addRegexScript: () => null,
    deleteRegexScript: () => {},
    addScriptTree: () => null,
    deleteScriptTree: () => {},
  };
}

function ctx(store: ReturnType<typeof makeStore>): VfsContext {
  return {
    presetStore: {} as VfsContext['presetStore'],
    worldbookStore: {} as VfsContext['worldbookStore'],
    characterStore: store as unknown as VfsContext['characterStore'],
    aliasTable: new AliasTable(),
  };
}

describe('characterResolver', () => {
  it('lists workspace collections', () => {
    const r = characterResolver.list([], ctx(makeStore()));
    const names = (r.structured as { collections: { name: string }[] }).collections.map((c) => c.name);
    expect(names).toEqual(['fields', 'greetings', 'regexs', 'scripts']);
  });

  it('lists fields and gets top-level vs otherPrompts values', () => {
    const c = ctx(makeStore());
    const list = characterResolver.list(['fields'], c);
    const keys = (list.structured as { fields: { key: string }[] }).fields.map((f) => f.key);
    expect(keys).toContain('description');
    expect(keys).toContain('depthPrompt');

    expect(characterResolver.get(['fields', 'description'], c).structured).toBe('a brave hero');
    expect(characterResolver.get(['fields', 'personality'], c).structured).toBe('brave');
    expect(characterResolver.get(['fields', 'depthPrompt'], c).structured).toBe('deep prompt');
  });

  it('edits a text field via unique substring replace', () => {
    const store = makeStore();
    const c = ctx(store);
    const r = characterResolver.write(
      ['fields', 'description'],
      { op: 'replace', old: 'brave', newValue: 'cowardly' },
      c
    );
    expect(r.ok).toBe(true);
    expect(store.character!.description).toBe('a cowardly hero');
  });

  it('lists, gets and sets greetings positionally', () => {
    const store = makeStore();
    const c = ctx(store);
    const list = characterResolver.list(['greetings'], c);
    const items = (list.structured as { items: { alias: string }[] }).items;
    expect(items.map((i) => i.alias)).toEqual(['0', '1']);

    expect(characterResolver.get(['greetings', '0'], c).structured).toBe('Hello!');

    const set = characterResolver.write(['greetings', '1'], { op: 'set', value: 'Sup!' }, c);
    expect(set.ok).toBe(true);
    expect(store.character!.greetings[1]).toBe('Sup!');
  });

  it('adds and deletes greetings', () => {
    const store = makeStore();
    const c = ctx(store);
    const add = characterResolver.create(['greetings'], {}, c);
    expect(add.ok).toBe(true);
    expect(store.character!.greetings).toHaveLength(3);

    const del = characterResolver.remove(['greetings', '2'], c);
    expect(del.ok).toBe(true);
    expect(store.character!.greetings).toHaveLength(2);
  });

  it('rejects deleting the last greeting', () => {
    const store = makeStore();
    store.character!.greetings = ['only'];
    const c = ctx(store);
    const r = characterResolver.remove(['greetings', '0'], c);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('last greeting');
  });
});
