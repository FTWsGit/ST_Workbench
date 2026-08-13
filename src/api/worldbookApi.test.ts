import { describe, it, expect } from 'vitest';
import {
  fromSTEntry,
  toSTEntry,
  fromSTWorldbook,
  toSTEntries,
  fromCharacterBookEntry,
  importCharacterBookEntries,
  characterBookToNative,
} from './worldbookApi';
import type { WorldbookEntry, Worldbook } from '../types';

describe('worldbookApi - fromSTEntry', () => {
  it('字段映射：key → strategy.keys，disable → enabled（取反），comment → name', () => {
    const raw = { key: ['kw1', 'kw2'], disable: true, comment: 'MyEntry' };
    const e = fromSTEntry('1', raw);
    expect(e.strategy.keys).toEqual(['kw1', 'kw2']);
    expect(e.enabled).toBe(false);
    expect(e.name).toBe('MyEntry');
  });

  it('uid 缺失时用 Record 键兜底', () => {
    const e = fromSTEntry('7', { key: [] });
    expect(e.uid).toBe(7);
  });

  it('原生 uid 优先于 Record 键', () => {
    const e = fromSTEntry('1', { uid: 42, key: [] });
    expect(e.uid).toBe(42);
  });

  it('key 非数组时 strategy.keys=[]', () => {
    expect(fromSTEntry('1', { key: 'no' }).strategy.keys).toEqual([]);
    expect(fromSTEntry('1', {}).strategy.keys).toEqual([]);
  });

  it('keysecondary 非数组时 strategy.keysSecondary.keys=[]', () => {
    expect(fromSTEntry('1', {}).strategy.keysSecondary.keys).toEqual([]);
  });

  it('constant/vectorized 映射 strategy.type，否则 keyword', () => {
    expect(fromSTEntry('1', { constant: 1 }).strategy.type).toBe('constant');
    expect(fromSTEntry('1', { vectorized: 1 }).strategy.type).toBe('vectorized');
    expect(fromSTEntry('1', {}).strategy.type).toBe('keyword');
    expect(fromSTEntry('1', { constant: true }).strategy.type).toBe('constant');
    expect(fromSTEntry('1', { vectorized: true }).strategy.type).toBe('vectorized');
  });

  it('scanDepth null → same_as_global；position 数字 → position.type', () => {
    expect(fromSTEntry('1', {}).strategy.scanDepth).toBe('same_as_global');
    expect(fromSTEntry('1', { scanDepth: 5 }).strategy.scanDepth).toBe(5);
    expect(fromSTEntry('1', { position: 2 }).position.type).toBe('before_author_note');
  });

  it('recursion/effect/case 映射进嵌套分组', () => {
    const e = fromSTEntry('1', {
      key: [],
      excludeRecursion: true,
      preventRecursion: true,
      delayUntilRecursion: 2,
      sticky: 3,
      cooldown: 4,
      delay: 5,
      caseSensitive: true,
      matchWholeWords: true,
    });
    expect(e.recursion).toEqual({ preventIncoming: true, preventOutgoing: true, delayUntil: 2 });
    expect(e.effect).toEqual({ sticky: 3, cooldown: 4, delay: 5 });
    expect(e.strategy.caseSensitive).toBe(true);
    expect(e.strategy.matchWholeWords).toBe(true);
  });
});

describe('worldbookApi - toSTEntry', () => {
  it('反向映射：strategy.keys → key，enabled → disable（取反），name → comment', () => {
    const e: WorldbookEntry = {
      ...fromSTEntry('1', { key: ['a'], comment: 'MyEntry' }),
      enabled: false,
    };
    const st = toSTEntry(e);
    expect(st.key).toEqual(['a']);
    expect(st.disable).toBe(true);
    expect(st.comment).toBe('MyEntry');
  });

  it('反向映射：position/recursion/effect 分组 → 原生扁平字段', () => {
    const e: WorldbookEntry = {
      ...fromSTEntry('1', { key: [] }),
      position: { type: 'at_depth', role: 'system', depth: 6, order: 50 },
      recursion: { preventIncoming: true, preventOutgoing: true, delayUntil: 3 },
      effect: { sticky: 2, cooldown: 4, delay: 5 },
    };
    const st = toSTEntry(e);
    expect(st.position).toBe(4);
    expect(st.role).toBe(0);
    expect(st.depth).toBe(6);
    expect(st.order).toBe(50);
    expect(st.excludeRecursion).toBe(true);
    expect(st.preventRecursion).toBe(true);
    expect(st.delayUntilRecursion).toBe(3);
    expect(st.sticky).toBe(2);
    expect(st.cooldown).toBe(4);
    expect(st.delay).toBe(5);
  });

  it('工作层 strategy/recursion/effect 分组不直接透传，position 折叠成原生数字字段', () => {
    const e = fromSTEntry('1', { key: [] });
    const st = toSTEntry(e);
    expect(st).not.toHaveProperty('strategy');
    expect(st).not.toHaveProperty('recursion');
    expect(st).not.toHaveProperty('effect');
    expect(typeof st.position).toBe('number');
  });

  it('未建模字段透传（raw 参数打底）', () => {
    const e = fromSTEntry('1', { key: [] });
    const st = toSTEntry(e, { groupWeight: 100, addMemo: 'x' });
    expect(st.groupWeight).toBe(100);
    expect(st.addMemo).toBe('x');
  });
});

describe('worldbookApi - fromSTWorldbook', () => {
  it('Record → 数组，按 displayIndex 升序排', () => {
    const entries = {
      '1': { uid: 1, displayIndex: 30, key: [] },
      '2': { uid: 2, displayIndex: 10, key: [] },
      '3': { uid: 3, displayIndex: 20, key: [] },
    };
    const wb = fromSTWorldbook('MyWB', entries);
    expect(wb.name).toBe('MyWB');
    expect(wb.entries.map((e) => e.uid)).toEqual([2, 3, 1]);
  });

  it('空记录 → 空数组', () => {
    expect(fromSTWorldbook('x', {}).entries).toEqual([]);
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

  it('keys/secondary_keys → strategy.keys/keysSecondary.keys', () => {
    const e = fromCharacterBookEntry({ keys: ['k1'], secondary_keys: ['s1'] }, 0);
    expect(e.strategy.keys).toEqual(['k1']);
    expect(e.strategy.keysSecondary.keys).toEqual(['s1']);
  });

  it('keys 非数组时 strategy.keys=[]', () => {
    expect(fromCharacterBookEntry({ keys: 'no' as unknown as string[] }, 0).strategy.keys).toEqual(
      []
    );
  });

  it('comment/content 缺失 → name/content 为 ""', () => {
    const e = fromCharacterBookEntry({}, 0);
    expect(e.name).toBe('');
    expect(e.content).toBe('');
  });

  it('extensions 优先于规范字段：constant / position', () => {
    const e = fromCharacterBookEntry(
      {
        constant: false,
        position: 'before_char',
        extensions: { constant: true, position: 3 },
      },
      0
    );
    expect(e.strategy.type).toBe('constant');
    expect(e.position.type).toBe('after_author_note');
  });

  it('规范 position after_char → after_character_definition，before_char → before_character_definition', () => {
    expect(fromCharacterBookEntry({ position: 'after_char' }, 0).position.type).toBe(
      'after_character_definition'
    );
    expect(fromCharacterBookEntry({ position: 'before_char' }, 0).position.type).toBe(
      'before_character_definition'
    );
    expect(fromCharacterBookEntry({}, 0).position.type).toBe('before_character_definition');
  });

  it('enabled = enabled!==false && !ext.disable', () => {
    expect(fromCharacterBookEntry({ enabled: false }, 0).enabled).toBe(false);
    expect(fromCharacterBookEntry({ enabled: true }, 0).enabled).toBe(true);
    expect(fromCharacterBookEntry({ extensions: { disable: true } }, 0).enabled).toBe(false);
  });

  it('position.order 回退链：ext.order → insertion_order → 100', () => {
    expect(fromCharacterBookEntry({ extensions: { order: 50 } }, 0).position.order).toBe(50);
    expect(fromCharacterBookEntry({ insertion_order: 80 }, 0).position.order).toBe(80);
    expect(fromCharacterBookEntry({}, 0).position.order).toBe(100);
  });

  it('position.role 只接受 system/user/assistant，否则 null', () => {
    expect(fromCharacterBookEntry({ extensions: { role: 1 } }, 0).position.role).toBe('user');
    expect(fromCharacterBookEntry({ extensions: { role: 9 } }, 0).position.role).toBeNull();
    expect(fromCharacterBookEntry({}, 0).position.role).toBeNull();
  });

  it('position.depth 默认 4', () => {
    expect(fromCharacterBookEntry({}, 0).position.depth).toBe(4);
    expect(fromCharacterBookEntry({ extensions: { depth: 7 } }, 0).position.depth).toBe(7);
  });
});

describe('worldbookApi - characterBookToNative', () => {
  it('白名单输出：书格式字段不泄漏进原生条目', () => {
    const native = characterBookToNative({
      id: 1,
      keys: ['k'],
      secondary_keys: ['s'],
      insertion_order: 5,
      enabled: true,
      position: 'before_char',
      use_regex: true,
    });
    expect(native.id).toBeUndefined();
    expect(native.keys).toBeUndefined();
    expect(native.secondary_keys).toBeUndefined();
    expect(native.insertion_order).toBeUndefined();
    expect(native.enabled).toBeUndefined();
    expect(native.use_regex).toBeUndefined();
    expect(native.extensions).toEqual({});
  });

  it('snake_case extensions → camelCase 原生字段（递归/深度/大小写/整词/黏性/冷却/延迟）', () => {
    const native = characterBookToNative({
      extensions: {
        exclude_recursion: true,
        prevent_recursion: true,
        delay_until_recursion: 2,
        scan_depth: 10,
        case_sensitive: true,
        match_whole_words: true,
        sticky: 3,
        cooldown: 4,
        delay: 5,
        display_index: 6,
      },
    });
    expect(native.excludeRecursion).toBe(true);
    expect(native.preventRecursion).toBe(true);
    expect(native.delayUntilRecursion).toBe(2);
    expect(native.scanDepth).toBe(10);
    expect(native.caseSensitive).toBe(true);
    expect(native.matchWholeWords).toBe(true);
    expect(native.sticky).toBe(3);
    expect(native.cooldown).toBe(4);
    expect(native.delay).toBe(5);
    expect(native.displayIndex).toBe(6);
  });

  it('补全的字段：概率开关/出口/分组/自动化/触发/预算/匹配开关', () => {
    const native = characterBookToNative({
      comment: 'note',
      extensions: {
        useProbability: true,
        outlet_name: 'outlet',
        group: 'grp',
        group_override: true,
        group_weight: 60,
        use_group_scoring: true,
        automation_id: 'auto-1',
        triggers: ['t1'],
        ignore_budget: true,
        match_persona_description: true,
        match_character_description: true,
        match_character_personality: true,
        match_character_depth_prompt: true,
        match_scenario: true,
        match_creator_notes: true,
      },
    });
    expect(native.useProbability).toBe(true);
    expect(native.addMemo).toBe(true);
    expect(native.outletName).toBe('outlet');
    expect(native.group).toBe('grp');
    expect(native.groupOverride).toBe(true);
    expect(native.groupWeight).toBe(60);
    expect(native.useGroupScoring).toBe(true);
    expect(native.automationId).toBe('auto-1');
    expect(native.triggers).toEqual(['t1']);
    expect(native.ignoreBudget).toBe(true);
    expect(native.matchPersonaDescription).toBe(true);
    expect(native.matchCharacterDescription).toBe(true);
    expect(native.matchCharacterPersonality).toBe(true);
    expect(native.matchCharacterDepthPrompt).toBe(true);
    expect(native.matchScenario).toBe(true);
    expect(native.matchCreatorNotes).toBe(true);
  });

  it('补全字段的默认值：概率开关 true、字符串空、布尔 false、可空 null', () => {
    const native = characterBookToNative({});
    expect(native.useProbability).toBe(true);
    expect(native.addMemo).toBe(false);
    expect(native.outletName).toBe('');
    expect(native.group).toBe('');
    expect(native.groupOverride).toBe(false);
    expect(native.groupWeight).toBe(100);
    expect(native.useGroupScoring).toBeNull();
    expect(native.automationId).toBe('');
    expect(native.triggers).toEqual([]);
    expect(native.ignoreBudget).toBe(false);
    expect(native.matchPersonaDescription).toBe(false);
    expect(native.matchScenario).toBe(false);
  });

  it('extensions 原样透传，供 raw 保活第三方扩展数据', () => {
    const extensions = { custom: 42 };
    expect(characterBookToNative({ extensions }).extensions).toBe(extensions);
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
