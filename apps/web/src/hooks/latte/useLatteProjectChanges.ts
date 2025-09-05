'use client'

import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import { useLatteStore } from '$/stores/latte/index'
import { LatteChange } from '@latitude-data/constants/latte'
import { useCallback } from 'react'
import { useUpdateLocalState } from './useUpdateLocalState'

/**
 * Handles real-time project changes from the Latte thread via WebSocket connections.
 * Processes incoming changes and updates the changes state, handling additions,
 * updates, and removals of changes based on the current thread.
 */
export function useLatteProjectChanges() {
  const { threadUuid, setLatteActionsFeedbackUuid } = useLatteStore()
  const updateLocalState = useUpdateLocalState()
  const onMessage = useCallback(
    async (msg: { threadUuid: string; changes: LatteChange[] }) => {
      if (!msg) {
        console.warn('Received empty latteProjectChanges event from server')
        return
      }
      const { threadUuid: incomingThreadUuid } = msg
      if (!threadUuid || threadUuid !== incomingThreadUuid) return

      setLatteActionsFeedbackUuid(undefined)
      updateLocalState()
    },
    [threadUuid, updateLocalState, setLatteActionsFeedbackUuid],
  )

  useSockets({
    event: 'latteProjectChanges',
    onMessage,
  })
}
