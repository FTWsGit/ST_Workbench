<template>
  <button
    class="wb-dbg-trigger"
    title="Agent Tool Debugger（开发调试用，非正式功能）"
    @click="visible = !visible"
  >
    🛠 tool debug
  </button>

  <FloatingPanelShell
    v-if="visible"
    title="Agent Tool Debugger"
    close-title="Close"
    :width="640"
    :height="580"
    :min-width="480"
    :min-height="360"
    @close="visible = false"
  >
    <div class="wb-dbg-body">
      <!-- 工具选择 -->
      <div class="wb-row wb-row-tight">
        <select v-model="selectedTool" class="wb-form-select wb-flex1">
          <option value="" disabled>选择一个 tool…</option>
          <option v-for="t in tools" :key="t.name" :value="t.name">{{ t.name }}</option>
        </select>
        <button
          class="wb-btn sm"
          title="重置 alias 表（清掉本次调试 session 的短别名映射）"
          @click="resetAliasTable"
        >
          reset alias
        </button>
        <button class="wb-btn sm" title="清空调用历史" @click="history = []">clear history</button>
      </div>

      <p v-if="currentDef" class="wb-dbg-desc">{{ currentDef.description }}</p>

      <details v-if="currentDef" class="wb-dbg-schema">
        <summary>parameters schema</summary>
        <pre style="font-size: 13px; font-family: consolas;">{{ prettySchema }}</pre>
      </details>

      <!-- 参数编辑 -->
      <div class="wb-row wb-row-tight">
        <span class="wb-form-label">args (JSON)</span>
        <div class="wb-spacer"></div>
        <button class="wb-btn sm" :disabled="!currentDef" @click="insertSkeleton">
          insert skeleton
        </button>
      </div>
      <textarea
        v-model="argsText"
        class="wb-form-textarea wb-dbg-args"
        spellcheck="false"
        placeholder="{}"
        style="font-size: 13px; font-family: consolas;"
      ></textarea>
      <p v-if="argsError" class="wb-dbg-error">{{ argsError }}</p>

      <div class="wb-row wb-row-mt">
        <button class="wb-btn accent" :disabled="!selectedTool || running" @click="run">
          {{ running ? 'running…' : 'Run' }}
        </button>
      </div>

      <!-- 结果 -->
      <div v-if="lastResult" class="wb-dbg-result" :class="{ error: lastResult.isError }">
        <div class="wb-dbg-result-head">
          {{ lastResult.isError ? '✗ error' : '✓ ok' }} · {{ lastResult.tool }} ·
          {{ lastResult.ms }}ms
        </div>
        <pre style="font-size: 13px; font-family: consolas;">{{ lastResult.text }}</pre>
        <details v-if="lastResult.structured !== undefined">
          <summary>structured</summary>
          <pre style="font-size: 13px; font-family: consolas;">{{ formatJson(lastResult.structured) }}</pre>
        </details>
        <details v-if="lastResult.changes !== undefined">
          <summary>changes</summary>
          <pre style="font-size: 13px; font-family: consolas;">{{ formatJson(lastResult.changes) }}</pre>
        </details>
      </div>

      <!-- 历史 -->
      <div v-if="history.length" class="wb-dbg-history">
        <div class="wb-form-label">history（点击回填）</div>
        <div
          v-for="(h, i) in history"
          :key="i"
          class="wb-dbg-history-item"
          :class="{ error: h.isError }"
          @click="reload(h)"
        >
          <span>{{ h.isError ? '✗' : '✓' }} {{ h.tool }}</span>
          <span class="wb-dbg-history-ts">{{ h.ms }}ms</span>
        </div>
      </div>
    </div>
  </FloatingPanelShell>
</template>

<script setup lang="ts">
/**
 * Agent Tool Debugger —— 开发调试用面板，独立于正式功能。
 *
 * 与正式 UI（AgentPanel/ToolBoxPanel）的耦合面刻意压到最小：
 *  - 不进 uiStore/tabsStore，不进 settings 持久化（types.ts 不用改）；
 *  - 不用 i18n（uiStore.t），文案硬编码；
 *  - 只读 AGENT_TOOL_REGISTRY（`toolRegistry.ts`）+ 直接调用三个 domain store，
 *    跟 agentStore.ts 的 executeTool() 走的是同一条路径，但完全绕开 LLM 调用/会话状态机。
 *
 * 用途：单独调用任意一个已注册 agent 工具（VFS 七件套等），手填 JSON 参数，看 AgentToolResult 原始返回，
 * 用来验证工具行为 / 复现 bug，不需要真的跑一轮 agent 对话。
 */
import { ref, computed, watch } from 'vue';
import FloatingPanelShell from '../../components/shared/FloatingPanelShell.vue';
import {
  listAgentTools,
  getAgentTool,
  type AgentToolContext,
  type AgentToolDef,
} from '../toolRegistry';
import { AliasTable } from '../vfs/aliasTable';
import { usePresetStore } from '../../stores/presetStore';
import { useWorldbookStore } from '../../stores/worldbookStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useUiStore } from '../../stores/uiStore';
// side-effect：确保 VFS verb 工具已注册。幂等，重复 import 无副作用。
import '../register';

interface HistoryEntry {
  tool: string;
  argsText: string;
  isError: boolean;
  text: string;
  structured?: unknown;
  changes?: unknown;
  ms: number;
}

const visible = ref(false);
const selectedTool = ref('');
const argsText = ref('{}');
const argsError = ref('');
const running = ref(false);
const lastResult = ref<HistoryEntry | null>(null);
const history = ref<HistoryEntry[]>([]);

// 本面板生命周期内独立持有，不复用 agentStore 真实会话的那份——调试互不干扰；
// 提供手动 reset，方便反复测试 create/delete 这类会改变 alias 登记的工具。
let aliasTable = new AliasTable();

const tools = computed<AgentToolDef[]>(() => listAgentTools());
const currentDef = computed(() =>
  selectedTool.value ? getAgentTool(selectedTool.value) : undefined
);
const prettySchema = computed(() =>
  currentDef.value ? formatJson(currentDef.value.parameters) : ''
);

watch(selectedTool, () => {
  argsError.value = '';
  insertSkeleton();
});

function formatJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** 按 schema 的 properties 生成一份占位骨架，required 字段优先填。 */
function insertSkeleton(): void {
  const def = currentDef.value;
  if (!def) return;
  const props = (def.parameters.properties ?? {}) as Record<string, { type?: string }>;
  const skeleton: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(props)) {
    switch (spec?.type) {
      case 'number':
      case 'integer':
        skeleton[key] = 0;
        break;
      case 'boolean':
        skeleton[key] = false;
        break;
      case 'object':
        skeleton[key] = {};
        break;
      case 'array':
        skeleton[key] = [];
        break;
      default:
        skeleton[key] = '';
    }
  }
  argsText.value = formatJson(skeleton);
}

function resetAliasTable(): void {
  aliasTable = new AliasTable();
}

function buildCtx(): AgentToolContext {
  return {
    presetStore: usePresetStore(),
    worldbookStore: useWorldbookStore(),
    characterStore: useCharacterStore(),
    uiStore: useUiStore(),
    aliasTable,
  };
}

async function run(): Promise<void> {
  const def = currentDef.value;
  if (!def) return;

  let args: Record<string, unknown>;
  try {
    args = argsText.value.trim() ? JSON.parse(argsText.value) : {};
    argsError.value = '';
  } catch (e) {
    argsError.value = `invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }

  running.value = true;
  const startedAt = performance.now();
  try {
    const result = await def.execute(args, buildCtx());
    const entry: HistoryEntry = {
      tool: def.name,
      argsText: argsText.value,
      isError: !!result.isError,
      text: result.text,
      structured: result.structured,
      changes: result.changes,
      ms: Math.round(performance.now() - startedAt),
    };
    lastResult.value = entry;
    history.value.unshift(entry);
    if (history.value.length > 20) history.value.pop();
  } catch (e) {
    const entry: HistoryEntry = {
      tool: def.name,
      argsText: argsText.value,
      isError: true,
      text: `execution threw: ${e instanceof Error ? e.message : String(e)}`,
      ms: Math.round(performance.now() - startedAt),
    };
    lastResult.value = entry;
    history.value.unshift(entry);
    if (history.value.length > 20) history.value.pop();
  } finally {
    running.value = false;
  }
}

function reload(h: HistoryEntry): void {
  selectedTool.value = h.tool;
  argsText.value = h.argsText;
  lastResult.value = h;
}
</script>

<style scoped>
/* 刻意不进 styles/common.css：这是非正式调试面板，不进 UI 样式字典契约。 */
.wb-dbg-trigger {
  position: fixed;
  left: 8px;
  bottom: 8px;
  z-index: 100005;
  opacity: 0.55;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--wb-border, #444);
  background: var(--wb-bg-2, #222);
  color: var(--wb-fg, #ccc);
  cursor: pointer;
}
.wb-dbg-trigger:hover {
  opacity: 1;
}

.wb-dbg-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow-y: auto;
  font-size: 12px;
}

.wb-dbg-desc {
  font-size: 15px;
  margin: 0;
  opacity: 0.75;
  white-space: pre-wrap;
}

.wb-dbg-schema pre,
.wb-dbg-result pre {
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  background: rgba(127, 127, 127, 0.08);
  padding: 6px 8px;
  border-radius: 4px;
}

.wb-dbg-args {
  min-height: 90px;
  font-family: monospace;
}

.wb-dbg-error {
  margin: 0;
  color: #d66;
}

.wb-dbg-result {
  border: 1px solid rgba(127, 127, 127, 0.25);
  border-radius: 6px;
  padding: 6px 8px;
}
.wb-dbg-result.error {
  border-color: #a44;
}
.wb-dbg-result-head {
  font-weight: 600;
  margin-bottom: 4px;
}

.wb-dbg-history {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wb-dbg-history-item {
  display: flex;
  justify-content: space-between;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.8;
}
.wb-dbg-history-item:hover {
  background: rgba(127, 127, 127, 0.12);
  opacity: 1;
}
.wb-dbg-history-item.error {
  color: #d66;
}
.wb-dbg-history-ts {
  opacity: 0.6;
}
</style>
