import { and, eq } from 'drizzle-orm'
import { IssueCentroid } from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
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
  // TODO:: Side effect inside transaction. Move to event handler.
  const updating = await upsertVector({
    title,
    description,
    centroid,
    uuid: issue.uuid,
    workspaceId: issue.workspaceId,
    projectId: issue.projectId,
    documentUuid: issue.documentUuid,
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

    const payload: {
      id: string
      properties?: { title: string; description: string }
      vectors?: number[]
    } = { id: uuid }
    if (embedding) {
      payload.vectors = embedding
    }
    if (title && description) {
      payload.properties = { title, description }
    }
    if (!payload.vectors && !payload.properties) {
      if (!payload.vectors) {
        return Result.error(
          new BadRequestError(
            'Received update issue operation without vectors',
          ),
        )
      }
      if (!payload.properties) {
        return Result.error(
          new BadRequestError(
            'Received update issue operation without vectors, title and description',
          ),
        )
      }
    }

    const exists = await issues.data.exists(uuid)
    if (!exists) {
      await issues.data.insert(payload)
    } else {
      await issues.data.update(payload)
    }

    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
