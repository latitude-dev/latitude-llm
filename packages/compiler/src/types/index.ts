import type { ErrorObject } from 'ajv'
import { JTDDataType } from 'ajv/dist/core'

import { Message } from './message'

export type Conversation = {
  config: Record<string, unknown>
  messages: Message[]
}

export type ConversationMetadata<ConfigSchema> = {
  hash: string // Unique string identifying the conversation
  config: JTDDataType<ConfigSchema>
  parameters: Set<string> // Variables used in the prompt that have not been defined in runtime
  referencedPrompts: Set<string>
  schemaValidation: undefined | true | ErrorObject[] // True if the configuration schema is valid, or an array of errors otherwise. Undefined if the schema is not provided.
}

export * from './message'
