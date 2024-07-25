import { Conversation, ConversationMetadata } from '$compiler/types'

import { Compile, type ReferencePromptFn } from './compile'
import { ReadMetadata } from './readMetadata'

export function compile({
  prompt,
  parameters,
}: {
  prompt: string
  parameters: Record<string, unknown>
}): Promise<Conversation> {
  return new Compile({ prompt, parameters }).run()
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
