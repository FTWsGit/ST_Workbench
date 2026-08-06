<template>
  <!-- 完全悬浮态：FloatingPanelShell 接管（桌面可拖拽/缩放，移动端自动变 bottom sheet）。 -->
  <FloatingPanelShell
    v-if="mode === 'float'"
    :title="uiStore.t('agent.panel.title')"
    :close-title="uiStore.t('common.close')"
    :width="uiStore.settings.agentWidth"
    :min-width="320"
    @close="close"
  >
    <template #title>
      <span class="wb-agent-float-title">
        <span class="wb-agent-float-name">{{ uiStore.t('agent.panel.title') }}</span>
        <PanelModeSwitch :model-value="mode" @update:model-value="setMode" />
      </span>
    </template>
    <div class="wb-agent-body">
      <button class="wb-btn sm wb-agent-settings-toggle" :class="{ active: settingsOpen }" @click="settingsOpen = !settingsOpen">⚙ {{ uiStore.t('agent.settings.title') }}</button>
      <div v-if="settingsOpen" class="wb-agent-settings">
        <div class="wb-form-section">
          <div class="wb-form-field">
            <label class="wb-form-label">{{ uiStore.t('agent.settings.preset') }}</label>
            <select :value="agentStore.config.presetName" @change="onPresetChange">
              <option value="">{{ uiStore.t('agent.settings.presetFollow') }}</option>
              <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
          </div>
          <div class="wb-form-field">
            <label class="wb-form-label">{{ uiStore.t('agent.settings.systemPrompt') }}</label>
            <textarea class="wb-agent-settings-prompt" rows="6" :value="agentStore.config.systemPrompt" @change="onPromptChange" :placeholder="uiStore.t('agent.settings.systemPromptHint')"></textarea>
          </div>
          <div class="wb-form-field">
            <label class="wb-form-label">{{ uiStore.t('agent.settings.temperature') }}</label>
            <NumberInput :model-value="agentStore.config.temperature" :min="0" :max="2" :step="0.1" :nullable="false" @update:model-value="onTemperatureChange" />
          </div>
          <div class="wb-form-field">
            <label class="wb-form-label">{{ uiStore.t('agent.settings.maxTokens') }}</label>
            <NumberInput :model-value="agentStore.config.maxTokens" :min="256" :max="16384" :step="256" :nullable="false" @update:model-value="onMaxTokensChange" />
          </div>
        </div>
      </div>

      <!-- 版本不匹配错误横幅 -->
      <div v-if="agentStore.versionMismatch" class="wb-agent-version-error">
        <div class="wb-agent-version-title">{{ uiStore.t('agent.error.version.title') }}</div>
        <div class="wb-agent-version-body">{{ uiStore.t('agent.error.version.body') }}</div>
        <div class="wb-agent-version-meta">
          <div>{{ uiStore.t('agent.error.version.stored', { stored: String(agentStore.versionMismatch.storedVersion) }) }}</div>
          <div>{{ uiStore.t('agent.error.version.expected', { expected: agentStore.versionMismatch.expectedVersion }) }}</div>
        </div>
        <button class="wb-btn accent" @click="onResetVersion">{{ uiStore.t('agent.error.version.reset') }}</button>
      </div>

      <!-- 会话头：title + 新建按钮 -->
      <div v-if="agentStore.hasActiveSession && !agentStore.versionMismatch" class="wb-agent-session-bar">
        <span class="wb-agent-session-title">{{ activeSessionTitle }}</span>
        <button class="wb-btn sm" :title="uiStore.t('agent.session.new')" @click="onNewSession">＋</button>
      </div>

      <!-- 消息列表 -->
      <div ref="messagesContainer" class="wb-agent-messages">
        <template v-if="agentStore.activeSessionMessages.length === 0 && !agentStore.versionMismatch">
          <div class="wb-agent-empty">
            <div class="wb-agent-empty-title">{{ uiStore.t('agent.empty.title') }}</div>
            <div class="wb-agent-empty-hint">{{ uiStore.t('agent.empty.hint') }}</div>
          </div>
        </template>
        <template v-else>
          <div
            v-for="(msg, i) in agentStore.activeSessionMessages"
            :key="i"
            class="wb-agent-msg"
            :class="['role-' + msg.role, { error: msg.isError, synthetic: msg.synthetic }]"
          >
            <div class="wb-agent-msg-role">{{ roleLabel(msg.role) }}</div>
            <div class="wb-agent-msg-text">{{ msg.text }}</div>
            <div v-if="msg.toolCalls && msg.toolCalls.length" class="wb-agent-msg-tools">
              <div v-for="(tc, j) in msg.toolCalls" :key="j" class="wb-agent-msg-tool">
                🔧 {{ tc.name }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 状态条 -->
      <div class="wb-agent-status">
        <span class="wb-agent-status-dot" :class="agentStore.turnState"></span>
        <span class="wb-agent-status-text">{{ stateLabel }}</span>
      </div>

      <!-- 输入框 -->
      <div class="wb-agent-input-row">
        <textarea
          ref="inputEl"
          class="wb-agent-input"
          :value="inputText"
          :placeholder="uiStore.t('agent.input.placeholder')"
          :disabled="agentStore.isBusy"
          rows="2"
          @input="onInput"
          @keydown="onKeydown"
        />
        <button
          class="wb-btn accent"
          :disabled="agentStore.isBusy || !inputText.trim()"
          @click="onSend"
        >
          {{ agentStore.isBusy ? uiStore.t('agent.input.stop') : uiStore.t('agent.input.send') }}
        </button>
      </div>
    </div>
  </FloatingPanelShell>

  <!-- 嵌入/悬浮态：docked 在文档流里挤开编辑区；overlay absolute 盖在右侧不挤开。 -->
  <div v-else class="wb-right-panel wb-agent-panel" :class="{ float: mode === 'overlay' }" :style="{ width: uiStore.settings.agentWidth + 'px' }">
    <div class="wb-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="wb-rp-header">
      <span>{{ uiStore.t('agent.panel.title') }}</span>
      <div class="wb-row-tight">
        <button class="wb-btn icon-btn" :class="{ active: settingsOpen }" :title="uiStore.t('agent.settings.title')" :aria-label="uiStore.t('agent.settings.title')" @click="settingsOpen = !settingsOpen">⚙</button>
        <PanelModeSwitch :model-value="mode" @update:model-value="setMode" />
        <button class="wb-btn close-btn compact" :aria-label="uiStore.t('common.close')" @click="close">✕</button>
      </div>
    </div>
    <div class="wb-agent-body">
      <div v-if="settingsOpen" class="wb-agent-settings">
        <div class="wb-form-section">
          <div class="wb-form-field">
            <label class="wb-form-label">{{ uiStore.t('agent.settings.preset') }}</label>
            <select :value="agentStore.config.presetName" @change="onPresetChange">
              <option value="">{{ uiStore.t('agent.settings.presetFollow') }}</option>
              <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
          </div>
          <div class="wb-form-field">
            <label class="wb-form-label">{{ uiStore.t('agent.settings.systemPrompt') }}</label>
            <textarea class="wb-agent-settings-prompt" rows="6" :value="agentStore.config.systemPrompt" @change="onPromptChange" :placeholder="uiStore.t('agent.settings.systemPromptHint')"></textarea>
          </div>
          <div class="wb-form-field">
            <label class="wb-form-label">{{ uiStore.t('agent.settings.temperature') }}</label>
            <NumberInput :model-value="agentStore.config.temperature" :min="0" :max="2" :step="0.1" :nullable="false" @update:model-value="onTemperatureChange" />
          </div>
          <div class="wb-form-field">
            <label class="wb-form-label">{{ uiStore.t('agent.settings.maxTokens') }}</label>
            <NumberInput :model-value="agentStore.config.maxTokens" :min="256" :max="16384" :step="256" :nullable="false" @update:model-value="onMaxTokensChange" />
          </div>
        </div>
      </div>

      <!-- 版本不匹配错误横幅 -->
      <div v-if="agentStore.versionMismatch" class="wb-agent-version-error">
        <div class="wb-agent-version-title">{{ uiStore.t('agent.error.version.title') }}</div>
        <div class="wb-agent-version-body">{{ uiStore.t('agent.error.version.body') }}</div>
        <div class="wb-agent-version-meta">
          <div>{{ uiStore.t('agent.error.version.stored', { stored: String(agentStore.versionMismatch.storedVersion) }) }}</div>
          <div>{{ uiStore.t('agent.error.version.expected', { expected: agentStore.versionMismatch.expectedVersion }) }}</div>
        </div>
        <button class="wb-btn accent" @click="onResetVersion">{{ uiStore.t('agent.error.version.reset') }}</button>
      </div>

      <!-- 会话头：title + 新建按钮 -->
      <div v-if="agentStore.hasActiveSession && !agentStore.versionMismatch" class="wb-agent-session-bar">
        <span class="wb-agent-session-title">{{ activeSessionTitle }}</span>
        <button class="wb-btn sm" :title="uiStore.t('agent.session.new')" @click="onNewSession">＋</button>
      </div>

      <!-- 消息列表 -->
      <div ref="messagesContainer" class="wb-agent-messages">
        <template v-if="agentStore.activeSessionMessages.length === 0 && !agentStore.versionMismatch">
          <div class="wb-agent-empty">
            <div class="wb-agent-empty-title">{{ uiStore.t('agent.empty.title') }}</div>
            <div class="wb-agent-empty-hint">{{ uiStore.t('agent.empty.hint') }}</div>
          </div>
        </template>
        <template v-else>
          <div
            v-for="(msg, i) in agentStore.activeSessionMessages"
            :key="i"
            class="wb-agent-msg"
            :class="['role-' + msg.role, { error: msg.isError, synthetic: msg.synthetic }]"
          >
            <div class="wb-agent-msg-role">{{ roleLabel(msg.role) }}</div>
            <div class="wb-agent-msg-text">{{ msg.text }}</div>
            <div v-if="msg.toolCalls && msg.toolCalls.length" class="wb-agent-msg-tools">
              <div v-for="(tc, j) in msg.toolCalls" :key="j" class="wb-agent-msg-tool">
                🔧 {{ tc.name }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 状态条 -->
      <div class="wb-agent-status">
        <span class="wb-agent-status-dot" :class="agentStore.turnState"></span>
        <span class="wb-agent-status-text">{{ stateLabel }}</span>
      </div>

      <!-- 输入框 -->
      <div class="wb-agent-input-row">
        <textarea
          ref="inputEl"
          class="wb-agent-input"
          :value="inputText"
          :placeholder="uiStore.t('agent.input.placeholder')"
          :disabled="agentStore.isBusy"
          rows="2"
          @input="onInput"
          @keydown="onKeydown"
        />
        <button
          class="wb-btn accent"
          :disabled="agentStore.isBusy || !inputText.trim()"
          @click="onSend"
        >
          {{ agentStore.isBusy ? uiStore.t('agent.input.stop') : uiStore.t('agent.input.send') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Agent 助手右侧栏：跨 preset/worldbook/character 三个 store 的运维层。
 *
 * 三种形态与其他右侧面板一致（docked 挤开 / overlay 右侧悬浮 / float 完全悬浮），
 * 设置区可配置生成预设、system prompt、temperature、maxTokens（写入 agentStore.config 并持久化）。
 * 不进 tabsStore 的 domain 路由——agent 不编辑"一份文档"，开关状态放 uiStore.agentPanelOpen。
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import { useAgentStore } from '../../agent/agentStore'
import { usePanelResize } from '../../composables/usePanelResize'
import FloatingPanelShell from './FloatingPanelShell.vue'
import PanelModeSwitch from './PanelModeSwitch.vue'
import NumberInput from './NumberInput.vue'
import * as ST from '../../api/presetApi'
import type { PresetListEntry } from '../../api/presetApi'
import type { PanelMode } from '../../types'

const uiStore = useUiStore()
const agentStore = useAgentStore()

/** 当前形态（docked 挤开 / overlay 右侧悬浮 / float 完全悬浮），持久化到 settings.agentMode。 */
const mode = computed<PanelMode>(() => uiStore.settings.agentMode)
function setMode(m: PanelMode) {
  uiStore.settings.agentMode = m
  uiStore.saveSettings()
}

/** 设置区展开/收起（局部 UI 状态，不持久化）。 */
const settingsOpen = ref(false)

/** 可用生成预设列表（设置区下拉用）。 */
const presetOptions = ref<PresetListEntry[]>([])
onMounted(() => {
  try { presetOptions.value = ST.listPresets() }
  catch { /* 预设列表拿不到不影响聊天 */ }
})

const inputText = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const messagesContainer = ref<HTMLDivElement | null>(null)

const activeSessionTitle = computed(() => {
  const id = agentStore.activeSessionId
  if (!id) return ''
  const s = agentStore.sessions.find(x => x.id === id)
  return s?.title || uiStore.t('agent.session.untitled')
})

const stateLabel = computed(() => {
  const map: Record<string, string> = {
    idle: 'agent.state.idle',
    thinking: 'agent.state.thinking',
    tool_loop: 'agent.state.tool_loop',
    pending_approval: 'agent.state.pending_approval',
    error: 'agent.state.error',
    complete: 'agent.state.complete',
  }
  const key = map[agentStore.turnState] || 'agent.state.idle'
  return uiStore.t(key as any)
})

function roleLabel(role: string): string {
  if (role === 'user') return '🧑'
  if (role === 'assistant') return '🤖'
  if (role === 'tool') return '⚙'
  if (role === 'system') return '📋'
  return role
}

/** 嵌入/悬浮态右边缘拖拽改宽，拖完持久化（settings.agentWidth）。 */
const resize = usePanelResize({
  getWidth: () => uiStore.settings.agentWidth,
  setWidth: (w) => { uiStore.settings.agentWidth = w },
  min: 320, max: 900, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })

function onInput(e: Event) {
  inputText.value = (e.target as HTMLTextAreaElement).value
}

function onKeydown(e: KeyboardEvent) {
  // 回车提交，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onSend()
  }
}

async function onSend() {
  const text = inputText.value.trim()
  if (!text || agentStore.isBusy) return
  inputText.value = ''
  await agentStore.submitUserMessage(text)
  scrollToBottom()
}

async function onNewSession() {
  await agentStore.newSession()
  inputText.value = ''
}

async function onResetVersion() {
  await agentStore.resetData()
  uiStore.showToast(uiStore.t('agent.toast.versionReset'))
}

function scrollToBottom() {
  nextTick(() => {
    const el = messagesContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/** 设置区变更统一走 agentStore.updateConfig（含持久化）。 */
function onPresetChange(e: Event) {
  agentStore.updateConfig({ presetName: (e.target as HTMLSelectElement).value })
}
function onPromptChange(e: Event) {
  agentStore.updateConfig({ systemPrompt: (e.target as HTMLTextAreaElement).value })
}
function onTemperatureChange(v: number | null) {
  if (v != null) agentStore.updateConfig({ temperature: v })
}
function onMaxTokensChange(v: number | null) {
  if (v != null) agentStore.updateConfig({ maxTokens: v })
}

function close() {
  uiStore.agentPanelOpen = false
}

// 消息列表变化时滚到底
watch(() => agentStore.activeSessionMessages.length, () => {
  scrollToBottom()
})
</script>
