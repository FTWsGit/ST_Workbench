/* ====== 宿主环境访问（无 domain 知识）======
 * 只负责获取 SillyTavern 的 ctx 等跟具体业务无关的机制。domain 读写逻辑放
 * presetApi.ts / characterApi.ts / worldbookApi.ts，它们都从这里拿 getCtx()。
 *
 * 标准 ST 扩展下脚本就跑在 ST 页面自身的模块作用域里，window 就是顶层 window，
 * 动态 import('/script.js') 直接可用，不再需要 iframe 时代的注入/轮询助手。 */

/** window 上由 ST 挂载的宿主全局。SillyTavern 不在标准 Window 类型里，这里补出来。 */
interface STWindow extends Window {
  SillyTavern?: { getContext?: () => unknown };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ST 宿主 ctx 是无类型外部对象，所有 domain 都按动态对象访问
let cachedCtx: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同上，返回给各 domain API 做动态方法调用（ST 无类型声明）
export function getCtx(): any {
  if (cachedCtx) return cachedCtx;
  try {
    cachedCtx = (window as STWindow).SillyTavern?.getContext?.() || {};
  } catch {
    cachedCtx = {};
  }
  return cachedCtx;
}

/** 清除缓存的 ctx。跟具体是哪个 domain 无关——任何 domain 的 API 层在怀疑 ctx 拿到的是
 *  陈旧引用时都可以调用这个，不需要各自维护一份缓存失效逻辑。 */
export function invalidateCache() {
  cachedCtx = null;
}
