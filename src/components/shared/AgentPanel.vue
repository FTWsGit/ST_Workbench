<template>
  <FloatingPanelShell
    v-if="uiStore.agentPanelOpen"
    :title="uiStore.t('agent.panel.title')"
    :close-title="uiStore.t('common.close')"
    :width="560" :height="640" :min-width="360" :min-height="400"
    @close="uiStore.agentPanelOpen = false"
  >
    <div class="wb-agent-panel">
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
</template>

<script setup lang="ts">
/** Agent 助手悬浮窗：跨 preset/worldbook/character 三个 store 的运维层。
 *
 * 不进 tabsStore 的 domain 路由——agent 不编辑"一份文档"，UI 上按 MetaPanel/ToolBoxPanel
 * 的模式做一个独立浮窗，开关状态放 uiStore.agentPanelOpen。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import { useAgentStore } from '../../agent/agentStore'
import FloatingPanelShell from './FloatingPanelShell.vue'

const uiStore = useUiStore()
const agentStore = useAgentStore()

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

// 消息列表变化时滚到底
watch(() => agentStore.activeSessionMessages.length, () => {
  scrollToBottom()
})
</script>
