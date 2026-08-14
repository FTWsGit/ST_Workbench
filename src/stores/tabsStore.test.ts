import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTabsStore } from './tabsStore';
import type { OpenTab } from './tabsStore';

function tab(domain: string, key: string, workspace: string, label = key): OpenTab {
  return {
    domain: domain as OpenTab['domain'],
    key,
    label,
    workspace: workspace as OpenTab['workspace'],
  };
}

describe('tabsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('tabId 生成', () => {
    it('open 后 activeId = domain:key', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'p1', 'preset'));
      expect(s.activeId).toBe('preset:p1');
    });
  });

  describe('open', () => {
    it('新建 tab：push 进 tabs', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'p1', 'preset', 'Label1'));
      expect(s.tabs.length).toBe(1);
      expect(s.tabs[0].label).toBe('Label1');
    });

    it('已存在同 id：只刷新 label，不重复插入', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'p1', 'preset', 'Old'));
      s.open(tab('preset', 'p1', 'preset', 'New'));
      expect(s.tabs.length).toBe(1);
      expect(s.tabs[0].label).toBe('New');
    });

    it('焦点写进 tab 自己的 workspace 名下', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'p1', 'character'));
      // 当前 activeWorkspace 默认 preset，但 activeId 走 character workspace
      s.setActiveWorkspace('character');
      expect(s.activeId).toBe('preset:p1');
    });

    it('跨 domain 允许同 key', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'same', 'preset'));
      s.open(tab('character', 'same', 'character'));
      expect(s.tabs.length).toBe(2);
    });
  });

  describe('close', () => {
    it('按 id 找到并删除', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'p1', 'preset'));
      s.close('preset', 'p1');
      expect(s.tabs.length).toBe(0);
    });

    it('找不到时静默 return', () => {
      const s = useTabsStore();
      s.close('no', 'no');
      expect(s.tabs.length).toBe(0);
    });

    it('关闭激活 tab 时在同 workspace 找相邻项接棒', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.open(tab('preset', 'b', 'preset'));
      s.open(tab('preset', 'c', 'preset'));
      // active = c
      s.close('preset', 'c');
      expect(s.activeId).toBe('preset:b'); // fallback 取下一个优先，无则上一个
    });

    it('关闭唯一 tab 时 activeId 置 null', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.close('preset', 'a');
      expect(s.activeId).toBeNull();
    });

    it('不影响其他 workspace 的 activeId', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.open(tab('character', 'c1', 'character'));
      s.close('preset', 'a');
      // character workspace 的 active 不变
      s.setActiveWorkspace('character');
      expect(s.activeId).toBe('character:c1');
    });
  });

  describe('closeAll', () => {
    it('清空全部 tabs 与 activeId', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.open(tab('character', 'c', 'character'));
      s.closeAll();
      expect(s.tabs.length).toBe(0);
      expect(s.activeId).toBeNull();
      s.setActiveWorkspace('character');
      expect(s.activeId).toBeNull();
    });
  });

  describe('closeDomain', () => {
    it('只关该 domain 的 tabs，不影响其他 domain', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.open(tab('preset', 'b', 'preset'));
      s.open(tab('character', 'c', 'character'));
      s.closeDomain('preset');
      expect(s.tabs.length).toBe(1);
      expect(s.tabs[0].domain).toBe('character');
    });

    it('若该 domain 的 tab 是某 workspace 的激活项，切到同 workspace 剩余第一个', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.open(tab('character', 'c1', 'character'));
      s.open(tab('character', 'c2', 'character'));
      // preset workspace active = a
      s.closeDomain('preset');
      s.setActiveWorkspace('preset');
      expect(s.activeId).toBeNull(); // preset workspace 无剩余 tab
    });
  });

  describe('closeWorkspace', () => {
    it('只关该 workspace 的 tabs', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.open(tab('character', 'c', 'character'));
      s.closeWorkspace('preset');
      expect(s.tabs.length).toBe(1);
      expect(s.tabs[0].workspace).toBe('character');
    });

    it('该 workspace 的 activeId置空', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.closeWorkspace('preset');
      expect(s.activeId).toBeNull();
    });
  });

  describe('focus', () => {
    it('找到 tab 时写 activeId 到该 tab 的 workspace 名下', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.open(tab('preset', 'b', 'preset'));
      s.focus('preset', 'a');
      expect(s.activeId).toBe('preset:a');
    });

    it('找不到时静默 no-op', () => {
      const s = useTabsStore();
      s.focus('no', 'no');
      // 不报错
    });
  });

  describe('isOpen', () => {
    it('按 domain+key 判存在', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      expect(s.isOpen('preset', 'a')).toBe(true);
      expect(s.isOpen('preset', 'b')).toBe(false);
      expect(s.isOpen('character', 'a')).toBe(false);
    });
  });

  describe('tabsInActiveWorkspace', () => {
    it('只过滤当前激活 workspace 的 tabs', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      s.open(tab('character', 'c', 'character'));
      s.setActiveWorkspace('preset');
      expect(s.tabsInActiveWorkspace.length).toBe(1);
      s.setActiveWorkspace('character');
      expect(s.tabsInActiveWorkspace.length).toBe(1);
    });
  });

  describe('sidebarCollection', () => {
    it('初始 preset=items, character=fields', () => {
      const s = useTabsStore();
      s.setActiveWorkspace('preset');
      expect(s.sidebarCollection).toBe('items');
      s.setActiveWorkspace('character');
      expect(s.sidebarCollection).toBe('fields');
    });

    it('setSidebarCollection 改写', () => {
      const s = useTabsStore();
      s.setSidebarCollection('preset', 'regex');
      expect(s.sidebarCollection).toBe('regex');
    });

    it('未配置的 workspace 兜底 items', () => {
      const s = useTabsStore();
      s.setActiveWorkspace('worldbook');
      expect(s.sidebarCollection).toBe('items');
    });
  });

  describe('toolBoxOpen', () => {
    it('初始 false', () => {
      const s = useTabsStore();
      expect(s.toolBoxOpen).toBe(false);
    });

    it('setToolBoxOpen 改写', () => {
      const s = useTabsStore();
      s.setToolBoxOpen('preset', true);
      expect(s.toolBoxOpen).toBe(true);
    });

    it('按 workspace 分桶', () => {
      const s = useTabsStore();
      s.setToolBoxOpen('preset', true);
      s.setActiveWorkspace('character');
      expect(s.toolBoxOpen).toBe(false);
    });
  });

  describe('requestEditorJump', () => {
    it('写入 editorJump 且 token 递增', () => {
      const s = useTabsStore();
      s.requestEditorJump(1, 2, 3);
      const j1 = s.editorJump;
      expect(j1).not.toBeNull();
      expect(j1!.line).toBe(1);
      expect(j1!.col).toBe(2);
      expect(j1!.len).toBe(3);
      expect(j1!.keepFocus).toBe(false);
      s.requestEditorJump(1, 2, 3);
      expect(s.editorJump!.token).toBe(j1!.token + 1);
    });

    it('keepFocus 参数透传', () => {
      const s = useTabsStore();
      s.requestEditorJump(0, 0, 0, true);
      expect(s.editorJump!.keepFocus).toBe(true);
    });
  });

  describe('requestListScroll', () => {
    it('按 domain 递增计数器', () => {
      const s = useTabsStore();
      s.requestListScroll('preset');
      s.requestListScroll('preset');
      s.requestListScroll('character');
      expect(s.listScrollToken.preset).toBe(2);
      expect(s.listScrollToken.character).toBe(1);
    });

    it('open 自动触发 requestListScroll', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset'));
      expect(s.listScrollToken.preset).toBe(1);
    });
  });

  describe('registerDomainAdapter / getDomainAdapter', () => {
    it('按 domain:workspace 存取', () => {
      const s = useTabsStore();
      const adapter = {
        scripts: () => [],
        workspace: 'preset' as const,
        t: () => '',
        isDirty: () => false,
        saveItem: () => {},
      };
      s.registerDomainAdapter('regex', 'preset', adapter);
      const got = s.getDomainAdapter('regex', 'preset');
      expect(got).toBeDefined();
      expect(got?.workspace).toBe('preset');
      expect(got?.t).toBe(adapter.t);
      expect(got?.scripts).toBe(adapter.scripts);
      expect(s.getDomainAdapter('regex', 'character')).toBeUndefined();
    });
  });

  describe('renameTab', () => {
    it('改 label 不动 activeId', () => {
      const s = useTabsStore();
      s.open(tab('preset', 'a', 'preset', 'Old'));
      s.renameTab('preset', 'a', 'New');
      expect(s.tabs[0].label).toBe('New');
      expect(s.activeId).toBe('preset:a');
    });
  });
});
