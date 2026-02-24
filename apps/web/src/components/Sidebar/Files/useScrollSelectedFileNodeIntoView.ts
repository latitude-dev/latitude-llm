import { useEffect, useRef } from 'react'

/**
 * Returns a node ref that auto-scrolls the sidebar container when the selected
 * file node becomes visible in the tree.
 */
export function useScrollSelectedFileNodeIntoView({
  selected,
  isFile,
  nodeId,
}: {
  selected: boolean
  isFile: boolean
  nodeId: string
}) {
  const nodeRef = useRef<HTMLDivElement>(null)
  const hasScrolledToSelectedNodeRef = useRef(false)

  useEffect(() => {
    if (!selected || !isFile) {
      hasScrolledToSelectedNodeRef.current = false
      return
    }
    if (hasScrolledToSelectedNodeRef.current) return
    if (!nodeRef.current) return

    hasScrolledToSelectedNodeRef.current = true
    const scrollContainer = nodeRef.current.closest<HTMLElement>(
      '[data-sidebar-scroll-container="files"]',
    )
    if (!scrollContainer) return

    const nodeRect = nodeRef.current.getBoundingClientRect()
    const containerRect = scrollContainer.getBoundingClientRect()
    const isOutsideContainer =
      nodeRect.top < containerRect.top || nodeRect.bottom > containerRect.bottom

    if (!isOutsideContainer) return

    const nextScrollTop =
      scrollContainer.scrollTop +
      (nodeRect.top - containerRect.top) -
      scrollContainer.clientHeight / 2 +
      nodeRef.current.clientHeight / 2

    scrollContainer.scrollTo({
      top: Math.max(0, nextScrollTop),
      behavior: 'smooth',
    })
  }, [selected, isFile, nodeId])

  return nodeRef
}
