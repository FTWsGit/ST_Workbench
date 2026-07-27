import { defineStore } from 'pinia'
import { ref, computed, nextTick } from 'vue'
import type { Character, CharacterListEntry, RegexScript } from '../types'
import * as CH from '../api/characterApi'
import { useTabsStore } from './tabsStore'
import { useConfirmStore } from './confirmStore'
import { useUiStore } from './uiStore'

function genGreetingId(): string {
  return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function emptyCharacter(name: string): Character {
  return {
    avatar: '', name,
    description: '', scenario: '', mesExample: '', personality: '',
    systemPrompt: '', postHistoryInstructions: '',
    depthPrompt: { prompt: '', depth: 4, role: 0 },
    greetings: [''],
    creator: '', creatorNotes: '', version: '', tags: [], talkativeness: 0.5, fav: false, worldbook: null,
    extensions: { regex_scripts: [] },
  }
}

/** 独立文档 store（TODO.md 阶段2），跟 worldbookStore 是同一种"不挂靠 presetStore"的工作区
 *  （见 PROJECT.md「新增一个 domain 的套路」）。跟 worldbook 不一样的地方：
 *   - 没有 flatNodes/分组那套坐标系——CharacterSidebar.vue 故意不复用 PresetSidebar 那套复杂度
 *     （TODO.md 2.2），固定字段列表来自 types.ts 的 CHARACTER_FIELDS 常量，不需要排序/分组。
 *   - 只有 greetings 这一个子列表需要拖拽排序（TODO.md 1.2）。greetings 本身在 ST 原生格式/
 *     Character 接口里都只是 `string[]`，没有稳定 id——如果直接拿数组下标当 tab key，
 *     删除/拖拽重排会让已经打开的 tab 悄悄指向另一条内容（这正是 PROJECT.md 反复强调的
 *     "别拿下标当身份"那个坑，这里从一开始就用 greetingIds 这份跟 greetings 严格同步、
 *     只在本地存在的合成 id 数组来做 tab 寻址，不持久化、不参与保存）。 */
export const useCharacterStore = defineStore('character', () => {
  const tabsStore = useTabsStore()
  const confirmStore = useConfirmStore()
  const uiStore = useUiStore()
  const t = uiStore.t
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

  /* ====== greetings 的合成 id（本节顶部 doc comment）====== */
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
      if (fieldKey === 'depthPrompt') character.value.depthPrompt.prompt = value
      else (character.value as any)[fieldKey] = value
    }
    markDirty()
  }

  /* ====== Bound Regex Scripts（同 presetStore.regexScripts 的模式，宿主换成 character） ====== */
  const regexScripts = computed<RegexScript[]>(() => {
    if (!character.value) return []
    if (!character.value.extensions) character.value.extensions = { regex_scripts: [] }
    if (!Array.isArray(character.value.extensions.regex_scripts)) character.value.extensions.regex_scripts = []
    return character.value.extensions.regex_scripts
  })
  function addRegexScript(): string | null {
    if (!character.value) { showToast(t('character.toast.loadFirst')); return null }
    const script: RegexScript = {
      id: 'regex_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      scriptName: 'New Regex', findRegex: '', replaceString: '', trimStrings: [],
      placement: [2],
      disabled: false, markdownOnly: false, promptOnly: false, runOnEdit: false,
      substituteRegex: 0, minDepth: null, maxDepth: null,
    }
    regexScripts.value.push(script)
    markDirty()
    return script.id
  }
  function deleteRegexScript(id: string) {
    const i = regexScripts.value.findIndex(r => r.id === id)
    if (i >= 0) { regexScripts.value.splice(i, 1); markDirty() }
  }
  function reorderRegexScript(fromIdx: number, toIdx: number, after: boolean) {
    const arr = regexScripts.value
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return
    const item = arr.splice(fromIdx, 1)[0]
    const ni = fromIdx < toIdx ? (after ? toIdx : toIdx - 1) : (after ? toIdx + 1 : toIdx)
    arr.splice(ni, 0, item)
    markDirty()
  }

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
  /** `fromIdx`/`toIdx`/`after` 是 useDragReorder<number> 报告的下标（对应 greetingIds 当前顺序，
   *  不是合成 id 本身——useDragReorder 泛型 key 类型用 number 更贴近现有 RegexSidebar 的用法，
   *  拖拽发生在同一次渲染帧内，下标不会失效），greetings 和 greetingIds 两个数组永远同步 splice，
   *  谁也不会跟丢。 */
  function reorderGreeting(fromIdx: number, toIdx: number, after: boolean) {
    if (!character.value) return
    const arr = character.value.greetings
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return
    const ni = fromIdx < toIdx ? (after ? toIdx : toIdx - 1) : (after ? toIdx + 1 : toIdx)
    const item = arr.splice(fromIdx, 1)[0]
    arr.splice(ni, 0, item)
    const idItem = greetingIds.value.splice(fromIdx, 1)[0]
    greetingIds.value.splice(ni, 0, idItem)
    markDirty()
  }

  /* ====== Character IO ====== */
  function applyLoaded(c: Character, raw: any | null) {
    character.value = c
    oldRaw.value = raw
    greetingIds.value = c.greetings.map(() => genGreetingId())
    pendingAvatarFile.value = null
    tabsStore.closeWorkspace('character')
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

  /** 新建一个还没提交给 ST 的空角色——只在内存里存在，`avatar` 是空字符串，doSaveCharacter()
   *  第一次保存时据此走 create 分支（同 worldbookStore.createNewWorldbook() 的"先注册名字，
   *  真正数据靠调用方后续操作"不完全一样：角色卡新建不需要先跟 ST 打招呼，直接给一份空白工作层
   *  数据即可，POST /api/characters/create 本身就是"新建+写入初始内容"一步到位）。 */
  function createNewCharacter(name: string) {
    if (characterList.value.some(c => c.name === name)) { showToast(t('character.toast.duplicateName')); return }
    applyLoaded(emptyCharacter(name), null)
    showToast(t('character.toast.created', { name }))
  }

  async function removeCurrentCharacter() {
    const avatar = character.value?.avatar
    const name = character.value?.name || avatar || ''
    if (!avatar) return // 还没保存过的新角色没有 avatar，本地直接清空即可，不需要调删除接口
    try {
      await CH.deleteCharacter(avatar)
      refreshCharacterList()
      const next = characterList.value[0]
      if (next) await loadCharacterByAvatar(next.avatar, { silent: true })
      else { character.value = null; oldRaw.value = null; greetingIds.value = []; tabsStore.closeWorkspace('character') }
      showToast(t('character.toast.deleted', { name }))
    } catch (e: any) { showToast(t('character.toast.deleteFailed', { msg: e?.message || e })) }
  }

  async function doSaveCharacter() {
    if (!character.value) { showToast(t('character.toast.noDataToSave')); return }
    const isNew = !character.value.avatar
    try {
      let avatar: string
      if (isNew) {
        avatar = await CH.createCharacter(character.value, pendingAvatarFile.value ?? undefined)
      } else {
        avatar = character.value.avatar
        await CH.editCharacter(character.value, oldRaw.value, pendingAvatarFile.value ?? undefined)
      }
      refreshCharacterList()
      dirty.value = false
      showToast(t('character.toast.saved', { name: character.value?.name || avatar }))
    } catch (e: any) { showToast(t('character.toast.saveFailed', { msg: e?.message || e })) }
  }

  return {
    character, oldRaw, characterList, pendingAvatarFile, dirty, markDirty, hasData,
    currentField, setCurrentFieldValue,
    greetingIds, addGreeting, deleteGreeting, reorderGreeting,
    regexScripts, addRegexScript, deleteRegexScript, reorderRegexScript,
    refreshCharacterList, loadCharacterByAvatar, switchCharacter, reloadCharacter,
    createNewCharacter, removeCurrentCharacter, doSaveCharacter,
  }
})
