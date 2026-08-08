import { describe, it, expect } from 'vitest';
import {
  fromSTEntry,
  toSTEntry,
  fromSTWorldbook,
  toSTEntries,
  fromCharacterBookEntry,
  importCharacterBookEntries,
} from './worldbookApi';
import type { WorldbookEntry, Worldbook } from '../types';

describe('worldbookApi - fromSTEntry', () => {
  it('字段映射：key → keys，disable → disabled，groupOverride → groupPrioritized', () => {
    const raw = { key: ['kw1', 'kw2'], disable: true, groupOverride: true };
    const e = fromSTEntry('1', raw);
    expect(e.keys).toEqual(['kw1', 'kw2']);
    expect(e.disabled).toBe(true);
    expect(e.groupPrioritized).toBe(true);
  });

  it('uid 缺失时用 Record 键兜底', () => {
    const e = fromSTEntry('7', { key: [] });
    expect(e.uid).toBe(7);
  });

  it('原生 uid 优先于 Record 键', () => {
    const e = fromSTEntry('1', { uid: 42, key: [] });
    expect(e.uid).toBe(42);
  });

  it('key 非数组时 keys=[]', () => {
    expect(fromSTEntry('1', { key: 'no' }).keys).toEqual([]);
    expect(fromSTEntry('1', {}).keys).toEqual([]);
  });

  it('keysecondary 非数组时 []', () => {
    expect(fromSTEntry('1', {}).keysecondary).toEqual([]);
  });

  it('constant/vectorized 布尔化，keyWord 派生', () => {
    expect(fromSTEntry('1', { constant: 1 }).constant).toBe(true);
    expect(fromSTEntry('1', { vectorized: 1 }).vectorized).toBe(true);
    // 非常量非向量化 → keyWord=true
    expect(fromSTEntry('1', {}).keyWord).toBe(true);
    expect(fromSTEntry('1', { constant: true }).keyWord).toBe(false);
    expect(fromSTEntry('1', { vectorized: true }).keyWord).toBe(false);
  });

  it('displayIndex 非数时为 0', () => {
    expect(fromSTEntry('1', {}).displayIndex).toBe(0);
    expect(fromSTEntry('1', { displayIndex: 3 }).displayIndex).toBe(3);
  });

  it('未建模字段透传（...raw 打底）', () => {
    const e = fromSTEntry('1', { key: [], scanDepth: 5, position: 2 });
    expect((e as Record<string, unknown>).scanDepth).toBe(5);
    expect((e as Record<string, unknown>).position).toBe(2);
  });
});

describe('worldbookApi - toSTEntry', () => {
  it('反向映射：keys → key，disabled → disable，groupPrioritized → groupOverride', () => {
    const e: WorldbookEntry = {
      uid: 1,
      keys: ['a'],
      keysecondary: [],
      disabled: true,
      groupPrioritized: true,
      constant: false,
      vectorized: false,
      keyWord: true,
      comment: '',
      content: '',
      displayIndex: 0,
      selective: false,
      selectiveLogic: 0,
      position: 0,
      depth: 4,
      order: 100,
      role: null,
      probability: 100,
      useProbability: true,
      excludeRecursion: false,
      preventRecursion: false,
      delayUntilRecursion: false,
      scanDepth: null,
      caseSensitive: null,
      matchWholeWords: null,
      group: '',
      groupWeight: 100,
      sticky: null,
      cooldown: null,
      delay: null,
    };
    const st = toSTEntry(e);
    expect(st.key).toEqual(['a']);
    expect(st.disable).toBe(true);
    expect(st.groupOverride).toBe(true);
  });

  it('keyWord 是工作层专属派生字段，写回时丢弃', () => {
    const e = fromSTEntry('1', { key: [] });
    const st = toSTEntry(e);
    expect(st).not.toHaveProperty('keyWord');
  });

  it('未建模字段透传（...rest 打底）', () => {
    const e = fromSTEntry('1', { key: [], scanDepth: 9 });
    const st = toSTEntry(e);
    expect(st.scanDepth).toBe(9);
  });
});

describe('worldbookApi - fromSTWorldbook', () => {
  it('Record → 数组，按 displayIndex 升序排', () => {
    const data = {
      entries: {
        '1': { uid: 1, displayIndex: 30, key: [] },
        '2': { uid: 2, displayIndex: 10, key: [] },
        '3': { uid: 3, displayIndex: 20, key: [] },
      },
    };
    const wb = fromSTWorldbook('MyWB', data);
    expect(wb.name).toBe('MyWB');
    expect(wb.entries.map((e) => e.uid)).toEqual([2, 3, 1]);
  });

  it('entries 缺失 → 空数组', () => {
    expect(fromSTWorldbook('x', {}).entries).toEqual([]);
    expect(fromSTWorldbook('x', { entries: null }).entries).toEqual([]);
  });

  it('entries 非对象 → 空数组', () => {
    expect(fromSTWorldbook('x', { entries: 'str' }).entries).toEqual([]);
  });
});

describe('worldbookApi - toSTEntries', () => {
  it('数组 → Record<uid, entry>，uid 转字符串做键', () => {
    const wb: Worldbook = {
      name: 'W',
      entries: [fromSTEntry('1', { uid: 11, key: ['k'] }), fromSTEntry('2', { uid: 22, key: [] })],
    };
    const rec = toSTEntries(wb);
    expect(Object.keys(rec).sort()).toEqual(['11', '22']);
    expect((rec['11'] as Record<string, unknown>).key).toEqual(['k']);
  });

  it('空数组 → {}', () => {
    expect(toSTEntries({ name: 'W', entries: [] })).toEqual({});
  });
});

describe('worldbookApi - fromCharacterBookEntry', () => {
  it('id 缺失时用 fallbackUid 兜底', () => {
    const e = fromCharacterBookEntry({ keys: ['k'] }, 5);
    expect(e.uid).toBe(5);
  });

  it('id 是 number 时优先', () => {
    const e = fromCharacterBookEntry({ id: 99, keys: [] }, 5);
    expect(e.uid).toBe(99);
  });

  it('keys/secondary_keys → keys/keysecondary', () => {
    const e = fromCharacterBookEntry({ keys: ['k1'], secondary_keys: ['s1'] }, 0);
    expect(e.keys).toEqual(['k1']);
    expect(e.keysecondary).toEqual(['s1']);
  });

  it('keys 非数组时 []', () => {
    expect(fromCharacterBookEntry({ keys: 'no' as unknown as string[] }, 0).keys).toEqual([]);
  });

  it('comment/content 缺失 → ""', () => {
    const e = fromCharacterBookEntry({}, 0);
    expect(e.comment).toBe('');
    expect(e.content).toBe('');
  });

  it('extensions 优先于规范字段：constant / selective / position', () => {
    const e = fromCharacterBookEntry(
      {
        constant: false,
        selective: false,
        position: 'before_char',
        extensions: { constant: true, selective: true, position: 3 },
      },
      0
    );
    expect(e.constant).toBe(true);
    expect(e.selective).toBe(true);
    expect(e.position).toBe(3);
  });

  it('规范 position after_char → 1，before_char → 0', () => {
    expect(fromCharacterBookEntry({ position: 'after_char' }, 0).position).toBe(1);
    expect(fromCharacterBookEntry({ position: 'before_char' }, 0).position).toBe(0);
    expect(fromCharacterBookEntry({}, 0).position).toBe(0);
  });

  it('disabled = enabled===false || ext.disable', () => {
    expect(fromCharacterBookEntry({ enabled: false }, 0).disabled).toBe(true);
    expect(fromCharacterBookEntry({ enabled: true }, 0).disabled).toBe(false);
    expect(fromCharacterBookEntry({ extensions: { disable: true } }, 0).disabled).toBe(true);
  });

  it('order 回退链：ext.order → insertion_order → 100', () => {
    expect(fromCharacterBookEntry({ extensions: { order: 50 } }, 0).order).toBe(50);
    expect(fromCharacterBookEntry({ insertion_order: 80 }, 0).order).toBe(80);
    expect(fromCharacterBookEntry({}, 0).order).toBe(100);
  });

  it('role 只接受 0/1/2，否则 null', () => {
    expect(fromCharacterBookEntry({ extensions: { role: 1 } }, 0).role).toBe(1);
    expect(fromCharacterBookEntry({ extensions: { role: 9 } }, 0).role).toBeNull();
    expect(fromCharacterBookEntry({}, 0).role).toBeNull();
  });

  it('depth 默认 4', () => {
    expect(fromCharacterBookEntry({}, 0).depth).toBe(4);
    expect(fromCharacterBookEntry({ extensions: { depth: 7 } }, 0).depth).toBe(7);
  });

  it('displayIndex 回退 ext.display_index → fallbackUid', () => {
    expect(fromCharacterBookEntry({ extensions: { display_index: 8 } }, 0).displayIndex).toBe(8);
    expect(fromCharacterBookEntry({}, 5).displayIndex).toBe(5);
  });

  it('未建模字段透传（...raw 打底）', () => {
    const e = fromCharacterBookEntry({ addMemo: 'hello', keys: [] }, 0);
    expect((e as Record<string, unknown>).addMemo).toBe('hello');
  });
});

describe('worldbookApi - importCharacterBookEntries', () => {
  it('空/null/undefined → []', () => {
    expect(importCharacterBookEntries([])).toEqual([]);
    expect(importCharacterBookEntries(null)).toEqual([]);
    expect(importCharacterBookEntries(undefined)).toEqual([]);
  });

  it('fallbackUid 用数组下标', () => {
    const out = importCharacterBookEntries([
      { keys: [] }, // idx=0
      { keys: [] }, // idx=1
    ]);
    expect(out[0].uid).toBe(0);
    expect(out[1].uid).toBe(1);
  });
});
