<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    class="wb-icon"
  >
    <path
      v-for="(d, i) in def.paths"
      :key="i"
      :d="d"
      :stroke="def.strokes[i] ? 'currentColor' : 'none'"
      :fill="def.fills[i] ? 'currentColor' : 'none'"
      stroke-width="1.4"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
</template>

<script lang="ts">
/** 内联 SVG 图标表。统一 16×16 viewBox、stroke=currentColor、1.4 描边。
 *  替换原 emoji/Unicode 符号——emoji 在不同字体下渲染不一致（关闭按钮 ✕ 大小飘），符号字体缺失时变方框。 */
const ICONS = {
  /** 关闭按钮 ✕ */
  close: { paths: ['M4 4l8 8M12 4l-8 8'], strokes: [true], fills: [false] },
  /** 汉堡菜单 ☰ */
  menu: { paths: ['M2 4h12M2 8h12M2 12h12'], strokes: [true], fills: [false] },
  /** 三点更多 ⋯ */
  more: { paths: ['M4 8h.01M8 8h.01M12 8h.01'], strokes: [true], fills: [false] },
  /** 新建 + */
  plus: { paths: ['M8 3v10M3 8h10'], strokes: [true], fills: [false] },
  /** 删除垃圾桶 🗑 */
  trash: {
    paths: ['M3 5h10M6 5V3.5h4V5M5 5l.5 8h5l.5-8'],
    strokes: [true, true, true],
    fills: [false, false, false],
  },
  /** 下载箭头 ⤓（导入） */
  download: { paths: ['M8 2v8M5 7l3 3 3-3M3 13h10'], strokes: [true], fills: [false] },
  /** 向下展开箭头 ▾ */
  chevronDown: { paths: ['M4 6l4 4 4-4'], strokes: [true], fills: [false] },
  /** 向右折叠箭头 ▸ */
  chevronRight: { paths: ['M6 4l4 4-4 4'], strokes: [true], fills: [false] },
  /** 向右箭头 ▶ */
  arrowRight: { paths: ['M3 8h10M10 5l3 3-3 3'], strokes: [true], fills: [false] },
  /** 向左箭头 ◀ */
  arrowLeft: { paths: ['M13 8H3M6 5L3 8l3 3'], strokes: [true], fills: [false] },
  /** 向上箭头 ▲ */
  arrowUp: { paths: ['M8 13V3M5 6l3-3 3 3'], strokes: [true], fills: [false] },
  /** 向下箭头 ▼ */
  arrowDown: { paths: ['M8 3v10M5 10l3 3 3-3'], strokes: [true], fills: [false] },
  /** 眼睛 👁（可见/查看） */
  eye: {
    paths: [
      'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z',
      'M8 10a2 2 0 100-4 2 2 0 000 4z',
    ],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 齿轮 ⚙（设置） */
  gear: {
    // 8 齿严格旋转对称，齿面用直线，确保 16px 下轮廓清楚、不发软。
    paths: [
      'M12.76 6.03 L13.02 6.84 L14.06 6.93 L14.06 9.07 L13.02 9.16 L12.76 9.97 L12.76 9.97 L12.37 10.73 L13.04 11.53 L11.53 13.04 L10.73 12.37 L9.97 12.76 L9.97 12.76 L9.16 13.02 L9.07 14.06 L6.93 14.06 L6.84 13.02 L6.03 12.76 L6.03 12.76 L5.27 12.37 L4.47 13.04 L2.96 11.53 L3.63 10.73 L3.24 9.97 L3.24 9.97 L2.98 9.16 L1.94 9.07 L1.94 6.93 L2.98 6.84 L3.24 6.03 L3.24 6.03 L3.63 5.27 L2.96 4.47 L4.47 2.96 L5.27 3.63 L6.03 3.24 L6.03 3.24 L6.84 2.98 L6.93 1.94 L9.07 1.94 L9.16 2.98 L9.97 3.24 L9.97 3.24 L10.73 3.63 L11.53 2.96 L13.04 4.47 L12.37 5.27 L12.76 6.03Z',
      'M8 5.55a2.45 2.45 0 110 4.9 2.45 2.45 0 010-4.9z',
    ],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 扳手 🔧（工具调用） */
  wrench: {
    paths: ['M9.5 4.5a3 3 0 014 4l-2-2-2 1 1 2 2 2a3 3 0 01-4-4l-5 5-1-1 5-5z'],
    strokes: [true],
    fills: [false],
  },
  /** 用户人形 🧑（agent role: user） */
  user: {
    paths: ['M8 8a3 3 0 100-6 3 3 0 000 6zM3 14c0-2.8 2.2-5 5-5s5 2.2 5 5'],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 机器人 🤖（agent role: assistant） */
  bot: {
    paths: ['M4 6h8v7H4z', 'M8 3v3', 'M2 8h2M12 8h2', 'M6 9h.01M10 9h.01'],
    strokes: [true, true, true, true],
    fills: [false, false, false, false],
  },
  /** 剪贴板 📋 */
  clipboard: {
    paths: ['M5 3h6v2H5zM4 4h-.5v9h9V4H12', 'M6 8h4M6 11h4'],
    strokes: [true, true, true],
    fills: [false, false, false],
  },
  /** 图钉 📌（钉住/悬浮切换） */
  pin: {
    paths: [
      'M5 2.5h6l-.75 3.55 2.15 2.15v1H9.1l-.35 2.15L8 13.5l-.75-2.15-.35-2.15H3.6v-1l2.15-2.15L5 2.5z',
      'M8 11.2V14',
    ],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 刷新 🔄（重建索引） */
  refresh: {
    paths: [
      'M13.2 6.4A5.45 5.45 0 004.1 3.9L2.7 5.3M2.7 5.3h3.4M2.7 5.3V1.9',
      'M2.8 9.6A5.45 5.45 0 0011.9 12.1l1.4-1.4M13.3 10.7H9.9M13.3 10.7v3.4',
    ],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 警告三角 ⚠（错误提示） */
  warning: {
    paths: ['M8 2.5l5.5 10h-11z', 'M8 7v3M8 11.5h.01'],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 笔记 📝（空状态占位） */
  note: {
    paths: ['M3 2.5h7l3 3v8h-10zM9.5 2.5v3h3', 'M5 9h6M5 11.5h6'],
    strokes: [true, true, true],
    fills: [false, false, false],
  },
  /** 文件夹 📁（脚本树 folder） */
  folder: {
    paths: ['M2 4.5h4l1.5 2H14v7H2z'],
    strokes: [true],
    fills: [false],
  },
  /** 禁用斜杠圆 🚫（knowledge 禁用态） */
  ban: {
    paths: ['M8 14a6 6 0 100-12 6 6 0 000 12zM4 4l8 8'],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 软盘 💾（保存） */
  save: {
    paths: ['M3 3h9l1 1v9H3zM5.5 3v3h4V3', 'M5.5 9h5v4h-5z'],
    strokes: [true, true, true],
    fills: [false, false, false],
  },
  /** 重载圆弧 ↻（重新加载） */
  reload: {
    paths: [
      'M13 5.5V2.8M13 2.8h-2.7',
      'M13 5.5A5.5 5.5 0 003.6 4M3 10.5v2.7M3 13.2h2.7',
      'M3 10.5A5.5 5.5 0 0012.4 12',
    ],
    strokes: [true, true, true],
    fills: [false, false, false],
  },
  /** 信息 i 圆 ℹ（元信息） */
  info: {
    paths: ['M8 14a6 6 0 100-12 6 6 0 000 12zM8 7v4M8 5h.01'],
    strokes: [true, true, true],
    fills: [false, false, false],
  },
  /** 工具箱 🔧（toolbox 容器） */
  toolbox: {
    paths: ['M2 6h12v8H2zM2 9h12', 'M5 6V4.5h6V6'],
    strokes: [true, true, true],
    fills: [false, false, false],
  },
  /** 链接 🔗（绑定） */
  bind: {
    paths: ['M7 9l-2 2a2 2 0 11-2.8-2.8L4.5 6', 'M9 7l2-2a2 2 0 112.8 2.8L11.5 10'],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 解锁 🔓（解绑） */
  unbind: {
    paths: ['M4 8V6a4 4 0 017-2.5M4 8h8v6H4z'],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 柱状图 📊（变量导航） */
  chart: {
    paths: ['M3 13V3M3 13h10', 'M6 13V8h2v5M11 13V5h2v8'],
    strokes: [true, true, true],
    fills: [false, false, false],
  },
  /** 播放三角 ▶（生成） */
  play: {
    paths: ['M5 3l7 5-7 5z'],
    strokes: [true],
    fills: [false],
  },
  /** 沙漏 ⏳（生成中等待） */
  wait: {
    paths: ['M4 2h8l-4 6 4 6H4l4-6z'],
    strokes: [true],
    fills: [false],
  },
  /** 复制 📋（preview 复制） */
  copy: {
    paths: ['M5 2.5h8v9', 'M2.5 5h8v8.5h-8z'],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 左右交换 ⇆（跨预设复制） */
  swap: {
    paths: ['M3 5h9l-2-2M13 11H4l2 2'],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 铅笔 ✏（编辑） */
  edit: {
    paths: ['M2.5 13.5l1-3.5 8-8 2.5 2.5-8 8zM10 3l2.5 2.5'],
    strokes: [true, true],
    fills: [false, false],
  },
  /** 实心圆点 •（列表标记/状态点） */
  dot: { paths: ['M8 8m-3 0a3 3 0 106 0a3 3 0 10-6 0'], strokes: [true], fills: [false] },
  /** 星标 ⭐（收藏） */
  star: {
    paths: ['M8 2l1.8 4 4.2.4-3.2 2.8 1 4.2L8 11l-3.6 2.4 1-4.2L2 6.4 6.2 6z'],
    strokes: [true],
    fills: [false],
  },
} as const;

export type IconName = keyof typeof ICONS;
</script>

<script setup lang="ts">
const { name, size = 16 } = defineProps<{ name: IconName; size?: number }>();
const def = ICONS[name];
</script>
