import { hash } from 'crypto'
import {
  Chain as PromptlChain,
  type SerializedChain,
  Message,
} from 'promptl-ai'

import { Workspace } from '../../../browser'
import { cache } from '../../../cache'

type CachedChain = {
  chain: PromptlChain<Message>
  messages: Message[]
}

function generateCacheKey({
  workspace,
  documentLogUuid,
}: {
  workspace: Workspace
  documentLogUuid: string
}): string {
  const k = hash('sha256', `${documentLogUuid}`)
  return `workspace:${workspace.id}:chain:${k}`
}

async function setToCache({
  key,
  chain,
  messages,
}: {
  key: string
  chain: SerializedChain
  messages: Message[]
}) {
  try {
    const c = await cache()
    await c.set(key, JSON.stringify({ chain, messages }))
  } catch (e) {
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

    if (!chain || !deserialized.messages) return undefined
    return { chain, messages: deserialized.messages ?? [] }
  } catch (e) {
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
  } catch (e) {
    // Silently fail cache writes
  }
}

export async function cacheChain({
  workspace,
  documentLogUuid,
  chain,
  responseMessages,
}: {
  workspace: Workspace
  chain: PromptlChain<Message>
  responseMessages: Message[]
  documentLogUuid: string
}) {
  const key = generateCacheKey({ documentLogUuid, workspace })
  const serialized = chain.serialize()

  await setToCache({ key, chain: serialized, messages: responseMessages })
}
