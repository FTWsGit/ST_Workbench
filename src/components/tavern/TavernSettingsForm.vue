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

    <FormField :label="props.t('tavern.settings.buttonsLabel')">
      <p class="wb-muted">按钮数:{{ script.button.buttons.length }}</p>
    </FormField>

    <FormField inline>
      <span class="wb-form-label">{{ props.t('tavern.settings.exportDataLabel') }}</span>
      <span class="wb-toggle-sw" :class="{ on: exportData }" @click="exportData = !exportData"></span>
    </FormField>

    <FormField inline>
      <span class="wb-form-label">{{ props.t('tavern.settings.exportButtonLabel') }}</span>
      <span class="wb-toggle-sw" :class="{ on: exportButton }" @click="exportButton = !exportButton"></span>
    </FormField>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
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

/** 同步标签名。用 renameTab() 而非 open()：open() 会触发侧边栏 scrollIntoView，每字输入会卡顿。 */
watch(() => script.value?.name, (name) => {
  if (script.value && name !== undefined) tabsStore.renameTab('tavern', script.value.id, name || props.t('common.unnamed'))
})
</script>
