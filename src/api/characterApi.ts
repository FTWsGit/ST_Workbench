/* ====== 角色卡 API（占位）======
 * 阶段0只做 sillytavern.ts 的拆分骨架。角色卡是 multipart 表单 + 字段级 oldRaw 回退合并，
 * 跟 preset/worldbook 的读写形状都不一样，不套统一的 BaseApi<T>。具体实现见 TODO.md 阶段2
 * 「角色卡 domain」，会加：
 *   - listCharacters(): CharacterListEntry[]            GET  /api/characters/all
 *   - getCharacterByAvatar(avatar): Character | null    GET  /api/characters/:avatar_name
 *   - createCharacter(data, avatarFile?): Promise<...>  POST /api/characters/create（multipart）
 *   - editCharacter(data, avatarFile?): Promise<void>   POST /api/characters/edit（multipart，avatar_url 必填）
 *   - deleteCharacter(avatar): Promise<void>             POST /api/characters/delete
 * 关键点（见 TODO.md「关键设计要点」）：
 *   - toPayload() 里未修改的字段必须从 oldRaw 回退，不能让 ST 后端用空值覆盖
 *   - FormData 的 Content-Type 必须省略，交给浏览器自动带 boundary
 *   - 头像是 Blob/File 时要包装成正确文件名的 File；是已有头像字符串时不传 avatar 字段
 *   - v1CharData/v2CharData ⇄ 工作层 Character 的双向转换 */

export {}
