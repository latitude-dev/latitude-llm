import { findNearestMessageAnchor } from "../../conversation-timeline/flash-highlight.ts"
import { centerHighlightInView, findHighlightNode } from "./find-highlight-node.ts"
import type { SearchScrollTarget } from "./navigable-search-highlights.ts"

const SCROLL_OBSERVER_TIMEOUT_MS = 2000

export function scrollToSearchMatch(
  container: HTMLElement,
  target: SearchScrollTarget,
  behavior: ScrollBehavior = "smooth",
  onScrolled?: () => void,
): () => void {
  let done = false

  function tryScroll(): boolean {
    if (done) return true
    const node =
      target.kind === "inline"
        ? findHighlightNode(container, target.messageIndex, target.startOffset)
        : findNearestMessageAnchor(container, target.messageIndex)
    if (!node) return false
    centerHighlightInView(container, node, behavior)
    onScrolled?.()
    return true
  }

  if (tryScroll()) {
    return () => {}
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
