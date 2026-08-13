import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  esc,
  span,
  escRe,
  orderedPromptsWithHidden,
  debounce,
  findMacroEnd,
  stripMacros,
  scanVariableMacros,
  macroAwareDiff,
  wordDiff,
  applyMultiSelect,
  searchFields,
} from './utils';
import type { Preset, PromptBlock } from './types';
import type { SearchField } from './utils';

// ===== esc / span / escRe =====

describe('esc', () => {
  it('转义 & 为 &amp;', () => {
    expect(esc('a&b')).toBe('a&amp;b');
  });
  it('转义 < 为 &lt;', () => {
    expect(esc('a<b')).toBe('a&lt;b');
  });
  it('转义 > 为 &gt;', () => {
    expect(esc('a>b')).toBe('a&gt;b');
  });
  it('转义 " 为 &quot;', () => {
    expect(esc('a"b')).toBe('a&quot;b');
  });
  it('& 先转避免二次转义', () => {
    expect(esc('<&')).toBe('&lt;&amp;');
  });
  it('不转义单引号', () => {
    expect(esc("a'b")).toBe("a'b");
  });
  it('全部混合按顺序转义', () => {
    expect(esc('a<b>"&c')).toBe('a&lt;b&gt;&quot;&amp;c');
  });
  it('空串返回空串', () => {
    expect(esc('')).toBe('');
  });
});

describe('span', () => {
  it('拼 span class 包装', () => {
    expect(span('hl', 'inner')).toBe('<span class="hl">inner</span>');
  });
  it('空 class', () => {
    expect(span('', 'x')).toBe('<span class="">x</span>');
  });
});

describe('escRe', () => {
  it('转义正则元字符 . * + ? ^ $ {} () | [] \\', () => {
    expect(escRe('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o'
    );
  });
  it('普通字母数字不转义', () => {
    expect(escRe('abc123')).toBe('abc123');
  });
  it('空串返回空串', () => {
    expect(escRe('')).toBe('');
  });
});

// ===== orderedPromptsWithHidden =====

function mkBlock(identifier: string, name = identifier): PromptBlock {
  return {
    identifier,
    name,
    content: '',
    role: 'system',
    system_prompt: false,
    marker: false,
    enabled: true,
    injectionPosition: 0,
    injectionDepth: 0,
    injectionOrder: 0,
  };
}

function mkData(prompts: PromptBlock[]): Preset {
  return {
    name: 'test',
    settings: {
      openai_max_context: 0,
      openai_max_tokens: 0,
      n: 1,
      stream_openai: false,
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
    },
    prompts,
    regexs: [],
    scripts: [],
  };
}

describe('orderedPromptsWithHidden', () => {
  it('按 prompts 数组顺序返回，hidden 恒 false', () => {
    const a = mkBlock('a');
    const b = mkBlock('b');
    const c = mkBlock('c');
    const out = orderedPromptsWithHidden(mkData([a, b, c]));
    expect(out.map((e) => [e.block.identifier, e.hidden])).toEqual([
      ['a', false],
      ['b', false],
      ['c', false],
    ]);
  });

  it('空 prompts → 空数组', () => {
    expect(orderedPromptsWithHidden(mkData([]))).toEqual([]);
  });
});

// ===== debounce =====

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('延迟 ms 后才调用', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    expect(fn).not.toBeCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toBeCalledTimes(1);
  });

  it('连续调用只执行最后一次（trailing）', () => {
    const fn = vi.fn((..._a: never[]) => {
      //记录参数
    });
    const d = debounce(fn, 100);
    d(1 as never);
    d(2 as never);
    d(3 as never);
    vi.advanceTimersByTime(100);
    expect(fn).toBeCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe(3);
  });

  it('触发后再次调用重新计时', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(50);
    d();
    vi.advanceTimersByTime(50);
    expect(fn).not.toBeCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toBeCalledTimes(1);
  });

  it('clearTimeout：两次调用之间若定时器已 reset，不会提前触发', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(99);
    expect(fn).not.toBeCalled();
    d();
    vi.advanceTimersByTime(99);
    expect(fn).not.toBeCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toBeCalledTimes(1);
  });
});

// ===== findMacroEnd / stripMacros =====

describe('findMacroEnd', () => {
  it('{{x}} → 返回闭合 }} 之后那个 index', () => {
    expect(findMacroEnd('{{x}}', 0)).toBe('{{x}}'.length);
  });
  it('start 指向 {{ 起始，从 start+2 开始扫描', () => {
    const text = 'ab{{cd}}ef';
    expect(findMacroEnd(text, 2)).toBe(8);
  });
  it('嵌套 {{...{{...}}...}} → depth 正确', () => {
    const text = '{{a{{b}}c}}';
    expect(findMacroEnd(text, 0)).toBe(text.length);
  });
  it('未闭合 → 返回 -1', () => {
    expect(findMacroEnd('{{abc', 0)).toBe(-1);
  });
  it('闭合后再多余字符不影响（返回 }} 之后 index）', () => {
    // {{x}}tail: }} at idx 3-4, returns j=5
    expect(findMacroEnd('{{x}}tail', 0)).toBe(5);
  });
  it('单 } 不闭合（需 }}）', () => {
    // text = '{{a}b}}' → j=2 走 'a'(j=3), '}' 单字符（j=4）, 然后到串尾 depth=1 → -1
    // 但 text '{{a}}' → '} } ' 是 } + } → depth--
    expect(findMacroEnd('{{a}b}}', 0)).toBe('{{a}b}}'.length);
  });
});

describe('stripMacros', () => {
  it('整体移除每个 {{...}} macro span', () => {
    expect(stripMacros('ab{{x}}cd')).toBe('abcd');
  });
  it('多个 macro 全移除', () => {
    expect(stripMacros('{{a}}b{{c}}d')).toBe('bd');
  });
  it('未闭合的 {{ 视为普通文本保留', () => {
    expect(stripMacros('{{abc')).toBe('{{abc');
  });
  it('嵌套 macro 整段丢弃', () => {
    expect(stripMacros('{{a{{b}}c}}')).toBe('');
  });
  it('无 macro → 原文', () => {
    expect(stripMacros('hello')).toBe('hello');
  });
  it('空串 → 空串', () => {
    expect(stripMacros('')).toBe('');
  });
  it('macro 紧贴首尾', () => {
    expect(stripMacros('{{x}}tail')).toBe('tail');
    expect(stripMacros('head{{x}}')).toBe('head');
  });
});

// ===== scanVariableMacros =====

describe('scanVariableMacros', () => {
  it('setvar::name::value → set/local + varName + varValue', () => {
    const out = scanVariableMacros('{{setvar::hp::10}}');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'set',
      scope: 'local',
      varName: 'hp',
      varValue: '10',
    });
    expect(out[0].pos).toBe(0);
    expect(out[0].end).toBe('{{setvar::hp::10}}'.length);
  });

  it('getvar::name → get/local，varValue 恒空', () => {
    const out = scanVariableMacros('{{getvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'get', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('addvar::name::value → add/local + hasValue', () => {
    const out = scanVariableMacros('{{addvar::hp::5}}');
    expect(out[0]).toMatchObject({ kind: 'add', scope: 'local', varName: 'hp', varValue: '5' });
  });

  it('incvar::name → inc/local，无值', () => {
    const out = scanVariableMacros('{{incvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'inc', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('decvar::name → dec/local', () => {
    const out = scanVariableMacros('{{decvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'dec', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('setglobalvar::name::value → set/global', () => {
    const out = scanVariableMacros('{{setglobalvar::hp::10}}');
    expect(out[0]).toMatchObject({ kind: 'set', scope: 'global', varName: 'hp', varValue: '10' });
  });

  it('getglobalvar::name → get/global', () => {
    const out = scanVariableMacros('{{getglobalvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'get', scope: 'global', varName: 'hp', varValue: '' });
  });

  it('addglobalvar::name::value → add/global', () => {
    const out = scanVariableMacros('{{addglobalvar::hp::5}}');
    expect(out[0]).toMatchObject({ kind: 'add', scope: 'global', varName: 'hp', varValue: '5' });
  });

  it('incglobalvar::name → inc/global', () => {
    const out = scanVariableMacros('{{incglobalvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'inc', scope: 'global', varName: 'hp', varValue: '' });
  });

  it('decglobalvar::name → dec/global', () => {
    const out = scanVariableMacros('{{decglobalvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'dec', scope: 'global', varName: 'hp', varValue: '' });
  });

  it('hasvar::name → has/local', () => {
    const out = scanVariableMacros('{{hasvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'has', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('hasglobalvar::name → has/global', () => {
    const out = scanVariableMacros('{{hasglobalvar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'has', scope: 'global', varName: 'hp', varValue: '' });
  });

  it('deletevar::name → delete/local', () => {
    const out = scanVariableMacros('{{deletevar::hp}}');
    expect(out[0]).toMatchObject({ kind: 'delete', scope: 'local', varName: 'hp', varValue: '' });
  });

  it('varName 被 trim', () => {
    const out = scanVariableMacros('{{setvar:: hp ::10}}');
    expect(out[0].varName).toBe('hp');
  });

  it('跨行定位 line/col（line=换行数 0-based，col=名字列 0-based）', () => {
    const text = '\n\n{{getvar::hp}}';
    const out = scanVariableMacros(text);
    expect(out[0].line).toBe(2);
    // {{ 在 index 2，名字 hp 在 index 2+2+8('getvar::')=12，lastNl=1，col=12-1-1=10
    expect(out[0].col).toBe(10);
  });

  it('第一行无换行时 col 正确', () => {
    const text = '{{setvar::hp::10}}';
    const out = scanVariableMacros(text);
    // lastNl=-1，after=2+8=10，col=10-(-1)-1=10
    expect(out[0].col).toBe(10);
    expect(out[0].line).toBe(0);
  });

  it('未闭合 macro 不报告', () => {
    expect(scanVariableMacros('{{setvar::hp::10')).toEqual([]);
  });

  it('非 13 种前缀的 macro 不报告，但递归进 args 继续找嵌套 var op', () => {
    const out = scanVariableMacros('{{trim::{{getvar::hp}}}}');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'get', scope: 'local', varName: 'hp' });
  });

  it('set/add 值内嵌套 var op 递归报告', () => {
    const out = scanVariableMacros('{{setvar::a::{{getvar::b}}}}');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: 'set', scope: 'local', varName: 'a' });
    expect(out[1]).toMatchObject({ kind: 'get', scope: 'local', varName: 'b' });
  });

  it('set/add 缺 :: 分隔符 → 不匹配该前缀，视为其他宏递归', () => {
    const out = scanVariableMacros('{{setvar::hp}}');
    // 没 :: 分隔 → break → matched=false → 递归进 inner 找嵌套（无）→ 空
    expect(out).toEqual([]);
  });

  it('普通文本中无 macro → 空', () => {
    expect(scanVariableMacros('hello world')).toEqual([]);
  });

  it('多 macro 各独立报告', () => {
    const out = scanVariableMacros('{{getvar::a}}{{getvar::b}}');
    expect(out).toHaveLength(2);
    expect(out[0].varName).toBe('a');
    expect(out[1].varName).toBe('b');
  });

  it('误报防护：越界 macro（end 超出当前递归范围）不报告', () => {
    // outer macro 未闭合但 inner 合法 —— outer end=-1 不报告，inner 也被跳过
    const out = scanVariableMacros('{{ {{getvar::a}} }}');
    // {{ 后空格，不是 {{ → 单 { 字符扫描，inner {{getvar::a}} 合法闭合会被找到
    expect(out).toHaveLength(1);
    expect(out[0].varName).toBe('a');
  });
});

// ===== macroAwareDiff =====

describe('macroAwareDiff', () => {
  it('无 macro → 回退 wordDiff', () => {
    const out = macroAwareDiff('hello', 'hello world');
    // 'hello' vs 'hello world'：prefix trim 命中 'hello'，suffix 空，mid A 空 B=[' world']
    // → 整段 added
    expect(out.some((s) => s.added)).toBe(true);
    expect(out.map((s) => s.text).join('')).toBe('hello world');
  });

  it('字面片段锚定 + macro 展开标 added', () => {
    const raw = 'A{{trim}}B';
    const rendered = 'A trimmedB';
    const out = macroAwareDiff(raw, rendered);
    // pieces = ['A', 'B']，A 在 rendered idx0，B 在 idx8
    // gap ' trimmed' 标 added:true，A 和 B added:false
    const joined = out.map((s) => s.text).join('');
    expect(joined).toBe('A trimmedB');
    expect(out.find((s) => s.text === ' trimmed')).toBeTruthy();
    expect(out.find((s) => s.text === ' trimmed')!.added).toBe(true);
  });

  it('trim 重试：边缘 macro 吃空白 → piece.trim() 呍中', () => {
    const raw = ' {{trim}} ';
    const rendered = 'trimmed';
    // pieces = [' ', ' ']，trim 后都是空 → 跳过 → 尾随 macro 展开
    const out = macroAwareDiff(raw, rendered);
    expect(out.map((s) => s.text).join('')).toBe('trimmed');
    expect(out[0].added).toBe(true);
  });

  it('raw 以 macro 结尾 → 尾随展开标 added', () => {
    const raw = 'A{{trim}}';
    const rendered = 'A trimmed';
    const out = macroAwareDiff(raw, rendered);
    // pieces=['A','']，A 锚 idx0，空片段跳过，cursor=1 < rendered.length → 尾随 ' trimmed' added
    expect(out.map((s) => s.text).join('')).toBe('A trimmed');
    expect(out.find((s) => s.text === ' trimmed')!.added).toBe(true);
  });

  it('字面片段找不到 → 回退 wordDiff(piece, rendered.slice(cursor))', () => {
    const raw = 'A{{unknown}}B';
    const rendered = 'completely different';
    // pieces=['A','B']，A 找不到(trim 'A' 也找不到) → wordDiff('A', rendered) → 整段 added
    // cursor=rendered.length → B 回退 wordDiff('B','')→ 空
    const out = macroAwareDiff(raw, rendered);
    expect(out.map((s) => s.text).join('')).toBe('completely different');
    expect(out.every((s) => s.added)).toBe(true);
  });

  it('空片段（相邻 macro）跳过', () => {
    const raw = '{{trim}}{{trim}}';
    const rendered = 'ab';
    // pieces=['','','']，全空跳过 → cursor=0 < length → 尾随 'ab' added
    const out = macroAwareDiff(raw, rendered);
    expect(out.map((s) => s.text).join('')).toBe('ab');
    expect(out[0].added).toBe(true);
  });
});

// ===== wordDiff =====

describe('wordDiff', () => {
  it('完全相同 → 全 matched（added:false）', () => {
    const out = wordDiff('hello', 'hello');
    expect(out.every((s) => !s.added)).toBe(true);
    expect(out.map((s) => s.text).join('')).toBe('hello');
  });

  it('整行新增 → 全 added', () => {
    const out = wordDiff('', 'hello world');
    expect(out.every((s) => s.added)).toBe(true);
    expect(out.map((s) => s.text).join('')).toBe('hello world');
  });

  it('整行删除（b 空）→ 空数组', () => {
    const out = wordDiff('hello', '');
    expect(out).toEqual([]);
  });

  it('末尾追加：prefix trim 命中前面相同段，余 added', () => {
    const out = wordDiff('hello', 'hello world');
    expect(out.map((s) => s.text).join('')).toBe('hello world');
    expect(out.find((s) => s.text === 'hello')!.added).toBe(false);
    expect(out.find((s) => s.text === ' world')!.added).toBe(true);
  });

  it('中部替换：前缀后缀 trim，中间 diff', () => {
    const out = wordDiff('hello world', 'hello earth world');
    expect(out.map((s) => s.text).join('')).toBe('hello earth world');
    expect(out.find((s) => s.text === 'earth ')!.added).toBe(true);
  });

  it('LCS 边界：完全不同 token → 整段 added', () => {
    const out = wordDiff('aaa', 'bbb');
    expect(out.every((s) => s.added)).toBe(true);
    expect(out.map((s) => s.text).join('')).toBe('bbb');
  });

  it('CJK 逐字符对齐', () => {
    const out = wordDiff('你好世界', '你好啊世界');
    expect(out.map((s) => s.text).join('')).toBe('你好啊世界');
    expect(out.find((s) => s.text === '啊')!.added).toBe(true);
  });

  it('Latin 词原子化', () => {
    const out = wordDiff('foo bar', 'foo baz bar');
    expect(out.map((s) => s.text).join('')).toBe('foo baz bar');
    expect(out.find((s) => s.text === 'baz ')!.added).toBe(true);
  });
});

// ===== applyMultiSelect =====

describe('applyMultiSelect', () => {
  function state(
    selected: number[],
    anchor: number | null
  ): { selected: Set<number>; anchor: number | null } {
    return { selected: new Set(selected), anchor };
  }
  const all = [1, 2, 3, 4, 5];

  describe('plain click（无 ctrl/shift）', () => {
    it('选中仅此行（清空其它）', () => {
      const out = applyMultiSelect(state([3], 3), 1, all, {});
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.size).toBe(1);
      expect(out.anchor).toBe(1);
    });
    it('再点同一行（已是唯一选中）→ 清空', () => {
      const out = applyMultiSelect(state([1], 1), 1, all, {});
      expect(out.selected.size).toBe(0);
      expect(out.anchor).toBeNull();
    });
    it('多选时点某行 → 仅剩此行', () => {
      const out = applyMultiSelect(state([1, 2, 3], 1), 2, all, {});
      expect(out.selected.has(2)).toBe(true);
      expect(out.selected.size).toBe(1);
    });
  });

  describe('ctrl+click', () => {
    it('toggle 加入', () => {
      const out = applyMultiSelect(state([1], 1), 2, all, { ctrl: true });
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.has(2)).toBe(true);
      expect(out.anchor).toBe(2);
    });
    it('toggle 移除', () => {
      const out = applyMultiSelect(state([1, 2], 1), 1, all, { ctrl: true });
      expect(out.selected.has(1)).toBe(false);
      expect(out.selected.has(2)).toBe(true);
      expect(out.anchor).toBe(1);
    });
    it('从空选中加选', () => {
      const out = applyMultiSelect(state([], null), 1, all, { ctrl: true });
      expect(out.selected.has(1)).toBe(true);
    });
  });

  describe('shift+click', () => {
    it('anchor 到点击行区间全选（含两端）', () => {
      const out = applyMultiSelect(state([1], 1), 3, all, { shift: true });
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.has(2)).toBe(true);
      expect(out.selected.has(3)).toBe(true);
      expect(out.selected.size).toBe(3);
      expect(out.anchor).toBe(1);
    });
    it('anchor 在点击行之后 → 反向区间', () => {
      const out = applyMultiSelect(state([4], 4), 2, all, { shift: true });
      expect(out.selected.has(2)).toBe(true);
      expect(out.selected.has(3)).toBe(true);
      expect(out.selected.has(4)).toBe(true);
    });
    it('anchor === null → no-op 返回原 state', () => {
      const s = state([], null);
      const out = applyMultiSelect(s, 2, all, { shift: true });
      expect(out).toBe(s);
    });
    it('anchor 不在 all 中 → no-op', () => {
      const s = state([99], 99);
      const out = applyMultiSelect(s, 2, all, { shift: true });
      expect(out).toBe(s);
    });
    it('点击行不在 all 中 → no-op', () => {
      const s = state([1], 1);
      const out = applyMultiSelect(s, 99, all, { shift: true });
      expect(out).toBe(s);
    });
  });

  describe('混合 ctrl+shift', () => {
    it('ctrl+shift 都 true → 走 shift 分支（hasShift 优先）', () => {
      const out = applyMultiSelect(state([1], 1), 3, all, { ctrl: true, shift: true });
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.has(2)).toBe(true);
      expect(out.selected.has(3)).toBe(true);
      expect(out.anchor).toBe(1);
    });
    it('shift 但无 anchor 且有 ctrl → hasShift 分支跳过 → ctrl 分支 toggle', () => {
      const out = applyMultiSelect(state([1], null), 2, all, { ctrl: true, shift: true });
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.has(2)).toBe(true);
    });
    it('shift 但无 anchor 且无 ctrl → 返回 state（no-op）', () => {
      const s = state([1], null);
      const out = applyMultiSelect(s, 2, all, { shift: true });
      expect(out).toBe(s);
    });
  });

  it('返回纯新 state 不 mutation 原 selected Set', () => {
    const s = state([1], 1);
    const out = applyMultiSelect(s, 2, all, { ctrl: true });
    expect(out.selected).not.toBe(s.selected);
    expect(s.selected.has(1)).toBe(true);
    expect(s.selected.has(2)).toBe(false);
  });
});

// ===== searchFields =====

describe('searchFields', () => {
  function fields(...f: SearchField[]): SearchField[] {
    return f;
  }

  it('空 query → 返回空数组', () => {
    expect(
      searchFields(
        [{ id: 'a', name: 'A' }],
        fields({ key: 'name', labelKey: 'x', kind: 'text' }),
        ''
      )
    ).toEqual([]);
  });

  it('大小写不敏感命中', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 'Hello World' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'hello'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].col).toBe(0);
    expect(hits[0].line).toBe(0);
  });

  it('text 字段多行：line=行号 col=行内列', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 'a\nbb\nccc' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'c'
    );
    // 只有第三行 'ccc' 含 c → line=2，col=0
    expect(hits).toHaveLength(3); // 'ccc' 含 3 个 c，重叠命中
    expect(hits.every((h) => h.line === 2)).toBe(true);
    expect(hits[0].col).toBe(0);
    expect(hits[1].col).toBe(1);
    expect(hits[2].col).toBe(2);
  });

  it('list 字段：逐元素按行搜，line=元素下标', () => {
    const hits = searchFields(
      [{ identifier: 'b1', keys: ['foo', 'bar baz'] }],
      fields({ key: 'keys', labelKey: 'x', kind: 'list' }),
      'bar'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(1);
    expect(hits[0].col).toBe(0);
  });

  it('enum 字段：整值精确大小写敏感匹配，line/col=-1', () => {
    const hits = searchFields(
      [{ identifier: 'b1', role: 'user' }],
      fields({ key: 'role', labelKey: 'x', kind: 'enum' }),
      'user'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(-1);
    expect(hits[0].col).toBe(-1);
    expect(hits[0].ml).toBe(4);
  });

  it('enum 字段：大小写敏感不匹配 → 无命中', () => {
    const hits = searchFields(
      [{ identifier: 'b1', role: 'user' }],
      fields({ key: 'role', labelKey: 'x', kind: 'enum' }),
      'USER'
    );
    expect(hits).toHaveLength(0);
  });

  it('字段值 undefined/null → 跳过', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: undefined as unknown as string }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'x'
    );
    expect(hits).toHaveLength(0);
  });

  it('命中定位 col 是 0-based 行内列', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 'aaa bbb' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'bbb'
    );
    expect(hits[0].col).toBe(4);
  });

  it('上下文裁窗 ±30 字 + …', () => {
    const long = 'x'.repeat(10) + 'MATCH' + 'y'.repeat(10);
    const hits = searchFields(
      [{ identifier: 'b1', name: long }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'match'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].context).toContain('MATCH');
    // 短串不需裁窗 → 无省略号
    expect(hits[0].ms).toBe(10);
  });

  it('长串上下文两端补 …', () => {
    const long = 'x'.repeat(50) + 'MATCH' + 'y'.repeat(50);
    const hits = searchFields(
      [{ identifier: 'b1', name: long }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'match'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].context.startsWith('…')).toBe(true);
    expect(hits[0].context.endsWith('…')).toBe(true);
  });

  it('自定义 getItemMeta 提供 itemId/itemName', () => {
    const hits = searchFields(
      [{ id: 'b1', scriptName: 'Script1' }],
      fields({ key: 'scriptName', labelKey: 'x', kind: 'text' }),
      'Script1'
    );
    // 默认 getItemMeta：id=scriptName fallback chain
    expect(hits).toHaveLength(1);
  });

  it('多 item × 多 field', () => {
    const hits = searchFields(
      [
        { identifier: 'b1', name: 'alpha', role: 'user' },
        { identifier: 'b2', name: 'beta', role: 'assistant' },
      ],
      fields(
        { key: 'name', labelKey: 'x', kind: 'text' },
        { key: 'role', labelKey: 'x', kind: 'enum' }
      ),
      'user'
    );
    // text 'name' 搜 'user' 无命中；enum 'role' 'user' 精确命中 1
    expect(hits).toHaveLength(1);
    expect(hits[0].itemId).toBe('b1');
    expect(hits[0].fieldKey).toBe('role');
  });

  it('null item 跳过', () => {
    const hits = searchFields(
      [null as unknown as Record<string, unknown>, { identifier: 'b1', name: 'hello' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'hello'
    );
    expect(hits).toHaveLength(1);
  });

  it('list 字段值不是数组 → 跳过', () => {
    const hits = searchFields(
      [{ identifier: 'b1', keys: 'not array' }],
      fields({ key: 'keys', labelKey: 'x', kind: 'list' }),
      'array'
    );
    expect(hits).toHaveLength(0);
  });

  it('text 字段值非 string → 跳过', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 123 }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      '123'
    );
    expect(hits).toHaveLength(0);
  });

  it('重叠命中都报告（si=f+1）', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 'aa' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'a'
    );
    expect(hits).toHaveLength(2);
    expect(hits[0].col).toBe(0);
    expect(hits[1].col).toBe(1);
  });
});
