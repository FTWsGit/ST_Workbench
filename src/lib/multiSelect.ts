export interface MultiSelectState<T> {
  selected: Set<T>;
  anchor: T | null;
}

/**
 * 共享的 plain/ctrl/shift 多选语义——主编辑器 block list（Sidebar.vue，经 presetStore selectBlock）
 * 与 CopyPanel.vue 两份独立 block list 共用同一套点击模型。
 *
 * `id`：caller 用来标识可选行的东西（主侧栏是 flatNodes 数值 index，CopyPanel 是 string block identifier）。
 * `all`：列表当前屏幕顺序下的全部可选 id——仅 shift-range 情况需要，按视觉顺序从 anchor 走到点击行，
 * 而非对 id 直接做 Math.min/max（后者只对连续整数 id 成立）。
 *
 * 语义（镜像 presetStore selectBlock()）：
 *  - plain click：若此行是唯一选中行，再点一次清空选中；否则选中变为仅此行，它也成为新 anchor。
 *  - ctrl+click：在现有选中里 toggle 此行；无论加入还是移除都成为新 anchor。
 *  - shift+click：需已有 anchor（否则 no-op）——选 anchor 与此行之间的所有行（含两端，按 `all` 顺序）。
 *    anchor 本身不动，所以重复 shift-click 从同一固定起点继续扩展/收缩范围。
 *
 * Pure/无 mutation——caller 把返回 state 赋回自己的 ref，对 Pinia store action 或组件本地 ref 都一样。
 */
export function applyMultiSelect<T>(
  state: MultiSelectState<T>,
  id: T,
  all: T[],
  opts: { ctrl?: boolean; shift?: boolean }
): MultiSelectState<T> {
  const hasCtrl = opts.ctrl ?? false;
  const hasShift = opts.shift ?? false;
  if (!hasCtrl && !hasShift) {
    if (state.selected.size === 1 && state.selected.has(id))
      return { selected: new Set(), anchor: null };
    return { selected: new Set([id]), anchor: id };
  }
  if (hasShift && state.anchor !== null) {
    const ai = all.indexOf(state.anchor),
      bi = all.indexOf(id);
    if (ai === -1 || bi === -1) return state;
    const lo = Math.min(ai, bi),
      hi = Math.max(ai, bi);
    const next = new Set<T>();
    for (let i = lo; i <= hi; i++) next.add(all[i]);
    return { selected: next, anchor: state.anchor };
  }
  if (hasCtrl) {
    const next = new Set(state.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selected: next, anchor: id };
  }
  return state;
}
