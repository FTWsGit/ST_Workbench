import type { RegexScript, Script } from '../types';

/* ====== 正则脚本 / 酒馆助手脚本 ⇄ 干净层 共享转换 ======
 * 预设和角色卡都绑定这两类脚本，转换逻辑共用（宿主不同，字段形状一致）。 */

/** 正则脚本：ST 原生 disabled ⇄ 干净 enabled（取反）。 */
export function fromNativeRegex(raw: Record<string, unknown>): RegexScript {
  return {
    id: (raw.id ?? '') as string,
    scriptName: (raw.scriptName ?? '') as string,
    findRegex: (raw.findRegex ?? '') as string,
    replaceString: (raw.replaceString ?? '') as string,
    trimStrings: Array.isArray(raw.trimStrings) ? raw.trimStrings : [],
    placement: Array.isArray(raw.placement) ? raw.placement : [],
    enabled: !raw.disabled,
    markdownOnly: !!raw.markdownOnly,
    promptOnly: !!raw.promptOnly,
    runOnEdit: !!raw.runOnEdit,
    substituteRegex: typeof raw.substituteRegex === 'number' ? raw.substituteRegex : 0,
    minDepth: typeof raw.minDepth === 'number' ? raw.minDepth : null,
    maxDepth: typeof raw.maxDepth === 'number' ? raw.maxDepth : null,
    _gid: raw._gid as string | undefined,
    _gname: raw._gname as string | undefined,
    _gcollapsed: raw._gcollapsed as boolean | undefined,
    _genabled: raw._genabled as boolean | undefined,
    _gidx: raw._gidx as number | undefined,
  };
}

export function toNativeRegex(s: RegexScript): Record<string, unknown> {
  return {
    id: s.id,
    scriptName: s.scriptName,
    findRegex: s.findRegex,
    replaceString: s.replaceString,
    trimStrings: s.trimStrings,
    placement: s.placement,
    disabled: !s.enabled,
    markdownOnly: s.markdownOnly,
    promptOnly: s.promptOnly,
    runOnEdit: s.runOnEdit,
    substituteRegex: s.substituteRegex,
    minDepth: s.minDepth,
    maxDepth: s.maxDepth,
    _gid: s._gid,
    _gname: s._gname,
    _gcollapsed: s._gcollapsed,
    _genabled: s._genabled,
    _gidx: s._gidx,
  };
}

/* ====== tavern_helper 脚本树 ⇄ 干净扁平 Script[] ======
 * 原生顶层是 ScriptTree（Script | ScriptFolder）。干净层是扁平 Script[]：ScriptFolder 折叠成组，
 * 组内脚本挂 _gid=folder.id、_gname=folder.name、_genabled=folder.enabled、_gcollapsed=false；
 * 写回时按 _gid 重新聚成一个 ScriptFolder（icon/color 用默认值）。 */

function fromNativeScript(raw: Record<string, unknown>): Script {
  return {
    enabled: !!raw.enabled,
    name: (raw.name ?? '') as string,
    id: (raw.id ?? '') as string,
    content: (raw.content ?? '') as string,
    info: (raw.info ?? '') as string,
    button: (raw.button ?? { enabled: false, buttons: [] }) as Script['button'],
    data: (raw.data ?? {}) as Script['data'],
    export_with: (raw.export_with ?? { data: true, button: true }) as Script['export_with'],
    _gid: raw._gid as string | undefined,
    _gname: raw._gname as string | undefined,
    _gcollapsed: raw._gcollapsed as boolean | undefined,
    _genabled: raw._genabled as boolean | undefined,
    _gidx: raw._gidx as number | undefined,
  };
}

export function fromNativeScripts(raw: unknown): Script[] {
  if (!Array.isArray(raw)) return [];
  const out: Script[] = [];
  for (const node of raw as Record<string, unknown>[]) {
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'folder') {
      const folder = node as Record<string, unknown>;
      const children = Array.isArray(folder.scripts)
        ? (folder.scripts as Record<string, unknown>[])
        : [];
      children.forEach((child, idx) => {
        out.push({
          ...fromNativeScript(child),
          _gid: (folder.id as string) ?? undefined,
          _gname: (folder.name as string) ?? undefined,
          _genabled: folder.enabled !== false,
          _gcollapsed: false,
          _gidx: idx,
        });
      });
    } else {
      out.push(fromNativeScript(node));
    }
  }
  return out;
}

function toNativeScript(s: Script): Record<string, unknown> {
  return {
    type: 'script',
    enabled: s.enabled,
    name: s.name,
    id: s.id,
    content: s.content,
    info: s.info,
    button: s.button,
    data: s.data,
    export_with: s.export_with,
  };
}

export function toNativeScripts(scripts: Script[]): Record<string, unknown>[] {
  const groups = new Map<string, Script[]>();
  const standalone: Script[] = [];
  for (const s of scripts) {
    if (s._gid) {
      if (!groups.has(s._gid)) groups.set(s._gid, []);
      groups.get(s._gid)!.push(s);
    } else standalone.push(s);
  }
  const out: Record<string, unknown>[] = [];
  for (const [gid, members] of groups) {
    const first = members[0];
    out.push({
      type: 'folder',
      enabled: first._genabled !== false,
      name: first._gname || 'Group',
      id: gid,
      icon: 'default',
      color: 'default',
      scripts: members.map(toNativeScript),
    });
  }
  for (const s of standalone) out.push(toNativeScript(s));
  return out;
}
