import { LATTE_MINIMUM_CREDITS_PER_REQUEST } from '../../constants'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { latteRequests } from '../../schema/models/latteRequests'
import { latteThreads } from '../../schema/models/latteThreads'

export async function createLatteThread({
  user,
  workspace,
  project,
  requests: requestsCount,
}: {
  user: User
  workspace: Workspace
  project: Project
  requests?: number
}) {
  const thread = await database
    .insert(latteThreads)
    .values({
      userId: user.id,
      workspaceId: workspace.id,
      projectId: project.id,
    })
    .returning()
    .then((r) => r[0]!)

  const requests = []
  let credits = 0
  if (requestsCount) {
    for (let i = 0; i < requestsCount; i++) {
      const request = await createLatteRequest({
        credits:
          Math.floor(Math.random() * 3) + LATTE_MINIMUM_CREDITS_PER_REQUEST,
        threadUuid: thread.uuid,
        user: user,
        workspace: workspace,
        billable: true,
      })
      requests.push(request)
      credits += request.credits
    }
  }

  return { thread, requests, credits }
}

export async function createLatteRequest({
  credits,
  threadUuid,
  user,
  workspace,
  billable = true,
  error,
  idempotencyKey,
  createdAt,
}: {
  credits: number
  threadUuid: string
  user: User
  workspace: Workspace
  billable?: boolean
  error?: Error
  idempotencyKey?: string
  createdAt?: Date
}) {
  const request = await database
    .insert(latteRequests)
    .values({
      uuid: idempotencyKey,
      workspaceId: workspace.id,
      userId: user.id,
      threadUuid: threadUuid,
      credits: credits,
      billable: billable,
      error: error?.message,
      createdAt: createdAt,
      updatedAt: createdAt,
    })
    .returning()
    .then((r) => r[0]!)

  return request
}
