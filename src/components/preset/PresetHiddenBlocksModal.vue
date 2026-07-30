<template>
  <!-- preset 专属："添加隐藏块"弹窗。从 shared/Modals.vue 挪出，避免通用 modals 文件混入 domain 专属逻辑。 -->
  <div v-if="presetStore.hiddenOpen" class="wb-modal-overlay" @click.self="presetStore.hiddenOpen = false">
    <div class="wb-modal">
      <h3>{{ uiStore.t('preset.sidebar.hiddenBlock') }}</h3>
      <div class="wb-modal-list">
        <div v-if="!presetStore.hiddenBlocks.length" class="wb-empty-note">{{ uiStore.t('preset.copyPanel.noBlocks') }}</div>
        <div v-for="p in presetStore.hiddenBlocks" :key="p.identifier" class="wb-modal-item"
             @click="presetStore.addHiddenBlock(p.identifier); presetStore.hiddenOpen = false">
          <span class="pr-block-role" :class="roleClass(p.role)">{{ p.role }}</span>
          <span class="wb-flex1">{{ p.name || p.identifier }}</span>
        </div>
      </div>
      <div class="wb-modal-footer">
        <button class="wb-btn" @click="presetStore.hiddenOpen = false">{{ uiStore.t('common.close') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { roleClass } from '../../utils'

const presetStore = usePresetStore()
const uiStore = useUiStore()
</script>
