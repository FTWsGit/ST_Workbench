import { describe, it, expect, vi } from 'vitest';
import { useVarNav } from './useVarNav';
import type { Character, OrderNode, PresetBlock, WorldbookEntry, VarOp } from '../types';

/* ---------- fixture builders ---------- */

function leaf(identifier: string, enabled = true): OrderNode {
  return { identifier, enabled };
}

function block(identifier: string, content: string): PresetBlock {
  return {
    identifier,
    name: identifier,
    content,
    role: 'system',
    system_prompt: false,
    marker: false,
  };
}

function wbEntry(uid: number, content: string, opts: Partial<WorldbookEntry> = {}): WorldbookEntry {
  return {
    uid,
    comment: `entry${uid}`,
    content,
    displayIndex: 0,
    keys: [],
    keysecondary: [],
    selective: false,
    selectiveLogic: 0,
    constant: false,
    keyWord: true,
    vectorized: false,
    disabled: false,
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
    groupPrioritized: false,
    groupWeight: 100,
    sticky: null,
    cooldown: null,
    delay: null,
    ...opts,
  };
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    avatar: 'a.png',
    name: 'Hero',
    description: '',
    scenario: '',
    mesExample: '',
    personality: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    depthPrompt: { prompt: '', depth: 4, role: 0 },
    greetings: [],
    creator: '',
    creatorNotes: '',
    version: '',
    tags: [],
    talkativeness: 0.5,
    fav: false,
    worldbook: null,
    extensions: {
      regex_scripts: [],
      tavern_helper: { type: 'helper', variables: {}, variales: {} },
    } as unknown as Character['extensions'],
    ...overrides,
  };
}

const CHAR_FIELDS: readonly { field: keyof Character | 'greeting'; labelKey: string }[] = [
  { field: 'description', labelKey: 'char.description' },
  { field: 'personality', labelKey: 'char.personality' },
  { field: 'scenario', labelKey: 'char.scenario' },
  { field: 'mesExample', labelKey: 'char.mesExample' },
  { field: 'systemPrompt', labelKey: 'char.systemPrompt' },
  { field: 'postHistoryInstructions', labelKey: 'char.postHistory' },
  { field: 'depthPrompt', labelKey: 'char.depthPrompt' },
  { field: 'greeting', labelKey: 'char.greeting' },
];

/* setvar/addvar 系宏需要 {{setvar::name::value}} 格式（:: 分隔值）；
 * getvar/incvar/decvar/hasvar/deletevar 不带值，用 {{getvar::name}}。 */

describe('useVarNav - 三域扫描与 sortByAssembly', () => {
  it('preset 域扫描：enabled 决定 certain', () => {
    const order: OrderNode[] = [leaf('b1', true), leaf('b2', false)];
    const prompts: PresetBlock[] = [block('b1', '{{setvar::x::v}}'), block('b2', '{{getvar::y}}')];
    const u = useVarNav(
      {
        preset: { order: () => order, prompts: () => prompts, presetName: () => 'P' },
        character: null,
        worldbook: null,
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    const all = [...u.localRefs.value, ...u.globalRefs.value];
    expect(all.length).toBe(2);
    const setOp = all.find((o) => o.varName === 'x')!;
    expect(setOp).toBeTruthy();
    expect(setOp.certain).toBe(true);
    expect(setOp.source.domain).toBe('preset');
    expect(setOp.source.blockId).toBe('b1');
    const getOp = all.find((o) => o.varName === 'y')!;
    expect(getOp.certain).toBe(false); // b2 enabled=false
  });

  it('preset 折叠组收起态跳过内容', () => {
    const order: OrderNode[] = [
      {
        id: 'g',
        _gid: '_g',
        name: 'g',
        collapsed: true,
        enabled: true,
        children: [{ identifier: 'inner', enabled: true }],
      },
    ];
    const prompts: PresetBlock[] = [block('inner', '{{setvar::z::v}}')];
    const u = useVarNav(
      {
        preset: { order: () => order, prompts: () => prompts, presetName: () => 'P' },
        character: null,
        worldbook: null,
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    const all = [...u.localRefs.value, ...u.globalRefs.value];
    expect(all.find((o) => o.varName === 'z')).toBeUndefined();
  });

  it('character 域扫描：恒 certain=true', () => {
    const char = makeCharacter({ description: '{{setglobalvar::g::v}}' });
    const u = useVarNav(
      {
        preset: null,
        character: {
          character: () => char,
          greetingIds: () => [],
          greetingKey: (id) => 'greet:' + id,
          fieldOrder: CHAR_FIELDS,
        },
        worldbook: null,
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    const op = u.globalRefs.value.find((o) => o.varName === 'g')!;
    expect(op).toBeTruthy();
    expect(op.certain).toBe(true);
    expect(op.source.domain).toBe('character');
    expect(op.source.blockId).toBe('field:description');
  });

  it('character greeting 扫描 + fieldName=greeting', () => {
    const char = makeCharacter({ greetings: ['{{incvar::cnt}}'] });
    const u = useVarNav(
      {
        preset: null,
        character: {
          character: () => char,
          greetingIds: () => ['g0'],
          greetingKey: (id) => 'greet:' + id,
          fieldOrder: CHAR_FIELDS,
        },
        worldbook: null,
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    const op = u.localRefs.value.find((o) => o.varName === 'cnt')!;
    expect(op).toBeTruthy();
    expect(op.source.fieldName).toBe('greeting');
    expect(op.source.blockId).toBe('greet:g0');
  });

  it('character greeting 无 id 时跳过', () => {
    const char = makeCharacter({ greetings: ['{{incvar::cnt}}'] });
    const u = useVarNav(
      {
        preset: null,
        character: {
          character: () => char,
          greetingIds: () => [], // 空 → 每个 greeting 都拿不到 id → 跳过
          greetingKey: (id) => 'greet:' + id,
          fieldOrder: CHAR_FIELDS,
        },
        worldbook: null,
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    expect(u.localRefs.value.find((o) => o.varName === 'cnt')).toBeUndefined();
  });

  it('worldbook 域扫描：disabled 跳过，constant 决定 certain，按 order 降序 intraOrder', () => {
    const entries: WorldbookEntry[] = [
      wbEntry(1, '{{setvar::a::v}}', { order: 50, constant: true }),
      wbEntry(2, '{{getvar::b}}', { order: 100, constant: false }),
      wbEntry(3, '{{setvar::c::v}}', { order: 10, disabled: true }), // disabled 跳过
    ];
    const u = useVarNav(
      {
        preset: null,
        character: null,
        worldbook: { order: () => [], entries: () => entries, worldbookName: () => 'W' },
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    const all = [...u.localRefs.value, ...u.globalRefs.value];
    expect(all.find((o) => o.varName === 'c')).toBeUndefined(); // disabled 跳过
    const opB = all.find((o) => o.varName === 'b')!;
    expect(opB.source.domain).toBe('worldbook');
    expect(opB.certain).toBe(false); // 非 constant
    const opA = all.find((o) => o.varName === 'a')!;
    expect(opA.certain).toBe(true); // constant
    // order=100 > 50 → intraOrder=0 < 1
    expect(opB.assemblyOrder.intraOrder).toBe(0);
    expect(opA.assemblyOrder.intraOrder).toBe(1);
  });

  it('sortByAssembly：worldbook → character → preset 装配顺序', () => {
    const char = makeCharacter({ description: '{{setvar::mid::v}}' });
    const prompts: PresetBlock[] = [block('p1', '{{setvar::late::v}}')];
    const order: OrderNode[] = [leaf('p1', true)];
    const entries: WorldbookEntry[] = [
      wbEntry(1, '{{setvar::early::v}}', { order: 100, constant: true }),
    ];
    const u = useVarNav(
      {
        preset: { order: () => order, prompts: () => prompts, presetName: () => 'P' },
        character: {
          character: () => char,
          greetingIds: () => [],
          greetingKey: () => 'x',
          fieldOrder: CHAR_FIELDS,
        },
        worldbook: { order: () => [], entries: () => entries, worldbookName: () => 'W' },
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    const local = u.localRefs.value;
    expect(local.map((o) => o.varName)).toEqual(['early', 'mid', 'late']);
    expect(local[0].assemblyOrder.layer).toBe('worldbook');
    expect(local[1].assemblyOrder.layer).toBe('character');
    expect(local[2].assemblyOrder.layer).toBe('preset');
  });

  it('sortByAssembly 同 layer 内按 intraOrder 升序', () => {
    const prompts: PresetBlock[] = [
      block('b1', '{{setvar::z::v}}'), // intraOrder=0
      block('b2', '{{setvar::a::v}}'), // intraOrder=1
    ];
    const order: OrderNode[] = [leaf('b1', true), leaf('b2', true)];
    const u = useVarNav(
      {
        preset: { order: () => order, prompts: () => prompts, presetName: () => 'P' },
        character: null,
        worldbook: null,
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    const local = u.localRefs.value;
    expect(local[0].varName).toBe('z');
    expect(local[0].assemblyOrder.intraOrder).toBe(0);
    expect(local[1].varName).toBe('a');
  });

  it('sortByAssembly 同 layer 同 intraOrder 按 varName localeCompare 赛定', () => {
    const prompts: PresetBlock[] = [block('b1', '{{setvar::apple::v}}{{setvar::zebra::v}}')];
    const order: OrderNode[] = [leaf('b1', true)];
    const u = useVarNav(
      {
        preset: { order: () => order, prompts: () => prompts, presetName: () => 'P' },
        character: null,
        worldbook: null,
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    const local = u.localRefs.value;
    expect(local.map((o) => o.varName)).toEqual(['apple', 'zebra']);
  });
});

describe('useVarNav - filterVarNav', () => {
  function setupBasic(): ReturnType<typeof useVarNav> {
    const prompts: PresetBlock[] = [block('b1', '{{setvar::apple::v}}{{setvar::banana::v}}')];
    const order: OrderNode[] = [leaf('b1', true)];
    return useVarNav(
      {
        preset: { order: () => order, prompts: () => prompts, presetName: () => 'P' },
        character: null,
        worldbook: null,
      },
      { onJump: vi.fn() }
    );
  }

  it('初始 rebuild 后 localFiltered == 全量', () => {
    const u = setupBasic();
    u.rebuildVarIndex();
    expect(u.localFiltered.value.map((o) => o.varName).sort()).toEqual(['apple', 'banana']);
  });

  it('设 varFilterQ 后按 varName 子串大小写不敏感过滤', () => {
    const u = setupBasic();
    u.rebuildVarIndex();
    u.varFilterQ.value = 'APP';
    u.filterVarNav(); // watch(varFilterQ) 在 nextTick 触发，测试里显式调用避免等待
    expect(u.localFiltered.value.map((o) => o.varName)).toEqual(['apple']);
  });

  it('空串 (trim 后) 不过滤、返回全量拷贝', () => {
    const u = setupBasic();
    u.rebuildVarIndex();
    u.varFilterQ.value = '   ';
    expect(u.localFiltered.value.length).toBe(2);
  });

  it('varIdx 在 filter 后重置为 -1', () => {
    const u = setupBasic();
    u.rebuildVarIndex();
    u.varIdx.value = 5;
    u.varFilterQ.value = 'apple';
    u.filterVarNav();
    expect(u.varIdx.value).toBe(-1);
  });

  it('global 域同步过滤', () => {
    const prompts: PresetBlock[] = [block('b1', '{{setglobalvar::g1::v}}{{setglobalvar::g2::v}}')];
    const order: OrderNode[] = [leaf('b1', true)];
    const u = useVarNav(
      {
        preset: { order: () => order, prompts: () => prompts, presetName: () => 'P' },
        character: null,
        worldbook: null,
      },
      { onJump: vi.fn() }
    );
    u.rebuildVarIndex();
    u.varFilterQ.value = 'g1';
    u.filterVarNav();
    expect(u.globalFiltered.value.map((o) => o.varName)).toEqual(['g1']);
  });
});

describe('useVarNav - navVar / jumpToVarOp', () => {
  it('navVar 在 filtered 列表上循环跳转并调 onJump', () => {
    const onJump = vi.fn();
    const prompts: PresetBlock[] = [
      block('b1', '{{setvar::a::v}}{{setvar::b::v}}{{setvar::c::v}}'),
    ];
    const order: OrderNode[] = [leaf('b1', true)];
    const u = useVarNav(
      {
        preset: { order: () => order, prompts: () => prompts, presetName: () => 'P' },
        character: null,
        worldbook: null,
      },
      { onJump }
    );
    u.rebuildVarIndex();
    u.navVar(1, 'local'); // 前进 1：(-1 + 1 + 3) % 3 = 0
    expect(u.varIdx.value).toBe(0);
    expect(onJump).toHaveBeenCalledOnce();
    const calledOp = onJump.mock.calls[0][0] as VarOp;
    expect(calledOp.varName).toBe('a');
  });

  it('navVar 空列表 no-op', () => {
    const u = useVarNav({ preset: null, character: null, worldbook: null }, { onJump: vi.fn() });
    u.rebuildVarIndex();
    u.navVar(1, 'local');
    // 不抛错
  });
});
