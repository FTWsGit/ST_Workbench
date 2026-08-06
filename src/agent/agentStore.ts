import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadAgentStore, saveAgentStore, resetAgentStore, AgentVersionMismatchError } from '../api/agentApi'
import { selectPresetByName as applyPresetByName } from '../api/presetApi'
import { DEFAULT_AGENT_PERSISTED } from './defaultPersisted'
import { callModelRaw, renderMessages, type ModelTurnResult } from './callModel'
import {
  MAX_TOOL_ROUNDS,
  AGENT_NS,
} from './constants'
import { listAgentTools, listAgentToolsForWorkspace, getAgentTool, type AgentToolContext, type AgentToolDef, type AgentWorkspace } from './toolRegistry'
import {
  shouldCompact,
  computeCompactRange,
  truncateForStorage,
  overflowFallback,
  estimateTokens,
  sacredFloorLength,
} from './contextManager'
// side-effect import：触发只读工具注册到 AGENT_TOOL_REGISTRY。
import './register'
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
import { usePresetStore } from '../stores/presetStore'
import { useWorldbookStore } from '../stores/worldbookStore'
import { useCharacterStore } from '../stores/characterStore'
import { useConfirmStore } from '../stores/confirmStore'

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

/** 延迟拿 store 实例的工具函数（避免在模块顶层直接 useXxxStore 触发 Pinia 未初始化报错）。 */
function usePresetStoreSafe() { return usePresetStore() }
function useWorldbookStoreSafe() { return useWorldbookStore() }
function useCharacterStoreSafe() { return useCharacterStore() }
function useConfirmStoreSafe() { return useConfirmStore() }

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
      config.value = { ...DEFAULT_AGENT_PERSISTED.config, ...data.config }
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
    // 入库截断（模块 6.1）：tool_result 写入前过字节上限
    const truncated = truncateForStorage(text)
    activeSessionMessages.value.push({
      role: 'tool',
      text: truncated,
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

    // P1：工具调用循环（3.2/3.3）
    await runAgentTurn()
  }

  /** P1 核心循环：工具调用循环（3.2/3.3）。 */
  async function runAgentTurn(): Promise<void> {
    runtime.value = { ...initialRuntime, turnState: 'thinking' }

    try {
      // 当前会话 workspace，用于工具越界校验
      const ws = tabsStore.activeWorkspace
      const workspace: AgentWorkspace = ws === 'preset' ? 'preset' : ws === 'worldbook' ? 'worldbook' : 'character'

      // 按当前 workspace 过滤可用工具
      const tools = listAgentToolsForWorkspace(workspace)

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        runtime.value = {
          ...runtime.value,
          turnState: 'thinking',
          currentTool: null,
          toolRounds: round,
        }

        // 配置了生成预设时，每轮调用前把 ST 主菜单预设切过去（不切换会沿用旧的选中预设生成）
        if (config.value.presetName) {
          applyPresetByName(config.value.presetName)
        }

        // P3：每轮调用前触发摘要压缩（模块 6.2）
        await maybeAutoCompact()

        let messages = renderMessages(activeSessionMessages.value)
        let result: ModelTurnResult
        try {
          result = await callModelRaw(messages, tools, {
            temperature: config.value.temperature,
            maxTokens: config.value.maxTokens,
          })
        } catch (e) {
          // 溢出兜底（模块 6.2）：模型/API 直接拒绝请求（上下文超窗）
          const msg = e instanceof Error ? e.message : String(e)
          if (/context|too long|exceed|window|token/i.test(msg)) {
            activeSessionMessages.value = overflowFallback(activeSessionMessages.value)
            throw e
          }
          throw e
        }
        messages = [] as any // 释放引用
        void messages

        // 没有工具调用 → 追加 assistant 消息，回合完成
        if (!result.toolCalls || result.toolCalls.length === 0) {
          pushAssistantMessage(result.content)
          await finalizeTurn('complete')
          return
        }

        // 有工具调用 → 追加 assistant 消息（含 tool_calls），进入 tool_loop
        pushAssistantMessage(result.content, result.toolCalls)
        runtime.value = { ...runtime.value, turnState: 'tool_loop' }

        // 串行执行工具（3.2：只读工具可并行，写类串行；P1 全是只读，简化为串行）
        for (const call of result.toolCalls) {
          runtime.value = { ...runtime.value, currentTool: call.name }
          const outcome = await executeTool(call, workspace)
          pushToolResultMessage(call.id, outcome.text, outcome.isError)
        }

        // 持久化（每轮工具调用后存一次）
        await persist()
      }

      // 熔断：MAX_TOOL_ROUNDS 轮还没结束
      pushToolResultMessage('max_rounds', `[max rounds exceeded: ${MAX_TOOL_ROUNDS}]`, true)
      await finalizeTurn('error')
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      pushToolResultMessage('error', `[ERROR] ${errMsg}`, true)
      runtime.value = { ...initialRuntime, turnState: 'error', error: errMsg }
      await persist()
    }
  }

  /** 执行单个工具调用（含 availableIn 越界校验 + 审批门 P2 接）。 */
  async function executeTool(call: ToolCall, workspace: AgentWorkspace): Promise<{ text: string; isError?: boolean }> {
    const def = getAgentTool(call.name)
    if (!def) {
      return { text: `unknown tool: ${call.name}`, isError: true }
    }
    // 越界校验（7.3）
    if (!def.availableIn.includes(workspace)) {
      return { text: `tool "${call.name}" not available in workspace "${workspace}"`, isError: true }
    }

    // 解析参数（弱模型容错：arguments 可能不是合法 JSON）
    let args: any = {}
    try {
      args = call.arguments ? JSON.parse(call.arguments) : {}
    } catch {
      return { text: `invalid JSON arguments: ${call.arguments}`, isError: true }
    }

    // 构造工具执行上下文
    const ctx: AgentToolContext = {
      presetStore: usePresetStoreSafe(),
      worldbookStore: useWorldbookStoreSafe(),
      characterStore: useCharacterStoreSafe(),
      confirmStore: useConfirmStoreSafe(),
      uiStore,
      workspace,
    }

    try {
      return await def.execute(args, ctx)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      return { text: `tool execution error: ${errMsg}`, isError: true }
    }
  }

  /** finalizeTurn：回合结束，持久化，短暂展示后回 idle。 */
  async function finalizeTurn(state: 'complete' | 'error'): Promise<void> {
    runtime.value = { ...initialRuntime, turnState: state }
    await persist()
    setTimeout(() => {
      if (runtime.value.turnState === state) {
        runtime.value = { ...initialRuntime }
      }
    }, 500)
  }

  /**
   * P3 摘要压缩（模块 6.2）。
   *
   * 触发条件：shouldCompact(messages) 返回 true。
   * 执行：把 [sacredFloor, drainTo) 区间整体替换成一条 LLM 生成的摘要（合成 user 消息，带 framing）。
   * 摘要调用走 callModelRaw 纯文本路径，不接 tools，带硬超时（60s），超时回退到占位文本。
   */
  async function maybeAutoCompact(): Promise<void> {
    const messages = activeSessionMessages.value
    if (!shouldCompact(messages)) return

    const { sacredFloor, drainTo } = computeCompactRange(messages)
    if (drainTo <= sacredFloor) return

    // 抽取要摘要的消息
    const toSummarize = messages.slice(sacredFloor, drainTo)
    if (toSummarize.length === 0) return

    // 生成摘要（带硬超时回退）
    let summary: string
    try {
      summary = await withTimeout(
        generateSummary(toSummarize),
        60_000, // SUMMARY_TIMEOUT_MS
      )
    } catch {
      // 超时或失败：用占位文本
      summary = '[早期上下文已省略，如需要请重新查询]'
    }

    // 构造合成 user 消息（带 framing）
    const syntheticMsg: Message = {
      role: 'user',
      text: `以下是早期对话的摘要，供参考：\n\n${summary}`,
      synthetic: true,
      meta: { timestamp: Date.now() },
    }

    // 替换抽干区间：保留 [0, sacredFloor) + syntheticMsg + [drainTo, end)
    activeSessionMessages.value = [
      ...messages.slice(0, sacredFloor),
      syntheticMsg,
      ...messages.slice(drainTo),
    ]
    await persist()
  }

  /**
   * 生成摘要：调 callModelRaw 纯文本路径（不接 tools），输入是要摘要的消息序列。
   * 跟随会话语言（用户用中文交互就出中文摘要）。
   */
  async function generateSummary(toSummarize: Message[]): Promise<string> {
    // 构造摘要提示：system 指令 + 要摘要的消息
    const summaryPrompt = [
      {
        role: 'system',
        content: '你是一个对话摘要助手。请把下面的早期对话内容压缩成一份简洁的摘要，保留关键事实、用户意图和已执行的操作。用与原文相同的语言输出摘要，不要添加任何评论或解释。',
      },
      {
        role: 'user',
        content: toSummarize.map(m => `[${m.role}] ${m.text}`).join('\n\n---\n\n'),
      },
    ]

    const result = await callModelRaw(summaryPrompt, [], {
      temperature: 0.3, // 摘要用低温度保持事实性
      maxTokens: 1024,
    })
    return result.content || '[摘要生成失败]'
  }

  /** 带超时的 Promise 包装。 */
  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
      promise
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(err => {
          clearTimeout(timer)
          reject(err)
        })
    })
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
