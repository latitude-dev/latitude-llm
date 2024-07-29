import { Conversation, ConversationMetadata } from '$compiler/types'

import { Chain } from './chain'
import { type ReferencePromptFn } from './compile'
import { ReadMetadata } from './readMetadata'

export async function render({
  prompt,
  parameters,
}: {
  prompt: string
  parameters: Record<string, unknown>
}): Promise<Conversation> {
  const iterator = new Chain({ prompt, parameters })
  const { conversation, completed } = await iterator.step()
  if (!completed) {
    throw new Error('Use a Chain to render prompts with multiple steps')
  }
  return conversation
}

export function createChain({
  prompt,
  parameters,
}: {
  prompt: string
  parameters: Record<string, unknown>
}): Chain {
  return new Chain({ prompt, parameters })
}

export function readMetadata({
  prompt,
  referenceFn,
}: {
  prompt: string
  referenceFn?: ReferencePromptFn
}): Promise<ConversationMetadata> {
  return new ReadMetadata({ prompt, referenceFn }).run()
}

export { Chain }
