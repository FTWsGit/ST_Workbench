<template>
  <div v-if="entry" class="rx-form" @change="store.markDirty()" @input="store.markDirty()">
    <div class="wb-field-row" style="margin-top:0">
      <span class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.enabled') }}</span>
      <span class="wb-toggle-sw" :class="{ on: enabled }" @click="enabled = !enabled"></span>
    </div>

    <label class="rx-label">{{ uiStore.t('worldbook.settings.commentLabel') }}</label>
    <input class="rx-input" v-model="entry.comment" :placeholder="uiStore.t('worldbook.settings.commentPlaceholder')" @input="onCommentInput" />

    <!-- 除了名字和启用，其余字段全部塞进下面 4 个可折叠分组，不再无差别摊平成一整条竖列 -->

    <AdvancedGroup :title="uiStore.t('worldbook.settings.groupActivation')" default-open>
      <label class="rx-label" style="margin-top:0">{{ uiStore.t('worldbook.settings.activationLabel') }}</label>
      <div class="rx-surface">
        <button class="wb-btn sm" :class="{ active: activationMode === 'keyWord' }" @click="setActivation('keyWord')">{{ uiStore.t('worldbook.activation.keyWord') }}</button>
        <button class="wb-btn sm" :class="{ active: activationMode === 'constant' }" @click="setActivation('constant')">{{ uiStore.t('worldbook.activation.constant') }}</button>
        <button class="wb-btn sm" :class="{ active: activationMode === 'vectorized' }" @click="setActivation('vectorized')">{{ uiStore.t('worldbook.activation.vectorized') }}</button>
      </div>

      <!-- 关键词框只在"关键词"激活方式下才有意义（constant/vectorized 不参与关键词匹配），
           之前无条件显示是在误导人——恒定/向量化模式下填了也不会生效。 -->
      <template v-if="activationMode === 'keyWord'">
        <label class="rx-label">{{ uiStore.t('worldbook.settings.keysLabel') }}</label>
        <textarea class="rx-textarea" rows="2" v-model="keysText" :placeholder="uiStore.t('worldbook.settings.keysPlaceholder')"></textarea>

        <label class="rx-check"><input type="checkbox" v-model="entry.selective" /> {{ uiStore.t('worldbook.settings.selective') }}</label>
        <template v-if="entry.selective">
          <label class="rx-label">{{ uiStore.t('worldbook.settings.keysSecondaryLabel') }}</label>
          <textarea class="rx-textarea" rows="2" v-model="keysSecondaryText" :placeholder="uiStore.t('worldbook.settings.keysPlaceholder')"></textarea>
          <div class="wb-field-row">
            <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.logicLabel') }}</label>
            <select v-model.number="entry.selectiveLogic">
              <option v-for="o in LOGIC_OPTIONS" :key="o.value" :value="o.value">{{ uiStore.t(o.labelKey) }}</option>
            </select>
          </div>
        </template>
      </template>

      <label class="rx-check">
        <input type="checkbox" v-model="entry.useProbability" />
        {{ uiStore.t('worldbook.settings.probabilityLabel') }}
      </label>
      <NumberInput v-if="entry.useProbability" v-model="entry.probability" :min="0" :max="100" :nullable="false" />
    </AdvancedGroup>

    <AdvancedGroup :title="uiStore.t('worldbook.settings.groupPosition')">
      <div class="wb-field-row" style="margin-top:0">
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.positionLabel') }}</label>
        <select v-model.number="entry.position">
          <option v-for="o in POSITION_OPTIONS" :key="o.value" :value="o.value">{{ uiStore.t(o.labelKey) }}</option>
        </select>
      </div>
      <div v-if="entry.position === 4" class="wb-row">
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.depthLabel') }}</label>
        <NumberInput v-model="entry.depth" :nullable="false" />
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.roleLabel') }}</label>
        <select v-model="roleModel">
          <option v-for="o in ROLE_OPTIONS" :key="String(o.value)" :value="o.value">{{ uiStore.t(o.labelKey) }}</option>
        </select>
      </div>
      <div class="wb-field-row">
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.orderLabel') }}</label>
        <NumberInput v-model="entry.order" :nullable="false" />
      </div>
    </AdvancedGroup>

    <AdvancedGroup :title="uiStore.t('worldbook.settings.groupRecursion')">
      <label class="rx-check"><input type="checkbox" v-model="entry.excludeRecursion" /> {{ uiStore.t('worldbook.settings.excludeRecursion') }}</label>
      <label class="rx-check"><input type="checkbox" v-model="entry.preventRecursion" /> {{ uiStore.t('worldbook.settings.preventRecursion') }}</label>
      <label class="rx-check"><input type="checkbox" v-model="delayUntilRecursionModel" /> {{ uiStore.t('worldbook.settings.delayUntilRecursion') }}</label>

      <div class="wb-field-row">
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.scanDepthLabel') }}</label>
        <NumberInput v-model="scanDepthModel" :placeholder="uiStore.t('worldbook.settings.sameAsGlobal')" />
      </div>

      <!-- 大小写/全词匹配只在关键词激活方式下才参与匹配，同样的理由，同样地按 activationMode 收起来 -->
      <template v-if="activationMode === 'keyWord'">
        <div class="wb-field-row">
          <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.caseSensitiveLabel') }}</label>
          <SegmentedControl v-model="caseSensitiveModel" :options="tristateOptions" />
        </div>
        <div class="wb-field-row">
          <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.matchWholeWordsLabel') }}</label>
          <SegmentedControl v-model="matchWholeWordsModel" :options="tristateOptions" />
        </div>
      </template>
    </AdvancedGroup>

    <AdvancedGroup :title="uiStore.t('worldbook.settings.groupEffects')">
      <div class="wb-row">
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.stickyLabel') }}</label>
        <NumberInput v-model="stickyModel" />
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.cooldownLabel') }}</label>
        <NumberInput v-model="cooldownModel" />
        <label class="rx-label" style="margin:0">{{ uiStore.t('worldbook.settings.delayLabel') }}</label>
        <NumberInput v-model="delayModel" />
      </div>

      <label class="rx-label">{{ uiStore.t('worldbook.settings.groupLabel') }}</label>
      <input class="rx-input" v-model="entry.group" :placeholder="uiStore.t('worldbook.settings.groupPlaceholder')" />
      <label class="rx-check"><input type="checkbox" v-model="entry.groupPrioritized" /> {{ uiStore.t('worldbook.settings.groupPrioritized') }}</label>
    </AdvancedGroup>
  </div>
</template>

<script setup lang="ts">
/* 世界书条目设置表单——不参数化，直接 useWorldbookStore()，跟 WorldbookSidebar.vue 顶部同样的
 * 理由。字段比正则脚本多不少（ST 原生世界书条目本来就是所有 domain 里字段最多的），主表单只放
 * 名字/启用两个字段，其余全部按语义分到 4 个 AdvancedGroup 里（激活策略/插入位置/递归与匹配/
 * 特殊效果），取代原来"一个 rx-advanced 大杂烩塞剩下所有字段"的做法。
 *
 * 【2026-07 UI 重构】除了分组，还做了几件事：
 *   1. 关键词框（主/次）、大小写/全词匹配 都改成只在 activationMode === 'keyWord' 下显示——
 *      ST 原生这些字段在 constant/vectorized 模式下本来就不参与匹配，之前无条件显示纯属误导。
 *   2. order/depth/probability/scanDepth/sticky/cooldown/delay 全部换成 NumberInput.vue
 *      （原生 input 基础上加一个拖拽手柄），caseSensitive/matchWholeWords 换成 SegmentedControl
 *      （3 选项：跟随全局/开/关），position/role/logic 保留原生 select（选项多或标签偏长，
 *      分段按钮装不下），但配 .wb-field-row 让 label 和 select 同一行，不再各占一整行。
 *   3. "启用" 换成跟 WorldbookSidebar.vue / RegexSidebar.vue 里同款的 .wb-toggle-sw 滑块，
 *      而不是原生 checkbox——这是整个应用里已经在用的"重要开关"视觉语言，跟侧边栏保持一致。
 *
 * 【2026-07 修正，早于本次重构】markDirty 靠表单根节点的 @change/@input 事件委托兜底，不是靠
 * 每个字段各自的 computed setter——worldbookStore.ts 里 entries 是浅监听（watch(entries,
 * markDirty)，不带 deep），原因跟 presetStore.ts 的 prompts 一样：entry.content 是高频编辑
 * 热路径，深度监听整个 entries 数组开销大。这次重构没有改这套机制，只是多了两层考量：
 *   - AdvancedGroup/SegmentedControl 只是包了一层 Vue 组件，不影响原生 DOM 事件冒泡（Vue
 *     组件不是 Shadow DOM 边界），select/checkbox 的 change 事件照样能冒泡到 .rx-form 根节点。
 *   - SegmentedControl 是按钮不是 select/checkbox，点击不会触发 change/input，所以只用在
 *     caseSensitiveModel/matchWholeWordsModel 这种"setter 里已经手动 markDirty() 的
 *     computed 包装字段"上，不用在依赖委托兜底的裸字段上（比如 selectiveLogic 这种直接
 *     v-model entry 字段的，继续留在原生 select 上，不换控件类型）。
 *   - NumberInput.vue 内部会在拖拽结束时手动对真实 <input> 派发一次原生 input 事件（见该
 *     组件内的 doc comment），所以哪怕是拖拽出来的改动，也照样会被这里的委托抓到，不用额外
 *     处理。 */
import { computed, watch } from 'vue'
import { useTabsStore } from '../../stores/tabsStore'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useUiStore } from '../../stores/uiStore'
import { WORLDBOOK_POSITION_OPTIONS as POSITION_OPTIONS, WORLDBOOK_LOGIC_OPTIONS as LOGIC_OPTIONS, WORLDBOOK_ROLE_OPTIONS as ROLE_OPTIONS } from '../../types'
import AdvancedGroup from '../shared/AdvancedGroup.vue'
import SegmentedControl from '../shared/SegmentedControl.vue'
import NumberInput from '../shared/NumberInput.vue'

const tabsStore = useTabsStore()
const store = useWorldbookStore()
const uiStore = useUiStore()

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

// 跟随全局设置(same)/开(true)/关(false) 三态，caseSensitive/matchWholeWords 共用同一套逻辑，
// 现在直接喂给 SegmentedControl 当 modelValue（string 类型），组件本身不关心具体是哪个字段
const tristateOptions = computed(() => [
  { value: 'same', label: uiStore.t('worldbook.settings.sameAsGlobal') },
  { value: 'true', label: uiStore.t('common.on') },
  { value: 'false', label: uiStore.t('common.off') },
])
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
