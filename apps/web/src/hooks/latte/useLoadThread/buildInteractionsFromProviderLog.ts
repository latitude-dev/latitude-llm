import { LatteInteraction, LatteStepGroupItem, LatteToolStep } from '../types'
import {
  TextContent,
  ToolRequestContent,
  MessageContent,
  ToolMessage,
} from '@latitude-data/constants/messages'

import { getDescriptionFromToolCall } from '$/hooks/latte/helpers'
import { ProviderLogDto } from '@latitude-data/core/schema/types'

function isToolCall(m: MessageContent): m is ToolRequestContent {
  return m.type === 'tool-call'
}

function isText(m: MessageContent): m is TextContent {
  return m.type === 'text'
}

function applyToolResult(
  interactions: LatteInteraction[],
  message: ToolMessage,
): LatteInteraction[] {
  const lastInteraction = interactions.at(-1)
  if (!lastInteraction) return interactions

  const toolResults = message.content.filter((c) => c.type === 'tool-result')

  if (toolResults.length === 0) return interactions

  const updatedSteps = lastInteraction.steps.map((step) => {
    if (step.type !== 'group') return step

    return {
      ...step,
      steps: step.steps.map((s) => {
        if (s.type === 'tool') {
          const matchingResult = toolResults.find((r) => r.toolCallId === s.id)
          if (matchingResult) {
            return { ...s, finished: true }
          }
        }
        return s
      }),
    }
  })

  lastInteraction.steps = updatedSteps
  return [...interactions.slice(0, -1), lastInteraction]
}

type AssitantToolContent = ToolRequestContent
function buildStepGroup(content: AssitantToolContent) {
  const toolCallId = content.toolCallId
  const toolName = content.toolName
  const args = content.args
  const description = getDescriptionFromToolCall({
    toolCall: {
      toolCallId,
      toolName,
      args,
    },
  })

  return {
    type: 'tool',
    id: toolCallId,
    toolName,
    parameters: args,
    finished: false,
    activeDescription: description.activeDescription ?? 'Processing...',
    finishedDescription: description.finishedDescription,
    customIcon: description.customIcon,
  } as LatteToolStep
}

/**
 * iterate over provider log messages and transform them to an array of interactions.
 * Interactors are input/output pairs input defined as any message from a user and outputs
 * defined as all messages not from user until the next user message.
 */
export function buildInteractionsFromProviderLog({
  providerLog,
}: {
  providerLog: ProviderLogDto
}) {
  const messages = providerLog.messages || []
  const interactions = messages.reduce((interactions, message) => {
    if (message.role === 'user') {
      const input = Array.isArray(message.content)
        ? (message.content.filter((t) => t.type === 'text').at(-1)?.text ?? '')
        : message.content
      interactions.push({ input, steps: [] })
      return interactions
    }

    if (interactions.length === 0) return interactions

    const lastInteraction = interactions.at(-1)! as LatteInteraction

    if (message.role === 'tool') {
      return applyToolResult(interactions, message as ToolMessage)
    }

    if (message.role !== 'assistant') return interactions

    const content = Array.isArray(message.content)
      ? message.content
      : [
          {
            type: 'text',
            text: message.content,
          } satisfies TextContent,
        ]

    content.filter(isText).forEach((m) => {
      lastInteraction.steps.push({
        type: 'text',
        text: m.text || '',
      })
    })

    const groupSteps = content
      .filter(isToolCall)
      .map<LatteStepGroupItem>(buildStepGroup)
      .filter((obj) => obj !== null)

    if (groupSteps.length > 0) {
      lastInteraction.steps.push({
        type: 'group',
        steps: groupSteps,
      })
    }
    return interactions
  }, [] as LatteInteraction[])

  const lastInteraction = interactions.at(-1) ?? null

  if (lastInteraction && providerLog.response) {
    lastInteraction.steps.push({
      type: 'text',
      text: providerLog.response,
    })
  }

  return interactions
}
