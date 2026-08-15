import { describe, it, expect } from 'vitest';
import { macroAwareDiff, wordDiff } from './diff';

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

  it('analysis：尖括号 legacy 宏当宏处理（<USER> → 展开值标 added）', () => {
    const raw = 'Hi <USER>!';
    const rendered = 'Hi Alice!';
    const analysis = { spans: [{ start: 3, end: 9 }], softRanges: [] };
    const out = macroAwareDiff(raw, rendered, analysis);
    expect(out.map((s) => s.text).join('')).toBe('Hi Alice!');
    expect(out.find((s) => s.text === 'Hi ')!.added).toBe(false);
    expect(out.find((s) => s.text === 'Alice')!.added).toBe(true);
    expect(out.find((s) => s.text === '!')!.added).toBe(false);
  });

  it('analysis：{{if}} 块条件假 → 块内字面锚定失败跳过而非 wordDiff 吞掉后续', () => {
    const raw = 'A{{if cond}}B{{else}}C{{/if}}D';
    const rendered = 'AD';
    // spans：{{if cond}}[1,12)、{{else}}[13,21)、{{/if}}[22,29)；softRange 覆盖整块 [1,29)
    const analysis = {
      spans: [
        { start: 1, end: 12 },
        { start: 13, end: 21 },
        { start: 22, end: 29 },
      ],
      softRanges: [{ start: 1, end: 29 }],
    };
    const out = macroAwareDiff(raw, rendered, analysis);
    expect(out.map((s) => s.text).join('')).toBe('AD');
    expect(out.every((s) => !s.added)).toBe(true);
  });

  it('analysis：{{if}} 块条件真 → 保留的分支不高亮，被吃的分支跳过', () => {
    const raw = 'A{{if cond}}B{{else}}C{{/if}}D';
    const rendered = 'ABD';
    const analysis = {
      spans: [
        { start: 1, end: 12 },
        { start: 13, end: 21 },
        { start: 22, end: 29 },
      ],
      softRanges: [{ start: 1, end: 29 }],
    };
    const out = macroAwareDiff(raw, rendered, analysis);
    expect(out.map((s) => s.text).join('')).toBe('ABD');
    expect(out.every((s) => !s.added)).toBe(true);
  });

  it('analysis：未知 {{}} 不当宏 → 原样保留、不高亮', () => {
    const raw = 'A{{notamacro}}B';
    const rendered = 'A{{notamacro}}B'; // ST 对未注册宏原样保留
    const analysis = { spans: [], softRanges: [] }; // 注册过滤后无宏跨度
    const out = macroAwareDiff(raw, rendered, analysis);
    expect(out.map((s) => s.text).join('')).toBe('A{{notamacro}}B');
    expect(out.every((s) => !s.added)).toBe(true);
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
