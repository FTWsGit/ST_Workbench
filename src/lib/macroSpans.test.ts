/* macroSpans 单元测试：纯函数部分（buildMacroSpans / legacyNodes）可在 node 独立跑；
 * getMacroSpans 是浏览器层（动态 import ST 模块），node 环境验证降级返回 null。
 */
import { describe, it, expect } from 'vitest';
import { buildMacroSpans, legacyNodes, getMacroSpans, extractMacroNodes } from './macroSpans';
import type { MacroNodeInfo } from './macroSpans';

const node = (start: number, end: number, name: string, isClosing = false): MacroNodeInfo => ({
  start,
  end,
  name,
  isClosing,
});

/** mock chevrotain token：只有 extractMacroNodes 用到的字段。 */
const tok = (startOffset: number, endOffset: number, image?: string) => ({
  startOffset,
  endOffset,
  image,
});

describe('buildMacroSpans', () => {
  it('普通宏 → 只产出 spans，无 softRange', () => {
    const { spans, softRanges } = buildMacroSpans(
      [node(0, 8, 'user'), node(10, 18, 'char')],
      () => false
    );
    expect(spans).toEqual([
      { start: 0, end: 8 },
      { start: 10, end: 18 },
    ]);
    expect(softRanges).toEqual([]);
  });

  it('scoped 配对：if.../if → softRange 覆盖整块，双标记保留为 span', () => {
    const { spans, softRanges } = buildMacroSpans(
      [node(0, 8, 'if'), node(20, 27, 'if', true)],
      (name) => name === 'if'
    );
    expect(spans).toEqual([
      { start: 0, end: 8 },
      { start: 20, end: 27 },
    ]);
    expect(softRanges).toEqual([{ start: 0, end: 27 }]);
  });

  it('配对成功但宏不接受 scoped（{{user}}...{{/user}}）→ 双标记都剔除（ST 原样保留）', () => {
    const { spans, softRanges } = buildMacroSpans(
      [node(0, 8, 'user'), node(20, 27, 'user', true)],
      (name) => name !== 'user'
    );
    expect(spans).toEqual([]);
    expect(softRanges).toEqual([]);
  });

  it('未配对 closing → 剔除（ST keepRaw）', () => {
    const { spans } = buildMacroSpans([node(0, 8, 'if', true)], (name) => name === 'if');
    expect(spans).toEqual([]);
  });

  it('未配对 opening → 保留为普通宏 span', () => {
    const { spans, softRanges } = buildMacroSpans([node(0, 8, 'if')], () => true);
    expect(spans).toEqual([{ start: 0, end: 8 }]);
    expect(softRanges).toEqual([]);
  });

  it('嵌套同名块 → 栈式配对', () => {
    const { softRanges } = buildMacroSpans(
      [node(0, 8, 'if'), node(10, 18, 'if'), node(20, 27, 'if', true), node(30, 37, 'if', true)],
      (name) => name === 'if'
    );
    expect(softRanges).toEqual([
      { start: 10, end: 27 },
      { start: 0, end: 37 },
    ]);
  });

  it('大小写不敏感配对', () => {
    const { softRanges } = buildMacroSpans(
      [node(0, 8, 'IF'), node(20, 27, 'if', true)],
      () => true
    );
    expect(softRanges).toEqual([{ start: 0, end: 27 }]);
  });
});

describe('legacyNodes', () => {
  it('尖括号宏 → 注册名映射', () => {
    const out = legacyNodes('Hi <USER> and <group>!');
    expect(out).toEqual([
      { start: 3, end: 9, name: 'user', isClosing: false },
      { start: 14, end: 21, name: 'group', isClosing: false },
    ]);
  });

  it('旧式时间宏 → time', () => {
    const out = legacyNodes('{{time_UTC-10}}');
    expect(out).toEqual([{ start: 0, end: 15, name: 'time', isClosing: false }]);
  });
});

describe('extractMacroNodes', () => {
  it('顶层宏直取 cst.children.macro（无 document 包装层）', () => {
    // 模拟 MacroParser.parseDocument('{{user}}{{/if}}{{.var}}').cst 的顶层结构
    const cst = {
      children: {
        macro: [
          // {{user}}：普通宏，[0,8)
          {
            children: {
              'Macro.Start': [tok(0, 1)],
              'Macro.End': [tok(6, 7)],
              macroBody: [{ children: { 'Macro.identifier': [tok(2, 5, 'user')] } }],
              flags: [],
            },
          },
          // {{/if}}：closing block，flags 含 '/'，[8,15)
          {
            children: {
              'Macro.Start': [tok(8, 9)],
              'Macro.End': [tok(13, 14)],
              macroBody: [{ children: { 'Macro.identifier': [tok(10, 11, 'if')] } }],
              flags: [tok(9, 9, '/')],
            },
          },
          // {{.var}}：变量表达式，无 macroBody → name 为空
          {
            children: {
              'Macro.Start': [tok(15, 16)],
              'Macro.End': [tok(21, 22)],
              variableExpr: [{}],
            },
          },
        ],
      },
    };
    expect(extractMacroNodes(cst)).toEqual([
      { start: 0, end: 8, name: 'user', isClosing: false },
      { start: 8, end: 15, name: 'if', isClosing: true },
      { start: 15, end: 23, name: '', isClosing: false },
    ]);
  });

  it('cst 缺 macro 键 → 空数组（防御）', () => {
    expect(extractMacroNodes({ children: {} })).toEqual([]);
    expect(extractMacroNodes(null)).toEqual([]);
  });
});

describe('getMacroSpans', () => {
  it('node 环境（无 ST 模块）→ 降级返回 null', async () => {
    expect(await getMacroSpans('hello {{user}}')).toBeNull();
  });
});
