import type { Character, CharacterListEntry } from '../types'
import { ensureTopImporter, getTopWindow } from './hostContext'
import { deepClonePlain } from './apiUtils'

/* ====== 角色卡 API ======
 * 跟 worldbookApi.ts 一样，角色数据本身不是 REST 资源——`characters` 数组、`unshallowCharacter`/
 * `getOneCharacter`/`deleteCharacter` 都是 ST 前端自己的 `/script.js` 这个 ESM 模块导出的东西，
 * 状态活在这个模块实例里，不是每次现发请求现拉。跟 worldbookApi.ts 的 getWorldInfoModule() 同一
 * 个套路：`ensureTopImporter()` 在顶层文档的模块作用域里 import，拿到跟 ST 页面本身同一个模块
 * 命名空间对象，`mod.characters` 是 ESM 的 live binding。
 *
 * 但角色的"写"这一半跟世界书完全不一样：世界书是 `saveWorldInfo(name, data)` 这种直接函数调用，
 * 角色卡的写入口 `/api/characters/create`/`/api/characters/edit` 是真正的 HTTP multipart 表单
 * POST（因为要能同时带头像文件），`/script.js` 这个模块本身不导出等价的纯函数封装。用
 * `getTopWindow().fetch(...)` 而不是裸 `fetch(...)`——这个脚本自己跑在 about:srcdoc 的 iframe 里
 * （见 hostEnv.ts 顶部注释），iframe 自己的 `fetch('/api/...')` 会按 iframe 假 origin 解析相对
 * 路径，必须在顶层 window 的 fetch 上发起才会打到 ST 服务端。 */

async function getScriptModule(): Promise<any> {
  const importer = await ensureTopImporter()
  const mod = await importer('/script.js')
  if (!mod || !Array.isArray(mod.characters)) {
    throw new Error('SillyTavern 角色卡模块不可用（/script.js 结构异常，或当前 ST 版本已更新）')
  }
  return mod
}

/** ST 大多数需要认证/防 CSRF 的 POST 请求都要求带上 `getRequestHeaders()` 返回的头（含 CSRF
 *  token），这个函数同样是 `/script.js` 导出的。multipart 请求必须去掉它自带的
 *  `Content-Type: application/json`——交给浏览器根据 FormData 自动生成带正确 boundary 的
 *  `multipart/form-data`，手动指定反而会因为 boundary 缺失导致后端解析失败（TODO.md「关键设计
 *  要点」第2条）。 */
async function multipartHeaders(): Promise<HeadersInit> {
  const mod = await getScriptModule()
  const headers: Record<string, string> = typeof mod.getRequestHeaders === 'function' ? { ...mod.getRequestHeaders() } : {}
  delete headers['Content-Type']
  delete headers['content-type']
  return headers
}

async function postMultipart(path: string, fd: FormData): Promise<Response> {
  const headers = await multipartHeaders()
  const res = await getTopWindow().fetch(path, { method: 'POST', headers, body: fd })
  if (!res.ok) throw new Error(`请求 ${path} 失败：HTTP ${res.status}`)
  return res
}

/* ====== v1CharData/v2CharData ⇄ 工作层 Character 双向转换 ======
 * 字段名差异（读侧，`raw` 是 characters 数组里的一个 v1CharData 元素，`raw.data` 是 v2CharData）：
 *   - description/personality/scenario/mes_example/tags/creator：v1/v2 两层都有同名字段，v2
 *     （更完整、字段更新）优先，v1 兜底——早期没跑过 unshallowCharacter() 的浅数据 `data` 可能是
 *     空对象。
 *   - creatorNotes（工作层）⇄ v2 `creator_notes` 优先，兜底 v1 `creatorcomment`（同一个东西，
 *     v1 字段名是历史遗留）。
 *   - talkativeness：v2 存在 `extensions.talkativeness`，v1 顶层也有一份同名旧字段（可能是
 *     字符串），两者不一致时以 v2 extensions 为准。
 *   - greetings：`[data.first_mes, ...data.alternate_greetings]`，见 types.ts Character 接口
 *     顶部 doc comment。
 *   - worldbook：对应 `extensions.world`（字符串世界书名字），无绑定时是 `undefined`，工作层
 *     统一转成 `null`。
 * 其余没有专门转换的字段（`extensions` 除 regex_scripts/talkativeness/fav/world/depth_prompt
 * 外的部分）用 `{ ...extensions }` 打底透传，避免第三方扩展塞进 extensions 里的未知字段被
 * 一次读-改-存悄悄丢掉。 */
function fromRaw(raw: any): Character {
  const v2 = raw?.data ?? {}
  const ext = v2.extensions ?? {}
  const dp = ext.depth_prompt ?? {}
  const alternates = Array.isArray(v2.alternate_greetings) ? v2.alternate_greetings : []
  const talkativeness = ext.talkativeness ?? raw?.talkativeness
  return {
    avatar: raw?.avatar ?? '',
    name: v2.name || raw?.name || '',
    description: v2.description ?? raw?.description ?? '',
    scenario: v2.scenario ?? raw?.scenario ?? '',
    mesExample: v2.mes_example ?? raw?.mes_example ?? '',
    personality: v2.personality ?? raw?.personality ?? '',
    systemPrompt: v2.system_prompt ?? '',
    postHistoryInstructions: v2.post_history_instructions ?? '',
    depthPrompt: {
      prompt: dp.prompt ?? '',
      depth: typeof dp.depth === 'number' ? dp.depth : 4,
      role: (dp.role === 1 || dp.role === 2) ? dp.role : 0,
    },
    greetings: [v2.first_mes ?? raw?.first_mes ?? '', ...alternates],
    creator: v2.creator ?? raw?.creator ?? '',
    creatorNotes: v2.creator_notes ?? raw?.creatorcomment ?? '',
    version: v2.character_version ?? '',
    tags: Array.isArray(v2.tags) ? [...v2.tags] : (Array.isArray(raw?.tags) ? [...raw.tags] : []),
    talkativeness: typeof talkativeness === 'number' ? talkativeness : (Number(talkativeness) || 0.5),
    fav: !!(ext.fav ?? raw?.fav),
    worldbook: typeof ext.world === 'string' && ext.world ? ext.world : null,
    extensions: { ...ext, regex_scripts: Array.isArray(ext.regex_scripts) ? ext.regex_scripts : [] },
  }
}

/** 工作层 Character ⇄ multipart 表单，参考 TODO.md「ST 原生 API」2.1 里 create/edit 共用的
 *  body 形状。`oldRaw` 是这张角色卡最近一次读到的完整 v1CharData——`ch_name`/`avatar_url` 这类
 *  没有暴露成 Character 字段、或调用方没改过的东西从这里回退，不能让 ST 后端把没传的字段当空值
 *  覆盖掉（TODO.md「关键设计要点」第1条）。`oldRaw` 为 `null` 代表新建（createCharacter()）。 */
function buildFormData(data: Character, oldRaw: any, avatarFile?: File | Blob): FormData {
  const oldData = oldRaw?.data ?? {}
  const fd = new FormData()
  fd.append('ch_name', data.name || oldData.name || oldRaw?.name || '')
  if (oldRaw) fd.append('avatar_url', data.avatar || oldRaw.avatar || '')
  fd.append('description', data.description)
  fd.append('personality', data.personality)
  fd.append('scenario', data.scenario)
  fd.append('mes_example', data.mesExample)
  fd.append('first_mes', data.greetings[0] ?? '')
  for (const g of data.greetings.slice(1)) fd.append('alternate_greetings', g)
  fd.append('creatorcomment', data.creatorNotes)
  fd.append('creator_notes', data.creatorNotes)
  fd.append('creator', data.creator)
  fd.append('character_version', data.version)
  fd.append('system_prompt', data.systemPrompt)
  fd.append('post_history_instructions', data.postHistoryInstructions)
  for (const tag of data.tags) fd.append('tags', tag)
  fd.append('talkativeness', String(data.talkativeness))
  fd.append('fav', data.fav ? 'true' : 'false')
  if (data.worldbook) fd.append('world', data.worldbook)

  // extensions 打包：旧数据打底（保留没建模进 Character 接口的第三方扩展字段），工作层已知字段
  // 覆盖上去——跟 worldbookApi.ts toSTEntry() 的"{...rest} 打底再覆盖"是同一个纪律。
  const extensions = deepClonePlain({
    ...(oldData.extensions ?? {}),
    ...data.extensions,
    talkativeness: data.talkativeness,
    fav: data.fav,
    world: data.worldbook ?? undefined,
    regex_scripts: data.extensions?.regex_scripts ?? [],
    depth_prompt: { prompt: data.depthPrompt.prompt, depth: data.depthPrompt.depth, role: data.depthPrompt.role },
  })
  fd.append('extensions', JSON.stringify(extensions))

  // 头像：只有真的换了头像（调用方传了新文件）才带 avatar 字段；不修改头像时完全不传，让 ST
  // 沿用已有文件（TODO.md「关键设计要点」第3条）。File 对象直接用，Blob 需要包装成带正确文件名
  // 的 File，不然后端按 multer 解析时可能拿不到合法的文件名后缀。
  if (avatarFile) {
    const file = avatarFile instanceof File
      ? avatarFile
      : new File([avatarFile], (data.name || oldData.name || 'character') + '.png', { type: avatarFile.type || 'image/png' })
    fd.append('avatar', file)
  }
  return fd
}

/** 列出全部角色（轻量，只取 avatar/name，不含完整内容）。`characters` 数组里的元素可能是还没
 *  `unshallowCharacter()` 过的浅数据，但 avatar/name 两个字段浅数据里就有，不需要先展开。 */
export async function listCharacters(): Promise<CharacterListEntry[]> {
  const mod = await getScriptModule()
  return (mod.characters as any[]).map(c => ({ avatar: c.avatar, name: c.data?.name || c.name || '' }))
}

/** 按头像文件名读取一张角色卡的完整数据。浅数据（`shallow === true`）先 `unshallowCharacter()`
 *  展开成完整数据、再重新从 `characters` 数组里取一次（展开是原地修改 `characters[index]`，不
 *  是返回值，见 TODO.md「ST 原生 API」2.1 的函数说明），避免拿到还没展开的半份数据。
 *  返回值里额外带一个不对外暴露类型的 `__raw`，供 characterStore 存起来做保存时的 oldRaw 回退——
 *  跟 fromRaw() 转换是同一份数据，这里不用调用方再读一次原始数组。 */
export async function getCharacterByAvatar(avatar: string): Promise<{ character: Character; raw: any } | null> {
  const mod = await getScriptModule()
  const index = (mod.characters as any[]).findIndex(c => c.avatar === avatar)
  if (index < 0) return null
  if (mod.characters[index]?.shallow && typeof mod.unshallowCharacter === 'function') {
    await mod.unshallowCharacter(String(index))
  }
  const raw = mod.characters[index]
  if (!raw) return null
  return { character: fromRaw(raw), raw: deepClonePlain(raw) }
}

/** 新建角色卡——只负责在 ST 后端创建这个角色文件，不负责把结果加载进 store（同
 *  worldbookApi.createWorldbook() 的分工）。返回新角色的 avatar 文件名，调用方拿它去
 *  getCharacterByAvatar() 读一次权威数据。ST 的 `/api/characters/create` 直接以纯文本形式
 *  返回这个文件名。 */
export async function createCharacter(data: Character, avatarFile?: File | Blob): Promise<string> {
  const fd = buildFormData(data, null, avatarFile)
  const res = await postMultipart('/api/characters/create', fd)
  const text = (await res.text()).trim()
  // 后端可能返回纯文件名，也可能返回带引号的 JSON 字符串（不同 ST 版本行为不完全一致），两种都
  // 兼容一下，拿不到就退回调用方自己传入的 name（不保证一定对，但比抛错更能继续往下走）。
  try { return JSON.parse(text) || data.name } catch { return text || data.name }
}

/** 保存（编辑）已有角色卡。`oldRaw` 必须是 getCharacterByAvatar() 返回的那份 `raw`，用于字段级
 *  回退（见 buildFormData 的 doc comment）——不能凭空构造一个假的 oldRaw，否则回退的字段全是
 *  undefined，等于没有回退保护。 */
export async function editCharacter(data: Character, oldRaw: any, avatarFile?: File | Blob): Promise<void> {
  if (!oldRaw) throw new Error('缺少 oldRaw（characterStore 内部错误：编辑角色卡必须先成功加载过一次）')
  const fd = buildFormData(data, oldRaw, avatarFile)
  await postMultipart('/api/characters/edit', fd)
}

export async function deleteCharacter(avatar: string, opts: { deleteChats?: boolean } = {}): Promise<void> {
  const mod = await getScriptModule()
  if (typeof mod.deleteCharacter !== 'function') {
    throw new Error('SillyTavern 角色卡模块不可用（deleteCharacter 缺失）')
  }
  await mod.deleteCharacter(avatar, opts)
}
