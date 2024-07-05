import { Conversation, ConversationMetadata } from '$/types'

import { Compile, type ReferencePromptFn } from './compile'
import { ReadMetadata } from './readMetadata'

export function compile({
  prompt,
  parameters,
  referenceFn,
}: {
  prompt: string
  parameters: Record<string, unknown>
  referenceFn?: ReferencePromptFn
}): Promise<Conversation> {
  return new Compile({ prompt, parameters, referenceFn }).run()
}

export function readMetadata({
  prompt,
  referenceFn,
  configSchema,
}: {
  prompt: string
  referenceFn?: ReferencePromptFn
  configSchema?: object
}): Promise<ConversationMetadata<typeof configSchema>> {
  return new ReadMetadata({ prompt, referenceFn, configSchema }).run()
}
