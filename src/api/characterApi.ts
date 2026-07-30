import type { Character, CharacterListEntry } from '../types'
import { ensureTopImporter, getTopWindow } from './hostContext'
import { deepClonePlain } from './apiUtils'

/* ====== 角色卡 API ======
 * 读侧：通过 ensureTopImporter() import ST 的 /script.js 模块，mod.characters 是 ESM live binding。
 * 写侧：角色卡写入口是 HTTP multipart 表单 POST（/api/characters/create、/api/characters/edit），
 * 用 getTopWindow().fetch() 发起——iframe 自己的 fetch 会按假 origin 解析相对路径。 */

async function getScriptModule(): Promise<any> {
  const importer = await ensureTopImporter()
  const mod = await importer('/script.js')
  if (!mod || !Array.isArray(mod.characters)) {
    throw new Error('SillyTavern 角色卡模块不可用（/script.js 结构异常，或当前 ST 版本已更新）')
  }
  return mod
}

/** 从 /script.js 获取请求头（含 CSRF token），去掉 Content-Type 交给浏览器根据 FormData 自动
 *  生成 multipart/form-data boundary，否则后端解析失败。 */
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

/** 工作层 Character → multipart 表单。`oldRaw` 是最近一次读到的完整 v1CharData，用于回退没有
 *  暴露成 Character 字段的值，避免后端把未传字段当空值覆盖。`null` = 新建。 */
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

/** 列出全部角色（轻量，只取 avatar/name）。浅数据里的 avatar/name 已是可用值，无需先展开。 */
export async function listCharacters(): Promise<CharacterListEntry[]> {
  const mod = await getScriptModule()
  return (mod.characters as any[]).map(c => ({ avatar: c.avatar, name: c.data?.name || c.name || '' }))
}

/** 按头像文件名读取一张角色卡的完整数据。调用 `getOneCharacter(avatar)` 发起网络请求从服务端
 *  重新拉取，同时更新 ST 前端状态。返回权威最新数据。 */
export async function getCharacterByAvatar(avatar: string): Promise<{ character: Character; raw: any } | null> {
  const mod = await getScriptModule()
  if (typeof mod.getOneCharacter === 'function') {
    await mod.getOneCharacter(avatar)
  }
  const index = (mod.characters as any[]).findIndex(c => c.avatar === avatar)
  if (index < 0) return null
  const raw = mod.characters[index]
  if (!raw) return null
  return { character: fromRaw(raw), raw: deepClonePlain(raw) }
}

/** 新建角色卡——只负责在 ST 后端创建这个角色文件，不负责加载进 store。返回新角色的 avatar 文件名，
 *  调用方应拿它去 getCharacterByAvatar() 读一次权威数据。 */
export async function createCharacter(data: Character, avatarFile?: File | Blob): Promise<string> {
  const fd = buildFormData(data, null, avatarFile)
  const res = await postMultipart('/api/characters/create', fd)
  const text = (await res.text()).trim()
  // 创建后刷新ST前端
  const mod = await getScriptModule()
  await mod.getCharacters()
  return text
}

/** 保存（编辑）已有角色卡。`oldRaw` 必须是 getCharacterByAvatar() 返回的那份 `raw`，用于字段级
 *  回退——不能凭空构造假的 oldRaw，否则回退保护失效。 */
export async function editCharacter(data: Character, oldRaw: any, avatarFile?: File | Blob): Promise<void> {
  const mod = await getScriptModule()
  if (!oldRaw) throw new Error('缺少 oldRaw（characterStore 内部错误：编辑角色卡必须先成功加载过一次）')
  const fd = buildFormData(data, oldRaw, avatarFile)
  await postMultipart('/api/characters/edit', fd)
  /** 同步ST的前端显示 */
  if (typeof mod.getOneCharacter === 'function') {
    await mod.getOneCharacter(data.avatar)
  }
}

export async function deleteCharacter(avatar: string, opts: { deleteChats?: boolean } = {}): Promise<void> {
  const mod = await getScriptModule()
  if (typeof mod.deleteCharacter !== 'function') {
    throw new Error('SillyTavern 角色卡模块不可用（deleteCharacter 缺失）')
  }
  await mod.deleteCharacter(avatar, opts)
  /** 同步ST的前端显示 */
  if (typeof mod.getOneCharacter === 'function') {
    await mod.getOneCharacter(avatar)
  }
}
