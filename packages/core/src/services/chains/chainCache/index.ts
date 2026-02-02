import {
  Chain as PromptlChain,
  type SerializedChain,
  Message,
} from 'promptl-ai'

import { type Workspace } from '../../../schema/models/types/Workspace'
import { cache } from '../../../cache'
import { ChainStepResponse, StreamType } from '@latitude-data/constants'

type CachedChain = {
  chain: PromptlChain<Message>
  previousResponse: ChainStepResponse<StreamType>
}

function generateCacheKey({
  workspace,
  documentLogUuid,
}: {
  workspace: Workspace
  documentLogUuid: string
}): string {
  return `workspace:${workspace.id}:chain:${documentLogUuid}`
}

async function setToCache({
  key,
  chain,
  previousResponse,
}: {
  key: string
  chain: SerializedChain
  previousResponse?: ChainStepResponse<StreamType>
}) {
  try {
    const c = await cache()
    await c.set(key, JSON.stringify({ chain, previousResponse }))
  } catch (_e) {
    // Silently fail cache writes
  }
}

async function getFromCache(key: string): Promise<CachedChain | undefined> {
  try {
    const c = await cache()
    const serialized = await c.get(key)
    if (!serialized) return undefined

    const deserialized = JSON.parse(serialized)
    const chain = PromptlChain.deserialize({ serialized: deserialized.chain })

    if (!chain || !deserialized.previousResponse) {
      return undefined
    }

    return {
      chain,
      previousResponse: deserialized.previousResponse,
    }
  } catch (_e) {
    return undefined
  }
}

export async function getCachedChain({
  documentLogUuid,
  workspace,
}: {
  documentLogUuid: string | undefined
  workspace: Workspace
}) {
  if (!documentLogUuid) return undefined

  const key = generateCacheKey({ documentLogUuid, workspace })
  return await getFromCache(key)
}

export async function deleteCachedChain({
  documentLogUuid,
  workspace,
}: {
  documentLogUuid: string
  workspace: Workspace
}) {
  const key = generateCacheKey({ documentLogUuid, workspace })
  try {
    const c = await cache()
    await c.del(key)
  } catch (_e) {
    // Silently fail cache writes
  }
}

export async function cacheChain({
  workspace,
  documentLogUuid,
  chain,
  previousResponse,
}: {
  workspace: Workspace
  chain: PromptlChain<Message>
  documentLogUuid: string
  previousResponse?: ChainStepResponse<StreamType>
}) {
  const key = generateCacheKey({ documentLogUuid, workspace })
  const serialized = chain.serialize()

  await setToCache({
    key,
    chain: serialized,
    previousResponse,
  })
}
