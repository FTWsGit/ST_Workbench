/** 找到 `{{` 起始处匹配的 `}}` 后那个 index，处理嵌套 `{{...}}`。未匹配返回 -1。 */
export function findMacroEnd(text: string, start: number): number {
  let depth = 1,
    j = start + 2;
  while (j < text.length && depth > 0) {
    if (text[j] === '{' && text[j + 1] === '{') {
      depth++;
      j += 2;
    } else if (text[j] === '}' && text[j + 1] === '}') {
      depth--;
      j += 2;
    } else j++;
  }
  return depth === 0 ? j : -1;
}

/** 从 `text` 中整体移除每个 `{{...}}` macro span。
 *  diff 前用：macro 自身的源字符（名字、`::`、变量名）与展开值无对应关系，
 *  整段移除而非占位符替换，保证 macro 整段展开值高亮为连续 span。 */
export function stripMacros(text: string): string {
  let out = '',
    i = 0;
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i);
      if (end !== -1) {
        i = end;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}
