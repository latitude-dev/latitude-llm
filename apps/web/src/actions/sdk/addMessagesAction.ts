'use server'

import type { StreamChainResponse } from '@latitude-data/sdk'
import type { StreamableValue } from 'ai/rsc'
import type { ChainEvent } from '@latitude-data/constants'

export type AddMessagesResponse = Promise<{
  output: StreamableValue<ChainEvent>
  response: Promise<StreamChainResponse | undefined>
}>
