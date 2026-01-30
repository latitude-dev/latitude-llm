import { hash } from 'crypto'
import { omit } from 'lodash-es'

import { ChainStepResponse, StreamType } from '@latitude-data/constants/ai'
import { cache } from '../../cache'
import { Config, Conversation } from 'promptl-ai'
import { type Workspace } from '../../schema/models/types/Workspace'

function cleanResponse<T extends StreamType>(response: ChainStepResponse<T>) {
  return omit<ChainStepResponse<T>, ['documentLogUuid']>(
    response,
    'documentLogUuid',
  )
}

type CachedChainResponse<T extends StreamType> = ReturnType<
  typeof cleanResponse<T>
>

function generateCacheKey(
  workspace: Workspace,
  config: Config,
  conversation: Conversation,
): string {
  const k = hash(
    'sha256',
    `${JSON.stringify(conversation)}:${JSON.stringify(config)}`,
  )

  return `workspace:${workspace.id}:prompt:${k}`
}

function shouldCache(config: Config): boolean {
  const temp = parseFloat(config.temperature as any)
  return isNaN(temp) || temp === 0
}

async function getFromCache(
  key: string,
): Promise<CachedChainResponse<StreamType> | undefined> {
  try {
    const c = await cache()
    const cachedResponseStr = await c.get(key)
    return cachedResponseStr ? JSON.parse(cachedResponseStr) : undefined
  } catch (_e) {
    return undefined
  }
}

async function setToCache<T extends StreamType>(
  key: string,
  response: CachedChainResponse<T>,
) {
  try {
    const c = await cache()
    await c.set(key, JSON.stringify(response))
  } catch (_e) {
    // Silently fail cache writes
  }
}

export async function getCachedResponse({
  workspace,
  config,
  conversation,
}: {
  workspace: Workspace
  config: Config
  conversation: Conversation
}) {
  if (!shouldCache(config)) return undefined

  const key = generateCacheKey(workspace, config, conversation)
  return await getFromCache(key)
}

export async function setCachedResponse<T extends StreamType>({
  workspace,
  config,
  conversation,
  response,
}: {
  workspace: Workspace
  config: Config
  conversation: Conversation
  response: ChainStepResponse<T>
}) {
  if (!shouldCache(config)) return

  const key = generateCacheKey(workspace, config, conversation)

  if (response.streamType !== 'text' && response.streamType !== 'object') {
    throw new Error(
      'Invalid "streamType" response, it should be "text" or "object"',
    )
  }
  const data = cleanResponse(response)
  await setToCache(key, data)
}
