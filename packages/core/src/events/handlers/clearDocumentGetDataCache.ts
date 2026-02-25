import { cache } from '../../cache'
import { getDataCacheKey } from '../../services/documents/getDataCacheKey'
import {
  DocumentCreatedEvent,
  DocumentsDeletedEvent,
  EventHandler,
} from '../events'

export const clearDocumentGetDataCache: EventHandler<
  DocumentCreatedEvent | DocumentsDeletedEvent
> = async ({ data: event }) => {
  try {
    const cacheClient = await cache()

    if (event.type === 'documentCreated') {
      const key = getDataCacheKey({
        workspaceId: event.data.workspaceId,
        projectId: event.data.projectId,
        commitUuid: event.data.commitUuid,
        documentPath: event.data.document.path,
      })
      await cacheClient.del(key)
    } else if (event.type === 'documentsDeleted') {
      const keys = event.data.documentPaths.map((path) =>
        getDataCacheKey({
          workspaceId: event.data.workspaceId,
          projectId: event.data.projectId,
          commitUuid: event.data.commitUuid,
          documentPath: path,
        }),
      )
      if (keys.length > 0) await cacheClient.del(...keys)
    }
  } catch (_error) {
    // Ignore cache errors
  }
}
