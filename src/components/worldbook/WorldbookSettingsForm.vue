<template>
  <div v-if="entry" class="rx-form" @change="store.markDirty()" @input="store.markDirty()">
    <label class="rx-check"><input type="checkbox" v-model="enabled" /> {{ uiStore.t('worldbook.settings.enabled') }}</label>

    <label class="rx-label">{{ uiStore.t('worldbook.settings.commentLabel') }}</label>
    <input class="rx-input" v-model="entry.comment" :placeholder="uiStore.t('worldbook.settings.commentPlaceholder')" @input="onCommentInput" />

    <label class="rx-label">{{ uiStore.t('worldbook.settings.keysLabel') }}</label>
    <textarea class="rx-textarea" rows="2" v-model="keysText" :placeholder="uiStore.t('worldbook.settings.keysPlaceholder')"></textarea>

    <label class="rx-label">{{ uiStore.t('worldbook.settings.activationLabel') }}</label>
    <div class="rx-surface">
      <button class="wb-btn sm" :class="{ active: activationMode === 'keyWord' }" @click="setActivation('keyWord')">{{ uiStore.t('worldbook.activation.keyWord') }}</button>
      <button class="wb-btn sm" :class="{ active: activationMode === 'constant' }" @click="setActivation('constant')">{{ uiStore.t('worldbook.activation.constant') }}</button>
      <button class="wb-btn sm" :class="{ active: activationMode === 'vectorized' }" @click="setActivation('vectorized')">{{ uiStore.t('worldbook.activation.vectorized') }}</button>
    </div>

    <template v-if="activationMode === 'keyWord'">
      <label class="rx-check"><input type="checkbox" v-model="entry.selective" /> {{ uiStore.t('worldbook.settings.selective') }}</label>
      <template v-if="entry.selective">
        <label class="rx-label">{{ uiStore.t('worldbook.settings.keysSecondaryLabel') }}</label>
        <textarea class="rx-textarea" rows="2" v-model="keysSecondaryText" :placeholder="uiStore.t('worldbook.settings.keysPlaceholder')"></textarea>
        <label class="rx-label">{{ uiStore.t('worldbook.settings.logicLabel') }}</label>
        <select class="wb-select-wide" v-model.number="entry.selectiveLogic">
          <option v-for="o in LOGIC_OPTIONS" :key="o.value" :value="o.value">{{ uiStore.t(o.labelKey) }}</option>
        </select>
      </template>
    </template>

    <label class="rx-label">{{ uiStore.t('worldbook.settings.positionLabel') }}</label>
    <select class="wb-select-wide" v-model.number="entry.position">
      <option v-for="o in POSITION_OPTIONS" :key="o.value" :value="o.value">{{ uiStore.t(o.labelKey) }}</option>
    </select>
    <div v-if="entry.position === 4" class="wb-row">
      <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.depthLabel') }}</label>
      <input class="rx-input rx-num" type="number" v-model.number="entry.depth" />
      <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.roleLabel') }}</label>
      <select class="wb-select-wide" v-model="roleModel">
        <option v-for="o in ROLE_OPTIONS" :key="String(o.value)" :value="o.value">{{ uiStore.t(o.labelKey) }}</option>
      </select>
    </div>

    <label class="rx-label">{{ uiStore.t('worldbook.settings.orderLabel') }}</label>
    <input class="rx-input rx-num" type="number" v-model.number="entry.order" />

    <label class="rx-check">
      <input type="checkbox" v-model="entry.useProbability" />
      {{ uiStore.t('worldbook.settings.probabilityLabel') }}
    </label>
    <input v-if="entry.useProbability" class="rx-input rx-num" type="number" min="0" max="100" v-model.number="entry.probability" />

    <button class="wb-btn wb-advanced-toggle" @click="advancedOpen = !advancedOpen">{{ advancedOpen ? '▾' : '▸' }} {{ uiStore.t('regex.settings.advancedToggle') }}</button>
    <div v-if="advancedOpen" class="rx-advanced">
      <label class="rx-check"><input type="checkbox" v-model="entry.excludeRecursion" /> {{ uiStore.t('worldbook.settings.excludeRecursion') }}</label>
      <label class="rx-check"><input type="checkbox" v-model="entry.preventRecursion" /> {{ uiStore.t('worldbook.settings.preventRecursion') }}</label>
      <label class="rx-check"><input type="checkbox" v-model="delayUntilRecursionModel" /> {{ uiStore.t('worldbook.settings.delayUntilRecursion') }}</label>

      <label class="rx-label">{{ uiStore.t('worldbook.settings.scanDepthLabel') }}</label>
      <input class="rx-input rx-num" type="number" v-model.number="scanDepthModel" :placeholder="uiStore.t('worldbook.settings.sameAsGlobal')" />

      <label class="rx-label">{{ uiStore.t('worldbook.settings.caseSensitiveLabel') }}</label>
      <select class="wb-select-wide" v-model="caseSensitiveModel">
        <option value="same">{{ uiStore.t('worldbook.settings.sameAsGlobal') }}</option>
        <option value="true">{{ uiStore.t('common.on') }}</option>
        <option value="false">{{ uiStore.t('common.off') }}</option>
      </select>

      <label class="rx-label">{{ uiStore.t('worldbook.settings.matchWholeWordsLabel') }}</label>
      <select class="wb-select-wide" v-model="matchWholeWordsModel">
        <option value="same">{{ uiStore.t('worldbook.settings.sameAsGlobal') }}</option>
        <option value="true">{{ uiStore.t('common.on') }}</option>
        <option value="false">{{ uiStore.t('common.off') }}</option>
      </select>

      <div class="wb-row">
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.stickyLabel') }}</label>
        <input class="rx-input rx-num" type="number" v-model.number="stickyModel" />
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.cooldownLabel') }}</label>
        <input class="rx-input rx-num" type="number" v-model.number="cooldownModel" />
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.delayLabel') }}</label>
        <input class="rx-input rx-num" type="number" v-model.number="delayModel" />
      </div>

      <label class="rx-label">{{ uiStore.t('worldbook.settings.groupLabel') }}</label>
      <input class="rx-input" v-model="entry.group" :placeholder="uiStore.t('worldbook.settings.groupPlaceholder')" />
      <label class="rx-check"><input type="checkbox" v-model="entry.groupPrioritized" /> {{ uiStore.t('worldbook.settings.groupPrioritized') }}</label>
    </div>
  </div>
</template>

<script setup lang="ts">
/* 世界书条目设置表单——不参数化，直接 useWorldbookStore()，跟 WorldbookSidebar.vue 顶部同样的
 * 理由。字段比正则脚本多不少（ST 原生世界书条目本来就是所有 domain 里字段最多的），主表单只放
 * 高频字段，其余塞进"高级"折叠区，跟 RegexSettingsForm.vue 的 rx-advanced 是同一个模式。
 *
 * 【2026-07 修正】markDirty 靠表单根节点的 @change/@input 事件委托兜底，不是靠每个字段各自的
 * computed setter——worldbookStore.ts 里 entries 是浅监听（watch(entries, markDirty)，不带
 * deep），原因跟 presetStore.ts 的 prompts 一样：entry.content 是高频编辑热路径，深度监听整个
 * entries 数组开销大。但这就意味着 `v-model="entry.position"` 这种直接改 entry 嵌套字段的写法，
 * 浅监听根本捕捉不到，之前只有 keys/keysecondary/role/scanDepth 等几个包了 computed 的字段会
 * markDirty，Position/Depth/Order/selective/useProbability/probability/excludeRecursion/
 * preventRecursion/group/groupPrioritized 这些直接 v-model 的字段全都漏了，改了也不会提示未保存。
 * 深度监听 entries 又会把 content 热路径的性能问题带回来，所以选了原生 change/input 事件委托这条
 * 路——checkbox/select 走 change，text/number 走 input，冒泡到表单根节点统一兜底，跟字段数量/
 * 以后加不加新字段无关，一次性解决，不用每加一个字段就记得手动 markDirty()。少数已经包了
 * computed 的字段（比如下面的 enabled/keysText）会跟着 change/input 委托重复调用一次
 * markDirty()，是无害的幂等操作，不用特意去重。 */
import { ref, computed, watch } from 'vue'
import { useTabsStore } from '../../stores/tabsStore'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useUiStore } from '../../stores/uiStore'
import { WORLDBOOK_POSITION_OPTIONS as POSITION_OPTIONS, WORLDBOOK_LOGIC_OPTIONS as LOGIC_OPTIONS, WORLDBOOK_ROLE_OPTIONS as ROLE_OPTIONS } from '../../types'

const tabsStore = useTabsStore()
const store = useWorldbookStore()
const uiStore = useUiStore()
const advancedOpen = ref(false)

const entry = computed(() => store.currentEntry)

const enabled = computed({
  get: () => !entry.value?.disabled,
  set: (v: boolean) => { if (entry.value) { entry.value.disabled = !v; store.markDirty() } },
})

const activationMode = computed(() => {
  if (!entry.value) return 'keyWord'
  if (entry.value.constant) return 'constant'
  if (entry.value.vectorized) return 'vectorized'
  return 'keyWord'
})
function setActivation(mode: 'keyWord' | 'constant' | 'vectorized') {
  if (!entry.value) return
  entry.value.constant = mode === 'constant'
  entry.value.vectorized = mode === 'vectorized'
  entry.value.keyWord = mode === 'keyWord'
  store.markDirty()
}

const keysText = computed({
  get: () => (entry.value?.keys || []).join(', '),
  set: (v: string) => { if (entry.value) { entry.value.keys = v.replace(/[\n\t]/g, ',').split(',').map(s => s.trim()).filter(Boolean); store.markDirty() } },
})
const keysSecondaryText = computed({
  get: () => (entry.value?.keysecondary || []).join(', '),
  set: (v: string) => { if (entry.value) { entry.value.keysecondary = v.replace(/[\n\t]/g, ',').split(',').map(s => s.trim()).filter(Boolean); store.markDirty() } },
})

const roleModel = computed({
  get: () => entry.value?.role ?? null,
  set: (v: any) => { if (entry.value) { entry.value.role = v === '' ? null : (Number(v) as 0 | 1 | 2); store.markDirty() } },
})

const delayUntilRecursionModel = computed({
  get: () => !!entry.value?.delayUntilRecursion,
  set: (v: boolean) => { if (entry.value) { entry.value.delayUntilRecursion = v; store.markDirty() } },
})
const scanDepthModel = computed({
  get: () => entry.value?.scanDepth ?? null,
  set: (v: any) => { if (entry.value) { entry.value.scanDepth = (v === null || v === '' || Number.isNaN(v)) ? null : v; store.markDirty() } },
})
function tristateModel(field: 'caseSensitive' | 'matchWholeWords') {
  return computed<string>({
    get: () => {
      const v = entry.value?.[field]
      if (v === true) return 'true'
      if (v === false) return 'false'
      return 'same'
    },
    set: (v: string) => {
      if (!entry.value) return
      // null = 跟随全局设置，2026-07 修正：ST 原生就是拿 null 当"同义站位符"，不是字符串
      // 'same_as_global'——见 types.ts WorldbookEntry.caseSensitive 的 doc comment。
      entry.value[field] = v === 'same' ? null : v === 'true'
      store.markDirty()
    },
  })
}
const caseSensitiveModel = tristateModel('caseSensitive')
const matchWholeWordsModel = tristateModel('matchWholeWords')

function nullableNumberModel(field: 'sticky' | 'cooldown' | 'delay') {
  return computed({
    get: () => entry.value?.[field] ?? null,
    set: (v: any) => { if (entry.value) { entry.value[field] = (v === null || v === '' || Number.isNaN(v)) ? null : v; store.markDirty() } },
  })
}
const stickyModel = nullableNumberModel('sticky')
const cooldownModel = nullableNumberModel('cooldown')
const delayModel = nullableNumberModel('delay')

// 名字改了同步标签栏文字，逐字触发，理由跟 RegexSettingsForm.vue 同名 watch 一致——不要用
// open()，避免每敲一个字都触发一次 sidebar scrollIntoView。
function onCommentInput() { store.markDirty() }
watch(() => entry.value?.comment, (name) => {
  if (entry.value) tabsStore.renameTab('worldbook', String(entry.value.uid), name || uiStore.t('common.unnamed'))
})
</script>
