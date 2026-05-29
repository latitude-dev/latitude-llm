import { useMountEffect } from "@repo/ui"
import { useState } from "react"

/** Dwell time per image before the intro gallery auto-advances. */
export const GALLERY_DWELL_MS = 5000

/**
 * Tracks `prefers-reduced-motion: reduce`. Initializes `false` for SSR and reads the real
 * value after mount, so callers can disable JS-driven motion (e.g. carousel auto-advance)
 * that CSS `motion-reduce:` utilities can't reach.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useMountEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  })

  return reduced
}
