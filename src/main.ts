// src/main.ts
;(globalThis as any).process = (globalThis as any).process || { env: {} }

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import mainCss from './styles/main.css?inline'
import { getHostDocument } from './composables/hostEnv'

function mount() {
  // 酒馆助手在 iframe (about:srcdoc) 里执行脚本，必须挂到顶层文档，否则 FAB 在 iframe 里看不到
  const targetDoc = getHostDocument()

  // 在创建/挂载任何组件前注入样式：CSS 通过 ?inline 以原始字符串导入，直接写到目标文档，
  // 避免原先"插件注入 iframe <style> 再克隆到主文档"的竞态。
  if (!targetDoc.getElementById('ST_Workbench-style')) {
    const style = targetDoc.createElement('style')
    style.id = 'ST_Workbench-style'
    style.textContent = mainCss
    targetDoc.head!.appendChild(style)
  }

  const el = targetDoc.createElement('div')
  el.id = 'ST_Workbench'
  /** 根容器挂载关键约束（踩坑要点，保留）：
   *  - append 到 <body>（而非 <html>）：移动端 ST 主题把 <body> 设为 position:fixed，浏览器在 <html> 有 transform 时会把 <body> 提升到 viewport 层，挂在 <body> 内才能与它的 stacking context 竞争。
   *  - 外层必须 position:fixed + 100vw/100vh（不能 inset:0 / 百分比）：vw/vh 始终按真实视口解析，避免 fixed 元素因含 transform 的祖先（<html> 上的单位矩阵也算）导致 containing block 错位、inset:0 相对坍塌的盒子计算而落到屏外。height 额外写 100dvh 兼容移动端地址栏。
   *  - 必须显式数字 z-index（2147483647，CSS 最大值）而非 auto：position:fixed+z-index:auto 仍创建层叠上下文但处于 z-index 0 层，在实际设备上会被 <body> 同层的 stacking context 盖住；显式正值进入严格更高的"positive z-index"层，无条件盖过 auto/0 层。
   *  - pointer-events:none：容器全屏覆盖但默认不吞事件，内部可见元素（.wb-fab/.wb-panel/.pr-var-popup 等）在 main.css 中单独设 pointer-events:auto。 */
  el.style.position = 'fixed'
  el.style.top = '0'
  el.style.left = '0'
  el.style.width = '100vw'
  el.style.height = '100vh'
  el.style.height = '100dvh'
  el.style.zIndex = '2147483647'
  el.style.pointerEvents = 'none'
  targetDoc.body.appendChild(el)

  /** 一次性诊断：vw/vh 不受 <html> transform 影响，top/left:0 在单位矩阵/scale/旋转等非平移变换下也正常；
   *  但若 <html> 有真实非零 translation，会把 top:0/left:0 推离视口角。仅 warn，不阻塞挂载。 */
  try {
    const htmlStyle = targetDoc.defaultView?.getComputedStyle(targetDoc.documentElement)
    if (htmlStyle && (htmlStyle.transform !== 'none' || htmlStyle.perspective !== 'none' || htmlStyle.willChange.includes('transform') || htmlStyle.filter !== 'none')) {
      console.warn('[ST_Workbench] Host <html> has a transform/perspective/filter/will-change set. Sizing (vw/vh) is unaffected, but if that transform includes an actual translation, this UI\'s top-left corner may be offset from the real viewport corner. Host page CSS is the cause, not this extension.')
    }
  } catch (e) {
    // 跨文档 getComputedStyle 在严格嵌入上下文可能抛错；此处仅为诊断，绝不影响挂载。
  }

  const app = createApp(App)
  app.use(createPinia())
  app.mount(el)

  /** 卸载清理：脚本在 ST 扩展面板被关掉时，承载脚本的 about:srcdoc iframe 会被销毁，
   *  但本扩展的根容器（含 FAB）挂在顶层 <body> 上仍残留。监听 iframe 自身的 pagehide/unload，
   *  触发时卸载 Vue app 并移除根容器与注入样式，让 FAB 等所有可见元素一并消失。
   *
   *  pagehide 在 bfcache 关闭时最可靠；unload 作为旧浏览器兜底。两者都设 once 避免重复卸载。 */
  const selfWin = window
  function teardown() {
    try { app.unmount() } catch {}
    try { el.remove() } catch {}
    // 注入的 <style> 也清掉，避免宿主页面残留本扩展的 CSS 规则。
    const styleEl = targetDoc.getElementById('ST_Workbench-style')
    if (styleEl) try { styleEl.remove() } catch {}
  }
  const teardownOnce = () => { teardown(); }
  selfWin.addEventListener('pagehide', teardownOnce, { once: true })
  selfWin.addEventListener('unload', teardownOnce, { once: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
