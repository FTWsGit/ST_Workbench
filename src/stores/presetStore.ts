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
import { usePreviewEngine } from '../composables/usePreviewEngine'
import { useVarNav } from '../composables/useVarNav'
import { useCharacterStore } from './characterStore'
import { useWorldbookStore } from './worldbookStore'
import { CHARACTER_FIELDS } from '../types'
import { useDirtyFlag } from '../composables/useDirtyFlag'
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

  /* ====== Dirty flag ====== useDirtyFlag() 在 setup 最早期调用——regex/tavern 段的 useRegexScripts/useScriptTree
   *  要把 markDirty 传进 options，必须在它们声明前解构出 markDirty。watch 列表（哪些 ref 触发脏、deep 还是
   *  shallow）仍由各域自己写在下面，因为每域的浅/深 watch 选择背后是性能权衡注释（如 prompts 浅 watch 防打字卡顿）。 */
  const { dirty, markDirty } = useDirtyFlag()

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

  const { addRegexScript: addRegexScriptRaw, deleteRegexScript: deleteRegexScriptRaw, reorderRegexScript } = useRegexScripts(getRegexScripts, {
    markDirty,
    showToast,
    t,
    loadFirstMessageKey: 'preset.toast.loadFirst',
    defaultPlacement: [2],
  })

  /* ====== Regex 分组树（独立于 preset 域的 order，同 useGroupedList 模式）======
   * regexScripts 是裸数组（后端数据），regexOrder 是分组树视图。identifier 填 regex script id。
   * add/delete 直接改 regexScripts 裸数组（useRegexScripts），随后显式 rebuildRegexOrder 重建树——
   *   不能靠 watch([regexScripts], rebuild)：computed getter 返回同一数组引用，push/splice 不让 computed
   *   recompute（依赖只到 .extensions.regex_scripts 引用），watch 永不触发 → 树空 → sidebar 不显示。
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

  /** add/delete 后显式 rebuild 树：useRegexScripts 改裸数组，watch([regexScripts], rebuild) 浅 watch 永不触发
   *  原地变异（computed getter 返回同一数组引用）——sidebar 渲染源 regexFlatNodes 读的是 regexOrder，
   *  不 rebuild 则 sidebar 不显示新建项/删后变"(未命名)"stale 节点。 */
  function addRegexScript(): string | null {
    const id = addRegexScriptRaw()
    if (id) rebuildRegexOrder()
    return id
  }
  function deleteRegexScript(id: string) {
    deleteRegexScriptRaw(id)
    rebuildRegexOrder()
  }

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

  /** deep watch 监听数组元素字段变异（settings 表单改 script.disabled 后 sidebar 联动）——
   *  浅 watch([regexScripts], ...) 只追踪 computed 重新求值，push/splice/改字段都不触发（computed getter 返回同一数组引用）。 */
  watch(regexScripts, () => rebuildRegexOrder(), { deep: true, immediate: true })

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

  const { addScriptTree: addScriptTreeRaw, deleteScriptTree: deleteScriptTreeRaw, reorderScriptTree } = useScriptTree(getScriptTrees, {
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
   * add/delete 直接改 scripts 裸数组（useScriptTree），随后显式 rebuildScriptTreeOrder 重建树——
   *   不能靠 watch([tavernHelper.value.scripts], rebuild)：浅 watch 永不触发原地变异
   *   （tavernHelper.value.scripts 数组引用没变，只是内部 push/splice）→ 树空 → sidebar 不显示。
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

  /** add/delete 后显式 rebuild 树：同 regex 段修法，watch 浅追踪不触发原地变异。 */
  function addScriptTree(): string | null {
    const id = addScriptTreeRaw()
    if (id) rebuildScriptTreeOrder()
    return id
  }
  function deleteScriptTree(id: string) {
    deleteScriptTreeRaw(id)
    rebuildScriptTreeOrder()
  }

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

  /** deep watch 监听数组元素字段变异（settings 表单改 script.enabled 后 sidebar 联动）——
   *  浅 watch([tavernHelper.value.scripts], ...) 永不触发原地变异（数组引用没变，只是内部 push/splice/改字段）。 */
  watch(() => tavernHelper.value.scripts, () => rebuildScriptTreeOrder(), { deep: true, immediate: true })

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
  watch([order, regexScripts], markDirty, { deep: true })
  watch(prompts, markDirty)
  watch(regexOrder, markDirty, { deep: true })
  watch(scriptTreeOrder, markDirty, { deep: true })

  /* ====== Modals ====== */
  const hiddenOpen = ref(false)
  const copyPanelOpen = ref(false) // CopyPanel.vue 的 open flag，该组件自包含

  /* ====== Jump requests（跨域共享：抽到 tabsStore，preset/character/worldbook ContentEditor 都接 :jump=tabsStore.editorJump）======
   * token 递增：line/col 重复时也强制 watcher 触发。
   * `keepFocus: true`：只把匹配滚入视图，不移动 focus/selection 进编辑器——用于在搜索框内打字时
   * 预览当前匹配，而不偷走你正在打字的按键。 */
  const editorJump = computed(() => tabsStore.editorJump)
  function requestEditorJump(line: number, col: number, len: number, keepFocus = false) {
    tabsStore.requestEditorJump(line, col, len, keepFocus)
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

  /* ====== Var Nav + Var Popup ====== 抽到 composables/useVarNav.ts。
   * varNav 跨三域扫描：preset 自扫 + 引用 character/worldbook 两 store 的当前数据一并扫。
   * 跳转按 source.domain 分派——preset 走本 store jumpToFieldHit；character/worldbook 各自 jumpToFieldHit。 */
  const characterStore = useCharacterStore()
  const worldbookStore = useWorldbookStore()
  function jumpAcrossDomain(v: VarOp) {
    if (v.source.domain === 'preset') {
      const block = prompts.value.find(p => p.identifier === v.source.blockId)
      tabsStore.setActiveWorkspace('preset')
      tabsStore.open({ domain: 'preset', key: v.source.blockId, label: block?.name || v.source.blockLabel, workspace: 'preset' })
      requestEditorJump(v.source.line, v.source.col, v.varName.length)
      return
    }
    if (v.source.domain === 'character') {
      tabsStore.setActiveWorkspace('character')
      characterStore.jumpToFieldHit(v.source.blockId, v.source.fieldName || '', v.source.line, v.source.col, v.varName.length)
      requestEditorJump(v.source.line, v.source.col, v.varName.length)
      return
    }
    tabsStore.setActiveWorkspace('worldbook')
    worldbookStore.jumpToFieldHit(v.source.blockId, 'content', v.source.line, v.source.col, v.varName.length)
    requestEditorJump(v.source.line, v.source.col, v.varName.length)
  }
  const {
    varFilterQ, localRefs, globalRefs, localFiltered, globalFiltered, varIdx,
    rebuildVarIndex, filterVarNav, jumpToVarOp, navVar,
    varPopupOpen, varPopupVarName, varPopupScope, varPopupOps, varPopupIdx, varPopupPos,
    showVarPopup, hideVarPopup, jumpToPopupVar, navPopupVar,
  } = useVarNav(
    {
      preset: { order: () => order.value, prompts: () => prompts.value, presetName: () => presetName.value },
      character: {
        character: () => characterStore.character,
        greetingIds: () => characterStore.greetingIds,
        greetingKey: (id) => 'field:greeting:' + id,
        fieldOrder: CHARACTER_FIELDS.map(f => ({ field: f.key, labelKey: f.labelKey })),
      },
      worldbook: { order: () => worldbookStore.order, entries: () => worldbookStore.entries, worldbookName: () => worldbookStore.worldbookName },
    },
    { onJump: jumpAcrossDomain },
  )
  /* variables 自动重扫：order 深 watch 覅获 block 增删/启用切换/重排序（粗粒度，content 编辑不触发避打字卡顿）。
   *   prompts 是浅 watch 兜底——content 改字不自动重扫，用户点🔄或切预设时跑。
   *   character/worldbook 域的 watch 挂在各自 store（走 useVarNav 跨域扫描器读的是三域当前数据，那边触发也会让本面板更新）。 */
  watch(order, () => rebuildVarIndex(), { deep: true })
  watch(prompts, () => rebuildVarIndex())
  watch(() => characterStore.character, () => rebuildVarIndex(), { deep: true })
  watch(() => worldbookStore.entries, () => rebuildVarIndex(), { deep: true })

  /* ====== Preview ====== 抽到 composables/usePreviewEngine.ts。 */
  const {
    previewMode, previewLoading, previewError, previewCollapsed,
    previewBlockGroups, previewRawText,
    generatePreviewBlocks, generatePreviewRaw,
    togglePreviewBlock, toggleAllPreviewBlocks,
  } = usePreviewEngine(() => order.value, () => prompts.value, { showToast, t })

  /** 调用 ST 的主菜单选择预设（不是加载到编辑器），仅在 ST 当前选中不同时执行。 */
  function selectPresetByName(name: string) {
    if (!name || ST.getSelectedPresetName() === name) return
    if (!ST.selectPresetByName(name)) showToast(t('preset.toast.selectPresetFailed'))
  }

  return {
    rawData, prompts, order, presetName, presetList,
    flatNodes, selectedGi, anchorGi, identifierToGi, revealAndFindGi,
    varFilterQ, localRefs, globalRefs, localFiltered, globalFiltered, varIdx,
    varPopupOpen, varPopupVarName, varPopupScope, varPopupOps, varPopupIdx, varPopupPos,
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
