import type { Character, CharacterListEntry } from '../types';
import { deepClonePlain } from './apiUtils';
import {
  fromNativeRegex,
  toNativeRegex,
  fromNativeScripts,
  toNativeScripts,
} from './scriptConvert';

/** 角色卡头像缩略图 URL——和 ST 自己的 getThumbnailUrl('avatar', file) 同一个端点。
 *  带 `&t=<ts>` 是为了让保存后换头能强刷浏览器缓存。 */
export function getCharacterAvatarUrl(avatar: string, cacheBust = false): string {
  if (!avatar) return '';
  return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}${
    cacheBust ? `&t=${Date.now()}` : ''
  }`;
}

/* ====== 角色卡 API ======
 * 读侧：动态 import() ST 的 /script.js 模块，mod.characters 是 ESM live binding。
 * 写侧：角色卡写入口是 HTTP multipart 表单 POST（/api/characters/create、/api/characters/edit），
 * 用裸 fetch() 发起。 */

/** /script.js 的 characters 数组元素（ST v1CharData 的最小形状，只声明本文件用到的字段——
 *  完整结构是松散的，工作层不在这里做全量建模，其余字段照旧走 fromRaw(raw: Record<string, unknown>)）。 */
interface STCharEntry {
  avatar: string;
  name?: string;
  data?: { name?: string };
}

async function getScriptModule() {
  const mod = await import(/* @vite-ignore */ '/script.js' as string);
  if (!mod || !Array.isArray(mod.characters)) {
    throw new Error('SillyTavern 角色卡模块不可用（/script.js 结构异常，或当前 ST 版本已更新）');
  }
  return mod;
}

/** 从 /script.js 获取请求头（含 CSRF token），去掉 Content-Type 交给浏览器根据 FormData 自动
 *  生成 multipart/form-data boundary，否则后端解析失败。 */
async function multipartHeaders(): Promise<HeadersInit> {
  const mod = await getScriptModule();
  const headers: Record<string, string> =
    typeof mod.getRequestHeaders === 'function' ? { ...mod.getRequestHeaders() } : {};
  delete headers['Content-Type'];
  delete headers['content-type'];
  return headers;
}

async function postMultipart(path: string, fd: FormData): Promise<Response> {
  const headers = await multipartHeaders();
  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: fd,
  });
  if (!res.ok) throw new Error(`请求 ${path} 失败：HTTP ${res.status}`);
  return res;
}

/** ST 的 depth_prompt.role 是字符串枚举（'system' | 'user' | 'assistant'，char-data.js），工作层
 *  Character 直接使用字符串枚举，无需数字互转。兼容历史数字值兜底。 */
export function depthPromptRoleToStr(role: unknown): 'system' | 'user' | 'assistant' {
  if (role === 'system' || role === 'user' || role === 'assistant') return role;
  if (role === 0) return 'system';
  if (role === 1) return 'user';
  if (role === 2) return 'assistant';
  return 'system';
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
 *   - greetings：`[data.first_mes, ...data.alternate_greetings]`。
 *   - worldbook：对应 `extensions.world`（字符串世界书名字），无绑定时是 `undefined`，工作层
 *     统一转成 `null`。
 * 其余没有专门转换的字段（`extensions` 除 regex_scripts/talkativeness/fav/world/depth_prompt/
 * tavern_helper 外的部分）由 store 的 oldRaw 打底透传，避免第三方扩展字段被一次读-改-存悄悄丢掉。 */
export function fromRaw(raw: Record<string, unknown>): Character {
  const v2 = (raw?.data ?? {}) as Record<string, unknown>;
  const ext = (v2.extensions ?? {}) as Record<string, unknown>;
  const dp = (ext.depth_prompt ?? {}) as Record<string, unknown>;
  const th = (ext.tavern_helper ?? {}) as Record<string, unknown>;
  const alternates = Array.isArray(v2.alternate_greetings) ? v2.alternate_greetings : [];
  const talkativeness = ext.talkativeness ?? raw?.talkativeness;
  return {
    avatar: (raw?.avatar ?? '') as string,
    name: (v2.name || raw?.name || '') as string,
    description: (v2.description ?? raw?.description ?? '') as string,
    otherPrompts: {
      scenario: (v2.scenario ?? raw?.scenario ?? '') as string,
      mesExample: (v2.mes_example ?? raw?.mes_example ?? '') as string,
      personality: (v2.personality ?? raw?.personality ?? '') as string,
      systemPrompt: (v2.system_prompt ?? '') as string,
      postHistoryInstructions: (v2.post_history_instructions ?? '') as string,
      depthPrompt: {
        prompt: (dp.prompt ?? '') as string,
        depth: typeof dp.depth === 'number' ? dp.depth : 4,
        role: depthPromptRoleToStr(dp.role),
      },
    },
    greetings: [(v2.first_mes ?? raw?.first_mes ?? '') as string, ...alternates],
    creatorMeta: {
      creator: (v2.creator ?? raw?.creator ?? '') as string,
      creatorNotes: (v2.creator_notes ?? raw?.creatorcomment ?? '') as string,
      version: (v2.character_version ?? '') as string,
      tags: Array.isArray(v2.tags) ? [...v2.tags] : Array.isArray(raw?.tags) ? [...raw.tags] : [],
    },
    talkativeness: typeof talkativeness === 'number' ? talkativeness : Number(talkativeness) || 0.5,
    fav: !!(ext.fav ?? raw?.fav),
    worldbook: typeof ext.world === 'string' && ext.world ? ext.world : null,
    regexs: Array.isArray(ext.regex_scripts)
      ? ext.regex_scripts.map((r) => fromNativeRegex(r as Record<string, unknown>))
      : [],
    scripts: fromNativeScripts(th.scripts),
  };
}

/** 工作层 Character → multipart 表单。`oldRaw` 是最近一次读到的完整 v1CharData，用于回退没有
 *  暴露成 Character 字段的值，避免后端把未传字段当空值覆盖。`null` = 新建。 */
export function buildFormData(
  data: Character,
  oldRaw: Record<string, unknown> | null,
  avatarFile?: File | Blob
): FormData {
  const oldData = (oldRaw?.data ?? {}) as Record<string, unknown>;
  const fd = new FormData();
  fd.append('ch_name', (data.name || oldData.name || oldRaw?.name || '') as string);
  if (oldRaw) fd.append('avatar_url', (data.avatar || oldRaw.avatar || '') as string);
  // chat/create_date 不建模进工作层 Character，但 ST edit 端点会直接取 request.body 里的值——
  // 编辑时不回传这两个字段会被服务端当成 undefined 丢弃（JSON.stringify 删键），导致保存后
  // 当前对话引用与创建时间被重置。新建时（oldRaw=null）不传，ST create 端点自己会生成。
  if (oldRaw) {
    if (oldRaw.chat) fd.append('chat', oldRaw.chat as string);
    if (oldRaw.create_date) fd.append('create_date', oldRaw.create_date as string);
  }
  fd.append('description', data.description);
  fd.append('personality', data.otherPrompts.personality);
  fd.append('scenario', data.otherPrompts.scenario);
  fd.append('mes_example', data.otherPrompts.mesExample);
  fd.append('first_mes', data.greetings[0] ?? '');
  for (const g of data.greetings.slice(1)) fd.append('alternate_greetings', g);
  fd.append('creatorcomment', data.creatorMeta.creatorNotes);
  fd.append('creator_notes', data.creatorMeta.creatorNotes);
  fd.append('creator', data.creatorMeta.creator);
  fd.append('character_version', data.creatorMeta.version);
  fd.append('system_prompt', data.otherPrompts.systemPrompt);
  fd.append('post_history_instructions', data.otherPrompts.postHistoryInstructions);
  for (const tag of data.creatorMeta.tags) fd.append('tags', tag);
  fd.append('talkativeness', String(data.talkativeness));
  fd.append('fav', data.fav ? 'true' : 'false');
  if (data.worldbook) fd.append('world', data.worldbook);

  // extensions 打包：旧数据打底（保留没建模进 Character 接口的第三方扩展字段），工作层已知字段
  // 覆盖上去——跟 worldbookApi.ts toSTEntry() 的 raw 透传是同一个纪律。
  const oldExt = (oldData.extensions ?? {}) as Record<string, unknown>;
  const oldTH = (oldExt.tavern_helper ?? {}) as Record<string, unknown>;
  const extensions = deepClonePlain({
    ...oldExt,
    talkativeness: data.talkativeness,
    fav: data.fav,
    world: data.worldbook ?? undefined,
    regex_scripts: data.regexs.map(toNativeRegex),
    depth_prompt: {
      prompt: data.otherPrompts.depthPrompt.prompt,
      depth: data.otherPrompts.depthPrompt.depth,
      role: data.otherPrompts.depthPrompt.role,
    },
    tavern_helper: {
      ...oldTH,
      scripts: toNativeScripts(data.scripts),
    },
  });
  fd.append('extensions', JSON.stringify(extensions));

  // 头像：只有真的换了头像（调用方传了新文件）才带 avatar 字段；不修改头像时完全不传，让 ST
  // 沿用已有文件（TODO.md「关键设计要点」第3条）。File 对象直接用，Blob 需要包装成带正确文件名
  // 的 File，不然后端按 multer 解析时可能拿不到合法的文件名后缀。
  if (avatarFile) {
    const file =
      avatarFile instanceof File
        ? avatarFile
        : new File([avatarFile], ((data.name || oldData.name || 'character') as string) + '.png', {
            type: avatarFile.type || 'image/png',
          });
    fd.append('avatar', file);
  }
  return fd;
}

/** 列出全部角色（轻量，只取 avatar/name）。浅数据里的 avatar/name 已是可用值，无需先展开。 */
export async function listCharacters(): Promise<CharacterListEntry[]> {
  const mod = await getScriptModule();
  return mod.characters.map((c: STCharEntry) => ({
    avatar: c.avatar,
    name: c.data?.name || c.name || '',
  }));
}

/** 拿 ST 当前选中角色的 avatar 文件名（`this_chid` 索引 `characters` 那项的 `.avatar`）。
 * 没选中（this_chid 是 undefined/越界）或模块结构异常时返回 null，让调用方兜底列表第一项。 */
export async function getSelectedCharacterAvatar(): Promise<string | null> {
  const mod = await getScriptModule();
  const chid = mod.this_chid;
  if (typeof chid !== 'number' || chid < 0) return null;
  const arr = mod.characters;
  if (!Array.isArray(arr) || chid >= arr.length) return null;
  const av = arr[chid]?.avatar;
  return typeof av === 'string' && av ? av : null;
}

/** 把 ST 主菜单选中角色切到 avatar 对应的那张卡——只切 ST 主菜单选中项，不加载到编辑器。
 *  Preview 生成前惰性调用：ST 的 generate 不认工具里编辑的是哪份角色，只认主菜单选中项，
 *  不先对齐就会用错角色卡渲染。已选中同一张时跳过，零开销。
 *  返回值：true = 切成功/本来就一致；false = 切失败（列表里找不到这个 avatar）。 */
export async function selectCharacterByAvatar(avatar: string): Promise<boolean> {
  if (!avatar) return false;
  const mod = await getScriptModule();
  const arr = mod.characters;
  if (!Array.isArray(arr)) return false;
  const curChid = mod.this_chid;
  if (
    typeof curChid === 'number' &&
    curChid >= 0 &&
    curChid < arr.length &&
    arr[curChid]?.avatar === avatar
  ) {
    return true;
  }
  const chid = arr.findIndex((c: STCharEntry) => c.avatar === avatar);
  if (chid < 0) return false;
  try {
    if (typeof mod.selectCharacterById !== 'function') return false;
    await mod.selectCharacterById(chid, { switchMenu: false });
  } catch {
    return false;
  }
  return true;
}

/** 按头像文件名读取一张角色卡的完整数据。调用 `getOneCharacter(avatar)` 发起网络请求从服务端
 *  重新拉取，同时更新 ST 前端状态。返回权威最新数据。 */
export async function getCharacterByAvatar(
  avatar: string
): Promise<{ character: Character; raw: Record<string, unknown> } | null> {
  const mod = await getScriptModule();
  if (typeof mod.getOneCharacter === 'function') {
    await mod.getOneCharacter(avatar);
  }
  const index = mod.characters.findIndex((c: STCharEntry) => c.avatar === avatar);
  if (index < 0) return null;
  const raw = mod.characters[index];
  if (!raw) return null;
  return { character: fromRaw(raw), raw: deepClonePlain(raw) };
}

/** 新建角色卡——只负责在 ST 后端创建这个角色文件，不负责加载进 store。返回新角色的 avatar 文件名，
 *  调用方应拿它去 getCharacterByAvatar() 读一次权威数据。 */
export async function createCharacter(data: Character, avatarFile?: File | Blob): Promise<string> {
  const fd = buildFormData(data, null, avatarFile);
  const res = await postMultipart('/api/characters/create', fd);
  const text = (await res.text()).trim();
  // 创建后刷新ST前端
  const mod = await getScriptModule();
  await mod.getCharacters();
  return text;
}

/** 保存（编辑）已有角色卡。`oldRaw` 必须是 getCharacterByAvatar() 返回的那份 `raw`，用于字段级
 *  回退——不能凭空构造假的 oldRaw，否则回退保护失效。 */
export async function editCharacter(
  data: Character,
  oldRaw: unknown,
  avatarFile?: File | Blob
): Promise<void> {
  const mod = await getScriptModule();
  if (!oldRaw)
    throw new Error('缺少 oldRaw（characterStore 内部错误：编辑角色卡必须先成功加载过一次）');
  const fd = buildFormData(data, oldRaw as Record<string, unknown> | null, avatarFile);
  await postMultipart('/api/characters/edit', fd);
  /** 同步ST的前端显示 */
  if (typeof mod.getOneCharacter === 'function') {
    await mod.getOneCharacter(data.avatar);
  }
}

export async function deleteCharacter(
  avatar: string,
  opts: { deleteChats?: boolean } = {}
): Promise<void> {
  const mod = await getScriptModule();
  if (typeof mod.deleteCharacter !== 'function') {
    throw new Error('SillyTavern 角色卡模块不可用（deleteCharacter 缺失）');
  }
  await mod.deleteCharacter(avatar, opts);
  /** 同步ST的前端显示 */
  if (typeof mod.getOneCharacter === 'function') {
    await mod.getOneCharacter(avatar);
  }
}
