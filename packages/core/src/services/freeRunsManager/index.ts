import { cache } from '../../cache'

function buildCacheKey(workspaceId: number, key: string) {
  const date = new Date()
  return `workspace:${workspaceId}:${date.toISOString().slice(0, 10)}:${key}`
}

export function buildFreeRunCacheKey(workspaceId: number) {
  return buildCacheKey(workspaceId, 'defaultProviderRunCount')
}

export async function getFreeRuns(workspaceId: number) {
  const c = await cache()
  const key = buildFreeRunCacheKey(workspaceId)

  try {
    return await c.get(key)
  } catch (_e) {
    // do nothing
  }
}

export async function incrFreeRuns(workspaceId: number) {
  const c = await cache()
  const key = buildFreeRunCacheKey(workspaceId)

  try {
    return await c.incr(key)
  } catch (_e) {
    // do nothing
  }
}
