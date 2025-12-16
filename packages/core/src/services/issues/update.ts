import { env } from '@latitude-data/env'
import { and, eq } from 'drizzle-orm'
import { IssueCentroid } from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import {
  getIssuesCollection,
  ISSUES_COLLECTION_TENANT_NAME,
} from '../../weaviate'
import { embedCentroid } from './shared'

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
    const tenantName = ISSUES_COLLECTION_TENANT_NAME(workspaceId, projectId, documentUuid) // prettier-ignore
    const issues = await getIssuesCollection({ tenantName })

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

    // Check for partial property updates (only title or only description)
    // This is not allowed - you need both title AND description to update properties
    if ((title && !description) || (!title && description)) {
      return Result.error(
        new BadRequestError(
          'Received update issue operation without vectors, title and description',
        ),
      )
    }

    const exists = await issues.data.exists(uuid)
    if (!exists) {
      // For new vectors, we require either vectors or properties
      if (!payload.vectors && !payload.properties) {
        return Result.error(
          new BadRequestError(
            'Received create issue operation without vectors or properties',
          ),
        )
      }
      await issues.data.insert(payload)
    } else {
      // For existing vectors, if there's nothing to update, skip the Weaviate update
      // but allow the database update to proceed (e.g., for updatedAt timestamp)
      if (!payload.vectors && !payload.properties) {
        return Result.nil()
      }
      await issues.data.update(payload)
    }

    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}
