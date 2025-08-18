'use client'

import { RefObject, useEffect } from 'react'

export function useAutoScroll(
  ref: RefObject<HTMLDivElement>,
  options?: {
    startAtBottom?: boolean
    onScrollChange?: (isScrolledToBottom: boolean) => void
  },
) {
  const { startAtBottom = false, onScrollChange } = options || {}

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
        onScrollChange?.(isScrolledToBottom)
      }
    }

    const resizeHandler = () => {
      if (isScrolledToBottom) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight
        }, 0)
      }
    }

    const mutationObserver = new MutationObserver((mutations) => {
      const hasContentChanges = mutations.some(
        (mutation) =>
          mutation.type === 'childList' || mutation.type === 'characterData',
      )

      if (hasContentChanges && isScrolledToBottom) {
        resizeHandler()
      }
    })

    const resizeObserver = new ResizeObserver(resizeHandler)
    resizeObserver.observe(container)
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    container.addEventListener('scroll', scrollHandler)
    scrollHandler()

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      container.removeEventListener('scroll', scrollHandler)
    }
  }, [startAtBottom, onScrollChange, ref])
}
