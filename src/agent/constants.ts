/* agent 子系统的可调常数集中表。改动这些数字等于调 agent 行为，禁止散落到各文件当魔法数字。 */

/** 单条 tool_result 入库截断阈值（字节）。8 KiB 匹配本产品 tool 输出体量。 */
export const TOOL_RESULT_TRUNCATE_BYTES = 8 * 1024

/** 列表类工具单次最多返回条目数。超过则要求模型加筛选条件重新调用。 */
export const LIST_TOOLS_MAX_ITEMS = 50

/** 摘要压缩触发阈值（预估 token 数）。按常见 chat completion 模型的实际可用窗口打个提前量。 */
export const COMPACT_THRESHOLD_TOKENS = 12_000

/** 摘要保真窗口：最近 N% token 的原文保留进摘要提示。 */
export const SUMMARY_FIDELITY_RATIO = 0.3

/** 摘要调用硬超时（毫秒）。比 agent-system-design.md 的 180s 短，本产品摘要输入本来就小。 */
export const SUMMARY_TIMEOUT_MS = 60_000

/** 单次用户提交内的工具调用轮数熔断。防止模型陷入调用循环。 */
export const MAX_TOOL_ROUNDS = 8

/** 单轮内并行只读工具的最大并发数。 */
export const READONLY_TOOL_CONCURRENCY = 3

/** 持久化保留的最大会话索引条数。超过则丢弃最旧的已归档会话。 */
export const MAX_RETAINED_SESSIONS = 20

/** 单会话 activeSessionMessages 总大小软上限（字节）。超过触发强制摘要压缩。 */
export const ACTIVE_SESSION_SOFT_LIMIT_BYTES = 256 * 1024

/** 持久化数据结构版本号。不匹配时显式报错给用户重置按钮，禁止静默按新结构误读旧数据。 */
export const AGENT_PERSISTED_VERSION = 1

/** extensionSettings 命名空间键，唯一不通用，仿官方扩展指南的 MODULE_NAME 规范。 */
export const AGENT_NS = 'ST_Workbench_Agent'

/** 神圣前缀保留的消息条数：system persona + 第一条真实 user 消息，压缩永不触碰。 */
export const SACRED_PREFIX_MESSAGES = 2

/** 单 token 预估字节数，用于 estimateTokens 的粗略估算（1 token ≈ 4 字节，英文/代码场景）。 */
export const TOKEN_BYTES_ESTIMATE = 4
