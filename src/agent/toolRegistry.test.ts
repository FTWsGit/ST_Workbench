import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerAgentTool,
  getAgentTool,
  listAgentTools,
  listAgentToolsForWorkspace,
  type AgentToolDef,
  type AgentWorkspace,
} from './toolRegistry';

/** 构造最小合法 AgentToolDef（execute 不会真跑，只占位）。 */
function makeTool(name: string, overrides: Partial<AgentToolDef> = {}): AgentToolDef {
  return {
    name,
    description: 'desc for ' + name,
    parameters: { type: 'object', properties: {} },
    risk: 'safe',
    readonly: false,
    availableIn: ['preset'],
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

  describe('listAgentToolsForWorkspace', () => {
    it('只放行 availableIn 包含当前 workspace 的工具', () => {
      const wsPreset: AgentWorkspace = 'preset';
      const wsChar: AgentWorkspace = 'character';
      const wsWb: AgentWorkspace = 'worldbook';
      const t1 = makeTool('ws1_' + counter, { availableIn: ['preset'] });
      const t2 = makeTool('ws2_' + counter, { availableIn: ['preset', 'character'] });
      const t3 = makeTool('ws3_' + counter, { availableIn: ['character', 'worldbook'] });
      registerAgentTool(t1);
      registerAgentTool(t2);
      registerAgentTool(t3);

      const presetTools = listAgentToolsForWorkspace(wsPreset);
      expect(presetTools).toContain(t1);
      expect(presetTools).toContain(t2);
      expect(presetTools).not.toContain(t3);

      const charTools = listAgentToolsForWorkspace(wsChar);
      expect(charTools).not.toContain(t1);
      expect(charTools).toContain(t2);
      expect(charTools).toContain(t3);

      const wbTools = listAgentToolsForWorkspace(wsWb);
      expect(wbTools).not.toContain(t1);
      expect(wbTools).not.toContain(t2);
      expect(wbTools).toContain(t3);
    });

    it('availableIn 为空数组时任何 workspace 都不放行', () => {
      const t = makeTool('ws_empty_' + counter, { availableIn: [] });
      registerAgentTool(t);
      expect(listAgentToolsForWorkspace('preset')).not.toContain(t);
      expect(listAgentToolsForWorkspace('character')).not.toContain(t);
      expect(listAgentToolsForWorkspace('worldbook')).not.toContain(t);
    });

    it('risk 字段不过滤，保留在结果里供下游判断', () => {
      const safe = makeTool('risk_safe_' + counter, { risk: 'safe', availableIn: ['preset'] });
      const risky = makeTool('risk_risky_' + counter, { risk: 'risky', availableIn: ['preset'] });
      registerAgentTool(safe);
      registerAgentTool(risky);
      const presetTools = listAgentToolsForWorkspace('preset');
      expect(presetTools).toContain(safe);
      expect(presetTools).toContain(risky);
      // risk 值保留
      const safeResult = presetTools.find((t) => t.name === safe.name);
      expect(safeResult?.risk).toBe('safe');
      const riskyResult = presetTools.find((t) => t.name === risky.name);
      expect(riskyResult?.risk).toBe('risky');
    });
  });
});
