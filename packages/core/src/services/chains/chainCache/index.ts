import { hash } from 'crypto'
import {
  Chain as PromptlChain,
  type SerializedChain,
  Message,
} from 'promptl-ai'

import { Workspace } from '../../../browser'
import { cache } from '../../../cache'

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

async function setToCache(key: string, chain: SerializedChain) {
  try {
    const c = await cache()
    await c.set(key, JSON.stringify(chain))
  } catch (e) {
    // Silently fail cache writes
  }
}

async function getFromCache(
  key: string,
): Promise<PromptlChain<Message> | undefined> {
  try {
    const c = await cache()
    const cachedResponseStr = await c.get(key)
    return PromptlChain.deserialize({ serialized: cachedResponseStr })
  } catch (e) {
    return undefined
  }
}

export async function getCachedChain({
  documentLogUuid,
  workspace,
}: {
  documentLogUuid: string
  workspace: Workspace
}) {
  const key = generateCacheKey({ documentLogUuid, workspace })
  return await getFromCache(key)
}

export async function cacheChain({
  workspace,
  documentLogUuid,
  chain,
}: {
  workspace: Workspace
  chain: PromptlChain<Message>
  documentLogUuid: string
}) {
  const key = generateCacheKey({ documentLogUuid, workspace })
  const serialized = chain.serialize()
  await setToCache(key, serialized)
}
