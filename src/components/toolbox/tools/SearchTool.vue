<template>
  <div class="wb-tools-body">
    <!-- 字段下拉（反馈4：并列按钮不友好，改下拉）+ 字段类型提示 -->
    <FormField :label="uiStore.t('toolbox.search.field')">
      <select class="wb-toolbox-field-select" :value="fieldKey" @change="setField(($event.target as HTMLSelectElement).value)">
        <option v-for="f in searchScene.fields" :key="f.key" :value="f.key">{{ t(f.labelKey) }}（{{ kindLabel(f.kind) }}）</option>
      </select>
    </FormField>

    <!-- 搜索框（text/list 字段才需要 query 输入；enum 字段的命中即候选值本身，query 用候选 toggle 选） -->
    <input v-if="currentFieldKind !== 'enum'" type="text" v-model="query" :placeholder="uiStore.t('toolbox.search.placeholder')"
           @input="idx = -1" @keydown.enter.prevent="nav(1)">
    <!-- enum 字段：候选 toggle 选 query（点哪个就把该候选值当 query，命中即"当前是这个值的全部 item"） -->
    <FormField v-if="currentFieldKind === 'enum'" :label="uiStore.t('toolbox.search.enumHint')">
      <div class="wb-regex-surface">
        <button v-for="c in enumChoices" :key="String(c.value)"
                type="button" class="wb-btn sm"
                :class="{ active: query === String(c.value) }"
                @click="setEnumQuery(c.value)">{{ t(c.labelKey) }}</button>
      </div>
      <p v-if="currentFieldKind === 'enum' && !enumChoices.length" class="wb-muted">{{ uiStore.t('toolbox.search.noEnumChoices') }}</p>
    </FormField>

    <!-- 替换输入框（仅 text/list 字段；enum 字段走候选 toggle 选目标值，反馈2） -->
    <input v-if="currentFieldKind !== 'enum' && enumChoices.length === 0" type="text" v-model="replace" :placeholder="uiStore.t('toolbox.search.replacePlaceholder')"
           @keydown.enter.prevent="replaceCurrent()">

    <!-- enum 字段的目标值候选区（替换=改成另一个候选值；反馈2：禁止字符串替换避免把布尔/数值改坏） -->
    <FormField v-if="currentFieldKind === 'enum' && enumChoices.length" :label="uiStore.t('toolbox.search.replace')">
      <div class="wb-regex-surface">
        <button v-for="c in enumChoices" :key="'r' + String(c.value)"
                type="button" class="wb-btn sm"
                :class="{ active: replace === String(c.value) }"
                @click="replace = String(c.value)">{{ t(c.labelKey) }}</button>
      </div>
    </FormField>

    <!-- 导航 + 单条替换 + 全替换 + 把命中同步到 sidebar 多选态（反馈3：modify what matched） -->
    <div class="wb-tools-section">
      <div class="wb-regex-surface">
        <button class="wb-btn sm" :disabled="!hits.length" @click="nav(-1)">◀</button>
        <button class="wb-btn sm" :disabled="!hits.length" @click="nav(1)">▶</button>
        <button class="wb-btn sm" :disabled="idx < 0" @click="replaceCurrent()">{{ uiStore.t('toolbox.search.replace') }}</button>
        <button class="wb-btn sm" :disabled="!hits.length" @click="replaceAll()">{{ uiStore.t('toolbox.search.replaceAll') }}</button>
        <button v-if="canSelectSide" class="wb-btn sm" :disabled="!hits.length" @click="selectSide()">{{ uiStore.t('toolbox.search.selectSide') }}</button>
        <span class="wb-preset-search-count">{{ uiStore.t('toolbox.search.results', { count: hits.length }) }}</span>
      </div>
      <p v-if="canSelectSide" class="wb-muted">{{ uiStore.t('toolbox.search.selectSideHint') }}</p>
    </div>

    <!-- 结果列表：点击行跳转（命中行本身不再勾选——批改走 sidebar 多选态，由 BatchTool 作用） -->
    <div class="wb-preset-search-results" v-if="hits.length">
      <div v-for="(r, i) in displayHits" :key="i"
           class="wb-preset-sr-item" :class="{ active: i === idx }"
           @click="jumpTo(i)">
        <span class="wb-preset-sr-block">{{ r.itemName }}</span>
        <span class="wb-preset-sr-line">{{ r.line >= 0 ? 'L' + (r.line + 1) : '' }}</span>
        <span class="wb-preset-sr-ctx" v-html="renderCtx(r)"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 工具箱 Search 工具：人机壳（字段下拉 + query/replace + enum 候选区 + 结果列表 + 导航 + 单替换/全替换）。
 *  当前 scene 由 getSearchScene() 从 stores 拉，hits 由 utils.searchFields 纯函数算；
 *  跳转/替换经 searchFields.ts 的 jumpToFieldHit/applyReplace 派到对应 store。
 *  enum 字段不走字符串 replace（会把布尔/数值改坏），改用候选 toggle 选目标值（反馈2）。
 *  "modify what matched"的回路：把搜索命中同步到 store.selectedGi（sidebar 多选态），让工具箱
 *  BatchTool 直接作用于搜索选中的块——Search 不自己另搞一套勾选/批改（反馈3修正：批改是 BatchTool 的职责）。 */
import { ref, computed, watch } from 'vue'
import { useTabsStore } from '../../../stores/tabsStore'
import { useUiStore } from '../../../stores/uiStore'
import { usePresetStore } from '../../../stores/presetStore'
import { useWorldbookStore } from '../../../stores/worldbookStore'
import { useCharacterStore } from '../../../stores/characterStore'
import { esc, searchFields, type SearchHit, type SearchField } from '../../../utils'
import { getSearchScene, applyReplace, jumpToFieldHit, getEnumChoices, type EnumChoice } from '../searchFields'
import FormField from '../../shared/FormField.vue'
import { SEARCH_MAX } from '../../../types'

const props = defineProps<{
  workspace?: string
  collection?: string
  scene?: { workspace: string; collection: string }
}>()

const tabsStore = useTabsStore()
const uiStore = useUiStore()
const presetStore = usePresetStore()
const worldbookStore = useWorldbookStore()
const characterStore = useCharacterStore()

const workspace = computed(() => props.scene?.workspace ?? props.workspace ?? tabsStore.activeWorkspace)
const collection = computed(() => props.scene?.collection ?? props.collection ?? tabsStore.sidebarCollection)

/** SearchField.labelKey 声明为 string（纯函数不感知 i18n），UI 侧翻译时收窄成 LocaleKey。 */
function t(key: string): string { return uiStore.t(key as any) }
function kindLabel(kind: SearchField['kind']): string {
  return kind === 'text' ? uiStore.t('common.text') : kind === 'list' ? uiStore.t('common.list') : uiStore.t('common.enum')
}

/** 当前 scene 的 items + 字段表 + meta getter（跟随 store 数据响应式更新）。 */
const searchScene = computed(() => getSearchScene(workspace.value, collection.value))

const fieldKey = ref('')
const query = ref('')
const replace = ref('')
const idx = ref(-1)

/** scene/字段切换后：旧字段不存在则回落到第一个字段；命中索引/替换值重置。 */
watch(searchScene, (s) => {
  if (!s.fields.some(f => f.key === fieldKey.value)) fieldKey.value = s.fields[0]?.key ?? ''
  idx.value = -1
  replace.value = ''
}, { immediate: true })

const currentField = computed<SearchField | undefined>(() => searchScene.value.fields.find(f => f.key === fieldKey.value))
const currentFieldKind = computed(() => currentField.value?.kind ?? 'text')
const enumChoices = computed<EnumChoice[]>(() => currentFieldKind.value === 'enum' ? getEnumChoices(workspace.value, collection.value, fieldKey.value) : [])

const hits = computed(() => {
  if (!query.value || !fieldKey.value) return []
  const field = currentField.value
  if (!field) return []
  return searchFields(searchScene.value.items, [field], query.value, searchScene.value.getItemMeta)
})
const displayHits = computed(() => hits.value.slice(0, SEARCH_MAX))

/** "modify what matched"回路挂了的 scene 全覆盖——preset/items + worldbook/items 走 store.selectedGi
 *  (useGroupedList 多选态)，regex scene 走 tabsStore 共享态(regex sidebar 无 useGroupedList，BatchTool
 *  读这份共享态批改)。character/fields 无批量工具不出按钮。 */
const canSelectSide = computed(() =>
  (workspace.value === 'preset' && collection.value === 'items') ||
  (workspace.value === 'worldbook' && collection.value === 'items') ||
  (collection.value === 'regex')
)

function setField(key: string) {
  fieldKey.value = key
  idx.value = -1
  query.value = ''
  replace.value = ''
}
/** enum 字段选候选值当 query：点哪个候选就把该值的字符串形式当 query，命中即"当前是这个值的全部 item"。 */
function setEnumQuery(value: any) {
  query.value = String(value)
  idx.value = -1
}

function renderCtx(r: SearchHit) {
  const b = esc(r.context.substring(0, r.ms)), m = esc(r.context.substring(r.ms, r.ms + r.ml)), a = esc(r.context.substring(r.ms + r.ml))
  return b + '<em>' + m + '</em>' + a
}

function jumpTo(i: number) {
  if (i < 0 || i >= hits.value.length) return
  idx.value = i
  jumpToFieldHit(workspace.value, hits.value[i])
}
function nav(dir: number) {
  if (!hits.value.length) return
  idx.value = (idx.value + dir + hits.value.length) % hits.value.length
  jumpToFieldHit(workspace.value, hits.value[idx.value])
}

function replaceCurrent() {
  if (idx.value < 0 || idx.value >= hits.value.length) return
  applyReplace(workspace.value, collection.value, searchScene.value, hits.value[idx.value], replace.value)
  idx.value = -1
}
function replaceAll() {
  if (!hits.value.length) return
  // 同一 item+field 内的多条命中按位置从后往前替换，避免先替换的位移把后面的坐标顶偏
  const groups = new Map<string, SearchHit[]>()
  for (const h of hits.value) {
    const k = h.itemId + '\u0000' + h.fieldKey
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(h)
  }
  for (const g of groups.values()) {
    for (const h of g.slice().reverse()) applyReplace(workspace.value, collection.value, searchScene.value, h, replace.value)
  }
  idx.value = -1
}

/* ====== 把命中同步到选中态（反馈3：modify what matched） ======
 * 按 scene 分派选中态出口——都走 sidebar 自己那份 useGroupedList 选中态（store.selectedGi 或
 * store.regexSelectedGi），让 sidebar 模板高亮 + BatchTool 都读同一份态：
 *  - preset/items + worldbook/items：走 store.selectedGi。命中的 itemId 是 OrderItem.identifier；
 *    revealAndFindGi 先展包折叠组再 identifierToGi 反查 gi。触发 requestListScroll 让 sidebar 滚到 anchor：
 *    先脉冲 selectBlock(anchor)（它触发 requestListScroll 但会按多选态改 selectedGi），再覆写 selectedGi
 *    为命中集合，避免脉冲的多选态把命中集合冲掉。
 *  - regex scene：走 store.regexSelectedGi（同模式，regex 呟加 useGroupedList 后接的出口）。 */
function selectSide() {
  if (!canSelectSide.value || !hits.value.length) return
  if (collection.value === 'regex') {
    const store = workspace.value === 'character' ? characterStore : presetStore
    const gis = new Set<number>()
    let anchor = -1
    for (const h of hits.value) {
      const gi = store.regexRevealAndFindGi(h.itemId)
      if (gi >= 0) { gis.add(gi); if (anchor < 0) anchor = gi }
    }
    if (anchor >= 0) store.regexSelectBlock(anchor) // 脉冲：触发 requestListScroll 滚到 anchor
    store.regexSelectedGi = gis                   // 覆写为命中集合（脉冲的多选态不是我们要的）
    store.regexAnchorGi = anchor
    return
  }
  const store = workspace.value === 'preset' ? presetStore : worldbookStore
  const gis = new Set<number>()
  let anchor = -1
  for (const h of hits.value) {
    const gi = store.revealAndFindGi(h.itemId)
    if (gi >= 0) { gis.add(gi); if (anchor < 0) anchor = gi }
  }
  if (anchor >= 0) store.selectBlock(anchor) // 脉冲：触发 requestListScroll 滚到 anchor
  store.selectedGi = gis                     // 覆写为命中集合（脉冲的多选态不是我们要的）
  store.anchorGi = anchor
}
</script>


