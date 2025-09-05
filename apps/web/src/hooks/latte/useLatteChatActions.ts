'use client'

import { addMessageToLatteAction } from '$/actions/latte/addMessage'
import { createNewLatteAction } from '$/actions/latte/new'
import { stopChatLatteAction } from '$/actions/latte/stopChat'
import { useLatteStore } from '$/stores/latte'
import { useCallback } from 'react'
import { useServerAction } from 'zsa-react'
import { useLatteContext } from './context'
import { LatteInteraction } from './types'

/**
 * Provides chat actions for Latte conversations including creating new chats and sending messages.
 *
 * @returns An object containing:
 *   - `sendMessage`: Function to send a message to the current or new Latte thread
 *   - `stopChat`: Function to stop the current active Latte response
 */
export function useLatteChatActions() {
  const latteContext = useLatteContext()
  const {
    threadUuid,
    setThreadUuid,
    setIsBrewing,
    setError,
    addInteractions,
    debugVersionUuid,
    setJobId: setJobId,
  } = useLatteStore()
  const { execute: createNewChat } = useServerAction(createNewLatteAction, {
    onSuccess: ({ data }) => {
      setThreadUuid(data.uuid)
      setJobId(data.jobId)
    },
    onError: ({ err }) => {
      setError(err.message)
      setIsBrewing(false)
    },
  })

  const { execute: addMessageToExistingChat } = useServerAction(
    addMessageToLatteAction,
    {
      onSuccess: ({ data }) => {
        setJobId(data.jobId)
      },
      onError: ({ err }) => {
        setError(err.message)
        setIsBrewing(false)
      },
    },
  )

  const { execute: stopChat } = useServerAction(stopChatLatteAction, {
    onSuccess: () => {
      setIsBrewing(false)
      setJobId(undefined)
    },
    onError: ({ err }) => {
      setError(err.message)
      setIsBrewing(false)
      setJobId(undefined)
    },
  })

  const sendMessage = useCallback(
    async (message: string) => {
      setIsBrewing(true)

      const newInteraction: LatteInteraction = {
        input: message,
        steps: [],
      }

      addInteractions([newInteraction])

      const context = await latteContext()

      if (threadUuid) addMessageToExistingChat({ threadUuid, message, context })
      else createNewChat({ message, context, debugVersionUuid })
    },
    [
      addInteractions,
      addMessageToExistingChat,
      createNewChat,
      latteContext,
      setIsBrewing,
      threadUuid,
      debugVersionUuid,
    ],
  )

  return { sendMessage, stopChat }
}
