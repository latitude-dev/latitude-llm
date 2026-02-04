import { env } from '@latitude-data/env'
import {
  MessageRole,
  type Message,
} from '@latitude-data/constants/messages'
import { z } from 'zod'
import { Result, TypedResult } from '../../lib/Result'
import { runCopilot } from '../copilot/run'

const endActionSchema = z.object({
  action: z.literal('end'),
})

const respondActionSchema = z.object({
  action: z.literal('respond'),
  message: z.string(),
})

const userActionSchema = z.discriminatedUnion('action', [
  endActionSchema,
  respondActionSchema,
])

export type SimulatedUserAction = z.infer<typeof userActionSchema>

/**
 * Generates a simulated user action based on the conversation history.
 * The simulated user evaluates the assistant's response and decides whether to:
 * - End the conversation (action: "end")
 * - Continue with a new message (action: "respond", message: "...")
 *
 * This is used for multi-turn conversation simulation in experiments.
 */
export async function generateSimulatedUserAction({
  messages,
  simulationInstructions,
  currentTurn,
  maxTurns,
  abortSignal,
}: {
  messages: Message[]
  simulationInstructions?: string
  currentTurn: number
  maxTurns: number
  abortSignal?: AbortSignal
}): Promise<TypedResult<SimulatedUserAction, Error>> {
  const path = env.COPILOT_PROMPT_SIMULATE_USER_RESPONSE_PATH
  if (!path) {
    return Result.error(
      new Error('COPILOT_PROMPT_SIMULATE_USER_RESPONSE_PATH is not set'),
    )
  }

  const messageSample = messages.filter(
    (m) =>
      m.role === MessageRole.user ||
      m.role === MessageRole.assistant ||
      m.role === MessageRole.tool,
  )

  return runCopilot({
    path,
    parameters: {
      messages: messageSample,
      prompt: simulationInstructions,
      currentTurn,
      maxTurns,
    },
    schema: userActionSchema,
    abortSignal,
  })
}
