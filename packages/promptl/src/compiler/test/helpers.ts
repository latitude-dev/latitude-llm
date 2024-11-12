import {
  AssistantMessage,
  ContentType,
  Conversation,
  MessageContent,
} from '$promptl/types'
import { expect } from 'vitest'

import { Chain } from '../chain'

export async function getExpectedError<T>(
  action: () => Promise<unknown>,
  errorClass: new () => T,
): Promise<T> {
  try {
    await action()
  } catch (err) {
    expect(err).toBeInstanceOf(errorClass)
    return err as T
  }
  throw new Error('Expected an error to be thrown')
}

export async function complete({
  chain,
  callback,
  maxSteps = 50,
}: {
  chain: Chain
  callback?: (convo: Conversation) => Promise<string>
  maxSteps?: number
}): Promise<{
  response: MessageContent[]
  conversation: Conversation
  steps: number
}> {
  let steps = 0
  let conversation: Conversation

  let responseMessage: Omit<AssistantMessage, 'role'> | undefined
  while (true) {
    const { completed, conversation: _conversation } =
      await chain.step(responseMessage)

    conversation = _conversation

    if (completed)
      return {
        conversation,
        steps,
        response: responseMessage!.content as MessageContent[],
      }

    const response = callback ? await callback(conversation) : 'RESPONSE'
    responseMessage = { content: [{ type: ContentType.text, text: response }] }
    steps++

    if (steps > maxSteps) throw new Error('too many chain steps')
  }
}
