const FUZZY_OFFSET_WINDOW = 10

export function findHighlightNode(container: HTMLElement, messageIndex: number, startOffset: number): Element | null {
  const exact = container.querySelector(`[data-message-index="${messageIndex}"] [data-source-start="${startOffset}"]`)
  if (exact) return exact

  const messageRoot = container.querySelector(`[data-message-index="${messageIndex}"]`)
  if (!messageRoot) return null

  const candidates = messageRoot.querySelectorAll<HTMLElement>("[data-source-start]")
  let best: { node: Element; distance: number } | null = null
  for (const candidate of candidates) {
    const raw = candidate.getAttribute("data-source-start")
    if (raw == null) continue
    const candidateStart = Number.parseInt(raw, 10)
    if (Number.isNaN(candidateStart)) continue
    const distance = Math.abs(candidateStart - startOffset)
    if (distance > FUZZY_OFFSET_WINDOW) continue
    if (!best || distance < best.distance) {
      best = { node: candidate, distance }
    }
  }
  return best?.node ?? null
}

export function centerHighlightInView(
  container: HTMLElement,
  target: Element,
  behavior: ScrollBehavior = "smooth",
): void {
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTopWithinContent = targetRect.top - containerRect.top + container.scrollTop
  const top = targetTopWithinContent - container.clientHeight / 2 + targetRect.height / 2
  container.scrollTo({ top: Math.max(0, top), behavior })
}
