import { createHash } from 'crypto'

import { diskFactory } from './disk'
import { env } from '@latitude-data/env'

export async function downloadWithCache(url: URL): Promise<{
  data: Uint8Array<ArrayBufferLike>
  mediaType: string | undefined
}> {
  let disk, urlHash, cacheKey
  if (env.FILE_CACHE) disk = diskFactory('private')

  // Try to get from cache first
  if (disk) {
    urlHash = createHash('sha256').update(url.toString()).digest('hex')
    cacheKey = `${urlHash}`

    let cached
    try {
      cached = await disk.get(cacheKey)
    } catch {
      // do nothing
    }

    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        return {
          data: new Uint8Array(Buffer.from(parsed.data, 'base64')),
          mediaType: parsed.mediaType,
        }
      } catch (error) {
        // If cache is corrupted, delete it and proceed with fresh download
        await disk.delete(cacheKey)

        // TODO: Capture exception but do not throw
      }
    }
  }

  // Download fresh
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download file. Response status: ${response.status} for URL: ${url}`,
    )
  }
  const arrayBuffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type')
  const result = {
    data: new Uint8Array(arrayBuffer),
    mediaType: contentType || undefined,
  }

  // Cache the result asynchronously - don't wait for completion
  const cacheData = {
    data: Buffer.from(arrayBuffer).toString('base64'),
    mediaType: result.mediaType,
  }
  if (disk && cacheKey) {
    disk.put(cacheKey, JSON.stringify(cacheData)).catch(() => {
      // TODO: capture exception but do not throw
    })
  }

  return result
}
