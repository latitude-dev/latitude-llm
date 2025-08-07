import type { Conversation, ConversationMetadata } from '$compiler/types'
import type { z } from 'zod'

import { Chain } from './chain'
import { ReadMetadata, type Document, type ReferencePromptFn } from './readMetadata'
import type { CompileOptions } from './types'

export async function render({
  prompt,
  parameters = {},
  ...options
}: {
  prompt: string
  parameters?: Record<string, unknown>
} & CompileOptions): Promise<Conversation> {
  const iterator = new Chain({ prompt, parameters, ...options })
  const { conversation, completed } = await iterator.step()
  if (!completed) {
    throw new Error('Use a Chain to render prompts with multiple steps')
  }
  return conversation
}

export function createChain({
  prompt,
  parameters,
  ...options
}: {
  prompt: string
  parameters: Record<string, unknown>
} & CompileOptions): Chain {
  return new Chain({ prompt, parameters, ...options })
}

export function readMetadata({
  prompt,
  fullPath,
  referenceFn,
  withParameters,
  configSchema,
}: {
  prompt: string
  fullPath?: string
  referenceFn?: ReferencePromptFn
  withParameters?: string[]
  configSchema?: z.ZodType
}): Promise<ConversationMetadata> {
  return new ReadMetadata({
    document: { path: fullPath ?? '', content: prompt },
    referenceFn,
    withParameters,
    configSchema,
  }).run()
}

export { Chain, type Document, type ReferencePromptFn }
