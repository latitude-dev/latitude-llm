import { env } from '@latitude-data/env'
import { IssuesRepository } from '../../repositories'
import { Issue } from '../../schema/models/types/Issue'
import {
  getIssuesCollection,
  ISSUES_COLLECTION_TENANT_NAME,
} from '../../weaviate'
import { EventHandler, IssueMergedEvent } from '../events'

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
      const tenantName = ISSUES_COLLECTION_TENANT_NAME(issue.workspaceId, issue.projectId, issue.documentUuid) // prettier-ignore
      const collection = await getIssuesCollection({ tenantName })

      const exists = await collection.data.exists(issue.uuid)
      if (!exists) {
        // Note: if this happens the vector db is out of sync
        // with the database! Fail silently in this case

        continue
      }

      await collection.data.deleteById(issue.uuid)

      const count = await collection.length()
      if (count === 0) {
        await collection.tenants.remove(tenantName)
      }
    } catch (_) {
      // Ignore vector cleanup failures to avoid blocking
    }
  }
}
