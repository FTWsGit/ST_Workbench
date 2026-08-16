import { describe, it, expect } from 'vitest';
import { queryVars, type VarQueryResult, type VarHit } from './varResolver';
import { AliasTable } from './aliasTable';
import type { VfsContext } from './types';
import type { VarOp } from '../../types';

function makeOp(overrides: Partial<VarOp>): VarOp {
  return {
    kind: 'get',
    scope: 'local',
    varName: 'user',
    varValue: '',
    source: {
      domain: 'preset',
      fileId: 'test preset',
      blockId: 'b1',
      fieldName: undefined,
      blockLabel: 'block 1',
      line: 0,
      col: 0,
      pos: 0,
    },
    assemblyOrder: { layer: 'preset', intraOrder: 0 },
    certain: true,
    ...overrides,
  };
}

function ctx(ops: VarOp[], char: { greetingIds: string[] } = { greetingIds: [] }): VfsContext {
  return {
    presetStore: {} as VfsContext['presetStore'],
    worldbookStore: {} as VfsContext['worldbookStore'],
    characterStore: char as unknown as VfsContext['characterStore'],
    uiStore: {
      rebuildVarIndex: () => {},
      localRefs: ops.filter((o) => o.scope === 'local'),
      globalRefs: ops.filter((o) => o.scope === 'global'),
    } as unknown as VfsContext['uiStore'],
    aliasTable: new AliasTable(),
  };
}

function must(r: VarQueryResult): { hits: VarHit[] } {
  if (!r.ok) throw new Error(`unexpected error: ${r.error}`);
  return r.structured as { hits: VarHit[] };
}

describe('queryVars', () => {
  it('refs returns reads only (get/inc/dec/has), not defs', () => {
    const ops = [
      makeOp({ kind: 'get' }),
      makeOp({ kind: 'set', varName: 'user' }),
      makeOp({ kind: 'inc', varName: 'user', scope: 'global' }),
    ];
    const { hits } = must(queryVars('user', 'refs', ctx(ops)));
    expect(hits.map((h) => h.kind).sort()).toEqual(['get', 'inc']);
  });

  it('defs returns writes only (set/add)', () => {
    const ops = [
      makeOp({ kind: 'set', varName: 'user' }),
      makeOp({ kind: 'get', varName: 'user' }),
      makeOp({ kind: 'add', varName: 'user' }),
    ];
    const { hits } = must(queryVars('user', 'defs', ctx(ops)));
    expect(hits.map((h) => h.kind).sort()).toEqual(['add', 'set']);
  });

  it('maps preset blockId to alias path', () => {
    const ops = [
      makeOp({
        kind: 'get',
        varName: 'user',
        source: {
          domain: 'preset',
          fileId: 'p',
          blockId: 'b1',
          blockLabel: 'b',
          line: 2,
          col: 3,
          pos: 0,
        },
      }),
    ];
    const { hits } = must(queryVars('user', 'refs', ctx(ops)));
    expect(hits[0].path).toBe('/preset/prompts/1/content');
    expect(hits[0].line).toBe(2);
    expect(hits[0].col).toBe(3);
  });

  it('maps character field and greeting paths', () => {
    const ops = [
      makeOp({
        kind: 'get',
        varName: 'user',
        source: {
          domain: 'character',
          fileId: 'c',
          blockId: 'field:description',
          fieldName: 'description',
          blockLabel: 'd',
          line: 0,
          col: 0,
          pos: 0,
        },
      }),
      makeOp({
        kind: 'get',
        varName: 'user',
        source: {
          domain: 'character',
          fileId: 'c',
          blockId: 'field:greeting:gid1',
          fieldName: 'greeting',
          blockLabel: 'g',
          line: 0,
          col: 0,
          pos: 0,
        },
      }),
    ];
    const { hits } = must(queryVars('user', 'refs', ctx(ops, { greetingIds: ['gid1', 'gid2'] })));
    expect(hits.map((h) => h.path)).toEqual([
      '/character/fields/description',
      '/character/greetings/0',
    ]);
  });

  it('passes certain through and skips unknown greeting id', () => {
    const ops = [
      makeOp({ kind: 'get', varName: 'user', certain: false }),
      makeOp({
        kind: 'get',
        varName: 'user',
        source: {
          domain: 'character',
          fileId: 'c',
          blockId: 'field:greeting:missing',
          fieldName: 'greeting',
          blockLabel: 'g',
          line: 0,
          col: 0,
          pos: 0,
        },
      }),
    ];
    const { hits } = must(queryVars('user', 'refs', ctx(ops, { greetingIds: [] })));
    expect(hits).toHaveLength(1);
    expect(hits[0].certain).toBe(false);
  });

  it('rejects empty name', () => {
    const r = queryVars('  ', 'refs', ctx([]));
    expect(r.ok).toBe(false);
  });
});
