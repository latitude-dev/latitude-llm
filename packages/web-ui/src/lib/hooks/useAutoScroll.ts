import { RefObject, useEffect } from 'react'

export function useAutoScroll(
  ref: RefObject<HTMLDivElement>,
  options?: {
    startAtBottom?: boolean
    onScrollChange?: (isScrolledToBottom: boolean) => void
  },
) {
  const { startAtBottom = false } = options || {}

  useEffect(() => {
    const container = ref.current
    if (!container) return

    if (startAtBottom) container.scrollTop = container.scrollHeight

    let isScrolledToBottom = false

    const scrollHandler = () => {
      const newIsScrolledToBottom =
        container.scrollHeight - container.clientHeight <=
        container.scrollTop + 1

      if (newIsScrolledToBottom !== isScrolledToBottom) {
        isScrolledToBottom = newIsScrolledToBottom
        options?.onScrollChange?.(isScrolledToBottom)
      }
    }

    const resizeHandler = () => {
      if (isScrolledToBottom) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight
        }, 0)
      }
    }

    const resizeObserver = new ResizeObserver(resizeHandler)
    resizeObserver.observe(container)

    const mutationObserver = new MutationObserver(resizeHandler)
    mutationObserver.observe(container, { childList: true, subtree: true })

    container.addEventListener('scroll', scrollHandler)
    scrollHandler()

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      container.removeEventListener('scroll', scrollHandler)
    }
  }, [])
}
