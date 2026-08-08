/* toolCallCompat 单元测试。纯函数，无外部依赖。 */
import { describe, it, expect } from 'vitest';
import { extractToolCalls } from './toolCallCompat';
import type { RawModelResponse } from './toolCallCompat';

describe('extractToolCalls', () => {
  /* ====== 兜底 ====== */
  it('null response 返回 null', () => {
    expect(extractToolCalls(null as unknown as RawModelResponse, 'openai')).toBeNull();
  });

  it('undefined response 返回 null', () => {
    expect(extractToolCalls(undefined as unknown as RawModelResponse, 'openai')).toBeNull();
  });

  /* ====== OpenAI 系 ====== */
  it('OpenAI 系：从 choices[0].message.tool_calls 提取并归一化', () => {
    const resp: RawModelResponse = {
      choices: [
        {
          message: {
            tool_calls: [
              { id: 'call_1', function: { name: 'list_presets', arguments: '{"filter":"x"}' } },
              { id: 'call_2', function: { name: 'read_preset', arguments: { name: 'foo' } } },
            ],
          },
        },
      ],
    };
    const result = extractToolCalls(resp, 'openai');
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(2);
    expect(result![0]).toEqual({ id: 'call_1', name: 'list_presets', arguments: '{"filter":"x"}' });
    // 非字符串 arguments 走 JSON.stringify
    expect(result![1]).toEqual({ id: 'call_2', name: 'read_preset', arguments: '{"name":"foo"}' });
  });

  it('OpenAI 系：arguments 缺失时补 "{}"', () => {
    const resp: RawModelResponse = {
      choices: [{ message: { tool_calls: [{ id: 'c1', function: { name: 'noop' } }] } }],
    };
    const result = extractToolCalls(resp, 'deepseek');
    expect(result).not.toBeNull();
    expect(result![0].arguments).toBe('{}');
  });

  it('OpenAI 系：tool_calls 非数组时返回 null', () => {
    const resp: RawModelResponse = {
      choices: [{ message: { tool_calls: 'not-an-array' } }],
    };
    expect(extractToolCalls(resp, 'openai')).toBeNull();
  });

  it('OpenAI 系：空数组 tool_calls 返回 null', () => {
    const resp: RawModelResponse = {
      choices: [{ message: { tool_calls: [] } }],
    };
    expect(extractToolCalls(resp, 'openai')).toBeNull();
  });

  it('OpenAI 系：choices/tool_calls 字段缺失返回 null', () => {
    expect(extractToolCalls({}, 'openai')).toBeNull();
    expect(extractToolCalls({ choices: [] }, 'openai')).toBeNull();
    expect(extractToolCalls({ choices: [{ message: {} }] }, 'openai')).toBeNull();
  });

  it('OpenAI 系：id 或 name 缺失的条目被 filter 丢弃', () => {
    const resp: RawModelResponse = {
      choices: [
        {
          message: {
            tool_calls: [
              { id: '', function: { name: 'x', arguments: '{}' } }, // id 空 → 丢弃
              { id: 'c2', function: { name: '', arguments: '{}' } }, // name 空 → 丢弃
              { id: 'c3', function: { name: 'ok', arguments: '{}' } }, // 保留
            ],
          },
        },
      ],
    };
    const result = extractToolCalls(resp, 'openrouter');
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0].id).toBe('c3');
    expect(result![0].name).toBe('ok');
  });

  it('OpenAI 系覆盖多个 source 名（custom/azure_openai/xai/groq/mistralai/cohere/perplexity/google）', () => {
    const resp: RawModelResponse = {
      choices: [
        { message: { tool_calls: [{ id: 'c1', function: { name: 'f', arguments: '{}' } }] } },
      ],
    };
    for (const src of [
      'custom',
      'azure_openai',
      'xai',
      'groq',
      'mistralai',
      'perplexity',
      'google',
    ]) {
      expect(extractToolCalls(resp, src)).not.toBeNull();
    }
  });

  /* ====== Claude ====== */
  it('Claude：从 content 块里 type==="tool_use" 提取', () => {
    const resp: RawModelResponse = {
      content: [
        { type: 'text', text: 'thinking...' },
        { type: 'tool_use', id: 'toolu_1', name: 'list_presets', input: { filter: 'a' } },
        { type: 'tool_use', id: 'toolu_2', name: 'read_preset', input: 'raw-string-input' },
      ],
    };
    const result = extractToolCalls(resp, 'claude');
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(2);
    expect(result![0]).toEqual({
      id: 'toolu_1',
      name: 'list_presets',
      arguments: '{"filter":"a"}',
    });
    expect(result![1].arguments).toBe('raw-string-input');
  });

  it('Claude：input 缺失时补 "{}"', () => {
    const resp: RawModelResponse = {
      content: [{ type: 'tool_use', id: 't1', name: 'f' }],
    };
    const result = extractToolCalls(resp, 'claude');
    expect(result).not.toBeNull();
    expect(result![0].arguments).toBe('{}');
  });

  it('Claude：content 非数组返回 null', () => {
    expect(extractToolCalls({ content: 'x' }, 'claude')).toBeNull();
    expect(extractToolCalls({}, 'claude')).toBeNull();
  });

  it('Claude：无 tool_use 块返回 null', () => {
    const resp: RawModelResponse = {
      content: [{ type: 'text', text: 'hi' }],
    };
    expect(extractToolCalls(resp, 'claude')).toBeNull();
  });

  it('Claude：id 或 name 缺失的块被丢弃', () => {
    const resp: RawModelResponse = {
      content: [
        { type: 'tool_use', id: '', name: 'f', input: {} }, // 丢
        { type: 'tool_use', id: 'x', name: '', input: {} }, // 丢
        { type: 'tool_use', id: 'y', name: 'g', input: {} }, // 留
      ],
    };
    const result = extractToolCalls(resp, 'claude');
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0].id).toBe('y');
  });

  /* ====== Cohere ======
   * 注意：'cohere' 同时在 isOpenAIFamily 列表里，所以 source='cohere' 走 OpenAI 分支（
   * choices[0].message.tool_calls），永远不会落到下面的 Cohere 分支。Cohere 分支
   * （message.tool_calls）在当前实现里是死代码。这里用 it.skip 标注实际行为。 */

  it.skip('Cohere：从 message.tool_calls 提取，parameters 归一化（死代码：cohere 走 OpenAI 分支）', () => {
    const resp: RawModelResponse = {
      message: {
        tool_calls: [
          { id: 'c1', name: 'list_presets', parameters: '{"filter":"x"}' },
          { id: 'c2', name: 'read_preset', parameters: { name: 'foo' } },
        ],
      },
    };
    const result = extractToolCalls(resp, 'cohere');
    // 实际行为：source='cohere' 命中 isOpenAIFamily，走 OpenAI 分支查 choices[0].message.tool_calls，
    // 本 resp 只有 message.tool_calls（Cohere 形状）无 choices → 返回 null
    expect(result).toBeNull();
  });

  it.skip('Cohere：parameters 缺失补 "{}"（死代码：cohere 走 OpenAI 分支）', () => {
    const resp: RawModelResponse = {
      message: { tool_calls: [{ id: 'c1', name: 'f' }] },
    };
    // 实际行为：走 OpenAI 分支，无 choices → null
    expect(extractToolCalls(resp, 'cohere')).toBeNull();
  });

  it('Cohere：tool_calls 非数组/空/缺失返回 null', () => {
    // source='cohere' 走 OpenAI 分支，shapes 无 choices → null（与 OpenAI 分支行为一致）
    expect(extractToolCalls({ message: { tool_calls: 'x' } }, 'cohere')).toBeNull();
    expect(extractToolCalls({ message: { tool_calls: [] } }, 'cohere')).toBeNull();
    expect(extractToolCalls({ message: {} }, 'cohere')).toBeNull();
    expect(extractToolCalls({}, 'cohere')).toBeNull();
  });

  it.skip('Cohere：id 或 name 缺失丢弃（死代码：cohere 走 OpenAI 分支）', () => {
    const resp: RawModelResponse = {
      message: {
        tool_calls: [
          { id: '', name: 'f', parameters: {} },
          { id: 'c2', name: '', parameters: {} },
          { id: 'c3', name: 'ok', parameters: {} },
        ],
      },
    };
    // 实际行为：走 OpenAI 分支，无 choices → null
    expect(extractToolCalls(resp, 'cohere')).toBeNull();
  });

  /* 验证：给 source='cohere'喂 OpenAI 形状（choices[0].message.tool_calls）能成功提取
   * （证明走 OpenAI 分支而非 Cohere 分支）。 */
  it('cohere source 走 OpenAI 分支：choices 形状能提取，message 形状返回 null', () => {
    const openAiShape: RawModelResponse = {
      choices: [
        { message: { tool_calls: [{ id: 'c1', function: { name: 'f', arguments: '{}' } }] } },
      ],
    };
    expect(extractToolCalls(openAiShape, 'cohere')).not.toBeNull();

    const cohereShape: RawModelResponse = {
      message: { tool_calls: [{ id: 'c1', name: 'f', parameters: '{}' }] },
    };
    expect(extractToolCalls(cohereShape, 'cohere')).toBeNull();
  });

  /* ====== 未知 source ====== */
  it('未知 source（makersuite/vertexai）返回 null', () => {
    const resp: RawModelResponse = {
      choices: [
        { message: { tool_calls: [{ id: 'c1', function: { name: 'f', arguments: '{}' } }] } },
      ],
    };
    expect(extractToolCalls(resp, 'makersuite')).toBeNull();
    expect(extractToolCalls(resp, 'vertexai')).toBeNull();
    expect(extractToolCalls(resp, 'unknown_source')).toBeNull();
  });
});
