import { AGENT_PERSISTED_VERSION } from './constants'
import { DEFAULT_AGENT_CONFIG } from './types'
import type { AgentPersisted } from './types'

/** 默认 agent 持久化结构。首次访问 extensionSettings[NS] 时初始化。 */
export const DEFAULT_AGENT_PERSISTED: AgentPersisted = {
  version: AGENT_PERSISTED_VERSION,
  config: { ...DEFAULT_AGENT_CONFIG },
  sessions: [],
  activeSessionId: null,
  activeSessionMessages: [],
}
