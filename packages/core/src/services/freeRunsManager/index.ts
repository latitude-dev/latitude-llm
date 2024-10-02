import { cache } from '../../cache'

export async function getFreeRuns(workspaceId: number) {
  const c = await cache()
  const date = new Date()
  const key = `workspace:${workspaceId}:${date.toISOString().slice(0, 10)}:defaultProviderRunCount`

  return await c.get(key)
}

export async function incrFreeRuns(workspaceId: number) {
  const c = await cache()
  const date = new Date()
  const key = `workspace:${workspaceId}:${date.toISOString().slice(0, 10)}:defaultProviderRunCount`

  return await c.incr(key)
}
