import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Issue } from '../../schema/models/types/Issue'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createCentroid } from './shared'

export async function createIssue(
  {
    title,
    description,
    document,
    project,
    workspace,
    createdAt,
  }: {
    title: string
    description: string
    document: DocumentVersion
    project: Project
    workspace: Workspace
    createdAt?: Date
  },
  transaction = new Transaction(),
) {
  const issueCreatedAt = createdAt ?? new Date()
  const centroid = createCentroid()

  // Note: not creating the vector in the vector db yet to avoid storing empty vectors,
  // instead we are upserting the vector when the first result is added to the issue,
  // this way we avoid making temporary issues discoverable by the system

  return await transaction.call(
    async (tx) => {
      const issue = (await tx
        .insert(issues)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: document.documentUuid,
          title: title,
          description: description,
          centroid: centroid,
          createdAt: issueCreatedAt,
          updatedAt: issueCreatedAt,
        })
        .returning()
        .then((r) => r[0]!)) as Issue

      return Result.ok({ issue })
    },
    async ({ issue }) => {
      await publisher.publishLater({
        type: 'issueCreated',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
        },
      })
    },
  )
}
