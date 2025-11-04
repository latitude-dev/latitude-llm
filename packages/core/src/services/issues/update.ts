import { and, eq } from 'drizzle-orm'
import { IssueCentroid } from '../../constants'
import { publisher } from '../../events/publisher'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { type Workspace } from '../../schema/models/types/Workspace'
import { getIssuesCollection } from '../../weaviate'
import { embedCentroid } from './shared'

export async function updateIssue(
  {
    title,
    description,
    centroid,
    issue: { id, uuid },
    workspace,
  }: {
    title?: string
    description?: string
    centroid?: IssueCentroid
    issue: Issue
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  const updatedAt = new Date()

  // Note: optimistically upserting in vector db
  const updating = await upsertVector({
    uuid: uuid,
    title: title,
    description: description,
    centroid: centroid,
    workspace: workspace,
  })
  if (updating.error) {
    return Result.error(updating.error)
  }

  return await transaction.call(
    async (tx) => {
      const issue = (await tx
        .update(issues)
        .set({
          title: title,
          description: description,
          centroid: centroid,
          updatedAt: updatedAt,
        })
        .where(and(eq(issues.workspaceId, workspace.id), eq(issues.id, id)))
        .returning()
        .then((r) => r[0]!)) as Issue

      return Result.ok({ issue })
    },
    async ({ issue }) => {
      await publisher.publishLater({
        type: 'issueUpdated',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
        },
      })
    },
  )
}

async function upsertVector({
  uuid,
  title,
  description,
  centroid,
  workspace,
}: {
  uuid: string
  title?: string
  description?: string
  centroid?: IssueCentroid
  workspace: Workspace
}) {
  const embedding = centroid ? embedCentroid(centroid) : undefined

  try {
    const issues = await getIssuesCollection(workspace)

    const exists = await issues.data.exists(uuid)
    if (!exists) {
      if (title && description && embedding) {
        await issues.data.insert({
          id: uuid,
          properties: { title, description },
          vectors: embedding,
        })

        return Result.nil()
      }

      return Result.error(new NotFoundError('Issue not found in vector db'))
    }

    await issues.data.update({
      id: uuid,
      properties: { title, description },
      vectors: embedding,
    })

    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
