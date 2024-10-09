import { cache } from '../../cache'

function buildCacheKey(workspaceId: number, date: Date) {
  return `workspace:${workspaceId}:${date.toISOString().slice(0, 10)}:defaultProviderRunCount`
}
export async function getFreeRuns(workspaceId: number) {
  const c = await cache()
  const date = new Date()
  const key = buildCacheKey(workspaceId, date)

  return await c.get(key)
}

export async function incrFreeRuns(workspaceId: number) {
  console.log("INCR FREE RUNS")
  const c = await cache()
  const date = new Date()
  const key = buildCacheKey(workspaceId, date)

  return await c.incr(key)
}
