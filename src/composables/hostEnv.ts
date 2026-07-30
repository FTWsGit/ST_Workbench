// This app mounts onto window.top.document but scripts run in an about:srcdoc iframe, so bare
// `window`/`document` refer to the iframe — not the visible UI. Use these helpers instead.

import { ref, onUnmounted, type Ref } from 'vue'

let cachedWin: Window | null = null

export function getHostWindow(): Window {
  if (cachedWin) return cachedWin
  try {
    // window.top throws/denies in true cross-origin iframes, but Tavern Helper's srcdoc
    // iframe is same-origin, so this normally succeeds.
    if (window.top && window.top.document) { cachedWin = window.top; return cachedWin }
  } catch {}
  cachedWin = window
  return cachedWin
}

export function getHostDocument(): Document {
  return getHostWindow().document
}

/**
 * Copies `text` to the clipboard, working around the iframe/top-document split.
 * Tries the host window's navigator.clipboard first, then falls back to execCommand('copy')
 * via the host document. Resolves to false on total failure.
 */
export async function copyToHostClipboard(text: string): Promise<boolean> {
  const hostWin = getHostWindow() as any
  try {
    if (hostWin.navigator?.clipboard?.writeText) {
      await hostWin.navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) {
    console.warn('[ST_Workbench] navigator.clipboard.writeText failed, falling back to execCommand:', e)
  }
  try {
    const doc: Document = hostWin.document
    const ta = doc.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.left = '-9999px'
    doc.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = doc.execCommand('copy')
    doc.body.removeChild(ta)
    if (!ok) throw new Error('execCommand("copy") returned false')
    return true
  } catch (e) {
    console.error('[ST_Workbench] Clipboard copy failed (both navigator.clipboard and execCommand):', e)
    return false
  }
}

/** Below this width the 4-column layout collapses to off-canvas drawer / bottom-sheet layout.
 *  Set just above typical phone widths (390-430px portrait) and narrow in-app browser viewports. */
export const MOBILE_BREAKPOINT = 720

/**
 * Reactive `isMobile` flag, true when the viewport is narrow enough for the mobile layout.
 * Reads/listens on the host window (not the iframe's window) so resize/matchMedia fire
 * on the real viewport.
 */
export function useIsMobile(): Ref<boolean> {
  const hostWin = getHostWindow()
  const isMobile = ref(hostWin.innerWidth <= MOBILE_BREAKPOINT)

  function update() { isMobile.value = hostWin.innerWidth <= MOBILE_BREAKPOINT }

  // Prefer matchMedia (fires on breakpoint crossing); fall back to 'resize' if unavailable.
  if (hostWin.matchMedia) {
    const mql = hostWin.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const onChange = () => update()
    mql.addEventListener('change', onChange)
    onUnmounted(() => mql.removeEventListener('change', onChange))
  } else {
    hostWin.addEventListener('resize', update)
    onUnmounted(() => hostWin.removeEventListener('resize', update))
  }

  return isMobile
}

