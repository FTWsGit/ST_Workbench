import { defineStore } from 'pinia'
import { ref, computed, nextTick, watch } from 'vue'
import { type Character, type CharacterListEntry, type RegexScript, type OrderNode, type OrderGroup, type OrderItem, type ScriptTree, type Script, type ScriptFolder, type TavernHelper, CHARACTER_FIELDS } from '../types'
import * as CH from '../api/characterApi'
import { useTabsStore } from './tabsStore'
import { useConfirmStore } from './confirmStore'
import { useUiStore } from './uiStore'
import { useRegexScripts } from '../composables/useRegexScripts'
import { useScriptTree } from '../composables/useScriptTree'
import { useGroupedList, isGroupNode as isGroup } from '../composables/useGroupedList'
function genLocalId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function genGreetingId(): string {
  return genLocalId('g_')
}

function reorderArray<T>(arr: T[], fromIdx: number, toIdx: number, after: boolean) {
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return
  const item = arr.splice(fromIdx, 1)[0]
  const insertIdx = fromIdx < toIdx ? (after ? toIdx : toIdx - 1) : (after ? toIdx + 1 : toIdx)
  arr.splice(insertIdx, 0, item)
}

function emptyCharacter(name: string): Character {
  return {
    avatar: '', name,
    description: '', scenario: '', mesExample: '', personality: '',
    systemPrompt: '', postHistoryInstructions: '',
    depthPrompt: { prompt: '', depth: 4, role: 0 },
    greetings: [''],
    creator: '', creatorNotes: '', version: '', tags: [], talkativeness: 0.5, fav: false, worldbook: null,
    extensions: { regex_scripts: [], tavern_helper: { scripts: [], variables: {} } },
  }
}

/** 独立文档 store：角色卡工作区。跟 worldbook 的区别：
 *   - 没有 flatNodes/分组 —— 固定字段列表来自 CHARACTER_FIELDS 常量。
 *   - greetings 拖拽使用合成 id 做 tab 寻址，不直接用数组下标。 */
export const useCharacterStore = defineStore('character', () => {
  const tabsStore = useTabsStore()
  const confirmStore = useConfirmStore()
  const uiStore = useUiStore()
  const t: (key: string, params?: any) => string = (key, params) => uiStore.t(key as any, params)
  const showToast = uiStore.showToast

  /* ====== Core State ====== */
  const character = ref<Character | null>(null)
  /** 最近一次从 ST 读到的原始 v1CharData（characterApi.getCharacterByAvatar 返回的 `raw`），
   *  保存时字段级回退用（见 characterApi.ts buildFormData 的 doc comment）。新建、还没保存过的
   *  角色是 `null`——doSaveCharacter() 靠这个字段本身是否为 null 判断该调 create 还是 edit。 */
  const oldRaw = ref<any>(null)
  const characterList = ref<CharacterListEntry[]>([])
  /** 用户在 CharacterMetaForm 里选好、还没提交保存的新头像文件——暂存在这里而不是直接塞进
   *  Character 接口（头像内容不适合放进一个纯数据接口里跟着深拷贝/序列化走一遍），
   *  doSaveCharacter() 保存成功后清空。 */
  const pendingAvatarFile = ref<File | Blob | null>(null)

  const dirty = ref(false)
  function markDirty() { dirty.value = true }

  const hasData = computed(() => character.value !== null)

  /* ====== greetings 的合成 id ====== */
  const greetingIds = ref<string[]>([])

  /* ====== 虚拟字段路由：EditorShell.vue 只需要 activeTab.key 就能拿到/改当前字段的值，
   * 不用自己解析 `field:xxx` / `field:greeting:<id>` 这套 key 格式——解析逻辑集中在这里一处，
   * 跟 worldbookStore.currentEntry 是同一个"店内路由，组件不用懂 key 是怎么编的"的思路。 */
  const currentField = computed<{ key: string; value: string } | null>(() => {
    const tab = tabsStore.activeTab
    if (!tab || tab.domain !== 'character' || !character.value) return null
    const key = tab.key
    if (key.startsWith('field:greeting:')) {
      const idx = greetingIds.value.indexOf(key.slice('field:greeting:'.length))
      return idx < 0 ? null : { key, value: character.value.greetings[idx] ?? '' }
    }
    const fieldKey = key.slice('field:'.length)
    if (fieldKey === 'depthPrompt') return { key, value: character.value.depthPrompt.prompt }
    const v = (character.value as any)[fieldKey]
    return typeof v === 'string' ? { key, value: v } : null
  })

  function setCurrentFieldValue(value: string) {
    const tab = tabsStore.activeTab
    if (!tab || tab.domain !== 'character' || !character.value) return
    const key = tab.key
    if (key.startsWith('field:greeting:')) {
      const idx = greetingIds.value.indexOf(key.slice('field:greeting:'.length))
      if (idx >= 0) character.value.greetings[idx] = value
    } else {
      const fieldKey = key.slice('field:'.length)
      if (fieldKey === 'depthPrompt') {
        character.value.depthPrompt.prompt = value
      } else if (CHARACTER_FIELDS.some(f => f.key === fieldKey)) {
        (character.value as any)[fieldKey] = value
      } else {
        return // 非法字段直接忽略，避免污染对象
      }
    }
    markDirty()
  }

  /** 工具箱 Search 的通用"跳到命中"出口：itemId 就是虚拟字段 tab key（'field:xxx' / 'field:greeting:<id>'），
   *  直接开对应标签。character 没有 groupedList，无需 revealAndFindGi。 */
  function jumpToFieldHit(itemId: string, fieldKey: string, line: number, col: number, len: number) {
    if (!character.value) return
    // tavern 域：按 script/folder id 反查，开对应标签 + 展组到该行（scriptTreeIdentifierToGi 在
    //  下文 tavern 段声明，函数调用时才解析闭包引用，TDZ 不触发）
    const thNode = getScriptTrees()?.find(s => s.id === itemId)
    if (thNode) {
      tabsStore.open({ domain: 'tavern', key: thNode.id, label: thNode.name || thNode.id, workspace: 'character' })
      const gi = scriptTreeIdentifierToGi(thNode.id)
      if (gi >= 0) scriptTreeRevealAndFindGi(thNode.id)
      return
    }
    if (itemId.startsWith('field:greeting:')) {
      const gid = itemId.slice('field:greeting:'.length)
      const idx = greetingIds.value.indexOf(gid)
      tabsStore.open({ domain: 'character', key: itemId, label: t('character.sidebar.greetingLabel', { n: (idx >= 0 ? idx : greetingIds.value.length) + 1 }), workspace: 'character' })
      return
    }
    const fieldKeyPart = itemId.slice('field:'.length)
    const field = CHARACTER_FIELDS.find(f => f.key === fieldKeyPart)
    tabsStore.open({ domain: 'character', key: itemId, label: field ? t(field.labelKey) : fieldKeyPart, workspace: 'character' })
  }

  /* ====== Bound Regex Scripts（同 presetStore.regexScripts 的模式，宿主换成 character） ====== */
  const regexScripts = computed<RegexScript[]>(() => {
    if (!character.value) return []
    if (!character.value.extensions) character.value.extensions = { regex_scripts: [], tavern_helper: { scripts: [], variables: {} } }
    if (!Array.isArray(character.value.extensions.regex_scripts)) character.value.extensions.regex_scripts = []
    return character.value.extensions.regex_scripts
  })

  function getRegexScripts(): RegexScript[] | null {
    if (!character.value) return null
    if (!character.value.extensions) character.value.extensions = { regex_scripts: [], tavern_helper: { scripts: [], variables: {} } }
    if (!Array.isArray(character.value.extensions.regex_scripts)) character.value.extensions.regex_scripts = []
    return character.value.extensions.regex_scripts
  }

  const { addRegexScript: addRegexScriptRaw, deleteRegexScript: deleteRegexScriptRaw, reorderRegexScript } = useRegexScripts(getRegexScripts, {
    markDirty,
    showToast,
    t,
    loadFirstMessageKey: 'character.toast.loadFirst',
    defaultPlacement: [2],
  })

  /* ====== Regex 分组树（同 presetStore regex 段，identifier 填 regex script id）====== */
  const regexOrder = ref<OrderNode[]>([])
  const {
    flatNodes: regexFlatNodes, selectedGi: regexSelectedGi, anchorGi: regexAnchorGi,
    identifierToGi: regexIdentifierToGi, revealAndFindGi: regexRevealAndFindGi,
    clearSelection: regexClearSelection, selectBlock: regexSelectBlock,
    toggleBlock: regexToggleBlockRaw, toggleGroupCollapse: regexToggleGroupCollapse,
    reorderBlock: regexReorderBlockRaw, insertAfterActive: regexInsertAfterActive,
    removeNode: regexRemoveNode, bindSelected: regexBindSelectedRaw, unbindGroup: regexUnbindGroupRaw,
  } = useGroupedList(regexOrder, { groupName: (n) => t('regex.sidebar.defaultGroupName', { count: n }) })

  /** add/delete 后显式 rebuild 树：watch([regexScripts], rebuild) 浅 watch 不触发原地变异
   *  （computed getter 返回同一数组引用）——不 rebuild 则 sidebar 不显示新建项/删后 stale。 */
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

  /** 从 regexScripts 裸数组重建 regexOrder 分组树——读每个 script 的 _gid/_gname/_gcollapsed/_genabled/_gidx。 */
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
    scripts.length = 0
    scripts.push(...reordered)
  }

  function reorderRegexBlock(fromGi: number, toGi: number, after: boolean) {
    regexReorderBlockRaw(fromGi, toGi, after)
    syncRegexScriptsFromOrder()
    markDirty()
  }
  function regexBindSelected() {
    const result = regexBindSelectedRaw()
    if (!result) { showToast(t('preset.toast.select2PlusBlocks')); return }
    syncRegexScriptsFromOrder()
    markDirty()
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }))
  }
  function regexUnbindGroup(gi: number) {
    if (!regexUnbindGroupRaw(gi)) return
    syncRegexScriptsFromOrder()
    markDirty()
    showToast(t('preset.toast.unbound'))
  }

  /** deep watch 监听数组元素字段变异（settings 表单改 script.disabled 后 sidebar 联动）——
   *  浅 watch([regexScripts], ...) 只追踪 computed 重新求值，push/splice/改字段都不触发。 */
  watch(regexScripts, () => rebuildRegexOrder(), { deep: true, immediate: true })
  watch(regexOrder, markDirty, { deep: true })

  /* ====== Bound Tavern Helper（tavern_helper 段，照 regex 段模式，宿主换成 character）======
   * character 域注意：Character.extensions.tavern_helper 的内部变量字段名是 `variables`（拼写差异，
   * 按 Character 接口保留），缺则补默认 `{ scripts: [], variables: {} }`。读 character 的宽松
   * scripts 数组时 coerce 成严格 ScriptTree 形状（缺 type 补 'script'，缺 id 补 genId）。 */
  const tavernHelper = computed<TavernHelper>(() => {
    if (!character.value) return { scripts: [], variables: {} } as unknown as TavernHelper
    if (!character.value.extensions) character.value.extensions = { regex_scripts: [], tavern_helper: { scripts: [], variables: {} } }
    const ext = character.value.extensions as any
    if (!ext.tavern_helper) ext.tavern_helper = { scripts: [], variables: {} }
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
    if (!character.value) return null
    if (!character.value.extensions) character.value.extensions = { regex_scripts: [], tavern_helper: { scripts: [], variables: {} } }
    const ext = character.value.extensions as any
    if (!ext.tavern_helper) ext.tavern_helper = { scripts: [], variables: {} }
    const th = ext.tavern_helper as any
    if (!Array.isArray(th.scripts)) th.scripts = []
    if (!th.variables) th.variables = {}
    return th.scripts as ScriptTree[]
  }

  const { addScriptTree: addScriptTreeRaw, deleteScriptTree: deleteScriptTreeRaw, reorderScriptTree } = useScriptTree(getScriptTrees, {
    markDirty,
    showToast,
    t,
    loadFirstMessageKey: 'character.toast.loadFirst',
    defaultPlacement: [2],
  })

  /* ====== tavern_helper 分组树（同 presetStore tavern 段，identifier 填 script/folder 的 id）====== */
  const scriptTreeOrder = ref<OrderNode[]>([])
  const {
    flatNodes: scriptTreeFlatNodes, selectedGi: scriptTreeSelectedGi, anchorGi: scriptTreeAnchorGi,
    identifierToGi: scriptTreeIdentifierToGi, revealAndFindGi: scriptTreeRevealAndFindGi,
    clearSelection: scriptTreeClearSelection, selectBlock: scriptTreeSelectBlock,
    toggleBlock: scriptTreeToggleBlockRaw, toggleGroupCollapse: scriptTreeToggleGroupCollapse,
    reorderBlock: scriptTreeReorderBlockRaw, insertAfterActive: scriptTreeInsertAfterActive,
    removeNode: scriptTreeRemoveNode, bindSelected: scriptTreeBindSelectedRaw, unbindGroup: scriptTreeUnbindGroupRaw,
  } = useGroupedList(scriptTreeOrder, { groupName: (n) => t('tavern.sidebar.defaultGroupName', { count: n }) })

  /** add/delete 后显式 rebuild 树：watch([tavernHelper.value.scripts], rebuild) 浅 watch 不触发原地变异——
   *  不 rebuild 则 sidebar 不显示新建项/删后 stale。 */
  function addScriptTree(): string | null {
    const id = addScriptTreeRaw()
    if (id) rebuildScriptTreeOrder()
    return id
  }
  function deleteScriptTree(id: string) {
    deleteScriptTreeRaw(id)
    rebuildScriptTreeOrder()
  }

  /** tavern 单条开关包装：toggle 改树后 sync 回 scripts 的 script.enabled（修双状态镜像 seam）。 */
  function scriptTreeToggleBlock(gi: number) {
    scriptTreeToggleBlockRaw(gi)
    syncScriptsFromOrder()
    markDirty()
  }

  /** 从 tavernHelper.scripts 裸数组重建 scriptTreeOrder 分组树——读每个 Script 的
   *  _gid/_gname/_gcollapsed/_genabled/_gidx。ScriptFolder 不参与 _gid 分组，直接挂顶层。 */
  function rebuildScriptTreeOrder() {
    const scripts = tavernHelper.value.scripts as ScriptTree[]
    const groups = new Map<string, { name: string; collapsed: boolean; enabled: boolean; items: { script: Script; idx: number }[] }>()
    scripts.forEach(node => {
      if (node.type === 'folder') return
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
    scripts.length = 0
    scripts.push(...reordered)
  }

  function reorderScriptTreeBlock(fromGi: number, toGi: number, after: boolean) {
    scriptTreeReorderBlockRaw(fromGi, toGi, after)
    syncScriptsFromOrder()
    markDirty()
  }
  function scriptTreeBindSelected() {
    const result = scriptTreeBindSelectedRaw()
    if (!result) { showToast(t('preset.toast.select2PlusBlocks')); return }
    syncScriptsFromOrder()
    markDirty()
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }))
  }
  function scriptTreeUnbindGroup(gi: number) {
    if (!scriptTreeUnbindGroupRaw(gi)) return
    syncScriptsFromOrder()
    markDirty()
    showToast(t('preset.toast.unbound'))
  }

  /** deep watch 监听数组元素字段变异（settings 表单改 script.enabled 后 sidebar 联动）——
   *  浅 watch([tavernHelper.value.scripts], ...) 永不触发原地变异（数组引用没变，只是内部 push/splice/改字段）。 */
  watch(() => tavernHelper.value.scripts, () => rebuildScriptTreeOrder(), { deep: true, immediate: true })
  watch(scriptTreeOrder, markDirty, { deep: true })

  /* ====== 适配器注册：让路由容器（EditorShell/SettingsDock）拿数据时不直接 import characterStore ======
   *  regex/tavern 是 host-dependent domain，character 域把自己的数据切片暴露给 tabsStore。
   *  scripts 用 getter 函数：响应式追踪在 getter 调用时建立，消费方每次读都拿到最新的、已 unwrap 的数组。 */
  tabsStore.registerDomainAdapter('regex', 'character', {
    scripts: () => regexScripts.value,
    workspace: 'character',
    t: (key, params) => uiStore.t(key as any, params),
  })
  tabsStore.registerDomainAdapter('tavern', 'character', {
    scripts: () => tavernHelper.value.scripts,
    workspace: 'character',
    t: (key, params) => uiStore.t(key as any, params),
  })

  /* ====== Greetings：增删拖拽 ====== */
  function addGreeting() {
    if (!character.value) { showToast(t('character.toast.loadFirst')); return }
    character.value.greetings.push('')
    const id = genGreetingId()
    greetingIds.value.push(id)
    markDirty()
    tabsStore.open({ domain: 'character', key: 'field:greeting:' + id, label: t('character.sidebar.greetingLabel', { n: greetingIds.value.length }), workspace: 'character' })
  }
  function deleteGreeting(id: string) {
    if (!character.value) return
    const idx = greetingIds.value.indexOf(id)
    if (idx < 0) return
    if (character.value.greetings.length <= 1) { showToast(t('character.toast.needAtLeastOneGreeting')); return }
    confirmStore.ask({
      title: t('character.confirm.deleteGreeting.title'),
      message: t('character.confirm.deleteGreeting.message'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        character.value!.greetings.splice(idx, 1)
        greetingIds.value.splice(idx, 1)
        tabsStore.close('character', 'field:greeting:' + id)
        markDirty()
        showToast(t('character.toast.greetingDeleted'))
      },
    })
  }
  /** `fromIdx`/`toIdx`/`after` 是 useDragReorder<number> 报告的下标（对应 greetingIds 当前顺序），
   *  greetings 和 greetingIds 两个数组同步 splice。 */
  function reorderGreeting(fromIdx: number, toIdx: number, after: boolean) {
    if (!character.value) { showToast(t('character.toast.loadFirst')); return }
    reorderArray(character.value.greetings, fromIdx, toIdx, after)
    reorderArray(greetingIds.value, fromIdx, toIdx, after)
    markDirty()
  }

  /* ====== Character IO ====== */
  function applyLoaded(c: Character, raw: any | null) {
    character.value = c
    oldRaw.value = raw
    greetingIds.value = c.greetings.map(() => genGreetingId())
    pendingAvatarFile.value = null
    tabsStore.closeWorkspace('character')
    // coerce tavern_helper.scripts 宽松数组成严格 ScriptTree（load 时一次性 mutate，不在 computed getter 里）
    if (character.value.extensions?.tavern_helper) coerceScriptTrees(character.value.extensions.tavern_helper.scripts)
    rebuildScriptTreeOrder() // load 背真数据后显式 rebuild：watch([tavernHelper.value.scripts]) 是浅 watch，load 时 ext.tavern_helper 对象引用没变（只 scripts 属性被替），watch 不触发 → 树空
    nextTick(() => { dirty.value = false })
  }

  function refreshCharacterList() {
    CH.listCharacters().then(list => { characterList.value = list })
      .catch((e: any) => showToast(t('character.toast.listFailed', { msg: e?.message || e })))
  }

  async function loadCharacterByAvatar(avatar: string, opts: { silent?: boolean } = {}) {
    let result: { character: Character; raw: any } | null
    try { result = await CH.getCharacterByAvatar(avatar) }
    catch (e: any) { showToast(t('character.toast.loadFailed', { msg: e?.message || e })); return }
    if (!result) { showToast(t('character.toast.notFound', { name: avatar })); return }
    applyLoaded(result.character, result.raw)
    if (!opts.silent) showToast(t('character.toast.loaded', { name: result.character.name }))
  }

  function switchCharacter(avatar: string) {
    if (!avatar || avatar === character.value?.avatar) return
    loadCharacterByAvatar(avatar)
  }

  function reloadCharacter() {
    if (!character.value?.avatar) { showToast(t('character.toast.noneSelected')); return }
    loadCharacterByAvatar(character.value.avatar, { silent: true })
  }

  async function createNewCharacter(name: string) {
    if (characterList.value.some(c => c.name === name)) { showToast(t('character.toast.duplicateName')); return }
    try {
      const newChar = emptyCharacter(name)
      const avatar = await CH.createCharacter(newChar)
      if (!avatar) { showToast(t('character.toast.createFailed')); return }
      refreshCharacterList()
      await loadCharacterByAvatar(avatar, { silent: true })
      showToast(t('character.toast.created', { name }))
    } catch (e: any) {
      showToast(t('character.toast.createFailed', { msg: e?.message || e }))
    }
  }

  async function removeCurrentCharacter() {
    const avatar = character.value?.avatar
    const name = character.value?.name || avatar || ''
    if (!avatar) { showToast(t('character.toast.deleteFailed')); return; }
    try {
      await CH.deleteCharacter(avatar)
      refreshCharacterList()
      const next = characterList.value[0]
      if (next) await loadCharacterByAvatar(next.avatar, { silent: true })
      else { character.value = null; oldRaw.value = null; greetingIds.value = []; pendingAvatarFile.value = null; tabsStore.closeWorkspace('character') }
      showToast(t('character.toast.deleted', { name }))
    } catch (e: any) { showToast(t('character.toast.deleteFailed', { msg: e?.message || e })) }
  }

  async function doSaveCharacter() {
    if (!character.value) { showToast(t('character.toast.noDataToSave')); return }
    const isNew = !oldRaw.value
    try {
      let avatar: string
      if (isNew) {
        avatar = await CH.createCharacter(character.value, pendingAvatarFile.value ?? undefined)
      } else {
        avatar = character.value.avatar
        await CH.editCharacter(character.value, oldRaw.value, pendingAvatarFile.value ?? undefined)
      }
      // 保存后重新拉取最新原始数据，用于下次编辑的字段回退
      const latest = await CH.getCharacterByAvatar(avatar)
      if (latest) {
        character.value.avatar = avatar
        oldRaw.value = latest.raw
      }
      pendingAvatarFile.value = null
      refreshCharacterList()
      dirty.value = false
      showToast(t('character.toast.saved', { name: character.value?.name || avatar }))
    } catch (e: any) { showToast(t('character.toast.saveFailed', { msg: e?.message || e })) }
  }

  return {
    character, oldRaw, characterList, pendingAvatarFile, dirty, markDirty, hasData,
    currentField, setCurrentFieldValue, jumpToFieldHit,
    greetingIds, addGreeting, deleteGreeting, reorderGreeting,
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
    refreshCharacterList, loadCharacterByAvatar, switchCharacter, reloadCharacter,
    createNewCharacter, removeCurrentCharacter, doSaveCharacter,
  }
})
