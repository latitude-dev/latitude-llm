const FLASH_BOX_SHADOW = "0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary) / 0.5)"
const FLASH_DURATION_MS = 4_000

let activeFlash: { element: HTMLElement; timeout: number } | null = null

/** Transient scroll-target emphasis: a ring that clears after a few seconds. */
export function flashElement(element: HTMLElement): void {
  if (activeFlash) {
    window.clearTimeout(activeFlash.timeout)
    activeFlash.element.style.boxShadow = ""
  }
  element.style.boxShadow = FLASH_BOX_SHADOW
  const timeout = window.setTimeout(() => {
    element.style.boxShadow = ""
    activeFlash = null
  }, FLASH_DURATION_MS)
  activeFlash = { element, timeout }
}

/** Finds the rendered message element closest to `messageIndex` (tool-result
 * messages can be absorbed into their caller, so exact anchors may not render). */
export function findNearestMessageAnchor(container: HTMLElement, messageIndex: number): HTMLElement | null {
  const exact = container.querySelector<HTMLElement>(`[data-message-index="${messageIndex}"]`)
  if (exact) return exact
  let best: { node: HTMLElement; distance: number } | null = null
  for (const node of container.querySelectorAll<HTMLElement>("[data-message-index]")) {
    const raw = node.getAttribute("data-message-index")
    if (raw == null) continue
    const index = Number.parseInt(raw, 10)
    if (Number.isNaN(index)) continue
    const distance = Math.abs(index - messageIndex)
    if (!best || distance < best.distance) best = { node, distance }
  }
  return best?.node ?? null
}
