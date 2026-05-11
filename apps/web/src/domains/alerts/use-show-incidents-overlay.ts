import { useLocalStorage } from "@repo/ui"
import { useCallback } from "react"
import { useHasFeatureFlag } from "../feature-flags/feature-flags.collection.ts"

const STORAGE_KEY = "alerts.show-incidents-overlay.v1"
const FEATURE_FLAG_KEY = "timeline-incidents"

interface UseShowIncidentsOverlayResult {
  /** True when the org has the `timeline-incidents` flag enabled. Gates both UI and queries. */
  readonly flagEnabled: boolean
  /** Persisted user preference for showing the overlay. Defaults to `true` on first visit. */
  readonly showIncidents: boolean
  /** Convenience: `flagEnabled && showIncidents` — what callers usually pass to `enabled`. */
  readonly active: boolean
  readonly setShowIncidents: (next: boolean | ((prev: boolean) => boolean)) => void
}

/**
 * Single source of truth for the "incidents overlay" toggle shared by the Traces and Issues
 * histograms. The preference is stored in localStorage (per-tab; no cross-tab sync, but the
 * default is `true` so a fresh tab still surfaces the overlay).
 *
 * Components that draw incidents independently of the toggle (e.g. the issue detail drawer's
 * always-on per-issue trend) should still gate on `flagEnabled`.
 */
export function useShowIncidentsOverlay(): UseShowIncidentsOverlayResult {
  const flagEnabled = useHasFeatureFlag(FEATURE_FLAG_KEY)
  const { value: stored, setValue: setStored } = useLocalStorage<boolean>({
    key: STORAGE_KEY,
    defaultValue: true,
  })

  const setShowIncidents = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setStored(next)
    },
    [setStored],
  )

  return {
    flagEnabled,
    showIncidents: stored,
    active: flagEnabled && stored,
    setShowIncidents,
  }
}
