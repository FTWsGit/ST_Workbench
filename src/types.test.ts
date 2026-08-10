import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, CHARACTER_FIELDS, type Settings } from './types';

/**
 * 类型层面：把 DEFAULT_SETTINGS 赽给 Settings 接口的反例 union。
 * DEFAULT_SETTINGS 在源码里已用 `Settings` 类型标注，这里再做一次显式断言，
 * 让「漏字段」在编译期就被 catch（DEFAULT_SETTINGS 的 key 必须 ⊇ Settings 的 key）。
 */
type AssertKnownKeys<T extends Settings> = T;
type _AssertDefaultExtendsSettings = AssertKnownKeys<typeof DEFAULT_SETTINGS>;

describe('DEFAULT_SETTINGS 与 Settings 字段对齐', () => {
  /**
   * Settings 接口字段全集（keyof Settings）在编译期被 DEFAULT_SETTINGS 的类型标注覆盖；
   * 运行期用 Object.keys(DEFAULT_SETTINGS) 做全集比对，防止源码给 Settings 加字段后
   * DEFAULT_SETTINGS �漏补（此时 DEFAULT_SETTINGS 的类型标注会先在编译期报错）。
   */
  it('DEFAULT_SETTINGS 的 key 全集等于 Settings 接口的字段全集', () => {
    const defaultKeys = Object.keys(DEFAULT_SETTINGS).sort();
    // Settings 的字段全集由编译期类型系统保证（DEFAULT_SETTINGS: Settings 标注），
    // 运行期断言其与 keyof Settings 的已知全集一致。这里直接列出 Settings 的 17 个字段名
    // 作为对照基准（来自源码 L167-188），防止运行期漏检。
    const settingsFields: Array<keyof Settings> = [
      'editorFontSize',
      'editorFontFamily',
      'syntaxColors',
      'sidebarWidth',
      'varPanelWidth',
      'previewWidth',
      'varPanelFloat',
      'previewMode',
      'toolBoxWidth',
      'toolBoxMode',
      'agentMode',
      'agentWidth',
      'settingsDockWidth',
      'settingsDockFloat',
      'collectionSwitchOpen',
      'language',
      'fabPos',
    ];
    const expected = settingsFields.slice().sort();
    expect(defaultKeys).toEqual(expected);
    // 双向：长度一致 + 内容一致
    expect(defaultKeys.length).toBe(settingsFields.length);
  });

  it('DEFAULT_SETTINGS 被标注为 Settings 类型（编译期保证，运行期再验 key 存在于 Settings）', () => {
    // 运行期：每个 DEFAULT_SETTINGS 的 key 都应当是 Settings 的合法字段名
    const knownSettingsKeys: ReadonlySet<string> = new Set<keyof Settings>([
      'editorFontSize',
      'editorFontFamily',
      'syntaxColors',
      'sidebarWidth',
      'varPanelWidth',
      'previewWidth',
      'varPanelFloat',
      'previewMode',
      'toolBoxWidth',
      'toolBoxMode',
      'agentMode',
      'agentWidth',
      'settingsDockWidth',
      'settingsDockFloat',
      'collectionSwitchOpen',
      'language',
      'fabPos',
    ]);
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      expect(knownSettingsKeys.has(k)).toBe(true);
    }
  });
});

describe('CHARACTER_FIELDS 完整性', () => {
  /**
   * CHARACTER_FIELDS 是 CharacterSidebar.vue 展示用的「大文本框虚拟字段」列表（7 个），
   * 不是 Character 接口的全字段全集。断言其 key 全部是 Character 的合法字段名，
   * 且覆盖 Character 接口中注释标注的「七个大文本框虚拟字段」全集。
   */
  it('CHARACTER_FIELDS 的每个 key 都是 Character 接口的合法字段名', () => {
    const characterKeys: ReadonlySet<string> = new Set<string>([
      'avatar',
      'name',
      'description',
      'scenario',
      'mesExample',
      'personality',
      'systemPrompt',
      'postHistoryInstructions',
      'depthPrompt',
      'greetings',
      'creator',
      'creatorNotes',
      'version',
      'tags',
      'talkativeness',
      'fav',
      'worldbook',
      'extensions',
    ]);
    for (const f of CHARACTER_FIELDS) {
      expect(characterKeys.has(f.key)).toBe(true);
    }
  });

  it('CHARACTER_FIELDS 含 Character 接口注释标注的七个大文本框虚拟字段全集', () => {
    const keys = CHARACTER_FIELDS.map((f) => f.key);
    // 源码注释明确「七个大文本框虚拟字段」：description/systemPrompt/postHistoryInstructions/
    // personality/scenario/depthPrompt/mesExample（见 Character 接口 L458-466 doc）
    const expectedFields = [
      'description',
      'systemPrompt',
      'postHistoryInstructions',
      'personality',
      'scenario',
      'depthPrompt',
      'mesExample',
    ];
    expect(keys.length).toBe(expectedFields.length);
    expect(keys.slice().sort()).toEqual(expectedFields.slice().sort());
  });

  it('CHARACTER_FIELDS 每项 labelKey 都以 character.field. 为前缀', () => {
    for (const f of CHARACTER_FIELDS) {
      expect(f.labelKey.startsWith('character.field.')).toBe(true);
    }
  });
});
