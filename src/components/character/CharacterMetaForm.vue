<template>
  <div v-if="store.character" class="wb-form">
    <div class="wb-char-avatar-row">
      <img v-if="avatarSrc" class="wb-char-avatar" :src="avatarSrc" :alt="store.character.name" />
      <div v-else class="wb-char-avatar wb-char-avatar-ph">?</div>
      <div class="wb-char-avatar-tools">
        <button class="wb-btn sm" @click="fileInput?.click()">
          {{ uiStore.t('character.metaForm.avatarUpload') }}
        </button>
        <button v-if="store.pendingAvatarFile" class="wb-btn sm" @click="clearPendingAvatar">
          {{ uiStore.t('character.metaForm.avatarReset') }}
        </button>
        <p v-if="store.pendingAvatarFile" class="wb-char-avatar-hint">
          {{ uiStore.t('character.metaForm.avatarPending') }}
        </p>
        <input
          ref="fileInput"
          class="wb-char-avatar-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          @change="onAvatarSelected"
        />
      </div>
    </div>

    <label class="wb-form-check"
      ><input type="checkbox" v-model="fav" /> <Icon name="star" />
      {{ uiStore.t('character.metaForm.favLabel') }}</label
    >

    <FormField :label="uiStore.t('character.metaForm.worldbookLabel')">
      <select class="wb-select-wide" v-model="worldbookModel">
        <option :value="null">
          {{ uiStore.t('character.metaForm.worldbookNone') }}
        </option>
        <option v-for="n in worldbookStore.worldbookList" :key="n" :value="n">
          {{ n }}
        </option>
      </select>
    </FormField>

    <FormField :label="uiStore.t('character.metaForm.talkativenessLabel')">
      <input
        class="wb-form-input wb-form-num"
        type="number"
        step="0.1"
        min="0"
        max="1"
        v-model.number="talkativeness"
      />
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
        <input
          class="wb-form-input"
          v-model="tagsText"
          :placeholder="uiStore.t('character.metaForm.tagsPlaceholder')"
        />
      </FormField>
    </AdvancedGroup>
  </div>
  <p v-else class="wb-list-empty">
    {{ uiStore.t('character.sidebar.empty') }}
  </p>
</template>

<script setup lang="ts">
/** 角色卡 Meta 表单：角色卡自身属性（fav/creator/creatorNotes/version/tags/talkativeness）+ 世界书换绑下拉。
 *  仅服务角色卡 domain，不参数化；世界书列表只读跨 domain 取 worldbookStore.worldbookList（App.vue 打开面板时已 refreshWorldbookList）。
 *  worldbook 字段最终写入 v2CharData.extensions.world 由 characterApi.ts 保存时处理。 */
import { computed, ref } from 'vue';
import type { Character } from '../../types';
import { useCharacterStore } from '../../stores/characterStore';
import { useWorldbookStore } from '../../stores/worldbookStore';
import { useUiStore } from '../../stores/uiStore';
import { getCharacterAvatarUrl } from '../../api/characterApi';
import AdvancedGroup from '../shared/AdvancedGroup.vue';
import FormField from '../shared/FormField.vue';

const store = useCharacterStore();
const worldbookStore = useWorldbookStore();
const uiStore = useUiStore();
const fileInput = ref<HTMLInputElement | null>(null);
/** 选好新头像后先用 URL.createObjectURL 预览，保存时由 doSaveCharacter 一并 POST。 */
const pendingPreview = ref<string>('');

/** 显示的头像：用户刚选了新头像优先预览，否则用 ST 端原头像缩略图。 */
const avatarSrc = computed(() => {
  if (pendingPreview.value) return pendingPreview.value;
  const av = store.character?.avatar;
  return av ? getCharacterAvatarUrl(av) : '';
});

function onAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    uiStore.showToast(uiStore.t('character.toast.avatarNotImage'));
    return;
  }
  // 上一张 pendingPreview 是上一次选头像时建的 object URL，换新前 revoke 掉避免内存泄漏。
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value);
  pendingPreview.value = URL.createObjectURL(file);
  store.setPendingAvatar(file);
}

function clearPendingAvatar() {
  store.setPendingAvatar(null);
  if (pendingPreview.value) {
    URL.revokeObjectURL(pendingPreview.value);
    pendingPreview.value = '';
  }
}

function field<K extends 'talkativeness' | 'fav'>(key: K) {
  return computed({
    get: () => store.character![key],
    set: (v: string | number | boolean) => {
      store.character![key] = v as Character[K];
      store.markDirty();
    },
  });
}

const fav = field('fav');
const talkativeness = field('talkativeness');

/** creatorMeta 里的纯字符串字段（creator/creatorNotes/version），统一走这一个 helper。 */
function creatorMetaField<K extends 'creator' | 'creatorNotes' | 'version'>(key: K) {
  return computed({
    get: () => store.character?.creatorMeta[key] ?? '',
    set: (v: string) => {
      if (store.character) {
        store.character.creatorMeta[key] = v;
        store.markDirty();
      }
    },
  });
}

const creator = creatorMetaField('creator');
const version = creatorMetaField('version');
const creatorNotes = creatorMetaField('creatorNotes');

/** tags（string[]）用逗号分隔单行输入（适合短标签直觉），不同于 trimStrings 的按行分割。 */
const tagsText = computed({
  get: () => (store.character?.creatorMeta.tags || []).join(', '),
  set: (v: string) => {
    if (!store.character) return;
    store.character.creatorMeta.tags = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    store.markDirty();
  },
});

const worldbookModel = computed<string | null>({
  get: () => store.character?.worldbook ?? null,
  set: (v) => {
    if (store.character) {
      store.character.worldbook = v;
      store.markDirty();
    }
  },
});
</script>
