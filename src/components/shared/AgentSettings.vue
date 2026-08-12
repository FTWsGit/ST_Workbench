<template>
  <div class="wb-agent-settings">
    <div class="wb-form-section">
      <!-- system -->
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.systemPrompt') }}</label>
        <textarea
          class="wb-agent-settings-prompt"
          rows="6"
          :value="agentStore.config.prompts.system"
          @change="onBlockChange($event, 'system')"
          :placeholder="uiStore.t('agent.settings.systemPromptHint')"
        ></textarea>
      </div>
      <!-- project -->
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.projectPrompt') }}</label>
        <textarea
          class="wb-agent-settings-prompt"
          rows="6"
          :value="agentStore.config.prompts.project"
          @change="onBlockChange($event, 'project')"
          :placeholder="uiStore.t('agent.settings.projectPromptHint')"
        ></textarea>
      </div>
      <!-- workflow -->
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.workflowPrompt') }}</label>
        <textarea
          class="wb-agent-settings-prompt"
          rows="6"
          :value="agentStore.config.prompts.workflow"
          @change="onBlockChange($event, 'workflow')"
          :placeholder="uiStore.t('agent.settings.workflowPromptHint')"
        ></textarea>
      </div>
      <!-- knowledge -->
      <div class="wb-form-field">
        <div class="wb-agent-kb-header">
          <label class="wb-form-label">{{ uiStore.t('agent.settings.knowledge') }}</label>
          <button class="wb-btn sm" @click="addKnowledge">
            {{ uiStore.t('agent.settings.knowledgeAdd') }}
          </button>
        </div>
        <div v-if="agentStore.config.prompts.knowledge.length === 0" class="wb-agent-kb-empty">
          {{ uiStore.t('agent.settings.knowledgeEmpty') }}
        </div>
        <div
          v-for="(kb, idx) in agentStore.config.prompts.knowledge"
          :key="idx"
          class="wb-agent-kb"
          :class="{ disabled: !kb.enabled }"
        >
          <div class="wb-agent-kb-row wb-u-row wb-u-gap-1">
            <input
              class="wb-agent-kb-name"
              :value="kb.name"
              @change="onKnowledgeNameChange($event, idx)"
              :placeholder="uiStore.t('agent.settings.knowledgeNameHint')"
            />
            <button
              class="wb-btn icon-btn compact"
              :class="{ active: !kb.enabled }"
              :title="kb.enabled ? uiStore.t('common.disable') : uiStore.t('common.enable')"
              :aria-label="kb.enabled ? uiStore.t('common.disable') : uiStore.t('common.enable')"
              @click="toggleKnowledge(idx)"
            >
              {{ kb.enabled ? '👁' : '🚫' }}
            </button>
            <button
              class="wb-btn icon-btn compact"
              :title="uiStore.t('common.delete')"
              :aria-label="uiStore.t('common.delete')"
              @click="removeKnowledge(idx)"
            >
              🗑
            </button>
          </div>
          <input
            class="wb-agent-kb-desc"
            :value="kb.description"
            @change="onKnowledgeDescChange($event, idx)"
            :placeholder="uiStore.t('agent.settings.knowledgeDescHint')"
          />
          <textarea
            class="wb-agent-settings-prompt"
            rows="4"
            :value="kb.content"
            @change="onKnowledgeContentChange($event, idx)"
            :placeholder="uiStore.t('agent.settings.knowledgeContentHint')"
          ></textarea>
        </div>
      </div>
      <!-- temperature -->
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.temperature') }}</label>
        <NumberInput
          :model-value="agentStore.config.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          :nullable="false"
          @update:model-value="onTemperatureChange"
        />
      </div>
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.maxTokens') }}</label>
        <NumberInput
          :model-value="agentStore.config.maxTokens"
          :min="256"
          :max="16384"
          :step="256"
          :nullable="false"
          @update:model-value="onMaxTokensChange"
        />
      </div>
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.topP') }}</label>
        <NumberInput
          :model-value="agentStore.config.topP"
          :min="0"
          :max="1"
          :step="0.05"
          :placeholder="uiStore.t('agent.settings.topPHint')"
          @update:model-value="(v) => onNullableChange('topP', v)"
        />
      </div>
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.topK') }}</label>
        <NumberInput
          :model-value="agentStore.config.topK"
          :min="0"
          :max="1000"
          :step="1"
          :placeholder="uiStore.t('agent.settings.topKHint')"
          @update:model-value="(v) => onNullableChange('topK', v)"
        />
      </div>
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.presencePenalty') }}</label>
        <NumberInput
          :model-value="agentStore.config.presencePenalty"
          :min="-2"
          :max="2"
          :step="0.1"
          :placeholder="uiStore.t('agent.settings.penaltyHint')"
          @update:model-value="(v) => onNullableChange('presencePenalty', v)"
        />
      </div>
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.frequencyPenalty') }}</label>
        <NumberInput
          :model-value="agentStore.config.frequencyPenalty"
          :min="-2"
          :max="2"
          :step="0.1"
          :placeholder="uiStore.t('agent.settings.penaltyHint')"
          @update:model-value="(v) => onNullableChange('frequencyPenalty', v)"
        />
      </div>
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.thinking') }}</label>
        <label class="wb-agent-toggle">
          <input
            type="checkbox"
            :checked="!!agentStore.config.thinking"
            @change="onThinkingChange"
          />
          <span>{{ uiStore.t('agent.settings.thinkingHint') }}</span>
        </label>
      </div>
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.maxContextTokens') }}</label>
        <NumberInput
          :model-value="agentStore.config.maxContextTokens"
          :min="0"
          :max="2000000"
          :step="1000"
          :nullable="false"
          :placeholder="uiStore.t('agent.settings.maxContextTokensHint')"
          @update:model-value="onMaxContextTokensChange"
        />
      </div>
      <div class="wb-form-field">
        <label class="wb-form-label">{{ uiStore.t('agent.settings.compactThresholdRatio') }}</label>
        <NumberInput
          :model-value="agentStore.config.compactThresholdRatio"
          :min="0"
          :max="1"
          :step="0.05"
          :nullable="false"
          :placeholder="uiStore.t('agent.settings.compactThresholdRatioHint')"
          @update:model-value="onCompactRatioChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Agent 设置区：提示词分块编辑 + knowledge enable/disable + 采样参数。
 * 抽成独立组件，避免 AgentPanel 在 float/docked 两种形态里复制粘贴一大段设置 markup。
 */
import { useUiStore } from '../../stores/uiStore';
import { useAgentStore } from '../../agent/agentStore';
import type { AgentConfig, KnowledgeBlock } from '../../agent/types';
import NumberInput from './NumberInput.vue';

const uiStore = useUiStore();
const agentStore = useAgentStore();

/** system/project/workflow 三块文本的统一变更入口。 */
function onBlockChange(e: Event, key: 'system' | 'project' | 'workflow'): void {
  const prompts = agentStore.config.prompts;
  prompts[key] = (e.target as HTMLTextAreaElement).value;
  agentStore.updateConfig({ prompts: { ...prompts } });
}

/* ====== knowledge 块 CRUD ====== */

function onKnowledgeNameChange(e: Event, idx: number): void {
  const kbs = agentStore.config.prompts.knowledge.slice();
  kbs[idx] = { ...kbs[idx], name: (e.target as HTMLInputElement).value };
  commitKnowledge(kbs);
}
function onKnowledgeDescChange(e: Event, idx: number): void {
  const kbs = agentStore.config.prompts.knowledge.slice();
  kbs[idx] = { ...kbs[idx], description: (e.target as HTMLInputElement).value };
  commitKnowledge(kbs);
}
function onKnowledgeContentChange(e: Event, idx: number): void {
  const kbs = agentStore.config.prompts.knowledge.slice();
  kbs[idx] = { ...kbs[idx], content: (e.target as HTMLTextAreaElement).value };
  commitKnowledge(kbs);
}
function toggleKnowledge(idx: number): void {
  const kbs = agentStore.config.prompts.knowledge.slice();
  kbs[idx] = { ...kbs[idx], enabled: !kbs[idx].enabled };
  commitKnowledge(kbs);
}
function removeKnowledge(idx: number): void {
  const kbs = agentStore.config.prompts.knowledge.slice();
  kbs.splice(idx, 1);
  commitKnowledge(kbs);
}
function addKnowledge(): void {
  const blank: KnowledgeBlock = {
    name: '',
    description: '',
    content: '',
    enabled: true,
  };
  const kbs = agentStore.config.prompts.knowledge.slice();
  kbs.push(blank);
  commitKnowledge(kbs);
}
function commitKnowledge(kbs: KnowledgeBlock[]): void {
  const prompts = agentStore.config.prompts;
  agentStore.updateConfig({ prompts: { ...prompts, knowledge: kbs } });
}

/* ====== 采样参数变更入口 ====== */

function onTemperatureChange(v: number | null): void {
  if (v != null) agentStore.updateConfig({ temperature: v });
}
function onMaxTokensChange(v: number | null): void {
  if (v != null) agentStore.updateConfig({ maxTokens: v });
}
function onNullableChange(
  key: 'topP' | 'topK' | 'presencePenalty' | 'frequencyPenalty',
  v: number | null
): void {
  agentStore.updateConfig({ [key]: v } as Partial<AgentConfig>);
}
function onThinkingChange(e: Event): void {
  const checked = (e.target as HTMLInputElement).checked;
  agentStore.updateConfig({ thinking: checked ? { type: 'enabled' } : null });
}
function onMaxContextTokensChange(v: number | null): void {
  agentStore.updateConfig({ maxContextTokens: v ?? 0 });
}
function onCompactRatioChange(v: number | null): void {
  agentStore.updateConfig({ compactThresholdRatio: v ?? 0 });
}
</script>
