import {
  AdapterMessageType,
  Adapters,
  ProviderAdapter,
} from '$promptl/providers'
import { ProviderConversation } from '$promptl/providers/adapter'
import { ConversationMetadata, Message } from '$promptl/types'
import { z } from 'zod'

import { Chain } from './chain'
import { ReadMetadata } from './readMetadata'
import type { CompileOptions, Document, ReferencePromptFn } from './types'

export async function render<M extends AdapterMessageType = Message>({
  prompt,
  parameters = {},
  adapter = Adapters.default as ProviderAdapter<M>,
  ...compileOptions
}: {
  prompt: string
  parameters?: Record<string, unknown>
  adapter?: ProviderAdapter<M>
} & CompileOptions): Promise<ProviderConversation<M>> {
  const iterator = new Chain({ prompt, parameters, adapter, ...compileOptions })
  const { conversation } = await iterator.step()
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
