import { LatteChange } from '@latitude-data/constants/latte'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import { trigger } from '$/lib/events'
import { useLatteStore } from '$/stores/latte'

/**
 * Handles real-time project changes from the Latte thread via WebSocket connections.
 * Processes incoming changes and updates the changes state, handling additions,
 * updates, and removals of changes based on the current thread.
 */
export function useLatteProjectChanges() {
  const { threadUuid, setChanges, setLatteActionsFeedbackUuid } =
    useLatteStore()

  useSockets({
    event: 'latteProjectChanges',
    onMessage: (msg: { threadUuid: string; changes: LatteChange[] }) => {
      if (!msg) {
        console.warn('Received empty latteProjectChanges event from server')
        return
      }
      const { threadUuid: incomingThreadUuid, changes: newChanges } = msg

      trigger('LatteProjectChanges', { changes: newChanges })
      if (!threadUuid || threadUuid !== incomingThreadUuid) return

      setLatteActionsFeedbackUuid(undefined)

      // Update the changes state: Update existing changes, add new ones, and remove equal changes
      setChanges((prevChanges) => {
        const updatedChanges = [...prevChanges]

        newChanges.forEach((newChange) => {
          const index = updatedChanges.findIndex(
            (change) =>
              change.draftUuid === newChange.draftUuid &&
              change.current.documentUuid === newChange.current.documentUuid,
          )

          if (index === -1) {
            // Add new change
            updatedChanges.push(newChange)
            return
          }

          // Change already exists
          const existingChange = updatedChanges[index]!

          if (existingChange.previous === newChange.current) {
            // Change returned the prompt to the previous state, remove from changes
            updatedChanges.splice(index, 1)
            return
          }

          // Update existing change
          updatedChanges[index]!.current = newChange.current
        })

        return updatedChanges
      })
    },
  })
}
