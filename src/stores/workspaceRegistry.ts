import { usePresetStore } from './presetStore'
import { useWorldbookStore } from './worldbookStore'
import { useCharacterStore } from './characterStore'

/** 【2026-07 App.vue 瘦身第3步】preset/worldbook/character 三个 domain store 各自的
 *  新建/删除/切换/重载/保存方法，命名早就已经是同一套形状了（`switchXxx(id)`/`reloadXxx()`/
 *  `doSaveXxx()`/`removeCurrentXxx()`，只有 create 系的名字稍微不齐——`createPreset` vs
 *  `createNewWorldbook`/`createNewCharacter`），i18n key 也早就是 `${workspace}.confirm.switch.
 *  title` 这种可以拼出来的规律（见 i18n/locales/*.ts）。真正不一样的，只有"switch 确认弹窗里
 *  显示的名字要不要额外查一次列表"（character 用 avatar 当 id，需要反查 name）和"新建前要不要
 *  多一次脏检查确认"（character 新建会整个替换 character.value，preset/worldbook 新建只是往
 *  列表里加一项，不影响当前正编辑的那份）这两点——都在下面 confirmCreateIfDirty/labelForId 里
 *  显式声明出来，不是靠 App.vue 里的 if 分支硬编码猜。
 *
 *  这里刻意不去改三个 store 内部的函数名——它们已经在别的组件里各自被直接调用（比如
 *  PresetSidebar.vue 里也会调 presetStore 的方法），把内部实现名跟这张表的对外形状统一，
 *  只需要在这一层包一次转接，不需要牵动三个 store 文件和它们的既有调用点，风险小得多。 */
export interface DocumentWorkspaceAdapter {
  key: 'preset' | 'worldbook' | 'character'
  dirty: () => boolean
  /** 确认弹窗/关闭面板提示里显示的"当前是哪一份"。 */
  currentLabel: () => string
  /** <select> 当前选中值应该等于的 id——preset/worldbook 直接用名字；character 用 avatar 文件名
   *  （角色卡允许重名，avatar 才是真正唯一标识）。 */
  currentId: () => string
  /** 把 <select> 里某个候选值的 id 转成人类可读的名字，用于切换确认弹窗——preset/worldbook 的
   *  id 本身就是名字，直接原样返回；character 的 id 是 avatar，要去 characterList 里反查一次。 */
  labelForId: (id: string) => string
  switchTo: (id: string) => void
  reload: () => void
  save: () => void
  create: (name: string) => void
  remove: () => void
  /** 只有 character 需要：新建前如果当前工作区脏，先弹一次"会丢弃当前改动"的二次确认，标题固定
   *  用 shared.confirm.unsaved.title，消息文案是 workspace 自己的 i18n key（因为不同 workspace
   *  丢弃的东西不一样，没法共用一句话）。 */
  confirmCreateIfDirty?: { messageKey: string }
}

export function createWorkspaceRegistry(): Record<'preset' | 'worldbook' | 'character', DocumentWorkspaceAdapter> {
  const preset = usePresetStore()
  const worldbook = useWorldbookStore()
  const character = useCharacterStore()

  return {
    preset: {
      key: 'preset',
      dirty: () => preset.dirty,
      currentLabel: () => preset.presetName || '—',
      currentId: () => preset.presetName,
      labelForId: (id) => id,
      switchTo: (id) => preset.switchPreset(id),
      reload: () => preset.reloadPreset(),
      save: () => preset.doSavePreset(),
      create: (name) => preset.createPreset(name),
      remove: () => preset.removeCurrentPreset(),
    },
    worldbook: {
      key: 'worldbook',
      dirty: () => worldbook.dirty,
      currentLabel: () => worldbook.worldbookName || '—',
      currentId: () => worldbook.worldbookName,
      labelForId: (id) => id,
      switchTo: (id) => worldbook.switchWorldbook(id),
      reload: () => worldbook.reloadWorldbook(),
      save: () => worldbook.doSaveWorldbook(),
      create: (name) => worldbook.createNewWorldbook(name),
      remove: () => worldbook.removeCurrentWorldbook(),
    },
    character: {
      key: 'character',
      dirty: () => character.dirty,
      currentLabel: () => character.character?.name || '—',
      currentId: () => character.character?.avatar || '',
      labelForId: (id) => character.characterList.find(c => c.avatar === id)?.name || id,
      switchTo: (id) => character.switchCharacter(id),
      reload: () => character.reloadCharacter(),
      save: () => character.doSaveCharacter(),
      create: (name) => character.createNewCharacter(name),
      remove: () => character.removeCurrentCharacter(),
      confirmCreateIfDirty: { messageKey: 'character.confirm.newCharacter.message' },
    },
  }
}
