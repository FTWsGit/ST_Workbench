/* contextManager 单元测试。
 * 外部依赖 mock：hostContext（countTokensAsync 走 ST tokenizer 的入口）。
 * generateSummary 是注入函数，直接传 vi.fn()。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* vi.mock 在顶层静态执行，不受 beforeEach 影响。模块级缓存（cachedGetTokenCountAsync/tokenFnProbed）
 * 跨测试会残留，用 vi.resetModules() 重置模块让缓存清空。 */
vi.mock('../api/hostContext', () => ({
  getCtx: () => ({}),
}));

import type { Message } from './types';
import {
  estimateTokens,
  estimateBytes,
  truncateForStorage,
  sacredFloorLength,
  shouldCompact,
  computeCompactRange,
  compactMessages,
  overflowFallback,
} from './contextManager';

/* 辅助：构造消息。 */
function msg(role: Message['role'], text: string, extra: Partial<Message> = {}): Message {
  return { role, text, ...extra };
}

/* 5 条消息的标准样本（system + user + assistant + tool + user），跳过消息数量护栏（需 > 4）。 */
function standardMessages(): Message[] {
  return [
    msg('system', 'You are an assistant.'),
    msg('user', 'Hello'),
    msg('assistant', 'Hi there'),
    msg('tool', 'result data'),
    msg('user', 'Second question'),
  ];
}

/* makeMessagesWithTokens：构造总文本长度恰好产生预期 estimateTokens 字节数的消息。
 * estimateTokens = ceil(totalLen / 4)，所以 totalLen = tokens * 4 时恰好 tokens。 */
function msgsOfTotalLen(len: number): Message[] {
  return [
    msg('system', 'sys'),
    msg('user', 'u1'),
    msg('assistant', 'a1'),
    msg('tool', 't1'),
    msg('user', 'x'.repeat(Math.max(0, len - 10))),
  ];
}

beforeEach(() => {
  vi.resetModules();
});

/* ============================================================
 * estimateTokens / estimateBytes
 * ============================================================ */
describe('estimateTokens', () => {
  it('空消息列表返回 0（ceil(0/4) = 0）', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('文本总长度 8 → 2 tokens（8/4）', () => {
    const m = [msg('user', 'abcdabcd')]; // 8 字节
    expect(estimateTokens(m)).toBe(2);
  });

  it('文本总长度 9 → 3 tokens（向上取整）', () => {
    const m = [msg('user', 'abcdabcd1')]; // 9 字节
    expect(estimateTokens(m)).toBe(3);
  });

  it('toolCalls 的 arguments + name 也计入', () => {
    const m: Message[] = [
      msg('assistant', 'x', {
        toolCalls: [{ id: 'c1', name: 'list_presets', arguments: '{"filter":"a"}' }],
      }),
    ];
    // text=1 + arguments=13 + name=12 = 26 → ceil(26/4)=7
    expect(estimateTokens(m)).toBe(7);
  });
});

describe('estimateBytes', () => {
  it('返回纯字节数（不取整）', () => {
    const m = [msg('user', 'abcde')]; // 5 字节
    expect(estimateBytes(m)).toBe(5);
  });

  it('toolCalls 也计入字节数', () => {
    const m: Message[] = [
      msg('assistant', 'x', {
        toolCalls: [{ id: 'c1', name: 'f', arguments: 'arg' }],
      }),
    ];
    // text=1 + arguments=3 + name=1 = 5
    expect(estimateBytes(m)).toBe(5);
  });

  it('空消息列表返回 0', () => {
    expect(estimateBytes([])).toBe(0);
  });
});

/* ============================================================
 * truncateForStorage（8 KiB 截断）
 * ============================================================ */
describe('truncateForStorage', () => {
  it('长度 ≤ 8192 原样返回', () => {
    const s = 'a'.repeat(8192);
    expect(truncateForStorage(s)).toBe(s);
  });

  it('长度恰为 8192 原样返回（边界）', () => {
    const s = 'a'.repeat(8192);
    expect(truncateForStorage(s)).toBe(s);
  });

  it('长度 8193 → 截到 8192 + 标记（正文不再含第 8193 字符）', () => {
    const s = 'a'.repeat(8193);
    const r = truncateForStorage(s);
    // 正文恰好 8192 字符
    expect(r.slice(0, 8192)).toBe('a'.repeat(8192));
    expect(r).toContain('truncated, original 8193 bytes');
    // 第 8193 字符不应出现在正文（被截掉）
    expect(r.slice(0, 8193)).toBe('a'.repeat(8192) + '\n');
  });

  it('标记里含原长度字节数', () => {
    const s = 'a'.repeat(10000);
    const r = truncateForStorage(s);
    expect(r).toContain('10000 bytes');
    expect(r.slice(0, 8192)).toBe('a'.repeat(8192));
    // 截断标记紧跟正文
    expect(r.endsWith('[truncated, original 10000 bytes]')).toBe(true);
  });
});

/* ============================================================
 * sacredFloorLength
 * ============================================================ */
describe('sacredFloorLength', () => {
  it('找不到真实 user 消息 → 返回 SACRED_PREFIX_MESSAGES(=2)', () => {
    const m = [msg('system', 'sys'), msg('assistant', 'hi')];
    expect(sacredFloorLength(m)).toBe(2);
  });

  it('synthetic user 不算真实 user → 返回 2', () => {
    const m = [
      msg('system', 'sys'),
      msg('user', 'synthetic', { synthetic: true }),
      msg('assistant', 'a'),
    ];
    expect(sacredFloorLength(m)).toBe(2);
  });

  it('第一条真实 user 在 index 1 → 返回 2（system + user）', () => {
    const m = [msg('system', 'sys'), msg('user', 'hello'), msg('assistant', 'a')];
    expect(sacredFloorLength(m)).toBe(2);
  });

  it('多条 system 后第一条真实 user 在 index 3 → 返回 4', () => {
    const m = [
      msg('system', 'sys1'),
      msg('system', 'sys2'),
      msg('system', 'sys3'),
      msg('user', 'hello'),
      msg('assistant', 'a'),
    ];
    expect(sacredFloorLength(m)).toBe(4);
  });

  it('空列表 → 找不到真实 user，返回 SACRED_PREFIX_MESSAGES(=2)', () => {
    // 源码：找不到真实 user 时返回 SACRED_PREFIX_MESSAGES，并非 Math.min(0,2)=0
    expect(sacredFloorLength([])).toBe(2);
  });

  it('只有一条真实 user 消息且在 index 0 → 返回 1', () => {
    const m = [msg('user', 'hello')];
    expect(sacredFloorLength(m)).toBe(1);
  });
});

/* ============================================================
 * shouldCompact
 * ============================================================ */
describe('shouldCompact', () => {
  /* 消息数量护栏：≤ SACRED_PREFIX_MESSAGES + 2 = 4 → false */
  it('消息数量 ≤ 4 → false（不 compact）', async () => {
    const m = [msg('system', 's'), msg('user', 'u'), msg('assistant', 'a'), msg('tool', 't')];
    expect(await shouldCompact(m, 1000, 0.5)).toBe(false);
  });

  it('消息数量恰好 5（> 4）不护栏，往下判', async () => {
    const m = msgsOfTotalLen(4); // 极短，不会触发 ratio
    // ratio = ceil(4/4)/1000 = 1/1000 > 0.5? false；字节远小于 256KiB → false
    expect(await shouldCompact(m, 1000, 0.5)).toBe(false);
  });

  /* 参数合法性 */
  it('非法 ratio = 0 → false', async () => {
    expect(await shouldCompact(standardMessages(), 1000, 0)).toBe(false);
  });

  it('非法 ratio < 0 → false', async () => {
    expect(await shouldCompact(standardMessages(), 1000, -0.5)).toBe(false);
  });

  it('非法 ratio = 1 → false（必须严格 < 1）', async () => {
    expect(await shouldCompact(standardMessages(), 1000, 1)).toBe(false);
  });

  it('非法 ratio > 1 → false', async () => {
    expect(await shouldCompact(standardMessages(), 1000, 1.5)).toBe(false);
  });

  it('非法 maxContextTokens = 0 → false', async () => {
    expect(await shouldCompact(standardMessages(), 0, 0.5)).toBe(false);
  });

  it('非法 maxContextTokens < 0 → false', async () => {
    expect(await shouldCompact(standardMessages(), -1, 0.5)).toBe(false);
  });

  /* ratio 边界（countTokensAsync �走回退 estimateTokens，因 hostContext mock 返回空 ctx） */
  it('tokens/maxContextTokens 恰等于 ratio → false（严格 >，等号不触发）', async () => {
    // 构造 estimateTokens = 5：总文本 20 字节 → ceil(20/4)=5
    const m = msgsOfTotalLen(20);
    // 5 / 10 = 0.5，ratio=0.5 → 0.5 > 0.5 假 → false
    expect(await shouldCompact(m, 10, 0.5)).toBe(false);
  });

  it('tokens/maxContextTokens 略大于 ratio → true', async () => {
    // 构造 estimateTokens = 6：总文本 24 字节 → ceil(24/4)=6
    const m = msgsOfTotalLen(24);
    // 6 / 10 = 0.6 > 0.5 → true
    expect(await shouldCompact(m, 10, 0.5)).toBe(true);
  });

  /* 字节硬上限 */
  it('字节 ≥ ACTIVE_SESSION_SOFT_LIMIT_BYTES(256KiB) → true', async () => {
    // 构造 262144 字节的消息体，远超 ratio 也超字节上限
    const big = 'a'.repeat(262144);
    const m: Message[] = [
      msg('system', 's'),
      msg('user', 'u'),
      msg('assistant', 'a'),
      msg('tool', 't'),
      msg('user', big),
    ];
    // estimateTokens 极大 → ratio 触发也是 true；本测试重点字节上限触发
    expect(await shouldCompact(m, 1_000_000, 0.99)).toBe(true);
  });

  it('字节恰好等于 262144 → true（≥ 即触发）', async () => {
    // 直接构造 estimateBytes = 262144：5 条消息，前 4 条短，最后一条补齐到 262144
    // shouldCompact 先算 ratio（token/maxContext），ratio 不超才会落到字节判定
    const prefixLen = 3 + 2 + 2 + 2; // sys+u1+a1+t1 = 9
    const lastLen = 262144 - prefixLen;
    const m: Message[] = [
      msg('system', 'sys'),
      msg('user', 'u1'),
      msg('assistant', 'a1'),
      msg('tool', 't1'),
      msg('user', 'x'.repeat(lastLen)),
    ];
    // 验证字节恰为 262144
    expect(estimateBytes(m)).toBe(262144);
    // maxContext 极大、ratio=0.99 → ratio 不触发；字节 262144 >= 262144 触发
    expect(await shouldCompact(m, 1_000_000_000, 0.99)).toBe(true);
  });

  it('字节恰好 262143（< 262144）且 ratio 不超 → false', async () => {
    const prefixLen = 9;
    const lastLen = 262143 - prefixLen;
    const m: Message[] = [
      msg('system', 'sys'),
      msg('user', 'u1'),
      msg('assistant', 'a1'),
      msg('tool', 't1'),
      msg('user', 'x'.repeat(lastLen)),
    ];
    expect(estimateBytes(m)).toBe(262143);
    // 262143 < 262144；tokens ≈ 65536，/1e9 ≈ 0.0000655 < 0.99 → false
    expect(await shouldCompact(m, 1_000_000_000, 0.99)).toBe(false);
  });

  it('正常短消息且 ratio 未超 → false', async () => {
    const m = msgsOfTotalLen(40); // 10 tokens
    // 10 / 1000 = 0.01 > 0.5? false；字节 40 < 256KiB → false
    expect(await shouldCompact(m, 1000, 0.5)).toBe(false);
  });
});

/* ============================================================
 * computeCompactRange
 * ============================================================ */
describe('computeCompactRange', () => {
  it('空列表 → sacredFloor=2（找不到 user 回退常量），drainTo=0（早退：sacredFloor >= length）', async () => {
    const r = await computeCompactRange([]);
    expect(r.sacredFloor).toBe(2);
    expect(r.drainTo).toBe(0);
  });

  it('只有 system 消息（无真实 user）→ sacredFloor=2，封顶 length → 早退', async () => {
    const m = [msg('system', 's'), msg('system', 's2')];
    // sacredFloorLength 返回 SACRED_PREFIX_MESSAGES=2，2 >= length=2 → 早退 drainTo=2
    const r = await computeCompactRange(m);
    expect(r.sacredFloor).toBe(2);
    expect(r.drainTo).toBe(2);
  });

  it('全部消息都在神圣前缀里 → 早退 drainTo=length', async () => {
    const m = [msg('system', 's'), msg('user', 'u')];
    // sacredFloor=2 >= length=2 → 早退
    const r = await computeCompactRange(m);
    expect(r.sacredFloor).toBe(2);
    expect(r.drainTo).toBe(2);
  });

  it('保真窗口：drainTo 之后的消息保留原文，之前抽干', async () => {
    // 5 条消息，第一条真实 user 在 index 1 → sacredFloor=2。
    // estimateTokens 走回退：总文本长度影响 fidelityTokens = floor(totalTokens * 0.3)
    const m = [
      msg('system', 'sys'), // idx 0
      msg('user', 'hello'), // idx 1 → sacredFloor=2
      msg('assistant', 'I will help'), // idx 2
      msg('tool', 'result'), // idx 3
      msg('user', 'next question'), // idx 4
    ];
    const r = await computeCompactRange(m);
    expect(r.sacredFloor).toBe(2);
    // drainTo 应 ≥ sacredFloor+1 = 3 且 ≤ length=5
    expect(r.drainTo).toBeGreaterThanOrEqual(3);
    expect(r.drainTo).toBeLessThanOrEqual(5);
  });

  it('drainTo 钳制：至少 sacredFloor+1（留一条给摘要替换）', async () => {
    // 构造 fidelityTokens 很大（保真窗口吞掉几乎所有消息），drainTo 会被钳制
    const big = 'x'.repeat(10000);
    const m = [
      msg('system', 's'),
      msg('user', 'u'),
      msg('assistant', big),
      msg('tool', 't'),
      msg('user', 'last'),
    ];
    const r = await computeCompactRange(m);
    expect(r.sacredFloor).toBe(2);
    expect(r.drainTo).toBeGreaterThanOrEqual(r.sacredFloor + 1);
  });

  it('drainTo 不超过 messages.length', async () => {
    const m = standardMessages();
    const r = await computeCompactRange(m);
    expect(r.drainTo).toBeLessThanOrEqual(m.length);
  });
});

/* ============================================================
 * compactMessages
 * ============================================================ */
describe('compactMessages', () => {
  it('不满足 shouldCompact → 原样返回 messages', async () => {
    // 消息数量 ≤ 4 → 不 compact
    const m = [msg('system', 's'), msg('user', 'u'), msg('assistant', 'a'), msg('tool', 't')];
    const gen = vi.fn();
    const result = await compactMessages(m, gen, 1000, 0.5);
    expect(result).toBe(m);
    expect(gen).not.toHaveBeenCalled();
  });

  it('触发压缩：抽干区间替换为 synthetic summary + folded + tail', async () => {
    // 构造足够触发：5 条消息 + ratio 触发
    const m = [
      msg('system', 'sys'),
      msg('user', 'hello'),
      msg('assistant', 'I will help'),
      msg('tool', 'result'),
      msg('user', 'next'),
    ];
    // estimateTokens 总文本：3+5+13+7+4=31 → ceil(31/4)=8 tokens
    // 8/10=0.8 > 0.5 → 触发
    const gen = vi.fn().mockResolvedValue('Summary of conversation');
    const result = await compactMessages(m, gen, 10, 0.5);

    // 不应原样返回（应已压缩）
    expect(result).not.toBe(m);
    // 应含 synthetic system 消息（previous_summary tag）
    const synth = result.find(
      (x) => x.synthetic && x.role === 'system' && x.text.includes('<previous_summary>')
    );
    expect(synth).toBeDefined();
    expect(synth!.text).toContain('Summary of conversation');
    // generateSummary 应被调用
    expect(gen).toHaveBeenCalled();
  });

  it('tool_result 折叠：超 2048 字节的 tool 消息折叠保留开头', async () => {
    const bigTool = 'x'.repeat(3000);
    const m = [
      msg('system', 's'),
      msg('user', 'u'),
      msg('assistant', 'a'),
      msg('tool', bigTool),
      msg('user', 'next'),
    ];
    // 触发 ratio：总文本 ~3000+ → tokens ~750+/10 > 0.5
    const gen = vi.fn().mockResolvedValue('summary');
    const result = await compactMessages(m, gen, 10, 0.5);

    // 找折叠后的 tool 消息（synthetic + 含 folded 标记）
    const folded = result.find(
      (x) => x.role === 'tool' && x.synthetic && x.text.includes('[folded, original 3000 bytes]')
    );
    expect(folded).toBeDefined();
    // 折叠后正文应只保留前 2048 字节
    expect(folded!.text.startsWith('x'.repeat(2048))).toBe(true);
  });

  it('摘要叠加：前一次 compact 产生的 summary 作为 prevSummary 传入 generateSummary', async () => {
    const prevSummaryText = '<previous_summary>\nold summary\n</previous_summary>';
    const m = [
      msg('system', 'sys'),
      msg('system', prevSummaryText, { synthetic: true }), // idx 1
      msg('user', 'hello'), // idx 2 → sacredFloor=3
      msg('assistant', 'I will help'),
      msg('user', 'next'),
    ];
    // sacredFloor=3，head = [0,3) 含旧 summary，会被删
    const gen = vi.fn().mockResolvedValue('new summary');
    const result = await compactMessages(m, gen, 10, 0.5);

    // generateSummary 第二参数（prevSummary）应是旧摘要原文
    expect(gen).toHaveBeenCalledWith(expect.any(Array), prevSummaryText);
    // 旧 summary 消息应被删（head filter）
    const oldInResult = result.some((x) => x.text === prevSummaryText);
    expect(oldInResult).toBe(false);
    // 新 summary 应含 new summary
    const newSynth = result.find(
      (x) => x.synthetic && x.role === 'system' && x.text.includes('new summary')
    );
    expect(newSynth).toBeDefined();
  });

  it('无旧摘要时 prevSummary=null', async () => {
    const m = [
      msg('system', 'sys'),
      msg('user', 'hello'),
      msg('assistant', 'I will help'),
      msg('tool', 'result'),
      msg('user', 'next'),
    ];
    const gen = vi.fn().mockResolvedValue('summary');
    await compactMessages(m, gen, 10, 0.5);
    expect(gen).toHaveBeenCalledWith(expect.any(Array), null);
  });

  it('重试回退：generateSummary 抛错 3 次后用占位文本', async () => {
    const m = [
      msg('system', 'sys'),
      msg('user', 'hello'),
      msg('assistant', 'I will help'),
      msg('tool', 'result'),
      msg('user', 'next'),
    ];
    const gen = vi.fn().mockRejectedValue(new Error('LLM fail'));
    const result = await compactMessages(m, gen, 10, 0.5);
    // 应重试 3 次
    expect(gen).toHaveBeenCalledTimes(3);
    // 占位文本应进结果
    const placeholder = result.find((x) => x.synthetic && x.text.includes('早期上下文已省略'));
    expect(placeholder).toBeDefined();
  });

  it('重试回退：有旧摘要时全失败则保留旧摘要', async () => {
    const prevSummaryText = '<previous_summary>\nold summary\n</previous_summary>';
    const m = [
      msg('system', 'sys'),
      msg('system', prevSummaryText, { synthetic: true }),
      msg('user', 'hello'),
      msg('assistant', 'I will help'),
      msg('user', 'next'),
    ];
    const gen = vi.fn().mockRejectedValue(new Error('fail'));
    const result = await compactMessages(m, gen, 10, 0.5);
    // 旧摘要内容应被保留进新 summary
    const synth = result.find(
      (x) => x.synthetic && x.role === 'system' && x.text.includes('<previous_summary>')
    );
    expect(synth).toBeDefined();
    expect(synth!.text).toContain('old summary');
  });

  it('generateSummary 返回空串视为失败，重试', async () => {
    const m = [
      msg('system', 'sys'),
      msg('user', 'hello'),
      msg('assistant', 'I will help'),
      msg('tool', 'result'),
      msg('user', 'next'),
    ];
    const gen = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('real summary');
    const result = await compactMessages(m, gen, 10, 0.5);
    expect(gen).toHaveBeenCalledTimes(3);
    const synth = result.find((x) => x.synthetic && x.text.includes('real summary'));
    expect(synth).toBeDefined();
  });

  it('区间内全是 tool 消息时仍调 generateSummary([])', async () => {
    // 构造 sacredFloor=2，drainTo=4，区间 [2,4) 全是 tool
    const m = [
      msg('system', 's'),
      msg('user', 'u'),
      msg('tool', 'r1'),
      msg('tool', 'r2'),
      msg('user', 'tail'),
    ];
    // 总文本 12 字节 → tokens=3，3/5=0.6 > 0.5 触发
    const gen = vi.fn().mockResolvedValue('summary');
    await compactMessages(m, gen, 5, 0.5);
    // generateSummary 被调用时第一个参数应是空数组（区间内无 user/assistant）
    expect(gen).toHaveBeenCalled();
    const firstCallArgs = gen.mock.calls[0];
    expect(firstCallArgs[0]).toEqual([]);
  });
});

/* ============================================================
 * overflowFallback
 * ============================================================ */
describe('overflowFallback', () => {
  it('直接转发 compactMessages（不触发压缩时返回原数组）', async () => {
    const m = [msg('system', 's'), msg('user', 'u'), msg('assistant', 'a'), msg('tool', 't')];
    const gen = vi.fn();
    const result = await overflowFallback(m, gen, 1000, 0.5);
    expect(result).toBe(m);
  });

  it('转发 compactMessages 触发压缩时走压缩流程', async () => {
    const m = [
      msg('system', 'sys'),
      msg('user', 'hello'),
      msg('assistant', 'I will help'),
      msg('tool', 'result'),
      msg('user', 'next'),
    ];
    const gen = vi.fn().mockResolvedValue('summary');
    const result = await overflowFallback(m, gen, 10, 0.5);
    expect(result).not.toBe(m);
    const synth = result.find(
      (x) => x.synthetic && x.role === 'system' && x.text.includes('<previous_summary>')
    );
    expect(synth).toBeDefined();
  });
});
