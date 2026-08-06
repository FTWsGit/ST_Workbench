import { registerTool } from './registry'
import SearchTool from './tools/SearchTool.vue'
import BatchTool from './tools/BatchTool.vue'
import CopyPanel from '../preset/CopyPanel.vue'

/** 工具箱工具注册（启动期 side-effect）：把 Search/Batch/Copy 等工具注册到各自适用的 (workspace, collection)
 *  scene。模块被 import 一次即生效，不要 import 后不调用——本文件顶层就在填表。
 *  注册入口：searchFields.ts 末尾 import './register' 已保证一旦任何 scene 适配代码被加载就注册；
 *  若想在更早的启动链路触发，App.vue / ToolBoxPanel.vue 任一处 import 本文件亦可（幂等，重复 import 无副作用）。 */

// preset/items：Search + Batch + Copy（跨预设复制提示词块，只属于预设域）
registerTool('preset', 'items', { id: 'search', labelKey: 'toolbox.tool.search', component: SearchTool })
registerTool('preset', 'items', { id: 'batch', labelKey: 'toolbox.tool.batch', component: BatchTool })
registerTool('preset', 'items', { id: 'copy', labelKey: 'toolbox.tool.copy', component: CopyPanel })

// preset 工作区的正则集合：Search + Batch
registerTool('preset', 'regex', { id: 'search', labelKey: 'toolbox.tool.search', component: SearchTool })
registerTool('preset', 'regex', { id: 'batch', labelKey: 'toolbox.tool.batch', component: BatchTool })

// worldbook/items：Search + Batch
registerTool('worldbook', 'items', { id: 'search', labelKey: 'toolbox.tool.search', component: SearchTool })
registerTool('worldbook', 'items', { id: 'batch', labelKey: 'toolbox.tool.batch', component: BatchTool })

// character/fields：只有 Search（character 无批量工具）
registerTool('character', 'fields', { id: 'search', labelKey: 'toolbox.tool.search', component: SearchTool })

// character 工作区的正则集合：Search + Batch
registerTool('character', 'regex', { id: 'search', labelKey: 'toolbox.tool.search', component: SearchTool })
registerTool('character', 'regex', { id: 'batch', labelKey: 'toolbox.tool.batch', component: BatchTool })
