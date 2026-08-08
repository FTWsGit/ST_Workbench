/* ====== 宿主环境访问（无 domain 知识）======
 * 只负责获取 SillyTavern 的 ctx / 顶层 window 等跟具体业务无关的机制。domain 读写逻辑放
 * presetApi.ts / characterApi.ts / worldbookApi.ts，它们都从这里拿 getCtx()/getTopWindow()。 */

/** 顶层 window 上由 ST 或本工具注入的全局。SillyTavern/__stpmImport 都是宿主扩展，不在标准
 *  Window 类型里，这里补出来。 */
interface STWindow extends Window {
  SillyTavern?: { getContext?: () => unknown }
  __stpmImport?: (spec: string) => Promise<unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ST 宿主 ctx 是无类型外部对象，所有 domain 都按动态对象访问
let cachedCtx: any = null

export function getTopWindow(): STWindow {
  try {
    return window.top as STWindow
  } catch {
    return window as STWindow
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同上，返回给各 domain API 做动态方法调用（ST 无类型声明）
export function getCtx(): any {
  if (cachedCtx) return cachedCtx
  const top = getTopWindow()
  try {
    cachedCtx = top.SillyTavern?.getContext?.() || {}
  } catch {
    cachedCtx = {}
  }
  return cachedCtx
}

/** 清除缓存的 ctx。跟具体是哪个 domain 无关——任何 domain 的 API 层在怀疑 ctx 拿到的是
 *  陈旧引用时都可以调用这个，不需要各自维护一份缓存失效逻辑。 */
export function invalidateCache() {
  cachedCtx = null
}

/* ====== 顶层文档动态 import 助手 ======
 * 核心限制：`import()` 必须在顶层文档的模块作用域里执行，否则拿到的不是 ST 页面自己的单例。
 * 脚本跑在 about:srcdoc 的 iframe 里，iframe 自己的 dynamic import 会按假 origin 解析失败。
 * 解决方式：注入 <script type="module"> 到顶层文档，把 import() 结果挂到顶层 window 上跨窗口引用。
 *
 * 这个机制不属于任何 domain——只解决"怎么在顶层文档跑一次 dynamic import"，因此放这里而非
 * presetApi.ts。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- import() 结果是无类型模块对象，各 domain API 按需动态访问
let topImporterPromise: Promise<(spec: string) => Promise<any>> | null = null
export function ensureTopImporter() {
  if (topImporterPromise) return topImporterPromise
  topImporterPromise = (async () => {
    const top = getTopWindow()
    if (typeof top.__stpmImport === 'function') return top.__stpmImport
    const doc = top.document as Document
    if (!doc.getElementById('st-wb-importer')) {
      const script = doc.createElement('script')
      script.id = 'st-wb-importer'
      script.type = 'module'
      script.textContent = 'window.__stpmImport = (s) => import(s);'
      doc.head!.appendChild(script)
    }
    // module script 是异步执行的（下一个 microtask/task，而不是同步 appendChild 就绪），轮询等它跑完
    for (let i = 0; i < 100; i++) {
      if (typeof top.__stpmImport === 'function') return top.__stpmImport
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error('无法在宿主页面注入动态 import 助手（module script 未在预期时间内执行）')
  })()
  return topImporterPromise
}
