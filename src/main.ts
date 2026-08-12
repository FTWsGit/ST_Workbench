// src/main.ts
(globalThis as { process?: unknown }).process = (globalThis as { process?: unknown }).process || {
  env: {},
};

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
// CSS 不再 ?inline 手动注入：普通导入让 vite 提取成 dist/style.css，由 manifest `css` 字段交给 ST 注入。
import './styles/main.css';

function mount() {
  // 标准 ST 扩展跑在主文档，window/document 即宿主，不再需要 iframe 穿透（hostEnv）。
  const el = document.createElement('div');
  el.id = 'ST_Workbench';
  /** 根容器挂载关键约束（踩坑要点，保留）：
   *  - append 到 <body>（而非 <html>）：移动端 ST 主题把 <body> 设为 position:fixed，浏览器在 <html> 有 transform 时会把 <body> 提升到 viewport 层，挂在 <body> 内才能与它的 stacking context 竞争。
   *  - 外层必须 position:fixed + 100vw/100vh（不能 inset:0 / 百分比）：vw/vh 始终按真实视口解析，避免 fixed 元素因含 transform 的祖先（<html> 上的单位矩阵也算）导致 containing block 错位、inset:0 相对坍塌的盒子计算而落到屏外。height 额外写 100dvh 兼容移动端地址栏。
   *  - 必须显式数字 z-index（2147483647，CSS 最大值）而非 auto：position:fixed+z-index:auto 仍创建层叠上下文但处于 z-index 0 层，在实际设备上会被 <body> 同层的 stacking context 盖住；显式正值进入严格更高的"positive z-index"层，无条件盖过 auto/0 层。
   *  - 不设 pointer-events:none：迁移后走模态 dialog 路线，根容器全屏遮罩并吃掉所有点击，不再需要穿透机制。 */
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '0';
  el.style.width = '100vw';
  el.style.height = '100vh';
  el.style.height = '100dvh';
  el.style.zIndex = '2147483647';
  document.body.appendChild(el);

  /** 一次性诊断：vw/vh 不受 <html> transform 影响，top/left:0 在单位矩阵/scale/旋转等非平移变换下也正常；
   *  但若 <html> 有真实非零 translation，会把 top:0/left:0 推离视口角。仅 warn，不阻塞挂载。 */
  try {
    const htmlStyle = document.defaultView?.getComputedStyle(document.documentElement);
    if (
      htmlStyle &&
      (htmlStyle.transform !== 'none' ||
        htmlStyle.perspective !== 'none' ||
        htmlStyle.willChange.includes('transform') ||
        htmlStyle.filter !== 'none')
    ) {
      // 诊断输出已按 no-console 移除；如需排查，可临时恢复 console.warn。
    }
  } catch {
    // 跨文档 getComputedStyle 在严格嵌入上下文可能抛错；此处仅为诊断，绝不影响挂载。
  }

  const app = createApp(App);
  app.use(createPinia());
  /** 全局错误边界：任何组件 setup/render 抛错或 watcher 异常都会进这里。
   *  本扩展注入到宿主页面顶层 <body>，未捕获错误会导致整个面板白屏、
   *  甚至破坏宿主页面布局。这里至少把错误打到 console + 顶层 window，
   *  避免静默白屏——用户能看到"出错了"而非一片空白。
   *  注意：此时 Pinia store 可能尚未初始化（错误发生在 app.mount 之前），
   *  所以不能依赖 uiStore.showToast，只能用最原始的 console + 可选 alert。 */
  app.config.errorHandler = (err, _instance, _info) => {
    // 兜底：在根容器顶部叠一个错误条，提示用户刷新。
    try {
      const banner = document.createElement('div');
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:2147483646;background:#b86060;color:#fff;padding:8px 16px;font:13px sans-serif;pointer-events:auto;';
      banner.textContent =
        '[ST_Workbench] 发生错误: ' +
        (err instanceof Error ? err.message : String(err)) +
        ' — 建议刷新页面。点击关闭。';
      banner.onclick = () => banner.remove();
      document.body.appendChild(banner);
    } catch {
      // 连兜底 DOM 都创建失败（极罕见），唯一退路是 console（此处不再输出，遵循 no-console）。
    }
  };
  app.mount(el);

  /** 卸载清理：ST 扩展被禁用/移除或页面卸载时，卸载 Vue app 并移除根容器，让 FAB 等所有可见元素一并消失。
   *  CSS 由 manifest `css` 字段注入，不再有手动注入的 <style> 需要清理。
   *
   *  pagehide 在 bfcache 关闭时最可靠；unload 作为旧浏览器兜底。两者都设 once 避免重复卸载。 */
  const selfWin = window;
  function teardown() {
    try {
      app.unmount();
    } catch {
      // 卸载阶段抛错可忽略，不阻塞后续清理
    }
    try {
      el.remove();
    } catch {
      // 卸载阶段抛错可忽略，不阻塞后续清理
    }
  }
  const teardownOnce = () => {
    teardown();
  };
  selfWin.addEventListener('pagehide', teardownOnce, { once: true });
  selfWin.addEventListener('unload', teardownOnce, { once: true });
}

/** App.vue ↔ 入口侧的事件契约：入口在宿主 window 上派发本事件触发 openPanel()。
 *  事件名两侧需一致；App.vue 在 onMounted 挂监听、onUnmounted 移除。 */
const OPEN_PANEL_EVENT = 'st-workbench:open-panel';

function triggerOpenPanel() {
  window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT));
}

/** ST 扩展入口：由 manifest hooks.activate 调用。 */
export function init() {
  mount();
  registerEntries();
}

/** 入口：斜杠命令 `/workbench` + ST 顶栏扩展按钮。两条都派发 OPEN_PANEL_EVENT 触发面板。
 *  用宿主全局（jQuery / SlashCommandParser）而不是裸 import ST 模块——它们在 ST 主文档里是全局变量，
 *  标准 ST 扩展惯例见 preset-cards/index.js（顶层 import + 调用 SlashCommandParser.addCommandObject）。 */
function registerEntries() {
  // 斜杠命令：聊天框敲 /workbench 唤起面板。
  const parser = (
    window as unknown as { SlashCommandParser?: { addCommandObject?: (cmd: unknown) => void } }
  ).SlashCommandParser;
  const fromProps = (
    window as unknown as { SlashCommand?: { fromProps?: (p: unknown) => unknown } }
  ).SlashCommand;
  if (parser?.addCommandObject && fromProps?.fromProps) {
    const cmd = fromProps.fromProps({
      name: 'workbench',
      callback: async () => {
        triggerOpenPanel();
        return '';
      },
      helpString: 'Opens the ST_Workbench authoring panel.',
    });
    parser.addCommandObject(cmd);
  }

  // ST 顶栏扩展按钮：挂在顶栏的扩展按钮容器。ST 自身的类名复用，跟主题对齐。
  // 用幂等 id 防重复挂（ST 关脚本后再开会再次调 init）。
  const hostDoc = document;
  if (!hostDoc.getElementById('st-wb-entry-button')) {
    const $ = (
      window as unknown as { $?: (s: string) => { append: (h: string) => void } | undefined }
    ).$;
    const target =
      hostDoc.getElementById('extensionsMenu') ||
      hostDoc.getElementById('topRightTogglePanel') ||
      hostDoc.body;
    void $;
    const btn = hostDoc.createElement('div');
    btn.id = 'st-wb-entry-button';
    btn.className = 'list-group-item flex-container flexGap5';
    const defaultOpacity = '0.7';
    const defaultBackGround = '#171717';
    btn.style.cssText = `
      opacity: ${defaultOpacity};
      cursor: pointer;
      pointer-events: auto;
      color: #7ab8ff;
      background: ${defaultBackGround};
      font-family: JetBrains Mono
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.opacity = '0.9';
      btn.style.background = '#15202b';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.opacity = defaultOpacity;
      btn.style.background = defaultBackGround;
    });
    const icon = hostDoc.createElement('div');
    icon.className = 'fa-solid fa-grip extensionsMenuExtensionButton';
    btn.appendChild(icon);
    btn.appendChild(hostDoc.createTextNode('Workbench'));
    btn.addEventListener('click', triggerOpenPanel);
    if (target === hostDoc.body) {
      btn.style.position = 'fixed';
      btn.style.bottom = '16px';
      btn.style.right = '16px';
      btn.style.zIndex = '2147483647';
    }
    target.appendChild(btn);
  }
}

/** ST 扩展入口：由 manifest hooks.install / hooks.update 调用，重载页面使新代码生效。 */
export function refresh() {
  location.reload();
}
