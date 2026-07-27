<template>
  <div v-if="store.character" class="rx-form">
    <label class="rx-check"><input type="checkbox" v-model="fav" /> {{ uiStore.t('character.metaForm.favLabel') }}</label>

    <!-- 只做下拉换绑，不支持内嵌编辑世界书内容——那是"角色卡内嵌编辑世界书"，TODO.md 阶段4明确
         不做，见 types.ts Character 接口里 worldbook 字段的 doc comment。 -->
    <label class="rx-label">{{ uiStore.t('character.metaForm.worldbookLabel') }}</label>
    <select class="wb-select-wide" v-model="worldbookModel">
      <option :value="null">{{ uiStore.t('character.metaForm.worldbookNone') }}</option>
      <option v-for="n in worldbookStore.worldbookList" :key="n" :value="n">{{ n }}</option>
    </select>

    <label class="rx-label">{{ uiStore.t('character.metaForm.talkativenessLabel') }}</label>
    <input class="rx-input rx-num" type="number" step="0.1" min="0" max="1" v-model.number="talkativeness" />

    <button class="wb-btn wb-advanced-toggle" @click="advancedOpen = !advancedOpen">{{ advancedOpen ? '▾' : '▸' }} {{ uiStore.t('character.metaForm.creatorToggle') }}</button>
    <div v-if="advancedOpen" class="rx-advanced">
      <label class="rx-label">{{ uiStore.t('character.metaForm.creatorLabel') }}</label>
      <input class="rx-input" v-model="creator" />

      <label class="rx-label">{{ uiStore.t('character.metaForm.versionLabel') }}</label>
      <input class="rx-input" v-model="version" />

      <label class="rx-label">{{ uiStore.t('character.metaForm.creatorNotesLabel') }}</label>
      <textarea class="rx-textarea" rows="4" v-model="creatorNotes"></textarea>

      <label class="rx-label">{{ uiStore.t('character.metaForm.tagsLabel') }}</label>
      <input class="rx-input" v-model="tagsText" :placeholder="uiStore.t('character.metaForm.tagsPlaceholder')" />
    </div>


  </div>
  <p v-else class="pr-cp-empty">{{ uiStore.t('character.sidebar.empty') }}</p>
</template>

<script setup lang="ts">
/* 角色卡 Meta 表单（TODO.md 2.5b）——creator/creatorNotes/version/tags/talkativeness/fav 这些
 * "关于这张角色卡本身"的字段，加上世界书换绑下拉（world 绑定改的是 Character.worldbook 这个
 * 字段本身，实际写入 v2CharData.extensions.world 由 characterApi.ts 在保存时处理，这里不用
 * 关心导出格式）。不参数化：只服务角色卡 domain 一家，直接 useCharacterStore()。
 *
 * 世界书下拉列表读 worldbookStore.worldbookList——这是本次改动里第一处角色卡组件跨 domain 读
 * 另一个 store 的地方，只读列表（拿名字），不读 worldbookStore 的其它任何状态，也不会因为
 * 角色卡面板打开就顺带把世界书数据拉起来（App.vue 的 openPanel() 已经在面板打开时统一拉过
 * worldbookStore.refreshWorldbookList() 了，这里不用重复拉）。 */
import { computed, ref } from 'vue'

const advancedOpen = ref(false)
import { useCharacterStore } from '../../stores/characterStore'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useUiStore } from '../../stores/uiStore'

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

// tags 是 string[]，UI 上用逗号分隔的单行输入更符合"标签"这种短词的直觉（跟 RegexSettingsForm.vue
// trimStrings 那种一行一条的长字符串场景不一样，没有照抄它的按换行分割）。
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
