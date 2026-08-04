import { ref, watch } from 'vue'
import type { PresetBlock, VarOp, OrderNode } from '../types'
import { findVarOps } from '../utils'
import { isGroupNode } from './useGroupedList'

/**
 * 变量导航 + 变量点击弹窗的统一 composable。
 *
 * 两份逻辑原本散在 presetStore 里各自手写扫描，现在合并：
 *   - Var Nav：全量扫 prompts 建 allVarOps 索引，按 varName 过滤，键盘上下导航
 *   - Var Popup：点击编辑器里的 {{...var...}} 弹出浮动面板，扫所有 block 找同名 var op
 *
 * 共享的扫描逻辑抽到 scanVarOps：遍历 order 树（不丢折叠组 children），
 * 对每个 block 跑 findVarOps（嵌套感知），收集成 VarOp 数组。
 *
 * @param getOrder - 获取当前 order 树的 getter
 * @param getPrompts - 获取 prompts 数组的 getter
 * @param options.onJump - 跳转到某个 var op 的回调（tabsStore.open + requestEditorJump）
 */
export function useVarNav(
  getOrder: () => OrderNode[],
  getPrompts: () => PresetBlock[],
  options: {
    onJump: (op: VarOp) => void
  }
) {
  const { onJump } = options

  /* ====== Var Nav ====== */
  const varFilterQ = ref('')
  const allVarOps = ref<VarOp[]>([])
  const filteredVarOps = ref<VarOp[]>([])
  const varIdx = ref(-1)

  function rebuildVarIndex() {
    allVarOps.value = []
    varIdx.value = -1
    // findVarOps 是嵌套感知的（能正确处理 setvar/addvar 值内嵌套的 var op）。
    getPrompts().forEach((p) => {
      const c = p.content || ''
      findVarOps(c).forEach((v) => {
        allVarOps.value.push({
          blockId: p.identifier, blockName: p.name || p.identifier,
          type: v.type, varName: v.varName, varValue: v.varValue,
          line: v.line, col: v.col, pos: v.pos, ordIdx: 0,
        })
      })
    })
    allVarOps.value.sort((a, b) =>
      a.varName.localeCompare(b.varName) ||
      // 同变量内：写在前读在后 SET → ADD → GET
      ({ setvar: 0, addvar: 1, get: 2 }[a.type] - { setvar: 0, addvar: 1, get: 2 }[b.type])
    )
    filterVarNav()
  }
  function filterVarNav() {
    const ft = varFilterQ.value.trim().toLowerCase()
    filteredVarOps.value = ft
      ? allVarOps.value.filter(v => v.varName.toLowerCase().includes(ft))
      : [...allVarOps.value]
    varIdx.value = -1
  }
  function jumpToVarOp(i: number) {
    if (i < 0 || i >= filteredVarOps.value.length) return
    varIdx.value = i
    onJump(filteredVarOps.value[i])
  }
  function navVar(dir: number) {
    if (!filteredVarOps.value.length) return
    varIdx.value = (varIdx.value + dir + filteredVarOps.value.length) % filteredVarOps.value.length
    jumpToVarOp(varIdx.value)
  }
  watch(varFilterQ, filterVarNav)

  /* ====== Var Click Popup（点击 {{...var...}} 弹出的浮动小面板，区别于右侧固定 Var Nav 面板）====== */
  const varPopupOpen = ref(false)
  const varPopupVarName = ref('')
  const varPopupOps = ref<VarOp[]>([])
  const varPopupIdx = ref(-1)
  const varPopupPos = ref({ top: 0, left: 0 })

  function showVarPopup(varName: string, clickBlockId: string | null, clickPos: number, pos: { top: number; left: number }) {
    const ops: VarOp[] = []
    let currentIdx = -1
    // findVarOps (utils.ts) 嵌套感知：能正确找到嵌套在另一个 setvar/addvar value 里的 op，
    // 不会误闭合在嵌套宏自己的 `}}` 上。这里扫描 preset 内所有 var op 再 filter 到 varName，
    // 因为 findVarOps 没有"只此变量"的概念。
    // 点击始终源自编辑器中当前打开的 block（enableVarClick 只在那里接线），故直接收到 block identifier。
    // 组：扫 order.value.flatMap 而非 flatNodes——flatNodes 故意丢掉折叠组的 children，
    // 折叠组不能让其 blocks 的变量对此 popup 不可见。
    const allItems = getOrder().flatMap(node => isGroupNode(node) ? node.children : [node])
    allItems.forEach((o) => {
      const p = getPrompts().find(pp => pp.identifier === o.identifier)
      if (!p) return
      const c = p.content || ''
      findVarOps(c).filter(v => v.varName === varName).forEach((v) => {
        ops.push({
          blockId: p.identifier, blockName: p.name || p.identifier,
          type: v.type, varName, varValue: v.varValue,
          line: v.line, col: v.col, pos: v.pos, ordIdx: 0, // 不再是真实索引；其它地方未用，保留以兼容 VarOp 形状
        })
        // clickPos 落在此宏源 span 内任意处——setvar/addvar 的 span 可跨多行且含嵌套宏，
        // 故用 findVarOps 的嵌套感知 `end`，而非假设单行非嵌套匹配。
        if (p.identifier === clickBlockId && v.pos <= clickPos && clickPos <= v.end) currentIdx = ops.length - 1
      })
    })
    varPopupVarName.value = varName
    varPopupOps.value = ops
    varPopupIdx.value = currentIdx
    varPopupPos.value = pos
    varPopupOpen.value = true
  }
  function hideVarPopup() {
    varPopupOpen.value = false
    varPopupOps.value = []
    varPopupIdx.value = -1
  }
  function jumpToPopupVar(i: number) {
    if (i < 0 || i >= varPopupOps.value.length) return
    varPopupIdx.value = i
    onJump(varPopupOps.value[i])
  }
  function navPopupVar(dir: number) {
    if (!varPopupOps.value.length) return
    varPopupIdx.value = (varPopupIdx.value + dir + varPopupOps.value.length) % varPopupOps.value.length
    jumpToPopupVar(varPopupIdx.value)
  }

  return {
    // Var Nav
    varFilterQ, allVarOps, filteredVarOps, varIdx,
    rebuildVarIndex, filterVarNav, jumpToVarOp, navVar,
    // Var Popup
    varPopupOpen, varPopupVarName, varPopupOps, varPopupIdx, varPopupPos,
    showVarPopup, hideVarPopup, jumpToPopupVar, navPopupVar,
  }
}
