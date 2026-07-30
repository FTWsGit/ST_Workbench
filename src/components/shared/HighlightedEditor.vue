<!--
  通用宏语法 textarea：行号 + 语法高亮叠加层 + 真实换行高度度量（批量 DOM 测量，见 updateLineNums）
  + 括号/引号自动配对 + 可选跳转到指定位置 + 可选变量点击识别。
  领域无关：只认识 ST 宏语法（{{...}}、{{setvar/addvar/getvar}}），不直接触碰任何 Pinia store；
  搜索高亮、跳转请求、变量点击都通过 props/emits 按需开启。
  v-model: modelValue（纯字符串）。输入时同步发出 update:modelValue，高亮与行号同 tick 重算，
  仅对真正变化的行更新 DOM（O(变更行数)，非 O(文档长度)）；外部变更通过值比对检测并立即刷新。
-->
<template>
  <div class="wb-editor-content">
    <div class="wb-line-nums" ref="lnRef">
      <div v-for="(h, i) in lineHeights" :key="i" class="ln" :class="lineClass(i)" :style="{ height: h + 'px' }">{{ i + 1 }}</div>
    </div>
    <div class="wb-editor-wrap">
      <pre class="wb-editor-hl" ref="hlRef"></pre>
      <textarea class="wb-editor-ta" ref="taRef" spellcheck="false" :placeholder="placeholder"
                :readonly="disabled" autocomplete="off" data-lpignore="true" data-form-type="other"
                :value="content" @input="onInput" @scroll="syncScroll"
                @keydown="onKeydown" @click="onClick" @keyup="updateCursor"></textarea>
      <!-- 隐藏镜像：用于测量单行高度 / 光标坐标（支持 CJK / tab / 混合宽度） -->
      <div class="wb-line-mirror" ref="mirrorRef" aria-hidden="true"></div>
      <!-- 隐藏批量容器：每个逻辑行的换行高度通过在子 div 中布局一次性测量（append + read ≈ 一次 layout），见 updateLineNums() -->
      <div class="wb-lh-measure" ref="measureRef" aria-hidden="true"></div>
    </div>
  </div>
  <div v-if="showStatusbar" class="wb-statusbar">
    <span>{{ cursorText }}</span>
    <span>{{ charsLabel }}</span>
    <span>{{ linesLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { highlightLines } from '../../composables/useHighlight'
import { getHostWindow, getHostDocument } from '../../composables/hostEnv'
import { findMacroEnd } from '../../utils'

interface JumpRequest { line: number; col: number; len: number; token: number; keepFocus: boolean }

const props = withDefaults(defineProps<{
  modelValue: string
  /** 外部"请把光标移到此处"请求（搜索结果、变量导航）。无此需求的调用方（如 RegexContentEditor）可不传。 */
  jump?: JumpRequest | null
  /** 行号栏每行额外 CSS 类（搜索命中/当前命中高亮）。无结果概念的编辑器可不传。 */
  lineClass?: (line: number) => string
  /** 点击 {{setvar/addvar/getvar::name}} 是否发出 var-click。默认关闭——目前只有 block 编辑器有变量导航弹窗。 */
  enableVarClick?: boolean
  showStatusbar?: boolean
  placeholder?: string
  /** i18n：光标位置标签，如 "Ln {line}, Col {col}"，接收 {line}、{col} 参数。 */
  statusCursorLabel?: string
  /** i18n：字符计数标签，如 "{count} chars"，接收 {count} 参数。 */
  statusCharsLabel?: string
  /** i18n：行数标签，如 "{count} lines"，接收 {count} 参数。 */
  statusLinesLabel?: string
  disabled?: boolean
}>(), {
  jump: null,
  lineClass: () => '',
  enableVarClick: false,
  showStatusbar: true,
  placeholder: '',
  statusCursorLabel: 'Ln {line}, Col {col}',
  statusCharsLabel: '{count} chars',
  statusLinesLabel: '{count} lines',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [string]
  'var-click': [payload: { varName: string; cursorPos: number; pos: { top: number; left: number } }]
  'var-click-miss': []
}>()

const taRef = ref<HTMLTextAreaElement>()
const hlRef = ref<HTMLPreElement>()
const lnRef = ref<HTMLElement>()
const mirrorRef = ref<HTMLDivElement>()
const measureRef = ref<HTMLDivElement>()

/** 编辑器尺寸变化（拖动侧边栏/面板宽度手柄）后，等待此毫秒再重测量换行高度。 */
const RESIZE_DEBOUNCE_MS = 20

const content = ref(props.modelValue)
const cursorLine = ref(1)
const cursorCol = ref(1)
const cursorText = computed(() =>
  props.statusCursorLabel.replace(/\{line\}/g, String(cursorLine.value)).replace(/\{col\}/g, String(cursorCol.value)))
const lineCount = computed(() => 1 + (content.value.match(/\n/g) || []).length)
const charsLabel = computed(() => props.statusCharsLabel.replace(/\{count\}/g, String(content.value.length)))
const linesLabel = computed(() => props.statusLinesLabel.replace(/\{count\}/g, String(lineCount.value)))

const lineHeights = ref<number[]>([])

/**
 * 重绘高亮：按逻辑行与现有 DOM 做 diff，只 innerHTML 真正变化的行（通常就是正在编辑的那一行），
 * 其余节点保留不动——单次按键 DOM 写入 O(变更行数)，无需打字时隐藏叠加层的折中。
 */
let prevHlLines: string[] = []
function refreshHighlight() {
  const el = hlRef.value
  if (!el) return
  const lines = highlightLines(content.value)
  const hostDoc = getHostDocument() // 命令式创建的节点必须来自宿主文档（hostEnv.ts）
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === prevHlLines[i]) continue // 未变化——保留 <div> 不动
    let child = el.children[i] as HTMLElement | undefined
    if (!child) { child = hostDoc.createElement('div'); el.appendChild(child) }
    child.innerHTML = lines[i]
  }
  while (el.children.length > lines.length) el.lastElementChild!.remove() // 行被删除
  prevHlLines = lines
}

/** modelValue 外部变更（切换 block、Replace All、切换 regex 标签等），立即刷新。 */
watch(() => props.modelValue, (v) => {
  if (v === content.value) return
  content.value = v
  refreshHighlight()
  nextTick(() => { updateLineNums(); updateCursor() })
})

watch(() => props.jump, (jump) => {
  if (!jump || !taRef.value) return
  nextTick(() => moveCursorTo(jump.line, jump.col, jump.len, jump.keepFocus))
})

function onInput(e: Event) {
  if (props.disabled) return
  content.value = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', content.value)
  refreshHighlight()
  updateLineNums()
  updateCursor()
}

/** onKeydown 直接改 ta.value 的路径（Tab、括号/引号配对）走这里，以绕过无原生 input 事件的问题。 */
function emitContent() {
  content.value = taRef.value?.value || ''
  emit('update:modelValue', content.value)
  refreshHighlight()
  updateLineNums()
}

/**
 * 行号栏换行高度度量：让浏览器自己换行（隐藏容器内逐行布局后读取 offsetHeight），
 * 结果按 (contentWidth, lineText) 缓存；缓存未命中时一次性 append 全部再一次性 read，
 * 一次 layout 完成——稳态打字只重测当前行，粘贴大段也无压力。
 * 宽度必须与 textarea 一致（包括滚动条占位导致的 clientWidth 收缩），否则高亮层换行点会偏。
 * 高度用 getBoundingClientRect() 保留小数，避免逐行四舍五入累积导致行号栏漂移。
 */
let cachedLH = -1
function measureSingleLineHeight(): number {
  if (cachedLH > 0) return cachedLH
  if (!mirrorRef.value) return 20
  const mirror = mirrorRef.value
  const prevText = mirror.textContent
  mirror.textContent = '\u00A0' // 单个不换行字符确保恰好一行
  // getBoundingClientRect() 保留小数——offsetHeight 是 long 类型会把行高截断为整数，累积后会漂移
  const h = mirror.getBoundingClientRect().height || 20
  mirror.textContent = prevText
  cachedLH = h
  return h
}

const lineHeightCache = new Map<string, number>() // key: `${contentWidth}|${lineText}` → px 高度
let lastLNText: string | null = null
let lastLNWidth = -1
function updateLineNums() {
  if (!taRef.value) return
  const ta = taRef.value
  const text = content.value
  const cs = getComputedStyle(ta)
  const cw = ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  if (hlRef.value) hlRef.value.style.width = ta.clientWidth + 'px'
  if (text === lastLNText && cw === lastLNWidth) return
  lastLNText = text; lastLNWidth = cw
  if (cw <= 0) { lineHeights.value = []; return }
  const lh = measureSingleLineHeight()
  const lines = text.split('\n')
  const heights: number[] = new Array(lines.length)
  const misses: { i: number; key: string; line: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) { heights[i] = lh; continue } // 空逻辑行固定一行高
    const key = cw + '|' + line
    const hit = lineHeightCache.get(key)
    if (hit !== undefined) heights[i] = hit
    else misses.push({ i, key, line })
  }
  if (misses.length && measureRef.value) {
    const hostDoc = getHostDocument()
    const m = measureRef.value
    m.style.width = ta.clientWidth + 'px' // border-box + 与 textarea 相同内边距 → 内容宽度一致
    const els: HTMLElement[] = []
    for (const { line } of misses) {
      const d = hostDoc.createElement('div')
      d.textContent = line
      els.push(d)
      m.appendChild(d)
    }
    for (let k = 0; k < misses.length; k++) {
      const h = Math.max(els[k].getBoundingClientRect().height, lh)
      heights[misses[k].i] = h
      if (lineHeightCache.size < 5000) lineHeightCache.set(misses[k].key, h)
    }
    m.textContent = '' // 一次性清空测量子节点
  }
  lineHeights.value = heights
}

function syncScroll() {
  if (!taRef.value || !hlRef.value || !lnRef.value) return
  hlRef.value.scrollTop = taRef.value.scrollTop; hlRef.value.scrollLeft = taRef.value.scrollLeft
  lnRef.value.scrollTop = taRef.value.scrollTop
}

function updateCursor() {
  if (!taRef.value) return
  const pos = taRef.value.selectionStart, val = taRef.value.value, before = val.substring(0, pos)
  cursorLine.value = 1 + (before.match(/\n/g) || []).length
  cursorCol.value = pos - before.lastIndexOf('\n')
}

function onClick() { updateCursor(); if (props.enableVarClick) checkVarClick() }

function getLineColPos(line: number, col: number): number {
  const ls = content.value.split('\n')
  let p = 0
  for (let i = 0; i < line && i < ls.length; i++) p += ls[i].length + 1
  return p + col
}

function moveCursorTo(line: number, col: number, len: number, keepFocus = false) {
  const ta = taRef.value
  if (!ta) return
  const lh = measureSingleLineHeight()
  ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 3)
  syncScroll()
  if (keepFocus) return // 仅预览滚动：滚动到命中位置但不抢光标
  ta.focus()
  const pos = getLineColPos(line, col)
  ta.setSelectionRange(pos, pos + len)
  updateCursor()
}

/**
 * 在 text 中找到 pos 位置下的 {{setvar/addvar/getvar::name}} 变量名。
 * 只有点击落在变量名本身（而非关键字/花括号/setvar 的值）才算命中；若值中嵌套了其它 var 宏则递归查找，
 * 如 {{addvar::a::...{{getvar::b}}...}} 点击到 b 时返回 b。
 * 用 findMacroEnd（基于 {{/}} 深度计数）找宏真正结尾，正确处理嵌套。
 */
function getVarNameAtPos(text: string, pos: number): { varName: string; type: string; pos: number } | null {
  function scan(from: number, to: number): { varName: string; type: string; pos: number } | null {
    let i = from
    while (i < to) {
      if (i + 1 < text.length && text[i] === '{' && text[i + 1] === '{') {
        const end = findMacroEnd(text, i)
        if (end === -1 || end > to) { i++; continue }
        if (pos >= i && pos <= end) {
          const innerStart = i + 2, innerEnd = end - 2
          const inner = text.slice(innerStart, innerEnd)
          const sm = inner.match(/^(setvar|addvar)::([\s\S]+?)::/)
          if (sm) {
            const vs = innerStart + sm[1].length + 2
            const varName = sm[2]
            if (pos >= vs && pos < vs + varName.length) return { varName, type: sm[1], pos: i }
            return scan(vs + varName.length + 2, innerEnd)
          }
          const gm = inner.match(/^getvar::([\s\S]+)$/)
          if (gm) {
            const vs = innerStart + 'getvar::'.length
            if (pos >= vs && pos < vs + gm[1].length) return { varName: gm[1], type: 'get', pos: i }
            return null
          }
          return scan(innerStart, innerEnd)
        }
        i = end
        continue
      }
      i++
    }
    return null
  }
  return scan(0, text.length)
}

/**
 * 计算 textarea 中 pos 偏移处字符的视口坐标，考虑真实换行——把 pos 之前的文本镜像到隐藏测量元素，
 * 在末尾插入零宽 marker span，读其 getBoundingClientRect()。
 */
function getCaretCoords(pos: number): { top: number; left: number } | null {
  const ta = taRef.value, mirror = mirrorRef.value
  if (!ta || !mirror) return null
  const hostDoc = getHostDocument()
  mirror.style.width = ta.clientWidth + 'px'
  mirror.textContent = ''
  mirror.appendChild(hostDoc.createTextNode(ta.value.substring(0, pos)))
  const marker = hostDoc.createElement('span')
  marker.textContent = '\u200b' // 零宽空格：真实节点可测量，但无可见宽度
  mirror.appendChild(marker)
  const markerRect = marker.getBoundingClientRect()
  mirror.textContent = ''
  return { top: markerRect.top, left: markerRect.left }
}

function checkVarClick() {
  if (!taRef.value) return
  const info = getVarNameAtPos(taRef.value.value, taRef.value.selectionStart)
  if (info) openVarPopupAt(info.varName.trim(), taRef.value.selectionStart)
  else emit('var-click-miss')
}

function openVarPopupAt(varName: string, cursorPos: number) {
  const ta = taRef.value
  if (!ta) return
  const hostWin = getHostWindow()
  const lh = measureSingleLineHeight()
  const coords = getCaretCoords(cursorPos)
  if (!coords) return

  // 镜像与 textarea 同原点但不滚动，需减去 scrollTop/scrollLeft 换算为当前屏幕坐标
  let top = coords.top - ta.scrollTop + lh + 4
  let left = coords.left - ta.scrollLeft
  left = Math.max(8, Math.min(left, hostWin.innerWidth - 380))
  if (top + 260 > hostWin.innerHeight) top = Math.max(8, coords.top - ta.scrollTop - 250)

  emit('var-click', { varName, cursorPos, pos: { top, left } })
}

/** 括号/引号配对，1:1 对齐 MiMo 行为——纯文本编辑行为，与领域模型无关。 */
const BRACKET_PAIR_MAP: Record<string, string> = { '{': '}', '(': ')', '[': ']', '<': '>', '"': '"', "'": "'" }

function onKeydown(e: KeyboardEvent) {
  const ta = taRef.value!; const pos = ta.selectionStart, end = ta.selectionEnd, val = ta.value, hasSel = pos !== end

  if (e.key === 'Tab') { e.preventDefault(); ta.value = val.substring(0, pos) + '\t' + val.substring(end); ta.selectionStart = ta.selectionEnd = pos + 1; emitContent(); return }

  // 退格在相邻配对中间时同时删除两侧（如 {{|}} -> |）
  if (e.key === 'Backspace' && !hasSel && pos > 0 && pos < val.length) {
    if (pos >= 2 && pos + 1 < val.length && val.substring(pos - 2, pos) === '{{' && val.substring(pos, pos + 2) === '}}') {
      e.preventDefault(); ta.value = val.substring(0, pos - 2) + val.substring(pos + 2); ta.selectionStart = ta.selectionEnd = pos - 2; emitContent(); updateCursor(); return
    }
    const pv = val[pos - 1], nx = val[pos]
    if (BRACKET_PAIR_MAP[pv] === nx) { e.preventDefault(); ta.value = val.substring(0, pos - 1) + val.substring(pos + 1); ta.selectionStart = ta.selectionEnd = pos - 1; emitContent(); updateCursor(); return }
  }

  // 选中内容时输入括号/引号：包住选区
  if (hasSel) {
    if (BRACKET_PAIR_MAP[e.key]) {
      e.preventDefault()
      const s = val.substring(pos, end)
      ta.value = val.substring(0, pos) + e.key + s + BRACKET_PAIR_MAP[e.key] + val.substring(end)
      ta.selectionStart = pos + 1; ta.selectionEnd = end + 1
      emitContent(); updateCursor()
    }
    return
  }

  // 在已有匹配闭括号前输入闭合符：跳过而非重复插入
  if (pos < val.length) {
    const nc = val[pos]
    if ((e.key === '}' && nc === '}') || (e.key === ')' && nc === ')') || (e.key === ']' && nc === ']') || (e.key === '>' && nc === '>') || (e.key === '"' && nc === '"') || (e.key === "'" && nc === "'")) {
      e.preventDefault(); ta.selectionStart = ta.selectionEnd = pos + 1; updateCursor(); return
    }
  }

  // 输入 "{"：特殊处理，构造 "{{}}" 宏括号
  if (e.key === '{') {
    e.preventDefault()
    if (pos > 0 && val[pos - 1] === '{') {
      if (pos < val.length && val[pos] === '}') { ta.value = val.substring(0, pos - 1) + '{{}}' + val.substring(pos + 1); ta.selectionStart = ta.selectionEnd = pos + 1 }
      else { ta.value = val.substring(0, pos) + '{}}' + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1 }
    } else {
      ta.value = val.substring(0, pos) + '{}' + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1
    }
    emitContent(); updateCursor(); return
  }

  const bp: Record<string, string> = { '(': ')', '[': ']', '<': '>' }
  if (bp[e.key]) { e.preventDefault(); ta.value = val.substring(0, pos) + e.key + bp[e.key] + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1; emitContent(); updateCursor(); return }

  if (e.key === '"' || e.key === "'") { e.preventDefault(); ta.value = val.substring(0, pos) + e.key + e.key + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1; emitContent(); updateCursor(); return }
}

/** ResizeObserver：编辑器尺寸变化时（拖动侧边栏/面板）延迟重测行号。 */
let ro: ResizeObserver | null = null
let roTimer: ReturnType<typeof setTimeout>
onMounted(() => {
  const HostResizeObserver = (getHostWindow() as any).ResizeObserver || ResizeObserver
  ro = new HostResizeObserver(() => {
    clearTimeout(roTimer)
    roTimer = setTimeout(() => { updateLineNums() }, RESIZE_DEBOUNCE_MS)
  })
  if (taRef.value) ro!.observe(taRef.value)
  nextTick(() => { refreshHighlight(); updateLineNums(); updateCursor() })
})
onUnmounted(() => { if (ro) ro.disconnect() })

/** 字体 CSS 变量变化（设置对话框修改字号/字体）时调用：清空高度缓存并重测。字体变化不会触发 ResizeObserver，必须外部显式调用。 */
function refreshFont() {
  cachedLH = -1
  lastLNText = null
  lineHeightCache.clear()
  nextTick(() => updateLineNums())
}
defineExpose({ refreshFont })
</script>
