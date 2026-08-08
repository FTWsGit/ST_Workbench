import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

/**
 * workspaceRegistry 内部调 usePresetStore()/useWorldbookStore()/useCharacterStore() 取实例。
 * 这里 mock 这三个 store 为纯 stub 对象，只暴露 registry 实际调用的字段/方法，
 * 验证 registry 的转接映射是否正确。
 */
const presetStub = {
  presetName: 'MyPreset',
  dirty: false,
  switchPreset: vi.fn(),
  reloadPreset: vi.fn(),
  doSavePreset: vi.fn(),
  createPreset: vi.fn(),
  removeCurrentPreset: vi.fn(),
};
const worldbookStub = {
  worldbookName: 'MyWB',
  dirty: false,
  switchWorldbook: vi.fn(),
  reloadWorldbook: vi.fn(),
  doSaveWorldbook: vi.fn(),
  createNewWorldbook: vi.fn(),
  removeCurrentWorldbook: vi.fn(),
};
const characterStub = {
  character: { avatar: 'a.png', name: 'Hero' },
  dirty: false,
  characterList: [
    { avatar: 'a.png', name: 'Hero' },
    { avatar: 'b.png', name: 'Villain' },
  ],
  switchCharacter: vi.fn(),
  reloadCharacter: vi.fn(),
  doSaveCharacter: vi.fn(),
  createNewCharacter: vi.fn(),
  removeCurrentCharacter: vi.fn(),
};

vi.mock('../stores/presetStore', () => ({
  usePresetStore: () => presetStub,
}));
vi.mock('../stores/worldbookStore', () => ({
  useWorldbookStore: () => worldbookStub,
}));
vi.mock('../stores/characterStore', () => ({
  useCharacterStore: () => characterStub,
}));

import { createWorkspaceRegistry } from './workspaceRegistry';

describe('workspaceRegistry - createWorkspaceRegistry', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // 重置 stub 状态（dirty / character 等可能在测试中被改）
    presetStub.presetName = 'MyPreset';
    presetStub.dirty = false;
    worldbookStub.worldbookName = 'MyWB';
    worldbookStub.dirty = false;
    characterStub.character = { avatar: 'a.png', name: 'Hero' };
    characterStub.dirty = false;
  });

  it('返回三个 workspace 的 adapter', () => {
    const r = createWorkspaceRegistry();
    expect(r.preset.key).toBe('preset');
    expect(r.worldbook.key).toBe('worldbook');
    expect(r.character.key).toBe('character');
  });

  describe('preset adapter', () => {
    it('dirty / currentLabel / currentId / labelForId', () => {
      const r = createWorkspaceRegistry();
      expect(r.preset.dirty()).toBe(false);
      expect(r.preset.currentLabel()).toBe('MyPreset');
      expect(r.preset.currentId()).toBe('MyPreset');
      expect(r.preset.labelForId('foo')).toBe('foo');
      // 兜底 '—'
      presetStub.presetName = '';
      expect(r.preset.currentLabel()).toBe('—');
    });

    it('switchTo/reload/save/create/remove 转接对应方法', () => {
      const r = createWorkspaceRegistry();
      r.preset.switchTo('p2');
      expect(presetStub.switchPreset).toHaveBeenCalledWith('p2');
      r.preset.reload();
      expect(presetStub.reloadPreset).toHaveBeenCalledOnce();
      r.preset.save();
      expect(presetStub.doSavePreset).toHaveBeenCalledOnce();
      r.preset.create('newP');
      expect(presetStub.createPreset).toHaveBeenCalledWith('newP');
      r.preset.remove();
      expect(presetStub.removeCurrentPreset).toHaveBeenCalledOnce();
    });

    it('无 confirmCreateIfDirty', () => {
      expect(createWorkspaceRegistry().preset.confirmCreateIfDirty).toBeUndefined();
    });
  });

  describe('worldbook adapter', () => {
    it('dirty / currentLabel / currentId / labelForId', () => {
      const r = createWorkspaceRegistry();
      expect(r.worldbook.dirty()).toBe(false);
      expect(r.worldbook.currentLabel()).toBe('MyWB');
      expect(r.worldbook.currentId()).toBe('MyWB');
      expect(r.worldbook.labelForId('foo')).toBe('foo');
      worldbookStub.worldbookName = '';
      expect(r.worldbook.currentLabel()).toBe('—');
    });

    it('switchTo/reload/save/create/remove 转接', () => {
      const r = createWorkspaceRegistry();
      r.worldbook.switchTo('w2');
      expect(worldbookStub.switchWorldbook).toHaveBeenCalledWith('w2');
      r.worldbook.reload();
      expect(worldbookStub.reloadWorldbook).toHaveBeenCalledOnce();
      r.worldbook.save();
      expect(worldbookStub.doSaveWorldbook).toHaveBeenCalledOnce();
      r.worldbook.create('newW');
      expect(worldbookStub.createNewWorldbook).toHaveBeenCalledWith('newW');
      r.worldbook.remove();
      expect(worldbookStub.removeCurrentWorldbook).toHaveBeenCalledOnce();
    });

    it('无 confirmCreateIfDirty', () => {
      expect(createWorkspaceRegistry().worldbook.confirmCreateIfDirty).toBeUndefined();
    });
  });

  describe('character adapter', () => {
    it('dirty / currentLabel / currentId', () => {
      const r = createWorkspaceRegistry();
      expect(r.character.dirty()).toBe(false);
      expect(r.character.currentLabel()).toBe('Hero');
      expect(r.character.currentId()).toBe('a.png');
      characterStub.character = null as unknown as { avatar: string; name: string };
      expect(r.character.currentLabel()).toBe('—');
      expect(r.character.currentId()).toBe('');
    });

    it('labelForId 反查 characterList.name，无则原样返回 id', () => {
      const r = createWorkspaceRegistry();
      expect(r.character.labelForId('a.png')).toBe('Hero');
      expect(r.character.labelForId('b.png')).toBe('Villain');
      expect(r.character.labelForId('unknown.png')).toBe('unknown.png');
    });

    it('switchTo/reload/save/create/remove 转接', () => {
      const r = createWorkspaceRegistry();
      r.character.switchTo('a.png');
      expect(characterStub.switchCharacter).toHaveBeenCalledWith('a.png');
      r.character.reload();
      expect(characterStub.reloadCharacter).toHaveBeenCalledOnce();
      r.character.save();
      expect(characterStub.doSaveCharacter).toHaveBeenCalledOnce();
      r.character.create('NewChar');
      expect(characterStub.createNewCharacter).toHaveBeenCalledWith('NewChar');
      r.character.remove();
      expect(characterStub.removeCurrentCharacter).toHaveBeenCalledOnce();
    });

    it('有 confirmCreateIfDirty 且 messageKey 正确', () => {
      const r = createWorkspaceRegistry();
      expect(r.character.confirmCreateIfDirty).toEqual({
        messageKey: 'character.confirm.newCharacter.message',
      });
    });
  });

  it('dirty 是函数每次调取最新值', () => {
    const r = createWorkspaceRegistry();
    presetStub.dirty = true;
    expect(r.preset.dirty()).toBe(true);
  });
});
