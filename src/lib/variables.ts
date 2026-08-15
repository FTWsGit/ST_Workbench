import { findMacroEnd } from './macroText';

/** 变量宏种类：10 核心（set/get/add/inc/dec × local/global）+ 3 辅助（has/hasglobal/delete）。 */
export type VarMacroKind = 'set' | 'get' | 'add' | 'inc' | 'dec' | 'has' | 'delete';
export type VarScope = 'local' | 'global';

export interface VarOpMatch {
  kind: VarMacroKind;
  scope: VarScope;
  varName: string;
  varValue: string; // 仅 set/add 携带值；其他宏恒为 ''
  pos: number; // 此 macro 起始 `{{` 在 text 中的绝对 index
  end: number; // 此 macro TRUE（嵌套感知）闭合 `}}` 之后的绝对 index
  line: number; // 0-based
  col: number; // 0-based，变量名所在列（非 `{{`），沿用 VarOp 的现有约定
}

/** 变量宏 → { kind, scope } 映射表。分隔符统一 `::`（旧引擎的 `/` 不再支持，只兼容未来）。 */
const VAR_MACRO_PREFIXES: {
  prefix: string;
  kind: VarMacroKind;
  scope: VarScope;
  hasValue: boolean;
}[] = [
  { prefix: 'setvar::', kind: 'set', scope: 'local', hasValue: true },
  { prefix: 'getvar::', kind: 'get', scope: 'local', hasValue: false },
  { prefix: 'addvar::', kind: 'add', scope: 'local', hasValue: true },
  { prefix: 'incvar::', kind: 'inc', scope: 'local', hasValue: false },
  { prefix: 'decvar::', kind: 'dec', scope: 'local', hasValue: false },
  { prefix: 'setglobalvar::', kind: 'set', scope: 'global', hasValue: true },
  { prefix: 'getglobalvar::', kind: 'get', scope: 'global', hasValue: false },
  { prefix: 'addglobalvar::', kind: 'add', scope: 'global', hasValue: true },
  { prefix: 'incglobalvar::', kind: 'inc', scope: 'global', hasValue: false },
  { prefix: 'decglobalvar::', kind: 'dec', scope: 'global', hasValue: false },
  { prefix: 'hasvar::', kind: 'has', scope: 'local', hasValue: false },
  { prefix: 'hasglobalvar::', kind: 'has', scope: 'global', hasValue: false },
  { prefix: 'deletevar::', kind: 'delete', scope: 'local', hasValue: false },
];

/** 扫描 `text` 中所有变量宏（13 种），嵌套在另一 macro 值中的也取。
 *  用深度感知的 `{{`/`}}` 匹配找到每个 macro 的 TRUE end，再递归进 set/add 的值取嵌套 var op。 */
export function scanVariableMacros(text: string): VarOpMatch[] {
  const out: VarOpMatch[] = [];

  function lineColOf(bracePos: number, nameStart: number) {
    const before = text.slice(0, bracePos);
    const line = (before.match(/\n/g) || []).length;
    const lastNl = before.lastIndexOf('\n');
    return { line, col: nameStart - lastNl - 1 };
  }

  function scan(from: number, to: number) {
    let i = from;
    while (i < to) {
      if (text[i] === '{' && text[i + 1] === '{') {
        const end = findMacroEnd(text, i);
        if (end === -1 || end > to) {
          i++;
          continue;
        }
        const innerStart = i + 2;
        const innerEnd = end - 2;
        const inner = text.slice(innerStart, innerEnd);

        let matched = false;
        for (const def of VAR_MACRO_PREFIXES) {
          if (!inner.startsWith(def.prefix)) continue;
          const after = innerStart + def.prefix.length;
          if (def.hasValue) {
            const sep = text.indexOf('::', after);
            if (sep === -1 || sep >= innerEnd) break;
            const varName = text.slice(after, sep).trim();
            const valueStart = sep + 2;
            const { line, col } = lineColOf(i, after);
            out.push({
              kind: def.kind,
              scope: def.scope,
              varName,
              varValue: text.slice(valueStart, innerEnd),
              pos: i,
              end,
              line,
              col,
            });
            scan(valueStart, innerEnd); // set/add 值内可能嵌套 var op
          } else {
            const varName = text.slice(after, innerEnd).trim();
            const { line, col } = lineColOf(i, after);
            out.push({
              kind: def.kind,
              scope: def.scope,
              varName,
              varValue: '',
              pos: i,
              end,
              line,
              col,
            });
          }
          matched = true;
          break;
        }
        if (!matched) scan(innerStart, innerEnd); // 其他 macro，其 args 内可能仍嵌套 var op

        i = end;
        continue;
      }
      i++;
    }
  }

  scan(0, text.length);
  return out;
}

/** 旧别名：scanVariableMacros 原名 findVarOps。保留以减小调用方改动 churn，但内部已 13 宏全识别。 */
export const findVarOps = scanVariableMacros;
