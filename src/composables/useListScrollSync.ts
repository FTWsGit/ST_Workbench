import { watch, nextTick } from 'vue'
import { useTabsStore } from '../stores/tabsStore'

/**
 * 监听 tabsStore.listScrollToken[domain] 变化，将当前 activeTab 对应的项滚动到可视区域。
 * 仅当 domain 匹配当前活动标签的域时触发。`keyOf()` 将 activeTab.key 转换为 itemEls 的键类型。
 */
export function useListScrollSync<T>(opts: {
  domain: string
  itemEls: Map<T, HTMLElement>
  keyOf: () => T | null | undefined
}) {
  const tabsStore = useTabsStore()
  watch(() => tabsStore.listScrollToken[opts.domain], () => {
    nextTick(() => {
      if (!tabsStore.activeTab || tabsStore.activeTab.domain !== opts.domain) return
      const key = opts.keyOf()
      if (key == null) return
      const el = opts.itemEls.get(key)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  })
}
