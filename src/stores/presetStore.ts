import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import type { PresetData, PresetBlock, OrderItem, OrderGroup, OrderNode, VarOp, PreviewBlockGroup, RegexScript, ScriptTree, Script, ScriptFolder, TavernHelper } from '../types'
import * as ST from '../api/presetApi'
import type { PresetListEntry } from '../api/presetApi'
import * as Host from '../api/hostContext'
import { macroAwareDiff, findVarOps } from '../utils'
import { useUiStore } from './uiStore'
import { useGroupedList, isGroupNode as isGroup } from '../composables/useGroupedList'
import { useRegexScripts } from '../composables/useRegexScripts'
import { useScriptTree } from '../composables/useScriptTree'
import { useTabsStore } from './tabsStore'
import { useConfirmStore } from './confirmStore'
import { DEFAULT_PRESET } from '../types'

// 类型守卫，判断 OrderNode 是否为组
export { isGroup }

// export 名为 usePresetStore，Pinia store id 仍为 'main'（改动会废弃已持久化的 devtools 状态）
export const usePresetStore = defineStore('main', () => {
  const tabsStore = useTabsStore()
  const confirmStore = useConfirmStore()
  const uiStore = useUiStore()
  const t: (key: string, params?: any) => string = (key, params) => uiStore.t(key as any, params)
  const showToast = uiStore.showToast

  /* ====== Core State ====== */
  const rawData = ref<PresetData | null>(null)
  const prompts = ref<PresetBlock[]>([])
  const order = ref<OrderNode[]>([])
  const presetName = ref('')
  const presetList = ref<PresetListEntry[]>([])

  /* flatNodes 构建 + 选择态(selectedGi/anchorGi)/折叠/绑定/拆组/重排由 useGroupedList 提供。
   * 解构说明：toggleBlock/toggleGroupCollapse/reorderBlock/selectBlock/identifierToGi/revealAndFindGi
   *   原样导出；clearSelection 用于 applyLoadedPreset() 换预设时清空选中；
   * insertAfterActive/removeNode
   *   纯树操作原语，被 addBlock/deleteBlock/hideBlock/addHiddenBlock 用于处理"插入到哪/删哪"，
   *   再各自补上 prompts/tabsStore 那部分；
   * bindSelected/unbindGroup
   *   被下面同名函数包一层 toast 后重新导出（略作改名避免撞名）。 */
  const {
    selectedGi, anchorGi, flatNodes, identifierToGi, revealAndFindGi,
    clearSelection, selectBlock, toggleBlock, toggleGroupCollapse, reorderBlock,
    insertAfterActive, removeNode, bindSelected: bindSelectedNodes, unbindGroup: unbindGroupNode,
  } = useGroupedList(order)

  /** 活动标签驱动侧边栏高亮的单一真相源：活动 tab 切到某 block 时，展开包含它的折叠组
   *  (revealAndFindGi) 并高亮该行 (selectedGi/anchorGi)。
   *  约束：必须 key off `tabsStore.activeTab`（只在活动 tab 身份实际变化时变），而非
   *  `listScrollToken['block']`——selectBlock() 的 ctrl/shift 多选路径也会触发
   *  requestListScroll('block')，却从不改 activeId；若 key 在同一 token 上，每次 ctrl/shift
   *  点击都会把刚算好的 selectedGi 冲回单行。
   *  `flush: 'sync'`：让此 watcher 先于 useListScrollSync 由 open()/focus() 触发的
   *  requestListScroll 那条路径解析，避免同 tick race 拿到仍折叠的组而滚到空处。 */
  watch(() => tabsStore.activeTab, (tab) => {
    if (!tab || tab.domain !== 'preset') return
    const gi = revealAndFindGi(tab.key)
    if (gi < 0) return
    // 幂等守卫：高亮实际不变时不给侧边栏 v-for 新 Set 引用
    if (anchorGi.value === gi && selectedGi.value.size === 1 && selectedGi.value.has(gi)) return
    selectedGi.value = new Set([gi])
    anchorGi.value = gi
  }, { immediate: true, flush: 'sync' })

  /* ====== Bound Regex Scripts ====== */
  const regexScripts = computed<RegexScript[]>(() => {
    if (!rawData.value) return []
    if (!rawData.value.extensions) rawData.value.extensions = {}
    if (!Array.isArray(rawData.value.extensions.regex_scripts)) rawData.value.extensions.regex_scripts = []
    return rawData.value.extensions.regex_scripts
  })

  function getRegexScripts(): RegexScript[] | null {
    if (!rawData.value) return null
    if (!rawData.value.extensions) rawData.value.extensions = {}
    if (!Array.isArray(rawData.value.extensions.regex_scripts)) rawData.value.extensions.regex_scripts = []
    return rawData.value.extensions.regex_scripts
  }

  const { addRegexScript, deleteRegexScript, reorderRegexScript } = useRegexScripts(getRegexScripts, {
    markDirty,
    showToast,
    t,
    loadFirstMessageKey: 'preset.toast.loadFirst',
    defaultPlacement: [2],
  })

  /* ====== Regex 分组树（独立于 preset 域的 order，同 useGroupedList 模式）======
   * regexScripts 是裸数组（后端数据），regexOrder 是分组树视图。identifier 填 regex script id。
   * add/delete 直接改 regexScripts 裸数组（useRegexScripts），watch 变化后 rebuildRegexOrder 重建树；
   * reorder/bind/unbind 改 regexOrder 树，随后 syncRegexScriptsFromOrder 把树展平写回裸数组
   * （更新顺序与 _gid/_gname/_gcollapsed/_genabled/_gidx 字段）。双向模式同 preset 域的 order⇄prompts。 */
  const regexOrder = ref<OrderNode[]>([])
  const {
    flatNodes: regexFlatNodes, selectedGi: regexSelectedGi, anchorGi: regexAnchorGi,
    identifierToGi: regexIdentifierToGi, revealAndFindGi: regexRevealAndFindGi,
    clearSelection: regexClearSelection, selectBlock: regexSelectBlock,
    toggleBlock: regexToggleBlockRaw, toggleGroupCollapse: regexToggleGroupCollapse,
    reorderBlock: regexReorderBlockRaw, insertAfterActive: regexInsertAfterActive,
    removeNode: regexRemoveNode, bindSelected: regexBindSelectedRaw, unbindGroup: regexUnbindGroupRaw,
  } = useGroupedList(regexOrder, { groupName: (n) => t('regex.sidebar.defaultGroupName', { count: n }) })

  /** regex 单条开关包装：toggle 改树后 sync 回 regexScripts 的 script.disabled（修双状态镜像 seam——
   *  裸 toggle 只翻树 enabled 不写回真数据，保存时会把改动丢掉）。 */
  function regexToggleBlock(gi: number) {
    regexToggleBlockRaw(gi)
    syncRegexScriptsFromOrder()
    markDirty()
  }

  /** 从 regexScripts 裸数组重建 regexOrder 分组树——读每个 script 的 _gid/_gname/_gcollapsed/_genabled/_gidx。
   *  同 _gid 的复用同一个 group ref（折叠态/名字不丢）。抄 importOrderWithGroups 的逻辑。 */
  function rebuildRegexOrder() {
    const scripts = regexScripts.value
    const groups = new Map<string, { name: string; collapsed: boolean; enabled: boolean; items: { script: RegexScript; idx: number }[] }>()
    scripts.forEach(script => {
      if (script._gid) {
        if (!groups.has(script._gid)) {
          groups.set(script._gid, {
            name: script._gname || 'Group',
            collapsed: script._gcollapsed !== false,
            enabled: script._genabled !== false,
            items: [],
          })
        }
        groups.get(script._gid)!.items.push({ script, idx: script._gidx ?? 0 })
      }
    })
    groups.forEach(g => g.items.sort((a, b) => a.idx - b.idx))
    const usedGroups = new Set<string>()
    const topLevel: OrderNode[] = []
    scripts.forEach(script => {
      if (script._gid) {
        if (usedGroups.has(script._gid)) return
        const g = groups.get(script._gid)!
        topLevel.push({
          id: 'group_' + script._gid,
          _gid: script._gid,
          name: g.name,
          collapsed: g.collapsed,
          enabled: g.enabled,
          children: g.items.map(x => ({ identifier: x.script.id, enabled: !x.script.disabled })),
        } as OrderGroup)
        usedGroups.add(script._gid)
      } else {
        topLevel.push({ identifier: script.id, enabled: !script.disabled } as OrderItem)
      }
    })
    regexOrder.value = topLevel
  }

  /** 把 regexOrder 树展平写回 regexScripts 裸数组：重排 scripts 顺序 + 更新 _gid 等分组字段。 */
  function syncRegexScriptsFromOrder() {
    const scripts = getRegexScripts()
    if (!scripts) return
    const byId = new Map(scripts.map(s => [s.id, s]))
    const reordered: RegexScript[] = []
    regexOrder.value.forEach(node => {
      if (isGroup(node)) {
        node.children.forEach((child, cidx) => {
          const s = byId.get(child.identifier)
          if (!s) return
          s.disabled = !child.enabled
          s._gid = node._gid; s._gname = node.name
          s._gcollapsed = node.collapsed; s._genabled = node.enabled; s._gidx = cidx
          reordered.push(s)
        })
      } else {
        const s = byId.get(node.identifier)
        if (!s) return
        s.disabled = !node.enabled
        delete s._gid; delete s._gname; delete s._gcollapsed; delete s._genabled; delete s._gidx
        reordered.push(s)
      }
    })
    // 原地替换内容（保持 regexScripts computed 引用的数组对象不变）
    scripts.length = 0
    scripts.push(...reordered)
  }

  /** regex sidebar 拖拽重排：改 regexOrder 树后 sync 回 regexScripts。 */
  function reorderRegexBlock(fromGi: number, toGi: number, after: boolean) {
    regexReorderBlockRaw(fromGi, toGi, after)
    syncRegexScriptsFromOrder()
    markDirty()
  }
  /** regex sidebar 绑定：合并选中顶层 item 成新组后 sync 回 regexScripts。 */
  function regexBindSelected() {
    const result = regexBindSelectedRaw()
    if (!result) { showToast(t('preset.toast.select2PlusBlocks')); return }
    syncRegexScriptsFromOrder()
    markDirty()
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }))
  }
  /** regex sidebar 解绑：拆组成顶层 item 后 sync 回 regexScripts。 */
  function regexUnbindGroup(gi: number) {
    if (!regexUnbindGroupRaw(gi)) return
    syncRegexScriptsFromOrder()
    markDirty()
    showToast(t('preset.toast.unbound'))
  }

  watch([regexScripts], () => rebuildRegexOrder(), { immediate: true })

  /* ====== Bound Tavern Helper（tavern_helper 段，照 regex 段模式）======
   * preset 域注意：PresetData.extensions.tavern_helper 的内部变量字段名是 `variales`（拼写差异，
   * 按 PresetData 接口保留），缺则补默认 `{ scripts: [], variales: {} }`。读 preset 的宽松
   * scripts 数组时 coerce 成严格 ScriptTree 形状（缺 type 补 'script'，缺 id 补 genId）。 */
  const tavernHelper = computed<TavernHelper>(() => {
    if (!rawData.value) return { scripts: [], variales: {} } as unknown as TavernHelper
    if (!rawData.value.extensions) rawData.value.extensions = {}
    const ext = rawData.value.extensions as any
    if (!ext.tavern_helper) ext.tavern_helper = { scripts: [], variales: {} }
    return ext.tavern_helper as TavernHelper
  })

  /** coerce 宽松 Record<string,any>[] 成严格 ScriptTree[] 形状：缺 type 补 'script'，缺 id 补 'th_...'。
   *  在 load 时一次性 mutate 原数据，不在 computed getter 里做（getter 里 mutate 触发响应式重算 → coerce 又跑 → 死循环）。 */
  function coerceScriptTrees(scripts: any[]) {
    if (!Array.isArray(scripts)) return
    scripts.forEach((node: any) => {
      if (!node || typeof node !== 'object') return
      if (!node.type) node.type = 'script'
      if (!node.id) node.id = 'th_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    })
  }

  function getScriptTrees(): ScriptTree[] | null {
    if (!rawData.value) return null
    if (!rawData.value.extensions) rawData.value.extensions = {}
    const ext = rawData.value.extensions as any
    if (!ext.tavern_helper) ext.tavern_helper = { scripts: [], variales: {} }
    const th = ext.tavern_helper as any
    if (!Array.isArray(th.scripts)) th.scripts = []
    if (!th.variales) th.variales = {}
    return th.scripts as ScriptTree[]
  }

  const { addScriptTree, deleteScriptTree, reorderScriptTree } = useScriptTree(getScriptTrees, {
    markDirty,
    showToast,
    t,
    loadFirstMessageKey: 'preset.toast.loadFirst',
    defaultPlacement: [2],
  })

  /* ====== tavern_helper 分组树（独立于 regexOrder/preset 域的 order，同 useGroupedList 模式）======
   * tavernHelper.scripts 是裸数组（后端数据，顶层是 ScriptTree = Script 或 ScriptFolder），
   * scriptTreeOrder 是分组树视图。identifier 填 script/folder 的 id。
   * Script 带 _gid 的归组（分组字段塞进 Script 的 [k:string]:any）；ScriptFolder 直接挂顶层
   * 不 coerce（它本身就是 folder，不参与 _gid 分组）。
   * add/delete 直接改 scripts 裸数组（useScriptTree），CRUD 后 store 显式调 rebuildScriptTreeOrder
   * （浅 watch seam：watch([tavernHelper.value.scripts]) 是浅 watch 永不触发原地变异，照 regex 段修法）。
   * reorder/bind/unbind/toggle 改 scriptTreeOrder 树，随后 syncScriptsFromOrder 把树展平写回裸数组
   * （更新顺序与 _gid/_gname/_gcollapsed/_genabled/_gidx 字段）。 */
  const scriptTreeOrder = ref<OrderNode[]>([])
  const {
    flatNodes: scriptTreeFlatNodes, selectedGi: scriptTreeSelectedGi, anchorGi: scriptTreeAnchorGi,
    identifierToGi: scriptTreeIdentifierToGi, revealAndFindGi: scriptTreeRevealAndFindGi,
    clearSelection: scriptTreeClearSelection, selectBlock: scriptTreeSelectBlock,
    toggleBlock: scriptTreeToggleBlockRaw, toggleGroupCollapse: scriptTreeToggleGroupCollapse,
    reorderBlock: scriptTreeReorderBlockRaw, insertAfterActive: scriptTreeInsertAfterActive,
    removeNode: scriptTreeRemoveNode, bindSelected: scriptTreeBindSelectedRaw, unbindGroup: scriptTreeUnbindGroupRaw,
  } = useGroupedList(scriptTreeOrder, { groupName: (n) => t('tavern.sidebar.defaultGroupName', { count: n }) })

  /** tavern 单条开关包装：toggle 改树后 sync 回 scripts 的 script.enabled（修双状态镜像 seam——
   *  裸 toggle 只翻树 enabled 不写回真数据，保存时会把改动丢掉）。 */
  function scriptTreeToggleBlock(gi: number) {
    scriptTreeToggleBlockRaw(gi)
    syncScriptsFromOrder()
    markDirty()
  }

  /** 从 tavernHelper.scripts 裸数组重建 scriptTreeOrder 分组树——读每个 Script 的
   *  _gid/_gname/_gcollapsed/_genabled/_gidx。同 _gid 的复用同一个 group ref。
   *  ScriptFolder 不参与 _gid 分组，直接挂顶层。抄 rebuildRegexOrder 的逻辑。 */
  function rebuildScriptTreeOrder() {
    const scripts = tavernHelper.value.scripts as ScriptTree[]
    const groups = new Map<string, { name: string; collapsed: boolean; enabled: boolean; items: { script: Script; idx: number }[] }>()
    scripts.forEach(node => {
      if (node.type === 'folder') return // folder 直接挂顶层，不参与 _gid 分组
      const script = node as Script
      if (script._gid) {
        if (!groups.has(script._gid)) {
          groups.set(script._gid, {
            name: script._gname || 'Group',
            collapsed: script._gcollapsed !== false,
            enabled: script._genabled !== false,
            items: [],
          })
        }
        groups.get(script._gid)!.items.push({ script, idx: script._gidx ?? 0 })
      }
    })
    groups.forEach(g => g.items.sort((a, b) => a.idx - b.idx))
    const usedGroups = new Set<string>()
    const topLevel: OrderNode[] = []
    scripts.forEach(node => {
      if (node.type === 'folder') {
        // ScriptFolder 直接挂顶层，enabled 取 folder.enabled，identifier 取 folder.id
        topLevel.push({ identifier: node.id, enabled: node.enabled } as OrderItem)
        return
      }
      const script = node as Script
      if (script._gid) {
        if (usedGroups.has(script._gid)) return
        const g = groups.get(script._gid)!
        topLevel.push({
          id: 'group_' + script._gid,
          _gid: script._gid,
          name: g.name,
          collapsed: g.collapsed,
          enabled: g.enabled,
          children: g.items.map(x => ({ identifier: x.script.id, enabled: x.script.enabled })),
        } as OrderGroup)
        usedGroups.add(script._gid)
      } else {
        topLevel.push({ identifier: script.id, enabled: script.enabled } as OrderItem)
      }
    })
    scriptTreeOrder.value = topLevel
  }

  /** 把 scriptTreeOrder 树展平写回 tavernHelper.scripts 裸数组：重排 scripts 顺序 + 更新 Script 的
   *  _gid 等分组字段。ScriptFolder（顶层 folder）原样保留位置——它在树里是顶层 OrderItem，
   *  sync 时按 identifier 反查原 folder 对象挂回。 */
  function syncScriptsFromOrder() {
    const scripts = getScriptTrees()
    if (!scripts) return
    const byId = new Map(scripts.map(s => [s.id, s]))
    const reordered: ScriptTree[] = []
    scriptTreeOrder.value.forEach(node => {
      if (isGroup(node)) {
        node.children.forEach((child, cidx) => {
          const s = byId.get(child.identifier) as Script | undefined
          if (!s || s.type !== 'script') return
          s.enabled = child.enabled
          s._gid = node._gid; s._gname = node.name
          s._gcollapsed = node.collapsed; s._genabled = node.enabled; s._gidx = cidx
          reordered.push(s)
        })
      } else {
        const s = byId.get(node.identifier)
        if (!s) return
        if (s.type === 'folder') {
          // folder 不参与 _gid 分组，只更新 enabled
          s.enabled = node.enabled
          reordered.push(s)
        } else {
          const script = s as Script
          script.enabled = node.enabled
          delete script._gid; delete script._gname; delete script._gcollapsed; delete script._genabled; delete script._gidx
          reordered.push(script)
        }
      }
    })
    // 原地替换内容（保持 tavernHelper computed 引用的数组对象不变）
    scripts.length = 0
    scripts.push(...reordered)
  }

  /** tavern sidebar 拖拽重排：改 scriptTreeOrder 树后 sync 回 scripts。 */
  function reorderScriptTreeBlock(fromGi: number, toGi: number, after: boolean) {
    scriptTreeReorderBlockRaw(fromGi, toGi, after)
    syncScriptsFromOrder()
    markDirty()
  }
  /** tavern sidebar 绑定：合并选中顶层 item 成新组后 sync 回 scripts。 */
  function scriptTreeBindSelected() {
    const result = scriptTreeBindSelectedRaw()
    if (!result) { showToast(t('preset.toast.select2PlusBlocks')); return }
    syncScriptsFromOrder()
    markDirty()
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }))
  }
  /** tavern sidebar 解绑：拆组成顶层 item 后 sync 回 scripts。 */
  function scriptTreeUnbindGroup(gi: number) {
    if (!scriptTreeUnbindGroupRaw(gi)) return
    syncScriptsFromOrder()
    markDirty()
    showToast(t('preset.toast.unbound'))
  }

  watch([tavernHelper.value.scripts], () => rebuildScriptTreeOrder(), { immediate: true })

  /* ====== 适配器注册：让路由容器（EditorShell/SettingsDock）拿数据时不直接 import presetStore ======
   *  regex/tavern 是 host-dependent domain，数据切片由 host store 暴露。
   *  registerDomainAdapter 在 setup 时同步执行，tabsStore 拿到引用即可。
   *  scripts 用 getter 函数：响应式追踪在 getter 调用时建立，消费方每次读都拿到最新的、已 unwrap 的数组。 */
  tabsStore.registerDomainAdapter('regex', 'preset', {
    scripts: () => regexScripts.value,
    workspace: 'preset',
    t: (key, params) => uiStore.t(key as any, params),
  })
  tabsStore.registerDomainAdapter('tavern', 'preset', {
    scripts: () => tavernHelper.value.scripts,
    workspace: 'preset',
    t: (key, params) => uiStore.t(key as any, params),
  })

  /* ====== 脏标记（驱动 header Save 按钮上的 `*`） ======
   * `order`/`regexScripts` 深度 watch：两者数组都很小，全量 traverse 成本可忽略。
   * `prompts` 浅 watch：holds 每个 block 的完整内容字符串，深 watch 会在每次嵌套字段
   *   变更时全量重遍历——而 block 内容是逐字符编辑的，这是打字卡顿的真正成因。浅 watch
   *   仍能捕获顶层变异（push/splice/重赋值），即 add/delete/duplicate block。
   * 嵌套字段（content/name/role）变更不在浅 watch 范围内，相关调用点显式 markDirty()：
   *   PresetContentEditor.vue 的 content setter、PresetSettingsForm.vue 的 name/role 处理、
   *   PresetSidebar.vue 的 inline rename commit。
   * 加载新预设时对 prompts/order 的赋值看起来像"变更"会触发 watch 标脏——applyLoadedPreset()
   *   在 nextTick 里清回 false（Vue 在该 nextTick 回调前 flush 掉这次赋值排入的 watcher）。 */
  const dirty = ref(false)
  function markDirty() { dirty.value = true }
  watch([order, regexScripts], markDirty, { deep: true })
  watch(prompts, markDirty)
  watch(regexOrder, markDirty, { deep: true })
  watch(scriptTreeOrder, markDirty, { deep: true })

  /* ====== Var Nav ====== 开关同样搬去了 tabsStore。 */
  const varFilterQ = ref('')
  const allVarOps = ref<VarOp[]>([])
  const filteredVarOps = ref<VarOp[]>([])
  const varIdx = ref(-1)

  /* ====== Preview ======
   * 两种模式，都走真实 SillyTavern 渲染（dry-run generate），非客户端宏模拟：
   *   'blocks': per-prompt-block 卡片，经 openai.js promptManager singleton (方案B)。
   *   'raw':    顶到底拼接的整条 prompt，经 GENERATE_AFTER_DATA 事件。
   * 开关同样搬去了 tabsStore，见上面 Search 的说明。 */
  const previewMode = ref<'blocks' | 'raw'>('blocks')
  const previewLoading = ref(false)
  const previewError = ref('')
  const previewCollapsed = ref<Record<string, boolean>>({})
  const previewBlockGroups = ref<PreviewBlockGroup[]>([])
  const previewRawText = ref('')

  /* ====== Modals ====== */
  const hiddenOpen = ref(false)
  const copyPanelOpen = ref(false) // CopyPanel.vue 的 open flag，该组件自包含

  /* ====== Jump requests (Editor listens & scrolls/selects; Sidebar listens & scrolls into view) ====== */
  // token 递增：line/col 重复时也强制 watcher 触发
  // `keepFocus: true`：只把匹配滚入视图，不移动 focus/selection 进编辑器——用于在搜索框内打字时
  // 预览当前匹配，而不偷走你正在打字的按键。
  const editorJump = ref<{ line: number; col: number; len: number; token: number; keepFocus: boolean } | null>(null)
  let jumpCounter = 0
  function requestEditorJump(line: number, col: number, len: number, keepFocus = false) {
    jumpCounter++
    editorJump.value = { line, col, len, token: jumpCounter, keepFocus }
  }

  /* ====== Computed ====== */
  const currentBlock = computed<PresetBlock | null>(() => {
    const tab = tabsStore.activeTab
    if (!tab || tab.domain !== 'preset') return null
    return prompts.value.find(p => p.identifier === tab.key) ?? null
  })

  const hasData = computed(() => rawData.value !== null)
  const hiddenBlocks = computed(() => {
    // 展开组：grouped block 的 identifier 在 group.children 里，不在顶层
    const ids = new Set(order.value.flatMap(o => isGroup(o) ? o.children.map(c => c.identifier) : [o.identifier]))
    return prompts.value.filter(p => !ids.has(p.identifier))
  })

  /* ====== Preset IO ======
   * loadPresetByName() 是唯一真正的"load"原语，其余都是薄封装：
   *   - loadFromContext(): 面板首次打开时加载 ST 当前选中的预设。
   *   - switchPreset(name): 显式加载另一个预设，独立于 ST 自己的选中——真正的"预设切换器"。
   *   - refreshPresetList(): (重新)填充 presetList 供 UI 选择；首次加载自动调用，
   *     也独立暴露以防 ST 别处增删预设时同步。
   */
  function importOrderWithGroups(raw: OrderItem[]): OrderNode[] {
    const groups = new Map<string, { name: string; collapsed: boolean; enabled: boolean; items: {item: OrderItem; idx: number}[] }>()
    const topLevel: OrderNode[] = []
    const used = new Set<number>()
    raw.forEach((item, i) => {
      if (item._gid) {
        if (!groups.has(item._gid)) {
          groups.set(item._gid, {
            name: item._gname || 'Group',
            collapsed: item._gcollapsed !== false,
            enabled: item._genabled !== false,
            items: []
          })
        }
        groups.get(item._gid)!.items.push({ item, idx: item._gidx ?? 0 })
      }
    })
    groups.forEach(g => g.items.sort((a, b) => a.idx - b.idx))
    raw.forEach((item, i) => {
      if (item._gid) {
        if (used.has(i)) return
        const g = groups.get(item._gid)!
        const group: OrderGroup = {
          id: 'group_' + item._gid,
          _gid: item._gid,
          name: g.name,
          collapsed: g.collapsed,
          enabled: g.enabled,
          children: g.items.map(x => ({ identifier: x.item.identifier, enabled: x.item.enabled }))
        }
        topLevel.push(group)
        g.items.forEach(x => used.add(raw.indexOf(x.item)))
      } else {
        topLevel.push({ identifier: item.identifier, enabled: item.enabled })
      }
    })
    return topLevel
  }

  function exportOrder(nodes: OrderNode[]): OrderItem[] {
    const out: OrderItem[] = []
    nodes.forEach(node => {
      if (isGroup(node)) {
        node.children.forEach((child, idx) => {
          out.push({
            identifier: child.identifier,
            enabled: child.enabled,
            _gid: node._gid,
            _gname: node.name,
            _gcollapsed: node.collapsed,
            _genabled: node.enabled,
            _gidx: idx
          })
        })
      } else {
        out.push({ identifier: node.identifier, enabled: node.enabled })
      }
    })
    return out
  }

  function applyLoadedPreset(data: PresetData, name: string) {
    rawData.value = data
    prompts.value = data.prompts || []
    const po = data.prompt_order
    const rawOrder = (Array.isArray(po) && po.length)
      ? (po.find((p: any) => p.character_id === 100001)?.order ?? [])
      : []
    order.value = importOrderWithGroups(rawOrder)
    clearSelection()
    presetName.value = name
    rebuildVarIndex()
    tabsStore.closeWorkspace('preset') // 旧标签（block、regex都算）都指向即将被替换的数据
    // coerce tavern_helper.scripts 宽松数组成严格 ScriptTree（load 时一次性 mutate，不在 computed getter 里）
    if (rawData.value.extensions?.tavern_helper) coerceScriptTrees(rawData.value.extensions.tavern_helper.scripts)
    rebuildScriptTreeOrder() // load 背真数据后显式 rebuild：watch([tavernHelper.value.scripts]) 是浅 watch，load 时 ext.tavern_helper 对象引用没变（只 scripts 属性被替），watch 不触发 → 树空
    nextTick(() => { dirty.value = false })
  }

  function refreshPresetList() {
    try { presetList.value = ST.listPresets() }
    catch (e: any) { showToast(t('preset.toast.listFailed', { msg: e?.message || e })) }
  }

  function loadPresetByName(name: string, opts: { silent?: boolean } = {}) {
    Host.invalidateCache()
    let data: PresetData | null
    try { data = ST.getPresetByName(name) }
    catch (e: any) { showToast(t('preset.toast.loadFailed', { msg: e?.message || e })); return }
    if (!data) { showToast(t('preset.toast.notFound', { name })); return }
    applyLoadedPreset(data, name)
    if (!opts.silent) showToast(t('preset.toast.loaded', { name }))
  }
  

  /** 面板首次打开时加载：ST 当前选中的预设。 */
  function loadFromContext() {
    refreshPresetList()
    Host.invalidateCache()
    let name: string
    try { name = ST.getSelectedPresetName() }
    catch (e: any) { showToast(t('preset.toast.cantLoadContext', { msg: e?.message || e })); return }
    if (!name) { showToast(t('preset.toast.noSelected')); return }
    loadPresetByName(name)
  }

  function reloadPreset() {
    refreshPresetList()
    Host.invalidateCache()
    let name: string
    name = presetName.value
    if (!name) { showToast(t('preset.toast.noSelected')); return }
    loadPresetByName(name)
  }

  /** 显式切换预设——加载另一个预设，独立于 ST 自己的选中。当前预设未保存的编辑会被丢弃
   *  （若这有影响，调用方/UI 应先确认）。 */
  function switchPreset(name: string) {
    if (!name || name === presetName.value) return
    loadPresetByName(name)
  }

  async function doSavePreset() {
    if (!rawData.value) { showToast(t('preset.toast.noDataToSave')); return }
    rawData.value.prompts = [...prompts.value]
    if (rawData.value.prompt_order?.length) {
      let entry = rawData.value.prompt_order.find((p: any) => p.character_id === 100001)
      if (!entry) {
        entry = { character_id: 100001, order: [] }
        rawData.value.prompt_order.push(entry)
      }
      entry.order = exportOrder(order.value)
    }
    const name = presetName.value || 'preset_modified'
    try {
      // rawData.value 是 Vue 响应式 Proxy，ST 的 savePreset 内部 structuredClone 不了它，
      // 且若 ST 先把传入对象赋进自己的 live state 再 clone，我们的 Proxy 会泄漏进 ST 内部。
      // 约束：永远交给 ST 一个纯 plain、非响应式的深拷贝。
      await ST.savePresetAs(name, JSON.parse(JSON.stringify(rawData.value)))
      presetName.value = name
      refreshPresetList() // 新名保存会新增条目，保持 picker 同步
      dirty.value = false
      showToast(t('preset.toast.saved', { name }))
    } catch (e: any) { showToast(t('preset.toast.saveFailed', { msg: e.message })) }
  }

  async function createPreset(name: string) {
    refreshPresetList()
    if (presetList.value.some(p => p.name === name)) { showToast(t('preset.toast.duplicateName')); return }

    const newPreset: PresetData = JSON.parse(JSON.stringify(DEFAULT_PRESET))
    try {
      await ST.savePresetAs(name, newPreset)
      refreshPresetList()
      applyLoadedPreset(newPreset, name)
      showToast(t('preset.toast.created', { name }))
    } catch (e: any) { showToast(t('preset.toast.createFailed', { msg: e?.message || e })) }
  }
  async function removeCurrentPreset() {
    const name = presetName.value
    if (!name) return
    try {
      await ST.deletePreset(name)
      refreshPresetList()
      const next = presetList.value[0]?.name
      if (next) loadPresetByName(next, { silent: true })
      else { rawData.value = null as any; presetName.value = '' }
      showToast(t('preset.toast.deleted', { name }))
    } catch (e: any) { showToast(t('preset.toast.deleteFailed', { msg: e?.message || e })) }
  }

  /* ====== Block Ops ======
   * selectBlock/toggleBlock/toggleGroupCollapse/reorderBlock 是 useGroupedList() 返回的纯树操作，
   * 原样导出，无 preset 特化逻辑，这里不再重新定义。
   * addBlock/deleteBlock/hideBlock/addHiddenBlock 留在这里，因为它们要触碰 useGroupedList
   * 故意不碰的东西：`prompts`（后端数据数组）、tabsStore（开/关标签）、confirmStore（删除确认）。
   * 它们调 insertAfterActive()/removeNode() 处理树形部分，其余自己处理。 */
  function addBlock() {
    if (!rawData.value) { showToast(t('preset.toast.loadFirst')); return }
    const id = 'custom_' + Date.now()
    prompts.value.push({
      identifier: id, name: 'New Block', role: 'system',
      content: '', system_prompt: false, enabled: true, marker: false,
    })
    const activeId = tabsStore.activeTab?.domain === 'preset' ? tabsStore.activeTab.key : null
    insertAfterActive({ identifier: id, enabled: true }, activeId)
    // 直接打开新块的标签——编辑器内容由标签驱动
    tabsStore.open({ domain: 'preset', key: id, label: 'New Block', workspace: 'preset' })
    showToast(t('preset.toast.blockCreated'))
  }
  function deleteBlock(gi: number) {
    const node = flatNodes.value[gi]
    if (!node) return
    if (!node.isGroup) {
      const id = (node.ref as OrderItem).identifier
      const block = prompts.value.find(p => p.identifier === id)
      if (block?.marker) {
        showToast(t('preset.toast.cannotDeleteMarker'))
        return
      }
    }
    const name = node.isGroup
      ? (node.ref as OrderGroup).name || t('common.unnamed')
      : prompts.value.find(p => p.identifier === (node.ref as OrderItem).identifier)?.name || t('common.new')
    const wasGroup = node.isGroup
    confirmStore.ask({
      title: t('preset.confirm.deleteBlock.title'),
      message: t('preset.confirm.deleteBlock.message', { name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        const removed = removeNode(gi)
        if (!removed) return
        // 组：只关子块标签，不删 prompts 数据（子块变为"隐藏块"，仍可从隐藏块列表找回）。
        // 叶子块：关自己标签 + 真删数据行。
        for (const id of removed.identifiers) tabsStore.close('preset', id)
        if (!wasGroup) {
          const pi = prompts.value.findIndex(p => p.identifier === removed.identifiers[0])
          if (pi >= 0) prompts.value.splice(pi, 1)
        }
        rebuildVarIndex()
        showToast(t('preset.toast.blockDeleted'))
      }
    })
  }
  function hideBlock(gi: number) {
    const node = flatNodes.value[gi]
    if (!node) return
    if (!node.isGroup) {
      const id = (node.ref as OrderItem).identifier
      const block = prompts.value.find(p => p.identifier === id)
      if (block?.marker) {
        showToast(t('preset.toast.cannotHideMarker'))
        return
      }
    }
    const wasGroup = node.isGroup
    const removed = removeNode(gi)
    if (!removed) return
    // 隐藏组：只把整个组（含子块）从 order 摘掉，不关子块标签。
    // 隐藏单个叶子块时才关它自己的标签。
    if (!wasGroup) tabsStore.close('preset', removed.identifiers[0])
    showToast(t('preset.toast.blockHidden'))
  }
  function addHiddenBlock(identifier: string) {
    const activeId = tabsStore.activeTab?.domain === 'preset' ? tabsStore.activeTab.key : null
    insertAfterActive({ identifier, enabled: true }, activeId)
    // 打开新加块的标签
    const block = prompts.value.find(p => p.identifier === identifier)
    tabsStore.open({ domain: 'preset', key: identifier, label: block?.name || identifier, workspace: 'preset' })
    showToast(t('preset.toast.blockAdded'))
  }

  /* ====== Group Ops ======
   * useGroupedList() 的 bindSelected()/unbindGroup() 外包一层 toast。 */
  function bindSelected() {
    const result = bindSelectedNodes()
    if (!result) { showToast(t('preset.toast.select2PlusBlocks')); return }
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }))
  }
  function unbindGroup(gi: number) {
    if (!unbindGroupNode(gi)) return
    showToast(t('preset.toast.unbound'))
  }

  /* ====== Search（工具箱通用版） ====== */
  /** 工具箱 Search 的通用"跳到命中"出口：按 itemId 定位（预设块 identifier 或正则脚本 id），
   *  开对应标签；content 文本命中再叠加编辑器跳转。不依赖 SearchResult 结构，跨域 SearchTool 可复用。 */
  function jumpToFieldHit(itemId: string, fieldKey: string, line: number, col: number, len: number) {
    const script = getRegexScripts()?.find(r => r.id === itemId)
    if (script) {
      tabsStore.open({ domain: 'regex', key: script.id, label: script.scriptName || script.id, workspace: 'preset' })
      return
    }
    const thNode = getScriptTrees()?.find(s => s.id === itemId)
    if (thNode) {
      tabsStore.open({ domain: 'tavern', key: thNode.id, label: thNode.name || thNode.id, workspace: 'preset' })
      // 反查 scriptTreeIdentifierToGi 展组到该行（同 preset 域 jumpToFieldHit 的 revealAndFindGi）
      const gi = scriptTreeIdentifierToGi(thNode.id)
      if (gi >= 0) scriptTreeRevealAndFindGi(thNode.id)
      return
    }
    const block = prompts.value.find(p => p.identifier === itemId)
    if (!block) return
    tabsStore.open({ domain: 'preset', key: block.identifier, label: block.name || block.identifier, workspace: 'preset' })
    // 只有 content 文本命中才有编辑器坐标；name/role/identifier 等字段只开标签不跳光标
    if (fieldKey === 'content' && line >= 0) requestEditorJump(line, col, len, false)
  }

  /* ====== Var Nav ====== */
  function rebuildVarIndex() {
    allVarOps.value = []
    varIdx.value = -1
    // findVarOps 是嵌套感知的（能正确处理 setvar/addvar 值内嵌套的 var op）。
    prompts.value.forEach((p) => {
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
    const v = filteredVarOps.value[i]
    // 展开折叠组、侧边栏高亮由 tabsStore.open() 触发的 activeTab watcher 统一处理
    const block = prompts.value.find(p => p.identifier === v.blockId)
    tabsStore.open({ domain: 'preset', key: v.blockId, label: block?.name || v.blockName, workspace: 'preset' })
    requestEditorJump(v.line, v.col, v.varName.length)
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
    const allItems = order.value.flatMap(node => isGroup(node) ? node.children : [node])
    allItems.forEach((o) => {
      const p = prompts.value.find(pp => pp.identifier === o.identifier)
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
    const v = varPopupOps.value[i]
    // 展开折叠组、侧边栏高亮由 tabsStore.open() 触发的 activeTab watcher 统一处理
    const block = prompts.value.find(p => p.identifier === v.blockId)
    tabsStore.open({ domain: 'preset', key: v.blockId, label: block?.name || v.blockName, workspace: 'preset' })
    requestEditorJump(v.line, v.col, v.varName.length)
  }
  function navPopupVar(dir: number) {
    if (!varPopupOps.value.length) return
    varPopupIdx.value = (varPopupIdx.value + dir + varPopupOps.value.length) % varPopupOps.value.length
    jumpToPopupVar(varPopupIdx.value)
  }

  /* ====== Preview ====== */

  function diffAgainstRaw(raw: string, rendered: string) {
    // 无 raw 内容可对比（marker blocks 等）——无需高亮
    if (!raw.trim()) return [{ text: rendered, added: false }]
    // macroAwareDiff 以 {{macros}} 之间的字面文本为锚点，而非全局 token 级 diff
    return macroAwareDiff(raw, rendered)
  }

  /** 调用 ST 的主菜单选择预设（不是加载到编辑器），仅在 ST 当前选中不同时执行。 */
  function selectPresetByName(name: string) {
    if (!name || ST.getSelectedPresetName() === name) return
    if (!ST.selectPresetByName(name)) showToast(t('preset.toast.selectPresetFailed'))
  }

  /** Per-block 精确预览 (方案B)：每张卡片显示该 block 经 macros/regex/其它扩展全部跑完后的真实渲染文本，
   *  数据来自 openai.js promptManager singleton，非客户端宏模拟。替换/插入的文本（相对于该 block 自己的
   *  raw content）通过 word diff 高亮。marker blocks（chatHistory、world info 等）和展开为多条子消息的
   *  block 没有单一"raw content"可对比，按原文平铺显示。 */
  async function generatePreviewBlocks() {
    previewError.value = ''
    previewLoading.value = true
    try {
      const results = await ST.getPromptManagerMessages()
      const groups: PreviewBlockGroup[] = []
      const allItems = order.value.flatMap(node => isGroup(node) ? node.children : [node])
      for (const o of allItems) {
        const msgs = results[o.identifier]
        if (!msgs || !msgs.length) continue
        const p = prompts.value.find(pp => pp.identifier === o.identifier)
        const isMarker = !!p?.marker
        const rawContent = p?.content || ''
        const diffable = !isMarker && msgs.length === 1
        groups.push({
          id: o.identifier,
          name: p?.name || o.identifier,
          isMarker,
          messages: msgs.map(m => ({
            role: m.role,
            tokens: m.tokens,
            identifier: m.identifier,
            segments: diffable ? diffAgainstRaw(rawContent, m.content) : [{ text: m.content, added: false }],
          })),
        })
      }
      previewBlockGroups.value = groups
      previewMode.value = 'blocks'
      showToast(t('preset.toast.renderedBlocks', { count: groups.length }))
    } catch (e: any) {
      previewError.value = e?.message || String(e)
      showToast(t('preset.toast.previewFailed', { msg: previewError.value }))
    } finally {
      previewLoading.value = false
    }
  }

  /** 整条 prompt 的精确预览：ST 真正要发给 API 的 `messages` 数组，从 CHAT_COMPLETION_SETTINGS_READY
   *  事件在真实 generation 期间捕获（捕获后立即 stopGeneration() 取消；见 getFinalRequestMessages()：
   *  dry-run 不够——它跳过 plugin/API-level request processing，而该事件在这些处理之后才触发）。
   *  无 block 边界、无高亮——刻意呈现"API 实际看到的内容"，作为另一模式下逐 block 检查后的最终 sanity check。 */
  async function generatePreviewRaw() {
    previewError.value = ''
    previewLoading.value = true
    try {
      const msgs = await ST.getFinalRequestMessages()
      previewRawText.value = msgs.map(m => `[${(m.role || '?').toUpperCase()}]\n${m.content}`).join('\n\n')
      previewMode.value = 'raw'
      showToast(t('preset.toast.renderedFullPrompt'))
    } catch (e: any) {
      previewError.value = e?.message || String(e)
      showToast(t('preset.toast.previewFailed', { msg: previewError.value }))
    } finally {
      previewLoading.value = false
    }
  }

  function togglePreviewBlock(id: string) {
    previewCollapsed.value[id] = !previewCollapsed.value[id]
  }
  function toggleAllPreviewBlocks() {
    if (!previewBlockGroups.value.length) return
    const shouldCollapse = previewBlockGroups.value.some(b => !previewCollapsed.value[b.id])
    previewBlockGroups.value.forEach(b => { previewCollapsed.value[b.id] = shouldCollapse })
  }

  return {
    rawData, prompts, order, presetName, presetList,
    flatNodes, selectedGi, anchorGi, identifierToGi, revealAndFindGi,
    varFilterQ, allVarOps, filteredVarOps, varIdx,
    varPopupOpen, varPopupVarName, varPopupOps, varPopupIdx, varPopupPos,
    showVarPopup, hideVarPopup, jumpToPopupVar, navPopupVar,
    previewMode, previewLoading, previewError,
    previewCollapsed, previewBlockGroups, previewRawText,
    regexScripts, addRegexScript, deleteRegexScript, reorderRegexScript,
    regexOrder, regexFlatNodes, regexSelectedGi, regexAnchorGi,
    regexIdentifierToGi, regexRevealAndFindGi, regexClearSelection,
    regexSelectBlock, regexToggleBlock, regexToggleGroupCollapse,
    reorderRegexBlock, regexBindSelected, regexUnbindGroup, regexRemoveNode,
    rebuildRegexOrder, syncRegexScriptsFromOrder,
    tavernHelper, getScriptTrees, addScriptTree, deleteScriptTree, reorderScriptTree,
    scriptTreeOrder, scriptTreeFlatNodes, scriptTreeSelectedGi, scriptTreeAnchorGi,
    scriptTreeIdentifierToGi, scriptTreeRevealAndFindGi, scriptTreeClearSelection,
    scriptTreeSelectBlock, scriptTreeToggleBlock, scriptTreeToggleGroupCollapse,
    reorderScriptTreeBlock, scriptTreeBindSelected, scriptTreeUnbindGroup, scriptTreeRemoveNode,
    rebuildScriptTreeOrder, syncScriptsFromOrder,
    hiddenOpen, copyPanelOpen, dirty, markDirty,
    currentBlock, hasData, hiddenBlocks,
    editorJump, requestEditorJump,
    loadFromContext, doSavePreset, refreshPresetList, switchPreset, createPreset, removeCurrentPreset, reloadPreset,
    selectBlock, addBlock, deleteBlock, hideBlock, addHiddenBlock,
    toggleBlock, reorderBlock,
    bindSelected, unbindGroup, toggleGroupCollapse,
    jumpToFieldHit,
    rebuildVarIndex, filterVarNav, navVar, jumpToVarOp,
    generatePreviewBlocks, generatePreviewRaw, togglePreviewBlock, toggleAllPreviewBlocks, selectPresetByName,
  }
})
