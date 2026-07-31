<template>
  <div v-if="store.character" class="wb-form">
    <label class="wb-form-check"><input type="checkbox" v-model="fav" /> {{ uiStore.t('character.metaForm.favLabel') }}</label>

    <FormField :label="uiStore.t('character.metaForm.worldbookLabel')">
      <select class="wb-select-wide" v-model="worldbookModel">
        <option :value="null">{{ uiStore.t('character.metaForm.worldbookNone') }}</option>
        <option v-for="n in worldbookStore.worldbookList" :key="n" :value="n">{{ n }}</option>
      </select>
    </FormField>

    <FormField :label="uiStore.t('character.metaForm.talkativenessLabel')">
      <input class="wb-form-input wb-form-num" type="number" step="0.1" min="0" max="1" v-model.number="talkativeness" />
    </FormField>

    <AdvancedGroup :title="uiStore.t('character.metaForm.creatorToggle')">
      <FormField :label="uiStore.t('character.metaForm.creatorLabel')">
        <input class="wb-form-input" v-model="creator" />
      </FormField>

      <FormField :label="uiStore.t('character.metaForm.versionLabel')">
        <input class="wb-form-input" v-model="version" />
      </FormField>

      <FormField :label="uiStore.t('character.metaForm.creatorNotesLabel')">
        <textarea class="wb-form-textarea" rows="4" v-model="creatorNotes"></textarea>
      </FormField>

      <FormField :label="uiStore.t('character.metaForm.tagsLabel')">
        <input class="wb-form-input" v-model="tagsText" :placeholder="uiStore.t('character.metaForm.tagsPlaceholder')" />
      </FormField>
    </AdvancedGroup>
  </div>
  <p v-else class="wb-preset-cp-empty">{{ uiStore.t('character.sidebar.empty') }}</p>
</template>

<script setup lang="ts">
/** 角色卡 Meta 表单：角色卡自身属性（fav/creator/creatorNotes/version/tags/talkativeness）+ 世界书换绑下拉。
 *  仅服务角色卡 domain，不参数化；世界书列表只读跨 domain 取 worldbookStore.worldbookList（App.vue 打开面板时已 refreshWorldbookList）。
 *  worldbook 字段最终写入 v2CharData.extensions.world 由 characterApi.ts 保存时处理。 */
import { computed } from 'vue'
import { useCharacterStore } from '../../stores/characterStore'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useUiStore } from '../../stores/uiStore'
import AdvancedGroup from '../shared/AdvancedGroup.vue'
import FormField from '../shared/FormField.vue'

const store = useCharacterStore()
const worldbookStore = useWorldbookStore()
const uiStore = useUiStore()

function field<K extends 'creator' | 'creatorNotes' | 'version' | 'talkativeness' | 'fav'>(key: K) {
  return computed({
    get: () => store.character![key],
    set: (v: any) => { store.character![key] = v; store.markDirty() },
  })
}

const fav = field('fav')
const creator = field('creator')
const version = field('version')
const creatorNotes = field('creatorNotes')
const talkativeness = field('talkativeness')

/** tags（string[]）用逗号分隔单行输入（适合短标签直觉），不同于 trimStrings 的按行分割。 */
const tagsText = computed({
  get: () => (store.character?.tags || []).join(', '),
  set: (v: string) => {
    if (!store.character) return
    store.character.tags = v.split(',').map(s => s.trim()).filter(Boolean)
    store.markDirty()
  },
})

const worldbookModel = computed<string | null>({
  get: () => store.character?.worldbook ?? null,
  set: (v) => { if (store.character) { store.character.worldbook = v; store.markDirty() } },
})
</script>
