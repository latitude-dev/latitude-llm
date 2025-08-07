import { cache } from '../cache'
import type { TypedResult } from '../lib/Result'

/**
 * Buffers an operation to prevent it from being executed too frequently
 * @param key The base key to use for caching
 * @param operation The async operation to execute if not buffered
 * @param bufferTimeSeconds Time in seconds to prevent re-execution
 * @returns The result of the operation, or undefined if buffered
 */
export async function bufferOperation<T>(
  key: string,
  operation: () => Promise<TypedResult<T, Error>>,
  bufferTimeSeconds: number,
): Promise<T | undefined> {
  const redis = await cache()

  const lastExecuted = await redis.get(key)
  if (lastExecuted) return undefined

  const result = await operation()

  if (result.ok) {
    await redis.set(key, Date.now().toString(), 'EX', bufferTimeSeconds)
    return result.unwrap()
  }

  return
}
