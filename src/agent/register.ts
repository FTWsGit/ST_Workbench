/* side-effect import：触发只读 + 写类 + 测试/创作工具注册到 AGENT_TOOL_REGISTRY。
 * agentStore 不直接 import 工具模块，由这里统一拉起来，避免循环依赖。 */
import './tools/readonly'
import './tools/write'
import './tools/preview'
