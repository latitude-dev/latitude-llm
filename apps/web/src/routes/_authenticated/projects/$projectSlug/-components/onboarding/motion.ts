import { useEffect, useState } from "react"

/**
 * House animation timings for the onboarding right-pane previews. Keep the Tailwind
 * `duration-*` classes used across the panes in sync with this convention: enters use
 * `duration-300`, exits use `duration-200`. `MOTION_EXIT_MS` is the JS-driven unmount
 * delay and must match the `duration-200` exit classes exactly.
 */
export const MOTION_EXIT_MS = 200

/** Dwell time per image before the intro gallery auto-advances. */
export const GALLERY_DWELL_MS = 5000

/**
 * Tracks `prefers-reduced-motion: reduce`. Initializes `false` for SSR and reads the real
 * value after mount, so callers can disable JS-driven motion (e.g. carousel auto-advance)
 * that CSS `motion-reduce:` utilities can't reach.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return reduced
}
