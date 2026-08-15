import type { Preset, PromptBlock } from '../types';

export interface OrderedBlockEntry {
  block: PromptBlock;
  hidden: boolean;
}

/** 把预设的 prompts 数组按视觉顺序返回（干净层 prompts 数组顺序 = 视觉顺序，enabled 已烘入）。
 *  隐藏块现在也在 Preset.prompts 里（hidden 字段标记），由调用方决定要不要过滤。 */
export function orderedPromptsWithHidden(data: Preset): OrderedBlockEntry[] {
  return data.prompts.map((block) => ({ block, hidden: !!block.hidden }));
}
