import { ref, watch } from 'vue'
import type {
  Character, OrderNode, OrderItem, PresetBlock,
  VarOp, VarDomain, VarAssemblyLayer,
  WorldbookEntry,
} from '../types'
import { scanVariableMacros, type VarOpMatch, type VarMacroKind, type VarScope } from '../utils'
import { isGroupNode } from './useGroupedList'

/**
 * 变量追踪：跨 preset/character/worldbook 三域扫描所有变量宏（13 种），
 * 按 ST 装配管线顺序（worldbook → character → preset）摆放，local/global 分开。
 *
 * 扫描器载体无关——`scanVarSource` 拿一段字符串 + 载体元信息吐 VarOp[]。
 * 各域 store 调用 `rebuildVarIndex()` 触发重扫，输入来自三域 store 的当前数据。
 *
 * Var Popup：点编辑器里的 `{{...var...}}` 弹浮动小面板，按 varName + scope 过滤到同名引用。
 *
 * @param sources 三域扫描所需的数据 getter。任一域没打开（character/worldbook）时返回 null 即跳过。
 * @param options.onJump 跳转到某 VarOp 的回调（tabsStore.open + requestEditorJump）。
 */
export function useVarNav(
  sources: {
    preset: {
      order: () => OrderNode[]
      prompts: () => PresetBlock[]
      presetName: () => string
    } | null
    character: {
      character: () => Character | null
      greetingIds: () => string[]
      /** 虚拟字段 tab key 合成器（characterStore 已有此模式）。 */
      greetingKey: (id: string) => string
      /** 字段固定序（CHARACTER_FIELDS），intraOrder 按此序。 */
      fieldOrder: readonly { field: keyof Character | 'greeting'; labelKey: string }[]
    } | null
    worldbook: {
      order: () => OrderNode[]
      entries: () => WorldbookEntry[]
      worldbookName: () => string
    } | null
  },
  options: {
    onJump: (op: VarOp) => void
  }
) {
  const { onJump } = options

  /* ====== 扫描：载体无关的 VarOp 构造器 ====== */
  function buildVarOp(
    hit: VarOpMatch,
    domain: VarDomain,
    fileId: string,
    blockId: string,
    blockLabel: string,
    fieldName: string | undefined,
    layer: VarAssemblyLayer,
    intraOrder: number,
    certain: boolean,
  ): VarOp {
    return {
      kind: hit.kind, scope: hit.scope, varName: hit.varName, varValue: hit.varValue,
      source: { domain, fileId, blockId, fieldName, blockLabel, line: hit.line, col: hit.col, pos: hit.pos },
      assemblyOrder: { layer, intraOrder },
      certain,
    }
  }

  /* 扫 preset：按 order 树遍历（展开折叠组的 children，不丢内容），
   * 用 marker+order 合成 intraOrder——order 里下标小=装配更靠前。
   * 某 block 在 order 里 enabled=false 或处折叠组收起态，certain=false。 */
  function scanPreset(): VarOp[] {
    const p = sources.preset
    if (!p) return []
    const out: VarOp[] = []
    const prompts = p.prompts()
    const presetName = p.presetName()
    const byId = new Map(prompts.map(b => [b.identifier, b]))
    let intra = 0
    function walk(node: OrderNode) {
      if (isGroupNode(node)) {
        if (!node.collapsed) node.children.forEach(walk)
        return
      }
      const block = byId.get(node.identifier)
      if (block) {
        const certain = node.enabled !== false
        const hits = scanVariableMacros(block.content || '')
        hits.forEach(h => out.push(buildVarOp(
          h, 'preset', presetName, block.identifier, block.name || block.identifier,
          undefined, 'preset', intra, certain,
        )))
      }
      intra++
    }
    p.order().forEach(walk)
    return out
  }

  /* 扫 character：七固定字段 + greetings，按 fieldOrder 固定序。
   * character 域无 enabled 概念，所有字段恒注入 → certain=true。 */
  function scanCharacter(): VarOp[] {
    const c = sources.character
    if (!c) return []
    const char = c.character()
    if (!char) return []
    const out: VarOp[] = []
    const fileId = char.name || char.avatar || ''
    let intra = 0
    for (const f of c.fieldOrder) {
      const isGreeting = f.field === 'greeting'
      const fieldLabel = f.labelKey
      let pushHits: (hits: VarOpMatch[], blockId: string, blockLabel: string) => void
      pushHits = (hits, blockId, blockLabel) => {
        hits.forEach(h => out.push(buildVarOp(
          h, 'character', fileId, blockId, blockLabel,
          isGreeting ? 'greeting' : (f.field as string), 'character', intra, true,
        )))
      }
      if (isGreeting) {
        const ids = c.greetingIds()
        char.greetings.forEach((val, idx) => {
          const id = ids[idx]
          if (!id) return
          pushHits(scanVariableMacros(val), c.greetingKey(id), fieldLabel)
        })
      } else {
        const v = (char as any)[f.field]
        const text = typeof v === 'string' ? v
          : (v && typeof v === 'object' && 'prompt' in v) ? (v as { prompt: string }).prompt
          : ''
        pushHits(scanVariableMacros(text), `field:${String(f.field)}`, fieldLabel)
      }
      intra++
    }
    return out
  }

  /* 扫 worldbook：遍历 entries，intraOrder 按 entry.order（insertion_order）降序——
   * order 大的先注入、出现在 prompt 更靠前位置（ST 用 sortFn = (a,b)=>b.order-a.order）。
   * 激活语义决定 certain：constant=true 必触发；关键词/概率/向量化皆非必定 → certain=false。 */
  function scanWorldbook(): VarOp[] {
    const w = sources.worldbook
    if (!w) return []
    const out: VarOp[] = []
    const entries = [...w.entries()]
    // 降序：order 大的 intraOrder 小（更靠前装配）
    entries.sort((a, b) => b.order - a.order)
    entries.forEach((entry, idx) => {
      if (entry.disabled) return // 全局禁用，跳过
      const certain = !!entry.constant
      const hits = scanVariableMacros(entry.content || '')
      hits.forEach(h => out.push(buildVarOp(
        h, 'worldbook', w.worldbookName(), String(entry.uid),
        entry.comment || String(entry.uid), undefined, 'worldbook', idx, certain,
      )))
    })
    return out
  }

  /* ====== Var Nav：全量索引 ====== */
  const varFilterQ = ref('')
  /** local 域全量引用，按装配顺序（layer, intraOrder）升序。 */
  const localRefs = ref<VarOp[]>([])
  /** global 域全量引用，按装配顺序升序。 */
  const globalRefs = ref<VarOp[]>([])
  const localFiltered = ref<VarOp[]>([])
  const globalFiltered = ref<VarOp[]>([])
  const varIdx = ref(-1)

  function sortByAssembly(ops: VarOp[]): VarOp[] {
    const layerRank: Record<VarAssemblyLayer, number> = { worldbook: 0, character: 1, preset: 2 }
    return [...ops].sort((a, b) =>
      layerRank[a.assemblyOrder.layer] - layerRank[b.assemblyOrder.layer] ||
      a.assemblyOrder.intraOrder - b.assemblyOrder.intraOrder ||
      a.varName.localeCompare(b.varName),
    )
  }

  function rebuildVarIndex() {
    const all = [...scanWorldbook(), ...scanCharacter(), ...scanPreset()]
    const sorted = sortByAssembly(all)
    localRefs.value = sorted.filter(o => o.scope === 'local')
    globalRefs.value = sorted.filter(o => o.scope === 'global')
    varIdx.value = -1
    filterVarNav()
  }
  function filterVarNav() {
    const ft = varFilterQ.value.trim().toLowerCase()
    const match = (o: VarOp) => o.varName.toLowerCase().includes(ft)
    localFiltered.value = ft ? localRefs.value.filter(match) : [...localRefs.value]
    globalFiltered.value = ft ? globalRefs.value.filter(match) : [...globalRefs.value]
    varIdx.value = -1
  }
  function jumpToVarOp(o: VarOp) {
    onJump(o)
  }
  function navVar(dir: number, inList: 'local' | 'global') {
    const list = inList === 'local' ? localFiltered.value : globalFiltered.value
    if (!list.length) return
    varIdx.value = (varIdx.value + dir + list.length) % list.length
    jumpToVarOp(list[varIdx.value])
  }
  watch(varFilterQ, filterVarNav)

  /* ====== Var Click Popup ====== */
  const varPopupOpen = ref(false)
  const varPopupVarName = ref('')
  const varPopupScope = ref<VarScope>('local')
  const varPopupOps = ref<VarOp[]>([])
  const varPopupIdx = ref(-1)
  const varPopupPos = ref({ top: 0, left: 0 })

  function showVarPopup(
    varName: string, scope: VarScope,
    clickDomain: VarDomain, clickBlockId: string | null, clickPos: number,
    pos: { top: number; left: number },
  ) {
    // 当前 varNav 全量索引即覆盖三域，直接从中按 varName+scope 过滤即可，
    // 不再像老版那样现场重扫——重扫在 flatNodes 折叠组下会漏，且性能更差。
    // 用最近一次 rebuildVarIndex 的结果（localRefs/globalRefs）。
    const pool = scope === 'local' ? localRefs.value : globalRefs.value
    const ops = pool.filter(o => o.varName === varName)
    // 当前点击命中：定位到 clickDomain+clickBlockId 且 pos 落在宏 span 内的那个。
    let currentIdx = -1
    ops.forEach((o, i) => {
      if (o.source.domain !== clickDomain || o.source.blockId !== clickBlockId) return
      // pos 是宏起始 `{{` 的绝对 index；VarOpMatch 的 end 已合并进 source.pos 不再单独保留，
      // 但跳转只需定位到宏本身，弹窗高亮"当前点击的是这处"用 pos 即可（不要求跨多行的 end 范围）。
      if (o.source.pos <= clickPos) currentIdx = i
    })
    varPopupVarName.value = varName
    varPopupScope.value = scope
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
    varFilterQ, localRefs, globalRefs, localFiltered, globalFiltered, varIdx,
    rebuildVarIndex, filterVarNav, jumpToVarOp, navVar,
    // Var Popup
    varPopupOpen, varPopupVarName, varPopupScope, varPopupOps, varPopupIdx, varPopupPos,
    showVarPopup, hideVarPopup, jumpToPopupVar, navPopupVar,
  }
}
