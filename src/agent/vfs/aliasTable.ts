/* session-scoped 短别名表：真实 id ↔ 短别名，按 `workspace:collection` 复合 key 分表。
 *
 * 为什么存在：真实 id（preset identifier / worldbook uid / regex_ 前缀 id）是长且无规律（或
 * 插入删除后位置不稳定的数字），对模型不友好；短别名是 session 内稳定、跟内容解耦的整数。
 *
 * 三条硬规则（invest §5.2）：
 *  - 首次登记后永久稳定：真实 id 已登记就沿用旧别名，插入/删除/重排都不漂移。
 *  - 别名不回收：delete 后号码永久退休（counter 只增不减），宁可报错也不悄悄指错对象。
 *  - 按 collection 分表：不同 collection 的别名互不冲突（`/preset/prompts/2` 与 `/preset/regexs/2`
 *    各自独立），符合"不同目录下数字文件名互不冲突"的直觉。
 *
 * 纯内存、不落盘，session 切换时 reset()。
 *
 * 登记时机前提：真实 id 在 create 时即定死、save 只落盘不改 id（preset identifier = custom_+Date.now()、
 * worldbook uid = max+1、regex/script id = 前缀+Date.now(36)+rand），所以 alias 在 create 返回时立即登记
 * 即可，不必等 save。若未来某 domain 的 id 变成"save 后才最终确定"，这里要改成 save 后再登记。
 */
export class AliasTable {
  private tables = new Map<
    string,
    { realToShort: Map<string, string>; shortToReal: Map<string, string>; counter: number }
  >();

  private table(collectionKey: string) {
    let t = this.tables.get(collectionKey);
    if (!t) {
      t = { realToShort: new Map(), shortToReal: new Map(), counter: 0 };
      this.tables.set(collectionKey, t);
    }
    return t;
  }

  /** 为 collection 登记一批真实 id，返回 realId → alias 映射。已登记的沿用旧别名，新 id 分配下一个整数。 */
  register(collectionKey: string, realIds: string[]): Map<string, string> {
    const t = this.table(collectionKey);
    const out = new Map<string, string>();
    for (const id of realIds) {
      let alias = t.realToShort.get(id);
      if (alias === undefined) {
        alias = String(++t.counter);
        t.realToShort.set(id, alias);
        t.shortToReal.set(alias, id);
      }
      out.set(id, alias);
    }
    return out;
  }

  /** 短别名 → 真实 id。未知别名返回 undefined（上层报"unknown alias, call list first"）。 */
  resolve(collectionKey: string, alias: string): string | undefined {
    return this.tables.get(collectionKey)?.shortToReal.get(alias);
  }

  /** 真实 id → 短别名。用于 name 消歧时给模型列候选。 */
  aliasOf(collectionKey: string, realId: string): string | undefined {
    return this.tables.get(collectionKey)?.realToShort.get(realId);
  }

  /** delete 后退休：移除双向映射，counter 不回退 → 号码永久退休，永不指向新对象。 */
  retire(collectionKey: string, realId: string): void {
    const t = this.tables.get(collectionKey);
    if (!t) return;
    const alias = t.realToShort.get(realId);
    if (alias === undefined) return;
    t.realToShort.delete(realId);
    t.shortToReal.delete(alias);
  }

  /** 清空所有表（session 切换 / reset）。 */
  reset(): void {
    this.tables.clear();
  }
}
