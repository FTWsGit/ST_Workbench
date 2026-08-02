import type { SearchField, SearchHit, SearchItemMeta } from '../../utils'
import { usePresetStore } from '../../stores/presetStore'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useCharacterStore } from '../../stores/characterStore'
import { useUiStore } from '../../stores/uiStore'
import { CHARACTER_FIELDS, REGEX_SUBSTITUTE_OPTIONS, WORLDBOOK_POSITION_OPTIONS, WORLDBOOK_ROLE_OPTIONS } from '../../types'
import './register' // 注册 Search/Batch 工具到各 scene（幂等）

/** 一个"搜索场景"：当前 (workspace, collection) 下可搜的 items + 字段表 + item 元数据 getter。
 *  items 是各 store 的 live 数据（presetStore.prompts / regexScripts 等），SearchTool 直接喂给
 *  searchFields 纯函数。getItemMeta 负责把每种 item 各自不同的 id/name 取法统一成 SearchHit 形状。 */
export interface SearchScene {
  items: any[]
  fields: SearchField[]
  getItemMeta: SearchItemMeta
}

/* ====== enum 字段的候选值清单 ======
 * enum 字段命中是整值匹配（String(item[field])===query），替换只能是"改成另一个候选值"——
 * 不能走字符串 replace 输入框（会把布尔/数值字段改坏成不可解析的字符串）。SearchTool 选中 enum 字段时
 * 顶部显示这份候选清单的 toggle，点哪个就把选中命中改成哪个。每项 {value, labelKey}，value 原样回写
 * （保留原类型：number/boolean/null），SearchTool 通过 uiStore.t(labelKey) 显示候选名。 */
export interface EnumChoice { value: any; labelKey: string }

const PRESET_ROLE_CHOICES: EnumChoice[] = [
  { value: 'system', labelKey: 'preset.role.system' },
  { value: 'user', labelKey: 'preset.role.user' },
  { value: 'assistant', labelKey: 'preset.role.assistant' },
]

const BOOL_CHOICES: EnumChoice[] = [
  { value: true, labelKey: 'common.on' },
  { value: false, labelKey: 'common.off' },
]

/** 字段 key → 候选值清单。没列出的 enum 字段（如 identifier 自由字符串）按"原值回写"处理——候选清单空时
 *  SearchTool 退化为只读命中展示，不出替换 UI（identifier 这种字段本就不该被批量改）。
 *  'role' 字段在 preset(worldbook) 各自候选不同，由 getEnumChoices() 按 scene 分派，不放进这张裸字典。 */
const ENUM_CHOICES: Record<string, EnumChoice[]> = {
  // regex（preset/character 宿主共用）
  'substituteRegex': REGEX_SUBSTITUTE_OPTIONS.map(o => ({ value: o.value, labelKey: o.labelKey })),
  'disabled': BOOL_CHOICES,
  // worldbook/items
  'position': WORLDBOOK_POSITION_OPTIONS.map(o => ({ value: o.value, labelKey: o.labelKey })),
  'depth': [], // 数值字段，候选太分散——SearchTool 退化为只读
  'order': [],
  'probability': [],
  'constant': BOOL_CHOICES,
  'keyWord': BOOL_CHOICES,
  'vectorized': BOOL_CHOICES,
}

/** 查某个 enum 字段的候选清单；返回空数组表示该字段无候选 UI（只读展示命中）。
 *  'role' 按 scene 分派：preset/items 是字符串角色三态，worldbook/items 是数值角色（含 null 默认）。 */
export function getEnumChoices(workspace: string, collection: string, fieldKey: string): EnumChoice[] {
  if (fieldKey === 'role') {
    if (workspace === 'preset' && collection === 'items') return PRESET_ROLE_CHOICES
    if (workspace === 'worldbook') return WORLDBOOK_ROLE_OPTIONS.map(o => ({ value: o.value, labelKey: o.labelKey }))
    return []
  }
  return ENUM_CHOICES[fieldKey] ?? []
}

/* ====== 各 scene 的字段表 ====== */

const PRESET_ITEM_FIELDS: SearchField[] = [
  { key: 'content', labelKey: 'preset.field.content', kind: 'text' },
  { key: 'name', labelKey: 'preset.field.name', kind: 'text' },
  { key: 'role', labelKey: 'preset.field.role', kind: 'enum' },
  { key: 'identifier', labelKey: 'preset.field.identifier', kind: 'enum' },
]

const REGEX_FIELDS: SearchField[] = [
  { key: 'findRegex', labelKey: 'regex.field.findRegex', kind: 'text' },
  { key: 'replaceString', labelKey: 'regex.field.replaceString', kind: 'text' },
  { key: 'scriptName', labelKey: 'regex.field.scriptName', kind: 'text' },
  { key: 'placement', labelKey: 'regex.field.placement', kind: 'list' },
  { key: 'trimStrings', labelKey: 'regex.field.trimStrings', kind: 'list' },
  { key: 'substituteRegex', labelKey: 'regex.field.substituteRegex', kind: 'enum' },
  { key: 'disabled', labelKey: 'regex.field.disabled', kind: 'enum' },
]

const WORLDBOOK_FIELDS: SearchField[] = [
  { key: 'content', labelKey: 'worldbook.field.content', kind: 'text' },
  { key: 'comment', labelKey: 'worldbook.field.comment', kind: 'text' },
  { key: 'keys', labelKey: 'worldbook.field.keys', kind: 'list' },
  { key: 'keysecondary', labelKey: 'worldbook.field.keysecondary', kind: 'list' },
  { key: 'group', labelKey: 'worldbook.field.group', kind: 'text' },
  { key: 'position', labelKey: 'worldbook.field.position', kind: 'enum' },
  { key: 'role', labelKey: 'worldbook.field.role', kind: 'enum' },
  { key: 'depth', labelKey: 'worldbook.field.depth', kind: 'enum' },
  { key: 'order', labelKey: 'worldbook.field.order', kind: 'enum' },
  { key: 'probability', labelKey: 'worldbook.field.probability', kind: 'enum' },
  { key: 'disabled', labelKey: 'worldbook.field.disabled', kind: 'enum' },
  { key: 'constant', labelKey: 'worldbook.field.constant', kind: 'enum' },
  { key: 'keyWord', labelKey: 'worldbook.field.keyWord', kind: 'enum' },
  { key: 'vectorized', labelKey: 'worldbook.field.vectorized', kind: 'enum' },
]

/** character/fields：七个大文本框字段（depthPrompt 取 .prompt）逐条展平成 item，greetings 每条开场白
 *  一个 item（用合成 id 拼成虚拟 tab key）。文本字段共用 key 'value'（kind='text'），开场白共用
 *  key 'list'（kind='list'，单元素数组）——getItemMeta 用 item.key（虚拟 tab key）做 id。 */
function getCharacterFieldsScene(store: ReturnType<typeof useCharacterStore>): SearchScene {
  const uiStore = useUiStore()
  const items: any[] = []
  const char = store.character
  if (char) {
    for (const f of CHARACTER_FIELDS) {
      const value = f.key === 'depthPrompt' ? char.depthPrompt.prompt : (char as any)[f.key]
      if (typeof value !== 'string') continue
      items.push({ key: 'field:' + f.key, labelKey: f.labelKey, value })
    }
    char.greetings.forEach((g, i) => {
      const gid = store.greetingIds[i]
      if (gid) items.push({ key: 'field:greeting:' + gid, labelKey: 'character.sidebar.greetingsLabel', list: [g] })
    })
  }
  const fields: SearchField[] = CHARACTER_FIELDS.map(f => ({ key: 'value', labelKey: f.labelKey, kind: 'text' as const }))
  fields.push({ key: 'list', labelKey: 'character.sidebar.greetingsLabel', kind: 'list' })
  return {
    items,
    fields,
    getItemMeta: (item) => ({ id: item.key, name: uiStore.t(item.labelKey) }),
  }
}

/** 按 (workspace, collection) 返回当前 scene 的 items + 字段表 + meta getter。 */
export function getSearchScene(workspace: string, collection: string): SearchScene {
  if (workspace === 'preset') {
    const store = usePresetStore()
    if (collection === 'regex') {
      return {
        items: store.regexScripts,
        fields: REGEX_FIELDS,
        getItemMeta: (r) => ({ id: r.id, name: r.scriptName || r.id }),
      }
    }
    return {
      items: store.prompts,
      fields: PRESET_ITEM_FIELDS,
      getItemMeta: (b) => ({ id: b.identifier, name: b.name || b.identifier }),
    }
  }
  if (workspace === 'worldbook') {
    const store = useWorldbookStore()
    return {
      items: store.entries,
      fields: WORLDBOOK_FIELDS,
      getItemMeta: (e) => ({ id: String(e.uid), name: e.comment || String(e.uid) }),
    }
  }
  const store = useCharacterStore()
  if (collection === 'regex') {
    return {
      items: store.regexScripts,
      fields: REGEX_FIELDS,
      getItemMeta: (r) => ({ id: r.id, name: r.scriptName || r.id }),
    }
  }
  return getCharacterFieldsScene(store)
}

/* ====== 跳到命中 / 替换 ====== */

/** 把一条命中转发到对应 store 的 jumpToFieldHit（preset 含正则脚本宿主，worldbook/character 各自实现）。 */
export function jumpToFieldHit(workspace: string, hit: SearchHit): void {
  if (workspace === 'preset') usePresetStore().jumpToFieldHit(hit.itemId, hit.fieldKey, hit.line, hit.col, hit.ml)
  else if (workspace === 'worldbook') useWorldbookStore().jumpToFieldHit(hit.itemId, hit.fieldKey, hit.line, hit.col, hit.ml)
  else useCharacterStore().jumpToFieldHit(hit.itemId, hit.fieldKey, hit.line, hit.col, hit.ml)
}

function spliceText(text: string, line: number, col: number, len: number, newText: string): string {
  if (line < 0) return newText // enum 型整值替换
  const lines = text.split('\n')
  const li = Math.max(0, Math.min(line, lines.length - 1))
  const l = lines[li] ?? ''
  const c = Math.max(0, Math.min(col, l.length))
  lines[li] = l.substring(0, c) + newText + l.substring(c + len)
  return lines.join('\n')
}

function spliceStr(s: string, col: number, len: number, newText: string): string {
  const c = Math.max(0, Math.min(col, s.length))
  return s.substring(0, c) + newText + s.substring(c + len)
}

/** 替换结果按原字段类型回写：数字字段解析 Number，布尔字段按 'true'/'false'，其余当字符串。 */
function coerceValue(v: string, original: any): any {
  if (typeof original === 'number') { const n = Number(v); return Number.isNaN(n) ? original : n }
  if (typeof original === 'boolean') return v === 'true' ? true : v === 'false' ? false : original
  return v
}

function sceneMarkDirty(workspace: string): () => void {
  if (workspace === 'preset') return usePresetStore().markDirty
  if (workspace === 'worldbook') return useWorldbookStore().markDirty
  return useCharacterStore().markDirty
}

/** 在某个 scene 的一条命中上执行替换：按 scene 派到对应 store 的修改方式 + markDirty + jumpToFieldHit。
 *  调方（SearchTool.vue）事后重新搜。character/fields 走"开标签 + setCurrentFieldValue"（store 内部已
 *  markDirty）；其余 scene 的 item 就是 store 里的真实对象，直接改字段再显式 markDirty。 */
export function applyReplace(
  workspace: string,
  collection: string,
  scene: SearchScene,
  hit: SearchHit,
  newText: string,
): void {
  const field = scene.fields.find(f => f.key === hit.fieldKey)
  const item = scene.items.find(it => scene.getItemMeta(it).id === hit.itemId)
  if (!field || !item) return

  if (workspace === 'character' && collection === 'fields') {
    const store = useCharacterStore()
    store.jumpToFieldHit(hit.itemId, hit.fieldKey, hit.line, hit.col, hit.ml)
    const current = store.currentField?.value ?? ''
    const newVal = field.kind === 'list'
      ? spliceStr(current, hit.col, hit.ml, newText)
      : spliceText(current, hit.line, hit.col, hit.ml, newText)
    store.setCurrentFieldValue(newVal)
    return
  }

  if (field.kind === 'list') {
    const arr = item[field.key]
    if (Array.isArray(arr) && hit.line >= 0 && hit.line < arr.length) {
      const el = String(arr[hit.line] ?? '')
      arr[hit.line] = coerceValue(spliceStr(el, hit.col, hit.ml, newText), arr[hit.line])
    }
  } else if (field.kind === 'enum') {
    item[field.key] = coerceValue(newText, item[field.key])
  } else {
    item[field.key] = spliceText(String(item[field.key] ?? ''), hit.line, hit.col, hit.ml, newText)
  }
  sceneMarkDirty(workspace)()
  jumpToFieldHit(workspace, hit)
}
