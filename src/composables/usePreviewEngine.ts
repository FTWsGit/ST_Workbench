import { ref } from 'vue'
import type { OrderNode, PresetBlock, PreviewBlockGroup } from '../types'
import { isGroupNode } from './useGroupedList'
import { macroAwareDiff } from '../utils'
import * as ST from '../api/presetApi'

/**
 * 预览引擎 composable：把 presetStore 里 disjoint-state 的 Preview 段抽出来。
 *
 * 两种模式都走真实 SillyTavern 渲染（dry-run generate），非客户端宏模拟：
 *   'blocks': per-prompt-block 卡片，经 openai.js promptManager singleton (方案B)。
 *   'raw':    顶到底拼接的整条 prompt，经 GENERATE_AFTER_DATA 事件。
 *
 * @param getOrder - 获取当前 order 树的 getter（previewBlocks 模式按它展平遍历）
 * @param getPrompts - 获取 prompts 数组的 getter（取 block name / raw content / marker 标记）
 * @param options.showToast - 显示 toast 的函数
 * @param options.t - i18n 翻译函数
 */
export function usePreviewEngine(
  getOrder: () => OrderNode[],
  getPrompts: () => PresetBlock[],
  options: {
    showToast: (msg: string) => void
    t: (key: string, params?: any) => string
  }
) {
  const { showToast, t } = options

  const previewMode = ref<'blocks' | 'raw'>('blocks')
  const previewLoading = ref(false)
  const previewError = ref('')
  const previewCollapsed = ref<Record<string, boolean>>({})
  const previewBlockGroups = ref<PreviewBlockGroup[]>([])
  const previewRawText = ref('')

  /** 无 raw 内容可对比（marker blocks 等）——无需高亮。 */
  function diffAgainstRaw(raw: string, rendered: string) {
    if (!raw.trim()) return [{ text: rendered, added: false }]
    return macroAwareDiff(raw, rendered)
  }

  /**
   * Per-block 精确预览 (方案B)：每张卡片显示该 block 经 macros/regex/其它扩展全部跑完后的真实渲染文本，
   * 数据来自 openai.js promptManager singleton，非客户端宏模拟。替换/插入的文本（相对于该 block 自己的
   * raw content）通过 word diff 高亮。marker blocks（chatHistory、world info 等）和展开为多条子消息的
   * block 没有单一"raw content"可对比，按原文平铺显示。
   */
  async function generatePreviewBlocks() {
    previewError.value = ''
    previewLoading.value = true
    try {
      const results = await ST.getPromptManagerMessages()
      const groups: PreviewBlockGroup[] = []
      const allItems = getOrder().flatMap(node => isGroupNode(node) ? node.children : [node])
      const prompts = getPrompts()
      for (const o of allItems) {
        const msgs = results[o.identifier]
        if (!msgs || !msgs.length) continue
        const p = prompts.find(pp => pp.identifier === o.identifier)
        const isMarker = !!p?.marker
        const rawContent = p?.content || ''
        const diffable = !isMarker && msgs.length === 1
        groups.push({
          id: o.identifier,
          name: p?.name || o.identifier,
          isMarker,
          messages: msgs.map(m => ({
            role: m.role,
            tokens: m.tokens,
            identifier: m.identifier,
            segments: diffable ? diffAgainstRaw(rawContent, m.content) : [{ text: m.content, added: false }],
          })),
        })
      }
      previewBlockGroups.value = groups
      previewMode.value = 'blocks'
      showToast(t('preset.toast.renderedBlocks', { count: groups.length }))
    } catch (e: any) {
      previewError.value = e?.message || String(e)
      showToast(t('preset.toast.previewFailed', { msg: previewError.value }))
    } finally {
      previewLoading.value = false
    }
  }

  /**
   * 整条 prompt 的精确预览：ST 真正要发给 API 的 `messages` 数组，从 CHAT_COMPLETION_SETTINGS_READY
   * 事件在真实 generation 期间捕获。无 block 边界、无高亮——刻意呈现"API 实际看到的内容"。
   */
  async function generatePreviewRaw() {
    previewError.value = ''
    previewLoading.value = true
    try {
      const msgs = await ST.getFinalRequestMessages()
      previewRawText.value = msgs.map(m => `[${(m.role || '?').toUpperCase()}]\n${m.content}`).join('\n\n')
      previewMode.value = 'raw'
      showToast(t('preset.toast.renderedFullPrompt'))
    } catch (e: any) {
      previewError.value = e?.message || String(e)
      showToast(t('preset.toast.previewFailed', { msg: previewError.value }))
    } finally {
      previewLoading.value = false
    }
  }

  function togglePreviewBlock(id: string) {
    previewCollapsed.value[id] = !previewCollapsed.value[id]
  }

  function toggleAllPreviewBlocks() {
    if (!previewBlockGroups.value.length) return
    const shouldCollapse = previewBlockGroups.value.some(b => !previewCollapsed.value[b.id])
    previewBlockGroups.value.forEach(b => { previewCollapsed.value[b.id] = shouldCollapse })
  }

  return {
    previewMode, previewLoading, previewError, previewCollapsed,
    previewBlockGroups, previewRawText,
    generatePreviewBlocks, generatePreviewRaw,
    togglePreviewBlock, toggleAllPreviewBlocks,
  }
}
