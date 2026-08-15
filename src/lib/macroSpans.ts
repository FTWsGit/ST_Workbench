/**
 * 用 ST 自己的 MacroParser（chevrotain CST）提取 raw 中的宏跨度，替代 utils.ts 里正则瞎猜的
 * splitByMacros。宏知识来自 ST 本身，与渲染端永远一致。
 *
 * 两层：
 *  - buildMacroSpans：纯函数，宏节点列表 → 宏跨度 + scoped block 区间（可独立测试）
 *  - getMacroSpans：动态 import ST 的 MacroParser/MacroRegistry（浏览器环境，decision 0010 同款 import 路径）
 *
 * 修三类误判：
 *  1. <USER> 等 legacy 尖括号宏：ST 预处理器改写为 {{user}} 再替换，diff 必须当宏
 *  2. {{if}}...{{/if}} 条件块：内部字面锚定失败时跳过而非 wordDiff 全吞（否则后续字面全部错位）
 *  3. {{不是宏}}：MacroRegistry 查不到 → 当字面，ST 原样保留，不高亮
 */

export interface MacroNodeInfo {
  /** 宏在 raw 中的半开区间 [start, end) */
  start: number;
  end: number;
  name: string;
  isClosing: boolean;
}

export interface MacroAnalysis {
  /** 普通宏 + scoped 开闭标记的源码区间，span 之间是字面片段 */
  spans: { start: number; end: number }[];
  /** scoped block 完整区间（含开闭标记与内部内容），内部字面锚定失败时跳过而非全吞 */
  softRanges: { start: number; end: number }[];
}

/** ST 预处理器 core:legacy-markers 的尖括号宏 → 注册名（大小写不敏感）。 */
const LEGACY_ANGLE_MACROS: [RegExp, string][] = [
  [/<USER>/gi, 'user'],
  [/<BOT>/gi, 'char'],
  [/<CHAR>/gi, 'char'],
  [/<GROUP>/gi, 'group'],
  [/<CHARIFNOTGROUP>/gi, 'group'],
];

/** ST 预处理器 core:legacy-time-syntax 的旧式时间宏（新语法 {{time::UTC±N}}）。 */
const LEGACY_TIME_MACRO = /{{time_UTC[+-]\d+}}/gi;

/**
 * 宏节点列表 → MacroAnalysis。节点须按 start 升序且已过滤注册检查。
 *
 * 配对规则（对齐 ST #processScopedMacros）：同名（大小写不敏感）的 opening/closing 配对成块。
 *  - 配对成功且 opening 接受 scoped（isScopedCapable）→ softRange 覆盖整块，双标记保留为宏 span
 *  - 配对成功但 opening 不接受 scoped（{{user}}...{{/user}}）→ ST 原样保留，双标记都当字面（剔除）
 *  - 未配对的 closing → ST keepRaw 原样保留，当字面（剔除）
 *  - 未配对的 opening → 仍是真宏，保留为 span
 */
export function buildMacroSpans(
  nodes: MacroNodeInfo[],
  isScopedCapable: (name: string) => boolean
): MacroAnalysis {
  const spans: { start: number; end: number }[] = [];
  const softRanges: { start: number; end: number }[] = [];
  const stack: { name: string; start: number; node: MacroNodeInfo }[] = [];
  const dropFromSpans = new Set<MacroNodeInfo>();

  for (const n of nodes) {
    if (n.isClosing) {
      let openIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name.toLowerCase() === n.name.toLowerCase()) {
          openIdx = i;
          break;
        }
      }
      if (openIdx === -1) {
        dropFromSpans.add(n);
        continue;
      }
      const open = stack[openIdx];
      stack.length = openIdx; // 弹出匹配 opening 及其上未配对的嵌套
      if (isScopedCapable(open.name)) {
        softRanges.push({ start: open.start, end: n.end });
      } else {
        dropFromSpans.add(open.node);
        dropFromSpans.add(n);
      }
    } else {
      stack.push({ name: n.name, start: n.start, node: n });
    }
  }

  for (const n of nodes) {
    if (!dropFromSpans.has(n)) spans.push({ start: n.start, end: n.end });
  }
  return { spans, softRanges };
}

/** 正则扫描 legacy 尖括号/时间宏，转成宏节点（注册名映射，走 isScopedCapable 同款规则）。 */
export function legacyNodes(raw: string): MacroNodeInfo[] {
  const nodes: MacroNodeInfo[] = [];
  for (const [re, name] of LEGACY_ANGLE_MACROS) {
    for (const m of raw.matchAll(re)) {
      nodes.push({ start: m.index!, end: m.index! + m[0].length, name, isClosing: false });
    }
  }
  for (const m of raw.matchAll(LEGACY_TIME_MACRO)) {
    nodes.push({ start: m.index!, end: m.index! + m[0].length, name: 'time', isClosing: false });
  }
  return nodes.sort((a, b) => a.start - b.start);
}

/**
 * 从 `MacroParser.parseDocument(raw).cst` 提取顶层宏节点（name / isClosing / 半开区间 [start, end)）。
 *
 * CST 顶层就是 `cst.children.macro`（chevrotain 顶层 rule 的结果没有额外 `document` 包装层，
 * 与 ST 自己的 `MacroCstWalker.#collectDocumentItems` 直取 `cst.children.macro` 一致）。宏节点 children
 * 含 `Macro.Start`/`Macro.End`（token，带 startOffset/endOffset）、`macroBody.children['Macro.identifier']`
 * （宏名）、`flags`（image==='/' 为 closing block）、`variableExpr`（变量表达式，无 macroBody，名字为空）。
 * 抽成纯函数以便用 mock CST 单测——getMacroSpans 的浏览器层无法在 node 环境验证。
 */
export function extractMacroNodes(cst: unknown): MacroNodeInfo[] {
  const macroNodes = (cst as { children?: Record<string, unknown> } | null)?.children?.macro;
  if (!Array.isArray(macroNodes)) return [];
  const out: MacroNodeInfo[] = [];
  for (const node of macroNodes as {
    children?: Record<string, Array<{ startOffset: number; endOffset: number; image?: string }>>;
  }[]) {
    const startTok = node.children?.['Macro.Start']?.[0];
    const endTok = node.children?.['Macro.End']?.[0];
    if (!startTok || !endTok) continue;
    const body = node.children?.macroBody?.[0] as
      { children?: Record<string, Array<{ image?: string }>> } | undefined;
    const ident = body?.children?.['Macro.identifier']?.[0];
    const flags = node.children?.flags ?? [];
    const name = ident?.image ?? '';
    const isClosing = flags.some((t) => t.image === '/');
    out.push({ start: startTok.startOffset, end: endTok.endOffset + 1, name, isClosing });
  }
  return out;
}

/**
 * 浏览器层：动态 import ST 的 MacroParser，parseDocument 拿 CST，提取顶层宏节点偏移。
 * 返回 null 表示 ST 宏引擎不可用（老版本 ST / import 失败）——调用方降级到旧 splitByMacros。
 */
export async function getMacroSpans(raw: string): Promise<MacroAnalysis | null> {
  let MacroParser: { parseDocument(text: string): { cst: unknown } };
  let MacroRegistry: { getMacro(name: string): unknown };
  try {
    const parserMod = await import(
      /* @vite-ignore */ '/scripts/macros/engine/MacroParser.js' as string
    );
    MacroParser = parserMod.MacroParser ?? parserMod.default;
    const registryMod = await import(
      /* @vite-ignore */ '/scripts/macros/engine/MacroRegistry.js' as string
    );
    MacroRegistry = registryMod.MacroRegistry ?? registryMod.default;
    if (!MacroParser?.parseDocument || !MacroRegistry?.getMacro) return null;
  } catch {
    return null;
  }

  const { cst } = MacroParser.parseDocument(raw);
  const nodes = extractMacroNodes(cst);
  nodes.push(...legacyNodes(raw));
  nodes.sort((a, b) => a.start - b.start);

  // 只保留注册宏（变量表达式 name 为空：ST 变量简写，必然替换，直接保留）
  const registered = nodes.filter(
    (n) => !n.name || n.isClosing || !!MacroRegistry.getMacro(n.name)
  );
  const isScopedCapable = (name: string): boolean => {
    const def = MacroRegistry.getMacro(name) as { list?: boolean } | undefined;
    if (!def) return true; // unknown macro：ST 允许 scoped
    return !def.list; // list-arg 宏不接受 scoped content
  };
  return buildMacroSpans(registered, isScopedCapable);
}
