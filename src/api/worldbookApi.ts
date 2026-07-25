/* ====== 世界书 API（占位）======
 * 阶段0只做 sillytavern.ts 的拆分骨架，世界书是最平的纯 JSON CRUD，不需要 preset 那种
 * PresetManager 单例/缓存失效的花活，也不需要 character 那种 multipart 表单+字段级回退合并。
 * 具体实现见 TODO.md 阶段1「世界书 domain」，会加：
 *   - listWorldbooks(): string[]                       GET  /api/worldinfo
 *   - getWorldbookByName(name): Worldbook | null        GET  /api/worldinfo/get/:name
 *   - saveWorldbook(data: Worldbook): Promise<void>     POST /api/worldinfo/edit（create 同一个入口，ST 按 name 判断）
 *   - deleteWorldbook(name): Promise<void>              POST /api/worldinfo/delete
 * 以及 STWorldbook.entries（Record<uid, entry>）⇄ 工作层 WorldbookEntry[] 的双向转换。
 * fetch 走 getCtx() 里 ST 暴露的请求封装（带鉴权 header），不要自己裸 fetch。 */

export {}
