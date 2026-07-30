/* ====== 跨 domain 共享的纪律性工具 ======
 * 只放与 domain 无关的纪律性工具。preset/character/worldbook 三者读写形状不同，不放统一抽象。 */

/** 深拷贝成纯数据再传给 ST API（PresetManager.savePreset / fetch body 等），不能传 Pinia/Vue
 *  响应式对象——structuredClone 过不了 Vue Proxy，且 ST 可能在克隆前将引用赋值进自身状态
 *  导致 Proxy 残留。 */
export function deepClonePlain<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T
}
