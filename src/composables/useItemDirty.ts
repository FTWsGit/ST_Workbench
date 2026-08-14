import { ref, computed, type Ref, type ComputedRef } from 'vue';

/**
 * 按 id 追踪脏状态与基线的 composable。仿 useDirtyFlag 的"薄壳 + 各 store 自己接线"风格，
 * 但把追踪粒度从"整份文档一个 flag"细化到"每个 item（block/entry/script/greeting）一个 id"。
 *
 * 两种打脏方式并存，由调用方按域选择：
 *  - 事件驱动：改动入口显式调用 markDirty(id)（block/entry/character 字段/greeting）。
 *  - 深比对：在一个既有的 deep watch 触发时跑一次 syncFromValues(pairs) 重算（regex/tavern 叶子）。
 *
 * 基线统一深拷贝为 JSON 字符串存起来做比较（isDirty/syncFromValues 直接字符串比较，不用每次
 * 反序列化），原始基线对象另存一份供 discard() 取值写回。深拷贝用 JSON.parse(JSON.stringify(v))
 * —— 项目既有约定，structuredClone 处理不了 Vue 响应式 Proxy。
 */
export interface ItemDirtyTracker<T> {
  /** 当前所有脏 id（响应式，供侧边栏/tab 点直接订阅）。 */
  dirtyIds: Ref<Set<string>>;
  /** 是否有任一 item 脏。 */
  anyDirty: ComputedRef<boolean>;
  isDirty(id: string): boolean;
  /** 从没记录过基线 = 新建未保存（discard 时应走"删除"分支）。 */
  isNew(id: string): boolean;
  getBaseline(id: string): T | undefined;
  /** 事件驱动打标：把 id 记入 dirty 集合。新建 item 不调 setBaseline，保持 isNew。 */
  markDirty(id: string): void;
  /** 登记基线（新建一条时用）并清掉该 id 的 dirty。 */
  setBaseline(id: string, value: T): void;
  /** 深比对批量重算 dirty：对每对 [id, value]，无基线（新建）或与基线 JSON 不等则标记脏，其余清脏。 */
  syncFromValues(pairs: Iterable<[string, T]>): void;
  /** 返回基线值（深拷贝）给调用方写回；isNew 时返回 undefined（调用方据此走"删除"分支）+ 清 dirty。 */
  discard(id: string): T | undefined;
  /** 真删除时的簿记清理（防内存泄漏/脏数据复用）。 */
  remove(id: string): void;
  /** load/save 后整体重建基线，全部清 dirty。 */
  resetAll(pairs: Iterable<[string, T]>): void;
}

export function useItemDirty<T>(): ItemDirtyTracker<T> {
  const dirtyIds = ref<Set<string>>(new Set());
  // 非响应式：仅作比较与回写的数据源，不参与 UI 订阅。
  const baselineJson = new Map<string, string>();
  const baselineObj = new Map<string, T>();

  function clearDirty(id: string): void {
    if (!dirtyIds.value.has(id)) return;
    const next = new Set(dirtyIds.value);
    next.delete(id);
    dirtyIds.value = next;
  }

  const anyDirty = computed(() => dirtyIds.value.size > 0);

  function isDirty(id: string): boolean {
    return dirtyIds.value.has(id);
  }

  function isNew(id: string): boolean {
    return !baselineObj.has(id);
  }

  function getBaseline(id: string): T | undefined {
    return baselineObj.get(id);
  }

  function markDirty(id: string): void {
    if (dirtyIds.value.has(id)) return;
    const next = new Set(dirtyIds.value);
    next.add(id);
    dirtyIds.value = next;
  }

  function setBaseline(id: string, value: T): void {
    baselineJson.set(id, JSON.stringify(value));
    baselineObj.set(id, JSON.parse(JSON.stringify(value)));
    clearDirty(id);
  }

  function syncFromValues(pairs: Iterable<[string, T]>): void {
    const next = new Set<string>();
    for (const [id, value] of pairs) {
      const json = JSON.stringify(value);
      const base = baselineJson.get(id);
      if (base === undefined || base !== json) {
        next.add(id);
      }
    }
    dirtyIds.value = next;
  }

  function discard(id: string): T | undefined {
    const base = baselineObj.get(id);
    clearDirty(id);
    if (base === undefined) return undefined;
    return JSON.parse(JSON.stringify(base));
  }

  function remove(id: string): void {
    baselineJson.delete(id);
    baselineObj.delete(id);
    clearDirty(id);
  }

  function resetAll(pairs: Iterable<[string, T]>): void {
    baselineJson.clear();
    baselineObj.clear();
    for (const [id, value] of pairs) {
      baselineJson.set(id, JSON.stringify(value));
      baselineObj.set(id, JSON.parse(JSON.stringify(value)));
    }
    dirtyIds.value = new Set();
  }

  return {
    dirtyIds,
    anyDirty,
    isDirty,
    isNew,
    getBaseline,
    markDirty,
    setBaseline,
    syncFromValues,
    discard,
    remove,
    resetAll,
  };
}
