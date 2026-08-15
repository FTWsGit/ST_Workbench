import { describe, it, expect } from 'vitest';
import { orderedPromptsWithHidden } from './promptOrder';
import type { Preset, PromptBlock } from '../types';

// ===== orderedPromptsWithHidden =====

function mkBlock(identifier: string, name = identifier): PromptBlock {
  return {
    identifier,
    name,
    content: '',
    role: 'system',
    system_prompt: false,
    marker: false,
    enabled: true,
    injectionPosition: 0,
    injectionDepth: 0,
    injectionOrder: 0,
  };
}

function mkData(prompts: PromptBlock[]): Preset {
  return {
    name: 'test',
    settings: {
      openai_max_context: 0,
      openai_max_tokens: 0,
      n: 1,
      stream_openai: false,
      temperature: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      top_p: 1,
      repetition_penalty: 1,
      min_p: 0,
      top_k: 0,
      top_a: 0,
      seed: -1,
      squash_system_messages: false,
    },
    prompts,
    regexs: [],
    scripts: [],
  };
}

describe('orderedPromptsWithHidden', () => {
  it('按 prompts 数组顺序返回，hidden 恒 false', () => {
    const a = mkBlock('a');
    const b = mkBlock('b');
    const c = mkBlock('c');
    const out = orderedPromptsWithHidden(mkData([a, b, c]));
    expect(out.map((e) => [e.block.identifier, e.hidden])).toEqual([
      ['a', false],
      ['b', false],
      ['c', false],
    ]);
  });

  it('空 prompts → 空数组', () => {
    expect(orderedPromptsWithHidden(mkData([]))).toEqual([]);
  });
});
