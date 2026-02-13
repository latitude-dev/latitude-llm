import { cache } from '../../cache'

const CURSOR_TTL = 7 * 24 * 60 * 60 // 7 days

function cursorKey(jobName: string, workspaceId: number) {
  return `backfill:${jobName}:${workspaceId}:cursor`
}

export async function saveCursor(
  jobName: string,
  workspaceId: number,
  cursor: Record<string, unknown>,
) {
  const redis = await cache()
  await redis.set(
    cursorKey(jobName, workspaceId),
    JSON.stringify(cursor),
    'EX',
    CURSOR_TTL,
  )
}

export async function loadCursor<T extends Record<string, unknown>>(
  jobName: string,
  workspaceId: number,
): Promise<T | null> {
  const redis = await cache()
  const raw = await redis.get(cursorKey(jobName, workspaceId))
  if (!raw) return null
  return JSON.parse(raw) as T
}

export async function clearCursor(jobName: string, workspaceId: number) {
  const redis = await cache()
  await redis.del(cursorKey(jobName, workspaceId))
}
