import type { RefObject } from "react"
import { useEffect, useState } from "react"
import { quantizeWidth } from "./pdf-render-math.ts"

/**
 * Observed width minus `inset`, quantized so a resize drag re-renders the canvas a handful of
 * times rather than once per observer tick.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, inset = 0): number {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0
      setWidth(quantizeWidth(Math.max(measured - inset, 0)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, inset])

  return width
}
