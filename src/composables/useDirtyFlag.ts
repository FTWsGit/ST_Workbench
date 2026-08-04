import { ref } from 'vue'

/**
 * 脏标记 flag composable：`dirty` ref + `markDirty` setter 的薄壳。
 *
 * 各 domain store 的 dirty 段统一用这个——watch 列表（哪些 ref 触发脏、deep 还是 shallow）
 * 仍由各 store 自己写，因为每域的浅/深 watch 选择背后是性能权衡注释（如 presetStore 的
 * `prompts` 浅 watch 防打字卡顿），硬抽进泛型会丢上下文。
 */
export function useDirtyFlag() {
  const dirty = ref(false)
  function markDirty() { dirty.value = true }
  return { dirty, markDirty }
}
