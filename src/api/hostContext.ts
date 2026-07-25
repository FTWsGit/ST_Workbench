/* ====== 宿主环境访问（无 domain 知识）======
 * 这个文件只负责"怎么拿到 SillyTavern 的 ctx / 顶层 window"这类跟具体业务数据无关的机制，
 * 不应该出现任何 preset/character/worldbook 的概念。domain 相关的读写逻辑放 presetApi.ts /
 * characterApi.ts / worldbookApi.ts，它们都从这里拿 getCtx()/getTopWindow() 用。
 *
 * 从 sillytavern.ts 拆分出来（2026-07），行为原样保留，见 PROJECT.md「新增一个 domain 的套路」
 * 和 TODO.md 阶段0「拆分 sillytavern.ts」。 */

let cachedCtx: any = null

export function getTopWindow(): Window {
  try { return window.top! } catch { return window }
}

export function getCtx(): any {
  if (cachedCtx) return cachedCtx
  const top = getTopWindow()
  try { cachedCtx = (top as any).SillyTavern?.getContext?.() || {} }
  catch { cachedCtx = {} }
  return cachedCtx
}

/** 清除缓存的 ctx。跟具体是哪个 domain 无关——任何 domain 的 API 层在怀疑 ctx 拿到的是
 *  陈旧引用时都可以调用这个，不需要各自维护一份缓存失效逻辑。 */
export function invalidateCache() {
  cachedCtx = null
}

/* ====== 顶层文档动态 import 助手 ======
 * 见《SillyTavern预设块渲染实现文档》第3节。核心限制：`import()` 必须在顶层文档的模块作用域里
 * 执行，否则拿到的不是 ST 页面自己用的那个单例。我们的脚本本身跑在 about:srcdoc 的 iframe 里
 * （见 hostEnv.ts 顶部注释），iframe 自己 dynamic import 一个以 '/' 开头的相对路径会按 iframe
 * 自己的 base URL（about:srcdoc，没有正常 origin）解析，行大概率会失败或指向错误的模块实例。
 * 解决方式：往顶层文档注入一个 <script type="module">，让 import() 在顶层文档的模块作用域里
 * 执行、正确解析相对路径，并把结果挂到顶层 window 上，我们再跨窗口拿这个函数引用来用。
 *
 * 这个机制本身不属于任何 domain——目前只有 presetApi.ts 的精确预览在用，但它跟"读/存预设"
 * 没有任何耦合，纯粹是"怎么在顶层文档跑一次动态 import"，放这里而不是 presetApi.ts。 */
let topImporterPromise: Promise<(spec: string) => Promise<any>> | null = null
export function ensureTopImporter(): Promise<(spec: string) => Promise<any>> {
  if (topImporterPromise) return topImporterPromise
  topImporterPromise = (async () => {
    const top = getTopWindow() as any
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
      await new Promise(r => setTimeout(r, 10))
    }
    throw new Error('无法在宿主页面注入动态 import 助手（module script 未在预期时间内执行）')
  })()
  return topImporterPromise
}
