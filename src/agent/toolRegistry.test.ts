import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAgentTool, getAgentTool, listAgentTools, type AgentToolDef } from './toolRegistry';

/** 构造最小合法 AgentToolDef（execute 不会真跑，只占位）。 */
function makeTool(name: string, overrides: Partial<AgentToolDef> = {}): AgentToolDef {
  return {
    name,
    description: 'desc for ' + name,
    parameters: { type: 'object', properties: {} },
    risk: 'safe',
    readonly: false,
    execute: vi.fn(async () => ({ text: 'ok' })),
    ...overrides,
  };
}

describe('toolRegistry', () => {
  // 模块级 Map �跨测试持久化，用唯一 name 避撞
  let counter = 0;
  beforeEach(() => {
    counter++;
  });

  describe('registerAgentTool / getAgentTool', () => {
    it('注册后可按 name 取回', () => {
      const t = makeTool('tool_get_' + counter);
      registerAgentTool(t);
      expect(getAgentTool(t.name)).toBe(t);
    });

    it('未注册的 name 返回 undefined', () => {
      expect(getAgentTool('nonexistent_' + counter)).toBeUndefined();
    });

    it('重名注册覆盖旧定义', () => {
      const name = 'tool_over_' + counter;
      const t1 = makeTool(name, { description: 'v1' });
      registerAgentTool(t1);
      const t2 = makeTool(name, { description: 'v2' });
      registerAgentTool(t2);
      expect(getAgentTool(name)?.description).toBe('v2');
    });
  });

  describe('listAgentTools', () => {
    it('列出全部已注册工具', () => {
      const a = makeTool('list_a_' + counter);
      const b = makeTool('list_b_' + counter);
      registerAgentTool(a);
      registerAgentTool(b);
      const all = listAgentTools();
      expect(all).toContain(a);
      expect(all).toContain(b);
    });

    it('返回的是数组拷贝，修改不影响内部注册表', () => {
      const t = makeTool('list_c_' + counter);
      registerAgentTool(t);
      const all = listAgentTools();
      all.length = 0;
      // 内部不受影响
      expect(getAgentTool(t.name)).toBe(t);
    });
  });
});
