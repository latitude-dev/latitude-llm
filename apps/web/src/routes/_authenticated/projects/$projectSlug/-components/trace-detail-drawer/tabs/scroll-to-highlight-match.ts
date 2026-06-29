import { centerHighlightInView, findHighlightNode } from "./find-highlight-node.ts"

const SCROLL_OBSERVER_TIMEOUT_MS = 2000

type HighlightScrollTarget = {
  readonly messageIndex: number
  readonly startOffset: number
}

export function scrollToHighlightMatch(
  container: HTMLElement,
  target: HighlightScrollTarget,
  behavior: ScrollBehavior = "smooth",
): () => void {
  let done = false

  function tryScroll(): boolean {
    if (done) return true
    const node = findHighlightNode(container, target.messageIndex, target.startOffset)
    if (!node) return false
    centerHighlightInView(container, node, behavior)
    return true
  }

  if (tryScroll()) {
    done = true
    return () => {
      done = true
    }
  }

  const observer = new MutationObserver(() => {
    if (done) return
    if (tryScroll()) {
      done = true
      observer.disconnect()
      window.clearTimeout(timeout)
    }
  })
  observer.observe(container, { childList: true, subtree: true })
  const timeout = window.setTimeout(() => {
    done = true
    observer.disconnect()
  }, SCROLL_OBSERVER_TIMEOUT_MS)

  return () => {
    done = true
    observer.disconnect()
    window.clearTimeout(timeout)
  }
}
