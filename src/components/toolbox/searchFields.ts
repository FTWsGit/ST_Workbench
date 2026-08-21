import type { SearchField, SearchHit, SearchItemMeta } from '../../lib/search';
import { usePresetStore } from '../../stores/presetStore';
import { useWorldbookStore } from '../../stores/worldbookStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useUiStore } from '../../stores/uiStore';
import {
  CHARACTER_FIELDS,
  REGEX_SUBSTITUTE_OPTIONS,
  WORLDBOOK_POSITION_OPTIONS,
  WORLDBOOK_ROLE_OPTIONS,
  type Character,
  type WorldbookEntry,
} from '../../types';
import './register'; // 注册 Search/Batch 工具到各 scene（幂等）

/** 一个"搜索场景"：当前 (workspace, collection) 下可搜的 items + 字段表 + item 元数据 getter。
 *  items 是各 store 的 live 数据（presetStore.prompts / regexs 等），SearchTool 直接喂给
 *  searchFields 纯函数。getItemMeta 负责把每种 item 各自不同的 id/name 取法统一成 SearchHit 形状。 */
export interface SearchScene {
  items: Record<string, unknown>[];
  fields: SearchField[];
  getItemMeta: SearchItemMeta;
}

/* ====== enum 字段的候选值清单 ======
 * enum 字段命中是整值匹配（String(item[field])===query），替换只能是"改成另一个候选值"——
 * 不能走字符串 replace 输入框（会把布尔/数值字段改坏成不可解析的字符串）。SearchTool 选中 enum 字段时
 * 顶部显示这份候选清单的 toggle，点哪个就把选中命中改成哪个。每项 {value, labelKey}，value 原样回写
 * （保留原类型：number/boolean/null），SearchTool 通过 uiStore.t(labelKey) 显示候选名。 */
export interface EnumChoice {
  value: unknown;
  labelKey: string;
}

const PRESET_ROLE_CHOICES: EnumChoice[] = [
  { value: 'system', labelKey: 'preset.role.system' },
  { value: 'user', labelKey: 'preset.role.user' },
  { value: 'assistant', labelKey: 'preset.role.assistant' },
];

const BOOL_CHOICES: EnumChoice[] = [
  { value: true, labelKey: 'common.on' },
  { value: false, labelKey: 'common.off' },
];

/** 字段 key → 候选值清单。没列出的 enum 字段（如 identifier 自由字符串）按"原值回写"处理——候选清单空时
 *  SearchTool 退化为只读命中展示，不出替换 UI（identifier 这种字段本就不该被批量改）。
 *  'role' 字段在 preset(worldbook) 各自候选不同，由 getEnumChoices() 按 scene 分派，不放进这张裸字典。 */
const ENUM_CHOICES: Record<string, EnumChoice[]> = {
  // regex（preset/character 宿主共用）
  substituteRegex: REGEX_SUBSTITUTE_OPTIONS.map((o) => ({
    value: o.value,
    labelKey: o.labelKey,
  })),
  enabled: BOOL_CHOICES,
  // worldbook/items
  positionType: WORLDBOOK_POSITION_OPTIONS.map((o) => ({
    value: o.value,
    labelKey: o.labelKey,
  })),
  depth: [], // 数值字段，候选太分散——SearchTool 退化为只读
  order: [],
  probability: [],
  strategyType: [
    { value: 'keyword', labelKey: 'worldbook.activation.keyWord' },
    { value: 'constant', labelKey: 'worldbook.activation.constant' },
    { value: 'vectorized', labelKey: 'worldbook.activation.vectorized' },
  ],
};

/** 查某个 enum 字段的候选清单；返回空数组表示该字段无候选 UI（只读展示命中）。
 *  'role' 按 scene 分派：preset/items 是字符串角色三态，worldbook/items 是数值角色（含 null 默认）。 */
export function getEnumChoices(
  workspace: string,
  collection: string,
  fieldKey: string
): EnumChoice[] {
  if (fieldKey === 'role') {
    if (workspace === 'preset' && collection === 'items') return PRESET_ROLE_CHOICES;
    if (workspace === 'worldbook')
      return WORLDBOOK_ROLE_OPTIONS.map((o) => ({
        value: o.value,
        labelKey: o.labelKey,
      }));
    return [];
  }
  return ENUM_CHOICES[fieldKey] ?? [];
}

/* ====== 各 scene 的字段表 ====== */

const PRESET_ITEM_FIELDS: SearchField[] = [
  { key: 'content', labelKey: 'preset.field.content', kind: 'text' },
  { key: 'name', labelKey: 'preset.field.name', kind: 'text' },
  { key: 'role', labelKey: 'preset.field.role', kind: 'enum' },
  { key: 'identifier', labelKey: 'preset.field.identifier', kind: 'enum' },
];

const REGEX_FIELDS: SearchField[] = [
  { key: 'findRegex', labelKey: 'regex.field.findRegex', kind: 'text' },
  { key: 'replaceString', labelKey: 'regex.field.replaceString', kind: 'text' },
  { key: 'name', labelKey: 'regex.field.scriptName', kind: 'text' },
  { key: 'placement', labelKey: 'regex.field.placement', kind: 'list' },
  { key: 'trimStrings', labelKey: 'regex.field.trimStrings', kind: 'list' },
  {
    key: 'substituteRegex',
    labelKey: 'regex.field.substituteRegex',
    kind: 'enum',
  },
  { key: 'enabled', labelKey: 'regex.field.enabled', kind: 'enum' },
];

const WORLDBOOK_FIELDS: SearchField[] = [
  { key: 'content', labelKey: 'worldbook.field.content', kind: 'text' },
  { key: 'name', labelKey: 'worldbook.field.name', kind: 'text' },
  { key: 'keys', labelKey: 'worldbook.field.keys', kind: 'list' },
  { key: 'positionType', labelKey: 'worldbook.field.position', kind: 'enum' },
  { key: 'role', labelKey: 'worldbook.field.role', kind: 'enum' },
  { key: 'depth', labelKey: 'worldbook.field.depth', kind: 'enum' },
  { key: 'order', labelKey: 'worldbook.field.order', kind: 'enum' },
  { key: 'probability', labelKey: 'worldbook.field.probability', kind: 'enum' },
  { key: 'enabled', labelKey: 'worldbook.field.enabled', kind: 'enum' },
  { key: 'strategyType', labelKey: 'worldbook.field.strategyType', kind: 'enum' },
];

/** store 里的严格接口类型数组（无 index signature）→ searchFields 需要的 Record<string, unknown>[]。
 *  纯编译期断言，运行时仍是原数组引用（applyReplace 就地改真实对象）。 */
function toSearchItems<T>(items: T[]): Record<string, unknown>[] {
  return items as unknown as Record<string, unknown>[];
}

/** CHARACTER_FIELDS 里映射到 otherPrompts 的纯文本字段（description 顶层、depthPrompt 复合对象，另行处理）。 */
type OtherPromptTextKey = Exclude<keyof Character['otherPrompts'], 'depthPrompt'>;

/** 按字段 key 读 Character 的纯文本：description 读顶层、depthPrompt 读 otherPrompts.depthPrompt.prompt、
 *  其余读 otherPrompts[key]。与 characterStore.getFieldValue 同一映射。 */
function readCharacterFieldValue(char: Character, key: string): string | null {
  if (key === 'description') return char.description;
  if (key === 'depthPrompt') return char.otherPrompts.depthPrompt.prompt;
  if (!CHARACTER_FIELDS.some((f) => f.key === key)) return null;
  return char.otherPrompts[key as OtherPromptTextKey];
}

/** WorldbookEntry 的嵌套字段摊成一级 key（utils.searchFields 只做 item[field.key] 一级取值）：
 *  strategy.keys→keys、strategy.type→strategyType、position.type→positionType、position.role→role、
 *  position.depth→depth、position.order→order；name/content/enabled/probability 顶层直拷，uid 供定位。
 *  keys 保留 live 数组引用（list 替换就地 mutate 数组元素）。 */
function flattenWorldbookEntry(e: WorldbookEntry): Record<string, unknown> {
  return {
    uid: e.uid,
    name: e.name,
    content: e.content,
    enabled: e.enabled,
    probability: e.probability,
    keys: e.strategy.keys,
    strategyType: e.strategy.type,
    positionType: e.position.type,
    role: e.position.role,
    depth: e.position.depth,
    order: e.position.order,
  };
}

/** 扁平 key → 真实 WorldbookEntry 字段的读取（applyReplace 写回时取原值）。 */
function readWorldbookField(e: WorldbookEntry, key: string): unknown {
  switch (key) {
    case 'name':
      return e.name;
    case 'content':
      return e.content;
    case 'enabled':
      return e.enabled;
    case 'probability':
      return e.probability;
    case 'keys':
      return e.strategy.keys;
    case 'strategyType':
      return e.strategy.type;
    case 'positionType':
      return e.position.type;
    case 'role':
      return e.position.role;
    case 'depth':
      return e.position.depth;
    case 'order':
      return e.position.order;
    default:
      return undefined;
  }
}

/** 扁平 key → 真实 WorldbookEntry 字段的写入（applyReplace 把命中改回真实 entry）。 */
function writeWorldbookField(e: WorldbookEntry, key: string, v: unknown): void {
  switch (key) {
    case 'name':
      e.name = String(v);
      break;
    case 'content':
      e.content = String(v);
      break;
    case 'enabled':
      e.enabled = v === true;
      break;
    case 'probability': {
      const n = Number(v);
      if (!Number.isNaN(n)) e.probability = n;
      break;
    }
    case 'keys':
      e.strategy.keys = Array.isArray(v) ? (v as string[]) : [];
      break;
    case 'strategyType':
      e.strategy.type = v as WorldbookEntry['strategy']['type'];
      break;
    case 'positionType':
      e.position.type = v as WorldbookEntry['position']['type'];
      break;
    case 'role':
      e.position.role =
        v === null || v === '' || v === 'null' ? null : (v as WorldbookEntry['position']['role']);
      break;
    case 'depth': {
      const n = Number(v);
      if (!Number.isNaN(n)) e.position.depth = n;
      break;
    }
    case 'order': {
      const n = Number(v);
      if (!Number.isNaN(n)) e.position.order = n;
      break;
    }
  }
}

/** character/fields：七个大文本框字段（depthPrompt 取 .prompt）逐条展平成 item，greetings 每条开场白
 *  一个 item（用合成 id 拼成虚拟 tab key）。文本字段共用 key 'value'（kind='text'），开场白共用
 *  key 'list'（kind='list'，单元素数组）——getItemMeta 用 item.key（虚拟 tab key）做 id。 */
function getCharacterFieldsScene(store: ReturnType<typeof useCharacterStore>): SearchScene {
  const uiStore = useUiStore();
  const items: Record<string, unknown>[] = [];
  const char = store.character;
  if (char) {
    for (const f of CHARACTER_FIELDS) {
      const value = readCharacterFieldValue(char, f.key);
      if (typeof value !== 'string') continue;
      items.push({ key: 'field:' + f.key, labelKey: f.labelKey, value });
    }
    char.greetings.forEach((g, i) => {
      const gid = store.greetingIds[i];
      if (gid)
        items.push({
          key: 'field:greeting:' + gid,
          labelKey: 'character.sidebar.greetingsLabel',
          list: [g],
        });
    });
  }
  const fields: SearchField[] = CHARACTER_FIELDS.map((f) => ({
    key: 'value',
    labelKey: f.labelKey,
    kind: 'text' as const,
  }));
  fields.push({
    key: 'list',
    labelKey: 'character.sidebar.greetingsLabel',
    kind: 'list',
  });
  return {
    items,
    fields,
    getItemMeta: (item) => ({ id: item.key, name: uiStore.t(item.labelKey) }),
  };
}

/** 按 (workspace, collection) 返回当前 scene 的 items + 字段表 + meta getter。 */
export function getSearchScene(workspace: string, collection: string): SearchScene {
  if (workspace === 'preset') {
    const store = usePresetStore();
    if (collection === 'regex') {
      return {
        items: toSearchItems(store.regexs),
        fields: REGEX_FIELDS,
        getItemMeta: (r) => ({ id: r.id, name: r.name || r.id }),
      };
    }
    return {
      items: toSearchItems(store.prompts.filter((b) => !b.hidden)),
      fields: PRESET_ITEM_FIELDS,
      getItemMeta: (b) => ({ id: b.identifier, name: b.name || b.identifier }),
    };
  }
  if (workspace === 'worldbook') {
    const store = useWorldbookStore();
    return {
      items: store.entries.map(flattenWorldbookEntry),
      fields: WORLDBOOK_FIELDS,
      getItemMeta: (e) => ({
        id: String(e.uid),
        name: String(e.name) || String(e.uid),
      }),
    };
  }
  const store = useCharacterStore();
  if (collection === 'regex') {
    return {
      items: toSearchItems(store.regexs),
      fields: REGEX_FIELDS,
      getItemMeta: (r) => ({ id: r.id, name: r.name || r.id }),
    };
  }
  return getCharacterFieldsScene(store);
}

/* ====== 跳到命中 / 替换 ====== */

/** 把一条命中转发到对应 store 的 jumpToFieldHit（preset 含正则脚本宿主，worldbook/character 各自实现）。 */
export function jumpToFieldHit(workspace: string, hit: SearchHit): void {
  if (workspace === 'preset')
    usePresetStore().jumpToFieldHit(hit.itemId, hit.fieldKey, hit.line, hit.col, hit.ml);
  else if (workspace === 'worldbook')
    useWorldbookStore().jumpToFieldHit(hit.itemId, hit.fieldKey, hit.line, hit.col, hit.ml);
  else useCharacterStore().jumpToFieldHit(hit.itemId, hit.fieldKey, hit.line, hit.col, hit.ml);
}

function spliceText(text: string, line: number, col: number, len: number, newText: string): string {
  if (line < 0) return newText; // enum 型整值替换
  const lines = text.split('\n');
  const li = Math.max(0, Math.min(line, lines.length - 1));
  const l = lines[li] ?? '';
  const c = Math.max(0, Math.min(col, l.length));
  lines[li] = l.substring(0, c) + newText + l.substring(c + len);
  return lines.join('\n');
}

function spliceStr(s: string, col: number, len: number, newText: string): string {
  const c = Math.max(0, Math.min(col, s.length));
  return s.substring(0, c) + newText + s.substring(c + len);
}

/** 替换结果按原字段类型回写：数字字段解析 Number，布尔字段按 'true'/'false'，其余当字符串。 */
function coerceValue(v: string, original: unknown): unknown {
  if (typeof original === 'number') {
    const n = Number(v);
    return Number.isNaN(n) ? original : n;
  }
  if (typeof original === 'boolean') return v === 'true' ? true : v === 'false' ? false : original;
  return v;
}

function sceneMarkDirty(workspace: string): () => void {
  if (workspace === 'preset') return usePresetStore().markDirty;
  if (workspace === 'worldbook') return useWorldbookStore().markDirty;
  return useCharacterStore().markDirty;
}

/** 在某个 scene 的一条命中上执行替换：按 scene 派到对应 store 的修改方式 + markDirty + jumpToFieldHit。
 *  调方（SearchTool.vue）事后重新搜。character/fields 走"开标签 + setCurrentFieldValue"（store 内部已
 *  markDirty）；其余 scene 的 item 就是 store 里的真实对象，直接改字段再显式 markDirty。 */
export function applyReplace(
  workspace: string,
  collection: string,
  scene: SearchScene,
  hit: SearchHit,
  newText: string
): void {
  const field = scene.fields.find((f) => f.key === hit.fieldKey);
  const item = scene.items.find(
    (it) => scene.getItemMeta(it as Parameters<SearchItemMeta>[0]).id === hit.itemId
  );
  if (!field || !item) return;

  if (workspace === 'character' && collection === 'fields') {
    const store = useCharacterStore();
    store.jumpToFieldHit(hit.itemId, hit.fieldKey, hit.line, hit.col, hit.ml);
    const current = store.currentField?.value ?? '';
    const newVal =
      field.kind === 'list'
        ? spliceStr(current, hit.col, hit.ml, newText)
        : spliceText(current, hit.line, hit.col, hit.ml, newText);
    store.setCurrentFieldValue(newVal);
    return;
  }

  // worldbook：items 是扁平副本（flattenWorldbookEntry），嵌套字段在真实 entry 上，需经 writeWorldbookField 写回。
  if (workspace === 'worldbook') {
    const entry = useWorldbookStore().entries.find((e) => String(e.uid) === hit.itemId);
    if (!entry) return;
    if (field.kind === 'list') {
      const arr = entry.strategy.keys;
      if (hit.line >= 0 && hit.line < arr.length) {
        const el = String(arr[hit.line] ?? '');
        arr[hit.line] = coerceValue(
          spliceStr(el, hit.col, hit.ml, newText),
          arr[hit.line]
        ) as string;
      }
    } else if (field.kind === 'enum') {
      writeWorldbookField(
        entry,
        field.key,
        coerceValue(newText, readWorldbookField(entry, field.key))
      );
    } else {
      writeWorldbookField(
        entry,
        field.key,
        spliceText(
          String(readWorldbookField(entry, field.key) ?? ''),
          hit.line,
          hit.col,
          hit.ml,
          newText
        )
      );
    }
    sceneMarkDirty(workspace)();
    jumpToFieldHit(workspace, hit);
    return;
  }

  if (field.kind === 'list') {
    const arr = item[field.key];
    if (Array.isArray(arr) && hit.line >= 0 && hit.line < arr.length) {
      const el = String(arr[hit.line] ?? '');
      arr[hit.line] = coerceValue(spliceStr(el, hit.col, hit.ml, newText), arr[hit.line]);
    }
  } else if (field.kind === 'enum') {
    item[field.key] = coerceValue(newText, item[field.key]);
  } else {
    item[field.key] = spliceText(String(item[field.key] ?? ''), hit.line, hit.col, hit.ml, newText);
  }
  sceneMarkDirty(workspace)();
  jumpToFieldHit(workspace, hit);
}
