import { and, eq } from 'drizzle-orm'
import { IssueCentroid } from '../../constants'
import { publisher } from '../../events/publisher'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { getIssuesCollection } from '../../weaviate'
import { embedCentroid } from './shared'
import { env } from '@latitude-data/env'

export async function updateIssue(
  {
    title,
    description,
    centroid,
    issue,
  }: {
    title?: string
    description?: string
    centroid?: IssueCentroid
    issue: Issue
  },
  transaction = new Transaction(),
) {
  const updatedAt = new Date()

  // Note: optimistically upserting in vector db
  const updating = await upsertVector({
    uuid: issue.uuid,
    workspaceId: issue.workspaceId,
    projectId: issue.projectId,
    documentUuid: issue.documentUuid,
    title: title,
    description: description,
    centroid: centroid,
  })
  if (updating.error) {
    return Result.error(updating.error)
  }

  return await transaction.call(
    async (tx) => {
      const updatedIssue = (await tx
        .update(issues)
        .set({
          title: title,
          description: description,
          centroid: centroid,
          updatedAt: updatedAt,
        })
        .where(
          and(
            eq(issues.workspaceId, issue.workspaceId),
            eq(issues.uuid, issue.uuid),
          ),
        )
        .returning()
        .then((r) => r[0]!)) as Issue

      return Result.ok({ issue: updatedIssue })
    },
    async ({ issue }) => {
      await publisher.publishLater({
        type: 'issueUpdated',
        data: {
          workspaceId: issue.workspaceId,
          issueId: issue.id,
        },
      })
    },
  )
}

async function upsertVector({
  uuid,
  workspaceId,
  projectId,
  documentUuid,
  title,
  description,
  centroid,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  uuid: string
  title?: string
  description?: string
  centroid?: IssueCentroid
}) {
  if (!env.WEAVIATE_API_KEY) return Result.nil()

  const embedding = centroid ? embedCentroid(centroid) : undefined

  try {
    const issues = await getIssuesCollection({
      workspaceId,
      projectId,
      documentUuid,
    })

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
