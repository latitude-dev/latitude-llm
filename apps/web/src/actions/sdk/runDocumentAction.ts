'use server'

import type { Latitude } from '@latitude-data/sdk'
import type { StreamableValue } from 'ai/rsc'
import type { ChainEvent } from '@latitude-data/constants'
export type RunDocumentResponse = Promise<{
  output: StreamableValue<ChainEvent>
  response: ReturnType<typeof Latitude.prototype.prompts.run>
}>
