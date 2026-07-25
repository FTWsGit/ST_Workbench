/* ====== 跨 domain 共享的纪律性工具 ======
 * 故意只放"深拷贝再传给 ST"这类跟 domain 无关的规矩，不放 BaseApi<T> 这类看起来该统一、
 * 实际会逼三边绕开抽象层打补丁的东西——preset 是 PresetManager 单例+缓存失效，character 是
 * multipart 表单+字段级 oldRaw 回退合并，worldbook 是最平的纯 JSON CRUD，三者形状本来就不
 * 一样。见 TODO.md 阶段0「拆分 sillytavern.ts」的注意事项。 */

/** 任何要传给 ST 自己 API（PresetManager.savePreset / fetch body 等）的对象，传之前必须
 *  深拷贝成纯数据——不能把 Pinia/Vue 的响应式对象直接传过去。
 *
 *  原因：`structuredClone()` 克隆不了 Vue 的 Proxy 会直接抛错；更隐蔽的是如果 ST 在克隆失败前
 *  就把引用赋值进了自己的活跃状态，我们的 Vue Proxy 会残留在 ST 内部直到手动刷新页面。
 *  见 PROJECT.md「PresetManager 与预设读写」第 3 条。 */
export function deepClonePlain<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T
}
