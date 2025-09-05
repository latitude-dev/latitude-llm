import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useEvents } from '$/lib/events'
import { useMemo } from 'react'
import { useUpdateLocalState } from './useUpdateLocalState'

export function useLatteEventHandlers() {
  const { document } = useCurrentDocument()
  const updateLocalState = useUpdateLocalState()

  const events = useMemo(
    () => ({
      onLatteChangesAccepted: () => {
        updateLocalState()
      },
      onLatteChangesRejected: () => {
        updateLocalState()
      },
    }),
    [updateLocalState],
  )

  return useEvents(events, [document])
}
