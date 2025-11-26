import { env } from '@latitude-data/env'
import { IssuesRepository } from '../../repositories'
import { EventHandler, IssueMergedEvent } from '../events'
import { getIssuesCollection } from '../../weaviate'
import { Issue } from '../../schema/models/types/Issue'

/**
 * Removes vectors for merged issues from Weaviate collection.
 * This event handler reacts to issue merges by cleaning up vector embeddings
 * for issues that have been merged into a winning issue.
 */
export const removeMergedIssueVectors: EventHandler<IssueMergedEvent> = async ({
  data: event,
}: {
  data: IssueMergedEvent
}): Promise<void> => {
  if (!env.WEAVIATE_API_KEY) return

  const { workspaceId, mergedIds } = event.data

  const repo = new IssuesRepository(workspaceId)

  // Fetch the issues to get their project info and document UUID
  const issues: Issue[] = []
  for (const id of mergedIds) {
    try {
      const result = await repo.find(id)
      if (result.ok && result.value) {
        issues.push(result.value)
      }
    } catch (_) {
      // Continue if issue not found
    }
  }

  for (const issue of issues) {
    try {
      const collection = await getIssuesCollection({
        workspaceId: issue.workspaceId,
        projectId: issue.projectId,
        documentUuid: issue.documentUuid,
      })

      const exists = await collection.data.exists(issue.uuid)
      if (!exists) continue

      await collection.data.deleteById(issue.uuid)

      const count = await collection.length()
      if (count === 0) {
        await collection.tenants.remove(String(issue.workspaceId))
      }
    } catch (_) {
      // Ignore vector cleanup failures to avoid blocking
    }
  }
}
