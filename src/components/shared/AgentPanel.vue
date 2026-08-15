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
      <button
        class="wb-btn icon-btn"
        :class="{ active: settingsOpen }"
        :title="uiStore.t('agent.settings.title')"
        :aria-label="uiStore.t('agent.settings.title')"
        @click="settingsOpen = !settingsOpen"
      >
        <Icon name="gear" />
      </button>
      <AgentSettings v-if="settingsOpen" />

      <!-- 版本不匹配错误横幅 -->
      <div v-if="agentStore.versionMismatch" class="wb-agent-version-error">
        <div class="wb-agent-version-title">
          {{ uiStore.t('agent.error.version.title') }}
        </div>
        <div class="wb-agent-version-body">
          {{ uiStore.t('agent.error.version.body') }}
        </div>
        <div class="wb-agent-version-meta">
          <div>
            {{
              uiStore.t('agent.error.version.stored', {
                stored: String(agentStore.versionMismatch.storedVersion),
              })
            }}
          </div>
          <div>
            {{
              uiStore.t('agent.error.version.expected', {
                expected: agentStore.versionMismatch.expectedVersion,
              })
            }}
          </div>
        </div>
        <button class="wb-btn accent" @click="onResetVersion">
          {{ uiStore.t('agent.error.version.reset') }}
        </button>
      </div>

      <!-- 会话头：session 切换器 + 新建 + 删除当前会话 -->
      <div
        v-if="agentStore.sessions.length > 0 && !agentStore.versionMismatch"
        class="wb-agent-session-bar"
      >
        <select
          class="wb-agent-session-select"
          :title="uiStore.t('agent.session.switch')"
          :aria-label="uiStore.t('agent.session.switch')"
          :value="agentStore.activeSessionId ?? undefined"
          @change="onSwitchSession"
        >
          <option v-for="s in sortedSessions" :key="s.id" :value="s.id">
            {{ truncateTitle(s.title) }}
          </option>
        </select>
        <button class="wb-btn sm" :title="uiStore.t('agent.session.new')" @click="onNewSession">
          <Icon name="plus" />
        </button>
        <button
          class="wb-btn icon-btn compact"
          :title="uiStore.t('agent.session.delete')"
          :aria-label="uiStore.t('agent.session.delete')"
          @click="onDeleteSession"
        >
          <Icon name="trash" />
        </button>
      </div>

      <!-- 消息列表 -->
      <div ref="messagesContainer" class="wb-agent-messages">
        <template
          v-if="agentStore.activeSessionMessages.length === 0 && !agentStore.versionMismatch"
        >
          <div class="wb-agent-empty">
            <div class="wb-agent-empty-title">
              {{ uiStore.t('agent.empty.title') }}
            </div>
            <div class="wb-agent-empty-hint">
              {{ uiStore.t('agent.empty.hint') }}
            </div>
          </div>
        </template>
        <template v-else>
          <div
            v-for="(msg, i) in agentStore.activeSessionMessages"
            :key="i"
            class="wb-agent-msg"
            :class="['role-' + msg.role, { error: msg.isError, synthetic: msg.synthetic }]"
          >
            <div class="wb-agent-msg-role">
              <Icon :name="roleIcon(msg.role)" :size="14" />
            </div>
            <div class="wb-agent-msg-text">{{ msg.text }}</div>
            <div v-if="msg.toolCalls && msg.toolCalls.length" class="wb-agent-msg-tools">
              <div v-for="(tc, j) in msg.toolCalls" :key="j" class="wb-agent-msg-tool">
                <Icon name="wrench" :size="12" /> {{ tc.name }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 状态条 -->
      <div class="wb-agent-status">
        <span class="wb-agent-status-dot" :class="agentStore.turnState"></span>
        <span class="wb-agent-status-text">{{ stateLabel }}</span>
        <span class="wb-agent-status-tokens">{{ usedContextTokens }}/{{ maxContextDisplay }}</span>
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
          :class="{ danger: agentStore.isBusy }"
          :disabled="!agentStore.isBusy && !inputText.trim()"
          @click="onSendOrStop"
        >
          {{ agentStore.isBusy ? uiStore.t('agent.input.stop') : uiStore.t('agent.input.send') }}
        </button>
      </div>
    </div>
  </FloatingPanelShell>

  <!-- 嵌入/悬浮态：docked 在文档流里挤开编辑区；overlay absolute 盖在右侧不挤开。 -->
  <div
    v-else
    class="wb-right-panel wb-agent-panel"
    :class="{ float: mode === 'overlay' }"
    :style="{ width: uiStore.settings.agentWidth + 'px' }"
  >
    <div
      class="wb-right-resize-handle"
      :class="{ active: resize.active.value }"
      @pointerdown="resize.onPointerDown"
    ></div>
    <div class="wb-rp-header">
      <span>{{ uiStore.t('agent.panel.title') }}</span>
      <div class="wb-row-tight">
        <button
          class="wb-btn icon-btn"
          :class="{ active: settingsOpen }"
          :title="uiStore.t('agent.settings.title')"
          :aria-label="uiStore.t('agent.settings.title')"
          @click="settingsOpen = !settingsOpen"
        >
          <Icon name="gear" />
        </button>
        <PanelModeSwitch :model-value="mode" @update:model-value="setMode" />
        <button
          class="wb-btn close-btn compact"
          :aria-label="uiStore.t('common.close')"
          @click="close"
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
    <div class="wb-agent-body">
      <AgentSettings v-if="settingsOpen" />

      <!-- 版本不匹配错误横幅 -->
      <div v-if="agentStore.versionMismatch" class="wb-agent-version-error">
        <div class="wb-agent-version-title">
          {{ uiStore.t('agent.error.version.title') }}
        </div>
        <div class="wb-agent-version-body">
          {{ uiStore.t('agent.error.version.body') }}
        </div>
        <div class="wb-agent-version-meta">
          <div>
            {{
              uiStore.t('agent.error.version.stored', {
                stored: String(agentStore.versionMismatch.storedVersion),
              })
            }}
          </div>
          <div>
            {{
              uiStore.t('agent.error.version.expected', {
                expected: agentStore.versionMismatch.expectedVersion,
              })
            }}
          </div>
        </div>
        <button class="wb-btn accent" @click="onResetVersion">
          {{ uiStore.t('agent.error.version.reset') }}
        </button>
      </div>

      <!-- 会话头：session 切换器 + 新建 + 删除当前会话 -->
      <div
        v-if="agentStore.sessions.length > 0 && !agentStore.versionMismatch"
        class="wb-agent-session-bar"
      >
        <select
          class="wb-agent-session-select"
          :title="uiStore.t('agent.session.switch')"
          :aria-label="uiStore.t('agent.session.switch')"
          :value="agentStore.activeSessionId ?? undefined"
          @change="onSwitchSession"
        >
          <option v-for="s in sortedSessions" :key="s.id" :value="s.id">
            {{ truncateTitle(s.title) }}
          </option>
        </select>
        <button class="wb-btn sm" :title="uiStore.t('agent.session.new')" @click="onNewSession">
          <Icon name="plus" />
        </button>
        <button
          class="wb-btn icon-btn compact"
          :title="uiStore.t('agent.session.delete')"
          :aria-label="uiStore.t('agent.session.delete')"
          @click="onDeleteSession"
        >
          <Icon name="trash" />
        </button>
      </div>

      <!-- 消息列表 -->
      <div ref="messagesContainer" class="wb-agent-messages">
        <template
          v-if="agentStore.activeSessionMessages.length === 0 && !agentStore.versionMismatch"
        >
          <div class="wb-agent-empty">
            <div class="wb-agent-empty-title">
              {{ uiStore.t('agent.empty.title') }}
            </div>
            <div class="wb-agent-empty-hint">
              {{ uiStore.t('agent.empty.hint') }}
            </div>
          </div>
        </template>
        <template v-else>
          <div
            v-for="(msg, i) in agentStore.activeSessionMessages"
            :key="i"
            class="wb-agent-msg"
            :class="['role-' + msg.role, { error: msg.isError, synthetic: msg.synthetic }]"
          >
            <div class="wb-agent-msg-role">
              <Icon :name="roleIcon(msg.role)" :size="14" />
            </div>
            <!-- 思考过程（可折叠） -->
            <div
              v-if="msg.reasoning && msg.reasoning.trim()"
              class="wb-agent-msg-collapse"
              :class="{ open: openCollapse[i + 'reasoning'] }"
            >
              <button class="wb-agent-msg-collapse-toggle" @click="toggleCollapse(i + 'reasoning')">
                <Icon name="chevronRight" :size="12" />
                {{ uiStore.t('agent.msg.thinking') }}
              </button>
              <div class="wb-agent-msg-thinking-body">{{ msg.reasoning }}</div>
            </div>
            <!-- tool_result：正文可折叠 -->
            <template v-if="msg.role === 'tool'">
              <div class="wb-agent-msg-collapse" :class="{ open: openCollapse[i + 'tool'] }">
                <button class="wb-agent-msg-collapse-toggle" @click="toggleCollapse(i + 'tool')">
                  <Icon name="chevronRight" :size="12" />
                  {{ uiStore.t('agent.msg.toolResult') }}
                </button>
                <div class="wb-agent-msg-text">{{ msg.text }}</div>
              </div>
            </template>
            <template v-else>
              <div class="wb-agent-msg-text">{{ msg.text }}</div>
            </template>
            <div v-if="msg.toolCalls && msg.toolCalls.length" class="wb-agent-msg-tools">
              <div
                v-for="(tc, j) in msg.toolCalls"
                :key="j"
                class="wb-agent-msg-tool"
                :class="{ open: openCollapse[i + 'call' + j] }"
              >
                <button
                  class="wb-agent-msg-collapse-toggle"
                  @click="toggleCollapse(i + 'call' + j)"
                >
                  <Icon name="chevronRight" :size="12" />
                  {{ tc.name }}
                </button>
                <div class="wb-agent-msg-tool-args">{{ tc.arguments }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 状态条 -->
      <div class="wb-agent-status">
        <span class="wb-agent-status-dot" :class="agentStore.turnState"></span>
        <span class="wb-agent-status-text">{{ stateLabel }}</span>
        <span class="wb-agent-status-tokens">{{ usedContextTokens }}/{{ maxContextDisplay }}</span>
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
          :class="{ danger: agentStore.isBusy }"
          :disabled="!agentStore.isBusy && !inputText.trim()"
          @click="onSendOrStop"
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
 * 设置区可配置 system prompt、temperature、maxTokens（写入 agentStore.config 并持久化）。
 * 不进 tabsStore 的 domain 路由——agent 不编辑"一份文档"，开关状态放 uiStore.agentPanelOpen。
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useUiStore } from '../../stores/uiStore';
import { useConfirmStore } from '../../stores/confirmStore';
import { useAgentStore } from '../../agent/agentStore';
import { countTokensAsync } from '../../agent/contextManager';
import { usePanelResize } from '../../composables/usePanelResize';
import { esc } from '../../utils';
import FloatingPanelShell from './FloatingPanelShell.vue';
import PanelModeSwitch from './PanelModeSwitch.vue';
import AgentSettings from './AgentSettings.vue';
import Icon, { type IconName } from './Icon.vue';
import type { PanelMode } from '../../types';
import type { LocaleKey } from '../../i18n';

const uiStore = useUiStore();
const confirmStore = useConfirmStore();
const agentStore = useAgentStore();

/** 当前形态（docked 挤开 / overlay 右侧悬浮 / float 完全悬浮），持久化到 settings.agentMode。 */
const mode = computed<PanelMode>(() => uiStore.settings.agentMode);
function setMode(m: PanelMode) {
  uiStore.settings.agentMode = m;
  uiStore.saveSettings();
}

/** 设置区展开/收起（局部 UI 状态，不持久化）。 */
const settingsOpen = ref(false);

const inputText = ref('');
const inputEl = ref<HTMLTextAreaElement | null>(null);
const messagesContainer = ref<HTMLDivElement | null>(null);

/** 消息内折叠区块的展开状态（key = i+slot）。默认全部折叠。 */
const openCollapse = ref<Record<string, boolean>>({});
function toggleCollapse(key: string): void {
  openCollapse.value = { ...openCollapse.value, [key]: !openCollapse.value[key] };
}

/** session 列表，按 updatedAt 降序（最近使用的排前）。 */
const sortedSessions = computed(() =>
  [...agentStore.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
);

/** option 标题截断到 30 字符。 */
function truncateTitle(t: string): string {
  return t.length > 30 ? t.slice(0, 30) + '…' : t;
}

function onSwitchSession(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  if (!id) return;
  void agentStore.switchSession(id);
}

/** 删除当前活跃会话：confirmStore 确认（不用原生 confirm）。 */
function onDeleteSession() {
  const id = agentStore.activeSessionId;
  if (!id) return;
  const s = agentStore.sessions.find((x) => x.id === id);
  const title = s?.title || uiStore.t('agent.session.untitled');
  confirmStore.ask({
    title: uiStore.t('agent.session.delete'),
    message: uiStore.t('agent.session.deleteConfirm', { title: esc(title) }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => {
      void agentStore.deleteSession(id);
    },
  });
}

const stateLabel = computed(() => {
  const map: Record<string, LocaleKey> = {
    idle: 'agent.state.idle',
    thinking: 'agent.state.thinking',
    tool_loop: 'agent.state.tool_loop',
    error: 'agent.state.error',
    complete: 'agent.state.complete',
  };
  const key = map[agentStore.turnState] || 'agent.state.idle';
  return uiStore.t(key);
});

/** 当前会话已用的上下文 token 数（异步精确计数）。 */
const usedContextTokens = ref(0);

async function refreshTokenCount() {
  const messages = agentStore.activeSessionMessages;
  if (messages.length === 0) {
    usedContextTokens.value = 0;
    return;
  }
  try {
    usedContextTokens.value = await countTokensAsync(messages);
  } catch {
    usedContextTokens.value = 0;
  }
}

// 消息变化时重算
watch(
  () => agentStore.activeSessionMessages,
  () => {
    void refreshTokenCount();
  },
  { deep: true }
);
// 切换会话时也重算
watch(
  () => agentStore.activeSessionId,
  () => {
    void refreshTokenCount();
  }
);
// 挂载时算一次
onMounted(() => {
  void refreshTokenCount();
});

/** 最大上下文 token 显示：配置为 0 表示用默认阈值，显示 '?'。 */
const maxContextDisplay = computed(() => {
  const max = agentStore.config.maxContextTokens;
  return max > 0 ? String(max) : '?';
});

function roleIcon(role: string): IconName {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'bot';
  if (role === 'tool') return 'gear';
  if (role === 'system') return 'clipboard';
  return 'info';
}

/** 嵌入/悬浮态右边缘拖拽改宽，拖完持久化（settings.agentWidth）。 */
const resize = usePanelResize({
  getWidth: () => uiStore.settings.agentWidth,
  setWidth: (w) => {
    uiStore.settings.agentWidth = w;
  },
  min: 320,
  max: 900,
  dir: 'left',
});
watch(
  () => resize.active.value,
  (v) => {
    if (!v) uiStore.saveSettings();
  }
);

function onInput(e: Event) {
  inputText.value = (e.target as HTMLTextAreaElement).value;
}

function onKeydown(e: KeyboardEvent) {
  // 回车提交，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
}

async function onSend() {
  const text = inputText.value.trim();
  if (!text || agentStore.isBusy) return;
  inputText.value = '';
  await agentStore.submitUserMessage(text);
  scrollToBottom();
}

/** 发送/停止分流：busy 时走 cancelTurn，否则走 onSend。 */
function onSendOrStop() {
  if (agentStore.isBusy) {
    agentStore.cancelTurn();
    return;
  }
  void onSend();
}

async function onNewSession() {
  await agentStore.newSession();
  inputText.value = '';
}

async function onResetVersion() {
  await agentStore.resetData();
  uiStore.showToast(uiStore.t('agent.toast.versionReset'));
}

function scrollToBottom() {
  nextTick(() => {
    const el = messagesContainer.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function close() {
  uiStore.agentPanelOpen = false;
}

// 消息列表变化时滚到底
watch(
  () => agentStore.activeSessionMessages.length,
  () => {
    scrollToBottom();
  }
);
</script>
