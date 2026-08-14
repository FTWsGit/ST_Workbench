import { ref } from 'vue';

/**
 * 脏标记 flag composable：`dirty` ref + `markDirty` setter 的薄壳。
 *
 * 各 domain store 的结构性脏统一用这个——watch 列表（哪些 ref 触发、deep 还是 shallow）仍由各 store
 * 自己写（如 presetStore/worldbookStore 的 `watch(order, markDirty, { deep: true })` 记重排/分组/启停，
 * character 由增删/重排入口显式 markDirty），硬抽进泛型会丢上下文。
 * per-item 内容脏是另一条线（useItemDirty 的 syncFromValues 深比对），不归这个 flag 管。
 */
export function useDirtyFlag() {
  const dirty = ref(false);
  function markDirty() {
    dirty.value = true;
  }
  return { dirty, markDirty };
}
