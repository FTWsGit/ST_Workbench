import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useScriptTree } from './useScriptTree';
import type { Script, ScriptTree } from '../types';

function makeScript(id: string): Script {
  return {
    type: 'script',
    enabled: true,
    name: 'n',
    id,
    content: '',
    info: '',
    button: { enabled: false, buttons: [] },
    data: {},
    export_with: { data: true, button: true },
  };
}

describe('useScriptTree - 薄包装委托 useScriptList', () => {
  function setup(scriptsRef: ReturnType<typeof ref<ScriptTree[] | null>>) {
    return useScriptTree(() => scriptsRef.value, {
      markDirty: vi.fn(),
      showToast: vi.fn(),
      t: (key: string) => key,
      loadFirstMessageKey: 'tavern.toast.loadFirst',
      // defaultPlacement 选项未被实现使用，但接口接受
      defaultPlacement: [0],
    });
  }

  it('addScriptTree 创建 Script（type=script, enabled=true, 带默认字段）', () => {
    const scriptsRef = ref<ScriptTree[]>([]);
    const u = setup(scriptsRef);
    const id = u.addScriptTree();
    expect(id).not.toBeNull();
    expect(id?.startsWith('th_')).toBe(true); // idPrefix = 'th_'
    const created = scriptsRef.value[0] as Script;
    expect(created.type).toBe('script');
    expect(created.enabled).toBe(true);
    expect(created.id).toBe(id);
    expect(created.content).toBe('');
    expect(created.button.enabled).toBe(false);
    expect(created.export_with).toEqual({ data: true, button: true });
  });

  it('未加载时 showToast 并返回 null', () => {
    const scriptsRef = ref<ScriptTree[] | null>(null);
    const u = setup(scriptsRef);
    expect(u.addScriptTree()).toBeNull();
  });

  it('deleteScriptTree 按 id 删除', () => {
    const scriptsRef = ref<ScriptTree[]>([makeScript('a'), makeScript('b')]);
    const u = setup(scriptsRef);
    u.deleteScriptTree('a');
    expect(scriptsRef.value.length).toBe(1);
    expect((scriptsRef.value[0] as Script).id).toBe('b');
  });

  it('deleteScriptTree 找不到时静默', () => {
    const scriptsRef = ref<ScriptTree[]>([makeScript('a')]);
    const u = setup(scriptsRef);
    u.deleteScriptTree('no');
    expect(scriptsRef.value.length).toBe(1);
  });

  it('reorderScriptTree 重排', () => {
    const scriptsRef = ref<ScriptTree[]>([makeScript('a'), makeScript('b'), makeScript('c')]);
    const u = setup(scriptsRef);
    u.reorderScriptTree(0, 2, true);
    expect((scriptsRef.value[0] as Script).id).toBe('b');
    expect((scriptsRef.value[1] as Script).id).toBe('c');
    expect((scriptsRef.value[2] as Script).id).toBe('a');
  });

  it('reorderScriptTree 越界守卫', () => {
    const scriptsRef = ref<ScriptTree[]>([makeScript('a')]);
    const u = setup(scriptsRef);
    u.reorderScriptTree(0, 99, true);
    expect((scriptsRef.value[0] as Script).id).toBe('a');
  });

  it('addScriptTree 创建的对象用 t("tavern.sidebar.defaultScriptName") 做 name', () => {
    const scriptsRef = ref<ScriptTree[]>([]);
    const u = useScriptTree(() => scriptsRef.value, {
      markDirty: vi.fn(),
      showToast: vi.fn(),
      t: (key: string) => (key === 'tavern.sidebar.defaultScriptName' ? 'DEFAULT' : key),
    });
    u.addScriptTree();
    expect((scriptsRef.value[0] as Script).name).toBe('DEFAULT');
  });
});
