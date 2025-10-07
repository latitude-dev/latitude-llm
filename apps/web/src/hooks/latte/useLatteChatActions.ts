'use client'

import { addMessageToLatteAction } from '$/actions/latte/addMessage'
import { createNewLatteAction } from '$/actions/latte/new'
import { stopChatLatteAction } from '$/actions/latte/stopChat'
import { useLatteStore } from '$/stores/latte/index'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCallback } from 'react'
import { useLatteContext } from './context'
import { LatteInteraction } from './types'
import { useAction } from 'next-safe-action/hooks'
import { buildActionError } from '$/hooks/useLatitudeAction'

/**
 * Provides chat actions for Latte conversations including creating new chats and sending messages.
 *
 * @returns An object containing:
 *   - `sendMessage`: Function to send a message to the current or new Latte thread
 *   - `stopChat`: Function to stop the current active Latte response
 */
export function useLatteChatActions() {
  const { context: latteContext } = useLatteContext()
  const { project } = useCurrentProject()
  const projectId = project.id
  const {
    threadUuid,
    setThreadUuid,
    setIsBrewing,
    setError,
    addInteractions,
    debugVersionUuid,
    setJobId: setJobId,
  } = useLatteStore()
  const { execute: createNewChat } = useAction(createNewLatteAction, {
    onSuccess: ({ data }) => {
      setThreadUuid(data.uuid)
      setJobId(data.jobId)
    },
    onError: (err) => {
      setError(buildActionError(err.error))
      setIsBrewing(false)
    },
  })

  const { execute: addMessageToExistingChat } = useAction(
    addMessageToLatteAction,
    {
      onSuccess: ({ data }) => {
        setJobId(data.jobId)
      },
      onError: (err) => {
        setError(buildActionError(err.error))
        setIsBrewing(false)
      },
    },
  )

  const { execute: stopChat } = useAction(stopChatLatteAction, {
    onSuccess: () => {
      setIsBrewing(false)
      setJobId(undefined)
    },
    onError: (err) => {
      setError(buildActionError(err.error))
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

      if (threadUuid) {
        addMessageToExistingChat({
          threadUuid,
          projectId,
          message,
          context: latteContext,
          debugVersionUuid,
        })
      } else {
        createNewChat({
          projectId,
          message,
          context: latteContext,
          debugVersionUuid,
        })
      }
    },
    [
      addInteractions,
      addMessageToExistingChat,
      createNewChat,
      latteContext,
      setIsBrewing,
      threadUuid,
      debugVersionUuid,
      projectId,
    ],
  )

  return { sendMessage, stopChat }
}
