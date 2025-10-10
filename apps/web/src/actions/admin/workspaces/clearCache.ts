'use server'

import { cache } from '@latitude-data/core/cache'
import { z } from 'zod'

import { withAdmin } from '../../procedures'

export const clearWorkspaceCacheAction = withAdmin
  .inputSchema(z.object({ workspaceId: z.number() }))
  .action(async ({ parsedInput }) => {
    const { workspaceId } = parsedInput
    const cacheClient = await cache()

    // Scan for all keys matching the workspace pattern
    const pattern = `workspace:${workspaceId}:*`
    let cursor = '0'
    let deletedCount = 0

    do {
      // SCAN returns [cursor, keys]
      const [nextCursor, keys] = await cacheClient.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      )
      cursor = nextCursor

      if (keys.length > 0) {
        // Remove the key prefix before deletion since cache client adds it
        const keysWithoutPrefix = keys.map((key) =>
          key.replace(/^latitude:/, ''),
        )
        await cacheClient.del(...keysWithoutPrefix)
        deletedCount += keys.length
      }
    } while (cursor !== '0')

    return { deletedCount }
  })
