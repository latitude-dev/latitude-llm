import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { and, inArray, isNull } from 'drizzle-orm'
import { database } from '../../../client'
import { commits, documentVersions } from '../../../schema'
import { maintenanceQueue } from '../../queues'

export type RefreshDocumentsStatsCacheJobData = Record<string, never>

export const refreshDocumentsStatsCacheJob = async (
  _: Job<RefreshDocumentsStatsCacheJobData>,
) => {
  const projectIds = env.LIMITED_VIEW_PROJECT_IDS?.split(',').map(Number) || []
  if (!projectIds.length) {
    return { success: true, documents: 0 }
  }

  const commitIds = await database
    .select({ id: commits.id })
    .from(commits)
    .where(
      and(isNull(commits.deletedAt), inArray(commits.projectId, projectIds)),
    )
    .then((r) => r.map(({ id }) => id))
  if (!commitIds.length) {
    return { success: true, documents: 0 }
  }

  const candidates = await database
    .selectDistinct({ uuid: documentVersions.documentUuid })
    .from(documentVersions)
    .where(
      and(
        isNull(documentVersions.deletedAt),
        inArray(documentVersions.commitId, commitIds),
      ),
    )
    .then((r) => r)

  for (const document of candidates) {
    await maintenanceQueue.add(
      'refreshDocumentStatsCacheJob',
      { documentUuid: document.uuid },
      { attempts: 1 },
    )
  }

  return { success: true, documents: candidates.length }
}
