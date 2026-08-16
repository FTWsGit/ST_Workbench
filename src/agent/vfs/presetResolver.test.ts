import { describe, it, expect } from 'vitest';
import { presetResolver } from './presetResolver';
import { AliasTable } from './aliasTable';
import type { VfsContext } from './types';
import type { PromptBlock, OrderNode, PresetSettings } from '../../types';

function makeBlock(
  identifier: string,
  name: string,
  role: PromptBlock['role'],
  content: string
): PromptBlock {
  return {
    identifier,
    name,
    role,
    content,
    system_prompt: false,
    marker: false,
    enabled: true,
    injectionPosition: 0,
    injectionDepth: 0,
    injectionOrder: 0,
  };
}

function makeStore() {
  const prompts: PromptBlock[] = [
    makeBlock('b1', 'system block', 'system', 'hello world'),
    makeBlock('b2', 'user block', 'user', 'second block'),
  ];
  const order: OrderNode[] = [
    { identifier: 'b1', enabled: true },
    { identifier: 'b2', enabled: true },
  ];
  const settings: PresetSettings = {
    openai_max_context: 4095,
    openai_max_tokens: 300,
    n: 1,
    stream_openai: true,
    temperature: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    top_p: 1,
    repetition_penalty: 1,
    min_p: 0,
    top_k: 0,
    top_a: 0,
    seed: -1,
    squash_system_messages: false,
  };
  return {
    presetName: 'test preset',
    prompts,
    order,
    settings,
    regexs: [] as unknown[],
    scripts: [] as unknown[],
    hasData: true,
    markDirty: () => {},
    addRegexScript: () => null,
    deleteRegexScript: () => {},
    addScriptTree: () => null,
    deleteScriptTree: () => {},
  };
}

function ctx(store: ReturnType<typeof makeStore>): VfsContext {
  return {
    presetStore: store as unknown as VfsContext['presetStore'],
    worldbookStore: {} as VfsContext['worldbookStore'],
    characterStore: {} as VfsContext['characterStore'],
    aliasTable: new AliasTable(),
  };
}

/** list prompts 一次（登记 alias），返回 ctx——数字 alias 必须先 list 才能 get/edit/delete。 */
function listed(): { c: VfsContext; store: ReturnType<typeof makeStore> } {
  const store = makeStore();
  const c = ctx(store);
  presetResolver.list(['prompts'], c);
  return { c, store };
}

describe('presetResolver', () => {
  it('lists workspace collections', () => {
    const r = presetResolver.list([], ctx(makeStore()));
    expect(r.ok).toBe(true);
    expect(r.structured).toEqual({
      type: 'collections',
      collections: [
        { name: 'prompts', idKind: 'aliased' },
        { name: 'regexs', idKind: 'aliased' },
        { name: 'scripts', idKind: 'aliased' },
        { name: 'meta', idKind: 'positional' },
      ],
    });
  });

  it('lists prompt items with stable aliases', () => {
    const c = ctx(makeStore());
    const r1 = presetResolver.list(['prompts'], c);
    const items1 = (r1.structured as { items: { alias: string }[] }).items;
    expect(items1.map((i) => i.alias)).toEqual(['1', '2']);
    const r2 = presetResolver.list(['prompts'], c);
    const items2 = (r2.structured as { items: { alias: string }[] }).items;
    expect(items2.map((i) => i.alias)).toEqual(['1', '2']);
  });

  it('gets a leaf by alias (after list)', () => {
    const { c } = listed();
    const r = presetResolver.get(['prompts', '1', 'content'], c);
    expect(r.ok).toBe(true);
    expect(r.structured).toBe('hello world');
  });

  it('resolves by name (convenience selector, auto-registers)', () => {
    const r = presetResolver.get(['prompts', 'system block', 'role'], ctx(makeStore()));
    expect(r.ok).toBe(true);
    expect(r.structured).toBe('system');
  });

  it('rejects unknown alias', () => {
    const r = presetResolver.get(['prompts', '99', 'content'], ctx(makeStore()));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unknown alias');
  });

  it('rejects undeclared field', () => {
    const { c } = listed();
    const r = presetResolver.write(
      ['prompts', '1', 'identifier'],
      { op: 'set', value: 'hacked' },
      c
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('not declared');
  });

  it('does unique substring replace on text field', () => {
    const { c, store } = listed();
    const r = presetResolver.write(
      ['prompts', '1', 'content'],
      { op: 'replace', old: 'hello', newValue: 'goodbye' },
      c
    );
    expect(r.ok).toBe(true);
    expect(store.prompts[0].content).toBe('goodbye world');
    expect(r.changes).toHaveLength(1);
    expect(r.changes![0]).toEqual({
      kind: 'set_field',
      path: '/preset/prompts/1/content',
      before: 'hello world',
      after: 'goodbye world',
    });
  });

  it('rejects non-unique substring', () => {
    const { c } = listed();
    const r = presetResolver.write(
      ['prompts', '1', 'content'],
      { op: 'replace', old: 'o', newValue: 'x' },
      c
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('2+');
  });

  it('sets scalar/enum field, rejecting bad enum', () => {
    const { c, store } = listed();
    const ok = presetResolver.write(['prompts', '1', 'role'], { op: 'set', value: 'assistant' }, c);
    expect(ok.ok).toBe(true);
    expect(store.prompts[0].role).toBe('assistant');

    const bad = presetResolver.write(['prompts', '1', 'role'], { op: 'set', value: 'bogus' }, c);
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('invalid value');
  });

  it('errors when edit is used on a scalar field', () => {
    const { c } = listed();
    const r = presetResolver.write(
      ['prompts', '1', 'role'],
      { op: 'replace', old: 'system', newValue: 'user' },
      c
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('not text');
  });

  it('creates a block, assigning a fresh alias after existing items', () => {
    const store = makeStore();
    const c = ctx(store);
    const r = presetResolver.create(['prompts'], { name: 'new block', role: 'assistant' }, c);
    expect(r.ok).toBe(true);
    expect(r.structured).toEqual({ path: '/preset/prompts/3', alias: '3' });
    expect(store.prompts).toHaveLength(3);
  });

  it('deletes a block and retires its alias', () => {
    const { c, store } = listed();
    const r = presetResolver.remove(['prompts', '1'], c);
    expect(r.ok).toBe(true);
    expect(store.prompts).toHaveLength(1);
    const again = presetResolver.get(['prompts', '1', 'content'], c);
    expect(again.ok).toBe(false);
    expect(again.error).toContain('unknown alias');
  });

  it('lists and gets singleton meta fields', () => {
    const c = ctx(makeStore());
    const list = presetResolver.list(['meta'], c);
    expect(list.ok).toBe(true);
    const fields = (list.structured as { fields: { key: string }[] }).fields;
    expect(fields.some((f) => f.key === 'temperature')).toBe(true);

    const get = presetResolver.get(['meta', 'temperature'], c);
    expect(get.ok).toBe(true);
    expect(get.structured).toBe(1);

    const set = presetResolver.write(['meta', 'temperature'], { op: 'set', value: 0.7 }, c);
    expect(set.ok).toBe(true);
    expect((c.presetStore as unknown as { settings: PresetSettings }).settings.temperature).toBe(
      0.7
    );
  });
});
