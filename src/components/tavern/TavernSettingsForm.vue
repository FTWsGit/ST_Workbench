<template>
  <div v-if="script" class="wb-form">
    <FormField inline>
      <span class="wb-form-label">{{ props.t('tavern.settings.enabled') }}</span>
      <span class="wb-toggle-sw" :class="{ on: enabled }" @click="enabled = !enabled"></span>
    </FormField>

    <FormField :label="props.t('tavern.settings.nameLabel')">
      <input class="wb-form-input" v-model="script.name" :placeholder="props.t('tavern.settings.namePlaceholder')" />
    </FormField>

    <FormField :label="props.t('tavern.settings.infoLabel')">
      <textarea class="wb-form-textarea" rows="3" v-model="script.info" :placeholder="props.t('tavern.settings.infoPlaceholder')"></textarea>
    </FormField>

    <FormField inline>
      <span class="wb-form-label">{{ props.t('tavern.settings.buttonEnabledLabel') }}</span>
      <span class="wb-toggle-sw" :class="{ on: buttonEnabled }" @click="buttonEnabled = !buttonEnabled"></span>
    </FormField>

    <div v-if="buttonEnabled">
      <FormField :label="props.t('tavern.settings.buttonsLabel')">
        <div class="wb-form-buttons-list">
          <div v-for="(button, idx) in script.button.buttons" :key="idx" class="wb-form-button-item">
            <input class="wb-form-input" v-model="button.name" :placeholder="props.t('tavern.settings.buttonTextPlaceholder')" />
            <button class="wb-btn sm danger" @click="removeButton(idx)">✕</button>
          </div>
          <button class="wb-btn sm" @click="addButton">{{ props.t('tavern.settings.addButton') }}</button>
        </div>
      </FormField>
    </div>

    <div class="wb-form-section">
      <FormField :label="props.t('tavern.settings.dataLabel')">
        <textarea
          class="wb-form-textarea wb-form-data-json"
          rows="10"
          :value="dataJsonText"
          @blur="onDataJsonBlur"
          :placeholder="props.t('tavern.settings.dataJsonPlaceholder')"
          spellcheck="false"
        />
        <p v-if="dataJsonError" class="wb-regex-err">{{ dataJsonError }}</p>
      </FormField>
    </div>

    <div class="wb-form-section">
      <FormField inline>
        <span class="wb-form-label">{{ props.t('tavern.settings.exportDataLabel') }}</span>
        <span class="wb-toggle-sw" :class="{ on: exportData }" @click="exportData = !exportData"></span>
      </FormField>

      <FormField inline>
        <span class="wb-form-label">{{ props.t('tavern.settings.exportButtonLabel') }}</span>
        <span class="wb-toggle-sw" :class="{ on: exportButton }" @click="exportButton = !exportButton"></span>
      </FormField>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTabsStore } from '../../stores/tabsStore'
import type { Script, ScriptTree } from '../../types'
import type { TavernSettingsFormProps } from './tavernProps'
import FormField from '../shared/FormField.vue'

const props = defineProps<TavernSettingsFormProps>()

const tabsStore = useTabsStore()

/** 当前选中 tavern 脚本（按 activeTab.key 匹配 id，只取 type='script'）。 */
const script = computed(() => props.scripts.find((s: ScriptTree) => s.id === tabsStore.activeTab?.key && s.type === 'script') as Script | undefined)

/** enabled 直绑（script.enabled 是布尔，不需要像 regex 的 disabled 那样取反）。 */
const enabled = computed({
  get: () => script.value?.enabled ?? false,
  set: (v: boolean) => { if (script.value) script.value.enabled = v },
})
const buttonEnabled = computed({
  get: () => script.value?.button.enabled ?? false,
  set: (v: boolean) => { if (script.value) script.value.button.enabled = v },
})
const exportData = computed({
  get: () => script.value?.export_with.data ?? false,
  set: (v: boolean) => { if (script.value) script.value.export_with.data = v },
})
const exportButton = computed({
  get: () => script.value?.export_with.button ?? false,
  set: (v: boolean) => { if (script.value) script.value.export_with.button = v },
})

/** 按钮列表操作：新建按钮按上游 Js-Slash-Runner 契约给默认值 name='' + visible=true。 */
function addButton() {
  if (!script.value) return
  script.value.button.buttons.push({ name: '', visible: true })
}

function removeButton(idx: number) {
  if (!script.value) return
  script.value.button.buttons.splice(idx, 1)
}

/** 变量数据：单个 JSON 文本框整体编辑。
 *  dataJsonText 是文本框内容：script.data 稳定时序列化为美化 JSON；用户编辑后只在 blur 时回写。
 *  dataJsonError 非空表示文本框当前内容是非法 JSON（回写失败，文本保留待修正）。 */
const dataJsonText = ref('')
const dataJsonError = ref<string | null>(null)

function syncDataJsonFromScript() {
  if (!script.value) { dataJsonText.value = ''; return }
  dataJsonText.value = JSON.stringify(script.value.data, null, 2)
  dataJsonError.value = null
}

watch(() => script.value?.id, () => syncDataJsonFromScript(), { immediate: true })

/** blur 回写：尝试解析为对象，成功就替换 script.data，失败保留文本并报错。
 *  用 Object.keys 清空再逐键赋值而非整体换引用：script.data 是被外部 watch 的同一对象，
 *  整体换引用会丢失响应式追踪，清空再赋值保持引用稳定。 */
function onDataJsonBlur(e: Event) {
  if (!script.value) return
  const text = (e.target as HTMLTextAreaElement).value
  let parsed: Record<string, any> | null = null
  try {
    parsed = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not a plain object')
    }
  } catch (err: any) {
    dataJsonText.value = text
    dataJsonError.value = props.t('tavern.settings.dataJsonInvalid', { msg: err?.message || err })
    return
  }
  for (const k of Object.keys(script.value.data)) delete script.value.data[k]
  for (const [k, v] of Object.entries(parsed!)) script.value.data[k] = v
  syncDataJsonFromScript()
}

/** 同步标签名。用 renameTab() 而非 open()：open() 会触发侧边栏 scrollIntoView，每字输入会卡顿。 */
watch(() => script.value?.name, (name) => {
  if (script.value && name !== undefined) tabsStore.renameTab('tavern', script.value.id, name || props.t('common.unnamed'))
})
</script>

