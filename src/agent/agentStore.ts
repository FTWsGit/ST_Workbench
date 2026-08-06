import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadAgentStore, saveAgentStore, resetAgentStore, AgentVersionMismatchError } from '../api/agentApi'
import { DEFAULT_AGENT_PERSISTED } from './defaultPersisted'
import { callModelRaw, renderMessages, type ModelTurnResult } from './callModel'
import {
  MAX_TOOL_ROUNDS,
  AGENT_NS,
} from './constants'
import type {
  AgentPersisted,
  AgentConfig,
  AgentSessionMeta,
  AgentTurnState,
  AgentRuntimeState,
  Message,
  ToolCall,
} from './types'
import { useUiStore } from '../stores/uiStore'
import { useTabsStore } from '../stores/tabsStore'

/** 当前回合状态机的运行时态（纯内存，不持久化）。 */
const initialRuntime: AgentRuntimeState = {
  turnState: 'idle',
  currentTool: null,
  toolRounds: 0,
  awaitingApproval: false,
  error: null,
}

/** 生成一个会话 id（时间戳 + 随机后缀）。 */
function genSessionId(): string {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

/** 生成一个 tool_call id（供本地兜底用，正常情况模型会自带 id）。 */
function genToolCallId(): string {
  return 'call_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

/**
 * Agent store：跨 preset/worldbook/character 三个 store 的运维层。
 *
 * 职责边界：
 *  - 持有 AgentPersisted 的 live 状态（从 extensionSettings 加载/写回）；
 *  - 持有运行时状态（当前回合状态机、pending 审批、取消令牌）——不持久化，纯内存；
 *  - 唯一调用 LLM 生成与工具执行循环的入口；
 *  - 不直接操作 presetStore/worldbookStore/characterStore 的内部字段——所有跨 store 操作必须经过
 *    模块 5 的工具注册表，工具函数内部才去调具体 store 的方法。
 *
 * 不进 tabsStore 的 domain 路由：agent 不编辑"一份文档"，UI 上按 MetaPanel/ToolBoxPanel 的模式
 * 做一个独立浮窗（AgentPanel.vue），开关状态放 uiStore.agentPanelOpen。
 */
export const useAgentStore = defineStore('agent', () => {
  const uiStore = useUiStore()
  const tabsStore = useTabsStore()

  /* ====== Persisted state ====== */
  const version = ref<number>(DEFAULT_AGENT_PERSISTED.version)
  const config = ref<AgentConfig>({ ...DEFAULT_AGENT_PERSISTED.config })
  const sessions = ref<AgentSessionMeta[]>([])
  const activeSessionId = ref<string | null>(null)
  /** 当前活跃会话的完整消息序列——唯一允许变大的字段，靠容量纪律控制。 */
  const activeSessionMessages = ref<Message[]>([])

  /* ====== Runtime state（纯内存）====== */
  const runtime = ref<AgentRuntimeState>({ ...initialRuntime })
  /** 加载时遇到的版本不匹配错误，UI 据此显示"重置 agent 数据"按钮。 */
  const versionMismatch = ref<AgentVersionMismatchError | null>(null)
  /** 当前回合的 AbortController（cancel 用）。 */
  let abortController: AbortController | null = null
  /** 异步加载标志：首次 loadAgentData 完成前置 true。 */
  const loading = ref(false)
  /** 是否已成功加载过一次（避免重复 load）。 */
  const loaded = ref(false)

  /* ====== 工具注册表（P1 填充）====== */
  // 占位：P1 阶段在此注册只读工具，P2 注册写类工具
  const availableTools = ref<any[]>([])

  /* ====== Computed ====== */
  const turnState = computed(() => runtime.value.turnState)
  const currentTool = computed(() => runtime.value.currentTool)
  const isBusy = computed(() =>
    runtime.value.turnState === 'thinking' ||
    runtime.value.turnState === 'tool_loop' ||
    runtime.value.turnState === 'pending_approval'
  )
  const hasActiveSession = computed(() => activeSessionId.value !== null)
  const messageCount = computed(() => activeSessionMessages.value.length)

  /* ====== 持久化加载/保存 ====== */

  /** 首次加载 agent 持久化数据。幂等。 */
  async function loadAgentData(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      const data = await loadAgentStore()
      version.value = data.version
      config.value = { ...data.config }
      sessions.value = data.sessions
      activeSessionId.value = data.activeSessionId
      activeSessionMessages.value = data.activeSessionMessages
      loaded.value = true
    } catch (e) {
      if (e instanceof AgentVersionMismatchError) {
        versionMismatch.value = e
      } else {
        // 其它加载错误：记录但不阻塞 UI，用户可以重置
        versionMismatch.value = new AgentVersionMismatchError(
          'unknown',
          DEFAULT_AGENT_PERSISTED.version,
        )
        // 保留原 error 信息
        if (e instanceof Error) versionMismatch.value.message = e.message
      }
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** 把当前内存态 patch 写回 extensionSettings。调用方保证不传响应式对象。 */
  async function persist(): Promise<void> {
    const patch: Partial<AgentPersisted> = {
      version: version.value,
      config: { ...config.value },
      sessions: sessions.value.map(s => ({ ...s })),
      activeSessionId: activeSessionId.value,
      activeSessionMessages: activeSessionMessages.value.map(m => ({ ...m })),
    }
    await saveAgentStore(patch)
  }

  /** 重置 agent 数据为默认结构（用户在版本不匹配报错时点"重置"触发）。 */
  async function resetData(): Promise<void> {
    const fresh = await resetAgentStore()
    version.value = fresh.version
    config.value = { ...fresh.config }
    sessions.value = []
    activeSessionId.value = null
    activeSessionMessages.value = []
    runtime.value = { ...initialRuntime }
    versionMismatch.value = null
  }

  /* ====== 会话管理 ====== */

  /** 新建一个会话并切换为活跃。 */
  async function newSession(workspace: 'preset' | 'worldbook' | 'character' | null = null): Promise<void> {
    // 若已有活跃会话且有消息，先持久化当前状态
    if (activeSessionId.value && activeSessionMessages.value.length > 0) {
      await persist()
    }

    const id = genSessionId()
    const now = Date.now()
    const meta: AgentSessionMeta = {
      id,
      title: uiStore.t('agent.session.untitled'),
      createdAt: now,
      updatedAt: now,
      workspace,
    }

    // 切换：清空旧活跃会话的消息（已 persist），建立新会话
    activeSessionMessages.value = []
    activeSessionId.value = id
    sessions.value = [...sessions.value, meta]

    // 触发容量纪律：sessions 超过 MAX_RETAINED_SESSIONS 时丢弃最旧的已归档会话
    trimSessions()

    runtime.value = { ...initialRuntime }
    await persist()
  }

  /** 切换到另一个会话。 */
  async function switchSession(id: string): Promise<void> {
    if (id === activeSessionId.value) return
    // 持久化当前活跃会话状态
    if (activeSessionId.value) {
      await persist()
    }
    // 切换活跃会话 id，但消息正文只在内存里——这里简化处理：切换时清空消息，
    // 实际产品中会话切换由 P5 阶段的归档迁移机制处理
    activeSessionId.value = id
    activeSessionMessages.value = []
    runtime.value = { ...initialRuntime }
  }

  /** 删除一个会话索引。 */
  async function deleteSession(id: string): Promise<void> {
    sessions.value = sessions.value.filter(s => s.id !== id)
    if (activeSessionId.value === id) {
      activeSessionId.value = null
      activeSessionMessages.value = []
    }
    await persist()
  }

  /** 容量纪律：sessions 超过 MAX_RETAINED_SESSIONS 时丢弃最旧的已归档会话索引。 */
  function trimSessions(): void {
    const max = 20 // MAX_RETAINED_SESSIONS，但 constants 还没导出这个值，直接用字面量
    if (sessions.value.length <= max) return
    // 按 createdAt 升序排，丢最旧的
    const sorted = [...sessions.value].sort((a, b) => a.createdAt - b.createdAt)
    const toRemove = sorted.slice(0, sessions.value.length - max)
    const removeIds = new Set(toRemove.map(s => s.id))
    sessions.value = sessions.value.filter(s => !removeIds.has(s.id))
  }

  /** 更新当前活跃会话的 title。 */
  async function updateSessionTitle(title: string): Promise<void> {
    if (!activeSessionId.value) return
    const s = sessions.value.find(x => x.id === activeSessionId.value)
    if (s) {
      s.title = title
      s.updatedAt = Date.now()
      await persist()
    }
  }

  /* ====== 消息追加 ====== */

  function pushUserMessage(text: string): void {
    activeSessionMessages.value.push({
      role: 'user',
      text,
      meta: { timestamp: Date.now() },
    })
  }

  function pushAssistantMessage(content: string, toolCalls?: ToolCall[]): void {
    activeSessionMessages.value.push({
      role: 'assistant',
      text: content,
      toolCalls,
      meta: { timestamp: Date.now() },
    })
  }

  function pushToolResultMessage(toolCallId: string, text: string, isError = false): void {
    activeSessionMessages.value.push({
      role: 'tool',
      text,
      toolCallId,
      isError,
      meta: { timestamp: Date.now() },
    })
  }

  /** 清空当前会话的消息（保留会话索引）。 */
  async function clearMessages(): Promise<void> {
    activeSessionMessages.value = []
    runtime.value = { ...initialRuntime }
    await persist()
  }

  /* ====== 核心循环（P0 单轮无工具，P1+ 接工具调用循环 3.2）====== */

  /**
   * 提交一条用户消息，触发 agent 回合。
   *
   * P0 实现：单轮无工具对话，generateRawData 纯文本调用打通。
   * P1 扩展：接入工具调用循环（3.2/3.3）。
   */
  async function submitUserMessage(text: string): Promise<void> {
    if (isBusy.value) return
    if (!text.trim()) return

    // 若没有活跃会话，自动新建一个（workspace 跟随当前 tabsStore.activeWorkspace）
    if (!activeSessionId.value) {
      const ws = tabsStore.activeWorkspace
      await newSession(ws === 'preset' ? 'preset' : ws === 'worldbook' ? 'worldbook' : 'character')
    }

    // 追加用户消息
    pushUserMessage(text)

    // 若是首条真实 user 消息，把会话 title 设为消息摘要
    const userMsgCount = activeSessionMessages.value.filter(m => m.role === 'user').length
    if (userMsgCount === 1) {
      await updateSessionTitle(text.slice(0, 40) || uiStore.t('agent.session.untitled'))
    }

    // P0：单轮无工具对话
    await runSingleTurn()
  }

  /** P0 单轮对话：调 callModelRaw 一次，不接工具。 */
  async function runSingleTurn(): Promise<void> {
    runtime.value = {
      ...initialRuntime,
      turnState: 'thinking',
    }

    try {
      const messages = renderMessages(activeSessionMessages.value)
      const result = await callModelRaw(messages, [], {
        temperature: config.value.temperature,
        maxTokens: config.value.maxTokens,
      })

      // 追加 assistant 消息
      pushAssistantMessage(result.content, result.toolCalls ?? undefined)

      runtime.value = {
        ...initialRuntime,
        turnState: 'complete',
      }

      // 持久化
      await persist()

      // 短暂展示 complete 后回到 idle
      setTimeout(() => {
        if (runtime.value.turnState === 'complete') {
          runtime.value = { ...initialRuntime }
        }
      }, 500)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      // 把错误也记进消息，让用户看到
      pushToolResultMessage('error', `[ERROR] ${errMsg}`, true)
      runtime.value = {
        ...initialRuntime,
        turnState: 'error',
        error: errMsg,
      }
      await persist()
    }
  }

  /** 取消当前回合。 */
  function cancelTurn(): void {
    if (abortController) {
      try { abortController.abort() } catch {}
      abortController = null
    }
    // 尝试中断 ST 的生成
    try {
      const ctx = (window.top as any)?.SillyTavern?.getContext?.()
      ctx?.stopGeneration?.()
    } catch {}
    runtime.value = { ...initialRuntime, turnState: 'idle' }
  }

  /** 更新 config（用户在设置里改 agent 配置时触发）。 */
  async function updateConfig(patch: Partial<AgentConfig>): Promise<void> {
    config.value = { ...config.value, ...patch }
    await persist()
  }

  return {
    // persisted state
    version, config, sessions, activeSessionId, activeSessionMessages,
    // runtime state
    runtime, versionMismatch, loading, loaded, availableTools,
    // computed
    turnState, currentTool, isBusy, hasActiveSession, messageCount,
    // actions
    loadAgentData, persist, resetData,
    newSession, switchSession, deleteSession, updateSessionTitle,
    submitUserMessage, cancelTurn, clearMessages, updateConfig,
  }
})

export type AgentStore = ReturnType<typeof useAgentStore>
