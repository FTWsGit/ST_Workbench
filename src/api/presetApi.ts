import type { Preset, PresetSettings, PromptBlock } from '../types';
import {
  fromNativeRegex,
  toNativeRegex,
  fromNativeScripts,
  toNativeScripts,
} from './scriptConvert';
import { getCtx } from './hostContext';
import { deepClonePlain } from './apiUtils';

/* ====== PresetManager ======
 * 一律走 ST 的 PresetManager.getPresetList() 获取完整预设列表，而非读 ctx.chatCompletionSettings
 * （后者只对应当前选中的预设）。显式请求 'openai' PresetManager——ST 按 API 类型维护独立的
 * PresetManager，无参版本解析到当前 UI 主 API，可能不是 chat-completion。 */
function getPresetManager() {
  const ctx = getCtx();
  const pm = ctx.getPresetManager?.('openai');
  if (!pm)
    throw new Error('SillyTavern context 不可用（getPresetManager 缺失，或当前 ST 版本 API 不同）');
  return pm;
}

export interface PresetListEntry {
  name: string;
  index: number;
}

/** 列出全部 Chat Completion 预设（不是只有当前选中的那个）。 */
export function listPresets(): PresetListEntry[] {
  const pm = getPresetManager();
  const list = pm.getPresetList?.();
  const names = list?.preset_names;
  if (!names || typeof names !== 'object')
    throw new Error('无法获取预设列表（getPresetList 结构异常，ST 版本可能已更新）');
  return Object.entries(names).map(([name, index]) => ({
    name,
    index: index as number,
  }));
}

/** ST 当前在自己 UI 里选中的预设名——仅用作"首次打开面板时默认加载哪个"的初始值，
 *  不代表我们这边接下来只能操作这一个预设。 */
export function getSelectedPresetName(): string {
  const pm = getPresetManager();
  return pm.getSelectedPresetName?.() || '';
}

/* ====== ST 原生预设 ⇄ 干净 Preset 双向转换 ======
 * 原生形状见 `.doc/reference/spec/preset.mdc`。关键差异：
 *   - 原生 `prompts` + `prompt_order`（按 character_id=100001 定位、order 元素带 enabled）两套数组，
 *     干净层合并成一份 `prompts`（数组顺序 = 视觉顺序，enabled + 分组字段烘进每条 block）。
 *   - 原生 `extensions.regex_scripts` → 干净 `regexs`（disabled ⇄ enabled 取反）。
 *   - 原生 `extensions.tavern_helper.scripts`（ScriptTree，含 ScriptFolder）→ 干净 `scripts`
 *     （扁平 Script[]，ScriptFolder 按 _gid/_gname/_genabled/_gcollapsed 折叠成组）。
 *   - settings 只建模 14 个采样参数，其余（模型名、formats 等）从 raw 透传。
 * 未建模字段一律从调用方传入的 `raw` 透传，见 toNativePreset。 */

const SETTINGS_KEYS: (keyof PresetSettings)[] = [
  'openai_max_context',
  'openai_max_tokens',
  'n',
  'stream_openai',
  'temperature',
  'frequency_penalty',
  'presence_penalty',
  'top_p',
  'repetition_penalty',
  'min_p',
  'top_k',
  'top_a',
  'seed',
  'squash_system_messages',
];

const SETTINGS_DEFAULTS: Record<keyof PresetSettings, number | boolean> = {
  openai_max_context: 4095,
  openai_max_tokens: 300,
  n: 1,
  stream_openai: true,
  temperature: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
  top_p: 1,
  repetition_penalty: 1,
  min_p: 0,
  top_k: 0,
  top_a: 0,
  seed: -1,
  squash_system_messages: false,
};

function settingsFromNative(raw: Record<string, unknown>): PresetSettings {
  const s: Record<string, unknown> = {};
  for (const k of SETTINGS_KEYS) {
    const v = raw[k];
    const d = SETTINGS_DEFAULTS[k];
    s[k] = typeof v === 'number' || typeof v === 'boolean' ? v : (d as number | boolean);
  }
  return s as unknown as PresetSettings;
}

function settingsToNative(s: PresetSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SETTINGS_KEYS) out[k] = s[k];
  return out;
}

/* ====== prompt 转换 ====== */
function fromNativePrompt(
  raw: Record<string, unknown>,
  orderItem?: Record<string, unknown>
): PromptBlock {
  return {
    identifier: (raw.identifier ?? '') as string,
    name: (raw.name ?? '') as string,
    content: (raw.content ?? '') as string,
    role: (raw.role ?? 'system') as PromptBlock['role'],
    system_prompt: !!raw.system_prompt,
    marker: !!raw.marker,
    enabled: orderItem ? !!orderItem.enabled : false,
    injectionPosition: typeof raw.injection_position === 'number' ? raw.injection_position : 0,
    injectionDepth: typeof raw.injection_depth === 'number' ? raw.injection_depth : 0,
    injectionOrder: typeof raw.injection_order === 'number' ? raw.injection_order : 0,
    _gid: orderItem?._gid as string | undefined,
    _gname: orderItem?._gname as string | undefined,
    _gcollapsed: orderItem?._gcollapsed as boolean | undefined,
    _genabled: orderItem?._genabled as boolean | undefined,
    _gidx: orderItem?._gidx as number | undefined,
  };
}

function toNativePrompt(
  block: PromptBlock,
  rawPrompt?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(rawPrompt ?? {}),
    identifier: block.identifier,
    name: block.name,
    content: block.content,
    role: block.role,
    system_prompt: block.system_prompt,
    marker: block.marker,
    injection_position: block.injectionPosition,
    injection_depth: block.injectionDepth,
    injection_order: block.injectionOrder,
  };
}

/** 原生预设 → 干净 Preset。prompts 按 prompt_order 顺序烘出（enabled + 分组字段），
 *  未在 prompt_order 中引用的 hidden block 追加到 prompts 末尾、标 hidden:true。 */
export function fromNativePreset(raw: Record<string, unknown>): Preset {
  const promptsRaw = Array.isArray(raw.prompts) ? (raw.prompts as Record<string, unknown>[]) : [];
  const promptOrder =
    Array.isArray(raw.prompt_order) && raw.prompt_order.length
      ? ((raw.prompt_order as Record<string, unknown>[]).find((p) => p.character_id === 100001)
          ?.order ?? [])
      : [];
  const orderItems = Array.isArray(promptOrder) ? (promptOrder as Record<string, unknown>[]) : [];
  const byId = new Map(promptsRaw.map((p) => [p.identifier, p]));
  const seen = new Set<string>();
  const prompts: PromptBlock[] = [];
  for (const item of orderItems) {
    const id = item?.identifier as string | undefined;
    if (!id || seen.has(id)) continue;
    const p = byId.get(id);
    if (!p) continue;
    seen.add(id);
    prompts.push(fromNativePrompt(p, item));
  }
  // 隐藏块：在原生 prompts 里、但没被 prompt_order 引用——追加到 prompts 末尾，标 hidden:true。
  for (const p of promptsRaw) {
    const id = p?.identifier as string | undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    prompts.push({ ...fromNativePrompt(p), hidden: true });
  }
  const extensions = (raw.extensions ?? {}) as Record<string, unknown>;
  const tavernHelper = (extensions.tavern_helper ?? {}) as Record<string, unknown>;
  return {
    name: (raw.name ?? '') as string,
    settings: settingsFromNative(raw),
    prompts,
    regexs: Array.isArray(extensions.regex_scripts)
      ? extensions.regex_scripts.map((r) => fromNativeRegex(r as Record<string, unknown>))
      : [],
    scripts: fromNativeScripts(tavernHelper.scripts),
  };
}

/** 干净 Preset → 原生预设。`raw` 是最近一次读到的原生快照：未建模字段（模型名、formats、
 *  tavern_helper 的 variales 等）从 raw 透传，已知字段由干净层覆盖，保证不丢数据。
 *  隐藏块由 `block.hidden` 标记，不进 prompt_order。 */
export function toNativePreset(
  preset: Preset,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const rawPrompts = Array.isArray(raw.prompts) ? (raw.prompts as Record<string, unknown>[]) : [];
  const rawPromptById = new Map(rawPrompts.map((p) => [p.identifier, p]));
  const nativePrompts: Record<string, unknown>[] = [];
  const order: Record<string, unknown>[] = [];
  preset.prompts.forEach((block) => {
    nativePrompts.push(toNativePrompt(block, rawPromptById.get(block.identifier)));
    if (block.hidden) return; // 隐藏块不进 prompt_order
    const oi: Record<string, unknown> = { identifier: block.identifier, enabled: block.enabled };
    if (block._gid) {
      oi._gid = block._gid;
      oi._gname = block._gname;
      oi._gcollapsed = block._gcollapsed;
      oi._genabled = block._genabled;
      oi._gidx = block._gidx;
    }
    order.push(oi);
  });

  const rawExtensions = (raw.extensions ?? {}) as Record<string, unknown>;
  const rawTavernHelper = (rawExtensions.tavern_helper ?? {}) as Record<string, unknown>;
  const extensions: Record<string, unknown> = {
    ...rawExtensions,
    regex_scripts: preset.regexs.map(toNativeRegex),
    tavern_helper: {
      ...rawTavernHelper,
      scripts: toNativeScripts(preset.scripts),
    },
  };

  return {
    ...raw,
    ...settingsToNative(preset.settings),
    prompts: nativePrompts,
    prompt_order: [{ character_id: 100001, order }],
    extensions,
  };
}

/* ====== 新建预设的默认模板（ST 原生格式，供 createPreset 打底） ====== */
import defaultPreset from '../../default/default_preset.json';
export const DEFAULT_NATIVE_PRESET = defaultPreset as Record<string, unknown>;

/** 按名字读取指定预设的完整数据，可以是任意一个预设。优先用 `getCompletionPresetByName`，
 *  拿不到时从 `getPresetList()` 按名字查下标取元素。
 *  返回 `{ preset: 干净 Preset, raw: 原生深拷贝快照 }`——raw 供 store 保存时字段级透传。 */
export function getPresetByName(
  name: string
): { preset: Preset; raw: Record<string, unknown> } | null {
  const pm = getPresetManager();
  let preset: Record<string, unknown> | null =
    typeof pm.getCompletionPresetByName === 'function' ? pm.getCompletionPresetByName(name) : null;
  if (!preset) {
    const list = pm.getPresetList?.();
    const idx = list?.preset_names?.[name];
    if (typeof idx === 'number') preset = list.presets?.[idx];
  }
  if (!preset || !Array.isArray(preset.prompts) || !Array.isArray(preset.prompt_order)) return null;
  // Deep-clone into a plain object before handing it back — both lookup paths above can return
  // ST's own live (possibly Vue-reactive) object, and we never want to hold or pass around
  // someone else's reactive reference (see savePresetAs() below for why that specifically bites).
  const raw = deepClonePlain(preset) as Record<string, unknown>;
  return { preset: fromNativePreset(raw), raw };
}

/** 切换 ST 当前选中的预设。不切换的话外部函数（如 window.SillyTavern.generate()）会沿用旧的
 *  选中预设生成，但切换本身较慢。 */
export function selectPresetByName(name: string): boolean {
  const pm = getPresetManager();
  try {
    const id = pm.findPreset(name);
    pm.selectPreset(id);
  } catch {
    return false;
  }

  return true;
}

/** 保存到指定名字的预设——不要求是当前选中的那个。
 *
 *  `raw` 必须是纯对象（store 持有的原生快照），不能是 Pinia/Vue 响应式引用：`structuredClone()`
 *  克隆不了 Vue 的 Proxy。调用方应先 `deepClonePlain()`，这里再断言一次双重保险。 */
export async function savePresetAs(
  name: string,
  preset: Preset,
  raw: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const pm = getPresetManager();
  if (typeof pm.savePreset !== 'function')
    throw new Error('SillyTavern context 不可用（savePreset 缺失）');
  const plain = deepClonePlain(toNativePreset(preset, raw));
  await Promise.resolve(pm.savePreset(name, plain));
  return plain;
}

export async function deletePreset(name: string): Promise<void> {
  const pm = getPresetManager();
  if (typeof pm.deletePreset !== 'function')
    throw new Error('SillyTavern context 不可用（deletePreset 缺失）');
  await Promise.resolve(pm.deletePreset(name));
}

export interface RenderedMsg {
  role: string;
  content: string;
  tokens: number;
  identifier: string;
}

/** promptManager.messages.collection 内层消息条目（openai.js 渲染产物的最小形状，只声明
 *  本函数用到的字段；pm 是 ST 宿主无类型对象，运行时内容字段一定是字符串）。 */
interface PromptManagerMessage {
  role: string;
  content: string;
  tokens: number;
  identifier: string;
}

/** 按 identifier 分组返回真实渲染后的消息（宏/正则/插件都已处理）。每次调用触发一次新的
 *  dry-run，不复用旧数据。依赖 openai.js 内部实现，ST 版本更新可能失效。 */
export async function getPromptManagerMessages(): Promise<Record<string, RenderedMsg[]>> {
  const ctx = getCtx();
  if (typeof ctx.generate !== 'function')
    throw new Error('SillyTavern context 不可用（ctx.generate 缺失）');

  await ctx.generate('normal', {}, true);

  const module = await import(/* @vite-ignore */ '/scripts/openai.js' as string);
  const pm = module?.setupChatCompletionPromptManager?.();
  if (!pm?.messages?.collection) {
    throw new Error(
      'promptManager.messages 结构异常，ST 版本可能已更新（方案B失效，需要重新翻源码确认）'
    );
  }

  const results: Record<string, RenderedMsg[]> = {};
  for (const item of pm.messages.collection) {
    if (!item) continue; // null = 这个位置在本次生成里被跳过（禁用/无内容）
    results[item.identifier] = (item.collection || []).map((m: PromptManagerMessage) => ({
      role: m.role,
      content: m.content ?? '',
      tokens: m.tokens ?? 0,
      identifier: m.identifier,
    }));
  }
  return results;
}

export interface RawRequestMessage {
  role: string;
  content: string;
}

/* ====== 精确预览：整体原文（CHAT_COMPLETION_SETTINGS_READY 事件）======
 * 必须跑一次真实的 `ctx.generate('normal')`（非 dry-run），并监听 CHAT_COMPLETION_SETTINGS_READY
 * 事件——该事件在请求体最终组装完成、即将发给 API 之前触发，`completion.messages` 即真正会发出去的
 * 消息。拿到后立刻 `ctx.stopGeneration()` 中断真实生成，避免 API 调用产生费用/等待。 */
export async function getFinalRequestMessages(): Promise<RawRequestMessage[]> {
  const ctx = getCtx();
  if (typeof ctx.generate !== 'function')
    throw new Error('SillyTavern context 不可用（ctx.generate 缺失）');
  if (!ctx.eventSource || !ctx.event_types?.CHAT_COMPLETION_SETTINGS_READY) {
    throw new Error(
      'SillyTavern context 不可用（eventSource/event_types 缺失，或当前不是 Chat Completion 模式）'
    );
  }

  const evt = ctx.event_types.CHAT_COMPLETION_SETTINGS_READY;
  const src = ctx.eventSource;
  const useOnce = typeof src.once === 'function';

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      if (!useOnce) {
        try {
          if (src.removeListener?.(evt, handler) == null) src.off?.(evt, handler);
        } catch {
          // 移除事件监听失败可忽略（ST 内部事件源可能已释放）
        }
      }
    };
    const handler = (completion: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      try {
        ctx.stopGeneration?.();
      } catch {
        // 停止生成失败可忽略，超时分支同样会做清理
      }
      cleanup();
      const msgs = Array.isArray(completion?.messages) ? completion.messages : [];
      resolve(
        msgs.map((m) => ({
          role: m?.role || '',
          content:
            typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '', null, 2),
        }))
      );
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ctx.stopGeneration?.();
      } catch {
        // 停止生成失败可忽略，正常分支同样会做清理
      }
      cleanup();
      reject(
        new Error(
          '等待 CHAT_COMPLETION_SETTINGS_READY 超时（可能没有配置好可用的 API 连接，或当前不是 Chat Completion 模式）'
        )
      );
    }, 20000);

    if (useOnce) src.once(evt, handler);
    else src.on(evt, handler);

    ctx.generate('normal').catch((e: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}
