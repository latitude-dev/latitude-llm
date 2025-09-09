import { useCallback, useEffect } from 'react'
import { LatteEditAction, LatteTool } from '@latitude-data/constants/latte'
import { LatteThreadUpdateArgs } from '@latitude-data/core/browser'
import { getDescriptionFromToolCall } from './helpers'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import { useLatteStore } from '$/stores/latte/index'
import { useLatteUsage } from './usage'
import {
  LatteActionStep,
  LatteToolStep,
  LatteThoughtStep,
  LatteStepGroupItem,
} from './types'

/**
 * Creates a tool step from the tool started update
 */
function createToolStep(
  update: Extract<LatteThreadUpdateArgs, { type: 'toolStarted' }>,
): LatteToolStep {
  const description = getDescriptionFromToolCall({
    toolCallId: update.toolCallId,
    toolName: update.toolName,
    args: update.args,
  })

  return {
    type: 'tool',
    id: update.toolCallId,
    toolName: update.toolName,
    parameters: update.args,
    finished: false,
    activeDescription: description.activeDescription ?? 'Processing...',
    finishedDescription: description.finishedDescription,
    customIcon: description.customIcon,
  }
}

/**
 * Creates action steps from edit project tool calls
 */
function createActionSteps(
  update: Extract<LatteThreadUpdateArgs, { type: 'toolStarted' }>,
): LatteActionStep[] {
  const actions = (update.args as { actions: LatteEditAction[] }).actions
  return actions.map((action) => ({
    type: 'action',
    action,
  }))
}

/**
 * Creates a thought step from think tool calls
 */
function createThoughtStep(
  update: Extract<LatteThreadUpdateArgs, { type: 'toolStarted' }>,
): LatteThoughtStep {
  return {
    type: 'thought',
    content: update.args['thought'] as string,
  }
}

/**
 * Processes tool started update and returns the appropriate steps
 */
function processToolStartedUpdate(
  update: Extract<LatteThreadUpdateArgs, { type: 'toolStarted' }>,
): LatteStepGroupItem[] {
  if (update.toolName === LatteTool.editProject) {
    return createActionSteps(update)
  }

  if (update.toolName === LatteTool.think) {
    return [createThoughtStep(update)]
  }

  return [createToolStep(update)]
}

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
    addIntegrationId,
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

      if (update.type === 'fullResponse') {
        // Handle fullResponse outside of setInteractions to ensure setIsBrewing is called
        setIsBrewing(false)
      }

      if (
        update.type === 'toolCompleted' &&
        update.toolName === LatteTool.createIntegration
      ) {
        // TODO: Nasty hack
        if ('id' in update.result) {
          const integrationId = update.result.id as number
          addIntegrationId(integrationId)
        }
      }

      setInteractions((prev) => {
        if (fuckReactStrictMode) return prev

        fuckReactStrictMode = true

        if (!prev.length) return prev

        const otherInteractions = prev.slice(0, -1)
        const lastInteraction = [...prev.slice(-1)][0]!

        const lastStep = lastInteraction.steps[lastInteraction.steps.length - 1]

        if (update.type === 'responseDelta') {
          if (lastStep?.type === 'text') {
            lastStep.text += update.delta
          } else {
            lastInteraction.steps.push({
              type: 'text',
              text: update.delta,
            })
          }
        } else if (update.type === 'toolCompleted') {
          const finishedToolId = update.toolCallId

          if (lastStep && lastStep.type === 'group') {
            lastStep.steps = lastStep.steps.map((groupStep) => {
              if (
                groupStep.type === 'tool' &&
                !groupStep.finished &&
                groupStep.id === finishedToolId
              ) {
                groupStep.finished = true
              }
              return groupStep
            })
          }
        } else if (update.type === 'toolStarted') {
          const newSteps = processToolStartedUpdate(update)

          if (lastStep && lastStep.type === 'group') {
            lastStep.steps.push(...newSteps)
          } else {
            lastInteraction.steps.push({
              type: 'group',
              steps: newSteps,
            })
          }
        }

        return [...otherInteractions, lastInteraction]
      })
    },
    [
      threadUuid,
      setInteractions,
      setIsBrewing,
      setError,
      mutateUsage,
      addIntegrationId,
    ],
  )

  useSockets({
    event: 'latteThreadUpdate',
    onMessage: handleThreadUpdate,
  })
}
