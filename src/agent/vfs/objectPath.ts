/* 点路径读写：'a.b.c' 形式的嵌套对象取值/赋值。纯函数。
 *
 * worldbook 等 domain 的字段是嵌套结构（strategy.keys、position.type 等），FieldSpec 的 key 用
 * 点路径寻址，getField/setField 与 searchItems 的字段取值统一走这里，避免每个 resolver 手写嵌套解构。
 */

export function getPath(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): boolean {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  if (cur === null || cur === undefined || typeof cur !== 'object') return false;
  (cur as Record<string, unknown>)[parts[parts.length - 1]] = value;
  return true;
}
