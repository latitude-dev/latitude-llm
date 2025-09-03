import { useCallback, useEffect } from 'react'
import { LatteEditAction, LatteTool } from '@latitude-data/constants/latte'
import { LatteThreadUpdateArgs } from '@latitude-data/core/browser'
import { getDescriptionFromToolCall } from './helpers'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import { useLatteStore } from '$/stores/latte'
import { useLatteUsage } from './usage'
import { LatteActionStep, LatteInteractionStep, LatteToolStep } from './types'

/**
 * Handles real-time updates from the Latte thread via WebSocket connections.
 * Processes different types of updates including response deltas, tool completions,
 * and tool starts, updating the interactions state accordingly.
 */
export function useLatteThreadUpdates() {
  const {
    threadUuid,
    setInteractions,
    setIsBrewing,
    setError,
    setUsage,
    setIsLoadingUsage,
  } = useLatteStore()

  const {
    data: usage,
    isLoading: isLoadingUsage,
    isValidating: isValidatingUsage,
    mutate: mutateUsage,
  } = useLatteUsage()
  useEffect(() => setUsage(usage), [usage, setUsage])
  useEffect(
    () => setIsLoadingUsage(isLoadingUsage || isValidatingUsage),
    [isLoadingUsage, isValidatingUsage, setIsLoadingUsage],
  )

  const handleThreadUpdate = useCallback(
    (update: LatteThreadUpdateArgs) => {
      const currentTimeAsString = new Date().toString()
      if (!update) {
        console.warn(
          'Received empty latteThreadUpdate event from server',
          currentTimeAsString,
        )
        return
      }
      const { threadUuid: incomingthreadUuid } = update
      if (!threadUuid) return
      if (threadUuid !== incomingthreadUuid) return

      if (update.type === 'error') {
        setError(update.error.message)
        setIsBrewing(false)
        return
      }

      if (update.type === 'usage') {
        mutateUsage(update.usage)
      }

      // React strict mode will call this function twice. this fixes that.
      let fuckReactStrictMode = false

      setInteractions((prev) => {
        if (fuckReactStrictMode) return prev
        fuckReactStrictMode = true

        if (!prev.length) return prev

        const otherInteractions = prev.slice(0, -1)
        const lastInteraction = [...prev.slice(-1)][0]!

        if (update.type === 'fullResponse') {
          lastInteraction.output = update.response
          setIsBrewing(false)
        }

        if (update.type === 'responseDelta') {
          lastInteraction.output = (lastInteraction.output ?? '') + update.delta
        }

        if (update.type === 'toolCompleted') {
          const finishedToolId = update.toolCallId
          lastInteraction.steps = lastInteraction.steps.map((step) => {
            if (
              step.type === 'tool' &&
              !step.finished &&
              step.id === finishedToolId
            ) {
              step.finished = true
            }
            return step
          })
        }

        if (update.type === 'toolStarted') {
          let steps: LatteInteractionStep[] = [
            {
              type: 'tool',
              id: update.toolCallId,
              toolName: update.toolName,
              parameters: update.args,
              finished: false,
              ...getDescriptionFromToolCall({
                toolCallId: update.toolCallId,
                toolName: update.toolName,
                args: update.args,
              }),
            } as LatteToolStep,
          ]

          if (update.toolName === LatteTool.editProject) {
            const actions = (
              update.args as {
                actions: LatteEditAction[]
              }
            ).actions

            steps = actions.map(
              (action) =>
                ({
                  type: 'action',
                  action,
                }) as LatteActionStep,
            )
          }

          if (update.toolName === LatteTool.think) {
            steps = [
              {
                type: 'thought',
                content: update.args['thought'] as string,
              },
            ]
          }

          lastInteraction.steps.push(...steps)
        }

        return [...otherInteractions, lastInteraction]
      })
    },
    [threadUuid, setInteractions, setIsBrewing, setError, mutateUsage],
  )

  useSockets({
    event: 'latteThreadUpdate',
    onMessage: handleThreadUpdate,
  })
}
