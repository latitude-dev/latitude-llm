import { hash } from 'crypto'

import { Config, Conversation } from '@latitude-data/compiler'

import { ChainStepResponse, StreamType, type Workspace } from '../../browser'
import { cache } from '../../cache'

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
): Promise<ChainStepResponse<StreamType> | undefined> {
  try {
    const c = await cache()
    const cachedResponseStr = await c.get(key)
    return cachedResponseStr ? JSON.parse(cachedResponseStr) : undefined
  } catch (e) {
    return undefined
  }
}

async function setToCache(
  key: string,
  response: ChainStepResponse<StreamType>,
): Promise<void> {
  try {
    const c = await cache()
    await c.set(key, JSON.stringify(response))
  } catch (e) {
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

export async function setCachedResponse({
  workspace,
  config,
  conversation,
  response,
}: {
  workspace: Workspace
  config: Config
  conversation: Conversation
  response: ChainStepResponse<StreamType>
}) {
  if (!shouldCache(config)) return

  const key = generateCacheKey(workspace, config, conversation)
  await setToCache(key, response)
}
