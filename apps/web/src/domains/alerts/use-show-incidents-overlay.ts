import { useLocalStorage } from "@repo/ui"
import { useCallback } from "react"

const STORAGE_KEY = "alerts.show-incidents-overlay.v1"

interface UseShowIncidentsOverlayResult {
  /** Always true; kept so consumers can share the same overlay state shape. */
  readonly flagEnabled: boolean
  /** Persisted user preference for showing the overlay. Defaults to `true` on first visit. */
  readonly showIncidents: boolean
  /** Convenience active state for callers to pass to `enabled`. */
  readonly active: boolean
  readonly setShowIncidents: (next: boolean | ((prev: boolean) => boolean)) => void
}

/**
 * Single source of truth for the "incidents overlay" toggle shared by the Traces and Signals
 * histograms. The preference is stored in localStorage (per-tab; no cross-tab sync, but the
 * default is `true` so a fresh tab still surfaces the overlay).
 *
 */
export function useShowIncidentsOverlay(): UseShowIncidentsOverlayResult {
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
    flagEnabled: true,
    showIncidents: stored,
    active: stored,
    setShowIncidents,
  }
}
