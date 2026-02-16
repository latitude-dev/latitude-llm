'use server'

import { ChainEvent } from '@latitude-data/constants'
import { Latitude } from '@latitude-data/sdk'
import { StreamableValue } from '@ai-sdk/rsc'

export type RunDocumentResponse = Promise<{
  output: StreamableValue<ChainEvent>
  response: ReturnType<typeof Latitude.prototype.prompts.run>
}>
