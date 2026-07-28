<template>
  <div v-if="inline" class="wb-field-row">
    <label v-if="label" class="rx-label">{{ label }}</label>
    <slot />
  </div>
  <template v-else>
    <label v-if="label" class="rx-label">{{ label }}</label>
    <slot />
  </template>
</template>

<script setup lang="ts">
/* "一个 label + 一个控件"这个全项目最常见的表单模式，之前完全靠调用方手写：是否要包一层
 * .wb-field-row 让控件跟 label 同一行、要不要在 label 上补 style="margin:0"、是不是表单/分组
 * 里第一个字段所以要补 style="margin-top:0"——这些判断散在十几个地方，全靠写的人当时记得，
 * WorldbookSettingsForm.vue 的"按概率触发"字段就是漏了包 .wb-field-row 才会跟旁边"插入位置"
 * 长得不一样（见该文件改动前的版本）。
 *
 * 这个组件把"stack 还是 inline"这个决定收进一个 prop，调用方不再需要知道底层是哪个 CSS 类、
 * 要不要清零 margin——这两件事现在都在 main.css 里用结构选择器（.wb-field-row .rx-label /
 * :first-child）自动处理，组件和调用方都不用管。
 *
 * 故意保留 rx-label/wb-field-row 这两个既有类名，不趁机改名——两者的实际视觉行为早就是域无关的
 * 通用表单样式，只是历史命名带着"rx"（最早是正则表单専用）容易让人误会；现在换了个角度解决
 * 同一个问题：不要求全项目一次性重命名 8 个文件里的用法（风险大、这次没法逐屏截图验证），而是
 * 让 FormField 成为新代码的唯一入口——用这个组件的人根本看不到 rx-label 这个名字，命名历史包袱
 * 就自然被这层封装挡住了，不需要靠重命名才能解决。已有用法（RegexSettingsForm.vue 等）保持
 * 不动、继续能用，以后顺手迁移到 FormField 时再一起处理。
 *
 * v-else 分支故意用 <template>（Vue 3 支持多根节点 fragment）而不是包一层 div——stack 布局下
 * label 和 slot 内容本来就是 .rx-form/.wb-group-body 的直接 flex 子节点，靠父容器的
 * flex-direction:column + gap 做竖排间距；多包一层 div 会让这层 div 自己也变成父容器的一个
 * flex item，反而打乱现有间距节奏。 */
withDefaults(defineProps<{
  /** 字段标签文字，不传则不渲染 label（比如"启用"那种直接用 slot 内容自解释的场景，用调用方
   *  自己的 <span>/<label> 代替，这个组件不强制什么都要有文字 label） */
  label?: string
  /** true：label 和控件强制同一行（.wb-field-row，标签固定最小宽度左对齐）
   *  false（默认）：竖排——label 单独一行，控件另起一行 */
  inline?: boolean
}>(), { inline: false })
</script>
