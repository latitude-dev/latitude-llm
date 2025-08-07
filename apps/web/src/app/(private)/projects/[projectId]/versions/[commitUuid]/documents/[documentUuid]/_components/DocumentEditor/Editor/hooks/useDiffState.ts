import { useState } from 'react'
import type { DiffOptions } from '@latitude-data/web-ui/molecules/DocumentTextEditor/types'

export function useDiffState(initialDiff?: string, onChange?: (newValue: string) => void) {
  const [diff, setDiff] = useState<DiffOptions | undefined>(
    initialDiff
      ? {
          newValue: initialDiff,
          onAccept: (newValue: string) => {
            setDiff(undefined)
            onChange?.(newValue)
            // Remove applyExperimentId from URL
            if (window?.location) {
              const url = new URL(window.location.href)
              url.searchParams.delete('applyExperimentId')
              window.history.replaceState({}, '', url.toString())
            }
          },
          onReject: () => {
            setDiff(undefined)
            // Remove applyExperimentId from URL
            if (window?.location) {
              const url = new URL(window.location.href)
              url.searchParams.delete('applyExperimentId')
              window.history.replaceState({}, '', url.toString())
            }
          },
        }
      : undefined,
  )
  return { diff, setDiff }
}
